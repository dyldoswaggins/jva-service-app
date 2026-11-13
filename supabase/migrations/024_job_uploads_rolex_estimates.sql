-- 024: per-job document uploads + estimates converted from Rolex Toronto's estimate (Dylan, 2026-11-12).
-- * Any file can be uploaded to a job (Rolex estimate / confirmation / invoice / delivery note, emails, scans, photos, other) with a label.
-- * For watches sent to Rolex, Rolex's estimate PDF is read in the browser (src/docs/rolexImport.js) and becomes JVA's estimate lines:
--   jobs.estimate_source = 'rolex', lines in jobs.extra_lines (source 'rolex'), Rolex details (number, requests, analysis, notes,
--   delivery weeks, shipping, invoiced prices) in jobs.rolex_estimate. The client's name on Rolex's PDF is never stored as data.

alter table public.job_docs drop constraint if exists job_docs_kind_check;
alter table public.job_docs add constraint job_docs_kind_check
  check (kind in ('receipt', 'vintage_fee', 'immediate_proceed', 'estimate', 'signed_estimate', 'confirmation', 'invoice', 'upload', 'other'));
alter table public.job_docs add column if not exists label text;   -- e.g. "Rolex estimate", "Email", "Signed estimate (scan)"
alter table public.job_docs add column if not exists note text;
alter table public.job_docs add column if not exists content_type text;

alter table public.jobs add column if not exists estimate_source text not null default 'jva' check (estimate_source in ('jva', 'rolex'));
alter table public.jobs add column if not exists rolex_estimate jsonb;

-- Optional lines that come from Rolex's estimate are Rolex's assessment: no JVA watch-analysis finding is required for them
create or replace function public._check_extra_lines() returns trigger
language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(new.extra_lines, '[]')) loop
    if x->>'kind' = 'optional' and coalesce(x->>'source', '') <> 'rolex'
       and not exists (select 1 from jsonb_array_elements(coalesce(old.extra_lines, '[]')) o
                       where o->>'id' = x->>'id' and o->>'kind' = 'optional'
                         and o->>'component' is not distinct from x->>'component' and o->>'term' is not distinct from x->>'term')
       and (x->>'component' is null or x->>'term' is null or not public._finding_confirmed(new.id, x->>'component', x->>'term')) then
      raise exception 'Optional work must be backed by the watch analysis ("%")', x->>'label';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public._check_extra_lines() from public, anon, authenticated;
