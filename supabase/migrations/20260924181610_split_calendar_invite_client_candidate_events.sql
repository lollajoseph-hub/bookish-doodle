-- Support two separate Google Calendar events per interview (recruiter+client,
-- recruiter+candidate) sharing one Meet link, instead of one shared event with
-- only the recruiter as a real attendee. This lets both the client and the
-- candidate get a genuine Calendar invite (correct auto-local-time conversion)
-- without ever appearing on the same event together, so their emails are never
-- exposed to each other.
--
-- google_event_id is kept (now unused going forward, but left in place so any
-- historical single-event data isn't silently dropped) and two new columns are
-- added for the split events.
alter table public.candidate_matches
  add column if not exists client_event_id text,
  add column if not exists candidate_event_id text;

create or replace function public.apply_calendar_event(
  p_match uuid,
  p_client_event_id text,
  p_candidate_event_id text,
  p_meet_url text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.candidate_matches
     set client_event_id = p_client_event_id,
         candidate_event_id = p_candidate_event_id,
         meet_url = coalesce(p_meet_url, meet_url),
         gcal_synced_at = now()
   where id = p_match;
end;
$function$;

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
