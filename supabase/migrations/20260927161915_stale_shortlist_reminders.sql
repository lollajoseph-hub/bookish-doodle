-- #9: pitch expiry. Per Lola: no auto status change -- prompt the CLIENT to decide on a
-- shortlisted candidate once it's sat too long, then let the existing status workflow
-- (shortlist -> interview/reject/etc.) take over as normal.

alter table public.candidate_matches
  add column shortlisted_at timestamptz,
  add column shortlist_reminder_sent_at timestamptz;

comment on column public.candidate_matches.shortlisted_at is
  'When this match most recently transitioned into status=shortlisted. Cleared if toggled back to recommended. Used (not updated_at, which unrelated writes like the AI match_reason also touch) to measure staleness for the #9 reminder.';
comment on column public.candidate_matches.shortlist_reminder_sent_at is
  'Set once a stale-shortlist reminder email has been sent to the client for this match, so it only fires once per shortlist period.';

-- client_shortlist_candidate toggles recommended <-> shortlisted; track the timestamp on
-- whichever transition actually happens, and reset the reminder flag so a candidate that
-- gets un-shortlisted and re-shortlisted later gets a fresh 7-day window.
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
    set status = (case when v_status = 'shortlisted' then 'recommended' else 'shortlisted' end)::public.match_status,
        shortlisted_at = case when v_status = 'shortlisted' then null else now() end,
        shortlist_reminder_sent_at = null
    where id = p_match_id
    returning * into v_result;

  return v_result;
end;
$function$;

create or replace function public.send_stale_shortlist_reminders(p_stale_after interval default interval '7 days')
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count int := 0;
  m record;
begin
  if not (auth.role() = 'service_role' or public.is_staff()) then
    raise exception 'not authorized';
  end if;

  for m in
    select cm.id as match_id, cm.client_request_id, c.full_name as candidate_name,
           cr.title as request_title, cr.client_id
    from public.candidate_matches cm
    join public.candidates c on c.id = cm.candidate_id
    join public.client_requests cr on cr.id = cm.client_request_id
    where cm.status = 'shortlisted'
      and cm.shortlisted_at is not null
      and cm.shortlisted_at <= now() - p_stale_after
      and cm.shortlist_reminder_sent_at is null
  loop
    insert into public.notifications (recipient_id, title, message, type, send_email)
    select cmem.profile_id,
      'A shortlisted candidate is waiting on you',
      coalesce(m.candidate_name, 'A candidate') || ' has been shortlisted for '
        || coalesce(m.request_title, 'your request') || ' for over a week -- take a look and let us know your decision.',
      'stale_shortlist_reminder',
      true
    from public.client_members cmem
    where cmem.client_id = m.client_id;

    update public.candidate_matches set shortlist_reminder_sent_at = now() where id = m.match_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

select cron.schedule(
  'stale-shortlist-reminders-daily',
  '0 13 * * *',
  $$select public.send_stale_shortlist_reminders();$$
);
