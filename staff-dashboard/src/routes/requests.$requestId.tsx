import { LANGUAGE_CATEGORY } from "@/lib/queries";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CuratedBadge, MatchStatusBadge, PriorityBadge, RequestStatusBadge } from "@/components/match-status";
import {
  MATCH_STATUSES,
  addMatch,
  confirmInterview,
  fetchClientRequestDetail,
  labelize,
  staffExtendOffer,
  updateMatchStatus,
  updateRequestStatus,
} from "@/lib/crm-queries";
import { fetchCandidates } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import type { MatchStatus, RejectionReason, RequestPriority } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { TimePicker } from "@/components/date-time-fields";
import { RejectReasonDialog } from "@/components/reject-reason-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/requests/$requestId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Request pipeline | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Candidate pipeline for a client hiring request, from recommended to hired." },
      { property: "og:title", content: "Request pipeline | ScaleSource" },
      { property: "og:description", content: "Track candidate matches through the review pipeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestDetailPage,
});

function RequestDetailPage() {
  const { requestId } = useParams({ from: "/requests/$requestId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [candidateId, setCandidateId] = useState("");
  const [reason, setReason] = useState("");
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<{ id: string; proposedAt: string | null } | null>(null);
  const [proposeDate, setProposeDate] = useState<Date | undefined>(undefined);
  const [proposeTime, setProposeTime] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["client-request", requestId],
    queryFn: () => fetchClientRequestDetail(requestId),
  });
  const { data: candidates = [] } = useQuery({ queryKey: ["candidates"], queryFn: fetchCandidates });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["client-request", requestId] });
    queryClient.invalidateQueries({ queryKey: ["client-requests"] });
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
    queryClient.invalidateQueries({ queryKey: ["candidate-matches"] });
    queryClient.invalidateQueries({ queryKey: ["matches"] });
    queryClient.invalidateQueries({ queryKey: ["all-matches"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!candidateId) throw new Error("Pick a candidate");
      await addMatch({ client_request_id: requestId, candidate_id: candidateId, match_reason: reason });
    },
    onSuccess: () => {
      toast.success("Candidate added to batch");
      setAddOpen(false);
      setCandidateId("");
      setReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MatchStatus }) => updateMatchStatus(id, status),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const extendOffer = useMutation({
    mutationFn: (id: string) => staffExtendOffer(id),
    onSuccess: () => {
      toast.success("Contract sent — offer extended");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => confirmInterview(id),
    onSuccess: () => {
      toast.success("Interview confirmed");
      setConfirmFor(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const propose = useMutation({
    mutationFn: async () => {
      if (!confirmFor || !proposeDate || !proposeTime) {
        throw new Error("Pick a date and time to propose");
      }
      const [hours, minutes] = proposeTime.split(":").map(Number);
      const proposedAt = new Date(proposeDate);
      proposedAt.setHours(hours, minutes, 0, 0);
      const { error } = await supabase.rpc("admin_propose_interview_time", {
        p_match_id: confirmFor.id,
        p_proposed_at: proposedAt.toISOString(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("New time proposed — waiting for the client to confirm");
      setConfirmFor(null);
      setProposeDate(undefined);
      setProposeTime("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async ({ reason, note }: { reason: RejectionReason; note: string }) => {
      if (!rejectFor) return;
      await updateMatchStatus(rejectFor, "rejected", {
        rejection_reason: reason,
        rejection_reason_note: note,
      });
    },
    onSuccess: () => {
      toast.success("Candidate rejected");
      setRejectFor(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestStatus = useMutation({
    mutationFn: (status: string) => updateRequestStatus(requestId, status),
    onSuccess: () => {
      toast.success("Request updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPriority = useMutation({
    mutationFn: async (priority: RequestPriority) => {
      const { error } = await supabase
        .from("client_requests")
        .update({ priority })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Priority updated");
      queryClient.invalidateQueries({ queryKey: ["client-request", requestId] });
      queryClient.invalidateQueries({ queryKey: ["client-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AppShell title="Request">
        <div className="grid gap-6 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[420px] rounded-3xl bg-white/70 lg:col-span-2" />
          <Skeleton className="h-[320px] rounded-3xl bg-white/70" />
        </div>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell title="Request">
        <div className="card-amber rounded-3xl border-dashed p-10 text-center">
          <p className="font-display text-3xl font-medium">Request not found</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/requests" })}>
            Back to requests
          </Button>
        </div>
      </AppShell>
    );
  }

  const r = data.request;
  const hired = data.matches.filter((m) => m.status === "hired").length;
  const pct = r.candidates_wanted
    ? Math.min(100, Math.round((data.matches.length / r.candidates_wanted) * 100))
    : 0;
  const requiredSkillNames = data.requiredSkills.map((s) => s.name);
  const skillMatchFor = (candidateSkills: string[]) => {
    const lower = new Set(candidateSkills.map((s) => s.toLowerCase()));
    const has = requiredSkillNames.filter((s) => lower.has(s.toLowerCase()));
    const missing = requiredSkillNames.filter((s) => !lower.has(s.toLowerCase()));
    return { has, missing };
  };

  return (
    <AppShell
      title={r.title || data.roleName || "Client request"}
      description={`${data.clientName ?? "Client"} · ${labelize(r.engagement_type)}`}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/messages", search: { request: requestId } })}>
            <MessageSquare className="mr-1 h-4 w-4" /> Message
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add candidate
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Link to="/requests" className="inline-flex items-center text-sm text-primary hover:underline">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to requests
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card-amber rounded-3xl p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-2xl font-semibold leading-tight">
                Pipeline
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {data.matches.length}/{r.candidates_wanted} in batch · {hired}/{r.hires_needed} hired
              </span>
            </div>
            <Progress value={pct} className="mt-3" />

            <div className="mt-4 space-y-3">
              {data.matches.length ? (
                data.matches.map((m) => (
                  <div
                    key={m.id}
                    className="cursor-pointer rounded-2xl border border-transparent bg-stone/90 p-4 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] transition-[box-shadow,border-color] duration-300 hover:border-[rgb(122_89_163/0.25)] hover:shadow-[0_22px_44px_-24px_rgb(46_16_73/0.5)]"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [role='button'], [role='dialog'], [data-no-card-click]")) return;
                      navigate({ to: "/candidates/$candidateId", params: { candidateId: m.candidate_id } });
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to="/candidates/$candidateId"
                          params={{ candidateId: m.candidate_id }}
                          className="font-display text-xl font-semibold leading-tight text-primary hover:underline"
                        >
                          {m.candidateName || "Candidate"}
                        </Link>
                        {m.candidateHeadline && (
                          <p className="text-xs text-muted-foreground">{m.candidateHeadline}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {m.viewCount > 0 && m.lastViewedAt
                            ? `Viewed ${m.viewCount}x · last ${new Date(m.lastViewedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                            : "Not yet viewed by client"}
                        </p>
                        {m.match_reason && <p className="mt-1 text-sm">{m.match_reason}</p>}
                        {m.status === "rejected" && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Rejected: {labelize(m.rejection_reason)}
                            {m.rejection_reason_note ? ` — ${m.rejection_reason_note}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {m.match_score != null && <ScoreBadge matchId={m.id} score={m.match_score} />}
                        <MatchStatusBadge status={m.status} />
                      </div>
                    </div>
                    {requiredSkillNames.length > 0 &&
                      (() => {
                        const { has, missing } = skillMatchFor(m.candidateSkills ?? []);
                        return (
                          <div className="mt-2 space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              Skill match
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {has.length > 0 && (
                                <Badge variant="outline" className="h-[25px] whitespace-nowrap rounded-full border-transparent px-2.5 py-0 text-[11.5px] font-semibold h-auto min-h-[25px] whitespace-normal bg-[#e9f2ea] text-[#2f5f35]">
                                  Has: {has.join(", ")}
                                </Badge>
                              )}
                              {missing.length > 0 && (
                                <Badge variant="outline" className="h-[25px] whitespace-nowrap rounded-full border-transparent px-2.5 py-0 text-[11.5px] font-semibold h-auto min-h-[25px] whitespace-normal bg-foreground/[0.06] text-secondary-foreground">
                                  Missing: {missing.join(", ")}
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    {m.client_rating != null && (
                      <div className="mt-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Client rating
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm tracking-wide text-[#e0a43a]">
                            {"★".repeat(Math.min(5, Math.max(1, m.client_rating)))}
                            <span className="text-muted-foreground/40">
                              {"★".repeat(5 - Math.min(5, Math.max(1, m.client_rating)))}
                            </span>
                          </span>
                          {m.client_rated_at && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {new Date(m.client_rated_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                        </div>
                        {m.client_rating_note && (
                          <p className="mt-1 text-xs text-muted-foreground">“{m.client_rating_note}”</p>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Select
                        value={m.status}
                        onValueChange={(v: string) => {
                          if (v === "rejected") {
                            setRejectFor(m.id);
                            return;
                          }
                          if (m.status === "interview_requested" && v === "interview_confirmed") {
                            setConfirmFor({ id: m.id, proposedAt: m.interview_proposed_at });
                            return;
                          }
                          if (v === "interview_confirmed") {
                            toast.error(
                              "An interview can only be confirmed after one has been requested with a proposed time.",
                            );
                            return;
                          }
                          if (v === "offer_extended") {
                            if (m.status === "hire_requested") {
                              extendOffer.mutate(m.id);
                            } else {
                              toast.error("A contract can only be sent after the client requests to hire.");
                            }
                            return;
                          }
                          if (v === "hired") {
                            toast.error("Mark a candidate hired by creating their placement in Offer review.", {
                              action: {
                                label: "Offer review",
                                onClick: () => navigate({ to: "/offer-review" }),
                              },
                            });
                            return;
                          }
                          setStatus.mutate({ id: m.id, status: v as MatchStatus });
                        }}
                      >
                        <SelectTrigger className="h-9 w-56 rounded-full bg-white/90">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MATCH_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {labelize(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {m.interview_at && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Interview {new Date(m.interview_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {(m.meeting_notes_text || m.recording_url) && (
                      <div className="mt-3 space-y-1.5 rounded-2xl bg-primary/[0.06] px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Meeting notes &amp; recording</p>
                        {m.meeting_notes_text && (
                          <p className="whitespace-pre-line text-sm text-muted-foreground">{m.meeting_notes_text}</p>
                        )}
                        <div className="flex flex-wrap gap-3 pt-1">
                          {m.meeting_notes_doc_url && (
                            <a href={m.meeting_notes_doc_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline underline-offset-2">
                              View full notes doc
                            </a>
                          )}
                          {m.recording_url && (
                            <a href={m.recording_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline underline-offset-2">
                              Watch recording
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-foreground/15 px-6 py-10 text-center">
                  <p className="font-display text-3xl font-medium">No candidates in this batch yet.</p>
                </div>
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section className="card-amber rounded-3xl p-6 text-sm">
              <h2 className="font-display text-2xl font-semibold leading-tight">
                Request
              </h2>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <div className="flex items-center gap-1.5">
                    <CuratedBadge source={r.source} />
                    <RequestStatusBadge status={r.status} />
                  </div>
                </div>
                <Select value={r.status} onValueChange={(v: string) => requestStatus.mutate(v)}>
                  <SelectTrigger className="h-9 rounded-full bg-white/90">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["open", "needs_attention", "fulfilled", "closed"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {labelize(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  <PriorityBadge priority={r.priority} />
                </div>
                <Select
                  value={r.priority ?? "normal"}
                  onValueChange={(v: string) => setPriority.mutate(v as RequestPriority)}
                >
                  <SelectTrigger className="h-9 rounded-full bg-white/90">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High Priority</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground">Role: {data.roleName ?? "—"}</p>
                <p className="text-muted-foreground">Hours: {r.hours_needed || "—"}</p>
                <p className="text-muted-foreground">
                  Days: {r.days_of_week_needed?.join(", ") || "—"}
                </p>
                <p className="text-muted-foreground">Timezone: {r.timezone_requirement || "—"}</p>
                <p className="text-muted-foreground">
                  Min experience: {r.years_experience_min != null ? `${r.years_experience_min} yrs` : "—"}
                </p>
                <p className="text-muted-foreground">Start: {r.desired_start_date || "—"}</p>
                {r.notes && <p className="rounded-2xl bg-stone/90 p-4 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] text-foreground">{r.notes}</p>}
              </div>
              <Link
                to="/clients/$clientId"
                params={{ clientId: r.client_id }}
                className="mt-3 inline-block text-xs text-primary hover:underline"
              >
                View {data.clientName}
              </Link>
            </section>

            <section className="card-amber rounded-3xl p-6">
              <h2 className="font-display text-2xl font-semibold leading-tight">
                Skills wanted
              </h2>
              {[
                { label: "Must-have skills", items: data.requiredSkills.filter((s) => s.is_required && s.category !== LANGUAGE_CATEGORY) },
                { label: "Required languages", items: data.requiredSkills.filter((s) => s.is_required && s.category === LANGUAGE_CATEGORY) },
              ].map((g) => (
                <div key={g.label} className="mt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.label}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {g.items.length ? (
                      g.items.map((s) => (
                        <Badge key={s.skill_id} variant="outline" className="h-[25px] whitespace-nowrap rounded-full border-transparent px-2.5 py-0 text-[11.5px] font-semibold bg-primary-soft text-primary">
                          {s.name}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">None listed</p>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add candidate to batch</DialogTitle>
            <DialogDescription>Recommend a candidate for this request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Candidate</Label>
              <Select value={candidateId} onValueChange={setCandidateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select candidate" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="match-reason">Why this candidate</Label>
              <Textarea id="match-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add to batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmFor}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmFor(null);
            setProposeDate(undefined);
            setProposeTime("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm interview</DialogTitle>
            <DialogDescription>
              Accept the client's proposed time, or propose a different one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Accept as proposed
              </p>
              {confirmFor?.proposedAt ? (
                <p className="rounded-2xl bg-primary/[0.06] p-4 text-sm text-primary">
                  Client proposed{" "}
                  <span className="font-medium">
                    {new Date(confirmFor.proposedAt).toLocaleString()}
                  </span>
                  . Confirming locks this in as the scheduled interview time.
                </p>
              ) : (
                <p className="rounded-2xl bg-primary/[0.06] p-4 text-sm text-primary">
                  The client hasn't proposed a time for this interview yet — confirmation will
                  fail until they do.
                </p>
              )}
              <Button
                onClick={() => confirmFor && confirm.mutate(confirmFor.id)}
                disabled={confirm.isPending || !confirmFor?.proposedAt}
              >
                {confirm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm
              </Button>
            </div>

            <div className="space-y-3 border-t border-foreground/[0.08] pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Propose a different time instead
              </p>
              <div className="flex flex-wrap items-start gap-4">
                <Calendar
                  mode="single"
                  selected={proposeDate}
                  onSelect={setProposeDate}
                  className="pointer-events-auto rounded-2xl bg-white/90 p-3 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)]"
                />
                <div className="space-y-2">
                  <Label htmlFor="propose-time">Time</Label>
                  <div className="w-40">
                    <TimePicker id="propose-time" value={proposeTime} onChange={setProposeTime} />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => propose.mutate()}
                    disabled={propose.isPending || !proposeDate || !proposeTime}
                  >
                    {propose.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Propose time
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmFor(null);
                setProposeDate(undefined);
                setProposeTime("");
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RejectReasonDialog
        open={!!rejectFor}
        onOpenChange={(o) => !o && setRejectFor(null)}
        pending={reject.isPending}
        onConfirm={(reason, note) => reject.mutate({ reason, note })}
      />
    </AppShell>
  );
}

/* -------------------------- match score breakdown ------------------------- */

interface MatchScoreBreakdownRow {
  match_id: string;
  match_created_at: string;
  role_name: string | null;
  is_primary_role: boolean | null;
  role_fit_points: number | null;
  matched_required_skills: string[] | null;
  missing_required_skills: string[] | null;
  skills_points: number | null;
  candidate_years_experience: number | null;
  required_years_experience_min: number | null;
  experience_points: number | null;
  ai_rank_score: number | null;
  ai_rank_score_breakdown: Record<string, number> | null;
  computed_total: number | null;
  stored_match_score: number | null;
}

function useMatchScoreBreakdown(matchId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["match-score-breakdown", matchId],
    queryFn: async (): Promise<MatchScoreBreakdownRow | null> => {
      const { data, error } = await supabase
        .rpc("get_match_score_breakdown", { p_match_id: matchId! })
        .maybeSingle();
      if (error) throw error;
      return (data as MatchScoreBreakdownRow | null) ?? null;
    },
    enabled: enabled && !!matchId,
  });
}

function ScoreBadge({ matchId, score }: { matchId: string; score: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useMatchScoreBreakdown(matchId, open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Show match score breakdown" className="rounded-full outline-none">
          <Badge variant="secondary" className="h-[25px] whitespace-nowrap rounded-full border-transparent px-2.5 py-0 text-[11.5px] font-semibold bg-primary-soft text-primary tabular-nums">{score}</Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-3xl">
        {isLoading && <p className="text-xs text-muted-foreground">Loading breakdown…</p>}
        {!isLoading && (error || !data) && (
          <p className="text-xs text-muted-foreground">Couldn&apos;t load breakdown</p>
        )}
        {!isLoading && data && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Score breakdown</p>
            <ul className="space-y-1 text-sm tabular-nums">
              <li>
                Role fit ({data.role_name ?? "—"}, {data.is_primary_role ? "primary" : "secondary"}):{" "}
                <span className="font-medium">{data.role_fit_points ?? 0} pts</span>
              </li>
              <li>
                Required skills matched (
                {data.matched_required_skills?.length ? data.matched_required_skills.join(", ") : "none"}):{" "}
                <span className="font-medium">{data.skills_points ?? 0} pts</span>
                {data.missing_required_skills && data.missing_required_skills.length > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    Missing: {data.missing_required_skills.join(", ")}
                  </span>
                )}
              </li>
              <li>
                Experience ({data.candidate_years_experience ?? "unknown"} yrs vs{" "}
                {data.required_years_experience_min ?? 0} yrs required):{" "}
                <span className="font-medium">{data.experience_points ?? 0} pts</span>
              </li>
              <li>
                AI resume score: <span className="font-medium">{data.ai_rank_score ?? 0}/15 pts</span>
                {data.ai_rank_score_breakdown && (
                  <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                    <li>- Experience: {data.ai_rank_score_breakdown["experience_pts"] ?? 0}/5</li>
                    <li>- Skills breadth: {data.ai_rank_score_breakdown["skills_pts"] ?? 0}/5</li>
                    <li>- Certifications/achievements: {data.ai_rank_score_breakdown["certifications_pts"] ?? 0}/3</li>
                    <li>- Resume completeness: {data.ai_rank_score_breakdown["completeness_pts"] ?? 0}/2</li>
                  </ul>
                )}
              </li>
              <li className="border-t border-foreground/[0.08] pt-1 font-semibold">Total: {data.computed_total ?? 0} pts</li>
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
