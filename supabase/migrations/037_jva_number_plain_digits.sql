-- 037: the JVA Number (job number) may be plain digits as JVA writes it, e.g. 114486 (Richard, 2026-11-27).
-- Still accepted: Edge repair format 124595-001 and provisional P<yymmdd>-<nn>. Rule only; no data changed.
alter table public.jobs drop constraint if exists jobs_edge_no_check;
alter table public.jobs add constraint jobs_edge_no_check
  check (edge_no ~ '^(\d{4,7}|\d{4,7}-\d{3}|P\d{6}-\d{2,3})$');
