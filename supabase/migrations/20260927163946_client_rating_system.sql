-- #1: client rates the candidate after the interview is completed.
-- interview_completed_at is a new persistent marker: it's set once, at the moment
-- complete_interview() transitions a match into 'interview_completed', and is NEVER
-- cleared even if status later moves on to hired/offer_extended/rejected -- so rating
-- eligibility survives the rest of the pipeline instead of depending on current status.

alter table public.candidate_matches
  add column interview_completed_at timestamptz,
  add column client_rating smallint,
  add column client_rating_note text,
  add column client_rated_at timestamptz,
  add constraint candidate_matches_client_rating_range check (client_rating is null or (client_rating between 1 and 5));

comment on column public.candidate_matches.interview_completed_at is
  'Set once, when complete_interview() first fires. Persists regardless of later status changes (hired/rejected/etc) -- this is what gates client rating eligibility, not the current status column.';

create or replace function public.complete_interview(p_match_id uuid, p_notes text)
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
    set status = 'interview_completed', interview_notes = p_notes, interview_completed_at = now()
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

create or replace function public.client_rate_candidate(p_match_id uuid, p_rating smallint, p_note text default null)
returns candidate_matches
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_interview_done timestamptz;
  v_result public.candidate_matches;
  v_candidate_name text;
  v_recruiter_id uuid;
  v_client_name text;
begin
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'rating must be between 1 and 5';
  end if;

  select client_request_id, interview_completed_at into v_request_id, v_interview_done
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  if not (exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  )) then
    raise exception 'not authorized';
  end if;

  if v_interview_done is null then
    raise exception 'candidate has not been interviewed yet -- rating is only available after the interview is completed';
  end if;

  update public.candidate_matches
    set client_rating = p_rating, client_rating_note = nullif(btrim(coalesce(p_note, '')), ''), client_rated_at = now()
    where id = p_match_id
    returning * into v_result;

  select cd.full_name, cd.recruiter_id into v_candidate_name, v_recruiter_id
    from public.candidates cd where cd.id = v_result.candidate_id;
  select c.name into v_client_name from public.clients c where c.id = v_client_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id,
    'Client rated a candidate',
    coalesce(v_client_name, 'A client') || ' rated ' || coalesce(v_candidate_name, 'a candidate') ||
      ' ' || p_rating || '/5 after their interview' ||
      case when p_note is not null and btrim(p_note) <> '' then ': "' || btrim(p_note) || '"' else '' end,
    'candidate_rated'
  from public.profiles p
  where p.is_active and (p.role = 'admin' or p.id = v_recruiter_id);

  return v_result;
end;
$function$;
