create or replace function public.client_propose_interview_time(p_match_id uuid, p_proposed_at timestamptz)
returns public.candidate_matches
language plpgsql
security definer
set search_path = public
as $$
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

  if not exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'interview_requested' then
    raise exception 'can only propose a new time for an interview that has been requested (current status: %)', v_status;
  end if;

  update public.candidate_matches
    set interview_proposed_at = p_proposed_at, interview_proposed_by = 'client'
    where id = p_match_id
    returning * into v_result;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'New interview time proposed',
         coalesce(v_client_name, 'The client') || ' proposed a new interview time for ' || coalesce(v_candidate_name, 'the candidate') || ': ' ||
           to_char(p_proposed_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC. Please confirm.', 'interview_time_proposed'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$$;

grant execute on function public.client_propose_interview_time(uuid, timestamptz) to authenticated;
