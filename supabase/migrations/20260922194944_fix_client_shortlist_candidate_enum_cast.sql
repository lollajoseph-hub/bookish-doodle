create or replace function public.client_shortlist_candidate(p_match_id uuid)
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
    set status = (case when v_status = 'shortlisted' then 'recommended' else 'shortlisted' end)::public.match_status
    where id = p_match_id
    returning * into v_result;

  return v_result;
end;
$function$;
