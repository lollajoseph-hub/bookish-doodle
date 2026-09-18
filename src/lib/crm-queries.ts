import { supabase } from "./supabase";
import type {
  AppRoleName,
  AuditLogRow,
  CandidateAiProfileRow,
  CandidateFileRow,
  CandidateFileType,
  CandidateMatchRow,
  ClientMemberRow,
  ClientRequestRow,
  ClientRow,
  MatchStatus,
  NotificationRow,
  PlacementRow,
  ProfileRow,
  RejectionReason,
} from "./database.types";

export const FILE_TYPE_BUCKETS: Record<CandidateFileType, string> = {
  resume: "candidate-resumes",
  profile_photo: "candidate-photos",
  intro_video: "intro-videos",
  id_document: "candidate-documents",
  reference: "candidate-documents",
  other: "candidate-documents",
};

export function bucketForFileType(fileType: CandidateFileType): string {
  return FILE_TYPE_BUCKETS[fileType];
}

export const MATCH_STATUSES: MatchStatus[] = [
  "recommended",
  "shortlisted",
  "interview_requested",
  "interview_confirmed",
  "interview_completed",
  "offer_extended",
  "hired",
  "rejected",
];

export const REJECTION_REASONS: RejectionReason[] = [
  "skill_mismatch",
  "availability_conflict",
  "culture_fit",
  "other",
];

export function labelize(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/* --------------------------------- clients -------------------------------- */

export interface ClientListItem extends ClientRow {
  memberCount: number;
  openRequests: number;
  parentName: string | null;
}

export async function fetchClients(): Promise<ClientListItem[]> {
  const [clientsRes, membersRes, requestsRes] = await Promise.all([
    supabase.from("clients").select("*").order("name", { ascending: true }),
    supabase.from("client_members").select("client_id"),
    supabase.from("client_requests").select("client_id, status"),
  ]);
  if (clientsRes.error) throw clientsRes.error;
  const clients = (clientsRes.data ?? []) as ClientRow[];
  const byId = new Map(clients.map((c) => [c.id, c.name]));

  const memberCounts = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    memberCounts.set(m.client_id, (memberCounts.get(m.client_id) ?? 0) + 1);
  }
  const openCounts = new Map<string, number>();
  for (const r of requestsRes.data ?? []) {
    if (r.status === "open" || r.status === "needs_attention") {
      openCounts.set(r.client_id, (openCounts.get(r.client_id) ?? 0) + 1);
    }
  }

  return clients.map((c) => ({
    ...c,
    memberCount: memberCounts.get(c.id) ?? 0,
    openRequests: openCounts.get(c.id) ?? 0,
    parentName: c.parent_client_id ? (byId.get(c.parent_client_id) ?? null) : null,
  }));
}

export async function createClient(input: {
  name: string;
  industry?: string | null;
  parent_client_id?: string | null;
  is_franchise_brand?: boolean;
}): Promise<ClientRow> {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: input.name.trim(),
      industry: input.industry?.trim() || null,
      parent_client_id: input.parent_client_id || null,
      is_franchise_brand: input.is_franchise_brand ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ClientRow;
}

export async function updateClient(
  id: string,
  input: { name: string; industry: string | null; parent_client_id: string | null; is_franchise_brand: boolean },
): Promise<void> {
  const { error } = await supabase
    .from("clients")
    .update({
      name: input.name.trim(),
      industry: input.industry?.trim() || null,
      parent_client_id: input.parent_client_id || null,
      is_franchise_brand: input.is_franchise_brand,
    })
    .eq("id", id);
  if (error) throw error;
}

export interface ClientMemberView extends ClientMemberRow {
  profile: Pick<ProfileRow, "id" | "full_name" | "email" | "phone"> | null;
}

export interface ClientDetail {
  client: ClientRow;
  parent: ClientRow | null;
  members: ClientMemberView[];
  requests: ClientRequestRow[];
  placements: PlacementRow[];
}

export async function fetchClientDetail(id: string): Promise<ClientDetail> {
  const [clientRes, membersRes, requestsRes, placementsRes, profilesRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("client_members").select("*").eq("client_id", id),
    supabase
      .from("client_requests")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("placements").select("*").eq("client_id", id),
    supabase.from("profiles").select("id, full_name, email, phone"),
  ]);
  if (clientRes.error) throw clientRes.error;
  if (!clientRes.data) throw new Error("Client not found");
  const client = clientRes.data as ClientRow;

  let parent: ClientRow | null = null;
  if (client.parent_client_id) {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("id", client.parent_client_id)
      .maybeSingle();
    parent = (data as ClientRow | null) ?? null;
  }

  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  return {
    client,
    parent,
    members: ((membersRes.data ?? []) as ClientMemberRow[]).map((m) => ({
      ...m,
      profile: (profileById.get(m.profile_id) as ClientMemberView["profile"]) ?? null,
    })),
    requests: (requestsRes.data ?? []) as ClientRequestRow[],
    placements: (placementsRes.data ?? []) as PlacementRow[],
  };
}

export async function addClientMember(input: {
  client_id: string;
  profile_id: string;
  client_position: string | null;
  is_primary: boolean;
}): Promise<void> {
  const { error } = await supabase.from("client_members").insert({
    client_id: input.client_id,
    profile_id: input.profile_id,
    client_position: input.client_position?.trim() || null,
    is_primary: input.is_primary,
  });
  if (error) throw error;
}

export async function removeClientMember(clientId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from("client_members")
    .delete()
    .eq("client_id", clientId)
    .eq("profile_id", profileId);
  if (error) throw error;
}

/* ----------------------------- client requests ---------------------------- */

export interface ClientRequestListItem extends ClientRequestRow {
  clientName: string | null;
  roleName: string | null;
  matchCount: number;
  hiredCount: number;
}

export async function fetchClientRequests(): Promise<ClientRequestListItem[]> {
  const [reqRes, clientsRes, rolesRes, matchesRes] = await Promise.all([
    supabase.from("client_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name"),
    supabase.from("job_roles").select("id, name"),
    supabase.from("candidate_matches").select("client_request_id, status"),
  ]);
  if (reqRes.error) throw reqRes.error;

  const clientName = new Map((clientsRes.data ?? []).map((c) => [c.id, c.name]));
  const roleName = new Map((rolesRes.data ?? []).map((r) => [r.id, r.name]));
  const counts = new Map<string, { total: number; hired: number }>();
  for (const m of matchesRes.data ?? []) {
    const cur = counts.get(m.client_request_id) ?? { total: 0, hired: 0 };
    cur.total += 1;
    if (m.status === "hired") cur.hired += 1;
    counts.set(m.client_request_id, cur);
  }

  return ((reqRes.data ?? []) as ClientRequestRow[]).map((r) => ({
    ...r,
    clientName: clientName.get(r.client_id) ?? null,
    roleName: roleName.get(r.role_id) ?? null,
    matchCount: counts.get(r.id)?.total ?? 0,
    hiredCount: counts.get(r.id)?.hired ?? 0,
  }));
}

export interface MatchView extends CandidateMatchRow {
  candidateName: string | null;
  candidateHeadline: string | null;
}

export interface ClientRequestDetail {
  request: ClientRequestRow;
  clientName: string | null;
  roleName: string | null;
  requiredSkills: { skill_id: string; name: string; is_required: boolean | null }[];
  matches: MatchView[];
}

export async function fetchClientRequestDetail(id: string): Promise<ClientRequestDetail> {
  const [reqRes, skillLinkRes, matchesRes, skillsRes] = await Promise.all([
    supabase.from("client_requests").select("*").eq("id", id).maybeSingle(),
    supabase.from("client_request_skills").select("*").eq("request_id", id),
    supabase
      .from("candidate_matches")
      .select("*")
      .eq("client_request_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("skills").select("id, name"),
  ]);
  if (reqRes.error) throw reqRes.error;
  if (!reqRes.data) throw new Error("Request not found");
  const request = reqRes.data as ClientRequestRow;

  const [clientRes, roleRes, candidatesRes] = await Promise.all([
    supabase.from("clients").select("name").eq("id", request.client_id).maybeSingle(),
    supabase.from("job_roles").select("name").eq("id", request.role_id).maybeSingle(),
    supabase.from("candidates").select("id, full_name, headline"),
  ]);

  const skillName = new Map((skillsRes.data ?? []).map((s) => [s.id, s.name]));
  const candidateById = new Map((candidatesRes.data ?? []).map((c) => [c.id, c]));

  return {
    request,
    clientName: clientRes.data?.name ?? null,
    roleName: roleRes.data?.name ?? null,
    requiredSkills: (skillLinkRes.data ?? []).map((s) => ({
      skill_id: s.skill_id,
      name: skillName.get(s.skill_id) ?? "Skill",
      is_required: s.is_required,
    })),
    matches: ((matchesRes.data ?? []) as CandidateMatchRow[]).map((m) => ({
      ...m,
      candidateName: candidateById.get(m.candidate_id)?.full_name ?? null,
      candidateHeadline: candidateById.get(m.candidate_id)?.headline ?? null,
    })),
  };
}

export async function createClientRequest(input: {
  client_id: string;
  role_id: string;
  title: string | null;
  candidates_wanted: number;
  hires_needed: number;
  engagement_type: string;
  hours_needed: string | null;
  timezone_requirement: string | null;
  years_experience_min: number | null;
  desired_start_date: string | null;
  days_of_week_needed: string[];
  notes: string | null;
  must_have_skills_text?: string | null;
  created_by: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from("client_requests")
    .insert({
      client_id: input.client_id,
      role_id: input.role_id,
      title: input.title?.trim() || null,
      candidates_wanted: input.candidates_wanted,
      hires_needed: input.hires_needed,
      engagement_type: input.engagement_type,
      hours_needed: input.hours_needed || null,
      timezone_requirement: input.timezone_requirement || null,
      years_experience_min: input.years_experience_min,
      desired_start_date: input.desired_start_date || null,
      days_of_week_needed: input.days_of_week_needed.length ? input.days_of_week_needed : null,
      notes: input.notes || null,
      must_have_skills_text: input.must_have_skills_text?.trim() || null,
      status: "open",
      created_by: input.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateRequestStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from("client_requests").update({ status }).eq("id", id);
  if (error) throw error;
}

/* ------------------------------- matches ---------------------------------- */

export async function addMatch(input: {
  client_request_id: string;
  candidate_id: string;
  match_reason: string | null;
}): Promise<void> {
  const { error } = await supabase.from("candidate_matches").insert({
    client_request_id: input.client_request_id,
    candidate_id: input.candidate_id,
    match_reason: input.match_reason || null,
    status: "recommended",
  });
  if (error) throw error;

  // A brand-new candidate becomes "shortlisted" the moment they enter a client pipeline.
  const { data: candidate } = await supabase
    .from("candidates")
    .select("status")
    .eq("id", input.candidate_id)
    .maybeSingle();
  if (candidate?.status === "new") {
    await supabase.from("candidates").update({ status: "shortlisted" }).eq("id", input.candidate_id);
  }
}

export async function updateMatchStatus(
  id: string,
  status: MatchStatus,
  extra?: { rejection_reason?: RejectionReason | null; rejection_reason_note?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "rejected") {
    patch.rejected_at = new Date().toISOString();
    patch.rejection_reason = extra?.rejection_reason ?? "other";
    patch.rejection_reason_note = extra?.rejection_reason_note || null;
  }
  const { error } = await supabase.from("candidate_matches").update(patch).eq("id", id);
  if (error) throw error;

  await applyCandidateStatusForMatch(id, status);
}

/**
 * Candidate lifecycle: new -> shortlisted / rejected -> interviewed -> hired -> placed.
 * "placed" is only set when an admin creates the actual placement record.
 */
async function applyCandidateStatusForMatch(matchId: string, status: MatchStatus): Promise<void> {
  if (!["interview_completed", "rejected", "hired"].includes(status)) return;

  const { data: match } = await supabase
    .from("candidate_matches")
    .select("candidate_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return;

  const { data: candidate } = await supabase
    .from("candidates")
    .select("status")
    .eq("id", match.candidate_id)
    .maybeSingle();
  const current = candidate?.status ?? null;

  let next: string | null = null;
  if (status === "interview_completed" && current === "shortlisted") next = "interviewed";
  if (status === "rejected" && (current === "shortlisted" || current === "interviewed")) {
    next = "rejected";
  }
  if (status === "hired") next = "hired";
  if (!next) return;

  await supabase.from("candidates").update({ status: next }).eq("id", match.candidate_id);
}

export interface CreatePlacementInput {
  candidateId: string;
  clientRequestId: string;
  seatTitle?: string | null;
  billingStartDate?: string | null;
  monthlyRate?: number | null;
  guaranteeWindowExpires?: string | null;
  notes?: string | null;
}

/** Creates the commercial placement record and moves the candidate to "placed". */
export async function createPlacement(input: CreatePlacementInput): Promise<string> {
  const { data: request, error: requestError } = await supabase
    .from("client_requests")
    .select("client_id, role_id, title")
    .eq("id", input.clientRequestId)
    .maybeSingle();
  if (requestError) throw requestError;
  if (!request) throw new Error("Client request not found");

  let seatTitle = input.seatTitle?.trim() || request.title || null;
  if (!seatTitle && request.role_id) {
    const { data: role } = await supabase
      .from("job_roles")
      .select("name")
      .eq("id", request.role_id)
      .maybeSingle();
    seatTitle = role?.name ?? null;
  }

  const { data, error } = await supabase
    .from("placements")
    .insert({
      candidate_id: input.candidateId,
      client_id: request.client_id,
      client_request_id: input.clientRequestId,
      role_id: request.role_id,
      seat_title: seatTitle,
      billing_start_date: input.billingStartDate || null,
      monthly_rate: input.monthlyRate ?? null,
      guarantee_window_expires: input.guaranteeWindowExpires || null,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase.from("candidates").update({ status: "placed" }).eq("id", input.candidateId);
  return data.id;
}

export async function fetchAllMatches(): Promise<CandidateMatchRow[]> {
  const { data, error } = await supabase
    .from("candidate_matches")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CandidateMatchRow[];
}

export interface CandidateMatchView extends CandidateMatchRow {
  requestTitle: string | null;
  clientName: string | null;
  roleName: string | null;
}

export async function fetchMatchesForCandidate(candidateId: string): Promise<CandidateMatchView[]> {
  const { data, error } = await supabase
    .from("candidate_matches")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const matches = (data ?? []) as CandidateMatchRow[];
  if (!matches.length) return [];

  const [requestsRes, clientsRes, rolesRes] = await Promise.all([
    supabase
      .from("client_requests")
      .select("id, title, client_id, role_id")
      .in("id", matches.map((m) => m.client_request_id)),
    supabase.from("clients").select("id, name"),
    supabase.from("job_roles").select("id, name"),
  ]);
  const reqById = new Map((requestsRes.data ?? []).map((r) => [r.id, r]));
  const clientName = new Map((clientsRes.data ?? []).map((c) => [c.id, c.name]));
  const roleName = new Map((rolesRes.data ?? []).map((r) => [r.id, r.name]));

  return matches.map((m) => {
    const req = reqById.get(m.client_request_id);
    return {
      ...m,
      requestTitle: req?.title ?? null,
      clientName: req ? (clientName.get(req.client_id) ?? null) : null,
      roleName: req ? (roleName.get(req.role_id) ?? null) : null,
    };
  });
}

/* ------------------------------ placements -------------------------------- */

export interface PlacementListItem extends PlacementRow {
  candidateName: string | null;
  clientName: string | null;
  roleName: string | null;
}

export async function fetchPlacements(): Promise<PlacementListItem[]> {
  const [placementsRes, candidatesRes, clientsRes, rolesRes] = await Promise.all([
    supabase.from("placements").select("*").order("created_at", { ascending: false }),
    supabase.from("candidates").select("id, full_name"),
    supabase.from("clients").select("id, name"),
    supabase.from("job_roles").select("id, name"),
  ]);
  if (placementsRes.error) throw placementsRes.error;
  const candidateName = new Map((candidatesRes.data ?? []).map((c) => [c.id, c.full_name]));
  const clientName = new Map((clientsRes.data ?? []).map((c) => [c.id, c.name]));
  const roleName = new Map((rolesRes.data ?? []).map((r) => [r.id, r.name]));

  return ((placementsRes.data ?? []) as PlacementRow[]).map((p) => ({
    ...p,
    candidateName: candidateName.get(p.candidate_id) ?? null,
    clientName: clientName.get(p.client_id) ?? null,
    roleName: p.role_id ? (roleName.get(p.role_id) ?? null) : null,
  }));
}

/* --------------------------- candidate files ------------------------------ */

export async function fetchCandidateFiles(candidateId: string): Promise<CandidateFileRow[]> {
  const { data, error } = await supabase
    .from("candidate_files")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CandidateFileRow[];
}

export async function uploadCandidateFile(input: {
  candidateId: string;
  file: File;
  fileType: CandidateFileType;
  uploadedBy: string | null;
}): Promise<void> {
  const bucket = bucketForFileType(input.fileType);
  const safeName = input.file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${input.candidateId}/${input.fileType}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, input.file, { upsert: false, contentType: input.file.type || undefined });
  if (upErr) throw upErr;

  const { error } = await supabase.from("candidate_files").insert({
    candidate_id: input.candidateId,
    file_type: input.fileType,
    bucket_id: bucket,
    storage_path: path,
    file_name: input.file.name,
    mime_type: input.file.type || null,
    size_bytes: input.file.size,
    uploaded_by: input.uploadedBy,
  });
  if (error) throw error;
}

export async function getCandidateFileUrl(file: CandidateFileRow): Promise<string> {
  const { data, error } = await supabase.storage
    .from(file.bucket_id)
    .createSignedUrl(file.storage_path, 60 * 10);
  if (error || !data) throw error ?? new Error("Could not open file");
  return data.signedUrl;
}

export async function deleteCandidateFile(file: CandidateFileRow): Promise<void> {
  await supabase.storage.from(file.bucket_id).remove([file.storage_path]);
  const { error } = await supabase.from("candidate_files").delete().eq("id", file.id);
  if (error) throw error;
}

/* --------------------------- AI profile (read/edit) ----------------------- */

export async function fetchCandidateAiProfile(
  candidateId: string,
): Promise<CandidateAiProfileRow | null> {
  const { data, error } = await supabase
    .from("candidate_ai_profiles")
    .select("*")
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (error) throw error;
  return (data as CandidateAiProfileRow | null) ?? null;
}

export async function saveApprovedSummary(candidateId: string, summary: string): Promise<void> {
  const { error } = await supabase
    .from("candidate_ai_profiles")
    .upsert(
      { candidate_id: candidateId, approved_summary: summary || null },
      { onConflict: "candidate_id" },
    );
  if (error) throw error;
}

/* ----------------------------- notifications ------------------------------ */

export async function fetchNotifications(recipientId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationRead(id: string, read = true): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read }).eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(recipientId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient_id", recipientId)
    .eq("read", false);
  if (error) throw error;
}

/* ------------------------------- audit logs ------------------------------- */

export interface AuditLogView extends AuditLogRow {
  userName: string | null;
}

export async function fetchAuditLogs(limit = 200): Promise<AuditLogView[]> {
  const [logsRes, profilesRes] = await Promise.all([
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  if (logsRes.error) throw logsRes.error;
  const byId = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name || p.email]));
  return ((logsRes.data ?? []) as AuditLogRow[]).map((l) => ({
    ...l,
    userName: l.user_id ? (byId.get(l.user_id) ?? null) : null,
  }));
}

export async function fetchMyAuditLogs(userId: string, limit = 200): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AuditLogRow[];
}

/* ----------------------- candidate media (photo/video) -------------------- */

export async function fetchCandidateMedia(candidateId: string): Promise<{
  photoUrl: string | null;
  videoUrl: string | null;
  videoName: string | null;
  videoMimeType: string | null;
}> {
  const files = await fetchCandidateFiles(candidateId);
  const photo = files.find((f) => f.file_type === "profile_photo") ?? null;
  const video = files.find((f) => f.file_type === "intro_video") ?? null;
  const [photoUrl, videoUrl] = await Promise.all([
    photo ? getCandidateFileUrl(photo).catch(() => null) : Promise.resolve(null),
    video ? getCandidateFileUrl(video).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    photoUrl,
    videoUrl,
    videoName: video?.file_name ?? null,
    videoMimeType: video?.mime_type ?? null,
  };
}

/* --------------------- pipeline views (interview / offer) ----------------- */

export interface MatchPipelineView extends CandidateMatchRow {
  candidateName: string | null;
  candidateHeadline: string | null;
  requestTitle: string | null;
  clientName: string | null;
  roleName: string | null;
}

export async function fetchMatchesByStatus(statuses: MatchStatus[]): Promise<MatchPipelineView[]> {
  const { data, error } = await supabase
    .from("candidate_matches")
    .select("*")
    .in("status", statuses)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const matches = (data ?? []) as CandidateMatchRow[];
  if (!matches.length) return [];

  const [requestsRes, clientsRes, rolesRes, candidatesRes] = await Promise.all([
    supabase
      .from("client_requests")
      .select("id, title, client_id, role_id")
      .in("id", matches.map((m) => m.client_request_id)),
    supabase.from("clients").select("id, name"),
    supabase.from("job_roles").select("id, name"),
    supabase.from("candidates").select("id, full_name, headline"),
  ]);
  const reqById = new Map((requestsRes.data ?? []).map((r) => [r.id, r]));
  const clientName = new Map((clientsRes.data ?? []).map((c) => [c.id, c.name]));
  const roleName = new Map((rolesRes.data ?? []).map((r) => [r.id, r.name]));
  const candidateById = new Map((candidatesRes.data ?? []).map((c) => [c.id, c]));

  return matches.map((m) => {
    const req = reqById.get(m.client_request_id);
    return {
      ...m,
      candidateName: candidateById.get(m.candidate_id)?.full_name ?? null,
      candidateHeadline: candidateById.get(m.candidate_id)?.headline ?? null,
      requestTitle: req?.title ?? null,
      clientName: req ? (clientName.get(req.client_id) ?? null) : null,
      roleName: req ? (roleName.get(req.role_id) ?? null) : null,
    };
  });
}

/* ------------------------ audit logs with actor role ---------------------- */

export interface AuditLogActorView extends AuditLogView {
  userRole: AppRoleName | null;
}

export async function fetchAuditLogsWithRole(limit = 200): Promise<AuditLogActorView[]> {
  const [logsRes, profilesRes] = await Promise.all([
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("profiles").select("id, full_name, email, role"),
  ]);
  if (logsRes.error) throw logsRes.error;
  const byId = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  return ((logsRes.data ?? []) as AuditLogRow[]).map((l) => {
    const p = l.user_id ? byId.get(l.user_id) : null;
    return {
      ...l,
      userName: p ? (p.full_name || p.email) : null,
      userRole: (p?.role as AppRoleName | undefined) ?? null,
    };
  });
}

/* ------------------------- admin candidate actions ------------------------ */

export async function setCandidateStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from("candidates").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function setCandidateRecruiter(id: string, recruiterId: string | null): Promise<void> {
  const { error } = await supabase.from("candidates").update({ recruiter_id: recruiterId }).eq("id", id);
  if (error) throw error;
}

/* ----------------------------- system monitor ----------------------------- */

export interface SystemStats {
  candidates: number;
  clients: number;
  requests: number;
  placements: number;
  matches: number;
  files: number;
  storageBytes: number;
}

async function countRows(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

export async function fetchSystemStats(): Promise<SystemStats> {
  const [candidates, clients, requests, placements, matches, filesRes] = await Promise.all([
    countRows("candidates"),
    countRows("clients"),
    countRows("client_requests"),
    countRows("placements"),
    countRows("candidate_matches"),
    supabase.from("candidate_files").select("size_bytes"),
  ]);
  const files = filesRes.data ?? [];
  return {
    candidates,
    clients,
    requests,
    placements,
    matches,
    files: files.length,
    storageBytes: files.reduce((sum, f) => sum + (f.size_bytes ?? 0), 0),
  };
}
