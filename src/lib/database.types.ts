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
