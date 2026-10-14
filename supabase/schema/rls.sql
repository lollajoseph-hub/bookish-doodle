-- Row Level Security state and policies for schema public (from pg_class + pg_policies), captured 2026-10-14.
-- All 30 public tables have RLS ENABLED; none have FORCE ROW LEVEL SECURITY. 91 policies, all PERMISSIVE,
-- all "to public" (role filtering is done inside the expressions via is_staff()/is_admin()/auth.uid()).
-- Function names are unqualified (public); run with search_path = public.
-- Storage (storage.objects) policies are in storage.sql.

-- ---------------------------------------------------------------------------
-- RLS enable / force
-- ---------------------------------------------------------------------------
alter table public.audit_logs enable row level security;
alter table public.candidate_ai_profiles enable row level security;
alter table public.candidate_education enable row level security;
alter table public.candidate_files enable row level security;
alter table public.candidate_interview_slots enable row level security;
alter table public.candidate_match_views enable row level security;
alter table public.candidate_matches enable row level security;
alter table public.candidate_roles enable row level security;
alter table public.candidate_skills enable row level security;
alter table public.candidate_tags enable row level security;
alter table public.candidate_work_history enable row level security;
alter table public.candidates enable row level security;
alter table public.client_members enable row level security;
alter table public.client_request_skills enable row level security;
alter table public.client_requests enable row level security;
alter table public.clients enable row level security;
alter table public.job_roles enable row level security;
alter table public.match_views enable row level security;
alter table public.notifications enable row level security;
alter table public.placements enable row level security;
alter table public.profiles enable row level security;
alter table public.recruiter_notes enable row level security;
alter table public.role_skills enable row level security;
alter table public.skills enable row level security;
alter table public.tags enable row level security;
alter table public.thread_messages enable row level security;
alter table public.thread_notes enable row level security;
alter table public.thread_reads enable row level security;
alter table public.thread_scratchpad enable row level security;
alter table public.threads enable row level security;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs as PERMISSIVE for SELECT to public
  using ((is_admin() OR (is_staff() AND (user_id = ( SELECT auth.uid() AS uid)))));
create policy candidate_ai_profiles_select on public.candidate_ai_profiles as PERMISSIVE for SELECT to public
  using ((is_staff() OR client_can_view_candidate(candidate_id)));
create policy candidate_ai_profiles_staff_delete on public.candidate_ai_profiles as PERMISSIVE for DELETE to public
  using (is_staff());
create policy candidate_ai_profiles_staff_insert on public.candidate_ai_profiles as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy candidate_ai_profiles_staff_update on public.candidate_ai_profiles as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy candidate_education_select on public.candidate_education as PERMISSIVE for SELECT to public
  using ((is_staff() OR client_can_view_candidate(candidate_id)));
create policy candidate_education_staff_delete on public.candidate_education as PERMISSIVE for DELETE to public
  using (is_staff());
create policy candidate_education_staff_insert on public.candidate_education as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy candidate_education_staff_update on public.candidate_education as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy candidate_files_select on public.candidate_files as PERMISSIVE for SELECT to public
  using ((is_staff() OR ((file_type = ANY (ARRAY['profile_photo'::candidate_file_type, 'intro_video'::candidate_file_type])) AND client_can_view_candidate(candidate_id))));
create policy candidate_files_staff_delete on public.candidate_files as PERMISSIVE for DELETE to public
  using (is_staff());
create policy candidate_files_staff_insert on public.candidate_files as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy candidate_files_staff_update on public.candidate_files as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy candidate_interview_slots_staff_all on public.candidate_interview_slots as PERMISSIVE for ALL to public
  using (is_staff())
  with check (is_staff());
create policy candidate_match_views_select on public.candidate_match_views as PERMISSIVE for SELECT to public
  using ((is_staff() OR (profile_id = auth.uid())));
create policy candidate_match_views_update on public.candidate_match_views as PERMISSIVE for UPDATE to public
  using ((profile_id = auth.uid()))
  with check ((profile_id = auth.uid()));
create policy candidate_match_views_upsert on public.candidate_match_views as PERMISSIVE for INSERT to public
  with check ((profile_id = auth.uid()));
create policy candidate_matches_select on public.candidate_matches as PERMISSIVE for SELECT to public
  using ((is_staff() OR client_owns_request(client_request_id)));
create policy candidate_matches_staff_delete on public.candidate_matches as PERMISSIVE for DELETE to public
  using (is_staff());
create policy candidate_matches_staff_insert on public.candidate_matches as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy candidate_matches_staff_update on public.candidate_matches as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy candidate_roles_select on public.candidate_roles as PERMISSIVE for SELECT to public
  using ((is_staff() OR client_can_view_candidate(candidate_id)));
create policy candidate_roles_staff_delete on public.candidate_roles as PERMISSIVE for DELETE to public
  using (is_staff());
create policy candidate_roles_staff_insert on public.candidate_roles as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy candidate_roles_staff_update on public.candidate_roles as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy candidate_skills_select on public.candidate_skills as PERMISSIVE for SELECT to public
  using ((is_staff() OR client_can_view_candidate(candidate_id)));
create policy candidate_skills_staff_delete on public.candidate_skills as PERMISSIVE for DELETE to public
  using (is_staff());
create policy candidate_skills_staff_insert on public.candidate_skills as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy candidate_skills_staff_update on public.candidate_skills as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy candidate_tags_staff_all on public.candidate_tags as PERMISSIVE for ALL to public
  using (is_staff())
  with check (is_staff());
create policy candidate_work_history_select on public.candidate_work_history as PERMISSIVE for SELECT to public
  using ((is_staff() OR client_can_view_candidate(candidate_id)));
create policy candidate_work_history_staff_delete on public.candidate_work_history as PERMISSIVE for DELETE to public
  using (is_staff());
create policy candidate_work_history_staff_insert on public.candidate_work_history as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy candidate_work_history_staff_update on public.candidate_work_history as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy candidates_select on public.candidates as PERMISSIVE for SELECT to public
  using ((is_staff() OR client_can_view_candidate(id)));
create policy candidates_staff_delete on public.candidates as PERMISSIVE for DELETE to public
  using (is_staff());
create policy candidates_staff_insert on public.candidates as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy candidates_staff_update on public.candidates as PERMISSIVE for UPDATE to public
  using ((is_admin() OR (is_recruiter() AND (recruiter_id = ( SELECT auth.uid() AS uid)))))
  with check ((is_admin() OR (is_recruiter() AND (recruiter_id = ( SELECT auth.uid() AS uid)))));
create policy client_members_select on public.client_members as PERMISSIVE for SELECT to public
  using ((is_staff() OR (profile_id = ( SELECT auth.uid() AS uid))));
create policy client_members_staff_delete on public.client_members as PERMISSIVE for DELETE to public
  using (is_staff());
create policy client_members_staff_insert on public.client_members as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy client_members_staff_update on public.client_members as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy client_request_skills_insert on public.client_request_skills as PERMISSIVE for INSERT to public
  with check ((is_staff() OR client_owns_request(request_id)));
create policy client_request_skills_select on public.client_request_skills as PERMISSIVE for SELECT to public
  using ((is_staff() OR client_owns_request(request_id)));
create policy client_request_skills_staff_delete on public.client_request_skills as PERMISSIVE for DELETE to public
  using (is_staff());
create policy client_request_skills_staff_update on public.client_request_skills as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy client_requests_insert on public.client_requests as PERMISSIVE for INSERT to public
  with check ((is_staff() OR (client_id IN ( SELECT client_ids_for_profile(( SELECT auth.uid() AS uid)) AS client_ids_for_profile))));
create policy client_requests_select on public.client_requests as PERMISSIVE for SELECT to public
  using ((is_staff() OR (client_id IN ( SELECT client_ids_for_profile(( SELECT auth.uid() AS uid)) AS client_ids_for_profile))));
create policy client_requests_staff_delete on public.client_requests as PERMISSIVE for DELETE to public
  using (is_staff());
create policy client_requests_staff_update on public.client_requests as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy clients_select on public.clients as PERMISSIVE for SELECT to public
  using ((is_staff() OR (id IN ( SELECT client_ids_for_profile(( SELECT auth.uid() AS uid)) AS client_ids_for_profile)) OR (parent_client_id IN ( SELECT client_ids_for_profile(( SELECT auth.uid() AS uid)) AS client_ids_for_profile))));
create policy clients_staff_delete on public.clients as PERMISSIVE for DELETE to public
  using (is_staff());
create policy clients_staff_insert on public.clients as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy clients_staff_update on public.clients as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy job_roles_admin_delete on public.job_roles as PERMISSIVE for DELETE to public
  using (is_admin());
create policy job_roles_admin_insert on public.job_roles as PERMISSIVE for INSERT to public
  with check (is_admin());
create policy job_roles_admin_update on public.job_roles as PERMISSIVE for UPDATE to public
  using (is_admin());
create policy job_roles_select on public.job_roles as PERMISSIVE for SELECT to public
  using (((is_active = true) OR is_staff()));
create policy match_views_staff_select on public.match_views as PERMISSIVE for SELECT to public
  using (is_staff());
create policy notifications_self_select on public.notifications as PERMISSIVE for SELECT to public
  using ((recipient_id = ( SELECT auth.uid() AS uid)));
create policy notifications_self_update on public.notifications as PERMISSIVE for UPDATE to public
  using ((recipient_id = ( SELECT auth.uid() AS uid)))
  with check ((recipient_id = ( SELECT auth.uid() AS uid)));
create policy notifications_staff_insert on public.notifications as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy placements_select on public.placements as PERMISSIVE for SELECT to public
  using ((is_staff() OR (client_id IN ( SELECT client_ids_for_profile(( SELECT auth.uid() AS uid)) AS client_ids_for_profile))));
create policy placements_staff_delete on public.placements as PERMISSIVE for DELETE to public
  using (is_staff());
create policy placements_staff_insert on public.placements as PERMISSIVE for INSERT to public
  with check (is_staff());
create policy placements_staff_update on public.placements as PERMISSIVE for UPDATE to public
  using (is_staff())
  with check (is_staff());
create policy profiles_admin_delete on public.profiles as PERMISSIVE for DELETE to public
  using (is_admin());
create policy profiles_admin_insert on public.profiles as PERMISSIVE for INSERT to public
  with check (is_admin());
create policy profiles_select on public.profiles as PERMISSIVE for SELECT to public
  using (((id = ( SELECT auth.uid() AS uid)) OR is_staff()));
create policy profiles_update_self on public.profiles as PERMISSIVE for UPDATE to public
  using (((id = ( SELECT auth.uid() AS uid)) OR is_admin()))
  with check (((id = ( SELECT auth.uid() AS uid)) OR is_admin()));
create policy recruiter_notes_staff_all on public.recruiter_notes as PERMISSIVE for ALL to public
  using (is_staff())
  with check (is_staff());
create policy role_skills_admin_delete on public.role_skills as PERMISSIVE for DELETE to public
  using (is_admin());
create policy role_skills_admin_insert on public.role_skills as PERMISSIVE for INSERT to public
  with check (is_admin());
create policy role_skills_admin_update on public.role_skills as PERMISSIVE for UPDATE to public
  using (is_admin())
  with check (is_admin());
create policy role_skills_select on public.role_skills as PERMISSIVE for SELECT to public
  using (is_staff());
create policy skills_admin_delete on public.skills as PERMISSIVE for DELETE to public
  using (is_admin());
create policy skills_admin_insert on public.skills as PERMISSIVE for INSERT to public
  with check (is_admin());
create policy skills_admin_update on public.skills as PERMISSIVE for UPDATE to public
  using (is_admin());
create policy skills_public_select on public.skills as PERMISSIVE for SELECT to public
  using (true);
create policy tags_staff_all on public.tags as PERMISSIVE for ALL to public
  using (is_staff())
  with check (is_staff());
create policy thread_messages_insert on public.thread_messages as PERMISSIVE for INSERT to public
  with check (((sender_id = auth.uid()) AND (is_staff() OR (EXISTS ( SELECT 1
   FROM threads t
  WHERE ((t.id = thread_messages.thread_id) AND (t.client_id IN ( SELECT client_ids_for_profile(auth.uid()) AS client_ids_for_profile))))))));
create policy thread_messages_select on public.thread_messages as PERMISSIVE for SELECT to public
  using ((is_staff() OR (EXISTS ( SELECT 1
   FROM threads t
  WHERE ((t.id = thread_messages.thread_id) AND (t.client_id IN ( SELECT client_ids_for_profile(auth.uid()) AS client_ids_for_profile)))))));
create policy thread_notes_select on public.thread_notes as PERMISSIVE for SELECT to public
  using ((EXISTS ( SELECT 1
   FROM threads t
  WHERE ((t.id = thread_notes.thread_id) AND (is_staff() OR (t.client_id IN ( SELECT client_ids_for_profile(auth.uid()) AS client_ids_for_profile)))))));
create policy thread_reads_insert on public.thread_reads as PERMISSIVE for INSERT to public
  with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM threads t
  WHERE (t.id = thread_reads.thread_id)))));
create policy thread_reads_select on public.thread_reads as PERMISSIVE for SELECT to public
  using ((user_id = auth.uid()));
create policy thread_reads_update on public.thread_reads as PERMISSIVE for UPDATE to public
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));
create policy thread_scratchpad_select on public.thread_scratchpad as PERMISSIVE for SELECT to public
  using ((is_staff() OR (EXISTS ( SELECT 1
   FROM threads t
  WHERE ((t.id = thread_scratchpad.thread_id) AND (t.kind = 'candidate'::text) AND (t.client_id IN ( SELECT client_ids_for_profile(auth.uid()) AS client_ids_for_profile)))))));
create policy thread_scratchpad_update on public.thread_scratchpad as PERMISSIVE for UPDATE to public
  using ((is_staff() OR (EXISTS ( SELECT 1
   FROM threads t
  WHERE ((t.id = thread_scratchpad.thread_id) AND (t.kind = 'candidate'::text) AND (t.client_id IN ( SELECT client_ids_for_profile(auth.uid()) AS client_ids_for_profile)))))));
create policy thread_scratchpad_upsert on public.thread_scratchpad as PERMISSIVE for INSERT to public
  with check ((is_staff() OR (EXISTS ( SELECT 1
   FROM threads t
  WHERE ((t.id = thread_scratchpad.thread_id) AND (t.kind = 'candidate'::text) AND (t.client_id IN ( SELECT client_ids_for_profile(auth.uid()) AS client_ids_for_profile)))))));
create policy threads_insert on public.threads as PERMISSIVE for INSERT to public
  with check ((is_staff() OR (client_id IN ( SELECT client_ids_for_profile(auth.uid()) AS client_ids_for_profile))));
create policy threads_select on public.threads as PERMISSIVE for SELECT to public
  using ((is_staff() OR (client_id IN ( SELECT client_ids_for_profile(auth.uid()) AS client_ids_for_profile))));
