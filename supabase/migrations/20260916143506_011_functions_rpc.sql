create or replace function public.candidate_primary_role(p_candidate_id uuid) returns text
language sql stable as $$
  select r.name from public.candidate_roles cr
  join public.job_roles r on r.id = cr.role_id
  where cr.candidate_id = p_candidate_id and cr.is_primary
  limit 1;
$$;

-- structured matching: role fit, then required skills, then years of experience, then AI rank score
create or replace function public.rank_and_match(p_request_id uuid, p_limit int default 4)
returns setof public.candidate_matches
language plpgsql security definer as $$
declare
  v_role_id uuid;
  v_years_min numeric;
begin
  if not public.is_staff() then
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
$$;

-- reject a match with a required reason tag; flags the request at 4 rejections
create or replace function public.reject_candidate_match(p_match_id uuid, p_reason public.rejection_reason, p_note text default null)
returns public.candidate_matches
language plpgsql security definer as $$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_new_count int;
  v_result public.candidate_matches;
begin
  select client_request_id into v_request_id from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  if not (public.is_staff() or exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  )) then
    raise exception 'not authorized';
  end if;

  update public.candidate_matches
    set status = 'rejected', rejection_reason = p_reason, rejection_reason_note = p_note, rejected_at = now()
    where id = p_match_id
    returning * into v_result;

  update public.client_requests
    set rejection_count = rejection_count + 1
    where id = v_request_id
    returning rejection_count into v_new_count;

  if v_new_count >= 4 then
    update public.client_requests set status = 'needs_attention' where id = v_request_id and status <> 'needs_attention';
    insert into public.notifications (recipient_id, title, message, type)
    select p.id, 'Request needs attention',
           'A client request has reached 4 rejections and needs a reshuffle.', 'request_needs_attention'
    from public.profiles p where p.role = 'admin' and p.is_active;
  end if;

  return v_result;
end;
$$;

-- admin reshuffle: fresh batch excluding already-matched/rejected candidates, resets the counter
create or replace function public.reshuffle_request(p_request_id uuid, p_limit int default 4)
returns setof public.candidate_matches
language plpgsql security definer as $$
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  update public.client_requests set rejection_count = 0, status = 'open' where id = p_request_id;

  return query select * from public.rank_and_match(p_request_id, p_limit);
end;
$$;

-- selecting a candidate: hire trigger point, creates the placement, billing starts here
create or replace function public.request_to_hire(p_match_id uuid)
returns public.placements
language plpgsql security definer as $$
declare
  v_match public.candidate_matches;
  v_request public.client_requests;
  v_placement public.placements;
begin
  select * into v_match from public.candidate_matches where id = p_match_id;
  if v_match is null then
    raise exception 'match not found';
  end if;

  select * into v_request from public.client_requests where id = v_match.client_request_id;

  if not (public.is_staff() or exists (
    select 1 from public.client_members where client_id = v_request.client_id and profile_id = auth.uid()
  )) then
    raise exception 'not authorized';
  end if;

  update public.candidate_matches set status = 'hired' where id = p_match_id;
  update public.candidates set status = 'placed' where id = v_match.candidate_id;

  insert into public.placements (candidate_id, client_id, client_request_id, role_id, status)
  values (v_match.candidate_id, v_request.client_id, v_request.id, v_request.role_id, 'active')
  returning * into v_placement;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Candidate hired',
         'A candidate has been selected and a placement created - billing setup begins now.', 'hire_requested'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_placement;
end;
$$;
