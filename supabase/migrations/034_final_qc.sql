-- 034 (Dylan, 2026-11-12): final QC sign-off. The watchmaker presses "Final QC signed off" once a second watchmaker has checked
-- the watch. The invoice, Done and Ready for pickup wait for a passed timing analysis + this sign-off (in-store services).
alter table public.jobs add column if not exists qc_at timestamptz;
alter table public.jobs add column if not exists qc_by uuid references auth.users(id);
alter table public.jobs add column if not exists qc_checker text;   -- the second watchmaker who checked it
