create type public.client_request_source as enum ('standard', 'staff_curated');

alter table public.client_requests
  add column source public.client_request_source not null default 'standard';

comment on column public.client_requests.source is 'standard = client-submitted, algorithmically matched via rank_and_match. staff_curated = staff hand-picked the candidate(s) directly, no algorithmic matching.';
