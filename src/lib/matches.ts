import { supabase } from "./supabase";

/**
 * Storage bucket holding candidate media (`profile_photo_path`, `intro_video_path`
 * on `candidate_pool_profile` are paths inside this bucket, not full URLs).
 *
 * NOTE: the bucket name could not be read from the backend with the client
 * (anon/authenticated) key — storage listing is staff-only. If photos do not
 * appear, change this one constant to the bucket the admin dashboard uses.
 */
export const CANDIDATE_MEDIA_BUCKET = "candidate-media";

/** Resolves a Storage path to a temporary signed URL. Returns null if unavailable. */
export async function signedMediaUrl(path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(CANDIDATE_MEDIA_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

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
