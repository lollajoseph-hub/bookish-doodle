-- BACKUP NOTE: the literal x-hook-secret value that was hardcoded in this migration has been
-- replaced with <REDACTED> in this backup copy. (It was later moved to Vault in migration
-- 20260921185107_move_notification_hook_secret_to_vault.) Everything else is verbatim.
create extension if not exists pg_net;

alter table public.notifications
  add column if not exists send_email boolean not null default true,
  add column if not exists email_sent_at timestamptz;

create or replace function public.notify_email_on_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.send_email then
    return new;
  end if;

  perform net.http_post(
    url := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hook-secret', '<REDACTED>'
    ),
    body := jsonb_build_object('notification_id', new.id)
  );

  return new;
end;
$$;

revoke all on function public.notify_email_on_notification() from public, anon, authenticated;

create trigger trg_notify_email_on_notification
  after insert on public.notifications
  for each row execute function public.notify_email_on_notification();
