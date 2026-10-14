-- Tracks who most recently proposed the current interview_proposed_at time,
-- so the client UI knows when there's a ScaleSource counter-offer awaiting
-- their acceptance (vs. their own request still awaiting ScaleSource).
alter table public.candidate_matches
  add column if not exists interview_proposed_by text check (interview_proposed_by in ('client','staff'));

update public.candidate_matches
  set interview_proposed_by = 'client'
  where status = 'interview_requested' and interview_proposed_at is not null and interview_proposed_by is null;

-- Client's initial proposal: mark it as client-proposed.
CREATE OR REPLACE FUNCTION public.client_request_interview(p_match_id uuid, p_proposed_at timestamp with time zone)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
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

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Interview requested',
         'A client requested an interview and proposed ' ||
           to_char(p_proposed_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC.', 'interview_requested'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$function$;

-- NEW: staff counter-proposes a different time (alongside the existing
-- confirm_interview "accept" and reject_candidate_match "reject" options).
CREATE OR REPLACE FUNCTION public.admin_propose_interview_time(p_match_id uuid, p_proposed_at timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
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

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'New interview time proposed',
         'ScaleSource proposed a new interview time: ' ||
           to_char(p_proposed_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC. Please confirm.', 'interview_time_proposed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;

-- NEW: client accepts a ScaleSource counter-proposed time. Only allowed when
-- staff was the last to propose -- a client can't self-confirm their own
-- original request, that still requires staff's confirm_interview.
CREATE OR REPLACE FUNCTION public.client_confirm_interview_time(p_match_id uuid)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_proposed timestamptz;
  v_proposed_by text;
  v_result public.candidate_matches;
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

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Interview time confirmed',
         'Client confirmed the proposed interview time: ' || to_char(v_proposed at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC.', 'interview_confirmed'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$function$;
