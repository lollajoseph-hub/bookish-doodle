
-- Columns needed to support interview scheduling/notes now, and real Google Meet
-- notes later (calendar-sync, not built yet) without a further schema change:
-- interview_notes is written by staff after the interview (typed summary today,
-- can be appended/overwritten with real Meet notes once that integration ships).
alter table public.candidate_matches
  add column if not exists interview_scheduled_at timestamptz,
  add column if not exists interview_notes text,
  add column if not exists meet_url text;

-- Toggle shortlist on/off. Client-or-staff callable. Only valid from the two
-- pre-interview states; once a candidate is in the interview pipeline or past
-- it, shortlisting is moot.
create or replace function public.client_shortlist_candidate(p_match_id uuid)
returns public.candidate_matches
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
begin
  select client_request_id, status into v_request_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  if not (public.is_staff() or exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  )) then
    raise exception 'not authorized';
  end if;

  if v_status not in ('recommended', 'shortlisted') then
    raise exception 'cannot change shortlist status once a match has moved past review (current status: %)', v_status;
  end if;

  update public.candidate_matches
    set status = case when v_status = 'shortlisted' then 'recommended' else 'shortlisted' end
    where id = p_match_id
    returning * into v_result;

  return v_result;
end;
$$;

-- Client requests an interview. Notifies admins so a recruiter can schedule it
-- (interviews happen outside the app today - Google Meet, manually coordinated -
-- calendar-sync automation is separate, not-yet-built work).
create or replace function public.client_request_interview(p_match_id uuid)
returns public.candidate_matches
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
begin
  select client_request_id, status into v_request_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  if not (public.is_staff() or exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  )) then
    raise exception 'not authorized';
  end if;

  if v_status not in ('recommended', 'shortlisted') then
    raise exception 'cannot request an interview from this state (current status: %)', v_status;
  end if;

  update public.candidate_matches
    set status = 'interview_requested'
    where id = p_match_id
    returning * into v_result;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Interview requested',
         'A client requested an interview for a presented candidate.', 'interview_requested'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$$;

-- Staff-only: confirms the interview (admin remains the gatekeeper on timing/
-- logistics, same as the existing rejection/hire authorization model). Notifies
-- every member of the client account so whoever is reviewing knows it's set.
create or replace function public.confirm_interview(p_match_id uuid, p_scheduled_at timestamptz, p_notes text default null)
returns public.candidate_matches
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  select client_request_id, status into v_request_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'interview_requested' then
    raise exception 'can only confirm an interview that has been requested (current status: %)', v_status;
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  update public.candidate_matches
    set status = 'interview_confirmed', interview_scheduled_at = p_scheduled_at, interview_notes = p_notes
    where id = p_match_id
    returning * into v_result;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Interview confirmed',
         'An interview has been confirmed for ' || to_char(p_scheduled_at, 'Mon DD, YYYY HH12:MI AM'), 'interview_confirmed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$$;

-- Staff-only: marks the interview done and records the notes the client will
-- see before deciding to hire. p_notes is a recruiter-typed summary today;
-- the same field can be appended/overwritten with real Google Meet notes once
-- the calendar-sync integration exists later - no schema change needed then.
create or replace function public.complete_interview(p_match_id uuid, p_notes text)
returns public.candidate_matches
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;
  if coalesce(btrim(p_notes), '') = '' then
    raise exception 'interview notes are required so the client has a basis to decide';
  end if;

  select client_request_id, status into v_request_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'interview_confirmed' then
    raise exception 'can only complete an interview that was confirmed (current status: %)', v_status;
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  update public.candidate_matches
    set status = 'interview_completed', interview_notes = p_notes
    where id = p_match_id
    returning * into v_result;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Interview completed - notes ready',
         'Interview notes are ready for you to review. You can now request to hire this candidate.', 'interview_completed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$$;

-- Gate hiring on the interview actually having happened - this was previously
-- missing entirely (request_to_hire had no status check at all).
create or replace function public.request_to_hire(p_match_id uuid)
returns public.placements
language plpgsql
security definer
set search_path to 'public'
as $$
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

  if v_match.status <> 'interview_completed' then
    raise exception 'candidate must complete an interview before you can request to hire (current status: %)', v_match.status;
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
