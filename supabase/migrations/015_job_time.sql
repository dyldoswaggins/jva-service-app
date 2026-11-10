-- 015: bench time per job (Dylan, 2026-11-09). While a watchmaker has a job open, the page records time on that job.
-- Everyone sees the job's total ("time on this job"); only Admin sees who it was.
-- Writes only through the functions below; a session ends at its last heartbeat (page closed, tablet asleep, other job opened).

create table public.job_time (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  user_id uuid not null references public.profiles(id) default auth.uid(),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended boolean not null default false
);
create index job_time_job on public.job_time (job_id);
create index job_time_user on public.job_time (user_id, last_seen_at desc);
alter table public.job_time enable row level security;
create policy "read job time" on public.job_time for select to authenticated
  using (public.app_role() = 'admin' or user_id = auth.uid());
revoke all on public.job_time from anon;
create trigger job_time_no_delete before delete on public.job_time for each row execute function public.block_change();

-- Start (or continue) time on a job. Ends this person's other open sessions; one job at a time.
create or replace function public.time_start(p_job uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if public.app_role() not in ('admin', 'watchmaker') then return null; end if;
  update public.job_time set ended = true where user_id = auth.uid() and not ended;
  insert into public.job_time (job_id, user_id) values (p_job, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Heartbeat (every minute). Returns false if the session lapsed (> 3 min without a beat): the page starts a new one.
create or replace function public.time_beat(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.job_time set last_seen_at = now()
  where id = p_id and user_id = auth.uid() and not ended and last_seen_at > now() - interval '3 minutes';
  return found;
end $$;

create or replace function public.time_stop(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.job_time set ended = true,
    last_seen_at = case when last_seen_at > now() - interval '3 minutes' then now() else last_seen_at end
  where id = p_id and user_id = auth.uid() and not ended;
end $$;

-- Total seconds on a job (everyone who can read the job). Admin also gets the split by person.
create or replace function public.job_time_total(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total numeric; people jsonb;
begin
  if auth.uid() is null or public.app_role() = 'sales' then return null; end if;
  select coalesce(sum(extract(epoch from last_seen_at - started_at)), 0) into total from public.job_time where job_id = p_job;
  if public.app_role() = 'admin' then
    select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'seconds', s) order by s desc), '[]') into people
    from (select user_id, sum(extract(epoch from last_seen_at - started_at)) s from public.job_time where job_id = p_job group by user_id) x;
  end if;
  return jsonb_build_object('seconds', round(total), 'people', people);
end $$;

revoke execute on function public.time_start(uuid), public.time_beat(uuid), public.time_stop(uuid), public.job_time_total(uuid) from public, anon;
grant execute on function public.time_start(uuid), public.time_beat(uuid), public.time_stop(uuid), public.job_time_total(uuid) to authenticated;
