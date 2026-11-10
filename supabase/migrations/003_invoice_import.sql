-- 003: invoice import that can add stock (Dylan, 2026-11-09). Replaces the old "cost only" rule.
-- apply_invoice(): one transaction — invoice record + new parts + cost updates + stock received + log.
-- undo_invoice(): takes the units back off (never below 0) and restores costs the invoice set.
-- Invoices dated on or before the 11.5 stock confirmation (2026-11-05) never add stock.

alter table public.parts add column if not exists price_date date;      -- invoice date of current cost (latest wins)
alter table public.invoices add column if not exists undone_by uuid references public.profiles(id);
alter table public.invoices add column if not exists undone_at timestamptz;
create unique index if not exists invoices_no_active on public.invoices (invoice_no) where not undone;

create or replace function public.apply_invoice(p_invoice jsonb, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_no text := nullif(trim(p_invoice->>'invoice_no'), '');
  v_date date := (p_invoice->>'date')::date;
  v_can_stock boolean;
  v_src text;
  l jsonb;
  v_part public.parts;
  v_units integer;
  v_cost numeric;
  v_out jsonb := '[]';
  v_stocked boolean;
  v_costed boolean;
  v_prev_price numeric;
begin
  if public.app_role() <> 'admin' then raise exception 'Only Admin can import invoices'; end if;
  if v_no is null then raise exception 'The invoice number is missing'; end if;
  if v_date is null then raise exception 'The invoice date is missing'; end if;
  if exists (select 1 from public.invoices where invoice_no = v_no and not undone) then
    raise exception 'Invoice % was already imported', v_no;
  end if;
  v_can_stock := v_date > date '2026-11-05';
  v_src := 'Invoice ' || v_no;

  insert into public.invoices (invoice_no, date, supplier, file, add_stock, set_cost, by_user, mrws_ref)
  values (v_no, v_date, coalesce(p_invoice->>'supplier', 'Rolex Canada'), p_invoice->>'file',
          v_can_stock and coalesce((p_invoice->>'add_stock')::boolean, true),
          coalesce((p_invoice->>'set_cost')::boolean, true), auth.uid(), null)
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_stocked := false; v_costed := false; v_prev_price := null;
    v_units := greatest(0, coalesce((l->>'units')::int, 0));
    v_cost := (l->>'unit_cost')::numeric;

    -- New part (not in the list yet): add it, flagged for checking
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

    -- Cost: latest invoice date wins
    if coalesce((l->>'set_cost')::boolean, true) and v_cost is not null and v_cost > 0
       and (v_part.price_date is null or v_date >= v_part.price_date) then
      v_prev_price := v_part.price;
      update public.parts set price_prev = price, price = v_cost,
        pack = coalesce((l->>'pack')::int, pack), pack_price = coalesce((l->>'pack_price')::numeric, pack_price),
        price_src = v_src || ' (' || to_char(v_date, 'YYYY-MM-DD') || ')', price_date = v_date
      where id = v_part.id;
      v_costed := true;
    end if;

    -- Stock received
    if v_can_stock and coalesce((l->>'add_stock')::boolean, true) and v_units > 0 then
      update public.parts set qty = coalesce(qty, 0) + v_units, c_by = auth.uid(), c_at = now() where id = v_part.id;
      insert into public.log (part_id, rmc, prev, qty, change, by_user, src, type, ref)
      values (v_part.id, v_part.rmc, v_part.qty, coalesce(v_part.qty, 0) + v_units, v_units, auth.uid(), v_src, 'Received', v_id::text);
      v_stocked := true;
    end if;

    v_out := v_out || jsonb_build_object(
      'ref', l->>'ref', 'rmc', l->>'rmc', 'part_id', l->>'part_id', 'qty', (l->>'qty')::numeric,
      'pack', (l->>'pack')::int, 'units', v_units, 'unit_cost', v_cost, 'mrws_ref', nullif(l->>'mrws_ref', ''),
      'added', l ? 'new_part', 'stocked', v_stocked, 'costed', v_costed, 'prev_price', v_prev_price);
  end loop;

  update public.invoices set lines = v_out where id = v_id;
  return v_id;
end $$;

create or replace function public.undo_invoice(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invoices;
  l jsonb;
  v_part public.parts;
  v_take integer;
  v_short jsonb := '[]';
  v_n integer := 0;
  v_src text;
begin
  if public.app_role() <> 'admin' then raise exception 'Only Admin can undo an invoice'; end if;
  select * into v_inv from public.invoices where id = p_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_inv.undone then raise exception 'Invoice % was already undone', v_inv.invoice_no; end if;
  v_src := 'Invoice ' || v_inv.invoice_no;

  for l in select * from jsonb_array_elements(v_inv.lines) loop
    select * into v_part from public.parts where id = l->>'part_id' for update;
    if not found then continue; end if;
    if (l->>'stocked')::boolean then
      v_take := least((l->>'units')::int, coalesce(v_part.qty, 0));
      if v_take > 0 then
        update public.parts set qty = qty - v_take, c_by = auth.uid(), c_at = now() where id = v_part.id;
        insert into public.log (part_id, rmc, prev, qty, change, by_user, src, type, ref)
        values (v_part.id, v_part.rmc, v_part.qty, v_part.qty - v_take, -v_take, auth.uid(), 'Undo ' || v_src, 'Adjust', p_id::text);
        v_n := v_n + 1;
      end if;
      if v_take < (l->>'units')::int then
        v_short := v_short || jsonb_build_object('rmc', v_part.rmc, 'missing', (l->>'units')::int - v_take);
      end if;
    end if;
    -- Restore cost only if this invoice is still the source
    if (l->>'costed')::boolean and v_part.price_src like v_src || ' (%' then
      update public.parts set price = (l->>'prev_price')::numeric, price_prev = null,
        price_src = 'Restored (undo ' || v_src || ')', price_date = null
      where id = v_part.id;
    end if;
  end loop;

  update public.invoices set undone = true, undone_by = auth.uid(), undone_at = now() where id = p_id;
  return jsonb_build_object('parts', v_n, 'short', v_short);
end $$;

revoke execute on function public.apply_invoice(jsonb, jsonb) from public, anon;
revoke execute on function public.undo_invoice(uuid) from public, anon;
grant execute on function public.apply_invoice(jsonb, jsonb) to authenticated;
grant execute on function public.undo_invoice(uuid) to authenticated;
