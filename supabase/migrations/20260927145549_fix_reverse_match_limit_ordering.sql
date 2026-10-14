-- Fix: the previous version's LIMIT (v_limit * recipient_count) could cut off mid-request,
-- notifying some staff about a request but not others, because ordering happened on the
-- already-recipient-joined rows. Cap to the top N requests FIRST, then fan out to all
-- recipients for exactly those requests.
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
    return;
  end if;

  with scored as (
    select
      cr2.id as request_id,
      cr2.title,
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
  ),
  top_requests as (
    select * from scored
    where score >= v_min_score
    order by score desc
    limit v_limit
  )
  insert into public.notifications (recipient_id, title, message, type)
  select p.id,
    'New candidate could fill an open request',
    coalesce((select full_name from public.candidates where id = p_candidate_id), 'A new candidate')
      || ' looks like a fit for "' || coalesce(t.title, 'an open request') || '" (match score ' || t.score::int || ') -- review and add them if it''s a fit.',
    'reverse_match'
  from top_requests t
  join public.profiles p on p.role in ('admin', 'recruiter') and p.is_active;
end;
$function$;
