create type public.placement_status as enum ('active','completed','terminated');

create table public.placements (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id),
  client_id uuid not null references public.clients(id),
  client_request_id uuid references public.client_requests(id),
  role_id uuid references public.job_roles(id),
  seat_title text,
  billing_start_date date,
  monthly_rate numeric,
  guarantee_window_expires date,
  status public.placement_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.placements
  for each row execute function public.set_updated_at();
