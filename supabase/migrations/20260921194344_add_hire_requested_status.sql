alter type public.match_status add value 'hire_requested' after 'interview_completed';
alter table public.candidate_matches add column if not exists hire_requested_at timestamptz;
