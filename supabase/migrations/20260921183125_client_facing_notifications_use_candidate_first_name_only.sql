-- Client-facing notifications should only ever show the candidate's first name.
-- Staff/admin-facing notifications (client_request_interview, client_confirm_interview_time,
-- request_to_hire, reject_candidate_match) keep the full name -- this restriction is only
-- for what clients themselves see.

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

  select split_part(cd.full_name, ' ', 1) into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Interview completed - notes ready',
         'Interview notes for ' || coalesce(v_candidate_name, 'the candidate') || ' are ready for you to review. You can now request to hire.', 'interview_completed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;

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

  select split_part(cd.full_name, ' ', 1) into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Interview confirmed',
         'Your interview with ' || coalesce(v_candidate_name, 'the candidate') || ' was confirmed for ' || to_char(v_proposed at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC', 'interview_confirmed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;

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

  select split_part(cd.full_name, ' ', 1) into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'New interview time proposed',
         'ScaleSource proposed a new interview time for ' || coalesce(v_candidate_name, 'the candidate') || ': ' ||
           to_char(p_proposed_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC. Please confirm.', 'interview_time_proposed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;
