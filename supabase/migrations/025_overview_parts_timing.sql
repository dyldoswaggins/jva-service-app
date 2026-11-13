-- 025: Phase 2 of the scanned-files plan (Dylan, 2026-11-12): JVA "Rolex Service Overview" details, parts sourcing, Rolex Timing Analysis.
-- * Overview: remarks & observations, pre-cleaning done by, special handling (return old crown, keep original parts, do not refinish…),
--   guarantee exclusions (water resistance, bracelet…).
-- * Parts on a job: supply = in stock / order (Overview's ROLP-SOS vs "ORDER n"), ordered on MRWS (tick), picked from the Lista cabinet (tick).
-- * Timing: Rolex TIMING ANALYSIS (Ref. E6220-11) entered by the watchmaker; workshop + archive only (jobs.timing, latest test last).

alter table public.jobs add column if not exists remarks text;
alter table public.jobs add column if not exists precleaned_by uuid references public.profiles(id);
alter table public.jobs add column if not exists precleaned_at timestamptz;
alter table public.jobs add column if not exists handling text[] not null default '{}';
alter table public.jobs add column if not exists exclusions text[] not null default '{}';
alter table public.jobs add column if not exists timing jsonb not null default '[]';

alter table public.job_parts add column if not exists supply text check (supply in ('stock', 'order'));
alter table public.job_parts add column if not exists ordered_at timestamptz;
alter table public.job_parts add column if not exists ordered_by uuid references public.profiles(id);
alter table public.job_parts add column if not exists picked_at timestamptz;
alter table public.job_parts add column if not exists picked_by uuid references public.profiles(id);

-- Watchmaker / Admin: tick a part as ordered on MRWS or picked, or set where it comes from (job_parts is written only through functions)
create or replace function public.set_job_part_supply(p_line uuid, p_field text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.app_role() not in ('admin', 'watchmaker') then raise exception 'Only a watchmaker can update parts'; end if;
  if p_field = 'supply' then
    if p_value is not null and p_value not in ('stock', 'order') then raise exception 'In stock or order'; end if;
    update public.job_parts set supply = p_value where id = p_line;
  elsif p_field = 'ordered' then
    update public.job_parts set ordered_at = case when p_value = 'on' then now() end, ordered_by = case when p_value = 'on' then auth.uid() end,
      supply = case when p_value = 'on' then 'order' else supply end where id = p_line;
  elsif p_field = 'picked' then
    update public.job_parts set picked_at = case when p_value = 'on' then now() end, picked_by = case when p_value = 'on' then auth.uid() end where id = p_line;
  else raise exception 'Unknown field'; end if;
end $$;
revoke execute on function public.set_job_part_supply(uuid, text, text) from public, anon;
grant execute on function public.set_job_part_supply(uuid, text, text) to authenticated;
