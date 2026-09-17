import { supabase, SUPABASE_FUNCTIONS_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase";

export interface CandidateRow {
  id: string;
  profile_id: string;
  recruiter_id: string | null;
  status: string;
  country: string | null;
  timezone: string | null;
  created_at: string;
  years_customer_service_experience: number | null;
  years_veterinary_experience: number | null;
  profile: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
  recruiter: {
    profile: { full_name: string | null } | null;
  } | null;
  candidate_courses: Array<{
    course_id: string;
    status: string | null;
    enrolled_at: string | null;
    course: { title: string | null } | null;
  }>;
}

export async function fetchCandidates(): Promise<CandidateRow[]> {
  const { data, error } = await supabase
    .from("candidates")
    .select(
      `id, profile_id, recruiter_id, status, country, timezone, created_at, years_customer_service_experience, years_veterinary_experience,
       profile:profiles!candidates_profile_id_fkey ( full_name, email, phone, avatar_url ),
       recruiter:recruiters!candidates_recruiter_id_fkey ( profile:profiles!recruiters_profile_id_fkey ( full_name ) ),
       candidate_courses ( course_id, status, enrolled_at, course:courses ( title ) )`,
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CandidateRow[];
}

export interface DashboardCounts {
  total: number;
  invited: number;
  active: number;
  inTraining: number;
  graduated: number;
  readyForPlacement: number;
  awaitingReview: number;
  avgProgress: number | null;
  uploaded: number;
  trainingFailed: number;
  trainingExpired: number;
  newThisWeek: number;
  certificatesIssued: number;
  activeClinics: number;
  openRequests: number;
  needsRematch: number;
  underReview: number;
  interviewsActive: number;
  offersOut: number;
  placementsConfirmed: number;
  pendingHandoffs: number;
}

export async function fetchDashboardCounts(): Promise<DashboardCounts> {
  const countBy = async (filter?: (q: any) => any) => {
    let q = supabase.from("candidates").select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };
  const countFrom = async (table: string, filter?: (q: any) => any) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();

  const [
    total,
    invited,
    inTraining,
    graduated,
    ready,
    active,
    uploaded,
    trainingFailed,
    trainingExpired,
    newThisWeek,
    certificatesIssued,
    activeClinics,
    openRequests,
    needsRematch,
    underReview,
    interviewsActive,
    offersOut,
    placementsConfirmed,
    pendingHandoffs,
  ] = await Promise.all([
    countBy(),
    countBy((q) => q.eq("status", "invited")),
    countBy((q) => q.eq("status", "training_in_progress")),
    countBy((q) => q.in("status", ["qualified", "placed"])),
    countBy((q) => q.eq("status", "qualified")),
    countBy((q) => q.in("status", ["invited", "training_in_progress"])),
    countBy((q) => q.eq("status", "uploaded")),
    countBy((q) => q.eq("status", "training_failed")),
    countBy((q) => q.eq("status", "training_expired")),
    countBy((q) => q.gte("created_at", weekAgo)),
    countFrom("certificates", (q) => q.eq("status", "issued")),
    countFrom("clinics", (q) => q.eq("status", "active")),
    countFrom("client_requests", (q) =>
      q.in("status", ["draft", "matching", "presented", "in_progress", "needs_rematch"]),
    ),
    countFrom("client_requests", (q) => q.eq("status", "needs_rematch")),
    countFrom("candidate_matches", (q) =>
      q.in("status", ["recommended", "presented", "reviewing"]),
    ),
    countFrom("candidate_matches", (q) =>
      q.in("status", [
        "interview_requested",
        "interview_scheduled",
        "interviewing",
        "interview_proposed",
        "interview_accepted",
        "interview_reschedule_requested",
        "interview_reschedule_proposed",
        "interview_confirmed",
      ]),
    ),
    countFrom("candidate_matches", (q) => q.eq("status", "offer_extended")),
    countFrom("placements", (q) => q.eq("status", "confirmed")),
    countFrom("cs_handoffs", (q) => q.eq("status", "pending")),
  ]);

  // Awaiting review: distinct candidates with roleplay sessions ungraded
  const { data: rp } = await supabase
    .from("roleplay_sessions")
    .select("candidate_id")
    .is("score", null)
    .is("completed_at", null);
  const awaitingReview = new Set((rp ?? []).map((r: any) => r.candidate_id)).size;

  // Average progress across enrolled candidates
  const { data: enrollments } = await supabase
    .from("candidate_courses")
    .select("candidate_id, course_id");
  let avgProgress: number | null = null;
  if (enrollments && enrollments.length > 0) {
    const results = await Promise.all(
      enrollments.slice(0, 100).map(async (e: any) => {
        const { data } = await supabase.rpc("course_progress", {
          p_candidate: e.candidate_id,
          p_course: e.course_id,
        });
        if (typeof data === "number") return data;
        if (data && typeof data === "object" && "percent" in data) return Number((data as any).percent);
        if (Array.isArray(data) && data[0]?.percent != null) return Number(data[0].percent);
        return null;
      }),
    );
    const nums = results.filter((n): n is number => typeof n === "number" && !isNaN(n));
    if (nums.length) avgProgress = nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  return {
    total,
    invited,
    active,
    inTraining,
    graduated,
    readyForPlacement: ready,
    awaitingReview,
    avgProgress,
    uploaded,
    trainingFailed,
    trainingExpired,
    newThisWeek,
    certificatesIssued,
    activeClinics,
    openRequests,
    needsRematch,
    underReview,
    interviewsActive,
    offersOut,
    placementsConfirmed,
    pendingHandoffs,
  };
}


export interface ActivityItem {
  id: string;
  type: string;
  label: string;
  at: string;
  candidateId?: string;
}

export async function fetchRecentActivity(limit = 15): Promise<ActivityItem[]> {
  const cap = 30;
  const [cands, enrolls, lessons, assess, rps] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, created_at, profile:profiles!candidates_profile_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(cap),
    supabase
      .from("candidate_courses")
      .select("candidate_id, enrolled_at, course:courses(title)")
      .order("enrolled_at", { ascending: false })
      .limit(cap),
    supabase
      .from("lesson_progress")
      .select("candidate_id, completed_at, lesson_id")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(cap),
    supabase
      .from("candidate_assessment_attempts")
      .select("candidate_id, submitted_at")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(cap),
    supabase
      .from("roleplay_sessions")
      .select("candidate_id, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(cap),
  ]);

  const candidateIds = new Set<string>();
  (enrolls.data ?? []).forEach((r: any) => { if (r.candidate_id) candidateIds.add(r.candidate_id); });
  (lessons.data ?? []).forEach((r: any) => { if (r.candidate_id) candidateIds.add(r.candidate_id); });
  (assess.data ?? []).forEach((r: any) => { if (r.candidate_id) candidateIds.add(r.candidate_id); });
  (rps.data ?? []).forEach((r: any) => { if (r.candidate_id) candidateIds.add(r.candidate_id); });

  const nameMap = new Map<string, string>();
  if (candidateIds.size > 0) {
    const { data: nameData } = await supabase
      .from("candidates")
      .select("id, profile:profiles!candidates_profile_id_fkey(full_name)")
      .in("id", Array.from(candidateIds));
    (nameData ?? []).forEach((r: any) => {
      nameMap.set(r.id, r.profile?.full_name ?? "");
    });
  }

  const fmtName = (id?: string) => (id ? nameMap.get(id) ?? "" : "");

  const items: ActivityItem[] = [];
  (cands.data ?? []).forEach((r: any, i) =>
    items.push({
      id: `c-${r.id}-${i}`,
      type: "candidate",
      label: `New candidate: ${r.profile?.full_name ?? "Unnamed"}`,
      at: r.created_at,
      candidateId: r.id,
    }),
  );
  (enrolls.data ?? []).forEach((r: any, i) =>
    r.enrolled_at &&
    items.push({
      id: `e-${r.candidate_id}-${i}`,
      type: "enrollment",
      label: fmtName(r.candidate_id)
        ? `${fmtName(r.candidate_id)} — Enrolled in ${r.course?.title ?? "course"}`
        : `Enrolled in ${r.course?.title ?? "course"}`,
      at: r.enrolled_at,
      candidateId: r.candidate_id,
    }),
  );
  (lessons.data ?? []).forEach((r: any, i) =>
    items.push({
      id: `l-${r.candidate_id}-${i}`,
      type: "lesson",
      label: fmtName(r.candidate_id)
        ? `${fmtName(r.candidate_id)} — Completed a lesson`
        : `Completed a lesson`,
      at: r.completed_at,
      candidateId: r.candidate_id,
    }),
  );
  (assess.data ?? []).forEach((r: any, i) =>
    items.push({
      id: `a-${r.candidate_id}-${i}`,
      type: "assessment",
      label: fmtName(r.candidate_id)
        ? `${fmtName(r.candidate_id)} — Submitted an assessment`
        : `Submitted an assessment`,
      at: r.submitted_at,
      candidateId: r.candidate_id,
    }),
  );
  (rps.data ?? []).forEach((r: any, i) =>
    items.push({
      id: `r-${r.candidate_id}-${i}`,
      type: "roleplay",
      label: fmtName(r.candidate_id)
        ? `${fmtName(r.candidate_id)} — ${r.completed_at ? "Completed roleplay" : "Started roleplay"}`
        : (r.completed_at ? "Completed roleplay" : "Started roleplay"),
      at: r.completed_at ?? r.created_at,
      candidateId: r.candidate_id,
    }),
  );

  return items
    .filter((i) => i.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

export async function fetchUnreadNotificationsCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .eq("read", false);
  return count ?? 0;
}

export interface NotificationRow {
  id: string;
  title: string | null;
  message: string | null;
  type: string | null;
  read: boolean;
  created_at: string;
}

export async function fetchRecentNotifications(userId: string, limit = 10): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id,title,message,type,read,created_at")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient_id", userId)
    .eq("read", false);
  if (error) throw error;
}


export async function fetchCourseProgress(candidateId: string, courseId: string): Promise<number | null> {
  const { data } = await supabase.rpc("course_progress", { p_candidate: candidateId, p_course: courseId });
  if (typeof data === "number") return data;
  if (data && typeof data === "object" && "percent" in data) return Number((data as any).percent);
  if (Array.isArray(data) && data[0]?.percent != null) return Number(data[0].percent);
  return null;
}

export async function fetchLastActivity(candidateId: string): Promise<string | null> {
  const queries = await Promise.all([
    supabase
      .from("lesson_progress")
      .select("completed_at")
      .eq("candidate_id", candidateId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1),
    supabase
      .from("candidate_assessment_attempts")
      .select("submitted_at")
      .eq("candidate_id", candidateId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(1),
    supabase
      .from("roleplay_sessions")
      .select("updated_at")
      .eq("candidate_id", candidateId)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);
  const stamps = [
    queries[0].data?.[0]?.completed_at,
    queries[1].data?.[0]?.submitted_at,
    queries[2].data?.[0]?.updated_at,
  ].filter(Boolean) as string[];
  if (!stamps.length) return null;
  return stamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

export interface PublishedCourse {
  id: string;
  title: string;
}

export async function fetchPublishedCourses(): Promise<PublishedCourse[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, title")
    .eq("is_published", true)
    .order("title");
  if (error) throw error;
  return (data ?? []) as PublishedCourse[];
}

// ---- Create candidate ----
export interface CreateCandidateInput {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  country?: string;
  timezone?: string;
  experience_level?: string;
  notes?: string;
  course_id: string;
  years_customer_service_experience?: number;
}

export async function invokeCreateCandidate(input: CreateCandidateInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-candidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mode: "invite",
      email: input.email,
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone ?? null,
      country: input.country ?? null,
      timezone: input.timezone ?? null,
      experience_level: input.experience_level ?? null,
      veterinary_experience: null,
      notes: input.notes ?? null,
      candidate_status: "invited",
      course_id: input.course_id,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || body.message || `create-candidate failed (${res.status})`);
  }
  return body as { ok: true; candidate: { id: string }; user_id: string; invited: boolean };
}

export async function resendInvitation(candidateId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/resend-invitation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ candidate_id: candidateId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `resend-invitation failed (${res.status})`);
  return body;
}

export async function updateCandidateYearsExperience(candidateId: string, years: number) {
  const { error } = await supabase
    .from("candidates")
    .update({ years_customer_service_experience: years })
    .eq("id", candidateId);
  if (error) throw error;
}

export async function updateCandidateIntroVideoUrl(candidateId: string, url: string | null): Promise<void> {
  const { error } = await supabase.from("candidates").update({ intro_video_url: url }).eq("id", candidateId);
  if (error) throw error;
}

export function isLikelyValidUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export interface UploadSpec {
  file: File;
  bucket: "candidate-photos" | "candidate-resumes" | "intro-videos";
  fileType: "profile_photo" | "id_document" | "original_resume" | "intro_video" | "other";
}

export async function uploadCandidateFile(candidateId: string, spec: UploadSpec) {
  const ext = spec.file.name.split(".").pop() || "bin";
  const path = `${candidateId}/${spec.fileType}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(spec.bucket)
    .upload(path, spec.file, { upsert: false, contentType: spec.file.type || undefined });
  if (upErr) throw upErr;
  const { error: insErr } = await supabase.from("candidate_files").insert({
    candidate_id: candidateId,
    file_type: spec.fileType,
    bucket_id: spec.bucket,
    storage_path: path,
    file_name: spec.file.name,
    mime_type: spec.file.type || null,
    size_bytes: spec.file.size,
  });
  if (insErr) throw insErr;
}

export async function uploadCandidateFileWithProgress(
  candidateId: string,
  spec: UploadSpec,
  onProgress: (pct: number) => void,
) {
  const ext = spec.file.name.split(".").pop() || "bin";
  const path = `${candidateId}/${spec.fileType}-${Date.now()}.${ext}`;
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  let uploadedViaXhr = false;
  if (token) {
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${spec.bucket}/${path}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
        xhr.setRequestHeader("x-upsert", "false");
        if (spec.file.type) xhr.setRequestHeader("Content-Type", spec.file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(spec.file);
      });
      uploadedViaXhr = true;
    } catch {
      uploadedViaXhr = false;
    }
  }
  if (!uploadedViaXhr) {
    onProgress(100);
    const { error: upErr } = await supabase.storage
      .from(spec.bucket)
      .upload(path, spec.file, { upsert: false, contentType: spec.file.type || undefined });
    if (upErr) throw upErr;
  }
  const { error: insErr } = await supabase.from("candidate_files").insert({
    candidate_id: candidateId,
    file_type: spec.fileType,
    bucket_id: spec.bucket,
    storage_path: path,
    file_name: spec.file.name,
    mime_type: spec.file.type || null,
    size_bytes: spec.file.size,
  });
  if (insErr) throw insErr;
}

export async function removeCourse(enrollmentId: string) {
  const { error } = await supabase.from("candidate_courses").delete().eq("id", enrollmentId);
  if (error) throw error;
}

export interface CandidateFileRow {
  id: string;
  candidate_id: string;
  file_type: string;
  bucket_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export async function fetchCandidateFiles(candidateId: string): Promise<CandidateFileRow[]> {
  const { data, error } = await supabase
    .from("candidate_files")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CandidateFileRow[];
}

export async function getSignedUrl(
  bucket: string,
  path: string,
  expires = 3600,
  download?: string | boolean,
): Promise<string | null> {
  const opts = download ? { download } : undefined;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expires, opts as any);
  return data?.signedUrl ?? null;
}


export async function fetchCandidatePhotoUrl(
  candidateId: string,
  avatarUrl: string | null,
): Promise<string | null> {
  if (avatarUrl) return avatarUrl;
  const { data } = await supabase
    .from("candidate_files")
    .select("bucket_id, storage_path")
    .eq("candidate_id", candidateId)
    .eq("file_type", "profile_photo")
    .order("created_at", { ascending: false })
    .limit(1);
  const f = data?.[0] as any;
  if (!f) return null;
  return getSignedUrl(f.bucket_id, f.storage_path);
}

// ============================================================
// Phase 2D — Candidate Workspace
// ============================================================

export interface CandidateDetail {
  id: string;
  profile_id: string;
  recruiter_id: string | null;
  status: string;
  headline: string | null;
  bio: string | null;
  specialization: string | null;
  availability: string | null;
  country: string | null;
  timezone: string | null;
  weekly_hours_available: number | null;
  preferred_shift: string | null;
  employment_status: string | null;
  years_customer_service_experience: number | null;
  years_veterinary_experience: number | null;
  years_experience: number | null;
  created_at: string;
  updated_at: string | null;
  profile: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
  recruiter: {
    id: string;
    profile: { full_name: string | null } | null;
  } | null;
  candidate_courses: Array<{
    id: string;
    course_id: string;
    status: string | null;
    enrolled_at: string | null;
    completed_at: string | null;
    course: { id: string; title: string | null } | null;
  }>;
}

export async function fetchCandidateDetail(id: string): Promise<CandidateDetail> {
  const { data, error } = await supabase
    .from("candidates")
    .select(
      `id, profile_id, recruiter_id, status, headline, bio, specialization, availability,
       country, timezone, weekly_hours_available, preferred_shift, employment_status,
       years_customer_service_experience, years_veterinary_experience, years_experience, created_at, updated_at,
       profile:profiles!candidates_profile_id_fkey ( full_name, email, phone, avatar_url ),
       recruiter:recruiters!candidates_recruiter_id_fkey ( id, profile:profiles!recruiters_profile_id_fkey ( full_name ) ),
       candidate_courses ( id, course_id, status, enrolled_at, completed_at, course:courses ( id, title ) )`,
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as CandidateDetail;
}

// ---- Recruiter notes ----
export interface RecruiterNote {
  id: string;
  candidate_id: string;
  recruiter_id: string | null;
  note: string;
  created_at: string;
  updated_at: string | null;
  recruiter?: { profile: { full_name: string | null } | null } | null;
}

export async function fetchRecruiterNotes(candidateId: string): Promise<RecruiterNote[]> {
  const { data, error } = await supabase
    .from("recruiter_notes")
    .select(
      `id, candidate_id, recruiter_id, note, created_at, updated_at,
       recruiter:recruiters!recruiter_notes_recruiter_id_fkey ( profile:profiles!recruiters_profile_id_fkey ( full_name ) )`,
    )
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as RecruiterNote[];
}

export async function resolveCallerRecruiterId(): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase
    .from("recruiters")
    .select("id")
    .eq("profile_id", u.user.id)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

export async function addRecruiterNote(candidateId: string, note: string) {
  const recruiterId = await resolveCallerRecruiterId();
  if (!recruiterId) {
    throw new Error(
      "Your account isn't linked to a recruiter profile, so notes can't be saved. Ask an admin to add a recruiter record for you.",
    );
  }
  const { error } = await supabase
    .from("recruiter_notes")
    .insert({ candidate_id: candidateId, note, recruiter_id: recruiterId });
  if (error) throw error;
}

// ---- Interview AI analysis ----
export interface InterviewAnalysis {
  id: string;
  candidate_id: string;
  interview_video_file_id: string | null;
  transcript: string | null;
  communication_score: number | null;
  professionalism_score: number | null;
  confidence_score: number | null;
  veterinary_knowledge_score: number | null;
  strengths: any;
  weaknesses: any;
  recommendations: any;
  analyzed_at: string | null;
}

export async function fetchInterviewAnalysis(candidateId: string): Promise<InterviewAnalysis | null> {
  const { data } = await supabase
    .from("interview_analysis")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("analyzed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as InterviewAnalysis | null) ?? null;
}

export interface CandidateAiProfile {
  candidate_id: string;
  summary: string | null;
  approved_summary: string | null;
  strengths: any;
  rank_score: number | null;
}

export async function fetchCandidateAiProfile(candidateId: string): Promise<CandidateAiProfile | null> {
  const { data } = await supabase
    .from("candidate_ai_profiles")
    .select("candidate_id, summary, approved_summary, strengths, rank_score")
    .eq("candidate_id", candidateId)
    .maybeSingle();
  return (data as CandidateAiProfile | null) ?? null;
}

// ---- VetPod Resume view ----
export interface VetpodResume {
  candidate_id: string;
  full_name: string | null;
  professional_summary: string | null;
  primary_role: string | null;
  secondary_roles: any;
  skills: any;
  software: any;
  languages: any;
  country: string | null;
  timezone: string | null;
  weekly_hours_available: number | null;
  preferred_shift: string | null;
  earliest_start_date: string | null;
  badges: any;
  intro_video_path: string | null;
  intro_video_mime_type: string | null;
  profile_photo_path: string | null;
  vetpod_resume_path: string | null;
  work_history: any;
  education: any;
}

export async function fetchVetpodResume(candidateId: string): Promise<VetpodResume | null> {
  const { data } = await supabase
    .from("vetpod_resume")
    .select("*")
    .eq("candidate_id", candidateId)
    .maybeSingle();
  return (data as VetpodResume | null) ?? null;
}

// ---- Modules / lessons with progress ----
export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  display_order: number | null;
  estimated_duration_minutes: number | null;
  is_published: boolean | null;
}

export async function fetchCourseModules(courseId: string): Promise<CourseModule[]> {
  const { data, error } = await supabase
    .from("course_modules")
    .select("id, course_id, title, display_order, estimated_duration_minutes, is_published")
    .eq("course_id", courseId)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CourseModule[];
}

export interface ModuleProgress {
  unlocked: boolean;
  complete: boolean;
  percent: number;
  total_lessons: number;
  completed_lessons: number;
  required_assessments: number;
  assessments_passed: number;
}

export async function fetchModuleProgress(candidateId: string, moduleId: string): Promise<ModuleProgress | null> {
  const { data } = await supabase.rpc("module_progress", {
    p_candidate: candidateId,
    p_module: moduleId,
  });
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] as ModuleProgress) ?? null;
  return data as ModuleProgress;
}

export interface CourseProgressDetail {
  percent: number;
  total_modules: number;
  completed_modules: number;
  final_passed: boolean;
  roleplay_unlocked: boolean;
  graduation_complete: boolean;
  graduated: boolean;
}

export async function fetchCourseProgressDetail(
  candidateId: string,
  courseId: string,
): Promise<CourseProgressDetail | null> {
  const { data } = await supabase.rpc("course_progress", {
    p_candidate: candidateId,
    p_course: courseId,
  });
  if (!data) return null;
  if (Array.isArray(data)) return (data[0] as CourseProgressDetail) ?? null;
  return data as CourseProgressDetail;
}

// Current incomplete lesson within a module
export async function fetchFirstIncompleteLesson(candidateId: string, moduleId: string) {
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, title, display_order")
    .eq("module_id", moduleId)
    .eq("is_published", true)
    .order("display_order", { ascending: true });
  if (!lessons?.length) return null;
  const { data: progress } = await supabase
    .from("lesson_progress")
    .select("lesson_id, completed")
    .eq("candidate_id", candidateId)
    .in("lesson_id", lessons.map((l: any) => l.id));
  const done = new Set(
    (progress ?? []).filter((p: any) => p.completed).map((p: any) => p.lesson_id),
  );
  return lessons.find((l: any) => !done.has(l.id)) ?? lessons[lessons.length - 1];
}

// ---- Assessments ----
export interface ModuleAssessment {
  id: string;
  module_id: string;
  title: string;
  kind: string | null;
  is_required: boolean | null;
  passing_score: number | null;
  max_attempts: number | null;
  time_limit_minutes: number | null;
}

export interface CandidateAssessmentAttempt {
  id: string;
  candidate_id: string;
  assessment_id: string;
  attempt_number: number | null;
  score: number | null;
  passed: boolean | null;
  started_at: string | null;
  submitted_at: string | null;
}

export interface AssessmentWithAttempts {
  assessment: ModuleAssessment;
  module_id: string;
  module_title: string;
  question_count: number;
  attempts: CandidateAssessmentAttempt[];
}

export async function fetchCandidateAssessments(
  candidateId: string,
  courseId: string,
): Promise<AssessmentWithAttempts[]> {
  const { data: modules } = await supabase
    .from("course_modules")
    .select("id, title")
    .eq("course_id", courseId);
  const moduleIds = (modules ?? []).map((m: any) => m.id);
  if (!moduleIds.length) return [];
  const { data: assessments } = await supabase
    .from("module_assessments")
    .select("id, module_id, title, kind, is_required, passing_score, max_attempts, time_limit_minutes")
    .in("module_id", moduleIds);
  const assessmentIds = (assessments ?? []).map((a: any) => a.id);
  const [attemptsRes, qCountRes] = await Promise.all([
    assessmentIds.length
      ? supabase
          .from("candidate_assessment_attempts")
          .select("id, candidate_id, assessment_id, attempt_number, score, passed, started_at, submitted_at")
          .eq("candidate_id", candidateId)
          .in("assessment_id", assessmentIds)
      : Promise.resolve({ data: [] as any[] }),
    assessmentIds.length
      ? supabase
          .from("assessment_questions")
          .select("assessment_id")
          .in("assessment_id", assessmentIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const qCounts: Record<string, number> = {};
  (qCountRes.data ?? []).forEach((q: any) => {
    qCounts[q.assessment_id] = (qCounts[q.assessment_id] ?? 0) + 1;
  });
  const modulesById = new Map((modules ?? []).map((m: any) => [m.id, m.title]));
  const byAssessment: Record<string, CandidateAssessmentAttempt[]> = {};
  (attemptsRes.data ?? []).forEach((a: any) => {
    (byAssessment[a.assessment_id] ||= []).push(a);
  });
  return (assessments ?? []).map((a: any) => ({
    assessment: a,
    module_id: a.module_id,
    module_title: modulesById.get(a.module_id) ?? "Module",
    question_count: qCounts[a.id] ?? 0,
    attempts: (byAssessment[a.id] ?? []).sort(
      (x, y) => (x.attempt_number ?? 0) - (y.attempt_number ?? 0),
    ),
  }));
}

export async function fetchCourseFinalAssessment(courseId: string): Promise<{ module_id: string } | null> {
  const { data } = await supabase
    .from("course_final_assessment")
    .select("module_id")
    .eq("course_id", courseId)
    .maybeSingle();
  return (data as any) ?? null;
}

// ---- Roleplay ----
export interface RoleplaySession {
  id: string;
  candidate_id: string;
  course_id: string | null;
  scenario_name: string | null;
  attempt_number: number | null;
  audio_file_id: string | null;
  transcript: string | null;
  score: number | null;
  assessment_score: number | null;
  grading_criteria: any;
  ai_feedback: any;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export async function fetchCandidateRoleplay(candidateId: string): Promise<RoleplaySession[]> {
  const { data, error } = await supabase
    .from("roleplay_sessions")
    .select(
      "id, candidate_id, course_id, scenario_name, attempt_number, audio_file_id, transcript, score, assessment_score, grading_criteria, ai_feedback, completed_at, created_at, updated_at",
    )
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RoleplaySession[];
}

export type AssignedScenario = {
  scenarioId: string;
  position: number;
  title: string | null;
  slug: string | null;
  description: string | null;
  passing_score: number | null;
};

export async function fetchCandidateAssignedScenarios(
  candidateId: string,
): Promise<AssignedScenario[]> {
  const { data, error } = await supabase
    .from("candidate_roleplay_assignments")
    .select("position, scenario:roleplay_scenarios(id, title, slug, description, passing_score)")
    .eq("candidate_id", candidateId)
    .order("position", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[])
    .map((row) => {
      const s = Array.isArray(row.scenario) ? row.scenario[0] : row.scenario;
      if (!s) return null;
      return {
        scenarioId: s.id,
        position: row.position,
        title: s.title ?? null,
        slug: s.slug ?? null,
        description: s.description ?? null,
        passing_score: s.passing_score ?? null,
      } as AssignedScenario;
    })
    .filter(Boolean) as AssignedScenario[];
}

export async function fetchRoleplayAudioUrl(audioFileId: string | null): Promise<string | null> {
  if (!audioFileId) return null;
  const { data } = await supabase
    .from("candidate_files")
    .select("bucket_id, storage_path")
    .eq("id", audioFileId)
    .maybeSingle();
  const f = data as any;
  if (!f) return null;
  return getSignedUrl(f.bucket_id, f.storage_path);
}

export async function fetchRoleplayAudioDownloadUrl(
  audioFileId: string | null,
  fileName?: string,
): Promise<{ url: string | null; storagePath: string | null; mimeType: string | null }> {
  if (!audioFileId) return { url: null, storagePath: null, mimeType: null };
  const { data } = await supabase
    .from("candidate_files")
    .select("bucket_id, storage_path, mime_type")
    .eq("id", audioFileId)
    .maybeSingle();
  const f = data as any;
  if (!f) return { url: null, storagePath: null, mimeType: null };
  const storagePath: string = f.storage_path;
  const mimeType: string | null = f.mime_type ?? null;
  let ext = "";
  const dot = storagePath.lastIndexOf(".");
  if (dot >= 0) ext = storagePath.slice(dot);
  else if (mimeType) {
    const m = mimeType.split("/")[1];
    if (m) ext = `.${m.split(";")[0]}`;
  }
  const safeBase = (fileName ?? "roleplay-audio").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
  const downloadName = ext && !safeBase.endsWith(ext) ? `${safeBase}${ext}` : safeBase;
  const url = await getSignedUrl(f.bucket_id, storagePath, 3600, downloadName);
  return { url, storagePath, mimeType };
}


// Returns a verdict ONLY if the backend explicitly recorded one. Never compare score vs passing_score.
export function readBackendVerdict(
  ai_feedback: any,
): { verdict: "passed" | "failed" | string; explicit: true } | null {
  if (!ai_feedback || typeof ai_feedback !== "object") return null;
  const fb: any = ai_feedback;
  if (typeof fb.passed === "boolean") {
    return { verdict: fb.passed ? "passed" : "failed", explicit: true };
  }
  for (const key of ["verdict", "result", "outcome", "status"]) {
    const v = fb[key];
    if (typeof v === "string" && v.trim()) return { verdict: v.trim(), explicit: true };
  }
  return null;
}

// ---- Certificates / Graduation ----
export interface CertificateRow {
  id: string;
  candidate_id: string;
  status: "pending" | "issued" | "revoked" | string;
  issued_at: string | null;
  certificate_url: string | null;
}

export async function fetchCandidateCertificates(candidateId: string): Promise<CertificateRow[]> {
  const { data, error } = await supabase
    .from("certificates")
    .select("id, candidate_id, status, issued_at, certificate_url")
    .eq("candidate_id", candidateId)
    .order("issued_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CertificateRow[];
}

export interface GraduationRow {
  id: string;
  candidate_id: string;
  course_id: string;
  graduated_at: string;
}

export async function fetchCandidateGraduations(candidateId: string): Promise<GraduationRow[]> {
  const { data, error } = await supabase
    .from("course_graduations")
    .select("id, candidate_id, course_id, graduated_at")
    .eq("candidate_id", candidateId)
    .order("graduated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GraduationRow[];
}

// ---- Recruiters list / mutations ----
export interface RecruiterListItem {
  id: string;
  profile_id: string;
  agency_name: string | null;
  full_name: string | null;
}

export async function listRecruiters(): Promise<RecruiterListItem[]> {
  const { data, error } = await supabase
    .from("recruiters")
    .select(
      "id, profile_id, agency_name, profile:profiles!recruiters_profile_id_fkey(full_name)",
    );
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    profile_id: r.profile_id,
    agency_name: r.agency_name,
    full_name: r.profile?.full_name ?? null,
  }));
}

export async function changeRecruiter(candidateId: string, recruiterId: string | null) {
  const { error } = await supabase
    .from("candidates")
    .update({ recruiter_id: recruiterId })
    .eq("id", candidateId);
  if (error) throw error;
}

export async function deactivateCandidate(candidateId: string) {
  const { error } = await supabase
    .from("candidates")
    .update({ status: "inactive" })
    .eq("id", candidateId);
  if (error) throw error;
}

// ---- Course assignment ----
export async function assignOrChangeCourse(
  candidateId: string,
  newCourseId: string,
  existingEnrollmentId?: string,
) {
  if (existingEnrollmentId) {
    const { error } = await supabase
      .from("candidate_courses")
      .update({ course_id: newCourseId, status: "enrolled", enrolled_at: new Date().toISOString() })
      .eq("id", existingEnrollmentId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("candidate_courses").insert({
      candidate_id: candidateId,
      course_id: newCourseId,
      status: "enrolled",
      enrolled_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

// ---- Documents: replace + delete ----
export async function deleteCandidateFile(file: CandidateFileRow) {
  await supabase.storage.from(file.bucket_id).remove([file.storage_path]);
  const { error } = await supabase.from("candidate_files").delete().eq("id", file.id);
  if (error) throw error;
}

export async function replaceCandidateFile(
  candidateId: string,
  existing: CandidateFileRow,
  newFile: File,
) {
  await uploadCandidateFile(candidateId, {
    file: newFile,
    bucket: existing.bucket_id as UploadSpec["bucket"],
    fileType: existing.file_type as UploadSpec["fileType"],
  });
  await deleteCandidateFile(existing);
}

// ---- Edit Candidate (frontend-only) ----
export interface UpdateCandidateFields {
  status?: string;
  recruiter_id?: string | null;
  headline?: string | null;
  bio?: string | null;
  specialization?: string | null;
  availability?: string | null;
  country?: string | null;
  timezone?: string | null;
  weekly_hours_available?: number | null;
  preferred_shift?: string | null;
  employment_status?: string | null;
  years_experience?: number | null;
  years_customer_service_experience?: number | null;
  years_veterinary_experience?: number | null;
}

export async function updateCandidate(candidateId: string, fields: UpdateCandidateFields) {
  const { error } = await supabase.from("candidates").update(fields).eq("id", candidateId);
  if (error) throw error;
}

export async function updateCandidateProfile(
  profileId: string,
  fields: { full_name?: string; phone?: string | null },
) {
  const { error } = await supabase.from("profiles").update(fields).eq("id", profileId);
  if (error) throw error;
}

// ---- Placements ----
export type PlacementStatus = "active" | "completed" | "terminated";

export interface PlacementRow {
  id: string;
  candidate_id: string;
  client_id: string;
  position_title: string;
  placement_date: string;
  status: PlacementStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client: { full_name: string | null } | null;
}

export async function fetchPlacements(candidateId: string): Promise<PlacementRow[]> {
  const { data, error } = await supabase
    .from("placements")
    .select(
      "id, candidate_id, client_id, position_title, placement_date, status, notes, created_at, updated_at",
    )
    .eq("candidate_id", candidateId)
    .order("placement_date", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean)));
  let nameById: Record<string, string | null> = {};
  if (clientIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", clientIds);
    nameById = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
  }
  return rows.map((r) => ({
    ...r,
    client: { full_name: r.client_id ? nameById[r.client_id] ?? null : null },
  })) as PlacementRow[];
}

export interface ClientProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

export async function fetchClients(): Promise<ClientProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "client")
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as ClientProfile[];
}

export interface CreatePlacementInput {
  candidate_id: string;
  client_id: string;
  position_title: string;
  placement_date: string;
  status: PlacementStatus;
  notes?: string | null;
}

export async function createPlacement(input: CreatePlacementInput) {
  const { error } = await supabase.from("placements").insert(input);
  if (error) throw error;
}

export interface UpdatePlacementFields {
  client_id?: string;
  position_title?: string;
  placement_date?: string;
  status?: PlacementStatus;
  notes?: string | null;
}

export async function updatePlacement(id: string, fields: UpdatePlacementFields) {
  const { error } = await supabase.from("placements").update(fields).eq("id", id);
  if (error) throw error;
}


// ============================================================
// Phase 2F — Top-level Placements & Activity Log
// ============================================================

export interface PlacementListRow {
  id: string;
  candidate_id: string;
  client_id: string | null;
  position_title: string | null;
  placement_date: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  candidate_name: string | null;
  client_name: string | null;
}

export async function fetchAllPlacements(): Promise<PlacementListRow[]> {
  const { data, error } = await supabase
    .from("placements")
    .select("id, candidate_id, client_id, position_title, placement_date, status, notes, created_at, updated_at")
    .order("placement_date", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const candidateIds = Array.from(new Set(rows.map((r) => r.candidate_id).filter(Boolean)));
  const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean)));
  let candProfile: Record<string, string> = {};
  if (candidateIds.length) {
    const { data: cands } = await supabase
      .from("candidates")
      .select("id, profile_id")
      .in("id", candidateIds);
    candProfile = Object.fromEntries((cands ?? []).map((c: any) => [c.id, c.profile_id]));
  }
  const profileIds = Array.from(
    new Set([...Object.values(candProfile), ...clientIds].filter(Boolean) as string[]),
  );
  let nameById: Record<string, string | null> = {};
  if (profileIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    nameById = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
  }
  return rows.map((r) => ({
    ...r,
    candidate_name: candProfile[r.candidate_id] ? nameById[candProfile[r.candidate_id]] ?? null : null,
    client_name: r.client_id ? nameById[r.client_id] ?? null : null,
  })) as PlacementListRow[];
}

export interface ActivityLogItem {
  id: string;
  candidate_id: string | null;
  candidate_name: string | null;
  at: string;
  type: string;
  label: string;
  detail?: string;
}

export async function fetchActivityLog(limit = 60): Promise<ActivityLogItem[]> {
  const cap = 40;
  const [
    cands,
    enrolls,
    files,
    notes,
    assess,
    rps,
    certs,
    grads,
    placements,
  ] = await Promise.all([
    supabase.from("candidates").select("id, created_at").order("created_at", { ascending: false }).limit(cap),
    supabase
      .from("candidate_courses")
      .select("candidate_id, enrolled_at, course_id")
      .order("enrolled_at", { ascending: false })
      .limit(cap),
    supabase
      .from("candidate_files")
      .select("id, candidate_id, file_type, file_name, created_at")
      .order("created_at", { ascending: false })
      .limit(cap),
    supabase
      .from("recruiter_notes")
      .select("id, candidate_id, created_at")
      .order("created_at", { ascending: false })
      .limit(cap),
    supabase
      .from("candidate_assessment_attempts")
      .select("id, candidate_id, submitted_at, passed")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(cap),
    supabase
      .from("roleplay_sessions")
      .select("id, candidate_id, scenario_name, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(cap),
    supabase
      .from("certificates")
      .select("id, candidate_id, issued_at")
      .not("issued_at", "is", null)
      .order("issued_at", { ascending: false })
      .limit(cap),
    supabase
      .from("course_graduations")
      .select("id, candidate_id, graduated_at")
      .order("graduated_at", { ascending: false })
      .limit(cap),
    supabase
      .from("placements")
      .select("id, candidate_id, position_title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(cap),
  ]);

  // Resolve course titles (separate fetch to avoid embeds)
  const courseIds = Array.from(
    new Set(((enrolls.data ?? []) as any[]).map((r) => r.course_id).filter(Boolean)),
  );
  let courseTitle: Record<string, string | null> = {};
  if (courseIds.length) {
    const { data: cs } = await supabase.from("courses").select("id, title").in("id", courseIds);
    courseTitle = Object.fromEntries((cs ?? []).map((c: any) => [c.id, c.title]));
  }

  const items: ActivityLogItem[] = [];
  ((cands.data ?? []) as any[]).forEach((r, i) =>
    items.push({
      id: `cand-${r.id}-${i}`,
      candidate_id: r.id,
      candidate_name: null,
      at: r.created_at,
      type: "candidate",
      label: "Candidate created",
    }),
  );
  ((enrolls.data ?? []) as any[]).forEach((r, i) => {
    if (!r.enrolled_at) return;
    items.push({
      id: `enr-${r.candidate_id}-${i}`,
      candidate_id: r.candidate_id,
      candidate_name: null,
      at: r.enrolled_at,
      type: "enrollment",
      label: `Course assigned: ${courseTitle[r.course_id] ?? "course"}`,
    });
  });
  ((files.data ?? []) as any[]).forEach((r) =>
    items.push({
      id: `file-${r.id}`,
      candidate_id: r.candidate_id,
      candidate_name: null,
      at: r.created_at,
      type: "file",
      label: `${(r.file_type ?? "File").replace(/_/g, " ")} uploaded`,
      detail: r.file_name ?? undefined,
    }),
  );
  ((notes.data ?? []) as any[]).forEach((r) =>
    items.push({
      id: `note-${r.id}`,
      candidate_id: r.candidate_id,
      candidate_name: null,
      at: r.created_at,
      type: "note",
      label: "Recruiter note added",
    }),
  );
  ((assess.data ?? []) as any[]).forEach((r) =>
    items.push({
      id: `as-${r.id}`,
      candidate_id: r.candidate_id,
      candidate_name: null,
      at: r.submitted_at,
      type: "assessment",
      label: r.passed ? "Assessment passed" : "Assessment completed",
    }),
  );
  ((rps.data ?? []) as any[]).forEach((r) =>
    items.push({
      id: `rp-${r.id}`,
      candidate_id: r.candidate_id,
      candidate_name: null,
      at: r.completed_at ?? r.created_at,
      type: "roleplay",
      label: r.completed_at ? "Roleplay graded" : "Roleplay submitted",
      detail: r.scenario_name ?? undefined,
    }),
  );
  ((certs.data ?? []) as any[]).forEach((r) =>
    items.push({
      id: `cert-${r.id}`,
      candidate_id: r.candidate_id,
      candidate_name: null,
      at: r.issued_at,
      type: "certificate",
      label: "Certificate issued",
    }),
  );
  ((grads.data ?? []) as any[]).forEach((r) =>
    items.push({
      id: `grad-${r.id}`,
      candidate_id: r.candidate_id,
      candidate_name: null,
      at: r.graduated_at,
      type: "graduation",
      label: "Graduated",
    }),
  );
  ((placements.data ?? []) as any[]).forEach((r) => {
    const wasUpdated = r.updated_at && r.updated_at !== r.created_at;
    items.push({
      id: `plc-${r.id}`,
      candidate_id: r.candidate_id,
      candidate_name: null,
      at: r.updated_at ?? r.created_at,
      type: "placement",
      label: wasUpdated ? "Placement updated" : "Placement created",
      detail: r.position_title ?? undefined,
    });
  });

  // Resolve candidate display names
  const candidateIds = Array.from(
    new Set(items.map((i) => i.candidate_id).filter(Boolean) as string[]),
  );
  let candProfile: Record<string, string> = {};
  if (candidateIds.length) {
    const { data: cs } = await supabase
      .from("candidates")
      .select("id, profile_id")
      .in("id", candidateIds);
    candProfile = Object.fromEntries((cs ?? []).map((c: any) => [c.id, c.profile_id]));
  }
  const profileIds = Array.from(new Set(Object.values(candProfile).filter(Boolean) as string[]));
  let nameById: Record<string, string | null> = {};
  if (profileIds.length) {
    const { data: ps } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);
    nameById = Object.fromEntries((ps ?? []).map((p: any) => [p.id, p.full_name]));
  }
  items.forEach((it) => {
    if (it.candidate_id && candProfile[it.candidate_id]) {
      it.candidate_name = nameById[candProfile[it.candidate_id]] ?? null;
    }
  });

  return items
    .filter((i) => i.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}


// ---------- Languages (candidate_skills ↔ skills where category='Languages') ----------

export interface CandidateLanguage {
  skillId: string;
  name: string;
}

export async function fetchCandidateLanguages(
  candidateId: string,
): Promise<CandidateLanguage[]> {
  const { data, error } = await supabase
    .from("candidate_skills")
    .select("skill_id, skills!inner(name, category)")
    .eq("candidate_id", candidateId)
    .eq("skills.category", "Languages");
  if (error) throw error;
  const rows = (data ?? []).map((r: any) => ({
    skillId: r.skill_id as string,
    name: (Array.isArray(r.skills) ? r.skills[0]?.name : r.skills?.name) as string,
  }));
  return rows
    .filter((r) => !!r.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addCandidateLanguage(candidateId: string, rawName: string) {
  const name = rawName.trim();
  if (!name) throw new Error("Language name is required");

  const { error: upErr } = await supabase
    .from("skills")
    .upsert({ name, category: "Languages" }, { onConflict: "name,category", ignoreDuplicates: true });
  if (upErr) throw upErr;

  const { data: skill, error: selErr } = await supabase
    .from("skills")
    .select("id")
    .eq("name", name)
    .eq("category", "Languages")
    .maybeSingle();
  if (selErr) throw selErr;
  if (!skill?.id) throw new Error("Could not resolve language");

  const { error: linkErr } = await supabase
    .from("candidate_skills")
    .upsert(
      { candidate_id: candidateId, skill_id: skill.id, proficiency_level: "intermediate" },
      { onConflict: "candidate_id,skill_id", ignoreDuplicates: true },
    );
  if (linkErr) throw linkErr;
  return { skillId: skill.id as string, name };
}

export async function removeCandidateLanguage(candidateId: string, skillId: string) {
  const { error } = await supabase
    .from("candidate_skills")
    .delete()
    .eq("candidate_id", candidateId)
    .eq("skill_id", skillId);
  if (error) throw error;
}

// ============ Clinic Pool ============
export interface ClinicRequestRow {
  id: string;
  title: string | null;
  role_needed: string | null;
  status: string;
  headcount: number | null;
  created_at: string;
  clinic_id: string | null;
  clinic_name: string | null;
}

export async function fetchClinicRequests(): Promise<ClinicRequestRow[]> {
  const { data, error } = await supabase
    .from("client_requests")
    .select("id, title, role_needed, status, headcount, created_at, clinic_id")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const clinicIds = Array.from(new Set(rows.map((r) => r.clinic_id).filter(Boolean)));
  const nameById = new Map<string, string>();
  if (clinicIds.length) {
    const { data: clinics } = await supabase
      .from("clinics")
      .select("id, name")
      .in("id", clinicIds);
    (clinics ?? []).forEach((c: any) => nameById.set(c.id, c.name));
  }
  const enriched: ClinicRequestRow[] = rows.map((r) => ({
    ...r,
    clinic_name: r.clinic_id ? nameById.get(r.clinic_id) ?? null : null,
  }));
  enriched.sort((a, b) => {
    const ar = a.status === "needs_rematch" ? 0 : 1;
    const br = b.status === "needs_rematch" ? 0 : 1;
    if (ar !== br) return ar - br;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return enriched;
}

export interface PresentedCandidateRow {
  match_id: string;
  candidate_name: string | null;
  primary_role: string | null;
  status: string | null;
  roleplay_score: number | null;
  course_score: number | null;
  certificate_status: string | null;
}

export async function fetchPresentedCandidates(requestId: string): Promise<PresentedCandidateRow[]> {
  const { data, error } = await supabase.rpc("get_clinic_presented_candidates", {
    p_request: requestId,
  });
  if (error) throw error;
  return (data ?? []) as PresentedCandidateRow[];
}

export async function rematchRequest(requestId: string): Promise<number> {
  const { data, error } = await supabase.rpc("rematch_request", { p_request: requestId });
  if (error) throw error;
  return (data as number) ?? 0;
}
