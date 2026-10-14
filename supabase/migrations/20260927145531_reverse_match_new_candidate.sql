-- Reverse matching: when a NEW candidate is added (i.e. gets their first role assignment,
-- which completes the "add candidate" flow), scan open, non-staff-curated client_requests
-- for a fit and alert staff. This does NOT auto-add the candidate to candidate_matches --
-- staff still reviews and runs the existing rank_and_match/add flow themselves.
--
-- Trigger point: AFTER INSERT on candidate_roles, gated to fire only when this is the
-- candidate's FIRST role row ever (count = 1 after insert). A candidate getting a second/
-- secondary role later does NOT re-fire this -- it's a one-time "new candidate" event,
-- not a "role changed" event (process-resume's existing re-fire-on-role-change trigger is
-- a different concern: keeping the AI profile in sync, not alerting about new matches).

create or replace function public.reverse_match_new_candidate(p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_years_experience numeric;
  v_min_score numeric := 40;
  v_limit int := 5;
begin
  if not (auth.role() = 'service_role' or public.is_staff()) then
    raise exception 'not authorized';
  end if;

  select years_experience into v_years_experience
  from public.candidates where id = p_candidate_id;

  if v_years_experience is null then
    -- candidate row not found (or somehow missing) -- nothing to match.
    return;
  end if;

  with scored as (
    select
      cr2.id as request_id,
      cr2.title,
      cr2.client_id,
      cr2.created_by,
      (
        (case when cand_role.is_primary then 50 else 20 end)
        + coalesce((
            select count(*) * 5 from public.candidate_skills cs
            join public.client_request_skills rs on rs.skill_id = cs.skill_id and rs.is_required
            where cs.candidate_id = p_candidate_id and rs.request_id = cr2.id
          ), 0)
        + (case when v_years_experience >= coalesce(cr2.years_experience_min, 0) then 10 else 0 end)
        + coalesce(ap.rank_score, 0)
      )::numeric as score
    from public.client_requests cr2
    join public.candidate_roles cand_role
      on cand_role.role_id = cr2.role_id and cand_role.candidate_id = p_candidate_id
    left join public.candidate_ai_profiles ap on ap.candidate_id = p_candidate_id
    where cr2.status in ('open', 'needs_attention')
      and cr2.source <> 'staff_curated'
      and not exists (
        select 1 from public.candidate_matches m
        where m.client_request_id = cr2.id and m.candidate_id = p_candidate_id
      )
  )
  insert into public.notifications (recipient_id, title, message, type)
  select p.id,
    'New candidate could fill an open request',
    coalesce((select full_name from public.candidates where id = p_candidate_id), 'A new candidate')
      || ' looks like a fit for "' || coalesce(s.title, 'an open request') || '" (match score ' || s.score::int || ') -- review and add them if it''s a fit.',
    'reverse_match'
  from scored s
  join public.profiles p on p.role in ('admin', 'recruiter') and p.is_active
  where s.score >= v_min_score
  order by s.score desc
  limit v_limit * (select count(*) from public.profiles where role in ('admin','recruiter') and is_active);
end;
$function$;

create or replace function public.handle_candidate_role_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role_count int;
begin
  select count(*) into v_role_count from public.candidate_roles where candidate_id = new.candidate_id;
  if v_role_count = 1 then
    perform public.reverse_match_new_candidate(new.candidate_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_reverse_match_new_candidate on public.candidate_roles;
create trigger trg_reverse_match_new_candidate
  after insert on public.candidate_roles
  for each row execute function public.handle_candidate_role_insert();
