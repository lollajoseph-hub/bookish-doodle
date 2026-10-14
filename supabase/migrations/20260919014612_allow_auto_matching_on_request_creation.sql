create or replace function public.rank_and_match(p_request_id uuid, p_limit integer default 4)
returns setof candidate_matches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role_id uuid;
  v_years_min numeric;
begin
  -- Staff can run/re-run matching on anything; a client can trigger it for
  -- their own request (so matching happens automatically the moment a
  -- request is created); the service role (edge functions) can always call
  -- it, e.g. right after the public wizard creates a brand-new request.
  if not (auth.role() = 'service_role' or public.is_staff() or public.client_owns_request(p_request_id)) then
    raise exception 'not authorized';
  end if;

  select role_id, years_experience_min into v_role_id, v_years_min
  from public.client_requests where id = p_request_id;

  if v_role_id is null then
    raise exception 'request not found';
  end if;

  return query
  insert into public.candidate_matches (client_request_id, candidate_id, match_score, match_reason, status)
  select
    p_request_id,
    c.id,
    (
      (case when cr.is_primary then 50 else 20 end)
      + coalesce((
          select count(*) * 5 from public.candidate_skills cs
          join public.client_request_skills rs on rs.skill_id = cs.skill_id and rs.is_required
          where cs.candidate_id = c.id and rs.request_id = p_request_id
        ), 0)
      + (case when c.years_experience >= coalesce(v_years_min, 0) then 10 else 0 end)
      + coalesce(ap.rank_score, 0)
    )::numeric as match_score,
    'Structured match: role fit, required skills, years of experience, AI rank score' as match_reason,
    'recommended'::public.match_status
  from public.candidates c
  join public.candidate_roles cr on cr.candidate_id = c.id and cr.role_id = v_role_id
  left join public.candidate_ai_profiles ap on ap.candidate_id = c.id
  where c.status = 'available'
    and not exists (
      select 1 from public.candidate_matches existing
      where existing.client_request_id = p_request_id and existing.candidate_id = c.id
    )
  order by (
      (case when cr.is_primary then 50 else 20 end)
      + coalesce((
          select count(*) * 5 from public.candidate_skills cs
          join public.client_request_skills rs on rs.skill_id = cs.skill_id and rs.is_required
          where cs.candidate_id = c.id and rs.request_id = p_request_id
        ), 0)
      + (case when c.years_experience >= coalesce(v_years_min, 0) then 10 else 0 end)
      + coalesce(ap.rank_score, 0)
  ) desc
  limit p_limit
  returning *;
end;
$function$;

grant execute on function public.rank_and_match(uuid, integer) to authenticated, service_role;
