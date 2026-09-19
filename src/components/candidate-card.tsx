import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Sparkles,
  Star,
  ThumbsDown,
  UserSearch,
  Video,
} from "lucide-react";
import {
  MATCH_STATUS_LABELS,
  displayName,
  type MatchStatus,
} from "@/lib/matches";

export interface PoolProfile {
  candidate_id: string;
  full_name: string | null;
  headline: string | null;
  availability: string | null;
  country: string | null;
  timezone: string | null;
  weekly_hours_available: number | null;
  preferred_shift: string | null;
  years_experience: number | null;
  earliest_start_date: string | null;
  approved_summary: string | null;
  highlights: unknown;
  skills: unknown;
  primary_role: unknown;
  secondary_roles: unknown;
  profile_photo_path: string | null;
}

export interface MatchRow {
  id: string;
  status: MatchStatus;
  client_request_id: string;
  interview_proposed_at: string | null;
  interview_scheduled_at: string | null;
  meet_url: string | null;
  interview_notes: string | null;
  rejection_reason: string | null;
  rejection_reason_note: string | null;
  rejected_at: string | null;
  match_score: number | null;
  match_reason: string | null;
  candidate_id: string;
  candidate_pool_profile: PoolProfile | null;
}

export const MATCH_SELECT =
  "id,status,client_request_id,interview_proposed_at,interview_scheduled_at,meet_url,interview_notes,rejection_reason,rejection_reason_note,rejected_at,match_score,match_reason,candidate_id," +
  "candidate_pool_profile(candidate_id,full_name,headline,availability,country,timezone,weekly_hours_available,preferred_shift,years_experience,earliest_start_date,approved_summary,highlights,skills,primary_role,secondary_roles,profile_photo_path)";

export function statusTone(s: MatchStatus | string) {
  switch (s) {
    case "hired":
      return "bg-success text-success-foreground";
    case "shortlisted":
      return "bg-amber text-amber-foreground";
    case "rejected":
      return "bg-muted text-muted-foreground";
    case "interview_requested":
      return "bg-primary text-primary-foreground";
    case "interview_confirmed":
    case "interview_completed":
    case "offer_extended":
      return "bg-primary-soft text-primary";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

export function MatchStatusIcon({ status }: { status: MatchStatus | string }) {
  const iconClass = "h-3 w-3 flex-none";
  switch (status) {
    case "recommended":
      return <Sparkles className={iconClass} />;
    case "shortlisted":
      return <Star className={`${iconClass} fill-current`} />;
    case "interview_requested":
      return <Clock className={iconClass} />;
    case "interview_confirmed":
      return <CalendarClock className={iconClass} />;
    case "interview_completed":
      return <CalendarCheck className={iconClass} />;
    case "offer_extended":
      return <Mail className={iconClass} />;
    case "hired":
      return <CheckCircle2 className={iconClass} />;
    case "rejected":
      return <ThumbsDown className={iconClass} />;
    default:
      return <UserSearch className={iconClass} />;
  }
}

function availabilityLabel(value: string | null | undefined) {
  switch (value) {
    case "available":
      return "Available Immediately";
    case "open_to_offers":
      return "Open to offers";
    case "not_available":
      return "Not available";
    default:
      return null;
  }
}

export function CandidateCard({
  match,
  photoUrl,
  busy,
  contextLabel,
  onShortlist,
  onRequestInterview,
  onRequestHire,
  onReject,
  onViewProfile,
  footer,
}: {
  match: MatchRow;
  photoUrl: string | null;
  busy: boolean;
  /** e.g. the request this match belongs to, on cross-request views. */
  contextLabel?: React.ReactNode;
  onShortlist?: () => void;
  onRequestInterview?: () => void;
  onRequestHire?: () => void;
  onReject?: () => void;
  onViewProfile?: () => void;
  footer?: React.ReactNode;
}) {
  const p = match.candidate_pool_profile;
  const status = match.status;
  const isRejected = status === "rejected";
  const isHired = status === "hired";

  // Per-match rule: the full name is revealed only when THIS match is hired.
  const name = displayName(p?.full_name, status);
  const initial = name.slice(0, 1).toUpperCase();
  const availabilityStatus = availabilityLabel(p?.availability);

  const canAct = status === "recommended" || status === "shortlisted";

  return (
    <Card className={`card-amber relative h-full rounded-2xl ${isRejected ? "opacity-60" : ""}`}>
      <span
        className={`absolute right-4 top-4 z-10 inline-flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(status)}`}
      >
        <MatchStatusIcon status={status} />
        {MATCH_STATUS_LABELS[status] ?? status}
      </span>
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start gap-4">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-24 w-24 flex-none rounded-full object-cover ring-2 ring-primary/15" />
          ) : (
            <div className="grid h-24 w-24 flex-none place-items-center rounded-full bg-primary/10 text-3xl font-semibold text-primary">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1 pt-8">
            <div className="min-w-0 space-y-1">
              {!isHired && <p className="text-sm italic leading-none text-muted-foreground">Meet</p>}
              <h3 className="truncate text-lg font-semibold leading-tight">{name}</h3>
              {p?.headline && <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">{p.headline}</p>}
              {availabilityStatus && (
                <p
                  className={`text-sm font-semibold ${p?.availability === "not_available" ? "text-muted-foreground" : "text-success"}`}
                >
                  {availabilityStatus}
                </p>
              )}
            </div>
          </div>
        </div>

        {contextLabel && <div className="text-xs text-muted-foreground">{contextLabel}</div>}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {onViewProfile && (
            <Button variant="secondary" size="sm" onClick={onViewProfile}>
              <UserSearch className="mr-1.5 h-4 w-4" />
              View full profile
            </Button>
          )}

          {canAct && onShortlist && (
            <Button
              variant={status === "shortlisted" ? "default" : "outline"}
              size="sm"
              disabled={busy}
              onClick={onShortlist}
              className={status === "shortlisted" ? "bg-amber-500 text-white hover:bg-amber-600" : ""}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Star className={`mr-1.5 h-4 w-4 ${status === "shortlisted" ? "fill-current" : ""}`} />
              )}
              {status === "shortlisted" ? "Shortlisted" : "Shortlist"}
            </Button>
          )}

          {canAct && onRequestInterview && (
            <Button size="sm" disabled={busy} onClick={onRequestInterview}>
              <Video className="mr-1.5 h-4 w-4" />
              Request interview
            </Button>
          )}

          {canAct && onReject && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onReject}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <ThumbsDown className="mr-1.5 h-4 w-4" />
              Not a fit
            </Button>
          )}

          {footer}
        </div>

        {status === "interview_completed" && onRequestHire && (
          <Button className="w-full" disabled={busy} onClick={onRequestHire}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Request to hire
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
