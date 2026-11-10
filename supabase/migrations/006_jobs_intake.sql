-- 006: Repairs part 1 — jobs, intake (Sales on iPad), condition + request prompts for the watchmaker,
-- signed receipt stored with the job (Dylan, 2026-11-09).
-- Client details are NOT stored as fields: they exist only inside the signed receipt PDF
-- (private bucket 'job-docs', Admin + Sales only).

create table public.job_statuses (
  name text primary key,
  ord integer not null,
  kind text not null default 'open' check (kind in ('open', 'done', 'cancelled', 'away'))
);
insert into public.job_statuses (name, ord, kind) values
  ('Estimate', 10, 'open'), ('Waiting on parts', 20, 'open'), ('On deck', 30, 'open'),
  ('Polishing', 40, 'open'), ('Timekeeping', 50, 'open'), ('Sent to Toronto', 60, 'away'),
  ('Done', 90, 'done'), ('Cancelled', 99, 'cancelled');

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  edge_no text not null unique check (edge_no ~ '^\d{4,7}-\d{3}$'),   -- Edge repair # = job number, e.g. 124595-001
  rolex_service_no text,                                               -- Rolex / WSC #
  mrws_ref text,                                                       -- MRWS customer reference
  service_type text not null default 'CTR' check (service_type in ('CTR', 'Partial', 'Warranty', 'Quick Service')),
  status text not null default 'Estimate' references public.job_statuses(name) on update cascade,
  -- watch (receipt + declaration fields)
  watch_ref text,          -- e.g. 126610LN
  watch_name text,         -- e.g. Submariner Date
  serial text,
  calibre text,
  movement_no text,
  dial_ref text,
  dial_serial text,
  dial text,               -- dial description / colour (receipt "Dial")
  bracelet_ref text,
  bracelet text,           -- bracelet description (receipt "Bracelet")
  intake_by uuid references public.profiles(id),
  intake_at timestamptz not null default now(),
  toronto_sent date,
  toronto_back date,
  remarks text,
  updated_at timestamptz not null default now()
);
create index jobs_status on public.jobs (status);

-- Condition: recorded by Sales at intake ("to confirm"), confirmed / changed by the watchmaker at estimate
create table public.job_conditions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  component text not null,
  term text not null,
  note text,
  source text not null check (source in ('intake', 'bench')),
  state text not null default 'to_confirm' check (state in ('to_confirm', 'confirmed', 'not_present')),
  replaces uuid references public.job_conditions(id),   -- set when the watchmaker changed an intake term
  by_user uuid references public.profiles(id),
  at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz
);
create index job_conditions_job on public.job_conditions (job_id);

-- Client requests: recorded at intake, the watchmaker includes or declines each one
create table public.job_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  request text not null,
  note text,
  state text not null default 'to_review' check (state in ('to_review', 'included', 'declined')),
  reason text,                     -- why declined (shown to Sales / on the estimate)
  by_user uuid references public.profiles(id),
  at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz
);
create index job_requests_job on public.job_requests (job_id);

create table public.job_status_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  status text not null,
  by_user uuid references public.profiles(id),
  at timestamptz not null default now()
);

-- Documents filed with the job (signed receipt now; estimate / confirmation / invoice later)
create table public.job_docs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  kind text not null check (kind in ('receipt', 'estimate', 'confirmation', 'invoice', 'other')),
  file_path text not null,
  file_name text not null,
  has_client_data boolean not null default true,
  by_user uuid references public.profiles(id),
  at timestamptz not null default now()
);

-- Status changes are always logged
create or replace function public.log_job_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.job_status_log (job_id, status, by_user) values (new.id, new.status, auth.uid());
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger jobs_status_log before insert or update on public.jobs
  for each row execute function public.log_job_status();

-- Never delete (cancel instead)
create trigger jobs_no_delete before delete on public.jobs for each row execute function public.block_change();
create trigger job_conditions_no_delete before delete on public.job_conditions for each row execute function public.block_change();
create trigger job_requests_no_delete before delete on public.job_requests for each row execute function public.block_change();
create trigger job_docs_no_delete before delete on public.job_docs for each row execute function public.block_change();
create trigger job_status_log_no_change before update or delete on public.job_status_log for each row execute function public.block_change();

-- ---------- access ----------
alter table public.job_statuses enable row level security;
alter table public.jobs enable row level security;
alter table public.job_conditions enable row level security;
alter table public.job_requests enable row level security;
alter table public.job_status_log enable row level security;
alter table public.job_docs enable row level security;

create policy "read statuses" on public.job_statuses for select to authenticated using (true);
create policy "admin edits statuses" on public.job_statuses for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

create policy "read jobs" on public.jobs for select to authenticated using (true);
create policy "staff create jobs" on public.jobs for insert to authenticated
  with check (public.app_role() in ('admin', 'sales'));
create policy "staff edit jobs" on public.jobs for update to authenticated
  using (public.app_role() in ('admin', 'sales', 'watchmaker'))
  with check (public.app_role() in ('admin', 'sales', 'watchmaker'));

create policy "read conditions" on public.job_conditions for select to authenticated using (true);
create policy "staff add conditions" on public.job_conditions for insert to authenticated
  with check (public.app_role() in ('admin', 'sales', 'watchmaker'));
create policy "watchmaker confirms conditions" on public.job_conditions for update to authenticated
  using (public.app_role() in ('admin', 'watchmaker')) with check (public.app_role() in ('admin', 'watchmaker'));

create policy "read requests" on public.job_requests for select to authenticated using (true);
create policy "staff add requests" on public.job_requests for insert to authenticated
  with check (public.app_role() in ('admin', 'sales', 'watchmaker'));
create policy "watchmaker reviews requests" on public.job_requests for update to authenticated
  using (public.app_role() in ('admin', 'watchmaker')) with check (public.app_role() in ('admin', 'watchmaker'));

create policy "read status log" on public.job_status_log for select to authenticated using (true);

-- Documents with client data: Admin + Sales only
create policy "office reads job docs" on public.job_docs for select to authenticated
  using (public.app_role() in ('admin', 'sales') or not has_client_data);
create policy "office files job docs" on public.job_docs for insert to authenticated
  with check (public.app_role() in ('admin', 'sales'));

revoke all on public.jobs, public.job_conditions, public.job_requests, public.job_status_log, public.job_docs, public.job_statuses from anon;
revoke insert, update, delete on public.job_status_log from authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('job-docs', 'job-docs', false, 15728640) on conflict (id) do nothing;
create policy "office reads job doc files" on storage.objects for select to authenticated
  using (bucket_id = 'job-docs' and public.app_role() in ('admin', 'sales'));
create policy "office uploads job doc files" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-docs' and public.app_role() in ('admin', 'sales'));

alter publication supabase_realtime add table public.jobs, public.job_conditions, public.job_requests;

-- ---------- intake in one step ----------
-- p_job: job fields; p_conditions: [{component, term, note}]; p_requests: [{request, note}]
create or replace function public.create_job(p_job jsonb, p_conditions jsonb, p_requests jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; c jsonb; r jsonb;
begin
  if public.app_role() not in ('admin', 'sales') then raise exception 'Only Sales or Admin can take in a watch'; end if;
  if exists (select 1 from public.jobs where edge_no = trim(p_job->>'edge_no')) then
    raise exception 'Job % already exists', trim(p_job->>'edge_no');
  end if;
  insert into public.jobs (edge_no, rolex_service_no, mrws_ref, service_type, watch_ref, watch_name, serial, calibre,
                           dial, bracelet, intake_by)
  values (trim(p_job->>'edge_no'), nullif(trim(p_job->>'rolex_service_no'), ''), nullif(trim(p_job->>'mrws_ref'), ''),
          coalesce(nullif(p_job->>'service_type', ''), 'CTR'), nullif(upper(trim(p_job->>'watch_ref')), ''),
          nullif(trim(p_job->>'watch_name'), ''), nullif(trim(p_job->>'serial'), ''), nullif(trim(p_job->>'calibre'), ''),
          nullif(trim(p_job->>'dial'), ''), nullif(trim(p_job->>'bracelet'), ''), auth.uid())
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
revoke execute on function public.create_job(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_job(jsonb, jsonb, jsonb) to authenticated;
