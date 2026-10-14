-- 1. complete_interview: name the candidate instead of a generic "this candidate"
create or replace function public.complete_interview(p_match_id uuid, p_notes text)
 returns public.candidate_matches
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
  v_candidate_name text;
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

  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Interview completed - notes ready',
         'Interview notes for ' || coalesce(v_candidate_name, 'the candidate') || ' are ready for you to review. You can now request to hire.', 'interview_completed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;

-- 2. request_to_hire: name the candidate and the client, not just "A candidate"
create or replace function public.request_to_hire(p_match_id uuid)
 returns public.placements
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_match public.candidate_matches;
  v_request public.client_requests;
  v_placement public.placements;
  v_candidate_name text;
  v_client_name text;
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

  select full_name into v_candidate_name from public.candidates where id = v_match.candidate_id;
  select name into v_client_name from public.clients where id = v_request.client_id;

  insert into public.placements (candidate_id, client_id, client_request_id, role_id, status)
  values (v_match.candidate_id, v_request.client_id, v_request.id, v_request.role_id, 'active')
  returning * into v_placement;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Candidate hired',
         coalesce(v_candidate_name, 'A candidate') || ' has been hired by ' || coalesce(v_client_name, 'a client') || ' -- a placement was created and billing setup begins now.', 'hire_requested'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_placement;
end;
$function$;

-- 3. confirm_interview: name the candidate in the client-facing confirmation
create or replace function public.confirm_interview(p_match_id uuid, p_notes text default null)
 returns public.candidate_matches
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_proposed timestamptz;
  v_result public.candidate_matches;
  v_candidate_name text;
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  select client_request_id, status, interview_proposed_at into v_request_id, v_status, v_proposed
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'interview_requested' then
    raise exception 'can only confirm an interview that has been requested (current status: %)', v_status;
  end if;
  if v_proposed is null then
    raise exception 'no proposed time to confirm';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  update public.candidate_matches
    set status = 'interview_confirmed', interview_scheduled_at = v_proposed, interview_notes = p_notes
    where id = p_match_id
    returning * into v_result;

  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Interview confirmed',
         'Your interview with ' || coalesce(v_candidate_name, 'the candidate') || ' was confirmed for ' || to_char(v_proposed at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC', 'interview_confirmed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;

-- 4. client_request_interview: this is the one Lola flagged -- name the client and the candidate
create or replace function public.client_request_interview(p_match_id uuid, p_proposed_at timestamptz)
 returns public.candidate_matches
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
  v_client_name text;
  v_candidate_name text;
begin
  if p_proposed_at is null then
    raise exception 'please propose a date and time for the interview';
  end if;
  if p_proposed_at <= now() then
    raise exception 'proposed interview time must be in the future';
  end if;

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
    set status = 'interview_requested', interview_proposed_at = p_proposed_at, interview_proposed_by = 'client'
    where id = p_match_id
    returning * into v_result;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Interview requested',
         coalesce(v_client_name, 'A client') || ' requested an interview with ' || coalesce(v_candidate_name, 'a candidate') ||
           ' and proposed ' || to_char(p_proposed_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC.', 'interview_requested'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$function$;

-- 5. admin_propose_interview_time: name the candidate in the client-facing notice
create or replace function public.admin_propose_interview_time(p_match_id uuid, p_proposed_at timestamptz, p_notes text default null)
 returns public.candidate_matches
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
  v_candidate_name text;
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;
  if p_proposed_at is null then
    raise exception 'please propose a date and time for the interview';
  end if;
  if p_proposed_at <= now() then
    raise exception 'proposed interview time must be in the future';
  end if;

  select client_request_id, status into v_request_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'interview_requested' then
    raise exception 'can only propose a new time for an interview that has been requested (current status: %)', v_status;
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  update public.candidate_matches
    set interview_proposed_at = p_proposed_at, interview_proposed_by = 'staff', interview_notes = coalesce(p_notes, interview_notes)
    where id = p_match_id
    returning * into v_result;

  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'New interview time proposed',
         'ScaleSource proposed a new interview time for ' || coalesce(v_candidate_name, 'the candidate') || ': ' ||
           to_char(p_proposed_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC. Please confirm.', 'interview_time_proposed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;

-- 6. client_confirm_interview_time: name the client and the candidate for admins
create or replace function public.client_confirm_interview_time(p_match_id uuid)
 returns public.candidate_matches
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_proposed timestamptz;
  v_proposed_by text;
  v_result public.candidate_matches;
  v_client_name text;
  v_candidate_name text;
begin
  select client_request_id, status, interview_proposed_at, interview_proposed_by
    into v_request_id, v_status, v_proposed, v_proposed_by
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  if not exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'interview_requested' then
    raise exception 'can only confirm an interview that has been requested (current status: %)', v_status;
  end if;
  if v_proposed is null then
    raise exception 'no proposed time to confirm';
  end if;
  if v_proposed_by <> 'staff' then
    raise exception 'waiting on ScaleSource to confirm your proposed time';
  end if;

  update public.candidate_matches
    set status = 'interview_confirmed', interview_scheduled_at = v_proposed
    where id = p_match_id
    returning * into v_result;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Interview time confirmed',
         coalesce(v_client_name, 'The client') || ' confirmed the interview time for ' || coalesce(v_candidate_name, 'the candidate') || ': ' ||
           to_char(v_proposed at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC.', 'interview_confirmed'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$function$;
