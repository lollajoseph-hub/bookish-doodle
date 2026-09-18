import { supabase } from "./supabase";

/** Private Storage buckets holding candidate media. Paths come from `candidate_pool_profile`. */
export const PHOTOS_BUCKET = "candidate-photos";
export const VIDEOS_BUCKET = "intro-videos";

/** Signed URLs expire — resolve per page load, never persist them. */
const SIGNED_URL_TTL_SECONDS = 3600;

/** Resolves a Storage path to a temporary signed URL. Returns null when absent/unavailable. */
export async function resolveSignedUrl(bucket: string, path: string | null | undefined) {
  if (!path || !path.trim()) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export const signedPhotoUrl = (path: string | null | undefined) =>
  resolveSignedUrl(PHOTOS_BUCKET, path);

export const signedVideoUrl = (path: string | null | undefined) =>
  resolveSignedUrl(VIDEOS_BUCKET, path);

/** `candidate_matches.status` enum. */
export type MatchStatus =
  | "recommended"
  | "shortlisted"
  | "interview_requested"
  | "interview_confirmed"
  | "interview_completed"
  | "offer_extended"
  | "hired"
  | "rejected";

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  recommended: "Recommended",
  shortlisted: "Shortlisted",
  interview_requested: "Interview requested",
  interview_confirmed: "Interview confirmed",
  interview_completed: "Interview completed",
  offer_extended: "Offer extended",
  hired: "Hired",
  rejected: "Not a fit",
};

/** `rejection_reason` enum — exactly these four values. */
export const REJECTION_REASONS = [
  { value: "skill_mismatch", label: "Skill mismatch" },
  { value: "availability_conflict", label: "Availability conflict" },
  { value: "culture_fit", label: "Culture fit" },
  { value: "other", label: "Other" },
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number]["value"];

export function rejectionReasonLabel(v: string | null | undefined) {
  return REJECTION_REASONS.find((r) => r.value === v)?.label ?? v ?? "—";
}

/** `client_requests.status` enum. */
export const REQUEST_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  needs_attention: "Needs attention",
  fulfilled: "Fulfilled",
  closed: "Closed",
};

export function requestStatusTone(s: string | null | undefined) {
  switch (s) {
    case "fulfilled":
      return "bg-emerald-100 text-emerald-800";
    case "needs_attention":
      return "bg-amber-100 text-amber-900";
    case "closed":
      return "bg-slate-200 text-slate-700";
    case "open":
    default:
      return "bg-primary/10 text-primary";
  }
}

/**
 * Per-match name rule: only a match with status `hired` may reveal the full name.
 * Every other match for the same candidate shows the first name only.
 */
export function displayName(fullName: string | null | undefined, status: string | null | undefined) {
  const name = (fullName ?? "").trim();
  if (!name) return "Candidate";
  if (status === "hired") return name;
  return name.split(/\s+/)[0] ?? name;
}

export function formatDateTime(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** jsonb array columns come back as arrays of strings (or objects with a name). */
export function toStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const n = o["name"] ?? o["label"] ?? o["title"];
        if (typeof n === "string") return n;
      }
      return null;
    })
    .filter((s): s is string => !!s);
}
