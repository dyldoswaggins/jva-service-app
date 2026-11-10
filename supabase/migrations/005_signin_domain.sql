-- 005: email-code sign-in (Dylan, 2026-11-09, instead of Microsoft sign-in until IT is available).
-- Only J. Vair Anderson email addresses can create a login. Enforced in the database, not just the screen.
-- New logins start as View only (profiles.role default 'view'); Admin gives roles.
create or replace function public.check_signup_domain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(split_part(new.email, '@', 2)) <> 'jvairanderson.com' then
    raise exception 'Only J. Vair Anderson email addresses can sign in';
  end if;
  return new;
end $$;
revoke execute on function public.check_signup_domain() from public, anon, authenticated;
drop trigger if exists check_signup_domain on auth.users;
create trigger check_signup_domain before insert on auth.users
  for each row execute function public.check_signup_domain();
