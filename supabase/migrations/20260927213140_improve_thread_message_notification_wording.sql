
create or replace function public.send_thread_message(
  p_thread_id uuid,
  p_body text,
  p_structured_type text default null
)
returns public.thread_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_staff boolean := public.is_staff();
  v_result public.thread_messages;
  v_kind text;
  v_client_id uuid;
  v_client_request_id uuid;
  v_candidate_match_id uuid;
  v_candidate_id uuid;
  v_recruiter_id uuid;
  v_created_by uuid;
  v_created_by_is_staff boolean := false;
  v_title text;
  v_role_name text;
  v_role_label text;
  v_candidate_name text;
  v_client_name text;
  v_staff_message text;
  v_client_message text;
begin
  if btrim(coalesce(p_body,'')) = '' then
    raise exception 'message body cannot be empty';
  end if;

  select kind, client_id, client_request_id, candidate_match_id
    into v_kind, v_client_id, v_client_request_id, v_candidate_match_id
    from public.threads where id = p_thread_id;
  if v_client_id is null then
    raise exception 'thread not found';
  end if;

  if not (
    v_is_staff
    or v_client_id in (select public.client_ids_for_profile(auth.uid()))
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.thread_messages (thread_id, sender_id, sender_role, body, structured_type)
    values (p_thread_id, auth.uid(), case when v_is_staff then 'staff' else 'client' end, p_body, p_structured_type)
    returning * into v_result;

  select name into v_client_name from public.clients where id = v_client_id;
  v_client_name := coalesce(v_client_name, 'A client');

  if v_client_request_id is not null then
    select cr.title, cr.created_by, jr.name
      into v_title, v_created_by, v_role_name
      from public.client_requests cr
      left join public.job_roles jr on jr.id = cr.role_id
      where cr.id = v_client_request_id;
  end if;
  v_role_label := coalesce(v_title, v_role_name, 'their request');

  if v_candidate_match_id is not null then
    select candidate_id into v_candidate_id from public.candidate_matches where id = v_candidate_match_id;
    select recruiter_id into v_recruiter_id from public.candidates where id = v_candidate_id;
    select full_name into v_candidate_name from public.candidates where id = v_candidate_id;
  end if;

  -- created_by on client_requests can be the client's own profile (self-submitted
  -- requests), so it's only a valid notification target when it's actually staff.
  if v_created_by is not null then
    select true into v_created_by_is_staff
    from public.profiles
    where id = v_created_by and role in ('admin','recruiter') and is_active;
    v_created_by_is_staff := coalesce(v_created_by_is_staff, false);
  end if;

  v_staff_message := case v_kind
    when 'request' then 'ScaleSource sent a message about your ' || v_role_label || ' request'
    when 'candidate' then 'ScaleSource sent a message about ' || coalesce(v_candidate_name, 'a candidate')
    else 'ScaleSource sent a message'
  end;

  v_client_message := case v_kind
    when 'request' then v_client_name || ' has sent a message about their ' || v_role_label || ' role'
    when 'candidate' then v_client_name || ' has sent a message about ' || coalesce(v_candidate_name, 'a candidate')
    else v_client_name || ' has sent a message'
  end;

  if v_is_staff then
    insert into public.notifications (recipient_id, title, message, type)
    select cm.profile_id, 'New message', v_staff_message, 'thread_message'
    from public.client_members cm where cm.client_id = v_client_id;
  else
    if v_kind = 'general' then
      insert into public.notifications (recipient_id, title, message, type)
      select p.id, 'New message', v_client_message, 'thread_message'
      from public.profiles p where p.role in ('admin','recruiter') and p.is_active;
    elsif v_recruiter_id is not null then
      insert into public.notifications (recipient_id, title, message, type)
      values (v_recruiter_id, 'New message', v_client_message, 'thread_message');
    elsif v_created_by_is_staff then
      insert into public.notifications (recipient_id, title, message, type)
      values (v_created_by, 'New message', v_client_message, 'thread_message');
    else
      -- No assigned recruiter and no staff creator on record (e.g. a client-submitted
      -- request with nobody assigned yet): notify all active staff instead of no one.
      insert into public.notifications (recipient_id, title, message, type)
      select p.id, 'New message', v_client_message, 'thread_message'
      from public.profiles p where p.role in ('admin','recruiter') and p.is_active;
    end if;
  end if;

  return v_result;
end;
$$;
