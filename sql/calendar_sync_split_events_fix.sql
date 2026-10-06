-- Fix: calendar sync trigger checks the wrong event field.
-- Applied to the live database on 2026-10-06 via the Supabase SQL editor.
--
-- The calendar now uses two events per interview (client_event_id + candidate_event_id).
-- The trigger still checked the old single google_event_id, which is never set, so:
--   * rejecting a confirmed interview never cancelled its calendar events, and
--   * changing the time of a confirmed interview created new events instead of moving them.
-- apply_calendar_event only updates the event ids (not status or time), so this cannot loop.

create or replace function public.tg_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $function$
declare
  v_action text;
  v_secret text;
  v_has_events boolean := NEW.client_event_id is not null or NEW.candidate_event_id is not null;
begin
  if NEW.status = 'interview_confirmed' then
    if not v_has_events then
      v_action := 'create';
    elsif NEW.interview_scheduled_at is distinct from OLD.interview_scheduled_at then
      v_action := 'patch';
    end if;
  elsif NEW.status = 'rejected' and v_has_events then
    v_action := 'cancel';
  end if;

  if v_action is null then return NEW; end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'calendar_hook_secret' limit 1;
  begin
    perform net.http_post(
      url := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/calendar-sync',
      headers := jsonb_build_object('Content-Type','application/json','x-calendar-hook-secret', coalesce(v_secret,'')),
      body := jsonb_build_object('match_id', NEW.id, 'action', v_action),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'calendar-sync hook failed: %', sqlerrm;
  end;
  return NEW;
end;
$function$;
