-- Views in schema public (pg_get_viewdef), captured 2026-10-14. 1 view, 0 materialized views.
--
-- NOTE on security mode: pg_class.reloptions for this view is currently EMPTY, i.e. the view runs
-- with the default (owner / security-definer-style) privileges, NOT security_invoker. Migration
-- 009 originally created it WITH (security_invoker = true); migration
-- 20260921184830_security_audit_lock_down_exposed_rpcs_and_profile_view switched it to
-- security_invoker = false and moved the access check into the WHERE clause (is_staff() OR the
-- caller's client is matched to the candidate). Later CREATE OR REPLACE statements kept that.
-- SELECT was revoked from anon (see grants.sql).

create or replace view public.candidate_pool_profile as
 SELECT c.id AS candidate_id,
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
    ( SELECT jsonb_agg(jsonb_build_object('name', s.name, 'category', s.category, 'proficiency_level', cs.proficiency_level, 'years_experience', cs.years_experience)) AS jsonb_agg
           FROM candidate_skills cs
             JOIN skills s ON s.id = cs.skill_id
          WHERE cs.candidate_id = c.id) AS skills,
    ( SELECT jsonb_agg(jsonb_build_object('company', wh.company, 'title', wh.title, 'start_date', wh.start_date, 'end_date', wh.end_date, 'description', wh.description) ORDER BY wh.display_order) AS jsonb_agg
           FROM candidate_work_history wh
          WHERE wh.candidate_id = c.id) AS work_history,
    ( SELECT jsonb_agg(jsonb_build_object('institution', ed.institution, 'degree', ed.degree, 'field', ed.field) ORDER BY ed.display_order) AS jsonb_agg
           FROM candidate_education ed
          WHERE ed.candidate_id = c.id) AS education,
    ( SELECT f.storage_path
           FROM candidate_files f
          WHERE f.candidate_id = c.id AND f.file_type = 'profile_photo'::candidate_file_type
          ORDER BY f.created_at DESC
         LIMIT 1) AS profile_photo_path,
    ( SELECT f.storage_path
           FROM candidate_files f
          WHERE f.candidate_id = c.id AND f.file_type = 'intro_video'::candidate_file_type
          ORDER BY f.created_at DESC
         LIMIT 1) AS intro_video_path,
    ( SELECT jsonb_agg(r.name) AS jsonb_agg
           FROM candidate_roles cr
             JOIN job_roles r ON r.id = cr.role_id
          WHERE cr.candidate_id = c.id AND cr.is_primary) AS primary_role,
    ( SELECT jsonb_agg(r.name) AS jsonb_agg
           FROM candidate_roles cr
             JOIN job_roles r ON r.id = cr.role_id
          WHERE cr.candidate_id = c.id AND NOT cr.is_primary) AS secondary_roles,
    c.availability,
    c.intro_video_url
   FROM candidates c
     LEFT JOIN candidate_ai_profiles ap ON ap.candidate_id = c.id
  WHERE is_staff() OR (EXISTS ( SELECT 1
           FROM candidate_matches cm
             JOIN client_requests cr2 ON cr2.id = cm.client_request_id
             JOIN client_members cme ON cme.client_id = cr2.client_id
          WHERE cm.candidate_id = c.id AND cme.profile_id = auth.uid()));
