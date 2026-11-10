-- 019: staff list with roles (Dylan, 2026-11-10). Accounts are created by Dylan in Supabase (Authentication → Users,
-- email + password); the role and name here are applied automatically when the account is created. No passwords stored here.
-- Mapping: Watchmaker → watchmaker; Service Manager → admin (estimates, invoices, inbox, settings); Admin → admin;
-- Rolex Professional (sales associate) → sales (intake page only).

create table public.staff_roles (
  email text primary key check (email = lower(email) and email like '%@jvairanderson.com'),
  role text not null check (role in ('admin', 'watchmaker', 'sales', 'view')),
  name text,
  title text,
  updated_at timestamptz not null default now()
);
alter table public.staff_roles enable row level security;
create policy "admin reads staff" on public.staff_roles for select to authenticated using (public.app_role() = 'admin');
create policy "admin edits staff" on public.staff_roles for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
revoke all on public.staff_roles from anon;

insert into public.staff_roles (email, role, name, title) values
  ('emmanuel@jvairanderson.com', 'watchmaker', 'Emmanuel', 'Watchmaker'),
  ('jared@jvairanderson.com',    'watchmaker', 'Jared',    'Watchmaker'),
  ('richard@jvairanderson.com',  'admin',      'Richard',  'Service Manager'),
  ('dylan@jvairanderson.com',    'admin',      'Dylan',    'Admin'),
  ('paul@jvairanderson.com',     'sales',      'Paul',     'Rolex Professional'),
  ('eric@jvairanderson.com',     'sales',      'Eric',     'Rolex Professional'),
  ('peiwen@jvairanderson.com',   'sales',      'Peiwen',   'Rolex Professional'),
  ('brad@jvairanderson.com',     'sales',      'Brad',     'Rolex Professional')
on conflict (email) do update set role = excluded.role, name = excluded.name, title = excluded.title, updated_at = now();

-- New account → profile with the role from the staff list (else View only)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.staff_roles;
begin
  select * into s from public.staff_roles where email = lower(new.email);
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email,
          coalesce(s.name, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          coalesce(s.role, 'view'))
  on conflict (id) do nothing;
  return new;
end $$;

-- Keep existing profiles in step when the staff list changes
create or replace function public.apply_staff_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = new.role, name = coalesce(new.name, name) where lower(email) = new.email;
  return new;
end $$;
revoke execute on function public.apply_staff_role() from public, anon, authenticated;
create trigger staff_roles_apply after insert or update on public.staff_roles for each row execute function public.apply_staff_role();

-- Profiles that already exist (Dylan)
update public.profiles p set role = s.role, name = coalesce(p.name, s.name) from public.staff_roles s where lower(p.email) = s.email;
-- Dylan's history in the Parts prototype
update public.profiles set legacy_id = 'u_5FbqzfZ79582E4oxzrqCvw' where lower(email) = 'dylan@jvairanderson.com' and legacy_id is null;
