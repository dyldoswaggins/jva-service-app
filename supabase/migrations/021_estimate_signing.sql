-- 021: client signs the estimate online (Dylan, 2026-11-12) — by an emailed private link or on the in-store iPad.
-- The email carries the estimate PDF attached + a "Review and sign" link. Signing files the signed estimate on the job
-- and records the client's decision (declined parts back to stock), exactly like record_decision().

alter table public.job_clients add column if not exists email text;

alter table public.job_docs drop constraint if exists job_docs_kind_check;
alter table public.job_docs add constraint job_docs_kind_check
  check (kind in ('receipt', 'vintage_fee', 'immediate_proceed', 'estimate', 'signed_estimate', 'confirmation', 'invoice', 'other'));

create table public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  job_id uuid not null references public.jobs(id),
  doc_id uuid not null references public.job_docs(id),          -- the estimate PDF being signed
  lines jsonb not null,                                          -- { necessary: [...], optional: [...] } as printed
  channel text not null check (channel in ('email', 'in_store')),
  email text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  emailed_at timestamptz,
  cancelled_at timestamptz,
  signed_at timestamptz,
  signer_name text, signer_ip text, signer_agent text,
  decision jsonb,
  signed_doc_id uuid references public.job_docs(id)
);
create index sign_requests_job on public.sign_requests (job_id);
alter table public.sign_requests enable row level security;
create policy "admin reads sign requests" on public.sign_requests for select to authenticated using (public.app_role() = 'admin');
revoke all on public.sign_requests from anon, authenticated;
grant select on public.sign_requests to authenticated;
create trigger sign_requests_no_delete before delete on public.sign_requests for each row execute function public.block_change();

-- Admin: open a signing request for the latest estimate (any earlier open request for the job is cancelled)
create or replace function public.create_sign_request(p_job uuid, p_doc uuid, p_lines jsonb, p_channel text, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.sign_requests;
begin
  if public.app_role() <> 'admin' then raise exception 'Only Admin sends estimates for signature'; end if;
  if not exists (select 1 from public.job_docs where id = p_doc and job_id = p_job and kind = 'estimate') then raise exception 'Create the estimate first'; end if;
  if exists (select 1 from public.jobs where id = p_job and estimate_decision is not null) then raise exception 'The client has already decided on this estimate'; end if;
  if p_channel = 'email' and coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter the client''s email address'; end if;
  update public.sign_requests set cancelled_at = now() where job_id = p_job and signed_at is null and cancelled_at is null;
  insert into public.sign_requests (job_id, doc_id, lines, channel, email)
  values (p_job, p_doc, p_lines, p_channel, nullif(lower(trim(p_email)), ''))
  returning * into r;
  return jsonb_build_object('id', r.id, 'token', r.token, 'expires_at', r.expires_at);
end $$;
revoke execute on function public.create_sign_request(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.create_sign_request(uuid, uuid, jsonb, text, text) to authenticated;

-- Edge Function "sign" (service role) only: apply the signed decision. Mirrors record_decision().
create or replace function public.apply_signed_estimate(p_request uuid, p_refused boolean, p_accepted uuid[], p_declined uuid[],
  p_extra jsonb, p_decision jsonb, p_name text, p_ip text, p_agent text, p_signed_doc uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.sign_requests; l public.job_parts; j public.jobs; p public.parts;
begin
  select * into r from public.sign_requests where id = p_request for update;
  if not found or r.signed_at is not null or r.cancelled_at is not null or r.expires_at < now() then raise exception 'This signing link is no longer valid'; end if;
  select * into j from public.jobs where id = r.job_id for update;
  if j.estimate_decision is not null then raise exception 'The decision was already recorded'; end if;
  update public.job_parts set decision = 'accepted' where job_id = j.id and id = any(coalesce(p_accepted, '{}'));
  for l in select * from public.job_parts where job_id = j.id and id = any(coalesce(p_declined, '{}')) and state = 'active' for update loop
    if l.consumed_qty > 0 then
      select * into p from public.parts where id = l.part_id for update;
      update public.parts set qty = coalesce(qty, 0) + l.consumed_qty, c_at = now() where id = p.id;
      insert into public.log (part_id, rmc, prev, qty, change, by_user, src, type, ref)
      values (p.id, p.rmc, p.qty, coalesce(p.qty, 0) + l.consumed_qty, l.consumed_qty, r.created_by, 'Job #' || j.edge_no || ' (declined)', 'Returned', j.id::text);
    end if;
    update public.job_parts set state = 'removed', removed_by = r.created_by, removed_at = now(), decision = 'declined' where id = l.id;
  end loop;
  update public.jobs set estimate_decision = case when p_refused then 'refused' else 'accepted' end,
    decision_at = now(), decision_by = null, extra_lines = coalesce(p_extra, extra_lines)
  where id = j.id;
  update public.sign_requests set signed_at = now(), signer_name = p_name, signer_ip = p_ip, signer_agent = left(p_agent, 300),
    decision = p_decision, signed_doc_id = p_signed_doc where id = r.id;
end $$;
revoke execute on function public.apply_signed_estimate(uuid, boolean, uuid[], uuid[], jsonb, jsonb, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_signed_estimate(uuid, boolean, uuid[], uuid[], jsonb, jsonb, text, text, text, uuid) to service_role;
