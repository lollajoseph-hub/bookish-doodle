
revoke all on function public.add_or_get_skill_for_role(uuid, text, text) from anon;
-- get_role_skills is read-only catalog data (role name -> skill names), safe for anon since
-- the public get-started wizard's own UI needs to show the dropdown before the user is
-- authenticated. add_or_get_skill_for_role stays authenticated-only; the public wizard's writes
-- go through the public-client-request edge function's service-role client instead.
