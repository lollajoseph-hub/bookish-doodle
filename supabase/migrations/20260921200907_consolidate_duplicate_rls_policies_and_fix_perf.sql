-- Performance cleanup from the audit: three tables had two overlapping permissive SELECT
-- policies each (Postgres has to evaluate every matching permissive policy per query), and
-- audit_logs's policy re-evaluated auth.uid() per row instead of once. Consolidating into one
-- policy per table fixes both.

-- audit_logs: admin sees everything, staff sees their own rows.
drop policy if exists audit_logs_admin_select on public.audit_logs;
drop policy if exists audit_logs_self_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select
  using (public.is_admin() or (public.is_staff() and user_id = (select auth.uid())));

-- job_roles: anyone can see active roles, staff can see everything (including inactive).
drop policy if exists job_roles_public_select on public.job_roles;
drop policy if exists job_roles_select on public.job_roles;
create policy job_roles_select on public.job_roles
  for select
  using (is_active = true or public.is_staff());

-- skills: skills_public_select already allowed everyone unconditionally (qual = true), which
-- made skills_select (staff-only) entirely redundant -- just drop the redundant one.
drop policy if exists skills_select on public.skills;
