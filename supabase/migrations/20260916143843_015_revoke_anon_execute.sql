-- Supabase grants EXECUTE on new public functions to anon/authenticated by default;
-- revoking from PUBLIC alone doesn't remove that. Revoke explicitly from anon.
revoke execute on function public.audit_trigger() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;

revoke execute on function public.is_staff() from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_recruiter() from anon;
revoke execute on function public.is_client() from anon;
revoke execute on function public.client_can_view_candidate(uuid) from anon;
revoke execute on function public.client_owns_request(uuid) from anon;
revoke execute on function public.client_ids_for_profile(uuid) from anon;
revoke execute on function public.candidate_primary_role(uuid) from anon;
revoke execute on function public.rank_and_match(uuid, int) from anon;
revoke execute on function public.reject_candidate_match(uuid, public.rejection_reason, text) from anon;
revoke execute on function public.reshuffle_request(uuid, int) from anon;
revoke execute on function public.request_to_hire(uuid) from anon;
