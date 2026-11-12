-- 022: fill-in spots on generated PDFs (Dylan, 2026-11-12). The estimate records where the client's ticks, name, date,
-- signature and remarks go, so online signing fills in the estimate itself (template unchanged) instead of adding a page.
alter table public.job_docs add column if not exists fields jsonb;
comment on column public.job_docs.fields is 'Fill-in spots on the PDF (page, x, y) for online signing: decision:<key>, refuse, undersigned, date, signature, remarks';
