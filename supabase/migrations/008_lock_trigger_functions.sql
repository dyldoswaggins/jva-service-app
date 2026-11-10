-- 008: trigger-only functions must not be callable through the API (security advisor)
revoke execute on function public.log_job_status() from public, anon, authenticated;
revoke execute on function public.touch_job() from public, anon, authenticated;
revoke execute on function public.block_change() from public, anon, authenticated;
revoke execute on function public.check_signup_domain() from public, anon, authenticated;
