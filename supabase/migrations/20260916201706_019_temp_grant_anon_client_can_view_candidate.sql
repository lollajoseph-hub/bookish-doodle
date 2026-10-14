-- Same temporary bootstrap grant as migration 018, extended to the other
-- SECURITY DEFINER function referenced by storage.objects policies, since
-- the upsert path also evaluates SELECT-scoped ALL-command policies.
-- Reverted immediately after the one-time logo upload.
grant execute on function public.client_can_view_candidate(uuid) to anon;
