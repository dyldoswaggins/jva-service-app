-- 023: Phase 1 of the scanned-files plan (Dylan, 2026-11-12).
-- * CTR prices = Rolex's official complete-service offers, exactly as listed on Rolex's Immediate Proceed form
--   (they were never set: all null). Polishing with a complete service = Rolex's $210 (form + "SAV ALL - post audit" workbook).
-- * Immediate Proceed total: set price + polish; the form's 15 % allowance can be included (Settings), off by default.
-- * Watch identifiers seen on JVA's Service Overview / Rolex documents that the app didn't store.
-- * ident_changed_at: when serial / model / bracelet / dial change, documents made before then are flagged on the job.

update public.app_settings set value = '{"CO - MODERN $840": 840, "CO - MODERN $980": 980, "CO - MODERN $1,190": 1190, "CO - CLASSIC $1,250": 1250, "CO - CLASSIC $1,530": 1530, "CO - CLASSIC $1,810": 1810}', updated_at = now()
where key = 'ctr_prices' and not exists (select 1 from jsonb_each(value) e where e.value <> 'null'::jsonb);
update public.app_settings set value = (select jsonb_object_agg(k, 210) from jsonb_object_keys(value) k), updated_at = now()
where key = 'polish_prices' and not exists (select 1 from jsonb_each(value) e where e.value <> 'null'::jsonb);
insert into public.app_settings (key, value) values ('immediate_proceed', '{"include_allowance": false}') on conflict (key) do nothing;

alter table public.jobs add column if not exists movement_serial text;   -- e.g. 32844250 (movement # = calibre part, e.g. 18-3135)
alter table public.jobs add column if not exists bracelet_links integer; -- e.g. 20 links including end pieces
alter table public.jobs add column if not exists clasp_code text;        -- bracelet manufacturing / clasp code, e.g. DE8
alter table public.jobs add column if not exists rolex_service_ref text; -- Rolex Toronto service # / folder (CAN0000348645)
alter table public.jobs add column if not exists ident_changed_at timestamptz;

create or replace function public._mark_ident_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.serial, new.watch_ref, new.watch_name, new.bracelet_ref, new.bracelet, new.dial, new.dial_ref)
     is distinct from (old.serial, old.watch_ref, old.watch_name, old.bracelet_ref, old.bracelet, old.dial, old.dial_ref) then
    new.ident_changed_at := now();
  end if;
  return new;
end $$;
revoke execute on function public._mark_ident_change() from public, anon, authenticated;
drop trigger if exists jobs_ident_change on public.jobs;
create trigger jobs_ident_change before update on public.jobs for each row execute function public._mark_ident_change();
