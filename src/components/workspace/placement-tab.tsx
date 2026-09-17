import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPlacement,
  fetchCandidateAiProfile,
  fetchCandidateAssessments,
  fetchCandidateCertificates,
  fetchCandidateGraduations,
  fetchCandidateRoleplay,
  fetchClients,
  fetchCourseProgressDetail,
  fetchInterviewAnalysis,
  fetchPlacements,
  updatePlacement,
  type CandidateDetail,
  type PlacementRow,
  type PlacementStatus,
} from "@/lib/queries";

const STATUS_LABEL: Record<PlacementStatus, string> = {
  active: "Active",
  completed: "Completed",
  terminated: "Terminated",
};

function statusVariant(s: PlacementStatus) {
  if (s === "active") return "default" as const;
  if (s === "completed") return "secondary" as const;
  return "destructive" as const;
}

function renderRecommendation(rec: any): string | null {
  if (rec == null) return null;
  if (typeof rec === "string") return rec.trim() || null;
  if (Array.isArray(rec)) {
    const items = rec
      .map((x) => (typeof x === "string" ? x : x?.text ?? x?.recommendation ?? JSON.stringify(x)))
      .filter(Boolean);
    return items.length ? items.join(" • ") : null;
  }
  if (typeof rec === "object") {
    const v = (rec as any).text ?? (rec as any).recommendation ?? (rec as any).summary;
    if (typeof v === "string" && v.trim()) return v;
    try {
      return JSON.stringify(rec);
    } catch {
      return null;
    }
  }
  return String(rec);
}

export function PlacementTab({ candidate }: { candidate: CandidateDetail }) {
  const candidateId = candidate.id;
  const enrollment = candidate.candidate_courses?.[0];
  const courseId = enrollment?.course_id;

  const placements = useQuery({
    queryKey: ["placements", candidateId],
    queryFn: () => fetchPlacements(candidateId),
  });
  const progress = useQuery({
    queryKey: ["course-progress-detail", candidateId, courseId],
    queryFn: () => fetchCourseProgressDetail(candidateId, courseId!),
    enabled: !!courseId,
  });
  const roleplay = useQuery({
    queryKey: ["roleplay", candidateId],
    queryFn: () => fetchCandidateRoleplay(candidateId),
  });
  const assessments = useQuery({
    queryKey: ["candidate-assessments", candidateId, courseId],
    queryFn: () => fetchCandidateAssessments(candidateId, courseId!),
    enabled: !!courseId,
  });
  const certs = useQuery({
    queryKey: ["certificates", candidateId],
    queryFn: () => fetchCandidateCertificates(candidateId),
  });
  const grads = useQuery({
    queryKey: ["graduations", candidateId],
    queryFn: () => fetchCandidateGraduations(candidateId),
  });
  const ai = useQuery({
    queryKey: ["ai-profile", candidateId],
    queryFn: () => fetchCandidateAiProfile(candidateId),
  });
  const interview = useQuery({
    queryKey: ["interview-analysis", candidateId],
    queryFn: () => fetchInterviewAnalysis(candidateId),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PlacementRow | null>(null);

  const latest = placements.data?.[0];

  const summary = useMemo(() => {
    const roleplayScores = (roleplay.data ?? [])
      .map((r) => r.score)
      .filter((s): s is number => typeof s === "number");
    const highestRoleplay = roleplayScores.length ? Math.max(...roleplayScores) : null;

    const attemptScores: number[] = [];
    (assessments.data ?? []).forEach((a) =>
      a.attempts.forEach((at) => {
        if (typeof at.score === "number") attemptScores.push(at.score);
      }),
    );
    const avgAssessment = attemptScores.length
      ? attemptScores.reduce((a, b) => a + b, 0) / attemptScores.length
      : null;

    const graduation = grads.data?.[0];
    const certificate = certs.data?.[0];
    const readyForPlacement =
      candidate.status === "qualified" || progress.data?.graduated === true;

    const recText =
      renderRecommendation(interview.data?.recommendations) ??
      (ai.data?.rank_score != null ? `Rank score: ${ai.data.rank_score}` : null) ??
      "AI analysis pending";

    return {
      placementStatus: latest ? STATUS_LABEL[latest.status] : "Not placed",
      currentClient: latest?.client?.full_name ?? "—",
      recruiter: candidate.recruiter?.profile?.full_name ?? "Unassigned",
      placementDate: latest?.placement_date
        ? format(new Date(latest.placement_date), "MMM d, yyyy")
        : "—",
      availability: candidate.availability ?? "—",
      readyForPlacement: readyForPlacement ? "Yes" : "No",
      overallCourse: progress.data ? `${Math.round(progress.data.percent ?? 0)}%` : "—",
      roleplay: highestRoleplay != null ? `${highestRoleplay}%` : "—",
      assessmentAvg: avgAssessment != null ? `${Math.round(avgAssessment)}%` : "—",
      graduation: graduation
        ? `Graduated ${format(new Date(graduation.graduated_at), "MMM d, yyyy")}`
        : "Not graduated",
      certificate: certificate
        ? certificate.status.charAt(0).toUpperCase() + certificate.status.slice(1)
        : "None",
      aiRecommendation: recText,
    };
  }, [
    latest,
    candidate,
    progress.data,
    roleplay.data,
    assessments.data,
    certs.data,
    grads.data,
    interview.data,
    ai.data,
  ]);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Placement Summary</h3>
          <span className="text-xs text-muted-foreground">Read-only</span>
        </div>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <SummaryRow label="Placement Status">{summary.placementStatus}</SummaryRow>
          <SummaryRow label="Current Client">{summary.currentClient}</SummaryRow>
          <SummaryRow label="Assigned Recruiter">{summary.recruiter}</SummaryRow>
          <SummaryRow label="Placement Date">{summary.placementDate}</SummaryRow>
          <SummaryRow label="Availability">{summary.availability}</SummaryRow>
          <SummaryRow label="Ready for Placement (derived)">{summary.readyForPlacement}</SummaryRow>
          <SummaryRow label="Overall Course %">{summary.overallCourse}</SummaryRow>
          <SummaryRow label="Roleplay Score">{summary.roleplay}</SummaryRow>
          <SummaryRow label="Assessment Average">{summary.assessmentAvg}</SummaryRow>
          <SummaryRow label="Graduation Status">{summary.graduation}</SummaryRow>
          <SummaryRow label="Certificate Status">{summary.certificate}</SummaryRow>
          <SummaryRow label="AI Recommendation" full>
            {summary.aiRecommendation}
          </SummaryRow>
        </dl>
      </section>

      {/* Manage */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Manage Placement</h3>
          <AddPlacementButton candidateId={candidateId} onOpen={() => setAddOpen(true)} />
        </div>
        {latest ? (
          <div className="flex items-center justify-between rounded-lg border bg-secondary/30 p-3">
            <div className="text-sm">
              <div className="font-medium">{latest.position_title}</div>
              <div className="text-muted-foreground">
                {latest.client?.full_name ?? "—"} ·{" "}
                {format(new Date(latest.placement_date), "MMM d, yyyy")} ·{" "}
                <Badge variant={statusVariant(latest.status)} className="ml-1">
                  {STATUS_LABEL[latest.status]}
                </Badge>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditTarget(latest)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No current placement.</p>
        )}
      </section>

      {/* History */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Placement History</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => placements.refetch()}
            disabled={placements.isFetching}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
        {placements.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : placements.isError ? (
          <div className="text-sm text-destructive">
            Failed to load placements.{" "}
            <Button variant="link" size="sm" className="px-1" onClick={() => placements.refetch()}>
              Retry
            </Button>
          </div>
        ) : !placements.data?.length ? (
          <p className="text-sm text-muted-foreground italic">No placements recorded.</p>
        ) : (
          <ul className="space-y-3">
            {placements.data.map((p) => (
              <li key={p.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm">
                    <div className="font-medium">{p.position_title}</div>
                    <div className="text-muted-foreground">
                      {p.client?.full_name ?? "—"} ·{" "}
                      {format(new Date(p.placement_date), "MMM d, yyyy")}
                    </div>
                  </div>
                  <Badge variant={statusVariant(p.status)}>{STATUS_LABEL[p.status]}</Badge>
                </div>
                {p.notes && (
                  <p className="text-sm mt-2 whitespace-pre-wrap text-foreground/90">{p.notes}</p>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  Created {format(new Date(p.created_at), "MMM d, yyyy h:mm a")}
                  {p.updated_at && p.updated_at !== p.created_at && (
                    <> · Updated {format(new Date(p.updated_at), "MMM d, yyyy h:mm a")}</>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PlacementFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        candidateId={candidateId}
        mode="create"
      />
      <PlacementFormDialog
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        candidateId={candidateId}
        mode="edit"
        placement={editTarget ?? undefined}
      />
    </div>
  );
}

function SummaryRow({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 border-b border-dashed pb-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right min-w-0 break-words">{children}</dd>
    </div>
  );
}

function AddPlacementButton({
  candidateId: _candidateId,
  onOpen,
}: {
  candidateId: string;
  onOpen: () => void;
}) {
  const clients = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const hasClients = (clients.data?.length ?? 0) > 0;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" disabled={!hasClients || clients.isLoading} onClick={onOpen}>
        <Plus className="h-4 w-4 mr-1" /> Add placement
      </Button>
      {!clients.isLoading && !hasClients && (
        <span className="text-xs text-muted-foreground">
          No client profiles exist yet — clients are provisioned separately.
        </span>
      )}
    </div>
  );
}

function PlacementFormDialog({
  open,
  onOpenChange,
  candidateId,
  mode,
  placement,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidateId: string;
  mode: "create" | "edit";
  placement?: PlacementRow;
}) {
  const qc = useQueryClient();
  const clients = useQuery({ queryKey: ["clients"], queryFn: fetchClients, enabled: open });

  const [clientId, setClientId] = useState<string>(placement?.client_id ?? "");
  const [positionTitle, setPositionTitle] = useState<string>(placement?.position_title ?? "");
  const [placementDate, setPlacementDate] = useState<string>(
    placement?.placement_date ?? new Date().toISOString().slice(0, 10),
  );
  const [status, setStatus] = useState<PlacementStatus>(placement?.status ?? "active");
  const [notes, setNotes] = useState<string>(placement?.notes ?? "");

  // Reset form when dialog opens with different placement
  useMemoReset(open, placement, () => {
    setClientId(placement?.client_id ?? "");
    setPositionTitle(placement?.position_title ?? "");
    setPlacementDate(placement?.placement_date ?? new Date().toISOString().slice(0, 10));
    setStatus(placement?.status ?? "active");
    setNotes(placement?.notes ?? "");
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["placements", candidateId] });
    qc.invalidateQueries({ queryKey: ["candidate-detail", candidateId] });
    qc.invalidateQueries({ queryKey: ["candidates"] });
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        await createPlacement({
          candidate_id: candidateId,
          client_id: clientId,
          position_title: positionTitle.trim(),
          placement_date: placementDate,
          status,
          notes: notes.trim() || null,
        });
      } else if (placement) {
        await updatePlacement(placement.id, {
          client_id: clientId,
          position_title: positionTitle.trim(),
          placement_date: placementDate,
          status,
          notes: notes.trim() || null,
        });
      }
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "Placement added" : "Placement updated");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const valid = !!clientId && !!positionTitle.trim() && !!placementDate;

  return (
    <Dialog open={open} onOpenChange={(v) => !mut.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add placement" : "Edit placement"}</DialogTitle>
          <DialogDescription>
            Record this candidate's placement with a client.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Assigned client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {(clients.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name ?? c.email ?? "Unnamed client"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Position title</Label>
            <Input
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder="e.g. Veterinary Receptionist"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Placement date</Label>
              <Input
                type="date"
                value={placementDate}
                onChange={(e) => setPlacementDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PlacementStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Interview dates, offer status, salary, rejection reason, and pipeline stages are not
            yet stored by the backend and will appear when backend support is added.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!valid || mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "create" ? "Add" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-init form state when dialog opens or placement changes
function useMemoReset(open: boolean, placement: PlacementRow | undefined, reset: () => void) {
  const key = `${open}|${placement?.id ?? ""}|${placement?.updated_at ?? ""}`;
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

