-- 026: every part added beyond the automatic CTR kit needs a reason (Dylan, 2026-11-12). The reasons are printed on the client documents
-- under "Watch analysis", after the conditions.
alter table public.job_parts add column if not exists reason text;

drop function if exists public.add_job_part(uuid, text, integer, text, text, text, text, text);
create or replace function public.add_job_part(p_job uuid, p_part text, p_qty integer, p_kind text, p_source text,
  p_component text default null, p_condition text default null, p_required text default null, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare j public.jobs; p public.parts; v uuid;
begin
  if public.app_role() not in ('admin', 'watchmaker') then raise exception 'Only a watchmaker can add parts to a job'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
  if p_kind <> 'ctr_kit' and length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Give the reason this part is needed (shown on the client documents)'; end if;
  if p_kind = 'billable' and (p_component is null or p_condition is null or p_required is null) then
    raise exception 'Billable parts need a component, a condition and Necessary / Optional';
  end if;
  if p_kind = 'billable' and p_required = 'optional' and not public._finding_confirmed(p_job, p_component, p_condition) then
    raise exception 'Optional work must be backed by the watch analysis: confirm or add "% %" first', p_component, lower(p_condition);
  end if;
  select * into j from public.jobs where id = p_job;
  select * into p from public.parts where id = p_part;
  if not found then raise exception 'Part not found'; end if;
  insert into public.job_parts (job_id, part_id, rmc, qty, kind, source, component, condition_term, required, retail, by_user, reason)
  values (p_job, p.id, p.rmc, p_qty, p_kind, p_source, p_component, p_condition, p_required, p.retail, auth.uid(), nullif(trim(p_reason), ''))
  returning id into v;
  if j.stock_taken_at is not null then perform public._consume_line(v); end if;
  return v;
end $$;
revoke execute on function public.add_job_part(uuid, text, integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.add_job_part(uuid, text, integer, text, text, text, text, text, text) to authenticated;
