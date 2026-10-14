-- AUDIT FIX: the Dashboard app's staff-side reject flow was bypassing this RPC entirely
-- (doing a raw table update instead) specifically because this RPC hardcoded rejected_by='client',
-- which would have mislabeled staff rejections. Adding a p_rejected_by param (default 'client' so
-- the Candidate Pool app's existing call site needs zero changes) so staff can now go through this
-- RPC too and get the rejection_count increment + notifications that were previously silently skipped.
create or replace function public.reject_candidate_match(
  p_match_id uuid,
  p_reason public.rejection_reason,
  p_note text default null,
  p_rejected_by text default 'client'
)
 returns public.candidate_matches
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_candidate_name text;
  v_recruiter_id uuid;
  v_new_count int;
  v_by text;
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

  -- only staff can actually record a staff rejection; anyone else (i.e. a client) is
  -- forced to 'client' regardless of what they pass, so this can't be spoofed.
  v_by := case when p_rejected_by = 'staff' and public.is_staff() then 'staff' else 'client' end;

  update public.candidate_matches
    set status = 'rejected', rejection_reason = p_reason, rejection_reason_note = p_note, rejected_at = now(), rejected_by = v_by
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
