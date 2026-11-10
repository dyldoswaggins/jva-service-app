-- 018: Rolex Immediate Proceed form filed at Vintage intake with the Vintage Analysis Fee form (Workflow v2.1, Dylan 2026-11-10).
alter table public.job_docs drop constraint if exists job_docs_kind_check;
alter table public.job_docs add constraint job_docs_kind_check check (kind in ('receipt', 'vintage_fee', 'immediate_proceed', 'estimate', 'confirmation', 'invoice', 'other'));
