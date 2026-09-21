import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MatchStatusBadge } from "@/components/match-status";
import {
  completeInterview,
  confirmInterview,
  fetchMatchesByStatus,
  updateMatchStatus,
} from "@/lib/crm-queries";
import type { MatchStatus } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
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

const STAGES: MatchStatus[] = ["interview_requested", "interview_confirmed", "interview_completed"];

const NEXT_STAGE: Partial<Record<MatchStatus, MatchStatus>> = {
  interview_confirmed: "interview_completed",
  interview_completed: "offer_extended",
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => confirmInterview(id),
    onSuccess: () => {
      toast.success("Interview confirmed");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [completeFor, setCompleteFor] = useState<{ id: string; name: string } | null>(null);
  const [interviewNotes, setInterviewNotes] = useState("");

  const complete = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => completeInterview(id, notes),
    onSuccess: () => {
      toast.success("Interview marked complete — notes sent to the client");
      setCompleteFor(null);
      setInterviewNotes("");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
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
                <TableRow key={m.id}>
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
                        </>
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
                          {next === "offer_extended" ? "Extend offer" : "Move to next stage"}
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
                    </div>
                  </TableCell>
                </TableRow>
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
    </AppShell>
  );
}
