-- BACKUP NOTE: the literal secret value passed to vault.create_secret below has been replaced
-- with <REDACTED> in this backup copy (it is the same value that was hardcoded in migration 016).
-- Everything else is verbatim.

-- SECURITY AUDIT FIX: notify_email_on_notification() had the notification-email webhook secret
-- hardcoded in plaintext in the function body -- inconsistent with the sibling triggers
-- (tg_calendar_sync, tg_process_resume_on_upload/role_change) which correctly pull their secrets
-- from vault.decrypted_secrets. Anyone able to read function source (pg_proc) could read the
-- secret in plaintext. Moving it into vault to match the established, correct pattern.
select vault.create_secret('<REDACTED>', 'notification_hook_secret', 'Shared secret for notifications -> send-notification-email edge function hook (matches NOTIFICATION_HOOK_SECRET env var)');

create or replace function public.notify_email_on_notification()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  if not new.send_email then
    return new;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notification_hook_secret' limit 1;

  perform net.http_post(
    url := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hook-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object('notification_id', new.id)
  );

  return new;
end;
$function$;
