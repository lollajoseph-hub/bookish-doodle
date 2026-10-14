create policy audit_logs_self_select on public.audit_logs for select using (is_staff() and user_id = auth.uid());
