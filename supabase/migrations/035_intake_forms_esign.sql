-- 035: intake forms filled in and e-signed (Richard, 2026-11-25)
-- * Client details get their own Postal code and Phone (the Vintage Analysis Fee form has a Postal Code line). Same rules as the
--   rest of job_clients: Admin, and the Sales associate who took the watch in; never watchmakers. address3 is kept for older jobs.
-- * Every intake now files the Receipt + Rolex Immediate Proceed (+ Vintage Analysis Fee form for Vintage). The client signs each
--   form on the iPad, or later through a private link emailed to them: a sign request with purpose 'intake' covering those forms.
-- Nothing existing is renamed, dropped or deleted.

alter table public.job_clients add column if not exists postal_code text;
alter table public.job_clients add column if not exists phone text;

-- The associate who took the watch in gets a copy of the signed paperwork (Richard, 2026-11-25). Store email addresses only.
alter table public.jobs add column if not exists intake_staff_name text;
alter table public.jobs add column if not exists intake_staff_email text;
alter table public.jobs drop constraint if exists jobs_intake_staff_email_check;
alter table public.jobs add constraint jobs_intake_staff_email_check check (intake_staff_email is null or intake_staff_email ~* '^[^@\s]+@jvairanderson\.com$');

-- create_job (032) + postal code, phone, and the associate's name + email
create or replace function public.create_job(p_job jsonb, p_conditions jsonb, p_requests jsonb, p_client jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; c jsonb; r jsonb; v_no text := nullif(trim(p_job->>'edge_no'), '');
begin
  if public.app_role() not in ('admin', 'sales') then raise exception 'Only Sales or Admin can take in a watch'; end if;
  if v_no is null then v_no := public.next_provisional_no(); end if;
  if exists (select 1 from public.jobs where edge_no = v_no) then raise exception 'Job % already exists', v_no; end if;
  insert into public.jobs (edge_no, rolex_service_no, mrws_ref, service_type, watch_ref, watch_name, serial, calibre,
                           dial, dial_ref, bracelet, bracelet_ref, intake_by, ctr_tier, ctr_price, polish, polish_family, polish_price, eta_quoted,
                           classification, vintage_fee, purchase_date, engraving, intake_staff_name, intake_staff_email)
  values (v_no, nullif(trim(p_job->>'rolex_service_no'), ''), nullif(trim(p_job->>'mrws_ref'), ''),
          coalesce(nullif(p_job->>'service_type', ''), 'CTR'), nullif(upper(trim(p_job->>'watch_ref')), ''),
          nullif(trim(p_job->>'watch_name'), ''), nullif(trim(p_job->>'serial'), ''), nullif(trim(p_job->>'calibre'), ''),
          nullif(trim(p_job->>'dial'), ''), nullif(trim(p_job->>'dial_ref'), ''),
          nullif(trim(p_job->>'bracelet'), ''), nullif(trim(p_job->>'bracelet_ref'), ''), auth.uid(),
          nullif(p_job->>'ctr_tier', ''), (p_job->>'ctr_price')::numeric, coalesce((p_job->>'polish')::boolean, false),
          nullif(p_job->>'polish_family', ''), (p_job->>'polish_price')::numeric, (p_job->>'eta_quoted')::date,
          nullif(p_job->>'classification', ''), (p_job->>'vintage_fee')::numeric, nullif(p_job->>'purchase_date', '')::date,
          case when jsonb_typeof(p_job->'engraving') = 'object' then p_job->'engraving' end,
          nullif(trim(p_job->>'intake_staff_name'), ''), nullif(lower(trim(p_job->>'intake_staff_email')), ''))
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
    insert into public.job_clients (job_id, name, address1, address2, address3, postal_code, phone, email, by_user)
    values (v_id, trim(p_client->>'name'), nullif(trim(p_client->>'address1'), ''), nullif(trim(p_client->>'address2'), ''),
            nullif(trim(p_client->>'address3'), ''), nullif(upper(trim(p_client->>'postal_code')), ''), nullif(trim(p_client->>'phone'), ''),
            nullif(lower(trim(p_client->>'email')), ''), auth.uid());
  end if;
  return v_id;
end $$;

-- Signing requests: estimate (021) or intake forms (this migration)
alter table public.sign_requests add column if not exists purpose text not null default 'estimate';
alter table public.sign_requests drop constraint if exists sign_requests_purpose_check;
alter table public.sign_requests add constraint sign_requests_purpose_check check (purpose in ('estimate', 'intake'));
alter table public.sign_requests add column if not exists doc_ids uuid[];   -- intake: the forms to sign (receipt, immediate_proceed, vintage_fee)

-- 021's estimate request, now cancelling only earlier *estimate* requests (an open intake request stays open)
create or replace function public.create_sign_request(p_job uuid, p_doc uuid, p_lines jsonb, p_channel text, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.sign_requests;
begin
  if public.app_role() <> 'admin' then raise exception 'Only Admin sends estimates for signature'; end if;
  if not exists (select 1 from public.job_docs where id = p_doc and job_id = p_job and kind = 'estimate') then raise exception 'Create the estimate first'; end if;
  if exists (select 1 from public.jobs where id = p_job and estimate_decision is not null) then raise exception 'The client has already decided on this estimate'; end if;
  if p_channel = 'email' and coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter the client''s email address'; end if;
  update public.sign_requests set cancelled_at = now() where job_id = p_job and purpose = 'estimate' and signed_at is null and cancelled_at is null;
  insert into public.sign_requests (job_id, doc_id, lines, channel, email)
  values (p_job, p_doc, p_lines, p_channel, nullif(lower(trim(p_email)), ''))
  returning * into r;
  return jsonb_build_object('id', r.id, 'token', r.token, 'expires_at', r.expires_at);
end $$;

-- Sales (at intake) or Admin: the client signs the intake forms through a private link (email) or later on the iPad (in_store)
create or replace function public.create_intake_sign_request(p_job uuid, p_docs uuid[], p_channel text, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.sign_requests; n int := coalesce(array_length(p_docs, 1), 0);
begin
  if public.app_role() not in ('admin', 'sales') then raise exception 'Only Sales or Admin send intake forms for signature'; end if;
  if public.app_role() = 'sales' and not exists (select 1 from public.jobs where id = p_job and intake_at > now() - interval '1 day') then
    raise exception 'Ask the office to resend the forms for this job';
  end if;
  if n = 0 then raise exception 'No forms to sign'; end if;
  if (select count(*) from public.job_docs where id = any(p_docs) and job_id = p_job and kind in ('receipt', 'immediate_proceed', 'vintage_fee')) <> n then
    raise exception 'Those forms are not on this job';
  end if;
  if p_channel not in ('email', 'in_store') then raise exception 'Unknown channel'; end if;
  if p_channel = 'email' and coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter the client''s email address'; end if;
  update public.sign_requests set cancelled_at = now() where job_id = p_job and purpose = 'intake' and signed_at is null and cancelled_at is null;
  insert into public.sign_requests (job_id, doc_id, lines, channel, email, purpose, doc_ids)
  values (p_job, p_docs[1], '{}'::jsonb, p_channel, nullif(lower(trim(p_email)), ''), 'intake', p_docs)
  returning * into r;
  return jsonb_build_object('id', r.id, 'token', r.token, 'expires_at', r.expires_at);
end $$;
revoke execute on function public.create_intake_sign_request(uuid, uuid[], text, text) from public;
grant execute on function public.create_intake_sign_request(uuid, uuid[], text, text) to authenticated, anon; -- anon: open access (030), still checked by app_role()

-- Edge Function "sign" (service role) only: the client signed the intake forms (signed copies already filed by the function)
create or replace function public.apply_signed_intake(p_request uuid, p_name text, p_ip text, p_agent text, p_decision jsonb, p_signed_docs uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare r public.sign_requests;
begin
  select * into r from public.sign_requests where id = p_request for update;
  if not found or r.purpose <> 'intake' or r.signed_at is not null or r.cancelled_at is not null or r.expires_at < now() then
    raise exception 'This signing link is no longer valid';
  end if;
  update public.sign_requests set signed_at = now(), signer_name = p_name, signer_ip = p_ip, signer_agent = left(p_agent, 300),
    decision = coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('signed_docs', to_jsonb(p_signed_docs)), signed_doc_id = p_signed_docs[1]
  where id = r.id;
end $$;
revoke execute on function public.apply_signed_intake(uuid, text, text, text, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.apply_signed_intake(uuid, text, text, text, jsonb, uuid[]) to service_role;
);

-- create_job (032) + postal code and phone
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
    insert into public.job_clients (job_id, name, address1, address2, address3, postal_code, phone, email, by_user)
    values (v_id, trim(p_client->>'name'), nullif(trim(p_client->>'address1'), ''), nullif(trim(p_client->>'address2'), ''),
            nullif(trim(p_client->>'address3'), ''), nullif(upper(trim(p_client->>'postal_code')), ''), nullif(trim(p_client->>'phone'), ''),
            nullif(lower(trim(p_client->>'email')), ''), auth.uid());
  end if;
  return v_id;
end $$;

-- Signing requests: estimate (021) or intake forms (this migration)
alter table public.sign_requests add column if not exists purpose text not null default 'estimate';
alter table public.sign_requests drop constraint if exists sign_requests_purpose_check;
alter table public.sign_requests add constraint sign_requests_purpose_check check (purpose in ('estimate', 'intake'));
alter table public.sign_requests add column if not exists doc_ids uuid[];   -- intake: the forms to sign (receipt, immediate_proceed, vintage_fee)

-- 021's estimate request, now cancelling only earlier *estimate* requests (an open intake request stays open)
create or replace function public.create_sign_request(p_job uuid, p_doc uuid, p_lines jsonb, p_channel text, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.sign_requests;
begin
  if public.app_role() <> 'admin' then raise exception 'Only Admin sends estimates for signature'; end if;
  if not exists (select 1 from public.job_docs where id = p_doc and job_id = p_job and kind = 'estimate') then raise exception 'Create the estimate first'; end if;
  if exists (select 1 from public.jobs where id = p_job and estimate_decision is not null) then raise exception 'The client has already decided on this estimate'; end if;
  if p_channel = 'email' and coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter the client''s email address'; end if;
  update public.sign_requests set cancelled_at = now() where job_id = p_job and purpose = 'estimate' and signed_at is null and cancelled_at is null;
  insert into public.sign_requests (job_id, doc_id, lines, channel, email)
  values (p_job, p_doc, p_lines, p_channel, nullif(lower(trim(p_email)), ''))
  returning * into r;
  return jsonb_build_object('id', r.id, 'token', r.token, 'expires_at', r.expires_at);
end $$;

-- Sales (at intake) or Admin: the client signs the intake forms through a private link (email) or later on the iPad (in_store)
create or replace function public.create_intake_sign_request(p_job uuid, p_docs uuid[], p_channel text, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.sign_requests; n int := coalesce(array_length(p_docs, 1), 0);
begin
  if public.app_role() not in ('admin', 'sales') then raise exception 'Only Sales or Admin send intake forms for signature'; end if;
  if public.app_role() = 'sales' and not exists (select 1 from public.jobs where id = p_job and intake_at > now() - interval '1 day') then
    raise exception 'Ask the office to resend the forms for this job';
  end if;
  if n = 0 then raise exception 'No forms to sign'; end if;
  if (select count(*) from public.job_docs where id = any(p_docs) and job_id = p_job and kind in ('receipt', 'immediate_proceed', 'vintage_fee')) <> n then
    raise exception 'Those forms are not on this job';
  end if;
  if p_channel not in ('email', 'in_store') then raise exception 'Unknown channel'; end if;
  if p_channel = 'email' and coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter the client''s email address'; end if;
  update public.sign_requests set cancelled_at = now() where job_id = p_job and purpose = 'intake' and signed_at is null and cancelled_at is null;
  insert into public.sign_requests (job_id, doc_id, lines, channel, email, purpose, doc_ids)
  values (p_job, p_docs[1], '{}'::jsonb, p_channel, nullif(lower(trim(p_email)), ''), 'intake', p_docs)
  returning * into r;
  return jsonb_build_object('id', r.id, 'token', r.token, 'expires_at', r.expires_at);
end $$;
revoke execute on function public.create_intake_sign_request(uuid, uuid[], text, text) from public;
grant execute on function public.create_intake_sign_request(uuid, uuid[], text, text) to authenticated, anon; -- anon: open access (030), still checked by app_role()

-- Edge Function "sign" (service role) only: the client signed the intake forms (signed copies already filed by the function)
create or replace function public.apply_signed_intake(p_request uuid, p_name text, p_ip text, p_agent text, p_decision jsonb, p_signed_docs uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare r public.sign_requests;
begin
  select * into r from public.sign_requests where id = p_request for update;
  if not found or r.purpose <> 'intake' or r.signed_at is not null or r.cancelled_at is not null or r.expires_at < now() then
    raise exception 'This signing link is no longer valid';
  end if;
  update public.sign_requests set signed_at = now(), signer_name = p_name, signer_ip = p_ip, signer_agent = left(p_agent, 300),
    decision = coalesce(p_decision, '{}'::jsonb) || jsonb_build_object('signed_docs', to_jsonb(p_signed_docs)), signed_doc_id = p_signed_docs[1]
  where id = r.id;
end $$;
revoke execute on function public.apply_signed_intake(uuid, text, text, text, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.apply_signed_intake(uuid, text, text, text, jsonb, uuid[]) to service_role;
