
-- Client proposes the interview date/time when requesting; staff/admin confirms that
-- proposed time (accepts it) rather than staff picking a time unilaterally.
alter table public.candidate_matches
  add column if not exists interview_proposed_at timestamptz;

drop function if exists public.client_request_interview(uuid);
drop function if exists public.confirm_interview(uuid, timestamptz, text);

create or replace function public.client_request_interview(p_match_id uuid, p_proposed_at timestamptz)
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
    set status = 'interview_requested', interview_proposed_at = p_proposed_at
    where id = p_match_id
    returning * into v_result;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Interview requested',
         'A client requested an interview and proposed ' ||
           to_char(p_proposed_at, 'Mon DD, YYYY HH12:MI AM') || '.', 'interview_requested'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$function$;

grant execute on function public.client_request_interview(uuid, timestamptz) to authenticated, service_role;

create or replace function public.confirm_interview(p_match_id uuid, p_notes text default null)
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

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Interview confirmed',
         'Your proposed interview time was confirmed for ' || to_char(v_proposed, 'Mon DD, YYYY HH12:MI AM'), 'interview_confirmed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;

grant execute on function public.confirm_interview(uuid, text) to authenticated, service_role;
