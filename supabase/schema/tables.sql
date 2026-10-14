-- Reconstructed from pg_catalog on 2026-10-14 (project kjpozzjeddvctcabtnzg).
-- Only the "public" schema contains application tables (30). No other non-system app schemas
-- (no "private" schema exists). Types referenced here are defined in types.sql.
-- Note: FK references to other public tables are unqualified as printed by pg_get_constraintdef.
-- Order is alphabetical, not dependency order: when restoring, create types first, then tables
-- without FKs, or run with FKs added afterwards.

create table public.audit_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamp with time zone default now() not null,
  constraint audit_logs_pkey PRIMARY KEY (id),
  constraint audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id)
);

create table public.candidate_ai_profiles (
  candidate_id uuid not null,
  recruiter_summary text,
  approved_summary text,
  skills jsonb,
  highlights jsonb,
  rank_score numeric,
  model_version text,
  generated_at timestamp with time zone,
  ai_metadata jsonb,
  updated_at timestamp with time zone default now() not null,
  rank_score_breakdown jsonb,
  constraint candidate_ai_profiles_pkey PRIMARY KEY (candidate_id),
  constraint candidate_ai_profiles_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

create table public.candidate_education (
  id uuid default gen_random_uuid() not null,
  candidate_id uuid not null,
  institution text,
  degree text,
  field text,
  start_date text,
  end_date text,
  display_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint candidate_education_pkey PRIMARY KEY (id),
  constraint candidate_education_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

create table public.candidate_files (
  id uuid default gen_random_uuid() not null,
  candidate_id uuid not null,
  file_type candidate_file_type not null,
  bucket_id text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint candidate_files_pkey PRIMARY KEY (id),
  constraint candidate_files_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  constraint candidate_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id)
);

create table public.candidate_interview_slots (
  id uuid default gen_random_uuid() not null,
  candidate_id uuid not null,
  starts_at timestamp with time zone not null,
  duration_minutes integer not null,
  booked_match_id uuid,
  booked_at timestamp with time zone,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  constraint candidate_interview_slots_candidate_id_starts_at_key UNIQUE (candidate_id, starts_at),
  constraint candidate_interview_slots_pkey PRIMARY KEY (id),
  constraint candidate_interview_slots_booked_match_id_fkey FOREIGN KEY (booked_match_id) REFERENCES candidate_matches(id) ON DELETE SET NULL,
  constraint candidate_interview_slots_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  constraint candidate_interview_slots_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  constraint candidate_interview_slots_duration_minutes_check CHECK (((duration_minutes >= 15) AND (duration_minutes <= 240)))
);

create table public.candidate_match_views (
  profile_id uuid not null,
  candidate_match_id uuid not null,
  last_seen_status match_status not null,
  last_seen_at timestamp with time zone default now() not null,
  constraint candidate_match_views_pkey PRIMARY KEY (profile_id, candidate_match_id),
  constraint candidate_match_views_candidate_match_id_fkey FOREIGN KEY (candidate_match_id) REFERENCES candidate_matches(id) ON DELETE CASCADE,
  constraint candidate_match_views_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.candidate_matches (
  id uuid default gen_random_uuid() not null,
  client_request_id uuid not null,
  candidate_id uuid not null,
  match_score numeric,
  match_reason text,
  status match_status default 'recommended'::match_status not null,
  rejection_reason rejection_reason,
  rejection_reason_note text,
  rejected_at timestamp with time zone,
  meet_url text,
  interview_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  interview_scheduled_at timestamp with time zone,
  interview_notes text,
  google_event_id text,
  gcal_synced_at timestamp with time zone,
  interview_proposed_at timestamp with time zone,
  interview_proposed_by text,
  rejected_by text,
  hire_requested_at timestamp with time zone,
  client_event_id text,
  candidate_event_id text,
  meeting_notes_doc_url text,
  meeting_notes_text text,
  meeting_notes_captured_at timestamp with time zone,
  recording_url text,
  recording_captured_at timestamp with time zone,
  shortlisted_at timestamp with time zone,
  shortlist_reminder_sent_at timestamp with time zone,
  interview_completed_at timestamp with time zone,
  client_rating smallint,
  client_rating_note text,
  client_rated_at timestamp with time zone,
  status_changed_at timestamp with time zone default now() not null,
  interview_duration_minutes integer,
  constraint candidate_matches_client_request_id_candidate_id_key UNIQUE (client_request_id, candidate_id),
  constraint candidate_matches_pkey PRIMARY KEY (id),
  constraint candidate_matches_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  constraint candidate_matches_client_request_id_fkey FOREIGN KEY (client_request_id) REFERENCES client_requests(id) ON DELETE CASCADE,
  constraint candidate_matches_client_rating_range CHECK (((client_rating IS NULL) OR ((client_rating >= 1) AND (client_rating <= 5)))),
  constraint candidate_matches_interview_proposed_by_check CHECK ((interview_proposed_by = ANY (ARRAY['client'::text, 'staff'::text]))),
  constraint candidate_matches_rejected_by_check CHECK ((rejected_by = ANY (ARRAY['client'::text, 'staff'::text])))
);

create table public.candidate_roles (
  candidate_id uuid not null,
  role_id uuid not null,
  is_primary boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint candidate_roles_pkey PRIMARY KEY (candidate_id, role_id),
  constraint candidate_roles_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  constraint candidate_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES job_roles(id) ON DELETE CASCADE
);

create table public.candidate_skills (
  candidate_id uuid not null,
  skill_id uuid not null,
  proficiency_level text,
  years_experience numeric,
  created_at timestamp with time zone default now() not null,
  constraint candidate_skills_pkey PRIMARY KEY (candidate_id, skill_id),
  constraint candidate_skills_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  constraint candidate_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

create table public.candidate_tags (
  candidate_id uuid not null,
  tag_id uuid not null,
  recruiter_id uuid,
  created_at timestamp with time zone default now() not null,
  constraint candidate_tags_pkey PRIMARY KEY (candidate_id, tag_id),
  constraint candidate_tags_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  constraint candidate_tags_recruiter_id_fkey FOREIGN KEY (recruiter_id) REFERENCES profiles(id),
  constraint candidate_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

create table public.candidate_work_history (
  id uuid default gen_random_uuid() not null,
  candidate_id uuid not null,
  company text,
  title text,
  start_date text,
  end_date text,
  description text,
  display_order integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint candidate_work_history_pkey PRIMARY KEY (id),
  constraint candidate_work_history_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

create table public.candidates (
  id uuid default gen_random_uuid() not null,
  full_name text not null,
  headline text,
  country text,
  timezone text,
  weekly_hours_available integer,
  preferred_shift text,
  years_experience numeric,
  earliest_start_date date,
  status candidate_status default 'available'::candidate_status not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  email text,
  phone text,
  recruiter_id uuid,
  intro_video_url text,
  availability availability_status default 'available_now'::availability_status not null,
  constraint candidates_pkey PRIMARY KEY (id),
  constraint candidates_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id),
  constraint candidates_recruiter_id_fkey FOREIGN KEY (recruiter_id) REFERENCES profiles(id)
);

create table public.client_members (
  client_id uuid not null,
  profile_id uuid not null,
  is_primary boolean default false not null,
  created_at timestamp with time zone default now() not null,
  client_position text,
  constraint client_members_pkey PRIMARY KEY (client_id, profile_id),
  constraint client_members_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  constraint client_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.client_request_skills (
  request_id uuid not null,
  skill_id uuid not null,
  is_required boolean default true not null,
  constraint client_request_skills_pkey PRIMARY KEY (request_id, skill_id),
  constraint client_request_skills_request_id_fkey FOREIGN KEY (request_id) REFERENCES client_requests(id) ON DELETE CASCADE,
  constraint client_request_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

create table public.client_requests (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  role_id uuid not null,
  title text,
  candidates_wanted integer default 4 not null,
  engagement_type engagement_type not null,
  hours_needed text,
  timezone_requirement text,
  years_experience_min numeric,
  desired_start_date date,
  notes text,
  status client_request_status default 'open'::client_request_status not null,
  rejection_count integer default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  hires_needed integer default 1 not null,
  days_of_week_needed text[],
  source client_request_source default 'standard'::client_request_source not null,
  priority text default 'normal'::text not null,
  constraint client_requests_pkey PRIMARY KEY (id),
  constraint client_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  constraint client_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id),
  constraint client_requests_role_id_fkey FOREIGN KEY (role_id) REFERENCES job_roles(id),
  constraint client_requests_priority_check CHECK ((priority = ANY (ARRAY['normal'::text, 'high'::text, 'urgent'::text])))
);

create table public.clients (
  id uuid default gen_random_uuid() not null,
  name text not null,
  parent_client_id uuid,
  is_franchise_brand boolean default false not null,
  industry text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  pending_contact jsonb,
  constraint clients_pkey PRIMARY KEY (id),
  constraint clients_parent_client_id_fkey FOREIGN KEY (parent_client_id) REFERENCES clients(id)
);

create table public.job_roles (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text,
  is_active boolean default true not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint job_roles_name_key UNIQUE (name),
  constraint job_roles_pkey PRIMARY KEY (id),
  constraint job_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id)
);

create table public.match_views (
  id uuid default gen_random_uuid() not null,
  match_id uuid not null,
  viewed_by uuid,
  viewed_at timestamp with time zone default now() not null,
  constraint match_views_pkey PRIMARY KEY (id),
  constraint match_views_match_id_fkey FOREIGN KEY (match_id) REFERENCES candidate_matches(id) ON DELETE CASCADE,
  constraint match_views_viewed_by_fkey FOREIGN KEY (viewed_by) REFERENCES profiles(id) ON DELETE SET NULL
);

create table public.notifications (
  id uuid default gen_random_uuid() not null,
  recipient_id uuid not null,
  title text not null,
  message text,
  type text,
  read boolean default false not null,
  created_at timestamp with time zone default now() not null,
  send_email boolean default true not null,
  email_sent_at timestamp with time zone,
  constraint notifications_pkey PRIMARY KEY (id),
  constraint notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.placements (
  id uuid default gen_random_uuid() not null,
  candidate_id uuid not null,
  client_id uuid not null,
  client_request_id uuid,
  role_id uuid,
  seat_title text,
  billing_start_date date,
  monthly_rate numeric,
  guarantee_window_expires date,
  status placement_status default 'active'::placement_status not null,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint placements_pkey PRIMARY KEY (id),
  constraint placements_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id),
  constraint placements_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id),
  constraint placements_client_request_id_fkey FOREIGN KEY (client_request_id) REFERENCES client_requests(id),
  constraint placements_role_id_fkey FOREIGN KEY (role_id) REFERENCES job_roles(id)
);

create table public.profiles (
  id uuid not null,
  role user_role default 'client'::user_role not null,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

create table public.recruiter_notes (
  id uuid default gen_random_uuid() not null,
  candidate_id uuid not null,
  recruiter_id uuid,
  note text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint recruiter_notes_pkey PRIMARY KEY (id),
  constraint recruiter_notes_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  constraint recruiter_notes_recruiter_id_fkey FOREIGN KEY (recruiter_id) REFERENCES profiles(id)
);

create table public.role_skills (
  role_id uuid not null,
  skill_id uuid not null,
  constraint role_skills_pkey PRIMARY KEY (role_id, skill_id),
  constraint role_skills_role_id_fkey FOREIGN KEY (role_id) REFERENCES job_roles(id) ON DELETE CASCADE,
  constraint role_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

create table public.skills (
  id uuid default gen_random_uuid() not null,
  name text not null,
  category text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  constraint skills_name_category_key UNIQUE (name, category),
  constraint skills_pkey PRIMARY KEY (id),
  constraint skills_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id)
);

create table public.tags (
  id uuid default gen_random_uuid() not null,
  name text not null,
  color text,
  created_at timestamp with time zone default now() not null,
  constraint tags_name_key UNIQUE (name),
  constraint tags_pkey PRIMARY KEY (id)
);

create table public.thread_messages (
  id uuid default gen_random_uuid() not null,
  thread_id uuid not null,
  sender_id uuid not null,
  sender_role text not null,
  body text not null,
  structured_type text,
  created_at timestamp with time zone default now() not null,
  constraint thread_messages_pkey PRIMARY KEY (id),
  constraint thread_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id),
  constraint thread_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  constraint thread_messages_body_check CHECK ((btrim(body) <> ''::text)),
  constraint thread_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['staff'::text, 'client'::text]))),
  constraint thread_messages_structured_type_check CHECK ((structured_type = ANY (ARRAY['reschedule_request'::text, 'call_me_asap'::text, 'send_portfolio'::text])))
);

create table public.thread_notes (
  id uuid default gen_random_uuid() not null,
  thread_id uuid not null,
  author_id uuid not null,
  body text not null,
  created_at timestamp with time zone default now() not null,
  constraint thread_notes_pkey PRIMARY KEY (id),
  constraint thread_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id),
  constraint thread_notes_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

create table public.thread_reads (
  user_id uuid not null,
  thread_id uuid not null,
  last_read_at timestamp with time zone not null,
  updated_at timestamp with time zone default now() not null,
  constraint thread_reads_pkey PRIMARY KEY (user_id, thread_id),
  constraint thread_reads_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  constraint thread_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

create table public.thread_scratchpad (
  thread_id uuid not null,
  content text default ''::text not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  constraint thread_scratchpad_pkey PRIMARY KEY (thread_id),
  constraint thread_scratchpad_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
  constraint thread_scratchpad_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id)
);

create table public.threads (
  id uuid default gen_random_uuid() not null,
  client_request_id uuid,
  candidate_match_id uuid,
  kind text not null,
  created_at timestamp with time zone default now() not null,
  client_id uuid not null,
  constraint threads_pkey PRIMARY KEY (id),
  constraint threads_candidate_match_id_fkey FOREIGN KEY (candidate_match_id) REFERENCES candidate_matches(id) ON DELETE CASCADE,
  constraint threads_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  constraint threads_client_request_id_fkey FOREIGN KEY (client_request_id) REFERENCES client_requests(id) ON DELETE CASCADE,
  constraint threads_kind_check CHECK ((kind = ANY (ARRAY['request'::text, 'candidate'::text, 'general'::text]))),
  constraint threads_kind_shape_check CHECK ((((kind = 'general'::text) AND (client_request_id IS NULL) AND (candidate_match_id IS NULL)) OR ((kind = 'request'::text) AND (client_request_id IS NOT NULL) AND (candidate_match_id IS NULL)) OR ((kind = 'candidate'::text) AND (client_request_id IS NOT NULL) AND (candidate_match_id IS NOT NULL))))
);

-- ============================================================================
-- Indexes (excluding those backing PK/UNIQUE constraints above)
-- ============================================================================
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);
CREATE INDEX idx_candidate_education_candidate_id ON public.candidate_education USING btree (candidate_id);
CREATE INDEX idx_candidate_files_candidate_id ON public.candidate_files USING btree (candidate_id);
CREATE INDEX idx_candidate_files_uploaded_by ON public.candidate_files USING btree (uploaded_by);
CREATE INDEX candidate_interview_slots_candidate_idx ON public.candidate_interview_slots USING btree (candidate_id, starts_at);
CREATE INDEX idx_candidate_matches_candidate_id ON public.candidate_matches USING btree (candidate_id);
CREATE INDEX idx_candidate_roles_role_id ON public.candidate_roles USING btree (role_id);
CREATE INDEX idx_candidate_skills_skill_id ON public.candidate_skills USING btree (skill_id);
CREATE INDEX idx_candidate_tags_recruiter_id ON public.candidate_tags USING btree (recruiter_id);
CREATE INDEX idx_candidate_tags_tag_id ON public.candidate_tags USING btree (tag_id);
CREATE INDEX idx_candidate_work_history_candidate_id ON public.candidate_work_history USING btree (candidate_id);
CREATE INDEX idx_candidates_created_by ON public.candidates USING btree (created_by);
CREATE INDEX idx_candidates_recruiter_id ON public.candidates USING btree (recruiter_id);
CREATE INDEX idx_client_members_profile_id ON public.client_members USING btree (profile_id);
CREATE INDEX idx_client_request_skills_skill_id ON public.client_request_skills USING btree (skill_id);
CREATE INDEX idx_client_requests_client_id ON public.client_requests USING btree (client_id);
CREATE INDEX idx_client_requests_created_by ON public.client_requests USING btree (created_by);
CREATE INDEX idx_client_requests_role_id ON public.client_requests USING btree (role_id);
CREATE INDEX idx_clients_parent_client_id ON public.clients USING btree (parent_client_id);
CREATE INDEX idx_job_roles_created_by ON public.job_roles USING btree (created_by);
CREATE INDEX match_views_match_id_idx ON public.match_views USING btree (match_id);
CREATE INDEX match_views_viewed_at_idx ON public.match_views USING btree (viewed_at);
CREATE INDEX idx_notifications_recipient_id ON public.notifications USING btree (recipient_id);
CREATE INDEX idx_placements_candidate_id ON public.placements USING btree (candidate_id);
CREATE INDEX idx_placements_client_id ON public.placements USING btree (client_id);
CREATE INDEX idx_placements_client_request_id ON public.placements USING btree (client_request_id);
CREATE INDEX idx_placements_role_id ON public.placements USING btree (role_id);
CREATE INDEX idx_recruiter_notes_candidate_id ON public.recruiter_notes USING btree (candidate_id);
CREATE INDEX idx_recruiter_notes_recruiter_id ON public.recruiter_notes USING btree (recruiter_id);
CREATE INDEX idx_role_skills_skill_id ON public.role_skills USING btree (skill_id);
CREATE INDEX idx_skills_created_by ON public.skills USING btree (created_by);
CREATE INDEX thread_messages_thread_idx ON public.thread_messages USING btree (thread_id, created_at);
CREATE INDEX thread_notes_thread_id_created_at_idx ON public.thread_notes USING btree (thread_id, created_at);
CREATE UNIQUE INDEX threads_candidate_kind_uidx ON public.threads USING btree (candidate_match_id) WHERE (kind = 'candidate'::text);
CREATE INDEX threads_client_request_idx ON public.threads USING btree (client_request_id);
CREATE UNIQUE INDEX threads_general_kind_uidx ON public.threads USING btree (client_id) WHERE (kind = 'general'::text);
CREATE UNIQUE INDEX threads_request_kind_uidx ON public.threads USING btree (client_request_id) WHERE (kind = 'request'::text);
