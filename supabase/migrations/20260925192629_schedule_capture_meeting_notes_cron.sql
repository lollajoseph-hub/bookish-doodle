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
