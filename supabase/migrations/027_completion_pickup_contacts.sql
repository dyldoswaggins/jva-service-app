-- 027: Phase 5 of the scanned-files plan (Dylan, 2026-11-12): completion, Service Advisor checklist, pickup, contact log, warranty jobs.
-- Workflow v2.1 steps 9 (completion), 11 (pickup cabinet), 12 (client pickup) and the Overview's "SERVICE CHECKLIST (Service Advisor)" and
-- "… SERIAL NUMBER OUT (AFTER SERVICE) / SERVICE END DATE" lines.

insert into public.job_statuses (name, ord, kind) values ('Ready for pickup', 92, 'done'), ('Picked up', 95, 'done')
on conflict (name) do nothing;

alter table public.jobs add column if not exists completed_at date;                 -- service end date / completion
alter table public.jobs add column if not exists serial_out text;                   -- case serial after service
alter table public.jobs add column if not exists dial_serial_out text;
alter table public.jobs add column if not exists movement_serial_out text;
alter table public.jobs add column if not exists bracelet_code_out text;            -- bracelet manufacturing code after service
alter table public.jobs add column if not exists wsc_declared_at timestamptz;       -- WSC Declaration started (before the estimate)
alter table public.jobs add column if not exists wsc_completed_at timestamptz;      -- WSC completed (in-house, at completion)
alter table public.jobs add column if not exists warranty_card_at timestamptz;      -- Rolex service warranty card activated
alter table public.jobs add column if not exists pouch_at timestamptz;              -- packaged in the Rolex leather pouch
alter table public.jobs add column if not exists client_called_at timestamptz;
alter table public.jobs add column if not exists client_emailed_at timestamptz;
alter table public.jobs add column if not exists cabinet_at timestamptz;            -- placed in the pickup cabinet
alter table public.jobs add column if not exists picked_up_at timestamptz;
alter table public.jobs add column if not exists picked_up_by uuid references public.profiles(id);
alter table public.jobs add column if not exists pickup_checklist jsonb;
alter table public.jobs add column if not exists purchase_date date;                -- warranty: date of purchase on the warranty card

-- Sales associates hand watches back: they may read jobs that are ready for pickup (and their client name, to check photo ID)
drop policy if exists "read jobs" on public.jobs;
create policy "read jobs" on public.jobs for select to authenticated
  using (public.app_role() <> 'sales' or (intake_by = auth.uid() and intake_at > now() - interval '1 day') or status = 'Ready for pickup');
drop policy if exists "office reads clients" on public.job_clients;
create policy "office reads clients" on public.job_clients for select to authenticated
  using (public.app_role() = 'admin' or (public.app_role() = 'sales' and (by_user = auth.uid()
    or exists (select 1 from public.jobs j where j.id = job_id and j.status = 'Ready for pickup'))));

-- Handover at the counter (Sales or Admin): photo ID checked + handover checklist → Picked up
create or replace function public.mark_picked_up(p_job uuid, p_checklist jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  if public.app_role() not in ('admin', 'sales') then raise exception 'Only Sales or Admin hand watches back'; end if;
  select * into j from public.jobs where id = p_job for update;
  if not found or j.status <> 'Ready for pickup' then raise exception 'This watch is not ready for pickup'; end if;
  if coalesce((p_checklist->>'id_checked')::boolean, false) is not true then raise exception 'Check the client''s government photo ID first'; end if;
  update public.jobs set status = 'Picked up', picked_up_at = now(), picked_up_by = auth.uid(), pickup_checklist = p_checklist where id = p_job;
end $$;
revoke execute on function public.mark_picked_up(uuid, jsonb) from public, anon;
grant execute on function public.mark_picked_up(uuid, jsonb) to authenticated;

-- Contact log: calls, emails, texts about the job (delays, approvals, ready for pickup). Office only.
create table public.job_contacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  at timestamptz not null default now(),
  by_user uuid references public.profiles(id) default auth.uid(),
  method text not null check (method in ('call', 'email', 'text', 'in person', 'voicemail')),
  direction text not null default 'out' check (direction in ('out', 'in')),
  summary text not null
);
create index job_contacts_job on public.job_contacts (job_id);
alter table public.job_contacts enable row level security;
create policy "admin reads contacts" on public.job_contacts for select to authenticated using (public.app_role() = 'admin');
create policy "admin adds contacts" on public.job_contacts for insert to authenticated with check (public.app_role() = 'admin');
revoke all on public.job_contacts from anon;
create trigger job_contacts_no_delete before delete on public.job_contacts for each row execute function public.block_change();
