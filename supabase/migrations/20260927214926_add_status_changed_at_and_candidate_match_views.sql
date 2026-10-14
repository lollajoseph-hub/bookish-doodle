
-- Track exactly when a match's status last changed, so clients can be shown
-- a "new" indicator when a candidate has progressed to a stage they haven't seen yet.
alter table public.candidate_matches
  add column status_changed_at timestamptz not null default now();

create or replace function public.tg_set_status_changed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_status_changed_at on public.candidate_matches;
create trigger trg_set_status_changed_at
  before update on public.candidate_matches
  for each row execute function public.tg_set_status_changed_at();

-- Per-client "last seen" tracking so the UI can compare status_changed_at
-- against what this client has already viewed.
create table public.candidate_match_views (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  candidate_match_id uuid not null references public.candidate_matches(id) on delete cascade,
  last_seen_status match_status not null,
  last_seen_at timestamptz not null default now(),
  primary key (profile_id, candidate_match_id)
);

alter table public.candidate_match_views enable row level security;

create policy candidate_match_views_select on public.candidate_match_views
  for select using (is_staff() or profile_id = auth.uid());

create policy candidate_match_views_upsert on public.candidate_match_views
  for insert with check (profile_id = auth.uid());

create policy candidate_match_views_update on public.candidate_match_views
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
