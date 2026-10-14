create or replace view public.candidate_pool_profile
with (security_invoker = true) as
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
  (select jsonb_agg(jsonb_build_object(
      'name', s.name, 'category', s.category,
      'proficiency_level', cs.proficiency_level, 'years_experience', cs.years_experience))
     from public.candidate_skills cs join public.skills s on s.id = cs.skill_id
     where cs.candidate_id = c.id) as skills,
  (select jsonb_agg(jsonb_build_object(
      'company', wh.company, 'title', wh.title,
      'start_date', wh.start_date, 'end_date', wh.end_date, 'description', wh.description)
      order by wh.display_order)
     from public.candidate_work_history wh where wh.candidate_id = c.id) as work_history,
  (select jsonb_agg(jsonb_build_object(
      'institution', ed.institution, 'degree', ed.degree, 'field', ed.field)
      order by ed.display_order)
     from public.candidate_education ed where ed.candidate_id = c.id) as education,
  (select storage_path from public.candidate_files f
     where f.candidate_id = c.id and f.file_type = 'profile_photo' order by created_at desc limit 1) as profile_photo_path,
  (select storage_path from public.candidate_files f
     where f.candidate_id = c.id and f.file_type = 'intro_video' order by created_at desc limit 1) as intro_video_path,
  (select jsonb_agg(r.name) from public.candidate_roles cr join public.job_roles r on r.id = cr.role_id
     where cr.candidate_id = c.id and cr.is_primary) as primary_role,
  (select jsonb_agg(r.name) from public.candidate_roles cr join public.job_roles r on r.id = cr.role_id
     where cr.candidate_id = c.id and not cr.is_primary) as secondary_roles
from public.candidates c
left join public.candidate_ai_profiles ap on ap.candidate_id = c.id;
