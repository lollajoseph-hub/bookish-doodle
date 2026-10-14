-- Clean slate (2026-10-06): remove all test data, keep only lola@scalesource.com and the
-- setup lists (skills, job_roles, role_skills, tags). Backup in schema backup_20261006.
-- No CASCADE: if a kept table depended on these, this would fail instead of wiping it.
truncate table
  public.audit_logs,
  public.candidate_ai_profiles,
  public.candidate_education,
  public.candidate_files,
  public.candidate_interview_slots,
  public.candidate_match_views,
  public.candidate_matches,
  public.candidate_roles,
  public.candidate_skills,
  public.candidate_tags,
  public.candidate_work_history,
  public.candidates,
  public.client_members,
  public.client_request_skills,
  public.client_requests,
  public.clients,
  public.match_views,
  public.notifications,
  public.placements,
  public.recruiter_notes,
  public.thread_messages,
  public.thread_notes,
  public.thread_reads,
  public.thread_scratchpad,
  public.threads;

-- Setup lists stay, but stop pointing at accounts that are about to be removed.
update public.skills set created_by = null
  where created_by is not null and created_by <> (select id from auth.users where email = 'lola@scalesource.com');
update public.job_roles set created_by = null
  where created_by is not null and created_by <> (select id from auth.users where email = 'lola@scalesource.com');

-- Remove every account except the admin.
delete from public.profiles where id <> (select id from auth.users where email = 'lola@scalesource.com');
delete from auth.users where email <> 'lola@scalesource.com';
