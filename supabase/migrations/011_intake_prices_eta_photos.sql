-- 011: client-facing intake (Dylan, 2026-11-09): CTR price by tier, polish offer by watch family/size,
-- ETA from the bench queue (watchmaker can override), iPad photos. Sales associates see only the intake.

-- ---------- settings (Admin edits in the app) ----------
create table public.app_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
insert into public.app_settings (key, value) values
  ('ctr_prices', '{"Modern": null, "Classic": null, "Professional": null}'),
  ('polish_prices', '{"Oyster Perpetual / Datejust / Air-King": null, "Submariner / GMT-Master / Explorer / Sea-Dweller": null, "Daytona / Yacht-Master / Sky-Dweller": null, "Day-Date / gold": null}'),
  ('bench', '{"watches_per_week": 6, "parts_wait_days": 0}');
alter table public.app_settings enable row level security;
create policy "read settings" on public.app_settings for select to authenticated using (true);
create policy "admin edits settings" on public.app_settings for update to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
revoke all on public.app_settings from anon;

-- ---------- job fields ----------
alter table public.jobs add column if not exists ctr_tier text;
alter table public.jobs add column if not exists ctr_price numeric;
alter table public.jobs add column if not exists polish boolean not null default false;
alter table public.jobs add column if not exists polish_family text;
alter table public.jobs add column if not exists polish_price numeric;
alter table public.jobs add column if not exists eta_quoted date;        -- told to the client at intake
alter table public.jobs add column if not exists eta_override date;      -- set by a watchmaker
alter table public.jobs add column if not exists eta_note text;

-- ETA from the queue: open bench jobs taken in before this one ÷ watches per week (+ parts wait)
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
  where st.kind = 'open' and (p_job is null or (j.id <> p_job and j.intake_at < at));
  return jsonb_build_object('ahead', ahead, 'eta', current_date + (ceil((ahead + 1) / wpw) * 7)::int + wait);
end $$;
revoke execute on function public.queue_eta(uuid) from public, anon;
grant execute on function public.queue_eta(uuid) to authenticated;

-- create_job: now also price, polish and quoted ETA
create or replace function public.create_job(p_job jsonb, p_conditions jsonb, p_requests jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; c jsonb; r jsonb;
begin
  if public.app_role() not in ('admin', 'sales') then raise exception 'Only Sales or Admin can take in a watch'; end if;
  if exists (select 1 from public.jobs where edge_no = trim(p_job->>'edge_no')) then
    raise exception 'Job % already exists', trim(p_job->>'edge_no');
  end if;
  insert into public.jobs (edge_no, rolex_service_no, mrws_ref, service_type, watch_ref, watch_name, serial, calibre,
                           dial, bracelet, intake_by, ctr_tier, ctr_price, polish, polish_family, polish_price, eta_quoted)
  values (trim(p_job->>'edge_no'), nullif(trim(p_job->>'rolex_service_no'), ''), nullif(trim(p_job->>'mrws_ref'), ''),
          coalesce(nullif(p_job->>'service_type', ''), 'CTR'), nullif(upper(trim(p_job->>'watch_ref')), ''),
          nullif(trim(p_job->>'watch_name'), ''), nullif(trim(p_job->>'serial'), ''), nullif(trim(p_job->>'calibre'), ''),
          nullif(trim(p_job->>'dial'), ''), nullif(trim(p_job->>'bracelet'), ''), auth.uid(),
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

-- ---------- photos ----------
create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  file_path text not null,
  label text,
  by_user uuid references public.profiles(id),
  at timestamptz not null default now()
);
alter table public.job_photos enable row level security;
create policy "read photos" on public.job_photos for select to authenticated
  using (public.app_role() <> 'sales' or by_user = auth.uid());
create policy "staff add photos" on public.job_photos for insert to authenticated
  with check (public.app_role() in ('admin', 'sales', 'watchmaker'));
revoke all on public.job_photos from anon;
create trigger job_photos_no_delete before delete on public.job_photos for each row execute function public.block_change();
insert into storage.buckets (id, name, public, file_size_limit) values ('job-photos', 'job-photos', false, 10485760) on conflict (id) do nothing;
create policy "staff read job photos" on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and public.app_role() in ('admin', 'watchmaker', 'sales', 'view'));
create policy "staff upload job photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and public.app_role() in ('admin', 'sales', 'watchmaker'));

-- ---------- Sales associates: intake only ----------
-- They create jobs (create_job) and file their receipt/photos, and may read back only what they took in today.
drop policy if exists "read jobs" on public.jobs;
create policy "read jobs" on public.jobs for select to authenticated
  using (public.app_role() <> 'sales' or (intake_by = auth.uid() and intake_at > now() - interval '1 day'));
drop policy if exists "staff edit jobs" on public.jobs;
create policy "staff edit jobs" on public.jobs for update to authenticated
  using (public.app_role() in ('admin', 'watchmaker')) with check (public.app_role() in ('admin', 'watchmaker'));
drop policy if exists "read conditions" on public.job_conditions;
create policy "read conditions" on public.job_conditions for select to authenticated
  using (public.app_role() <> 'sales' or by_user = auth.uid());
drop policy if exists "read requests" on public.job_requests;
create policy "read requests" on public.job_requests for select to authenticated
  using (public.app_role() <> 'sales' or by_user = auth.uid());
drop policy if exists "read status log" on public.job_status_log;
create policy "read status log" on public.job_status_log for select to authenticated using (public.app_role() <> 'sales');
drop policy if exists "read job parts" on public.job_parts;
create policy "read job parts" on public.job_parts for select to authenticated using (public.app_role() <> 'sales');
drop policy if exists "office reads job docs" on public.job_docs;
create policy "office reads job docs" on public.job_docs for select to authenticated
  using (public.app_role() = 'admin' or (public.app_role() = 'sales' and by_user = auth.uid()) or (public.app_role() <> 'sales' and not has_client_data));
drop policy if exists "read parts" on public.parts;
create policy "read parts" on public.parts for select to authenticated using (public.app_role() <> 'sales');
drop policy if exists "read log" on public.log;
create policy "read log" on public.log for select to authenticated using (public.app_role() <> 'sales');
drop policy if exists "read invoices" on public.invoices;
create policy "read invoices" on public.invoices for select to authenticated using (public.app_role() <> 'sales');
drop policy if exists "read receipt lines" on public.receipt_lines;
create policy "read receipt lines" on public.receipt_lines for select to authenticated using (public.app_role() <> 'sales');
drop policy if exists "read kits" on public.ctr_kit_items;
create policy "read kits" on public.ctr_kit_items for select to authenticated using (public.app_role() <> 'sales');
drop policy if exists "office reads job doc files" on storage.objects;
create policy "office reads job doc files" on storage.objects for select to authenticated
  using (bucket_id = 'job-docs' and (public.app_role() = 'admin' or (public.app_role() = 'sales' and owner = auth.uid())));
-- models stay readable (intake looks up the watch reference); profiles stay readable (names)
