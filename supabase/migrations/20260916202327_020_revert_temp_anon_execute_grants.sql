-- Revert the temporary bootstrap grants from migrations 018 and 019.
-- The logo upload is being done a different way (via the authenticated
-- Supabase Dashboard, not the anon key), so these were never used for
-- their intended purpose and should not remain in place.
revoke execute on function public.is_staff() from anon;
revoke execute on function public.client_can_view_candidate(uuid) from anon;
