-- 020: staff_roles also carries the old Parts-prototype user id, re-linked automatically when an account is (re)created
-- (Dylan re-creating his account with a password, 2026-11-12).
alter table public.staff_roles add column if not exists legacy_id text;
update public.staff_roles set legacy_id = 'u_5FbqzfZ79582E4oxzrqCvw' where email = 'dylan@jvairanderson.com';

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.staff_roles;
begin
  select * into s from public.staff_roles where email = lower(new.email);
  insert into public.profiles (id, email, name, role, legacy_id)
  values (new.id, new.email,
          coalesce(s.name, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          coalesce(s.role, 'view'),
          case when s.legacy_id is not null and not exists (select 1 from public.profiles where legacy_id = s.legacy_id) then s.legacy_id end)
  on conflict (id) do nothing;
  return new;
end $$;
