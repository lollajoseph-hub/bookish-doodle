-- Client-facing interview times in the client's timezone.
-- Applied to the live database on 2026-10-06 as migration client_timezone_interview_times.
--
-- 1. format_interview_time(at, tz): "Oct 07, 2026 09:00 AM (US/Eastern)", or UTC when the
--    timezone is missing or not a valid name.
-- 2. confirm_interview and admin_propose_interview_time: the client notifications now use
--    format_interview_time with the request's timezone_requirement instead of UTC.
-- 3. get_interview_calendar_payload: adds 'client_timezone' (the request's
--    timezone_requirement when valid), which calendar-sync uses for the client's email.
--    Staff notifications still show UTC.
--
-- The live database function definitions are the source of truth.

create or replace function public.format_interview_time(p_at timestamptz, p_tz text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_tz is not null and exists (select 1 from pg_timezone_names where name = p_tz)
      then to_char(p_at at time zone p_tz, 'Mon DD, YYYY HH12:MI AM') || ' (' || p_tz || ')'
    else to_char(p_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC'
  end;
$$;
revoke execute on function public.format_interview_time(timestamptz, text) from public, anon;
