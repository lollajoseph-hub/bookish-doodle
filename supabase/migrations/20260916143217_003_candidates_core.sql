create type public.candidate_status as enum ('available','placed','inactive');

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  headline text,
  country text,
  timezone text,
  weekly_hours_available int,
  preferred_shift text,
  years_experience numeric,
  earliest_start_date date,
  status public.candidate_status not null default 'available',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.candidates
  for each row execute function public.set_updated_at();

create table public.candidate_roles (
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  role_id uuid not null references public.job_roles(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (candidate_id, role_id)
);

create or replace function public.enforce_one_primary_role() returns trigger
language plpgsql as $$
begin
  if new.is_primary then
    update public.candidate_roles
      set is_primary = false
      where candidate_id = new.candidate_id and role_id <> new.role_id and is_primary;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_one_primary_role
  before insert or update on public.candidate_roles
  for each row when (new.is_primary) execute function public.enforce_one_primary_role();

create table public.candidate_skills (
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  proficiency_level text,
  years_experience numeric,
  created_at timestamptz not null default now(),
  primary key (candidate_id, skill_id)
);

create table public.candidate_work_history (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  company text,
  title text,
  start_date text,
  end_date text,
  description text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.candidate_education (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  institution text,
  degree text,
  field text,
  start_date text,
  end_date text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
