
-- Gap found by the Candidate Pool frontend build (18 Sept): job_roles/skills were
-- staff-only to SELECT (is_staff() only), which blocks BOTH the public /get-started
-- wizard (anonymous visitor) AND the authenticated /new-request form for existing
-- clients (client role isn't staff either). Neither table has any sensitive data -
-- just role/skill catalogue names - so a public read policy is safe. Existing
-- is_staff() policy stays (redundant now for staff, harmless) since multiple
-- permissive SELECT policies OR together in Postgres RLS.
create policy job_roles_public_select on public.job_roles
  for select to public
  using (is_active = true);

create policy skills_public_select on public.skills
  for select to public
  using (true);
