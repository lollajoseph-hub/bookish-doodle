import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Star,
  ThumbsDown,
  UserSearch,
  Video,
} from "lucide-react";
import {
  MATCH_STATUS_LABELS,
  displayName,
  formatDate,
  formatDateTime,
  rejectionReasonLabel,
  toStringList,
  type MatchStatus,
} from "@/lib/matches";

export interface PoolProfile {
  candidate_id: string;
  full_name: string | null;
  headline: string | null;
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
  "candidate_pool_profile(candidate_id,full_name,headline,country,timezone,weekly_hours_available,preferred_shift,years_experience,earliest_start_date,approved_summary,highlights,skills,primary_role,secondary_roles,profile_photo_path)";

export function statusTone(s: MatchStatus | string) {
  switch (s) {
    case "hired":
      return "bg-emerald-100 text-emerald-800";
    case "shortlisted":
      return "bg-amber-100 text-amber-900";
    case "rejected":
      return "bg-slate-200 text-slate-700";
    case "interview_confirmed":
    case "interview_completed":
    case "offer_extended":
      return "bg-primary/10 text-primary";
    default:
      return "bg-secondary text-secondary-foreground";
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

  const primaryRole = toStringList(p?.primary_role)[0] ?? null;
  const scheduled = formatDateTime(match.interview_scheduled_at);

  const availability = [
    p?.weekly_hours_available ? `${p.weekly_hours_available} hrs/week` : null,
    p?.preferred_shift,
    p?.timezone,
    p?.earliest_start_date ? `available from ${formatDate(p.earliest_start_date)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const canAct = status === "recommended" || status === "shortlisted";

  return (
    <Card className={`card-amber relative rounded-2xl ${isRejected ? "opacity-60" : ""}`}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-4">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-24 w-24 flex-none rounded-full object-cover ring-2 ring-primary/15" />
          ) : (
            <div className="grid h-24 w-24 flex-none place-items-center rounded-full bg-primary/10 text-3xl font-semibold text-primary">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="min-w-0">
                {!isHired && <p className="text-sm italic leading-none text-muted-foreground">Meet</p>}
                <h3 className="truncate text-base font-semibold leading-tight">{name}</h3>
              </div>
              <Badge variant="secondary" className={statusTone(status)}>
                {isHired && <CheckCircle2 className="mr-1 h-3 w-3" />}
                {MATCH_STATUS_LABELS[status] ?? status}
              </Badge>
            </div>
            {p?.headline && <p className="truncate text-xs text-muted-foreground">{p.headline}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[
                primaryRole,
                p?.years_experience
                  ? `${p.years_experience} ${p.years_experience === 1 ? "yr" : "yrs"} experience`
                  : null,
                p?.country,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {contextLabel && <div className="mt-1 text-xs text-muted-foreground">{contextLabel}</div>}
          </div>
        </div>

        {p?.approved_summary && (
          <p className="line-clamp-4 text-sm text-muted-foreground">{p.approved_summary}</p>
        )}

        {availability && <p className="text-xs text-muted-foreground">{availability}</p>}

        {status === "interview_requested" && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Clock className="h-4 w-4 flex-none" />
            {match.interview_proposed_at
              ? `You proposed ${formatDateTime(match.interview_proposed_at)} — waiting for ScaleSource to confirm.`
              : "Interview requested — waiting for ScaleSource to confirm."}
          </div>
        )}

        {status === "interview_confirmed" && (
          <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <CalendarClock className="h-4 w-4 flex-none" />
              {scheduled ? `Interview on ${scheduled}` : "Interview confirmed"}
            </p>
            {match.meet_url && (
              <Button asChild size="sm" className="w-full">
                <a href={match.meet_url} target="_blank" rel="noreferrer">
                  <Video className="mr-1.5 h-4 w-4" />
                  Join Meet
                </a>
              </Button>
            )}
          </div>
        )}

        {status === "interview_completed" && (
          <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <CalendarClock className="h-4 w-4 flex-none" />
              {scheduled ? `Interview held on ${scheduled}` : "Interview completed"}
            </p>
            {match.interview_notes && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{match.interview_notes}</p>
            )}
          </div>
        )}

        {isRejected && (
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            <p className="font-medium">Not a fit — {rejectionReasonLabel(match.rejection_reason)}</p>
            {match.rejection_reason_note && (
              <p className="mt-0.5 text-muted-foreground">{match.rejection_reason_note}</p>
            )}
            {match.rejected_at && (
              <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(match.rejected_at)}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
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
