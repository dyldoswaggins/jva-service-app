-- 001 core schema: profiles/roles, parts, log, models, invoices, stock_change()
-- Field names follow CLAUDE.md §5 in snake_case (see "Database names" in CLAUDE.md).

-- ---------- People and roles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'view' check (role in ('admin','watchmaker','sales','view')),
  legacy_id text unique,               -- old claude.ai user id (u_…), links imported by/cBy values
  created_at timestamptz not null default now()
);

-- Role of the signed-in person ('view' if none)
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'view')
$$;

-- New sign-in → profile with role 'view'
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- Parts ----------
create table public.parts (
  id text primary key,                 -- 'p_' + rmc (sanitised)
  rmc text not null unique,
  name text not null default '',
  cat text not null default '',
  sub text not null default '',
  cal text not null default '',
  abc text not null default '' check (abc in ('','A','B','C')),
  qty integer check (qty is null or qty >= 0),   -- THE stock count, units. null = not counted
  c_by uuid references public.profiles(id),
  c_by_legacy text,
  c_at timestamptz,
  price numeric,                       -- cost per unit CAD
  pack_price numeric,
  pack integer,
  price_src text,
  price_prev numeric,
  price_2022 numeric,
  retail numeric,                      -- retail per unit CAD (charge customers from this)
  retail_src text,
  over integer,                        -- overstock units, included in qty
  min integer check (min is null or min >= 0),
  fits text,
  lcab text, ldrw text, ltab text,     -- Lista location
  used integer, jobs integer, last_used date,
  edge_desc text, edge_refs text, edge_note text,
  flag text not null default '',
  note text not null default '',
  src text,
  ord integer,
  archived boolean not null default false
);

-- ---------- Stock log (add-only) ----------
create table public.log (
  id text primary key default gen_random_uuid()::text,
  part_id text references public.parts(id),   -- null only for summary rows
  rmc text,
  prev integer,
  qty integer,
  change integer,
  by_user uuid references public.profiles(id),
  by_legacy text,
  at timestamptz not null default now(),
  src text,
  type text not null check (type in ('Count','Received','Used','Returned','Adjust','Auto','Import')),
  ref text
);
create index log_part_id_at on public.log (part_id, at desc);
create index log_at on public.log (at desc);

-- ---------- Watch models ----------
create table public.models (
  id text primary key,                 -- 'm_' + REF
  ref text not null,
  name text not null default '',
  cal text not null default '',        -- one or more, comma-separated
  ok boolean not null default false,
  by_user uuid references public.profiles(id),
  by_legacy text,
  at timestamptz,
  src text,
  years text,
  conf text check (conf is null or conf in ('high','medium','low'))
);

-- ---------- ROLP invoices (cost only) ----------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text,
  date date,
  supplier text,
  file text,
  add_stock boolean not null default false,
  set_cost boolean not null default true,
  by_user uuid references public.profiles(id),
  at timestamptz not null default now(),
  lines jsonb not null default '[]',
  undone boolean not null default false,
  mrws_ref text,
  edge_no text
);

-- ---------- Never hard-delete; log is add-only ----------
create or replace function public.block_change() returns trigger
language plpgsql as $$
begin
  raise exception '% on % is not allowed (archive or add a new row instead)', tg_op, tg_table_name;
end $$;
create trigger log_no_update before update or delete on public.log
  for each row execute function public.block_change();
create trigger parts_no_delete before delete on public.parts
  for each row execute function public.block_change();
create trigger models_no_delete before delete on public.models
  for each row execute function public.block_change();
create trigger invoices_no_delete before delete on public.invoices
  for each row execute function public.block_change();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.parts    enable row level security;
alter table public.log      enable row level security;
alter table public.models   enable row level security;
alter table public.invoices enable row level security;

-- Everyone signed in can read
create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "read parts"    on public.parts    for select to authenticated using (true);
create policy "read log"      on public.log      for select to authenticated using (true);
create policy "read models"   on public.models   for select to authenticated using (true);
create policy "read invoices" on public.invoices for select to authenticated using (true);

-- Admin manages roles and parts details (stock goes through stock_change only)
create policy "admin edits profiles" on public.profiles for update to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy "admin adds parts" on public.parts for insert to authenticated
  with check (public.app_role() = 'admin');
create policy "admin edits parts" on public.parts for update to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- Admin + watchmaker maintain models
create policy "staff adds models" on public.models for insert to authenticated
  with check (public.app_role() in ('admin','watchmaker'));
create policy "staff edits models" on public.models for update to authenticated
  using (public.app_role() in ('admin','watchmaker'))
  with check (public.app_role() in ('admin','watchmaker'));

-- Admin imports invoices
create policy "admin adds invoices" on public.invoices for insert to authenticated
  with check (public.app_role() = 'admin');
create policy "admin edits invoices" on public.invoices for update to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- No direct writes to log, and no anonymous access at all
revoke insert, update, delete on public.log from anon, authenticated;
revoke all on public.profiles, public.parts, public.log, public.models, public.invoices from anon;

-- ---------- The one way to change stock ----------
-- Count:   p_qty = new count            (Admin)
-- Adjust:  p_qty or p_delta             (Admin)
-- Received: p_delta > 0                 (Admin)
-- Used / Auto: p_delta < 0              (Admin, Watchmaker)
-- Returned: p_delta > 0                 (Admin, Watchmaker)
create or replace function public.stock_change(
  p_part_id text,
  p_type text,
  p_qty integer default null,
  p_delta integer default null,
  p_src text default null,
  p_ref text default null
) returns public.parts
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.app_role();
  v_part public.parts;
  v_prev integer;
  v_new integer;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;

  if p_type in ('Count','Adjust','Received') then
    if v_role <> 'admin' then raise exception 'Only Admin can do a % change', p_type; end if;
  elsif p_type in ('Used','Returned','Auto') then
    if v_role not in ('admin','watchmaker') then raise exception 'Not allowed'; end if;
  else
    raise exception 'Unknown change type: %', p_type;
  end if;

  if (p_qty is null) = (p_delta is null) then
    raise exception 'Give a new count or a change, not both';
  end if;
  if p_type = 'Count' and p_qty is null then raise exception 'Count needs a new count'; end if;
  if p_type in ('Used','Auto') and coalesce(p_delta, 0) >= 0 then
    raise exception '% needs a negative change', p_type; end if;
  if p_type in ('Received','Returned') and coalesce(p_delta, 0) <= 0 then
    raise exception '% needs a positive change', p_type; end if;

  select * into v_part from public.parts where id = p_part_id for update;
  if not found then raise exception 'Part % not found', p_part_id; end if;
  if v_part.archived then raise exception 'Part % is archived', v_part.rmc; end if;

  v_prev := v_part.qty;
  v_new := coalesce(p_qty, coalesce(v_prev, 0) + p_delta);
  if v_new < 0 then
    raise exception 'Not enough stock: % on hand', coalesce(v_prev, 0);
  end if;

  update public.parts set qty = v_new, c_by = auth.uid(), c_at = now()
    where id = p_part_id returning * into v_part;

  insert into public.log (part_id, rmc, prev, qty, change, by_user, src, type, ref)
  values (p_part_id, v_part.rmc, v_prev, v_new, v_new - coalesce(v_prev, 0),
          auth.uid(), p_src, p_type, p_ref);

  return v_part;
end $$;
revoke execute on function public.stock_change(text,text,integer,integer,text,text) from public, anon;
grant execute on function public.stock_change(text,text,integer,integer,text,text) to authenticated;

-- ---------- Live updates ----------
alter publication supabase_realtime add table public.parts, public.log, public.models, public.invoices;
