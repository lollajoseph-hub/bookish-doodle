create or replace function public.send_thread_message(p_thread_id uuid, p_body text, p_structured_type text default null::text)
 returns thread_messages
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_title text;
  v_candidate_name text;
  v_client_name text;
  v_kind_label text;
  v_context text;
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
    select title, created_by into v_title, v_created_by from public.client_requests where id = v_client_request_id;
  end if;

  if v_candidate_match_id is not null then
    select candidate_id into v_candidate_id from public.candidate_matches where id = v_candidate_match_id;
    select recruiter_id into v_recruiter_id from public.candidates where id = v_candidate_id;
    select full_name into v_candidate_name from public.candidates where id = v_candidate_id;
  end if;

  v_kind_label := case v_kind when 'candidate' then 'candidate' when 'request' then 'request' else 'general' end;
  v_context := case v_kind
    when 'candidate' then coalesce(v_candidate_name, 'a candidate')
    when 'request' then coalesce(v_title, 'a request')
    else null
  end;

  v_staff_message := 'New ' || v_kind_label || ' message from ScaleSource' ||
    case when v_context is not null then ' — ' || v_context else '' end;
  v_client_message := 'New ' || v_kind_label || ' message from ' || v_client_name ||
    case when v_context is not null then ' — ' || v_context else '' end;

  if v_is_staff then
    insert into public.notifications (recipient_id, title, message, type)
    select cm.profile_id, 'New message', v_staff_message, 'thread_message'
    from public.client_members cm where cm.client_id = v_client_id;
  else
    if v_kind = 'general' then
      insert into public.notifications (recipient_id, title, message, type)
      select p.id, 'New message', v_client_message, 'thread_message'
      from public.profiles p where p.role in ('admin','recruiter') and p.is_active;
    else
      insert into public.notifications (recipient_id, title, message, type)
      select coalesce(v_recruiter_id, v_created_by), 'New message', v_client_message, 'thread_message'
      where coalesce(v_recruiter_id, v_created_by) is not null;
    end if;
  end if;

  return v_result;
end;
$function$;
