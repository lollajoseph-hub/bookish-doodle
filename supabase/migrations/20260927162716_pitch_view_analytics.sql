-- #8: pitch view analytics. Track when a client opens a candidate's profile so recruiters
-- can see "viewed 3x, last Sept 28" instead of guessing whether a client has even looked.
create table public.match_views (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.candidate_matches(id) on delete cascade,
  viewed_by uuid references public.profiles(id) on delete set null,
  viewed_at timestamptz not null default now()
);

create index match_views_match_id_idx on public.match_views (match_id);
create index match_views_viewed_at_idx on public.match_views (viewed_at);

alter table public.match_views enable row level security;

-- Only staff can read view analytics (this is a recruiter-facing insight, not shown to clients).
create policy match_views_staff_select on public.match_views
  for select using (public.is_staff());

-- No direct insert/update/delete policies: all writes go through log_match_view() below,
-- which runs as SECURITY DEFINER and does its own authorization check. This keeps clients
-- from ever back-dating, deleting, or forging view records for another client's candidate.

create or replace function public.log_match_view(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request_id uuid;
begin
  select client_request_id into v_request_id
  from public.candidate_matches where id = p_match_id;

  if v_request_id is null then
    raise exception 'match not found';
  end if;

  -- Only an actual client user viewing their own request's candidate counts as a "view".
  -- Staff browsing the same profile in the Dashboard app should not inflate this metric.
  if not public.client_owns_request(v_request_id) then
    raise exception 'not authorized';
  end if;

  insert into public.match_views (match_id, viewed_by)
  values (p_match_id, auth.uid());
end;
$function$;
