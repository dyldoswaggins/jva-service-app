-- 033: filling in an identifier that was empty (e.g. the bracelet reference added at watch validation) isn't a correction,
-- so it no longer flags the documents made before it. Only a value that changes from one value to another does.
create or replace function public._mark_ident_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if (nullif(old.serial, '') is not null and new.serial is distinct from old.serial)
  or (nullif(old.watch_ref, '') is not null and new.watch_ref is distinct from old.watch_ref)
  or (nullif(old.watch_name, '') is not null and new.watch_name is distinct from old.watch_name)
  or (nullif(old.bracelet_ref, '') is not null and new.bracelet_ref is distinct from old.bracelet_ref)
  or (nullif(old.bracelet, '') is not null and new.bracelet is distinct from old.bracelet)
  or (nullif(old.dial, '') is not null and new.dial is distinct from old.dial)
  or (nullif(old.dial_ref, '') is not null and new.dial_ref is distinct from old.dial_ref) then
    new.ident_changed_at := now();
  end if;
  return new;
end $$;
revoke execute on function public._mark_ident_change() from public, anon, authenticated;
