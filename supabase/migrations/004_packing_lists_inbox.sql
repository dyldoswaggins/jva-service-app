-- 004: packing lists + inbox (Dylan, 2026-11-09)
-- * A delivery document is an invoice OR a packing list (doc_type). Packing lists have no costs.
-- * Whichever document arrives first adds the stock; the later one is matched line by line on
--   MRWS # + part and adds no stock (an invoice still updates cost). Differences are shown before Apply.
-- * Undo of the first document hands its stock over to the matched later one instead of removing it.
-- * Inbox: documents arrive by email (or upload), are read automatically, and wait for Admin to Apply.

-- ---------- documents ----------
alter table public.invoices add column if not exists doc_type text not null default 'invoice'
  check (doc_type in ('invoice', 'packing_list'));
drop index if exists public.invoices_no_active;
create unique index if not exists invoices_doc_no_active on public.invoices (doc_type, invoice_no) where not undone;

-- One row per applied document line, for matching packing lists <-> invoices
create table if not exists public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.invoices(id),
  doc_type text not null,
  line_no integer not null,
  mrws_ref text,
  part_id text references public.parts(id),
  rmc text,
  units integer not null default 0,
  stocked boolean not null default false,
  matched_line uuid references public.receipt_lines(id),
  undone boolean not null default false
);
create index if not exists receipt_lines_match on public.receipt_lines (part_id, mrws_ref) where not undone and matched_line is null;
alter table public.receipt_lines enable row level security;
create policy "read receipt lines" on public.receipt_lines for select to authenticated using (true);
revoke insert, update, delete on public.receipt_lines from anon, authenticated;
revoke all on public.receipt_lines from anon;
create trigger receipt_lines_no_delete before delete on public.receipt_lines
  for each row execute function public.block_change();

-- ---------- preview: what each line would match ----------
-- p_lines: [{part_id, mrws_ref, units}] ; returns {lines:[{i, doc_type, doc_no, units, stocked}|null], missing:[...]}
create or replace function public.receipt_matches(p_doc_type text, p_lines jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l jsonb; i integer := 0; m record; v_used uuid[] := '{}'; v_out jsonb := '[]'; v_refs text[] := '{}';
  v_missing jsonb;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    select r.id, r.units, r.stocked, d.doc_type, d.invoice_no into m
    from public.receipt_lines r join public.invoices d on d.id = r.doc_id
    where r.doc_type <> p_doc_type and not r.undone and r.matched_line is null
      and r.part_id = l->>'part_id' and coalesce(r.mrws_ref, '') = coalesce(l->>'mrws_ref', '')
      and not (r.id = any(v_used))
    order by d.at limit 1;
    if found then
      v_used := v_used || m.id;
      v_out := v_out || jsonb_build_object('i', i, 'doc_type', m.doc_type, 'doc_no', m.invoice_no, 'units', m.units, 'stocked', m.stocked);
    else
      v_out := v_out || 'null'::jsonb;
    end if;
    if coalesce(l->>'mrws_ref', '') <> '' then v_refs := v_refs || (l->>'mrws_ref'); end if;
    i := i + 1;
  end loop;
  -- Lines on the other document (same MRWS #s) that this one doesn't have
  select coalesce(jsonb_agg(jsonb_build_object('doc_type', d.doc_type, 'doc_no', d.invoice_no, 'rmc', r.rmc, 'mrws_ref', r.mrws_ref, 'units', r.units)), '[]')
  into v_missing
  from public.receipt_lines r join public.invoices d on d.id = r.doc_id
  where r.doc_type <> p_doc_type and not r.undone and r.matched_line is null
    and r.mrws_ref = any(v_refs) and not (r.id = any(v_used));
  return jsonb_build_object('lines', v_out, 'missing', v_missing);
end $$;

-- ---------- apply (replaces 003 version) ----------
drop function if exists public.apply_invoice(jsonb, jsonb);
create or replace function public.apply_invoice(p_invoice jsonb, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_type text := coalesce(nullif(p_invoice->>'doc_type', ''), 'invoice');
  v_no text := nullif(trim(p_invoice->>'invoice_no'), '');
  v_date date := (p_invoice->>'date')::date;
  v_can_stock boolean;
  v_src text;
  l jsonb;
  i integer := 0;
  v_part public.parts;
  v_units integer;
  v_cost numeric;
  v_out jsonb := '[]';
  v_stocked boolean;
  v_costed boolean;
  v_prev_price numeric;
  v_match record;
  v_line uuid;
begin
  if public.app_role() <> 'admin' then raise exception 'Only Admin can import delivery documents'; end if;
  if v_type not in ('invoice', 'packing_list') then raise exception 'Unknown document type %', v_type; end if;
  if v_no is null then raise exception 'The document number is missing'; end if;
  if v_date is null then raise exception 'The document date is missing'; end if;
  if exists (select 1 from public.invoices where doc_type = v_type and invoice_no = v_no and not undone) then
    raise exception '% % was already imported', case v_type when 'invoice' then 'Invoice' else 'Packing list' end, v_no;
  end if;
  v_can_stock := v_date > date '2026-11-05';
  v_src := case v_type when 'invoice' then 'Invoice ' else 'Packing list ' end || v_no;

  insert into public.invoices (doc_type, invoice_no, date, supplier, file, add_stock, set_cost, by_user)
  values (v_type, v_no, v_date, coalesce(p_invoice->>'supplier', 'Rolex Canada'), p_invoice->>'file',
          v_can_stock and coalesce((p_invoice->>'add_stock')::boolean, true),
          v_type = 'invoice' and coalesce((p_invoice->>'set_cost')::boolean, true), auth.uid())
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_stocked := false; v_costed := false; v_prev_price := null;
    v_units := greatest(0, coalesce((l->>'units')::int, 0));
    v_cost := case when v_type = 'invoice' then (l->>'unit_cost')::numeric end;

    if not exists (select 1 from public.parts where id = l->>'part_id') then
      if l ? 'new_part' then
        insert into public.parts (id, rmc, name, cat, sub, cal, abc, edge_refs, src, flag)
        values (l->>'part_id', l->>'rmc', coalesce(l->'new_part'->>'name', l->>'rmc'), coalesce(l->'new_part'->>'cat', ''),
                coalesce(l->'new_part'->>'sub', ''), coalesce(l->'new_part'->>'cal', ''), coalesce(l->'new_part'->>'abc', 'B'),
                l->>'ref', v_src, 'Added from ' || v_src || ': check category and class');
      else
        raise exception 'Part % is not in the list', l->>'rmc';
      end if;
    end if;
    select * into v_part from public.parts where id = l->>'part_id' for update;

    -- Matching line on the other document type (same part + MRWS #), oldest first
    select r.* into v_match from public.receipt_lines r join public.invoices d on d.id = r.doc_id
    where r.doc_type <> v_type and not r.undone and r.matched_line is null
      and r.part_id = v_part.id and coalesce(r.mrws_ref, '') = coalesce(nullif(l->>'mrws_ref', ''), '')
    order by d.at limit 1 for update of r;

    -- Cost (invoices only): latest invoice date wins
    if coalesce((l->>'set_cost')::boolean, true) and v_cost is not null and v_cost > 0
       and (v_part.price_date is null or v_date >= v_part.price_date) then
      v_prev_price := v_part.price;
      update public.parts set price_prev = price, price = v_cost,
        pack = coalesce((l->>'pack')::int, pack), pack_price = coalesce((l->>'pack_price')::numeric, pack_price),
        price_src = v_src || ' (' || to_char(v_date, 'YYYY-MM-DD') || ')', price_date = v_date
      where id = v_part.id;
      v_costed := true;
    end if;

    -- Stock: only if no earlier matching document already added it
    if v_can_stock and coalesce((l->>'add_stock')::boolean, true) and v_units > 0
       and not (v_match.id is not null and v_match.stocked) then
      update public.parts set qty = coalesce(qty, 0) + v_units, c_by = auth.uid(), c_at = now() where id = v_part.id;
      insert into public.log (part_id, rmc, prev, qty, change, by_user, src, type, ref)
      values (v_part.id, v_part.rmc, v_part.qty, coalesce(v_part.qty, 0) + v_units, v_units, auth.uid(), v_src, 'Received', v_id::text);
      v_stocked := true;
    end if;

    insert into public.receipt_lines (doc_id, doc_type, line_no, mrws_ref, part_id, rmc, units, stocked, matched_line)
    values (v_id, v_type, i, nullif(l->>'mrws_ref', ''), v_part.id, v_part.rmc, v_units, v_stocked, v_match.id)
    returning id into v_line;
    if v_match.id is not null then update public.receipt_lines set matched_line = v_line where id = v_match.id; end if;

    v_out := v_out || jsonb_build_object(
      'ref', l->>'ref', 'rmc', l->>'rmc', 'part_id', l->>'part_id', 'qty', (l->>'qty')::numeric,
      'pack', (l->>'pack')::int, 'units', v_units, 'unit_cost', v_cost, 'mrws_ref', nullif(l->>'mrws_ref', ''),
      'added', l ? 'new_part', 'stocked', v_stocked, 'costed', v_costed, 'prev_price', v_prev_price,
      'line_id', v_line, 'matched_units', v_match.units);
    i := i + 1;
  end loop;

  update public.invoices set lines = v_out where id = v_id;
  return v_id;
end $$;

-- ---------- undo (replaces 003 version) ----------
drop function if exists public.undo_invoice(uuid);
create or replace function public.undo_invoice(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invoices;
  r public.receipt_lines;
  l jsonb;
  v_part public.parts;
  v_take integer;
  v_short jsonb := '[]';
  v_n integer := 0;
  v_handed integer := 0;
  v_src text;
begin
  if public.app_role() <> 'admin' then raise exception 'Only Admin can undo a delivery document'; end if;
  select * into v_inv from public.invoices where id = p_id for update;
  if not found then raise exception 'Document not found'; end if;
  if v_inv.undone then raise exception '% was already undone', v_inv.invoice_no; end if;
  v_src := case v_inv.doc_type when 'invoice' then 'Invoice ' else 'Packing list ' end || v_inv.invoice_no;

  for r in select * from public.receipt_lines where doc_id = p_id and not undone for update loop
    select * into v_part from public.parts where id = r.part_id for update;
    if r.stocked then
      if r.matched_line is not null then
        -- Hand the stock over to the matching document instead of removing it
        update public.receipt_lines set stocked = true, matched_line = null where id = r.matched_line;
        v_handed := v_handed + 1;
      else
        v_take := least(r.units, coalesce(v_part.qty, 0));
        if v_take > 0 then
          update public.parts set qty = qty - v_take, c_by = auth.uid(), c_at = now() where id = v_part.id;
          insert into public.log (part_id, rmc, prev, qty, change, by_user, src, type, ref)
          values (v_part.id, v_part.rmc, v_part.qty, v_part.qty - v_take, -v_take, auth.uid(), 'Undo ' || v_src, 'Adjust', p_id::text);
          v_n := v_n + 1;
        end if;
        if v_take < r.units then
          v_short := v_short || jsonb_build_object('rmc', v_part.rmc, 'missing', r.units - v_take);
        end if;
      end if;
    elsif r.matched_line is not null then
      update public.receipt_lines set matched_line = null where id = r.matched_line;
    end if;
    update public.receipt_lines set undone = true where id = r.id;
  end loop;

  -- Restore costs this document set, if it is still the source
  for l in select * from jsonb_array_elements(v_inv.lines) loop
    if (l->>'costed')::boolean then
      update public.parts set price = (l->>'prev_price')::numeric, price_prev = null,
        price_src = 'Restored (undo ' || v_src || ')', price_date = null
      where id = l->>'part_id' and price_src like v_src || ' (%';
    end if;
  end loop;

  update public.invoices set undone = true, undone_by = auth.uid(), undone_at = now() where id = p_id;
  return jsonb_build_object('parts', v_n, 'handed_over', v_handed, 'short', v_short);
end $$;

revoke execute on function public.apply_invoice(jsonb, jsonb) from public, anon;
revoke execute on function public.undo_invoice(uuid) from public, anon;
revoke execute on function public.receipt_matches(text, jsonb) from public, anon;
grant execute on function public.apply_invoice(jsonb, jsonb) to authenticated;
grant execute on function public.undo_invoice(uuid) to authenticated;
grant execute on function public.receipt_matches(text, jsonb) to authenticated;

-- ---------- inbox ----------
create table if not exists public.inbox (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text not null default 'upload' check (source in ('email', 'upload')),
  sender text,
  subject text,
  file_path text not null,             -- in storage bucket 'inbox'
  file_name text not null,
  mime text,
  status text not null default 'new' check (status in ('new', 'reading', 'ready', 'error', 'applied', 'dismissed')),
  read_by text check (read_by in ('layout', 'claude')),
  doc_type text check (doc_type in ('invoice', 'packing_list')),
  doc_no text,
  doc_date date,
  parsed jsonb,
  error text,
  applied_doc uuid references public.invoices(id),
  by_user uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index if not exists inbox_received on public.inbox (received_at desc);
alter table public.inbox enable row level security;
create policy "admin reads inbox" on public.inbox for select to authenticated using (public.app_role() = 'admin');
create policy "admin adds to inbox" on public.inbox for insert to authenticated with check (public.app_role() = 'admin');
create policy "admin updates inbox" on public.inbox for update to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
revoke all on public.inbox from anon;
create trigger inbox_no_delete before delete on public.inbox for each row execute function public.block_change();
alter publication supabase_realtime add table public.inbox;

-- Private file storage for inbox documents (Admin only)
insert into storage.buckets (id, name, public, file_size_limit)
values ('inbox', 'inbox', false, 26214400)
on conflict (id) do nothing;
create policy "admin reads inbox files" on storage.objects for select to authenticated
  using (bucket_id = 'inbox' and public.app_role() = 'admin');
create policy "admin uploads inbox files" on storage.objects for insert to authenticated
  with check (bucket_id = 'inbox' and public.app_role() = 'admin');
