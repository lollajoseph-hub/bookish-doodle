-- The shared /dashboard "Recent activity" panel previously only worked for admins because
-- audit_logs SELECT was admin-only. Lola wants recruiters to see the exact same operations
-- dashboard as admins, so widen this to all staff (admin + recruiter), matching every other
-- RLS policy in this schema which already uses is_staff() for shared operational data.
drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_staff_select on public.audit_logs
  for select
  using (is_staff());
