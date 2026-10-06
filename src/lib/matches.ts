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
  | "hire_requested"
  | "offer_extended"
  | "hired"
  | "rejected";

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  recommended: "Recommended",
  shortlisted: "Shortlisted",
  interview_requested: "Interview requested",
  interview_confirmed: "Interview confirmed",
  interview_completed: "Interview completed",
  hire_requested: "Hire requested",
  offer_extended: "Contract sent",
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

/** `client_requests.priority` — badges show only for non-default values. */
export const REQUEST_PRIORITY_LABELS: Record<string, string> = {
  high: "High Priority",
  urgent: "Urgent",
};

export function requestPriorityTone(p: string | null | undefined) {
  switch (p) {
    case "urgent":
      return "bg-destructive/10 text-destructive";
    case "high":
      return "bg-amber-100 text-amber-900";
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Generic words that can appear in placeholder names — never safe to replace on their own. */
const NAME_PART_STOPWORDS = new Set([
  "candidate",
  "test",
  "pipeline",
  "profile",
  "the",
  "and",
  "ltd",
  "inc",
]);

/** Verbs that typically follow a person's name at the start of an AI-written bio. */
const NAME_FOLLOWING_VERBS =
  "is|was|has|had|brings|combines|offers|delivers|specializes|specialises|excels|leads|works|holds|joined|builds|manages|supports|thrives";

/** Detects "Omolola Joseph is …" style openers so a name that differs from the stored one is caught too. */
function detectNamesInText(text: string): string[][] {
  const pattern = new RegExp(
    `(?:^|[.!?]\\s+|\\n)((?:[A-Z][\\p{L}'’-]+)(?:\\s+(?:de|la|del|della|van|von|da|dos|di|bin|al)?\\s*[A-Z][\\p{L}'’-]+){1,3})\\s+(?:${NAME_FOLLOWING_VERBS})\\b`,
    "gu",
  );
  const found: string[][] = [];
  for (const match of text.matchAll(pattern)) {
    const parts = (match[1] ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) found.push(parts);
  }
  return found;
}

/** Every contiguous run of name parts, longest first, so "De La Cruz" is replaced before "Cruz". */
function nameSequences(parts: string[]): string[][] {
  const seqs: string[][] = [];
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = parts.length; j > i; j -= 1) {
      const seq = parts.slice(i, j);
      if (seq.length === 1) {
        const only = (seq[0] ?? "").toLowerCase();
        if (only.length < 3 || NAME_PART_STOPWORDS.has(only)) continue;
      }
      seqs.push(seq);
    }
  }
  return seqs.sort((a, b) => b.length - a.length);
}

/**
 * Generated analysis may predate the first-name-only client display rule.
 * Replace stored full-name mentions at render time so existing content cannot reveal a surname.
 * Handles multi-part surnames, possessives, any capitalization, and names that differ from the
 * stored `full_name` (an opener like "Omolola Joseph is …" is treated as the candidate's name).
 */
export function firstNameOnlyAnalysis(
  text: string | null | undefined,
  fullName: string | null | undefined,
) {
  if (!text) return "";
  const storedParts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const detected = detectNamesInText(text);
  if (storedParts.length < 2 && detected.length === 0) return text;

  const firstName = storedParts[0] && storedParts.length >= 2 ? storedParts[0] : null;
  let result = text;

  const applyAll = (parts: string[], replacement: string) => {
    for (const seq of nameSequences(parts)) {
      const body = seq.map(escapeRe).join("\\s+");
      // Keep possessives readable: "Santos'" / "Santos’s" -> "Maria's".
      const pattern = new RegExp(`\\b${body}(['’]s|['’])?(?![\\p{L}])`, "giu");
      result = result.replace(pattern, (_m, poss: string | undefined) =>
        poss ? `${replacement}'s` : replacement,
      );
    }
  };

  // Names written in the text (possibly different from the stored one) collapse to their own first name.
  const storedLower = new Set(storedParts.map((p) => p.toLowerCase()));
  for (const parts of detected) {
    const overlaps = parts.some((p) => storedLower.has(p.toLowerCase()));
    const target = (overlaps ? firstName : parts[0]) ?? parts[0] ?? "";
    if (!target) continue;
    applyAll(parts, target);
  }
  if (firstName) applyAll(storedParts, firstName);

  // Collapse stutters like "Maria Maria" produced when only part of the full name appeared.
  const anchor = firstName ?? detected[0]?.[0];
  if (anchor) {
    const stutter = new RegExp(`\\b${escapeRe(anchor)}(?:\\s+${escapeRe(anchor)})+\\b`, "gi");
    result = result.replace(stutter, anchor);
  }
  return result;
}

/**
 * Same per-match rule as `displayName`: a `hired` match may show text as written; every other match
 * gets `firstNameOnlyAnalysis` so free text (match reason, headline, notes, history) cannot reveal a surname.
 */
export function privacyText(
  text: string | null | undefined,
  fullName: string | null | undefined,
  status: string | null | undefined,
) {
  if (!text) return "";
  // Matches created before the reason generator existed still hold a scoring placeholder, not a real reason.
  if (/^\s*Structured match:/i.test(text)) return "";
  if (status === "hired") return text;
  return firstNameOnlyAnalysis(text, fullName);
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
