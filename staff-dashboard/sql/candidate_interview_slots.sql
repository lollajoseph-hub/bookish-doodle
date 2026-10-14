-- Calendly-style interview booking.
-- Staff add the times a candidate is free to interview. Clients who have the
-- candidate on a request see the open times and book one, which confirms the
-- interview straight away. The existing calendar-sync trigger then creates the
-- Google Calendar invites and Meet link, as it does for any confirmed interview.
-- The client's "propose your own time" calendar stays as a backup.

-- 1. Slots: one row per time the candidate is free, shared across every client.
create table public.candidate_interview_slots (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 240),
  booked_match_id uuid references public.candidate_matches(id) on delete set null,
  booked_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (candidate_id, starts_at)
);

create index candidate_interview_slots_candidate_idx
  on public.candidate_interview_slots (candidate_id, starts_at);

alter table public.candidate_interview_slots enable row level security;

-- Staff manage slots directly. Clients never read the table; they use the
-- functions below, which only return open times and never other clients' bookings.
create policy candidate_interview_slots_staff_all on public.candidate_interview_slots
  for all using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.candidate_interview_slots to authenticated;

-- 2. Interview length, so the calendar invite matches the booked slot.
alter table public.candidate_matches add column interview_duration_minutes integer;

-- A slot counts as taken only while the match that booked it is still
-- confirmed for that exact time. If that interview is rejected or moved, the
-- slot opens up again automatically.
create or replace function public.slot_is_taken(p_slot public.candidate_interview_slots)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_slot.booked_match_id is not null and exists (
    select 1 from public.candidate_matches m
    where m.id = p_slot.booked_match_id
      and m.status in ('interview_confirmed', 'interview_completed')
      and m.interview_scheduled_at = p_slot.starts_at
  );
$$;

-- 3. Open future slots for the candidate on a match (client member or staff).
create or replace function public.get_match_interview_slots(p_match_id uuid)
returns table (id uuid, starts_at timestamptz, duration_minutes integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_candidate_id uuid;
begin
  select client_request_id, candidate_id into v_request_id, v_candidate_id
    from public.candidate_matches where candidate_matches.id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if not (public.is_staff() or public.client_owns_request(v_request_id)) then
    raise exception 'not authorized';
  end if;

  return query
    select s.id, s.starts_at, s.duration_minutes
    from public.candidate_interview_slots s
    where s.candidate_id = v_candidate_id
      and s.starts_at > now()
      and not public.slot_is_taken(s)
    order by s.starts_at;
end;
$$;

-- 4. Client books a slot: confirms the interview immediately.
create or replace function public.client_book_interview_slot(p_match_id uuid, p_slot_id uuid)
returns public.candidate_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_candidate_id uuid;
  v_status public.match_status;
  v_slot public.candidate_interview_slots;
  v_result public.candidate_matches;
  v_client_name text;
  v_candidate_name text;
begin
  select client_request_id, candidate_id, status into v_request_id, v_candidate_id, v_status
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

  if v_status not in ('recommended', 'shortlisted', 'interview_requested') then
    raise exception 'cannot book an interview from this state (current status: %)', v_status;
  end if;

  -- Lock the slot so two clients can't book the same time.
  select * into v_slot from public.candidate_interview_slots
    where id = p_slot_id and candidate_id = v_candidate_id
    for update;
  if v_slot.id is null then
    raise exception 'that time is no longer available';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'that time has already passed';
  end if;
  if public.slot_is_taken(v_slot) then
    raise exception 'that time was just booked by someone else, please pick another';
  end if;

  update public.candidate_interview_slots
    set booked_match_id = p_match_id, booked_at = now()
    where id = p_slot_id;

  update public.candidate_matches
    set status = 'interview_confirmed',
        interview_proposed_at = v_slot.starts_at,
        interview_proposed_by = 'client',
        interview_scheduled_at = v_slot.starts_at,
        interview_duration_minutes = v_slot.duration_minutes
    where id = p_match_id
    returning * into v_result;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Interview booked',
         coalesce(v_client_name, 'A client') || ' booked an interview with ' || coalesce(v_candidate_name, 'a candidate') || ': ' ||
           to_char(v_slot.starts_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC.', 'interview_confirmed'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$$;

revoke execute on function public.slot_is_taken(public.candidate_interview_slots) from public, anon;
revoke execute on function public.get_match_interview_slots(uuid) from public, anon;
revoke execute on function public.client_book_interview_slot(uuid, uuid) from public, anon;
-- slot_is_taken is internal only (called inside the security definer functions above).
grant execute on function public.get_match_interview_slots(uuid) to authenticated;
grant execute on function public.client_book_interview_slot(uuid, uuid) to authenticated;

-- 5. Calendar payload: add the interview length (null means the old 45 minutes).
create or replace function public.get_interview_calendar_payload(p_match uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'match_id', m.id,
    'status', m.status::text,
    'start', m.interview_scheduled_at,
    'duration_minutes', m.interview_duration_minutes,
    'timezone', coalesce(ca.timezone, 'UTC'),
    'mode', 'video',
    'client_event_id', m.client_event_id,
    'candidate_event_id', m.candidate_event_id,
    'candidate_name', ca.full_name,
    'candidate_email', ca.email,
    'client_name', cl.name,
    'client_email', (
      select p.email from public.client_members cm
      join public.profiles p on p.id = cm.profile_id
      where cm.client_id = cl.id and cm.is_primary
      limit 1
    ),
    'recruiter_email', pr.email,
    'role_title', coalesce(cr.title, jr.name)
  )
  from public.candidate_matches m
  join public.candidates ca on ca.id = m.candidate_id
  left join public.client_requests cr on cr.id = m.client_request_id
  left join public.clients cl on cl.id = cr.client_id
  left join public.job_roles jr on jr.id = cr.role_id
  left join public.profiles pr on pr.id = ca.recruiter_id
  where m.id = p_match;
$function$;
