create or replace function public.client_can_view_candidate(p_candidate_id uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1
    from public.candidate_matches cm
    join public.client_requests cr on cr.id = cm.client_request_id
    join public.client_members cme on cme.client_id = cr.client_id
    where cm.candidate_id = p_candidate_id and cme.profile_id = auth.uid()
  );
$$;

create or replace function public.client_owns_request(p_request_id uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.client_requests cr
    join public.client_members cme on cme.client_id = cr.client_id
    where cr.id = p_request_id and cme.profile_id = auth.uid()
  );
$$;

-- profiles
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy profiles_admin_insert on public.profiles for insert with check (public.is_admin());
create policy profiles_admin_delete on public.profiles for delete using (public.is_admin());

-- job_roles
alter table public.job_roles enable row level security;
create policy job_roles_select on public.job_roles for select using (public.is_staff());
create policy job_roles_admin_insert on public.job_roles for insert with check (public.is_admin());
create policy job_roles_admin_update on public.job_roles for update using (public.is_admin());
create policy job_roles_admin_delete on public.job_roles for delete using (public.is_admin());

-- skills
alter table public.skills enable row level security;
create policy skills_select on public.skills for select using (public.is_staff());
create policy skills_admin_insert on public.skills for insert with check (public.is_admin());
create policy skills_admin_update on public.skills for update using (public.is_admin());
create policy skills_admin_delete on public.skills for delete using (public.is_admin());

-- role_skills
alter table public.role_skills enable row level security;
create policy role_skills_select on public.role_skills for select using (public.is_staff());
create policy role_skills_admin_all on public.role_skills for all using (public.is_admin()) with check (public.is_admin());

-- candidates
alter table public.candidates enable row level security;
create policy candidates_staff_all on public.candidates for all using (public.is_staff()) with check (public.is_staff());
create policy candidates_client_select on public.candidates for select using (public.client_can_view_candidate(id));

-- candidate sub-tables: staff manage, client read-only for viewable candidates
alter table public.candidate_roles enable row level security;
create policy candidate_roles_staff_all on public.candidate_roles for all using (public.is_staff()) with check (public.is_staff());
create policy candidate_roles_client_select on public.candidate_roles for select using (public.client_can_view_candidate(candidate_id));

alter table public.candidate_skills enable row level security;
create policy candidate_skills_staff_all on public.candidate_skills for all using (public.is_staff()) with check (public.is_staff());
create policy candidate_skills_client_select on public.candidate_skills for select using (public.client_can_view_candidate(candidate_id));

alter table public.candidate_work_history enable row level security;
create policy candidate_work_history_staff_all on public.candidate_work_history for all using (public.is_staff()) with check (public.is_staff());
create policy candidate_work_history_client_select on public.candidate_work_history for select using (public.client_can_view_candidate(candidate_id));

alter table public.candidate_education enable row level security;
create policy candidate_education_staff_all on public.candidate_education for all using (public.is_staff()) with check (public.is_staff());
create policy candidate_education_client_select on public.candidate_education for select using (public.client_can_view_candidate(candidate_id));

alter table public.candidate_ai_profiles enable row level security;
create policy candidate_ai_profiles_staff_all on public.candidate_ai_profiles for all using (public.is_staff()) with check (public.is_staff());
create policy candidate_ai_profiles_client_select on public.candidate_ai_profiles for select using (public.client_can_view_candidate(candidate_id));

alter table public.candidate_files enable row level security;
create policy candidate_files_staff_all on public.candidate_files for all using (public.is_staff()) with check (public.is_staff());
create policy candidate_files_client_select on public.candidate_files for select using (
  file_type in ('profile_photo','intro_video') and public.client_can_view_candidate(candidate_id)
);

-- internal-only, never client-visible
alter table public.recruiter_notes enable row level security;
create policy recruiter_notes_staff_all on public.recruiter_notes for all using (public.is_staff()) with check (public.is_staff());

alter table public.tags enable row level security;
create policy tags_staff_all on public.tags for all using (public.is_staff()) with check (public.is_staff());

alter table public.candidate_tags enable row level security;
create policy candidate_tags_staff_all on public.candidate_tags for all using (public.is_staff()) with check (public.is_staff());

-- clients
alter table public.clients enable row level security;
create policy clients_staff_all on public.clients for all using (public.is_staff()) with check (public.is_staff());
create policy clients_member_select on public.clients for select using (
  id in (select public.client_ids_for_profile(auth.uid()))
  or parent_client_id in (select public.client_ids_for_profile(auth.uid()))
);

alter table public.client_members enable row level security;
create policy client_members_staff_all on public.client_members for all using (public.is_staff()) with check (public.is_staff());
create policy client_members_self_select on public.client_members for select using (profile_id = auth.uid());

-- client_requests
alter table public.client_requests enable row level security;
create policy client_requests_staff_all on public.client_requests for all using (public.is_staff()) with check (public.is_staff());
create policy client_requests_member_select on public.client_requests for select using (
  client_id in (select public.client_ids_for_profile(auth.uid()))
);
create policy client_requests_member_insert on public.client_requests for insert with check (
  client_id in (select public.client_ids_for_profile(auth.uid()))
);

alter table public.client_request_skills enable row level security;
create policy client_request_skills_staff_all on public.client_request_skills for all using (public.is_staff()) with check (public.is_staff());
create policy client_request_skills_member_select on public.client_request_skills for select using (
  public.client_owns_request(request_id)
);
create policy client_request_skills_member_insert on public.client_request_skills for insert with check (
  public.client_owns_request(request_id)
);

-- candidate_matches: staff full; client read-only (status changes go through security-definer RPCs)
alter table public.candidate_matches enable row level security;
create policy candidate_matches_staff_all on public.candidate_matches for all using (public.is_staff()) with check (public.is_staff());
create policy candidate_matches_member_select on public.candidate_matches for select using (
  public.client_owns_request(client_request_id)
);

-- placements
alter table public.placements enable row level security;
create policy placements_staff_all on public.placements for all using (public.is_staff()) with check (public.is_staff());
create policy placements_member_select on public.placements for select using (
  client_id in (select public.client_ids_for_profile(auth.uid()))
);

-- notifications
alter table public.notifications enable row level security;
create policy notifications_self_select on public.notifications for select using (recipient_id = auth.uid());
create policy notifications_self_update on public.notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_staff_insert on public.notifications for insert with check (public.is_staff());

-- audit_logs: admin read-only, writes only via security-definer trigger
alter table public.audit_logs enable row level security;
create policy audit_logs_admin_select on public.audit_logs for select using (public.is_admin());
