import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Sparkles,
  Star,
  ThumbsDown,
  UserSearch,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import {
  availabilityLabel,
  CandidateSkillGap,
  MatchStatusIcon,
  statusTone,
  type MatchRow,
} from "@/components/candidate-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import {
  displayName,
  firstNameOnlyAnalysis,
  formatDateTime,
  MATCH_STATUS_LABELS,
  REJECTION_REASONS,
  type RejectionReason,
  toStringList,
} from "@/lib/matches";

interface CandidateCompareTableProps {
  matches: MatchRow[];
  photos: Record<string, string | null>;
  actingId: string | null;
  curated?: boolean;
  requiredSkills: string[];
  candidateSkills: Record<string, string[]>;
  onShortlist: (match: MatchRow) => void;
  onRequestInterview: (match: MatchRow) => void;
  onRequestHire: (match: MatchRow) => void;
  onRejected: () => void;
  onInterviewTimeAccepted: () => void;
  onViewProfile: (match: MatchRow) => void;
}

export function CandidateCompareTable({
  matches,
  photos,
  actingId,
  curated,
  requiredSkills,
  candidateSkills,
  onShortlist,
  onRequestInterview,
  onRequestHire,
  onRejected,
  onInterviewTimeAccepted,
  onViewProfile,
}: CandidateCompareTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-max min-w-full border-collapse text-sm">
        <tbody>
          <CompareRow label="Candidate">
            {matches.map((match) => {
              const name = displayName(match.candidate_pool_profile?.full_name, match.status);
              const photo = photos[match.id];
              return (
                <CompareCell key={match.id} className="align-top">
                  <div className="flex items-center gap-3">
                    {photo ? (
                      <img src={photo} alt="" className="h-14 w-14 flex-none rounded-full object-cover ring-2 ring-primary/15" />
                    ) : (
                      <div className="grid h-14 w-14 flex-none place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      {match.status !== "hired" && <p className="text-xs italic text-muted-foreground">Meet</p>}
                      <p className="truncate font-semibold text-foreground">{name}</p>
                      {curated && (
                        <Badge variant="secondary" className="mt-1 bg-primary-soft text-primary">
                          <Sparkles className="mr-1 h-3 w-3" /> Hand-picked
                        </Badge>
                      )}
                    </div>
                  </div>
                </CompareCell>
              );
            })}
          </CompareRow>

          <CompareRow label="Headline">
            {matches.map((match) => <CompareCell key={match.id}>{match.candidate_pool_profile?.headline ?? "—"}</CompareCell>)}
          </CompareRow>

          <CompareRow label="Availability">
            {matches.map((match) => (
              <CompareCell key={match.id}>{availabilityLabel(match.candidate_pool_profile?.availability) ?? "—"}</CompareCell>
            ))}
          </CompareRow>

          <CompareRow label="Timezone & schedule">
            {matches.map((match) => {
              const profile = match.candidate_pool_profile;
              const schedule = [
                profile?.timezone,
                profile?.weekly_hours_available ? `${profile.weekly_hours_available} hrs/week` : null,
                profile?.preferred_shift,
              ].filter(Boolean).join(" · ");
              return <CompareCell key={match.id}>{schedule || "—"}</CompareCell>;
            })}
          </CompareRow>

          <CompareRow label="Status">
            {matches.map((match) => (
              <CompareCell key={match.id}>
                <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(match.status)}`}>
                  <MatchStatusIcon status={match.status} />
                  <span className="truncate">{MATCH_STATUS_LABELS[match.status]}</span>
                </span>
              </CompareCell>
            ))}
          </CompareRow>

          <CompareRow label="AI summary">
            {matches.map((match) => (
              <CompareCell key={match.id} className="align-top leading-relaxed">
                {firstNameOnlyAnalysis(match.candidate_pool_profile?.approved_summary, match.candidate_pool_profile?.full_name) || "—"}
              </CompareCell>
            ))}
          </CompareRow>

          {requiredSkills.length > 0 && (
            <CompareRow label="Skill match">
              {matches.map((match) => (
                <CompareCell key={match.id} className="align-top">
                  <CandidateSkillGap
                    requiredSkills={requiredSkills}
                    candidateSkills={candidateSkills[match.candidate_id] ?? []}
                  />
                </CompareCell>
              ))}
            </CompareRow>
          )}

          <CompareRow label="Work history">
            {matches.map((match) => {
              const profile = match.candidate_pool_profile;
              const primary = toStringList(profile?.primary_role)[0];
              const secondary = toStringList(profile?.secondary_roles);
              const details = [
                primary ? `Primary: ${primary}` : null,
                secondary.length ? `Also: ${secondary.join(", ")}` : null,
                profile?.years_experience != null
                  ? `${profile.years_experience} ${profile.years_experience === 1 ? "year" : "years"} experience`
                  : null,
              ].filter(Boolean).join(" · ");
              return <CompareCell key={match.id} className="align-top">{details || "—"}</CompareCell>;
            })}
          </CompareRow>

          <CompareRow label="Why this candidate">
            {matches.map((match) => <CompareCell key={match.id} className="align-top leading-relaxed">{match.match_reason ?? "—"}</CompareCell>)}
          </CompareRow>

          <CompareRow label="Actions" last>
            {matches.map((match) => (
              <CompareCell key={match.id} className="align-top">
                <CandidateActions
                  match={match}
                  busy={actingId === match.id}
                  locked={actingId !== null && actingId !== match.id}
                  onShortlist={() => onShortlist(match)}
                  onRequestInterview={() => onRequestInterview(match)}
                  onRequestHire={() => onRequestHire(match)}
                  onRejected={onRejected}
                  onInterviewTimeAccepted={onInterviewTimeAccepted}
                  onViewProfile={() => onViewProfile(match)}
                />
              </CompareCell>
            ))}
          </CompareRow>
        </tbody>
      </table>
    </div>
  );
}

function CompareRow({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <tr className={last ? "" : "border-b border-border"}>
      <th scope="row" className="w-40 min-w-40 bg-muted/40 px-4 py-4 text-left align-top text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </th>
      {children}
    </tr>
  );
}

function CompareCell({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <td className={`w-64 min-w-64 border-l border-border px-4 py-4 text-foreground ${className}`}>{children}</td>;
}

export function CandidateActions({
  match,
  busy,
  locked,
  onShortlist,
  onRequestInterview,
  onRequestHire,
  onRejected,
  onInterviewTimeAccepted,
  onViewProfile,
}: {
  match: MatchRow;
  busy: boolean;
  locked: boolean;
  onShortlist: () => void;
  onRequestInterview: () => void;
  onRequestHire: () => void;
  onRejected: () => void;
  onInterviewTimeAccepted: () => void;
  onViewProfile?: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState<RejectionReason | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [acceptingTime, setAcceptingTime] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposedAt, setProposedAt] = useState("");
  const [proposeBusy, setProposeBusy] = useState(false);
  const canAct = match.status === "recommended" || match.status === "shortlisted";
  const canReject = canAct || match.status === "interview_completed";

  async function submitRejection() {
    if (!rejectReason) return;
    setRejectBusy(true);
    const { error } = await supabase.rpc("reject_candidate_match", {
      p_match_id: match.id,
      p_reason: rejectReason,
      p_note: rejectNote.trim() || null,
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
    onRejected();
  }

  async function acceptInterviewTime() {
    setAcceptingTime(true);
    const { error } = await supabase.rpc("client_confirm_interview_time", { p_match_id: match.id });
    setAcceptingTime(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Interview confirmed");
    onInterviewTimeAccepted();
  }

  async function submitPropose() {
    if (!proposedAt || proposeBusy) return;
    const when = new Date(proposedAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      toast.error("Pick a date and time in the future.");
      return;
    }
    setProposeBusy(true);
    const { error } = await supabase.rpc("client_propose_interview_time", {
      p_match_id: match.id,
      p_proposed_at: when.toISOString(),
    });
    setProposeBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("New time proposed — ScaleSource will confirm.");
    setProposing(false);
    setProposedAt("");
    onInterviewTimeAccepted();
  }

  if (rejecting) {
    return (
      <div className="space-y-3">
        <p className="font-medium">Not a fit — tell us why.</p>
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Select value={rejectReason ?? undefined} onValueChange={(value) => setRejectReason(value as RejectionReason)}>
            <SelectTrigger className="w-full bg-background"><SelectValue placeholder="Select a reason" /></SelectTrigger>
            <SelectContent>
              {REJECTION_REASONS.map((reason) => <SelectItem key={reason.value} value={reason.value}>{reason.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`compare-reject-note-${match.id}`}>Additional notes (optional)</Label>
          <Textarea
            id={`compare-reject-note-${match.id}`}
            value={rejectNote}
            onChange={(event) => setRejectNote(event.target.value)}
            rows={3}
            placeholder="Anything else we should know?"
            className="bg-background"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={rejectBusy} onClick={() => { setRejecting(false); setRejectReason(null); setRejectNote(""); }}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" disabled={!rejectReason || rejectBusy} onClick={submitRejection}>
            {rejectBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Submit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {onViewProfile && (
        <Button variant="secondary" size="sm" onClick={onViewProfile}>
          <UserSearch className="mr-1.5 h-4 w-4" /> View full profile
        </Button>
      )}
      {canAct && (
        <>
          <Button variant={match.status === "shortlisted" ? "default" : "outline"} size="sm" disabled={busy || locked} onClick={onShortlist}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Star className={`mr-1.5 h-4 w-4 ${match.status === "shortlisted" ? "fill-current" : ""}`} />}
            {match.status === "shortlisted" ? "Shortlisted" : "Shortlist"}
          </Button>
          <Button size="sm" disabled={busy || locked} onClick={onRequestInterview}>
            <Video className="mr-1.5 h-4 w-4" /> Request interview
          </Button>
        </>
      )}
      {match.status === "interview_requested" && match.interview_proposed_by === "staff" && (
        <div className="space-y-2 rounded-md bg-primary/5 p-2 text-primary">
          <p className="text-xs"><CalendarClock className="mr-1 inline h-3.5 w-3.5" />New time: {formatDateTime(match.interview_proposed_at)}</p>
          <Button size="sm" disabled={acceptingTime || proposeBusy} onClick={acceptInterviewTime}>
            {acceptingTime && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Accept this time
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || locked || proposeBusy}
            onClick={() => setProposing((v) => !v)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <ThumbsDown className="mr-1.5 h-4 w-4" /> Reject
          </Button>

          {proposing && (
            <div className="w-full space-y-2 rounded-md border border-border bg-background/60 p-3 text-foreground">
              <p className="text-sm font-medium">
                You've declined that time — suggest one that works:
              </p>
              <Label htmlFor={`compare-propose-when-${match.id}`}>Your preferred time</Label>
              <Input
                id={`compare-propose-when-${match.id}`}
                type="datetime-local"
                value={proposedAt}
                onChange={(e) => setProposedAt(e.target.value)}
                className="bg-background"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={proposeBusy}
                  onClick={() => {
                    setProposing(false);
                    setProposedAt("");
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" disabled={!proposedAt || proposeBusy} onClick={() => void submitPropose()}>
                  {proposeBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Send proposal
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {canReject && (
        <Button variant="ghost" size="sm" disabled={busy || locked} onClick={() => setRejecting(true)} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          <ThumbsDown className="mr-1.5 h-4 w-4" /> Not a fit
        </Button>
      )}
      {match.status === "interview_completed" && (
        <Button size="sm" disabled={busy || locked} onClick={onRequestHire}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
          Request to hire
        </Button>
      )}
    </div>
  );
}