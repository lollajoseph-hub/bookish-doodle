
-- Threads: anchored to a client_request, optionally scoped further to a specific candidate match.
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  client_request_id uuid not null references public.client_requests(id) on delete cascade,
  candidate_match_id uuid references public.candidate_matches(id) on delete cascade,
  kind text not null check (kind in ('request','candidate')),
  created_at timestamptz not null default now()
);

-- One request-level thread per request; one candidate-level thread per match.
create unique index threads_request_kind_uidx on public.threads (client_request_id) where kind = 'request';
create unique index threads_candidate_kind_uidx on public.threads (candidate_match_id) where kind = 'candidate';
create index threads_client_request_idx on public.threads (client_request_id);

alter table public.threads enable row level security;

create policy threads_select on public.threads for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.client_requests cr
      where cr.id = threads.client_request_id
        and cr.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  );

create policy threads_insert on public.threads for insert
  with check (
    public.is_staff()
    or exists (
      select 1 from public.client_requests cr
      where cr.id = threads.client_request_id
        and cr.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  );

-- Messages within a thread.
create table public.thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  sender_role text not null check (sender_role in ('staff','client')),
  body text not null check (btrim(body) <> ''),
  structured_type text check (structured_type in ('reschedule_request','call_me_asap','send_portfolio')),
  created_at timestamptz not null default now()
);

create index thread_messages_thread_idx on public.thread_messages (thread_id, created_at);

alter table public.thread_messages enable row level security;

create policy thread_messages_select on public.thread_messages for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      join public.client_requests cr on cr.id = t.client_request_id
      where t.id = thread_messages.thread_id
        and cr.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  );

create policy thread_messages_insert on public.thread_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      public.is_staff()
      or exists (
        select 1 from public.threads t
        join public.client_requests cr on cr.id = t.client_request_id
        where t.id = thread_messages.thread_id
          and cr.client_id in (select public.client_ids_for_profile(auth.uid()))
      )
    )
  );

-- Shared scratchpad, one row per thread. Recruiter+client only for now (no candidate-facing surface yet).
create table public.thread_scratchpad (
  thread_id uuid primary key references public.threads(id) on delete cascade,
  content text not null default '',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.thread_scratchpad enable row level security;

create policy thread_scratchpad_select on public.thread_scratchpad for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      join public.client_requests cr on cr.id = t.client_request_id
      where t.id = thread_scratchpad.thread_id
        and cr.client_id in (select public.client_ids_for_profile(auth.uid()))
        and t.kind = 'request'
    )
  );

create policy thread_scratchpad_upsert on public.thread_scratchpad for insert
  with check (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      join public.client_requests cr on cr.id = t.client_request_id
      where t.id = thread_scratchpad.thread_id
        and cr.client_id in (select public.client_ids_for_profile(auth.uid()))
        and t.kind = 'request'
    )
  );

create policy thread_scratchpad_update on public.thread_scratchpad for update
  using (
    public.is_staff()
    or exists (
      select 1 from public.threads t
      join public.client_requests cr on cr.id = t.client_request_id
      where t.id = thread_scratchpad.thread_id
        and cr.client_id in (select public.client_ids_for_profile(auth.uid()))
        and t.kind = 'request'
    )
  );

-- RPC: idempotent get-or-create for a thread.
create or replace function public.get_or_create_thread(
  p_client_request_id uuid,
  p_candidate_match_id uuid default null
) returns public.threads
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_kind text := case when p_candidate_match_id is null then 'request' else 'candidate' end;
  v_result public.threads;
begin
  if not (
    public.is_staff()
    or exists (
      select 1 from public.client_requests cr
      where cr.id = p_client_request_id
        and cr.client_id in (select public.client_ids_for_profile(auth.uid()))
    )
  ) then
    raise exception 'not authorized';
  end if;

  if v_kind = 'request' then
    select * into v_result from public.threads where client_request_id = p_client_request_id and kind = 'request';
    if v_result.id is not null then return v_result; end if;
    insert into public.threads (client_request_id, kind) values (p_client_request_id, 'request')
      returning * into v_result;
  else
    select * into v_result from public.threads where candidate_match_id = p_candidate_match_id and kind = 'candidate';
    if v_result.id is not null then return v_result; end if;
    insert into public.threads (client_request_id, candidate_match_id, kind)
      values (p_client_request_id, p_candidate_match_id, 'candidate')
      returning * into v_result;
  end if;
  return v_result;
end;
$$;

-- RPC: send a message, and notify the "other side" (best-effort recipient resolution).
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
  v_client_request_id uuid;
  v_candidate_match_id uuid;
  v_candidate_id uuid;
  v_recruiter_id uuid;
  v_created_by uuid;
  v_title text;
begin
  if btrim(coalesce(p_body,'')) = '' then
    raise exception 'message body cannot be empty';
  end if;

  select client_request_id, candidate_match_id into v_client_request_id, v_candidate_match_id
    from public.threads where id = p_thread_id;
  if v_client_request_id is null then
    raise exception 'thread not found';
  end if;

  insert into public.thread_messages (thread_id, sender_id, sender_role, body, structured_type)
    values (p_thread_id, auth.uid(), case when v_is_staff then 'staff' else 'client' end, p_body, p_structured_type)
    returning * into v_result;

  select title, created_by into v_title, v_created_by from public.client_requests where id = v_client_request_id;

  if v_candidate_match_id is not null then
    select candidate_id into v_candidate_id from public.candidate_matches where id = v_candidate_match_id;
    select recruiter_id into v_recruiter_id from public.candidates where id = v_candidate_id;
  end if;

  if v_is_staff then
    -- notify all client members on that request's client
    insert into public.notifications (recipient_id, title, message, type)
    select cm.profile_id, 'New message', coalesce(v_title, 'Your request') || ': new message from ScaleSource', 'thread_message'
    from public.client_requests cr
    join public.client_members cm on cm.client_id = cr.client_id
    where cr.id = v_client_request_id;
  else
    -- notify the assigned recruiter, falling back to the request creator
    insert into public.notifications (recipient_id, title, message, type)
    select coalesce(v_recruiter_id, v_created_by), 'New message', coalesce(v_title, 'A request') || ': new message from client', 'thread_message'
    where coalesce(v_recruiter_id, v_created_by) is not null;
  end if;

  return v_result;
end;
$$;

-- RPC: upsert the scratchpad content (last-write-wins).
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
begin
  insert into public.thread_scratchpad (thread_id, content, updated_by, updated_at)
    values (p_thread_id, p_content, auth.uid(), now())
  on conflict (thread_id) do update
    set content = excluded.content, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$$;

alter publication supabase_realtime add table public.thread_messages;
alter publication supabase_realtime add table public.thread_scratchpad;
