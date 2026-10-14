create type public.engagement_type as enum ('full_time','part_time','project');
create type public.client_request_status as enum ('open','needs_attention','fulfilled','closed');

create table public.client_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  role_id uuid not null references public.job_roles(id),
  title text,
  candidates_wanted int not null default 4,
  engagement_type public.engagement_type not null,
  hours_needed text,
  timezone_requirement text,
  years_experience_min numeric,
  desired_start_date date,
  notes text,
  status public.client_request_status not null default 'open',
  rejection_count int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.client_requests
  for each row execute function public.set_updated_at();

create table public.client_request_skills (
  request_id uuid not null references public.client_requests(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  is_required boolean not null default true,
  primary key (request_id, skill_id)
);

create type public.match_status as enum ('recommended','shortlisted','interview_requested','interview_confirmed','interview_completed','hired','rejected');
create type public.rejection_reason as enum ('skill_mismatch','availability_conflict','culture_fit','other');

create table public.candidate_matches (
  id uuid primary key default gen_random_uuid(),
  client_request_id uuid not null references public.client_requests(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  match_score numeric,
  match_reason text,
  status public.match_status not null default 'recommended',
  rejection_reason public.rejection_reason,
  rejection_reason_note text,
  rejected_at timestamptz,
  meet_url text,
  interview_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_request_id, candidate_id)
);
create trigger set_updated_at before update on public.candidate_matches
  for each row execute function public.set_updated_at();
