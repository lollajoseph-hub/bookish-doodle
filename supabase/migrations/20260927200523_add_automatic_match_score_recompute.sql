
-- Shared scoring function: identical formula to get_match_score_breakdown's computed_total,
-- factored out so triggers can call it directly without going through the staff-only RPC.
create or replace function public._compute_match_score(p_candidate_id uuid, p_request_id uuid)
returns numeric
language sql
security definer
set search_path = public
as $$
  select
    (case when coalesce(cr_role.is_primary, false) then 50 else 20 end)
    + (
        select coalesce(count(*), 0) * 5
        from public.candidate_skills cs
        join public.client_request_skills rs on rs.skill_id = cs.skill_id
        where cs.candidate_id = p_candidate_id
          and rs.request_id = p_request_id
          and rs.is_required
      )
    + (case when coalesce(cand.years_experience, 0) >= coalesce(req.years_experience_min, 0) then 10 else 0 end)
    + coalesce(ap.rank_score, 0)
  from public.client_requests req
  join public.candidates cand on cand.id = p_candidate_id
  left join public.candidate_roles cr_role on cr_role.candidate_id = p_candidate_id and cr_role.role_id = req.role_id
  left join public.candidate_ai_profiles ap on ap.candidate_id = p_candidate_id
  where req.id = p_request_id;
$$;

-- Recompute every existing match for one candidate (fires when their AI score, skills,
-- experience, or role assignment changes).
create or replace function public.tg_recompute_matches_for_candidate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_id uuid;
begin
  v_candidate_id := coalesce(new.candidate_id, old.candidate_id);
  if v_candidate_id is null then
    return coalesce(new, old);
  end if;

  update public.candidate_matches cm
     set match_score = public._compute_match_score(v_candidate_id, cm.client_request_id)
   where cm.candidate_id = v_candidate_id;

  return coalesce(new, old);
end;
$$;

-- Recompute every existing match for one request (fires when required skills or the
-- experience minimum on the request change).
create or replace function public.tg_recompute_matches_for_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  v_request_id := coalesce(new.request_id, old.request_id, new.id, old.id);
  if v_request_id is null then
    return coalesce(new, old);
  end if;

  update public.candidate_matches cm
     set match_score = public._compute_match_score(cm.candidate_id, v_request_id)
   where cm.client_request_id = v_request_id;

  return coalesce(new, old);
end;
$$;

-- candidate_ai_profiles.rank_score changes (resume reprocessed) -> recompute that candidate's matches
drop trigger if exists trg_recompute_on_ai_profile on public.candidate_ai_profiles;
create trigger trg_recompute_on_ai_profile
  after insert or update of rank_score on public.candidate_ai_profiles
  for each row execute function public.tg_recompute_matches_for_candidate();

-- candidate_skills changes (skill added/removed) -> recompute that candidate's matches
drop trigger if exists trg_recompute_on_candidate_skills on public.candidate_skills;
create trigger trg_recompute_on_candidate_skills
  after insert or update or delete on public.candidate_skills
  for each row execute function public.tg_recompute_matches_for_candidate();

-- candidates.years_experience changes -> recompute that candidate's matches
drop trigger if exists trg_recompute_on_candidate_years on public.candidates;
create trigger trg_recompute_on_candidate_years
  after update of years_experience on public.candidates
  for each row
  when (old.years_experience is distinct from new.years_experience)
  execute function public.tg_recompute_matches_for_candidate();

-- candidate_roles changes (role/primary flag added/changed/removed) -> recompute that candidate's matches
drop trigger if exists trg_recompute_on_candidate_roles on public.candidate_roles;
create trigger trg_recompute_on_candidate_roles
  after insert or update or delete on public.candidate_roles
  for each row execute function public.tg_recompute_matches_for_candidate();

-- client_request_skills changes (required skill added/removed on a request) -> recompute that request's matches
drop trigger if exists trg_recompute_on_request_skills on public.client_request_skills;
create trigger trg_recompute_on_request_skills
  after insert or update or delete on public.client_request_skills
  for each row execute function public.tg_recompute_matches_for_request();

-- client_requests.years_experience_min changes -> recompute that request's matches
drop trigger if exists trg_recompute_on_request_years on public.client_requests;
create trigger trg_recompute_on_request_years
  after update of years_experience_min on public.client_requests
  for each row
  when (old.years_experience_min is distinct from new.years_experience_min)
  execute function public.tg_recompute_matches_for_request();

-- One-time backfill: bring every existing match's stored score in line with today's data right now.
update public.candidate_matches cm
   set match_score = public._compute_match_score(cm.candidate_id, cm.client_request_id)
 where public._compute_match_score(cm.candidate_id, cm.client_request_id) is not null;
