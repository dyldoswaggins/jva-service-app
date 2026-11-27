-- 041: the Service Manager assigns a job to a watchmaker (Richard, 2026-11-27). Adds columns only.
-- assigned_to = the watchmaker's first name (list in app_settings 'watchmakers': Emmanuel, Jared); null = unassigned.
alter table public.jobs
  add column if not exists assigned_to text,
  add column if not exists assigned_by uuid,
  add column if not exists assigned_at timestamptz;

insert into public.app_settings (key, value)
values ('watchmakers', '{"names": ["Emmanuel", "Jared"]}')
on conflict (key) do nothing;
