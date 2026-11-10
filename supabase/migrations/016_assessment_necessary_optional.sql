-- 016: the watchmaker assesses Necessary and Optional work (Dylan, 2026-11-09).
-- Optional work must be backed by a confirmed finding in the watch analysis (job_conditions, state 'confirmed').
-- Applies to billable parts (job_parts.required = 'optional') and service lines (jobs.extra_lines, kind 'optional').

create or replace function public._finding_confirmed(p_job uuid, p_component text, p_term text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.job_conditions
                 where job_id = p_job and state = 'confirmed' and lower(component) = lower(p_component) and lower(term) = lower(p_term))
$$;
revoke execute on function public._finding_confirmed(uuid, text, text) from public, anon, authenticated;

-- add_job_part: Optional needs a confirmed finding
create or replace function public.add_job_part(p_job uuid, p_part text, p_qty integer, p_kind text, p_source text,
  p_component text default null, p_condition text default null, p_required text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare j public.jobs; p public.parts; v uuid;
begin
  if public.app_role() not in ('admin', 'watchmaker') then raise exception 'Only a watchmaker can add parts to a job'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be at least 1'; end if;
  if p_kind = 'billable' and (p_component is null or p_condition is null or p_required is null) then
    raise exception 'Billable parts need a component, a condition and Necessary / Optional';
  end if;
  if p_kind = 'billable' and p_required = 'optional' and not public._finding_confirmed(p_job, p_component, p_condition) then
    raise exception 'Optional work must be backed by the watch analysis: confirm or add "% %" first', p_component, lower(p_condition);
  end if;
  select * into j from public.jobs where id = p_job;
  select * into p from public.parts where id = p_part;
  if not found then raise exception 'Part not found'; end if;
  insert into public.job_parts (job_id, part_id, rmc, qty, kind, source, component, condition_term, required, retail, by_user)
  values (p_job, p.id, p.rmc, p_qty, p_kind, p_source, p_component, p_condition, p_required, p.retail, auth.uid())
  returning id into v;
  if j.stock_taken_at is not null then perform public._consume_line(v); end if;
  return v;
end $$;

-- Move a billable part between Necessary and Optional (before the client's decision)
create or replace function public.set_job_part_need(p_line uuid, p_required text, p_component text default null, p_term text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l public.job_parts; j public.jobs;
begin
  if public.app_role() not in ('admin', 'watchmaker') then raise exception 'Only a watchmaker can assess the work'; end if;
  if p_required not in ('required', 'optional') then raise exception 'Necessary or Optional'; end if;
  select * into l from public.job_parts where id = p_line for update;
  if not found or l.kind <> 'billable' or l.state <> 'active' then raise exception 'Not a billable part on this job'; end if;
  select * into j from public.jobs where id = l.job_id;
  if j.estimate_decision is not null then raise exception 'The client has already decided; change it on a new estimate'; end if;
  p_component := coalesce(p_component, l.component); p_term := coalesce(p_term, l.condition_term);
  if p_required = 'optional' and not public._finding_confirmed(l.job_id, p_component, p_term) then
    raise exception 'Optional work must be backed by the watch analysis: confirm or add "% %" first', p_component, lower(p_term);
  end if;
  update public.job_parts set required = p_required, component = p_component, condition_term = p_term where id = l.id;
end $$;
revoke execute on function public.set_job_part_need(uuid, text, text, text) from public, anon;
grant execute on function public.set_job_part_need(uuid, text, text, text) to authenticated;

-- Service lines: every new or changed Optional line must name a confirmed finding (component + term)
create or replace function public._check_extra_lines() returns trigger
language plpgsql security definer set search_path = public as $$
declare x jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(new.extra_lines, '[]')) loop
    if x->>'kind' = 'optional'
       and not exists (select 1 from jsonb_array_elements(coalesce(old.extra_lines, '[]')) o
                       where o->>'id' = x->>'id' and o->>'kind' = 'optional'
                         and o->>'component' is not distinct from x->>'component' and o->>'term' is not distinct from x->>'term')
       and (x->>'component' is null or x->>'term' is null or not public._finding_confirmed(new.id, x->>'component', x->>'term')) then
      raise exception 'Optional work must be backed by the watch analysis ("%")', x->>'label';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public._check_extra_lines() from public, anon, authenticated;
drop trigger if exists jobs_extra_lines_backed on public.jobs;
create trigger jobs_extra_lines_backed before update of extra_lines on public.jobs
  for each row when (new.extra_lines is distinct from old.extra_lines) execute function public._check_extra_lines();
