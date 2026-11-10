-- 014: Estimate, Confirmation, Invoice (Rolex SAV documents 2, 3, 5) — Dylan, 2026-11-09
-- * Client name/address are required on every Rolex document → job_clients, readable by Admin only
--   (and by the Sales associate who took the watch in). Watchmakers never see them.
-- * Extra service lines + notes for the estimate, client decision per line, declined parts back to stock.

create table public.job_clients (
  job_id uuid primary key references public.jobs(id),
  name text not null,
  address1 text, address2 text, address3 text,
  by_user uuid references public.profiles(id),
  at timestamptz not null default now()
);
alter table public.job_clients enable row level security;
create policy "office reads clients" on public.job_clients for select to authenticated
  using (public.app_role() = 'admin' or (public.app_role() = 'sales' and by_user = auth.uid()));
create policy "admin edits clients" on public.job_clients for update to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy "admin adds clients" on public.job_clients for insert to authenticated with check (public.app_role() = 'admin');
revoke all on public.job_clients from anon;
create trigger job_clients_no_delete before delete on public.job_clients for each row execute function public.block_change();

alter table public.jobs add column if not exists extra_lines jsonb not null default '[]';  -- [{id,label,price,kind:necessary|optional,details,decision}]
alter table public.jobs add column if not exists estimate_notes text;
alter table public.jobs add column if not exists estimate_decision text check (estimate_decision in ('accepted', 'refused'));
alter table public.jobs add column if not exists decision_at timestamptz;
alter table public.jobs add column if not exists decision_by uuid references public.profiles(id);
alter table public.job_parts add column if not exists decision text check (decision in ('accepted', 'declined'));

-- Intake now also files the client details (create_job with 4 arguments)
drop function if exists public.create_job(jsonb, jsonb, jsonb);
create or replace function public.create_job(p_job jsonb, p_conditions jsonb, p_requests jsonb, p_client jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; c jsonb; r jsonb;
begin
  if public.app_role() not in ('admin', 'sales') then raise exception 'Only Sales or Admin can take in a watch'; end if;
  if exists (select 1 from public.jobs where edge_no = trim(p_job->>'edge_no')) then
    raise exception 'Job % already exists', trim(p_job->>'edge_no');
  end if;
  insert into public.jobs (edge_no, rolex_service_no, mrws_ref, service_type, watch_ref, watch_name, serial, calibre,
                           dial, dial_ref, bracelet, bracelet_ref, intake_by, ctr_tier, ctr_price, polish, polish_family, polish_price, eta_quoted)
  values (trim(p_job->>'edge_no'), nullif(trim(p_job->>'rolex_service_no'), ''), nullif(trim(p_job->>'mrws_ref'), ''),
          coalesce(nullif(p_job->>'service_type', ''), 'CTR'), nullif(upper(trim(p_job->>'watch_ref')), ''),
          nullif(trim(p_job->>'watch_name'), ''), nullif(trim(p_job->>'serial'), ''), nullif(trim(p_job->>'calibre'), ''),
          nullif(trim(p_job->>'dial'), ''), nullif(trim(p_job->>'dial_ref'), ''),
          nullif(trim(p_job->>'bracelet'), ''), nullif(trim(p_job->>'bracelet_ref'), ''), auth.uid(),
          nullif(p_job->>'ctr_tier', ''), (p_job->>'ctr_price')::numeric, coalesce((p_job->>'polish')::boolean, false),
          nullif(p_job->>'polish_family', ''), (p_job->>'polish_price')::numeric, (p_job->>'eta_quoted')::date)
  returning id into v_id;
  for c in select * from jsonb_array_elements(coalesce(p_conditions, '[]')) loop
    insert into public.job_conditions (job_id, component, term, note, source, state, by_user)
    values (v_id, c->>'component', c->>'term', nullif(c->>'note', ''), 'intake', 'to_confirm', auth.uid());
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_requests, '[]')) loop
    insert into public.job_requests (job_id, request, note, by_user)
    values (v_id, r->>'request', nullif(r->>'note', ''), auth.uid());
  end loop;
  if p_client is not null and nullif(trim(p_client->>'name'), '') is not null then
    insert into public.job_clients (job_id, name, address1, address2, address3, by_user)
    values (v_id, trim(p_client->>'name'), nullif(trim(p_client->>'address1'), ''), nullif(trim(p_client->>'address2'), ''),
            nullif(trim(p_client->>'address3'), ''), auth.uid());
  end if;
  return v_id;
end $$;
revoke execute on function public.create_job(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_job(jsonb, jsonb, jsonb, jsonb) to authenticated;

-- Price of a part line on the estimate (retail per unit, MSRP CAD tax excl.)
create or replace function public.set_job_part_price(p_line uuid, p_retail numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() not in ('admin', 'watchmaker') then raise exception 'Not allowed'; end if;
  if p_retail is not null and p_retail < 0 then raise exception 'Price cannot be negative'; end if;
  update public.job_parts set retail = p_retail where id = p_line;
end $$;

-- Client's decision on the estimate, in one step. Declined part lines go back to stock (removed, decision kept).
-- p_extra: the job's extra_lines with each line's decision set.
create or replace function public.record_decision(p_job uuid, p_refused boolean, p_accepted uuid[], p_declined uuid[], p_extra jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  if public.app_role() <> 'admin' then raise exception 'Only Admin records the client''s decision'; end if;
  update public.job_parts set decision = 'accepted' where job_id = p_job and id = any(coalesce(p_accepted, '{}'));
  for l in select id from public.job_parts where job_id = p_job and id = any(coalesce(p_declined, '{}')) and state = 'active' loop
    perform public.remove_job_part(l);
    update public.job_parts set decision = 'declined' where id = l;
  end loop;
  update public.jobs set estimate_decision = case when p_refused then 'refused' else 'accepted' end,
    decision_at = now(), decision_by = auth.uid(), extra_lines = coalesce(p_extra, extra_lines)
  where id = p_job;
end $$;

revoke execute on function public.set_job_part_price(uuid, numeric) from public, anon;
revoke execute on function public.record_decision(uuid, boolean, uuid[], uuid[], jsonb) from public, anon;
grant execute on function public.set_job_part_price(uuid, numeric) to authenticated;
grant execute on function public.record_decision(uuid, boolean, uuid[], uuid[], jsonb) to authenticated;
