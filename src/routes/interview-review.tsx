import { Fragment, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, StickyNote } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MatchStatusBadge } from "@/components/match-status";
import {
  completeInterview,
  confirmInterview,
  fetchMatchesByStatus,
  proposeInterviewTime,
  staffExtendOffer,
  updateMatchStatus,
} from "@/lib/crm-queries";
import type { MatchStatus } from "@/lib/database.types";
import {
  addThreadNote,
  fetchThreadNoteAuthors,
  fetchThreadNotes,
  findThreadId,
  getOrCreateThread,
  type ThreadTarget,
} from "@/lib/messages-queries";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
      {isLoading && <p className="text-sm text-muted-foreground">Loading interviews…</p>}
      <div className="overflow-x-auto card-amber rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((m) => {
              const next = NEXT_STAGE[m.status];
              return (
                <Fragment key={m.id}>
                <TableRow>
                  <TableCell>
                    <Link
                      to="/candidates/$candidateId"
                      params={{ candidateId: m.candidate_id }}
                      className="font-medium hover:underline"
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
                              <span className="text-xs text-muted-foreground">
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
                            Propose different time
                          </Button>
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
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={advance.isPending}
                        onClick={() => advance.mutate({ id: m.id, status: "rejected" })}
                      >
                        Reject
                      </Button>
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
                    <TableCell colSpan={5} className="bg-muted/40">
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
      {!isLoading && !matches.length && (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarCheck className="h-4 w-4" /> No candidates are in an interview stage right now.
        </p>
      )}

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
            <DialogTitle>Propose different time</DialogTitle>
            <DialogDescription>
              Propose a new interview time for {proposeFor?.name}. The client will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="proposed-time">
              Proposed time <span className="text-amber">*</span>
            </Label>
            <Input
              id="proposed-time"
              type="datetime-local"
              value={proposedTime}
              onChange={(e) => setProposedTime(e.target.value)}
            />
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
    <div className="py-1">
      <div className="mb-2">
        <h3 className="text-sm font-semibold">Interview Prep Notes</h3>
        <p className="text-xs text-muted-foreground">
          Shared prep notes for this candidate's interview.
        </p>
      </div>
      {threadId && notes.length > 0 && (
        <div className="mb-3 space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border bg-card p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">{authorLabel(n.author_id)}</span>
                <span className="text-[11px] text-muted-foreground">
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
          className="min-h-[60px] flex-1 resize-none bg-card"
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
