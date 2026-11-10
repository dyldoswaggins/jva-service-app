-- 017: Modern / Classic / Vintage classification at intake (Rolex Service Workflow v2.1, Dylan 2026-11-09).
-- Vintage: J. Vair Vintage Analysis Fee form signed at intake (instead of the receipt), always serviced at Rolex Toronto (RCL),
-- no CTR kit, no timeframe from the bench queue. The watchmaker gathers WSC information only.

alter table public.jobs add column if not exists classification text check (classification in ('Modern', 'Classic', 'Vintage'));
alter table public.jobs add column if not exists vintage_fee numeric;

alter table public.jobs drop constraint if exists jobs_service_type_check;
alter table public.jobs add constraint jobs_service_type_check check (service_type in ('CTR', 'Partial', 'Warranty', 'Quick Service', 'Vintage analysis'));

alter table public.job_docs drop constraint if exists job_docs_kind_check;
alter table public.job_docs add constraint job_docs_kind_check check (kind in ('receipt', 'vintage_fee', 'estimate', 'confirmation', 'invoice', 'other'));

insert into public.app_settings (key, value) values ('vintage', '{"fee": 350, "weeks": 18}') on conflict (key) do nothing;

-- Bench queue: vintage watches go to Rolex Toronto, so they don't count
create or replace function public.queue_eta(p_job uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s jsonb; wpw numeric; wait integer; ahead integer; at timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select value into s from public.app_settings where key = 'bench';
  wpw := greatest(coalesce((s->>'watches_per_week')::numeric, 6), 0.5);
  wait := coalesce((s->>'parts_wait_days')::int, 0);
  select intake_at into at from public.jobs where id = p_job;
  select count(*) into ahead from public.jobs j join public.job_statuses st on st.name = j.status
  where st.kind = 'open' and coalesce(j.classification, '') <> 'Vintage'
    and (p_job is null or (j.id <> p_job and j.intake_at < at));
  return jsonb_build_object('ahead', ahead, 'eta', current_date + (ceil((ahead + 1) / wpw) * 7)::int + wait);
end $$;

create or replace function public.create_job(p_job jsonb, p_conditions jsonb, p_requests jsonb, p_client jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; c jsonb; r jsonb;
begin
  if public.app_role() not in ('admin', 'sales') then raise exception 'Only Sales or Admin can take in a watch'; end if;
  if exists (select 1 from public.jobs where edge_no = trim(p_job->>'edge_no')) then
    raise exception 'Job % already exists', trim(p_job->>'edge_no');
  end if;
  insert into public.jobs (edge_no, rolex_service_no, mrws_ref, service_type, watch_ref, watch_name, serial, calibre,
                           dial, dial_ref, bracelet, bracelet_ref, intake_by, ctr_tier, ctr_price, polish, polish_family, polish_price, eta_quoted,
                           classification, vintage_fee)
  values (trim(p_job->>'edge_no'), nullif(trim(p_job->>'rolex_service_no'), ''), nullif(trim(p_job->>'mrws_ref'), ''),
          coalesce(nullif(p_job->>'service_type', ''), 'CTR'), nullif(upper(trim(p_job->>'watch_ref')), ''),
          nullif(trim(p_job->>'watch_name'), ''), nullif(trim(p_job->>'serial'), ''), nullif(trim(p_job->>'calibre'), ''),
          nullif(trim(p_job->>'dial'), ''), nullif(trim(p_job->>'dial_ref'), ''),
          nullif(trim(p_job->>'bracelet'), ''), nullif(trim(p_job->>'bracelet_ref'), ''), auth.uid(),
          nullif(p_job->>'ctr_tier', ''), (p_job->>'ctr_price')::numeric, coalesce((p_job->>'polish')::boolean, false),
          nullif(p_job->>'polish_family', ''), (p_job->>'polish_price')::numeric, (p_job->>'eta_quoted')::date,
          nullif(p_job->>'classification', ''), (p_job->>'vintage_fee')::numeric)
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
