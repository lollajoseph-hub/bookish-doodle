/**
 * Types for the ScaleSource Candidate Pool Review System schema
 * (Supabase project kjpozzjeddvctcabtnzg).
 */

type Tbl<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type AppRoleName = "admin" | "recruiter" | "client" | "candidate";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: AppRoleName;
  avatar_url: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string | null;
}

export interface JobRoleRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export type CandidateAvailability = "available" | "open_to_offers" | "not_available";

export interface CandidateRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  recruiter_id: string | null;
  status: string | null;
  headline: string | null;
  years_experience: number | null;
  country: string | null;
  timezone: string | null;
  availability: CandidateAvailability | null;
  weekly_hours_available: number | null;
  preferred_shift: string | null;
  earliest_start_date: string | null;
  intro_video_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CandidateRoleRow {
  candidate_id: string;
  role_id: string;
  is_primary: boolean | null;
  created_at: string;
}

export interface SkillRow {
  id: string;
  name: string;
  category: string | null;
  created_at: string;
}

export interface RoleSkillRow {
  role_id: string;
  skill_id: string;
}

export interface CandidateSkillRow {
  candidate_id: string;
  skill_id: string;
  years_experience: number | null;
}

export interface WorkHistoryRow {
  id: string;
  candidate_id: string;
  company: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

export interface EducationRow {
  id: string;
  candidate_id: string;
  institution: string | null;
  degree: string | null;
  field: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface RecruiterNoteRow {
  id: string;
  candidate_id: string;
  recruiter_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface TagRow {
  id: string;
  name: string;
  color: string | null;
}

export interface CandidateTagRow {
  candidate_id: string;
  tag_id: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: Tbl<ProfileRow>;
      job_roles: Tbl<JobRoleRow, { name: string; description?: string | null; is_active?: boolean | null; created_by?: string | null }>;
      candidates: Tbl<
        CandidateRow,
        {
          full_name: string;
          email?: string | null;
          phone?: string | null;
          recruiter_id?: string | null;
          status?: string | null;
          headline?: string | null;
          years_experience?: number | null;
          country?: string | null;
          timezone?: string | null;
          availability?: CandidateAvailability | null;
          weekly_hours_available?: number | null;
          preferred_shift?: string | null;
          earliest_start_date?: string | null;
          intro_video_url?: string | null;
          created_by?: string | null;
        }
      >;
      candidate_roles: Tbl<CandidateRoleRow, { candidate_id: string; role_id: string; is_primary?: boolean | null }>;
      skills: Tbl<SkillRow, { name: string; category?: string | null }>;
      role_skills: Tbl<RoleSkillRow, { role_id: string; skill_id: string }>;
      candidate_skills: Tbl<
        CandidateSkillRow,
        { candidate_id: string; skill_id: string; years_experience?: number | null }
      >;
      candidate_work_history: Tbl<
        WorkHistoryRow,
        {
          candidate_id: string;
          company?: string | null;
          title?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          description?: string | null;
        }
      >;
      candidate_education: Tbl<
        EducationRow,
        {
          candidate_id: string;
          institution?: string | null;
          degree?: string | null;
          field?: string | null;
          start_date?: string | null;
          end_date?: string | null;
        }
      >;
      recruiter_notes: Tbl<
        RecruiterNoteRow,
        { candidate_id: string; recruiter_id?: string | null; note?: string | null }
      >;
      tags: Tbl<TagRow, { name: string; color?: string | null }>;
      candidate_tags: Tbl<CandidateTagRow, { candidate_id: string; tag_id: string }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { app_role: AppRoleName };
    CompositeTypes: Record<string, never>;
  };
}

/* ------------------------- clients, requests, matches ------------------------ */

export type EngagementType = "full_time" | "part_time" | "project";
export type RequestStatus = "open" | "needs_attention" | "fulfilled" | "closed";
export type MatchStatus =
  | "recommended"
  | "shortlisted"
  | "interview_requested"
  | "interview_confirmed"
  | "interview_completed"
  | "offer_extended"
  | "hired"
  | "rejected";
export type RejectionReason = "skill_mismatch" | "availability_conflict" | "culture_fit" | "other";
export type PlacementStatus = "active" | "completed" | "terminated";
export type CandidateFileType =
  | "resume"
  | "profile_photo"
  | "intro_video"
  | "id_document"
  | "reference"
  | "other";

export interface ClientRow {
  id: string;
  name: string;
  parent_client_id: string | null;
  is_franchise_brand: boolean | null;
  industry: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ClientMemberRow {
  client_id: string;
  profile_id: string;
  is_primary: boolean | null;
  client_position: string | null;
  created_at: string;
}

export interface ClientRequestRow {
  id: string;
  client_id: string;
  role_id: string;
  title: string | null;
  candidates_wanted: number;
  hires_needed: number;
  engagement_type: EngagementType;
  hours_needed: string | null;
  days_of_week_needed: string[] | null;
  timezone_requirement: string | null;
  years_experience_min: number | null;
  desired_start_date: string | null;
  notes: string | null;
  must_have_skills_text: string | null;
  status: RequestStatus;
  rejection_count: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ClientRequestSkillRow {
  request_id: string;
  skill_id: string;
  is_required: boolean | null;
}

export interface CandidateMatchRow {
  id: string;
  client_request_id: string;
  candidate_id: string;
  match_score: number | null;
  match_reason: string | null;
  status: MatchStatus;
  rejection_reason: RejectionReason | null;
  rejection_reason_note: string | null;
  rejected_at: string | null;
  meet_url: string | null;
  interview_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface PlacementRow {
  id: string;
  candidate_id: string;
  client_id: string;
  client_request_id: string | null;
  role_id: string | null;
  seat_title: string | null;
  billing_start_date: string | null;
  monthly_rate: number | null;
  guarantee_window_expires: string | null;
  status: PlacementStatus;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CandidateFileRow {
  id: string;
  candidate_id: string;
  file_type: CandidateFileType;
  bucket_id: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface CandidateAiProfileRow {
  candidate_id: string;
  recruiter_summary: string | null;
  approved_summary: string | null;
  skills: unknown | null;
  highlights: unknown | null;
  rank_score: number | null;
  model_version: string | null;
  generated_at: string | null;
  ai_metadata: unknown | null;
  updated_at: string | null;
}

export interface NotificationRow {
  id: string;
  recipient_id: string;
  title: string;
  message: string | null;
  type: string | null;
  read: boolean | null;
  created_at: string;
  send_email: boolean | null;
  email_sent_at: string | null;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  old_values: unknown | null;
  new_values: unknown | null;
  created_at: string;
}
