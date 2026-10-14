create extension if not exists pg_cron with schema extensions;
grant usage on schema cron to postgres;

-- Storage for auto-captured Gemini notes + Meet recording, distinct from the
-- existing manually-entered interview_notes / recruiter_notes fields.
alter table public.candidate_matches
  add column if not exists meeting_notes_doc_url text,
  add column if not exists meeting_notes_text text,
  add column if not exists meeting_notes_captured_at timestamptz,
  add column if not exists recording_url text,
  add column if not exists recording_captured_at timestamptz;

-- Same hook-secret pattern as calendar_hook_secret / resume_hook_secret.
select vault.create_secret('placeholder-will-be-rotated', 'meeting_capture_hook_secret', 'Auth token for capture-meeting-notes edge function')
where not exists (select 1 from vault.decrypted_secrets where name = 'meeting_capture_hook_secret');

create or replace function public.verify_meeting_capture_hook(p_token text)
 returns boolean
 language sql
 security definer
 set search_path to 'public', 'vault'
as $function$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'meeting_capture_hook_secret' and decrypted_secret = p_token and coalesce(p_token,'') <> '');
$function$;

-- Candidates whose interview already happened but haven't had notes/recording
-- captured yet, with the fields the matcher needs (candidate/client names for
-- title matching, client email for the Drive permission grant).
create or replace function public.get_pending_meeting_captures(p_since interval default interval '4 days')
 returns jsonb
 language sql
 security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'match_id', m.id,
    'interview_scheduled_at', m.interview_scheduled_at,
    'candidate_name', ca.full_name,
    'client_name', cl.name,
    'client_email', (
      select p.email from public.client_members cm
      join public.profiles p on p.id = cm.profile_id
      where cm.client_id = cl.id and cm.is_primary
      limit 1
    )
  )), '[]'::jsonb)
  from public.candidate_matches m
  join public.candidates ca on ca.id = m.candidate_id
  left join public.client_requests cr on cr.id = m.client_request_id
  left join public.clients cl on cl.id = cr.client_id
  where m.interview_scheduled_at is not null
    and m.interview_scheduled_at < now()
    and m.interview_scheduled_at > now() - p_since
    and (m.meeting_notes_captured_at is null or m.recording_captured_at is null);
$function$;

create or replace function public.apply_meeting_capture(
  p_match uuid,
  p_notes_doc_url text,
  p_notes_text text,
  p_recording_url text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.candidate_matches
     set meeting_notes_doc_url = coalesce(p_notes_doc_url, meeting_notes_doc_url),
         meeting_notes_text = coalesce(p_notes_text, meeting_notes_text),
         meeting_notes_captured_at = case when p_notes_doc_url is not null then now() else meeting_notes_captured_at end,
         recording_url = coalesce(p_recording_url, recording_url),
         recording_captured_at = case when p_recording_url is not null then now() else recording_captured_at end
   where id = p_match;
end;
$function$;
