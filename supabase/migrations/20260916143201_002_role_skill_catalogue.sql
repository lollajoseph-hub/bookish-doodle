create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.job_roles
  for each row execute function public.set_updated_at();

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (name, category)
);

create table public.role_skills (
  role_id uuid not null references public.job_roles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  primary key (role_id, skill_id)
);

insert into public.job_roles (name, description) values
  ('CSR', 'Customer Service Representative - inbound support, scheduling, ticket handling.'),
  ('Sales Support', 'Sales support and estimating - quotes, CRM upkeep, follow-up.'),
  ('Bookkeeping', 'Bookkeeping and accounting support - reconciliations, reporting.'),
  ('Executive Assistant', 'Executive assistance - inbox, calendar, admin support for leadership.'),
  ('Office Support', 'Office and operations support - general administrative back-office work.')
on conflict (name) do nothing;
