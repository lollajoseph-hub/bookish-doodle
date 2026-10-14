alter table public.candidate_matches
  add column if not exists rejected_by text check (rejected_by in ('client','staff'));

CREATE OR REPLACE FUNCTION public.reject_candidate_match(p_match_id uuid, p_reason rejection_reason, p_note text DEFAULT NULL::text)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_candidate_name text;
  v_recruiter_id uuid;
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
    set status = 'rejected', rejection_reason = p_reason, rejection_reason_note = p_note, rejected_at = now(), rejected_by = 'client'
    where id = p_match_id
    returning * into v_result;

  update public.client_requests
    set rejection_count = rejection_count + 1
    where id = v_request_id
    returning rejection_count into v_new_count;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name, cd.recruiter_id into v_candidate_name, v_recruiter_id
    from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id,
         'Candidate rejected',
         coalesce(v_client_name, 'A client') || ' rejected ' || coalesce(v_candidate_name, 'a candidate') ||
           ' -- ' || coalesce(replace(p_reason::text, '_', ' '), 'no reason given') ||
           case when p_note is not null and p_note <> '' then ': ' || p_note else '' end,
         'candidate_rejected'
  from public.profiles p
  where p.is_active and (p.role = 'admin' or p.id = v_recruiter_id);

  if v_new_count >= 4 then
    insert into public.notifications (recipient_id, title, message, type)
    select p.id, 'Request needs a rematch',
           coalesce(v_client_name, 'A client') || ' has rejected all 4 presented candidates for this request. Reshuffle it from Admin Tools.',
           'request_needs_rematch'
    from public.profiles p where p.role = 'admin' and p.is_active;
  end if;

  return v_result;
end;
$function$;
