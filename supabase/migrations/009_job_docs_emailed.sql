-- 009: record when a job document was emailed (Edge Function send-doc, via the parts Gmail account)
alter table public.job_docs add column if not exists emailed_at timestamptz;
alter table public.job_docs add column if not exists emailed_to text;
alter table public.job_docs add column if not exists emailed_by uuid references public.profiles(id);
