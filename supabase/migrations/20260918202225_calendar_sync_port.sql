-- BACKUP NOTE: the literal secret value passed to vault.create_secret below has been replaced
-- with <REDACTED> in this backup copy. Everything else is verbatim.

-- Store the calendar-sync hook secret in Vault, same pattern already used for
-- resume_hook_secret. This is what the trigger (running in Postgres) reads to
-- authenticate its outbound call to the calendar-sync edge function, and what
-- verify_calendar_hook checks the incoming header against. This is separate
-- from any Edge Function secret of the same name (Postgres functions can't
-- read those) - Vault is the only thing a DB trigger can read from.
select vault.create_secret('<REDACTED>', 'calendar_hook_secret');

alter table public.candidate_matches
  add column if not exists google_event_id text,
  add column if not exists gcal_synced_at timestamptz;

create or replace function public.verify_calendar_hook(p_token text)
returns boolean
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'calendar_hook_secret' and decrypted_secret = p_token and coalesce(p_token,'') <> '');
$$;

create or replace function public.get_interview_calendar_payload(p_match uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'match_id', m.id,
    'status', m.status::text,
    'start', m.interview_scheduled_at,
    'timezone', coalesce(ca.timezone, 'UTC'),
    'mode', 'video',
    'event_id', m.google_event_id,
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
$$;

create or replace function public.apply_calendar_event(p_match uuid, p_event_id text, p_meet_url text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.candidate_matches
     set google_event_id = p_event_id,
         meet_url = coalesce(p_meet_url, meet_url),
         gcal_synced_at = now()
   where id = p_match;
end;
$$;

create or replace function public.tg_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $$
declare v_action text; v_secret text;
begin
  if NEW.status = 'interview_confirmed' then
    if NEW.google_event_id is null then
      v_action := 'create';
    elsif NEW.interview_scheduled_at is distinct from OLD.interview_scheduled_at then
      v_action := 'patch';
    end if;
  elsif NEW.status = 'rejected' and NEW.google_event_id is not null then
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
$$;

drop trigger if exists trg_calendar_sync on public.candidate_matches;
create trigger trg_calendar_sync
  after update of status, interview_scheduled_at on public.candidate_matches
  for each row execute function public.tg_calendar_sync();
