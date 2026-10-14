drop policy if exists audit_logs_staff_select on public.audit_logs;
create policy audit_logs_admin_select on public.audit_logs
  for select
  using (is_admin());
