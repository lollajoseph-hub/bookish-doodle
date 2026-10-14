-- SECURITY AUDIT FIX (found: several RPCs meant only for server-side/edge-function use were
-- directly callable by anon/authenticated via the public REST API, and the candidate_pool_profile
-- view had no row-level ownership check at all, so any logged-in client could read ANY candidate's
-- full profile -- not just candidates actually matched to them. Confirmed via frontend audit of both
-- Lovable apps that none of apply_calendar_event / apply_resume_profile / get_interview_calendar_payload
-- are ever called from client-side code in either app -- only from server-side edge functions using the
-- service role, which is unaffected by these revokes.

-- 1. Lock these three down to service_role only -- no legitimate frontend caller exists for any of them.
revoke execute on function public.apply_calendar_event(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.apply_resume_profile(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.get_interview_calendar_payload(uuid) from public, anon, authenticated;

-- 2. resolve_or_create_skills is called client-side, but only by an authenticated client
-- submitting a hiring request -- anon has no legitimate reason to create skill catalog rows.
revoke execute on function public.resolve_or_create_skills(text[]) from public, anon;

-- 3. candidate_pool_profile: bake the ownership check directly into the view so it's enforced
-- no matter how the view is queried (direct .from(), embedded join from candidate_matches, or a
-- raw REST call) -- instead of relying on the frontend to only ever ask for candidates it's allowed
-- to see. Staff/recruiters still see everything; a client only sees candidates actually matched to
-- one of their own requests.
create or replace view public.candidate_pool_profile
with (security_invoker = false) as
select
  c.id as candidate_id,
  c.full_name,
  c.headline,
  c.country,
  c.timezone,
  c.weekly_hours_available,
  c.preferred_shift,
  c.years_experience,
  c.earliest_start_date,
  ap.approved_summary,
  ap.highlights,
  (select jsonb_agg(jsonb_build_object('name', s.name, 'category', s.category, 'proficiency_level', cs.proficiency_level, 'years_experience', cs.years_experience))
     from candidate_skills cs join skills s on s.id = cs.skill_id where cs.candidate_id = c.id) as skills,
  (select jsonb_agg(jsonb_build_object('company', wh.company, 'title', wh.title, 'start_date', wh.start_date, 'end_date', wh.end_date, 'description', wh.description) order by wh.display_order)
     from candidate_work_history wh where wh.candidate_id = c.id) as work_history,
  (select jsonb_agg(jsonb_build_object('institution', ed.institution, 'degree', ed.degree, 'field', ed.field) order by ed.display_order)
     from candidate_education ed where ed.candidate_id = c.id) as education,
  (select f.storage_path from candidate_files f where f.candidate_id = c.id and f.file_type = 'profile_photo'::candidate_file_type order by f.created_at desc limit 1) as profile_photo_path,
  (select f.storage_path from candidate_files f where f.candidate_id = c.id and f.file_type = 'intro_video'::candidate_file_type order by f.created_at desc limit 1) as intro_video_path,
  (select jsonb_agg(r.name) from candidate_roles cr join job_roles r on r.id = cr.role_id where cr.candidate_id = c.id and cr.is_primary) as primary_role,
  (select jsonb_agg(r.name) from candidate_roles cr join job_roles r on r.id = cr.role_id where cr.candidate_id = c.id and not cr.is_primary) as secondary_roles,
  c.availability
from candidates c
left join candidate_ai_profiles ap on ap.candidate_id = c.id
where
  public.is_staff()
  or exists (
    select 1 from candidate_matches cm
    join client_requests cr2 on cr2.id = cm.client_request_id
    join client_members cme on cme.client_id = cr2.client_id
    where cm.candidate_id = c.id and cme.profile_id = auth.uid()
  );

revoke select on public.candidate_pool_profile from anon;
