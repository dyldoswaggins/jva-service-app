-- 007: write the status log AFTER the job row exists (006 logged in a BEFORE trigger, which broke inserts)
drop trigger if exists jobs_status_log on public.jobs;

create or replace function public.touch_job() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

create or replace function public.log_job_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.job_status_log (job_id, status, by_user) values (new.id, new.status, auth.uid());
  end if;
  return null;
end $$;

create trigger jobs_touch before update on public.jobs for each row execute function public.touch_job();
create trigger jobs_status_log after insert or update of status on public.jobs
  for each row execute function public.log_job_status();
