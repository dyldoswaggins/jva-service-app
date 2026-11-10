-- 012: security advisor — fix search_path on calibre_family()
alter function public.calibre_family(text) set search_path = public;
