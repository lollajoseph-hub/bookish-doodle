import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  BriefcaseBusiness,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Sparkles,
  Star,
  ThumbsDown,
  Timer,
  UserSearch,
  Video,
} from "lucide-react";
import {
  MATCH_STATUS_LABELS,
  REJECTION_REASONS,
  type RejectionReason,
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
  interview_proposed_by: string | null;
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
  "id,status,client_request_id,interview_proposed_at,interview_proposed_by,interview_scheduled_at,meet_url,interview_notes,rejection_reason,rejection_reason_note,rejected_at,match_score,match_reason,candidate_id," +
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
    case "hire_requested":
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
    case "hire_requested":
      return <CheckCircle2 className={iconClass} />;
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
  onRejected,
  onInterviewTimeAccepted,
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
  /** Called after a successful inline rejection so the parent can refresh. */
  onRejected?: () => void;
  /** Called after accepting a ScaleSource counter-proposed time so the parent can refresh. */
  onInterviewTimeAccepted?: () => void;
  onViewProfile?: () => void;
  footer?: React.ReactNode;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState<RejectionReason | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [acceptingTime, setAcceptingTime] = useState(false);

  async function acceptInterviewTime() {
    setAcceptingTime(true);
    const { error } = await supabase.rpc("client_confirm_interview_time", { p_match_id: match.id });
    setAcceptingTime(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Interview confirmed");
    onInterviewTimeAccepted?.();
  }

  async function submitRejection() {
    if (!rejectReason) return;
    setRejectBusy(true);
    const { error } = await supabase.rpc("reject_candidate_match", {
      p_match_id: match.id,
      p_reason: rejectReason,
      p_note: rejectNote.trim() ? rejectNote.trim() : null,
    });
    setRejectBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Feedback sent — thanks");
    setRejecting(false);
    setRejectReason(null);
    setRejectNote("");
    onRejected?.();
  }

  const p = match.candidate_pool_profile;
  const status = match.status;
  const isRejected = status === "rejected";
  const isHired = status === "hired";

  // Per-match rule: the full name is revealed only when THIS match is hired.
  const name = displayName(p?.full_name, status);
  const initial = name.slice(0, 1).toUpperCase();
  const primaryRole = toStringList(p?.primary_role)[0] ?? null;
  const scheduled = formatDateTime(match.interview_scheduled_at);
  const availabilityStatus = availabilityLabel(p?.availability);

  const scheduleDetails = [
    p?.weekly_hours_available ? `${p.weekly_hours_available} hrs/week` : null,
    p?.preferred_shift,
    p?.timezone,
    p?.earliest_start_date ? `available from ${formatDate(p.earliest_start_date)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const canAct = status === "recommended" || status === "shortlisted";
  /** Rejection stays available after the interview, once the client has read the notes. */
  const canReject = canAct || status === "interview_completed";

  return (
    <Card className={`card-amber relative rounded-2xl ${isRejected ? "opacity-60" : ""}`}>
      <span
        className={`absolute right-4 top-4 z-10 inline-flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(status)}`}
      >
        <MatchStatusIcon status={status} />
        {MATCH_STATUS_LABELS[status] ?? status}
      </span>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-4 pt-8">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-24 w-24 flex-none rounded-full object-cover ring-2 ring-primary/15" />
          ) : (
            <div className="grid h-24 w-24 flex-none place-items-center rounded-full bg-primary/10 text-3xl font-semibold text-primary">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
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

        <div className="grid gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground sm:grid-cols-2">
          {primaryRole && (
            <p className="flex min-w-0 items-center gap-2">
              <BriefcaseBusiness className="h-3.5 w-3.5 flex-none text-primary" />
              <span className="truncate font-medium text-foreground/80">{primaryRole}</span>
            </p>
          )}
          {p?.years_experience != null && (
            <p className="flex items-center gap-2">
              <Timer className="h-3.5 w-3.5 flex-none text-primary" />
              <span>{p.years_experience} {p.years_experience === 1 ? "Year" : "Years"} Experience</span>
            </p>
          )}
          {p?.country && (
            <p className="flex min-w-0 items-center gap-2">
              <MapPin className="h-3.5 w-3.5 flex-none text-primary" />
              <span className="truncate">{p.country}</span>
            </p>
          )}
          {scheduleDetails && (
            <p className="flex min-w-0 items-center gap-2 sm:col-span-2">
              <Clock className="h-3.5 w-3.5 flex-none text-primary" />
              <span className="leading-relaxed">{scheduleDetails}</span>
            </p>
          )}
        </div>
        {contextLabel && <div className="text-xs text-muted-foreground">{contextLabel}</div>}

        {status === "interview_requested" &&
          (match.interview_proposed_by === "staff" ? (
            <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary">
              <p className="flex items-center gap-2 font-medium">
                <Clock className="h-4 w-4 flex-none" />
                ScaleSource proposed a new time: {formatDateTime(match.interview_proposed_at)}
              </p>
              <Button size="sm" disabled={acceptingTime} onClick={acceptInterviewTime}>
                {acceptingTime && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Accept this time
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary">
              <Clock className="h-4 w-4 flex-none" />
              {match.interview_proposed_at
                ? `You proposed ${formatDateTime(match.interview_proposed_at)} — waiting for ScaleSource to confirm.`
                : "Interview requested — waiting for ScaleSource to confirm."}
            </div>
          ))}

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

        {status === "hire_requested" && (
          <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="h-4 w-4 flex-none" />
              Hire requested — waiting on ScaleSource to send the contract.
            </p>
          </div>
        )}

        {status === "offer_extended" && (
          <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <Mail className="h-4 w-4 flex-none" />
              Contract sent — you&apos;ll be notified once the placement is confirmed.
            </p>
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

        {rejecting && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              Not a fit — tell us why so we can find better matches.
            </p>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Select
                value={rejectReason ?? undefined}
                onValueChange={(v) => setRejectReason(v as RejectionReason)}
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`reject-note-${match.id}`}>Additional notes (optional)</Label>
              <Textarea
                id={`reject-note-${match.id}`}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                placeholder="Anything else we should know?"
                className="bg-background"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={rejectBusy}
                onClick={() => {
                  setRejecting(false);
                  setRejectReason(null);
                  setRejectNote("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!rejectReason || rejectBusy}
                onClick={submitRejection}
              >
                {rejectBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Submit
              </Button>
            </div>
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

          {canAct && onRejected && !rejecting && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setRejecting(true)}
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
