
alter table public.client_requests
  add column must_have_skills_text text;

comment on column public.client_requests.must_have_skills_text is
  'Free-text must-have skills entered by the client (not tied to the skills catalog). Informational for recruiters; not used by rank_and_match scoring. Required languages remain structured via client_request_skills.';
