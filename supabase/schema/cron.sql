-- pg_cron jobs (cron.job), captured 2026-10-14. pg_cron 1.6.4 is installed.
-- Neither command contains a literal bearer token or secret (the meeting-capture job reads its
-- secret from Vault at run time), so nothing needed masking. Bearer-token regex masking was applied anyway.
--
-- Run history (cron.job_run_details) at capture time:
--   capture-meeting-notes-30min      905 runs, all 'succeeded', last 2026-10-14 15:30 UTC
--   stale-shortlist-reminders-daily   17 runs, all 'succeeded', last 2026-10-14 13:00 UTC
--
-- pg_net (0.20.4, installed in schema public's extension list / functions in schema "net") is used by:
--   * cron job 1 below (calls the capture-meeting-notes edge function)
--   * trigger functions that call edge functions asynchronously with net.http_post():
--       notify_email_on_notification   -> send-notification-email   (header x-hook-secret, Vault: notification_hook_secret)
--       tg_process_resume_on_upload    -> process-resume            (header x-resume-hook-secret, Vault: resume_hook_secret)
--       tg_process_resume_on_role_change -> process-resume          (same)
--       tg_generate_match_reason       -> generate-match-reason     (header x-resume-hook-secret, Vault: resume_hook_secret)
--       tg_calendar_sync               -> calendar-sync             (header x-calendar-hook-secret, Vault: calendar_hook_secret)

-- jobid 1, active
select cron.schedule(
  'capture-meeting-notes-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/capture-meeting-notes',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-meeting-capture-hook-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'meeting_capture_hook_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- jobid 2, active
select cron.schedule(
  'stale-shortlist-reminders-daily',
  '0 13 * * *',
  $$select public.send_stale_shortlist_reminders();$$
);
