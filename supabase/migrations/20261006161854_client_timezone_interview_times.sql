-- Formats an interview time for a client in the request's timezone (e.g. US/Eastern),
-- falling back to UTC when the request has no valid timezone.
create or replace function public.format_interview_time(p_at timestamptz, p_tz text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_tz is not null and exists (select 1 from pg_timezone_names where name = p_tz)
      then to_char(p_at at time zone p_tz, 'Mon DD, YYYY HH12:MI AM') || ' (' || p_tz || ')'
    else to_char(p_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC'
  end;
$$;
revoke execute on function public.format_interview_time(timestamptz, text) from public, anon;

create or replace function public.confirm_interview(p_match_id uuid, p_notes text default null::text)
 returns candidate_matches
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
  v_tz text;
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

  select client_id, timezone_requirement into v_client_id, v_tz from public.client_requests where id = v_request_id;

  update public.candidate_matches
    set status = 'interview_confirmed', interview_scheduled_at = v_proposed, interview_notes = p_notes
    where id = p_match_id
    returning * into v_result;

  select split_part(cd.full_name, ' ', 1) into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Interview confirmed',
         'Your interview with ' || coalesce(v_candidate_name, 'the candidate') || ' was confirmed for ' || public.format_interview_time(v_proposed, v_tz), 'interview_confirmed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;

create or replace function public.admin_propose_interview_time(p_match_id uuid, p_proposed_at timestamp with time zone, p_notes text default null::text)
 returns candidate_matches
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
  v_tz text;
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

  select client_id, timezone_requirement into v_client_id, v_tz from public.client_requests where id = v_request_id;

  update public.candidate_matches
    set interview_proposed_at = p_proposed_at, interview_proposed_by = 'staff', interview_notes = coalesce(p_notes, interview_notes)
    where id = p_match_id
    returning * into v_result;

  select split_part(cd.full_name, ' ', 1) into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'New interview time proposed',
         'ScaleSource proposed a new interview time for ' || coalesce(v_candidate_name, 'the candidate') || ': ' ||
           public.format_interview_time(p_proposed_at, v_tz) || '. Please confirm.', 'interview_time_proposed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;

create or replace function public.get_interview_calendar_payload(p_match uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'match_id', m.id,
    'status', m.status::text,
    'start', m.interview_scheduled_at,
    'duration_minutes', m.interview_duration_minutes,
    'timezone', coalesce(ca.timezone, 'UTC'),
    'client_timezone', case
      when exists (select 1 from pg_timezone_names where name = cr.timezone_requirement) then cr.timezone_requirement
      else null
    end,
    'mode', 'video',
    'client_event_id', m.client_event_id,
    'candidate_event_id', m.candidate_event_id,
    'candidate_name', ca.full_name,
    'candidate_email', ca.email,
    'client_name', cl.name,
    'client_email', (
      select p.email from public.client_members cm
      join public.profiles p on p.id = cm.profile_id
      where cm.client_id = cl.id and cm.is_primary
      limit 1
    ),
    'recruiter_email', pr.email,
    'role_title', coalesce(cr.title, jr.name)
  )
  from public.candidate_matches m
  join public.candidates ca on ca.id = m.candidate_id
  left join public.client_requests cr on cr.id = m.client_request_id
  left join public.clients cl on cl.id = cr.client_id
  left join public.job_roles jr on jr.id = cr.role_id
  left join public.profiles pr on pr.id = ca.recruiter_id
  where m.id = p_match;
$function$;
