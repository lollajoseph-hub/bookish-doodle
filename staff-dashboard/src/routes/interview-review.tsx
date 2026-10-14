import { Fragment, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, StickyNote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DateTimePicker } from "@/components/date-time-fields";
import { MatchStatusBadge } from "@/components/match-status";
import { RejectReasonDialog } from "@/components/reject-reason-dialog";
import {
  completeInterview,
  confirmInterview,
  fetchMatchesByStatus,
  proposeInterviewTime,
  staffExtendOffer,
  updateMatchStatus,
} from "@/lib/crm-queries";
import type { MatchStatus, RejectionReason } from "@/lib/database.types";
import {
  addThreadNote,
  fetchThreadNoteAuthors,
  fetchThreadNotes,
  findThreadId,
  getOrCreateThread,
  type ThreadTarget,
} from "@/lib/messages-queries";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STAGES: MatchStatus[] = [
  "interview_requested",
  "interview_confirmed",
  "interview_completed",
  "hire_requested",
];

const STAGE_LABELS: Record<string, string> = {
  interview_requested: "Requested",
  interview_confirmed: "Confirmed",
  interview_completed: "Completed",
  hire_requested: "Hire requested",
};

const NEXT_STAGE: Partial<Record<MatchStatus, MatchStatus>> = {
  interview_confirmed: "interview_completed",
};

export const Route = createFileRoute("/interview-review")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Interview review | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Candidates currently moving through client interview stages." },
      { property: "og:title", content: "Interview review | ScaleSource" },
      { property: "og:description", content: "Advance candidates through interview stages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InterviewReviewPage,
});

function InterviewReviewPage() {
  const queryClient = useQueryClient();
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["matches", "interview"],
    queryFn: () => fetchMatchesByStatus(STAGES),
  });

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MatchStatus }) => updateMatchStatus(id, status),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["all-matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => confirmInterview(id),
    onSuccess: () => {
      toast.success("Interview confirmed");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["all-matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const proposeTime = useMutation({
    mutationFn: ({ id, proposedAt, notes }: { id: string; proposedAt: string; notes?: string }) =>
      proposeInterviewTime(id, proposedAt, notes),
    onSuccess: () => {
      toast.success("New time proposed to client");
      setProposeFor(null);
      setProposedTime("");
      setProposeNotes("");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["all-matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const extendOffer = useMutation({
    mutationFn: (id: string) => staffExtendOffer(id),
    onSuccess: () => {
      toast.success("Contract sent — offer extended");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["all-matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [completeFor, setCompleteFor] = useState<{ id: string; name: string } | null>(null);
  const [interviewNotes, setInterviewNotes] = useState("");
  const [proposeFor, setProposeFor] = useState<{ id: string; name: string } | null>(null);
  const [proposedTime, setProposedTime] = useState("");
  const [proposeNotes, setProposeNotes] = useState("");
  const [notesOpenFor, setNotesOpenFor] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);

  const reject = useMutation({
    mutationFn: ({ id, reason, note }: { id: string; reason: RejectionReason; note: string }) =>
      updateMatchStatus(id, "rejected", {
        rejection_reason: reason,
        rejection_reason_note: note || null,
      }),
    onSuccess: () => {
      toast.success("Candidate rejected");
      setRejectFor(null);
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["all-matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => completeInterview(id, notes),
    onSuccess: () => {
      toast.success("Interview marked complete — notes sent to the client");
      setCompleteFor(null);
      setInterviewNotes("");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["all-matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <AppShell title="Interview review" description="Candidates in the interview stages">
      {isLoading && (
        <div className="mb-4 space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-14 rounded-3xl bg-white/70" />
          <Skeleton className="h-14 rounded-3xl bg-white/70" />
          <Skeleton className="h-14 rounded-3xl bg-white/70" />
        </div>
      )}
      <Tabs defaultValue="interview_requested">
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          {STAGES.map((stage) => (
            <TabsTrigger key={stage} value={stage}>{STAGE_LABELS[stage]}</TabsTrigger>
          ))}
        </TabsList>
        {STAGES.map((stage) => (
          <TabsContent key={stage} value={stage}>
      <div className="card-amber overflow-x-auto rounded-3xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Candidate</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Client</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Role</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Stage</TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.filter((m) => m.status === stage).map((m) => {
              const next = NEXT_STAGE[m.status];
              return (
                <Fragment key={m.id}>
                <TableRow>
                  <TableCell>
                    <Link
                      to="/candidates/$candidateId"
                      params={{ candidateId: m.candidate_id }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {m.candidateName ?? "Candidate"}
                    </Link>
                    {m.candidateHeadline && (
                      <div className="text-xs text-muted-foreground">{m.candidateHeadline}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{m.clientName ?? "—"}</TableCell>
                  <TableCell className="text-sm">{m.roleName ?? m.requestTitle ?? "—"}</TableCell>
                  <TableCell>
                    <MatchStatusBadge status={m.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {m.status === "interview_requested" && (
                        <>
                          {m.interview_proposed_at ? (
                            <>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                Client proposed{" "}
                                {new Date(m.interview_proposed_at).toLocaleString()}
                              </span>
                              <Button
                                size="sm"
                                disabled={confirm.isPending}
                                onClick={() => confirm.mutate(m.id)}
                              >
                                Confirm this time
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Waiting on client to propose a time
                            </span>
                          )}
                        </>
                      )}
                      {m.status === "hire_requested" && (
                        <Button
                          size="sm"
                          disabled={extendOffer.isPending}
                          onClick={() => extendOffer.mutate(m.id)}
                        >
                          Send contract
                        </Button>
                      )}
                      {next && (
                        <Button
                          size="sm"
                          disabled={advance.isPending}
                          onClick={() => {
                            if (next === "interview_completed") {
                              setInterviewNotes("");
                              setCompleteFor({ id: m.id, name: m.candidateName ?? "Candidate" });
                              return;
                            }
                            advance.mutate({ id: m.id, status: next });
                          }}
                        >
                          Move to next stage
                        </Button>
                      )}
                      {m.status === "interview_requested" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={proposeTime.isPending}
                          onClick={() => {
                            setProposedTime("");
                            setProposeNotes("");
                            setProposeFor({ id: m.id, name: m.candidateName ?? "Candidate" });
                          }}
                        >
                          Decline time
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reject.isPending}
                          onClick={() => setRejectFor(m.id)}
                        >
                          Reject
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setNotesOpenFor(notesOpenFor === m.id ? null : m.id)}
                      >
                        <StickyNote className="mr-1 h-3.5 w-3.5" />
                        Prep notes
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {notesOpenFor === m.id && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-stone/90 shadow-[inset_0_1px_0_0_rgb(26_19_32/0.06)]">
                      <InterviewPrepNotes matchId={m.id} />
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {!isLoading && !matches.some((m) => m.status === stage) && (
        <div className="card-amber mt-4 flex flex-col items-center gap-4 rounded-3xl border-dashed px-6 py-14 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
            <CalendarCheck className="h-7 w-7" />
          </div>
          <p className="font-display text-3xl font-medium">No candidates in this stage right now.</p>
        </div>
      )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog
        open={!!completeFor}
        onOpenChange={(open) => {
          if (!open) {
            setCompleteFor(null);
            setInterviewNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete interview</DialogTitle>
            <DialogDescription>
              Add interview notes for {completeFor?.name}. The client needs these to decide.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="interview-notes">
              Interview notes <span className="text-amber">*</span>
            </Label>
            <Textarea
              id="interview-notes"
              rows={6}
              value={interviewNotes}
              onChange={(e) => setInterviewNotes(e.target.value)}
              placeholder="How did the interview go? Strengths, concerns, recommendation…"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCompleteFor(null);
                setInterviewNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!interviewNotes.trim() || complete.isPending}
              onClick={() => {
                if (!completeFor || !interviewNotes.trim()) return;
                complete.mutate({ id: completeFor.id, notes: interviewNotes.trim() });
              }}
            >
              Mark interview complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RejectReasonDialog
        open={!!rejectFor}
        onOpenChange={(open) => !open && setRejectFor(null)}
        pending={reject.isPending}
        onConfirm={(reason, note) => {
          if (rejectFor) reject.mutate({ id: rejectFor, reason, note });
        }}
      />

        <Dialog
        open={!!proposeFor}
        onOpenChange={(open) => {
          if (!open) {
            setProposeFor(null);
            setProposedTime("");
            setProposeNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline proposed time</DialogTitle>
            <DialogDescription>
              {`You've declined that time — propose one that works for ${proposeFor?.name}. The client will be notified.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="proposed-time">
              Proposed time <span className="text-amber">*</span>
            </Label>
            <DateTimePicker id="proposed-time" value={proposedTime} onChange={setProposedTime} />
            <Label htmlFor="propose-notes">Notes (optional)</Label>
            <Textarea
              id="propose-notes"
              rows={4}
              value={proposeNotes}
              onChange={(e) => setProposeNotes(e.target.value)}
              placeholder="Anything the client should know about this time…"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setProposeFor(null);
                setProposedTime("");
                setProposeNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !proposedTime ||
                new Date(proposedTime).getTime() <= Date.now() ||
                proposeTime.isPending
              }
              onClick={() => {
                if (!proposeFor || !proposedTime) return;
                proposeTime.mutate({
                  id: proposeFor.id,
                  proposedAt: new Date(proposedTime).toISOString(),
                  notes: proposeNotes.trim() || undefined,
                });
              }}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function InterviewPrepNotes({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const target: ThreadTarget = { kind: "candidate", candidateMatchId: matchId };

  // Read-only lookup — opening the panel must never create a thread.
  const { data: foundThreadId, error: threadError } = useQuery({
    queryKey: ["thread", "candidate", matchId],
    queryFn: () => findThreadId(target),
    staleTime: Infinity,
  });
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);
  const threadId = createdThreadId ?? foundThreadId ?? null;

  const { data: me } = useQuery({
    queryKey: ["auth-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (threadError) toast.error((threadError as Error).message);
  }, [threadError]);

  const { data: notes = [], error: notesError } = useQuery({
    queryKey: ["thread-notes", threadId],
    queryFn: () => fetchThreadNotes(threadId!),
    enabled: !!threadId,
  });
  const { data: authors = [] } = useQuery({
    queryKey: ["thread-note-authors", threadId],
    queryFn: () => fetchThreadNoteAuthors(threadId!),
    enabled: !!threadId,
  });

  useEffect(() => {
    if (notesError) toast.error((notesError as Error).message);
  }, [notesError]);

  const authorById = new Map(authors.map((a) => [a.id, a]));
  const authorLabel = (authorId: string) => {
    if (me && authorId === me) return "You";
    const a = authorById.get(authorId);
    if (!a) return "Unknown";
    const first = a.full_name.split(" ")[0];
    const role = a.role.charAt(0).toUpperCase() + a.role.slice(1);
    return `${first} (${role})`;
  };

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      // Create the thread only now — at the moment a note is actually saved.
      let id = threadId;
      if (!id) {
        const thread = await getOrCreateThread(target);
        id = thread.id;
        setCreatedThreadId(id);
      }
      return addThreadNote(id, body);
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["thread-notes", threadId] });
      queryClient.invalidateQueries({ queryKey: ["thread-note-authors", threadId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="py-2">
      <div className="mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Interview Prep Notes</h3>
        <p className="text-xs text-muted-foreground">
          Shared prep notes for this candidate's interview.
        </p>
      </div>
      {threadId && notes.length > 0 && (
        <div className="mb-3 space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-2xl bg-white/90 p-3 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">{authorLabel(n.author_id)}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {new Date(n.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-xs">{n.body}</p>
            </div>
          ))}
        </div>
      )}
      {threadId && notes.length === 0 && (
        <p className="mb-3 text-xs text-muted-foreground">No notes yet.</p>
      )}
      <div className="flex items-start gap-2">
        <Textarea
          value={draft}
          placeholder="Talking points, questions to ask, things to highlight…"
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[60px] flex-1 resize-none rounded-2xl bg-white"
        />
        <Button
          size="sm"
          disabled={!draft.trim() || addNote.isPending}
          onClick={() => addNote.mutate(draft.trim())}
        >
          Add note
        </Button>
      </div>
    </div>
  );
}
