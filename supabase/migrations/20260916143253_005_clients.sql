create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_client_id uuid references public.clients(id),
  is_franchise_brand boolean not null default false,
  industry text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

create table public.client_members (
  client_id uuid not null references public.clients(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (client_id, profile_id)
);

create or replace function public.client_ids_for_profile(p_profile_id uuid) returns setof uuid
language sql stable security definer as $$
  select client_id from public.client_members where profile_id = p_profile_id;
$$;
