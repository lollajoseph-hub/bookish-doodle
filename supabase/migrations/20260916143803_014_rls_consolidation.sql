-- profiles (auth_rls_initplan only)
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = (select auth.uid()) or public.is_staff());
drop policy profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- candidates
drop policy candidates_staff_all on public.candidates;
drop policy candidates_client_select on public.candidates;
create policy candidates_select on public.candidates for select using (public.is_staff() or public.client_can_view_candidate(id));
create policy candidates_staff_insert on public.candidates for insert with check (public.is_staff());
create policy candidates_staff_update on public.candidates for update using (public.is_staff()) with check (public.is_staff());
create policy candidates_staff_delete on public.candidates for delete using (public.is_staff());

-- candidate_roles
drop policy candidate_roles_staff_all on public.candidate_roles;
drop policy candidate_roles_client_select on public.candidate_roles;
create policy candidate_roles_select on public.candidate_roles for select using (public.is_staff() or public.client_can_view_candidate(candidate_id));
create policy candidate_roles_staff_insert on public.candidate_roles for insert with check (public.is_staff());
create policy candidate_roles_staff_update on public.candidate_roles for update using (public.is_staff()) with check (public.is_staff());
create policy candidate_roles_staff_delete on public.candidate_roles for delete using (public.is_staff());

-- candidate_skills
drop policy candidate_skills_staff_all on public.candidate_skills;
drop policy candidate_skills_client_select on public.candidate_skills;
create policy candidate_skills_select on public.candidate_skills for select using (public.is_staff() or public.client_can_view_candidate(candidate_id));
create policy candidate_skills_staff_insert on public.candidate_skills for insert with check (public.is_staff());
create policy candidate_skills_staff_update on public.candidate_skills for update using (public.is_staff()) with check (public.is_staff());
create policy candidate_skills_staff_delete on public.candidate_skills for delete using (public.is_staff());

-- candidate_work_history
drop policy candidate_work_history_staff_all on public.candidate_work_history;
drop policy candidate_work_history_client_select on public.candidate_work_history;
create policy candidate_work_history_select on public.candidate_work_history for select using (public.is_staff() or public.client_can_view_candidate(candidate_id));
create policy candidate_work_history_staff_insert on public.candidate_work_history for insert with check (public.is_staff());
create policy candidate_work_history_staff_update on public.candidate_work_history for update using (public.is_staff()) with check (public.is_staff());
create policy candidate_work_history_staff_delete on public.candidate_work_history for delete using (public.is_staff());

-- candidate_education
drop policy candidate_education_staff_all on public.candidate_education;
drop policy candidate_education_client_select on public.candidate_education;
create policy candidate_education_select on public.candidate_education for select using (public.is_staff() or public.client_can_view_candidate(candidate_id));
create policy candidate_education_staff_insert on public.candidate_education for insert with check (public.is_staff());
create policy candidate_education_staff_update on public.candidate_education for update using (public.is_staff()) with check (public.is_staff());
create policy candidate_education_staff_delete on public.candidate_education for delete using (public.is_staff());

-- candidate_ai_profiles
drop policy candidate_ai_profiles_staff_all on public.candidate_ai_profiles;
drop policy candidate_ai_profiles_client_select on public.candidate_ai_profiles;
create policy candidate_ai_profiles_select on public.candidate_ai_profiles for select using (public.is_staff() or public.client_can_view_candidate(candidate_id));
create policy candidate_ai_profiles_staff_insert on public.candidate_ai_profiles for insert with check (public.is_staff());
create policy candidate_ai_profiles_staff_update on public.candidate_ai_profiles for update using (public.is_staff()) with check (public.is_staff());
create policy candidate_ai_profiles_staff_delete on public.candidate_ai_profiles for delete using (public.is_staff());

-- candidate_files
drop policy candidate_files_staff_all on public.candidate_files;
drop policy candidate_files_client_select on public.candidate_files;
create policy candidate_files_select on public.candidate_files for select using (
  public.is_staff() or (file_type in ('profile_photo','intro_video') and public.client_can_view_candidate(candidate_id))
);
create policy candidate_files_staff_insert on public.candidate_files for insert with check (public.is_staff());
create policy candidate_files_staff_update on public.candidate_files for update using (public.is_staff()) with check (public.is_staff());
create policy candidate_files_staff_delete on public.candidate_files for delete using (public.is_staff());

-- clients
drop policy clients_staff_all on public.clients;
drop policy clients_member_select on public.clients;
create policy clients_select on public.clients for select using (
  public.is_staff()
  or id in (select public.client_ids_for_profile((select auth.uid())))
  or parent_client_id in (select public.client_ids_for_profile((select auth.uid())))
);
create policy clients_staff_insert on public.clients for insert with check (public.is_staff());
create policy clients_staff_update on public.clients for update using (public.is_staff()) with check (public.is_staff());
create policy clients_staff_delete on public.clients for delete using (public.is_staff());

-- client_members
drop policy client_members_staff_all on public.client_members;
drop policy client_members_self_select on public.client_members;
create policy client_members_select on public.client_members for select using (public.is_staff() or profile_id = (select auth.uid()));
create policy client_members_staff_insert on public.client_members for insert with check (public.is_staff());
create policy client_members_staff_update on public.client_members for update using (public.is_staff()) with check (public.is_staff());
create policy client_members_staff_delete on public.client_members for delete using (public.is_staff());

-- client_requests
drop policy client_requests_staff_all on public.client_requests;
drop policy client_requests_member_select on public.client_requests;
drop policy client_requests_member_insert on public.client_requests;
create policy client_requests_select on public.client_requests for select using (
  public.is_staff() or client_id in (select public.client_ids_for_profile((select auth.uid())))
);
create policy client_requests_insert on public.client_requests for insert with check (
  public.is_staff() or client_id in (select public.client_ids_for_profile((select auth.uid())))
);
create policy client_requests_staff_update on public.client_requests for update using (public.is_staff()) with check (public.is_staff());
create policy client_requests_staff_delete on public.client_requests for delete using (public.is_staff());

-- client_request_skills
drop policy client_request_skills_staff_all on public.client_request_skills;
drop policy client_request_skills_member_select on public.client_request_skills;
drop policy client_request_skills_member_insert on public.client_request_skills;
create policy client_request_skills_select on public.client_request_skills for select using (
  public.is_staff() or public.client_owns_request(request_id)
);
create policy client_request_skills_insert on public.client_request_skills for insert with check (
  public.is_staff() or public.client_owns_request(request_id)
);
create policy client_request_skills_staff_update on public.client_request_skills for update using (public.is_staff()) with check (public.is_staff());
create policy client_request_skills_staff_delete on public.client_request_skills for delete using (public.is_staff());

-- candidate_matches
drop policy candidate_matches_staff_all on public.candidate_matches;
drop policy candidate_matches_member_select on public.candidate_matches;
create policy candidate_matches_select on public.candidate_matches for select using (
  public.is_staff() or public.client_owns_request(client_request_id)
);
create policy candidate_matches_staff_insert on public.candidate_matches for insert with check (public.is_staff());
create policy candidate_matches_staff_update on public.candidate_matches for update using (public.is_staff()) with check (public.is_staff());
create policy candidate_matches_staff_delete on public.candidate_matches for delete using (public.is_staff());

-- placements
drop policy placements_staff_all on public.placements;
drop policy placements_member_select on public.placements;
create policy placements_select on public.placements for select using (
  public.is_staff() or client_id in (select public.client_ids_for_profile((select auth.uid())))
);
create policy placements_staff_insert on public.placements for insert with check (public.is_staff());
create policy placements_staff_update on public.placements for update using (public.is_staff()) with check (public.is_staff());
create policy placements_staff_delete on public.placements for delete using (public.is_staff());

-- role_skills
drop policy role_skills_select on public.role_skills;
drop policy role_skills_admin_all on public.role_skills;
create policy role_skills_select on public.role_skills for select using (public.is_staff());
create policy role_skills_admin_insert on public.role_skills for insert with check (public.is_admin());
create policy role_skills_admin_update on public.role_skills for update using (public.is_admin()) with check (public.is_admin());
create policy role_skills_admin_delete on public.role_skills for delete using (public.is_admin());

-- notifications (auth_rls_initplan only)
drop policy notifications_self_select on public.notifications;
create policy notifications_self_select on public.notifications for select using (recipient_id = (select auth.uid()));
drop policy notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications for update
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
