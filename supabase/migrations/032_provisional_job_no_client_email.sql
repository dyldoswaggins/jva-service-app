-- 032 (Dylan, 2026-11-12): Sales doesn't enter the boutique numbers at the counter. The Service Manager adds the Edge job #, WSC #,
-- MRWS # and bracelet reference during watch validation. Until then a job gets a provisional number P<yymmdd>-<nn> (Calgary date).
-- The client can give an email at intake (job_clients.email) to receive their copy. Build checklist state for the admin Checklist tab.
alter table public.jobs drop constraint if exists jobs_edge_no_check;
alter table public.jobs add constraint jobs_edge_no_check check (edge_no ~ '^(\d{4,7}-\d{3}|P\d{6}-\d{2,3})$');

create or replace function public.next_provisional_no() returns text
language plpgsql security definer set search_path = public as $$
declare d text := to_char(now() at time zone 'America/Edmonton', 'YYMMDD'); n int;
begin
  perform pg_advisory_xact_lock(hashtext('provisional_no'));
  select coalesce(max(substring(edge_no from '-(\d+)$')::int), 0) + 1 into n from public.jobs where edge_no like 'P' || d || '-%';
  return 'P' || d || '-' || lpad(n::text, 2, '0');
end $$;
revoke all on function public.next_provisional_no() from public, anon, authenticated;

create or replace function public.create_job(p_job jsonb, p_conditions jsonb, p_requests jsonb, p_client jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; c jsonb; r jsonb; v_no text := nullif(trim(p_job->>'edge_no'), '');
begin
  if public.app_role() not in ('admin', 'sales') then raise exception 'Only Sales or Admin can take in a watch'; end if;
  if v_no is null then v_no := public.next_provisional_no(); end if;
  if exists (select 1 from public.jobs where edge_no = v_no) then raise exception 'Job % already exists', v_no; end if;
  insert into public.jobs (edge_no, rolex_service_no, mrws_ref, service_type, watch_ref, watch_name, serial, calibre,
                           dial, dial_ref, bracelet, bracelet_ref, intake_by, ctr_tier, ctr_price, polish, polish_family, polish_price, eta_quoted,
                           classification, vintage_fee, purchase_date, engraving)
  values (v_no, nullif(trim(p_job->>'rolex_service_no'), ''), nullif(trim(p_job->>'mrws_ref'), ''),
          coalesce(nullif(p_job->>'service_type', ''), 'CTR'), nullif(upper(trim(p_job->>'watch_ref')), ''),
          nullif(trim(p_job->>'watch_name'), ''), nullif(trim(p_job->>'serial'), ''), nullif(trim(p_job->>'calibre'), ''),
          nullif(trim(p_job->>'dial'), ''), nullif(trim(p_job->>'dial_ref'), ''),
          nullif(trim(p_job->>'bracelet'), ''), nullif(trim(p_job->>'bracelet_ref'), ''), auth.uid(),
          nullif(p_job->>'ctr_tier', ''), (p_job->>'ctr_price')::numeric, coalesce((p_job->>'polish')::boolean, false),
          nullif(p_job->>'polish_family', ''), (p_job->>'polish_price')::numeric, (p_job->>'eta_quoted')::date,
          nullif(p_job->>'classification', ''), (p_job->>'vintage_fee')::numeric, nullif(p_job->>'purchase_date', '')::date,
          case when jsonb_typeof(p_job->'engraving') = 'object' then p_job->'engraving' end)
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
    insert into public.job_clients (job_id, name, address1, address2, address3, email, by_user)
    values (v_id, trim(p_client->>'name'), nullif(trim(p_client->>'address1'), ''), nullif(trim(p_client->>'address2'), ''),
            nullif(trim(p_client->>'address3'), ''), nullif(lower(trim(p_client->>'email')), ''), auth.uid());
  end if;
  return v_id;
end $$;

insert into public.app_settings (key, value) values ('build_checklist', '{"items": {}, "custom": []}') on conflict (key) do nothing;
