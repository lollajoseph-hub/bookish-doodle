
-- Loosen client_request_id so a thread can exist without one (general channel),
-- and add a direct client_id anchor so RLS works uniformly across all 3 kinds.
alter table public.threads alter column client_request_id drop not null;
alter table public.threads add column client_id uuid references public.clients(id) on delete cascade;

-- Backfill client_id for existing request-kind threads.
update public.threads t
  set client_id = cr.client_id
  from public.client_requests cr
  where t.client_request_id = cr.id and t.client_id is null;

alter table public.threads alter column client_id set not null;

alter table public.threads drop constraint threads_kind_check;
alter table public.threads add constraint threads_kind_check check (kind in ('request','candidate','general'));

alter table public.threads add constraint threads_kind_shape_check check (
  (kind = 'general' and client_request_id is null and candidate_match_id is null)
  or (kind = 'request' and client_request_id is not null and candidate_match_id is null)
  or (kind = 'candidate' and client_request_id is not null and candidate_match_id is not null)
);

create unique index threads_general_kind_uidx on public.threads (client_id) where kind = 'general';

-- Replace RLS to key off client_id directly (works for all 3 kinds uniformly).
drop policy threads_select on public.threads;
drop policy threads_insert on public.threads;

create policy threads_select on public.threads for select
  using (
    public.is_staff()
    or client_id in (select public.client_ids_for_profile(auth.uid()))
  );

create policy threads_insert on public.threads for insert
  with check (
    public.is_staff()
    or client_id in (select public.client_ids_for_profile(auth.uid()))
  );

drop policy thread_messages_select on public.thread_messages;
drop policy thread_messages_insert on public.thread_messages;

create policy thread_messages_select on public.thread_messages for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      where t.id = thread_messages.thread_id
        and t.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  );

create policy thread_messages_insert on public.thread_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      public.is_staff()
      or exists (
        select 1 from public.threads t
        where t.id = thread_messages.thread_id
          and t.client_id in (select public.client_ids_for_profile(auth.uid()))
      )
    )
  );

drop policy thread_scratchpad_select on public.thread_scratchpad;
drop policy thread_scratchpad_upsert on public.thread_scratchpad;
drop policy thread_scratchpad_update on public.thread_scratchpad;

create policy thread_scratchpad_select on public.thread_scratchpad for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      where t.id = thread_scratchpad.thread_id
        and t.kind = 'request'
        and t.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  );

create policy thread_scratchpad_upsert on public.thread_scratchpad for insert
  with check (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      where t.id = thread_scratchpad.thread_id
        and t.kind = 'request'
        and t.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  );

create policy thread_scratchpad_update on public.thread_scratchpad for update
  using (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      where t.id = thread_scratchpad.thread_id
        and t.kind = 'request'
        and t.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  );

-- Rewrite get_or_create_thread: infer kind from which id is supplied.
-- - candidate_match_id set -> 'candidate' (client_request_id/client_id derived from the match)
-- - client_request_id set (no candidate_match_id) -> 'request' (client_id derived)
-- - neither set -> 'general', requires p_client_id explicitly
drop function public.get_or_create_thread(uuid, uuid);

create or replace function public.get_or_create_thread(
  p_client_request_id uuid default null,
  p_candidate_match_id uuid default null,
  p_client_id uuid default null
) returns public.threads
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_kind text;
  v_client_request_id uuid := p_client_request_id;
  v_client_id uuid := p_client_id;
  v_result public.threads;
begin
  if p_candidate_match_id is not null then
    v_kind := 'candidate';
    select client_request_id into v_client_request_id from public.candidate_matches where id = p_candidate_match_id;
    if v_client_request_id is null then raise exception 'match not found'; end if;
    select client_id into v_client_id from public.client_requests where id = v_client_request_id;
  elsif p_client_request_id is not null then
    v_kind := 'request';
    select client_id into v_client_id from public.client_requests where id = p_client_request_id;
    if v_client_id is null then raise exception 'request not found'; end if;
  else
    v_kind := 'general';
    v_client_request_id := null;
    if v_client_id is null then raise exception 'client_id required for a general thread'; end if;
  end if;

  if not (
    public.is_staff()
    or v_client_id in (select public.client_ids_for_profile(auth.uid()))
  ) then
    raise exception 'not authorized';
  end if;

  if v_kind = 'general' then
    select * into v_result from public.threads where client_id = v_client_id and kind = 'general';
    if v_result.id is not null then return v_result; end if;
    insert into public.threads (client_id, kind) values (v_client_id, 'general') returning * into v_result;
  elsif v_kind = 'request' then
    select * into v_result from public.threads where client_request_id = v_client_request_id and kind = 'request';
    if v_result.id is not null then return v_result; end if;
    insert into public.threads (client_id, client_request_id, kind) values (v_client_id, v_client_request_id, 'request')
      returning * into v_result;
  else
    select * into v_result from public.threads where candidate_match_id = p_candidate_match_id and kind = 'candidate';
    if v_result.id is not null then return v_result; end if;
    insert into public.threads (client_id, client_request_id, candidate_match_id, kind)
      values (v_client_id, v_client_request_id, p_candidate_match_id, 'candidate')
      returning * into v_result;
  end if;
  return v_result;
end;
$$;

-- Rewrite send_thread_message: notification targeting per kind.
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
