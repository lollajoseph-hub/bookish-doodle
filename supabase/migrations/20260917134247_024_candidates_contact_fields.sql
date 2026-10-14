alter table public.candidates
  add column email text,
  add column phone text;

comment on column public.candidates.email is 'Candidate contact email, entered by recruiter/admin. No auth account is tied to this - candidates never log in in this system. Used internally (e.g. Google Calendar interview invites), never exposed via candidate_pool_profile.';
comment on column public.candidates.phone is 'Candidate contact phone, entered by recruiter/admin. Same PII handling as email above.';
