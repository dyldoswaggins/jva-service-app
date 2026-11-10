-- 002: Supabase security advisor fixes
alter function public.block_change() set search_path = public;
revoke execute on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

-- Note: data import (2026-11-09) used a temporary function public.tmp_import_rows(token, table, rows)
-- with a one-time token in private.import_token; both were dropped right after.
-- To re-import at cut-over, recreate them (see scripts/import-prototype.mjs), run, then drop again.
