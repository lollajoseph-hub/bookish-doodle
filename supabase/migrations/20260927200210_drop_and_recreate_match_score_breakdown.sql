drop function if exists public.get_match_score_breakdown(uuid);

create function public.get_match_score_breakdown(p_match_id uuid)
returns table (
  match_id uuid,
  match_created_at timestamptz,
  role_name text,
  is_primary_role boolean,
  role_fit_points int,
  matched_required_skills text[],
  missing_required_skills text[],
  skills_points int,
  candidate_years_experience numeric,
  required_years_experience_min numeric,
  experience_points int,
  ai_rank_score numeric,
  computed_total numeric,
  stored_match_score numeric,
  is_stale boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  return query
  select
    cm.id as match_id,
    cm.created_at as match_created_at,
    jr.name as role_name,
    cr_role.is_primary as is_primary_role,
    (case when coalesce(cr_role.is_primary, false) then 50 else 20 end)::int as role_fit_points,
    coalesce(matched.names, array[]::text[]) as matched_required_skills,
    coalesce(missing.names, array[]::text[]) as missing_required_skills,
    (coalesce(matched.cnt, 0) * 5)::int as skills_points,
    cand.years_experience as candidate_years_experience,
    req.years_experience_min as required_years_experience_min,
    (case when coalesce(cand.years_experience, 0) >= coalesce(req.years_experience_min, 0) then 10 else 0 end)::int as experience_points,
    coalesce(ap.rank_score, 0) as ai_rank_score,
    (
      (case when coalesce(cr_role.is_primary, false) then 50 else 20 end)
      + (coalesce(matched.cnt, 0) * 5)
      + (case when coalesce(cand.years_experience, 0) >= coalesce(req.years_experience_min, 0) then 10 else 0 end)
      + coalesce(ap.rank_score, 0)
    )::numeric as computed_total,
    cm.match_score as stored_match_score,
    (
      (
        (case when coalesce(cr_role.is_primary, false) then 50 else 20 end)
        + (coalesce(matched.cnt, 0) * 5)
        + (case when coalesce(cand.years_experience, 0) >= coalesce(req.years_experience_min, 0) then 10 else 0 end)
        + coalesce(ap.rank_score, 0)
      )::numeric <> cm.match_score
    ) as is_stale
  from public.candidate_matches cm
  join public.client_requests req on req.id = cm.client_request_id
  join public.candidates cand on cand.id = cm.candidate_id
  left join public.candidate_roles cr_role on cr_role.candidate_id = cand.id and cr_role.role_id = req.role_id
  left join public.job_roles jr on jr.id = req.role_id
  left join public.candidate_ai_profiles ap on ap.candidate_id = cand.id
  left join lateral (
    select count(*) as cnt, array_agg(s.name) as names
    from public.candidate_skills cs
    join public.client_request_skills rs on rs.skill_id = cs.skill_id
    join public.skills s on s.id = cs.skill_id
    where cs.candidate_id = cand.id
      and rs.request_id = req.id
      and rs.is_required
  ) matched on true
  left join lateral (
    select array_agg(s.name) as names
    from public.client_request_skills rs
    join public.skills s on s.id = rs.skill_id
    where rs.request_id = req.id
      and rs.is_required
      and not exists (
        select 1 from public.candidate_skills cs
        where cs.candidate_id = cand.id and cs.skill_id = rs.skill_id
      )
  ) missing on true
  where cm.id = p_match_id;
end;
$$;

revoke all on function public.get_match_score_breakdown(uuid) from public;
grant execute on function public.get_match_score_breakdown(uuid) to authenticated;
