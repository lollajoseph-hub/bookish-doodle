
-- send_thread_message and update_thread_scratchpad are SECURITY DEFINER and were
-- inserting/upserting directly without re-checking that the caller actually belongs
-- to the thread's client_id -- get_or_create_thread had this check, these two did not.
-- Add the same explicit authorization check to both.

create or replace function public.send_thread_message(
  p_thread_id uuid,
  p_body text,
  p_structured_type text default null
) returns public.thread_messages
language plpgsql
security definer
set search_path = 'public'
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
  v_title text;
  v_candidate_name text;
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

  if v_client_request_id is not null then
    select title, created_by into v_title, v_created_by from public.client_requests where id = v_client_request_id;
  end if;

  if v_candidate_match_id is not null then
    select candidate_id into v_candidate_id from public.candidate_matches where id = v_candidate_match_id;
    select recruiter_id into v_recruiter_id from public.candidates where id = v_candidate_id;
    select full_name into v_candidate_name from public.candidates where id = v_candidate_id;
  end if;

  if v_is_staff then
    insert into public.notifications (recipient_id, title, message, type)
    select cm.profile_id, 'New message',
      case v_kind
        when 'candidate' then coalesce(v_candidate_name, 'A candidate') || ': new message from ScaleSource'
        when 'request' then coalesce(v_title, 'Your request') || ': new message from ScaleSource'
        else 'New message from ScaleSource'
      end,
      'thread_message'
    from public.client_members cm where cm.client_id = v_client_id;
  else
    if v_kind = 'general' then
      insert into public.notifications (recipient_id, title, message, type)
      select p.id, 'New message', 'New message from client', 'thread_message'
      from public.profiles p where p.role in ('admin','recruiter') and p.is_active;
    else
      insert into public.notifications (recipient_id, title, message, type)
      select coalesce(v_recruiter_id, v_created_by), 'New message',
        case v_kind
          when 'candidate' then coalesce(v_candidate_name, 'A candidate') || ': new message from client'
          else coalesce(v_title, 'A request') || ': new message from client'
        end,
        'thread_message'
      where coalesce(v_recruiter_id, v_created_by) is not null;
    end if;
  end if;

  return v_result;
end;
$$;

create or replace function public.update_thread_scratchpad(
  p_thread_id uuid,
  p_content text
) returns public.thread_scratchpad
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_result public.thread_scratchpad;
  v_kind text;
  v_client_id uuid;
begin
  select kind, client_id into v_kind, v_client_id from public.threads where id = p_thread_id;
  if v_client_id is null then
    raise exception 'thread not found';
  end if;
  if v_kind <> 'request' then
    raise exception 'scratchpad is only available on request threads';
  end if;
  if not (
    public.is_staff()
    or v_client_id in (select public.client_ids_for_profile(auth.uid()))
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.thread_scratchpad (thread_id, content, updated_by, updated_at)
    values (p_thread_id, p_content, auth.uid(), now())
  on conflict (thread_id) do update
    set content = excluded.content, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$;
