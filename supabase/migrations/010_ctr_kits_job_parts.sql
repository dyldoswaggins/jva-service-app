-- 010: Repairs part 2 — CTR kits from Jared's calibre lists, parts on jobs, stock taken when a job leaves Estimate.
-- Kit (auto on every CTR): Always Change + Always Order + screws with a per-job quantity, filtered by
-- "Only for …" calibre notes. Everything else is offered in the + Add dropdown.

create table public.ctr_kit_items (
  id uuid primary key default gen_random_uuid(),
  family text not null,                    -- 21xx, 22xx, 31xx, 32xx, 41xx
  rmc text not null,
  part_id text references public.parts(id),
  status text not null check (status in ('always_change', 'always_order', 'often_changed', 'upgrade', 'keep_stock')),
  qty integer not null default 1 check (qty > 0),   -- per job (Jared's quantity)
  retail numeric,
  note text,
  only_for text[] not null default '{}',   -- exact calibres, empty = whole family
  auto boolean not null default false,     -- consumed automatically on every CTR
  stock_amounts text, open_box text,
  src text, imported_at timestamptz not null default now(),
  unique (family, rmc)
);
alter table public.ctr_kit_items enable row level security;
create policy "read kits" on public.ctr_kit_items for select to authenticated using (true);
create policy "admin edits kits" on public.ctr_kit_items for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
revoke all on public.ctr_kit_items from anon;

create table public.job_parts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  part_id text not null references public.parts(id),
  rmc text not null,
  qty integer not null check (qty > 0),                         -- units
  kind text not null check (kind in ('ctr_kit', 'in_ctr', 'upgrade', 'billable')),
  source text not null check (source in ('kit', 'dropdown', 'search')),
  component text, condition_term text,                          -- billable only (printed on documents)
  required text check (required in ('required', 'optional')),
  retail numeric,                                               -- per unit, snapshot when added
  consumed_qty integer not null default 0,                      -- units taken off stock
  short_qty integer not null default 0,                         -- units not in stock when taken
  state text not null default 'active' check (state in ('active', 'removed')),
  by_user uuid references public.profiles(id), at timestamptz not null default now(),
  removed_by uuid references public.profiles(id), removed_at timestamptz
);
create index job_parts_job on public.job_parts (job_id);
alter table public.job_parts enable row level security;
create policy "read job parts" on public.job_parts for select to authenticated using (true);
revoke insert, update, delete on public.job_parts from anon, authenticated;   -- only through the functions below
revoke all on public.job_parts from anon;
create trigger job_parts_no_delete before delete on public.job_parts for each row execute function public.block_change();

alter table public.jobs add column if not exists stock_taken_at timestamptz;
alter table public.parts add column if not exists reorder_req boolean not null default false;  -- "Always Order" prompt ticked
alter publication supabase_realtime add table public.job_parts;

-- ---------- helpers ----------
create or replace function public.calibre_family(cal text) returns text
language sql immutable as $$ select case when cal ~ '^\d{4}' then left(cal, 2) || 'xx' end $$;

-- Take one line off stock (never below 0), log it, learn the watch ref on the part
create or replace function public._consume_line(p_line uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare l public.job_parts; j public.jobs; p public.parts; want integer; take integer; ref text; mid text;
begin
  select * into l from public.job_parts where id = p_line for update;
  if l.state <> 'active' or l.consumed_qty >= l.qty then return 0; end if;
  select * into j from public.jobs where id = l.job_id;
  select * into p from public.parts where id = l.part_id for update;
  want := l.qty - l.consumed_qty;
  take := least(want, coalesce(p.qty, 0));
  if take > 0 then
    update public.parts set qty = qty - take, c_by = auth.uid(), c_at = now() where id = p.id;
    insert into public.log (part_id, rmc, prev, qty, change, by_user, src, type, ref)
    values (p.id, p.rmc, p.qty, p.qty - take, -take, auth.uid(), 'Job #' || j.edge_no,
            case when l.kind = 'ctr_kit' then 'Auto' else 'Used' end, j.id::text);
  end if;
  update public.job_parts set consumed_qty = consumed_qty + take, short_qty = want - take where id = l.id;
  -- Learning: the part fits this watch ref; make sure the model exists
  ref := upper(nullif(trim(j.watch_ref), ''));
  if ref is not null then
    update public.parts set fits = concat_ws(', ', nullif(fits, ''), ref)
      where id = p.id and coalesce(fits, '') not ilike '%' || ref || '%';
    mid := 'm_' || regexp_replace(ref, '[^A-Z0-9]', '', 'g');
    insert into public.models (id, ref, name, cal, ok, by_user, at, src)
    values (mid, ref, coalesce(j.watch_name, ''), coalesce(j.calibre, ''), false, auth.uid(), now(), 'Used on job ' || j.edge_no)
    on conflict (id) do nothing;
  end if;
  return take;
end $$;

-- ---------- CTR kit for a job ----------
create or replace function public.build_ctr_kit(p_job uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare j public.jobs; n integer := 0; k record;
begin
  if public.app_role() not in ('admin', 'watchmaker') then raise exception 'Only a watchmaker can load the CTR kit'; end if;
  select * into j from public.jobs where id = p_job for update;
  if j.service_type <> 'CTR' then raise exception 'This job is not a CTR'; end if;
  if public.calibre_family(j.calibre) is null then raise exception 'Enter the calibre first'; end if;
  for k in
    select * from public.ctr_kit_items
    where family = public.calibre_family(j.calibre) and auto and part_id is not null
      and (cardinality(only_for) = 0 or j.calibre = any(only_for))
      and not exists (select 1 from public.job_parts x where x.job_id = j.id and x.part_id = ctr_kit_items.part_id and x.kind = 'ctr_kit' and x.state = 'active')
  loop
    insert into public.job_parts (job_id, part_id, rmc, qty, kind, source, retail, by_user)
    values (j.id, k.part_id, k.rmc, k.qty, 'ctr_kit', 'kit', k.retail, auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- add a part (dropdown / search) ----------
create or replace function public.add_job_part(p_job uuid, p_part text, p_qty integer, p_kind text, p_source text,
  p_component text default null, p_condition text default null, p_required text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare j public.jobs; p public.parts; v uuid;
begin
  if public.app_role() not in ('admin', 'watchmaker') then raise exception 'Only a watchmaker can add parts to a job'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
  if p_kind = 'billable' and (p_component is null or p_condition is null or p_required is null) then
    raise exception 'Billable parts need a component, a condition and Required / Optional';
  end if;
  select * into j from public.jobs where id = p_job;
  select * into p from public.parts where id = p_part;
  if not found then raise exception 'Part not found'; end if;
  insert into public.job_parts (job_id, part_id, rmc, qty, kind, source, component, condition_term, required, retail, by_user)
  values (p_job, p.id, p.rmc, p_qty, p_kind, p_source, p_component, p_condition, p_required, p.retail, auth.uid())
  returning id into v;
  if j.stock_taken_at is not null then perform public._consume_line(v); end if;   -- after Estimate: comes off now
  return v;
end $$;

-- ---------- remove a part (returns units already taken) ----------
create or replace function public.remove_job_part(p_line uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare l public.job_parts; j public.jobs; p public.parts;
begin
  if public.app_role() not in ('admin', 'watchmaker') then raise exception 'Only a watchmaker can remove parts'; end if;
  select * into l from public.job_parts where id = p_line for update;
  if l.state <> 'active' then return 0; end if;
  if l.consumed_qty > 0 then
    select * into j from public.jobs where id = l.job_id;
    select * into p from public.parts where id = l.part_id for update;
    update public.parts set qty = coalesce(qty, 0) + l.consumed_qty, c_by = auth.uid(), c_at = now() where id = p.id;
    insert into public.log (part_id, rmc, prev, qty, change, by_user, src, type, ref)
    values (p.id, p.rmc, p.qty, coalesce(p.qty, 0) + l.consumed_qty, l.consumed_qty, auth.uid(), 'Job #' || j.edge_no || ' (returned)', 'Returned', j.id::text);
  end if;
  update public.job_parts set state = 'removed', removed_by = auth.uid(), removed_at = now() where id = l.id;
  return l.consumed_qty;
end $$;

-- ---------- stock comes off when the job leaves Estimate ----------
create or replace function public.take_job_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  if old.status = 'Estimate' and new.status not in ('Estimate', 'Cancelled') and new.stock_taken_at is null then
    for l in select id from public.job_parts where job_id = new.id and state = 'active' and consumed_qty < qty loop
      perform public._consume_line(l);
    end loop;
    update public.jobs set stock_taken_at = now() where id = new.id;
  end if;
  return null;
end $$;
create trigger jobs_take_stock after update of status on public.jobs
  for each row execute function public.take_job_stock();

-- Always Order prompt: tick → part shows on the Reorder list
create or replace function public.request_reorder(p_part text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() not in ('admin', 'watchmaker') then raise exception 'Not allowed'; end if;
  update public.parts set reorder_req = p_on where id = p_part;
end $$;

revoke execute on function public._consume_line(uuid) from public, anon, authenticated;
revoke execute on function public.take_job_stock() from public, anon, authenticated;
revoke execute on function public.build_ctr_kit(uuid) from public, anon;
revoke execute on function public.add_job_part(uuid, text, integer, text, text, text, text, text) from public, anon;
revoke execute on function public.remove_job_part(uuid) from public, anon;
revoke execute on function public.request_reorder(text, boolean) from public, anon;
grant execute on function public.build_ctr_kit(uuid) to authenticated;
grant execute on function public.add_job_part(uuid, text, integer, text, text, text, text, text) to authenticated;
grant execute on function public.remove_job_part(uuid) to authenticated;
grant execute on function public.request_reorder(text, boolean) to authenticated;
