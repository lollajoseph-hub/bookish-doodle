create table public.candidate_ai_profiles (
  candidate_id uuid primary key references public.candidates(id) on delete cascade,
  recruiter_summary text,
  approved_summary text,
  skills jsonb,
  highlights jsonb,
  rank_score numeric,
  model_version text,
  generated_at timestamptz,
  ai_metadata jsonb,
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.candidate_ai_profiles
  for each row execute function public.set_updated_at();

create type public.candidate_file_type as enum ('resume','profile_photo','intro_video','id_document','reference','other');

create table public.candidate_files (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  file_type public.candidate_file_type not null,
  bucket_id text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.recruiter_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  recruiter_id uuid references public.profiles(id),
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.recruiter_notes
  for each row execute function public.set_updated_at();

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  created_at timestamptz not null default now()
);

create table public.candidate_tags (
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  recruiter_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (candidate_id, tag_id)
);
