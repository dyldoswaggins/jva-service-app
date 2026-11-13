-- 030: OPEN ACCESS — no sign-in (Dylan, 2026-11-12, "fully open for now"). The app opens on a role picker (Service Manager / Watchmaker /
-- Sales) and sends the choice as the "x-app-role" request header. While app_settings.open_access.enabled is true, app_role() trusts that
-- header for requests without a signed-in user. Anyone with the site address can then read and change data: keep real client data out
-- until it is switched off.
--   Switch OFF (back to sign-in):  update public.app_settings set value = '{"enabled": false}' where key = 'open_access';
--   and set VITE_ACCESS=signin in Netlify (or remove the role picker). Signed-in users keep working either way.

insert into public.app_settings (key, value) values ('open_access', '{"enabled": true}')
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.open_access() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'enabled')::boolean from public.app_settings where key = 'open_access'), false)
$$;

create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    case when public.open_access() then (
      select r from (select nullif(current_setting('request.headers', true), '')::json->>'x-app-role' as r) h
      where r in ('admin', 'watchmaker', 'sales')) end,
    'view')
$$;

-- Every policy written for signed-in users also applies to the anonymous key (still filtered by app_role())
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname in ('public', 'storage') and roles = '{authenticated}' loop
    execute format('alter policy %I on %I.%I to authenticated, anon', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- Same table and function privileges for anon as for signed-in users (RLS still applies)
do $$ declare g record; begin
  for g in select table_name, privilege_type from information_schema.role_table_grants
           where grantee = 'authenticated' and table_schema = 'public' loop
    execute format('grant %s on public.%I to anon', g.privilege_type, g.table_name);
  end loop;
  for g in select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') loop
    execute format('grant execute on function %s to anon', g.fn);
  end loop;
end $$;

-- Sales rows that were tied to the signed-in associate (by_user = auth.uid()) — readable by Sales while open
create policy "open access sales reads jobs" on public.jobs for select to anon, authenticated using (public.open_access() and public.app_role() = 'sales');
create policy "open access sales reads docs" on public.job_docs for select to anon, authenticated using (public.open_access() and public.app_role() = 'sales');
create policy "open access sales reads clients" on public.job_clients for select to anon, authenticated using (public.open_access() and public.app_role() = 'sales');
create policy "open access sales reads photos" on public.job_photos for select to anon, authenticated using (public.open_access() and public.app_role() = 'sales');
create policy "open access sales reads conditions" on public.job_conditions for select to anon, authenticated using (public.open_access() and public.app_role() = 'sales');
create policy "open access sales reads requests" on public.job_requests for select to anon, authenticated using (public.open_access() and public.app_role() = 'sales');
-- Storage while open (the storage service may not pass custom headers): job files readable / uploadable
create policy "open access job files read" on storage.objects for select to anon using (public.open_access() and bucket_id in ('job-docs', 'job-photos', 'inbox'));
create policy "open access job files upload" on storage.objects for insert to anon with check (public.open_access() and bucket_id in ('job-docs', 'job-photos', 'inbox'));

-- Functions that required a signed-in user
create or replace function public.queue_eta(p_job uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s jsonb; wpw numeric; wait integer; ahead integer; at timestamptz;
begin
  if public.app_role() = 'view' and auth.uid() is null then raise exception 'Not signed in'; end if;
  select value into s from public.app_settings where key = 'bench';
  wpw := greatest(coalesce((s->>'watches_per_week')::numeric, 6), 0.5);
  wait := coalesce((s->>'parts_wait_days')::int, 0);
  select intake_at into at from public.jobs where id = p_job;
  select count(*) into ahead from public.jobs j join public.job_statuses st on st.name = j.status
  where st.kind = 'open' and coalesce(j.classification, '') <> 'Vintage'
    and (p_job is null or (j.id <> p_job and j.intake_at < at));
  return jsonb_build_object('ahead', ahead, 'eta', current_date + (ceil((ahead + 1) / wpw) * 7)::int + wait);
end $$;

create or replace function public.job_time_total(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total numeric; people jsonb;
begin
  if public.app_role() in ('sales', 'view') then return null; end if;
  select coalesce(sum(extract(epoch from last_seen_at - started_at)), 0) into total from public.job_time where job_id = p_job;
  if public.app_role() = 'admin' then
    select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'seconds', s) order by s desc), '[]') into people
    from (select user_id, sum(extract(epoch from last_seen_at - started_at)) s from public.job_time where job_id = p_job group by user_id) x;
  end if;
  return jsonb_build_object('seconds', round(total), 'people', people);
end $$;

-- Time on the job needs a person: without sign-in it simply isn't recorded
create or replace function public.time_start(p_job uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or public.app_role() not in ('admin', 'watchmaker') then return null; end if;
  update public.job_time set ended = true where user_id = auth.uid() and not ended;
  insert into public.job_time (job_id, user_id) values (p_job, auth.uid()) returning id into v_id;
  return v_id;
end $$;
