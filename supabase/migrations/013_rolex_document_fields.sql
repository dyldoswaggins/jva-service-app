-- 013: Rolex customer-document requirements (Plaque – Customer Service Documents V10.2024)
-- * Watch description needs bracelet reference + description and a dial description → saved at intake.
-- * WSR serial number check must be done before the estimate → recorded on the job, gates leaving Estimate.
alter table public.jobs add column if not exists wsr_checked_by uuid references public.profiles(id);
alter table public.jobs add column if not exists wsr_checked_at timestamptz;
alter table public.jobs add column if not exists wsr_declared_at timestamptz;   -- intervention declared at service end

create or replace function public.create_job(p_job jsonb, p_conditions jsonb, p_requests jsonb)
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
  return v_id;
end $$;
