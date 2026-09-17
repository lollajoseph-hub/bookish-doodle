import { supabase } from "./supabase";
import type {
  CandidateAvailability,
  CandidateRow,
  EducationRow,
  JobRoleRow,
  ProfileRow,
  RecruiterNoteRow,
  SkillRow,
  WorkHistoryRow,
} from "./database.types";

/* ---------------------------------- roles --------------------------------- */

export async function fetchJobRoles(): Promise<JobRoleRow[]> {
  const { data, error } = await supabase
    .from("job_roles")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createJobRole(input: {
  name: string;
  description?: string | null;
  createdBy?: string | null;
}): Promise<JobRoleRow> {
  const { data, error } = await supabase
    .from("job_roles")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      is_active: true,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/* --------------------------------- people --------------------------------- */

export async function fetchStaffProfiles(): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["admin", "recruiter"])
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------- candidates -------------------------------- */

export interface CandidateListItem extends CandidateRow {
  roleIds: string[];
  recruiterName: string | null;
  skillCount: number;
}

export async function fetchCandidates(): Promise<CandidateListItem[]> {
  const [candidatesRes, rolesRes, skillsRes, staff] = await Promise.all([
    supabase.from("candidates").select("*").order("created_at", { ascending: false }),
    supabase.from("candidate_roles").select("candidate_id, role_id, is_primary"),
    supabase.from("candidate_skills").select("candidate_id, skill_id"),
    fetchStaffProfiles(),
  ]);
  if (candidatesRes.error) throw candidatesRes.error;
  if (rolesRes.error) throw rolesRes.error;

  const byRecruiter = new Map(staff.map((p) => [p.id, p.full_name || p.email]));
  const rolesByCandidate = new Map<string, string[]>();
  for (const r of rolesRes.data ?? []) {
    const list = rolesByCandidate.get(r.candidate_id) ?? [];
    list.push(r.role_id);
    rolesByCandidate.set(r.candidate_id, list);
  }
  const skillCounts = new Map<string, number>();
  for (const s of skillsRes.data ?? []) {
    skillCounts.set(s.candidate_id, (skillCounts.get(s.candidate_id) ?? 0) + 1);
  }

  return (candidatesRes.data ?? []).map((c) => ({
    ...c,
    roleIds: rolesByCandidate.get(c.id) ?? [],
    recruiterName: c.recruiter_id ? (byRecruiter.get(c.recruiter_id) ?? null) : null,
    skillCount: skillCounts.get(c.id) ?? 0,
  }));
}

export interface CandidateDetail {
  candidate: CandidateRow;
  roleIds: string[];
  skills: SkillRow[];
  workHistory: WorkHistoryRow[];
  education: EducationRow[];
  notes: RecruiterNoteRow[];
}

export async function fetchCandidateDetail(id: string): Promise<CandidateDetail> {
  const [candRes, rolesRes, csRes, whRes, eduRes, notesRes, allSkills] = await Promise.all([
    supabase.from("candidates").select("*").eq("id", id).maybeSingle(),
    supabase.from("candidate_roles").select("role_id").eq("candidate_id", id),
    supabase.from("candidate_skills").select("skill_id").eq("candidate_id", id),
    supabase
      .from("candidate_work_history")
      .select("*")
      .eq("candidate_id", id)
      .order("start_date", { ascending: false }),
    supabase
      .from("candidate_education")
      .select("*")
      .eq("candidate_id", id)
      .order("start_date", { ascending: false }),
    supabase
      .from("recruiter_notes")
      .select("*")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
    fetchSkills(),
  ]);
  if (candRes.error) throw candRes.error;
  if (!candRes.data) throw new Error("Candidate not found");

  const skillIds = new Set((csRes.data ?? []).map((r) => r.skill_id));
  return {
    candidate: candRes.data,
    roleIds: (rolesRes.data ?? []).map((r) => r.role_id),
    skills: allSkills.filter((s) => skillIds.has(s.id)),
    workHistory: whRes.data ?? [],
    education: eduRes.data ?? [],
    notes: notesRes.data ?? [],
  };
}

/* --------------------------------- skills ---------------------------------- */

export async function fetchSkills(): Promise<SkillRow[]> {
  const { data, error } = await supabase
    .from("skills")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export const LANGUAGE_CATEGORY = "Languages";

/** Resolve (creating when needed) skill ids for the given names within one category. */
async function resolveSkillIdsInCategory(names: string[], category: string): Promise<string[]> {
  const cleaned = Array.from(
    new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)),
  );
  if (!cleaned.length) return [];
  const existing = await fetchSkills();
  const byName = new Map(
    existing.filter((s) => s.category === category).map((s) => [s.name.toLowerCase(), s.id]),
  );
  const ids: string[] = [];
  const toCreate: string[] = [];
  for (const name of cleaned) {
    const hit = byName.get(name.toLowerCase());
    if (hit) ids.push(hit);
    else toCreate.push(name);
  }
  if (toCreate.length) {
    const { data, error } = await supabase
      .from("skills")
      .insert(toCreate.map((name) => ({ name, category })))
      .select("id");
    if (error) throw error;
    ids.push(...(data ?? []).map((s) => s.id));
  }
  return ids;
}

/**
 * Replace ONLY the Languages-category skill links for a candidate.
 * Skill rows in other categories are AI-owned and are never touched here.
 */
export async function syncLanguages(candidateId: string, languageNames: string[]): Promise<void> {
  const allSkills = await fetchSkills();
  const languageSkillIds = allSkills
    .filter((s) => s.category === LANGUAGE_CATEGORY)
    .map((s) => s.id);

  if (languageSkillIds.length) {
    const { error } = await supabase
      .from("candidate_skills")
      .delete()
      .eq("candidate_id", candidateId)
      .in("skill_id", languageSkillIds);
    if (error) throw error;
  }

  const ids = await resolveSkillIdsInCategory(languageNames, LANGUAGE_CATEGORY);
  if (ids.length) {
    const { error } = await supabase
      .from("candidate_skills")
      .insert(ids.map((skill_id) => ({ candidate_id: candidateId, skill_id })));
    if (error) throw error;
  }
}


/* ------------------------------ candidate CRUD ------------------------------ */

export interface CandidateFormInput {
  full_name: string;
  email: string | null;
  phone: string | null;
  recruiter_id: string | null;
  status: string | null;
  headline: string | null;
  years_experience: number | null;
  country: string | null;
  availability: CandidateAvailability | null;
  timezone: string | null;
  weekly_hours_available: number | null;
  preferred_shift: string | null;
  earliest_start_date: string | null;
  intro_video_url: string | null;
  roleIds: string[];
  /** Recruiter-entered languages; stored as Languages-category skills. */
  languageNames: string[];
}

/**
 * Sync only the child records the form actually owns.
 * Skills (other than Languages), work history and education are AI-extracted
 * from the resume and must never be wiped by a form submit.
 */
async function syncChildren(candidateId: string, input: CandidateFormInput) {
  await supabase.from("candidate_roles").delete().eq("candidate_id", candidateId);
  if (input.roleIds.length) {
    const { error } = await supabase.from("candidate_roles").insert(
      input.roleIds.map((role_id, i) => ({
        candidate_id: candidateId,
        role_id,
        is_primary: i === 0,
      })),
    );
    if (error) throw error;
  }

  await syncLanguages(candidateId, input.languageNames ?? []);
}


export async function createCandidate(
  input: CandidateFormInput,
  createdBy: string | null,
): Promise<string> {
  const { data, error } = await supabase
    .from("candidates")
    .insert({
      full_name: input.full_name.trim(),
      email: input.email,
      phone: input.phone,
      recruiter_id: input.recruiter_id,
      status: "new",
      headline: input.headline,
      years_experience: input.years_experience,
      country: input.country,
      availability: input.availability,
      timezone: input.timezone,
      weekly_hours_available: input.weekly_hours_available,
      preferred_shift: input.preferred_shift,
      earliest_start_date: input.earliest_start_date,
      intro_video_url: input.intro_video_url,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  await syncChildren(data.id, input);
  return data.id;
}

export async function updateCandidate(id: string, input: CandidateFormInput): Promise<void> {
  const { error } = await supabase
    .from("candidates")
    .update({
      full_name: input.full_name.trim(),
      email: input.email,
      phone: input.phone,
      recruiter_id: input.recruiter_id,
      headline: input.headline,
      years_experience: input.years_experience,
      country: input.country,
      availability: input.availability,
      timezone: input.timezone,
      weekly_hours_available: input.weekly_hours_available,
      preferred_shift: input.preferred_shift,
      earliest_start_date: input.earliest_start_date,
      intro_video_url: input.intro_video_url,
    })
    .eq("id", id);
  if (error) throw error;
  await syncChildren(id, input);
}

export async function deleteCandidate(id: string): Promise<void> {
  const { error } = await supabase.from("candidates").delete().eq("id", id);
  if (error) throw error;
}

export async function addRecruiterNote(
  candidateId: string,
  recruiterId: string,
  note: string,
): Promise<void> {
  const { error } = await supabase
    .from("recruiter_notes")
    .insert({ candidate_id: candidateId, recruiter_id: recruiterId, note });
  if (error) throw error;
}
