import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  RefreshCw,
  Send,
  BookOpen,
  UserCog,
  Upload as UploadIcon,
  PowerOff,
  Archive,
  ExternalLink,
  Link2,
  Pencil,
  RotateCcw,
  Camera,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  fetchCandidateAssessments,
  fetchCandidateDetail,
  fetchCandidatePhotoUrl,
  fetchLastActivity,
  fetchCourseProgressDetail,
  fetchPlacements,
  resendInvitation,
  uploadCandidateFileWithProgress,
  type CandidateDetail,
} from "@/lib/queries";
import { OverviewTab } from "@/components/workspace/overview-tab";
import { DocumentsTab } from "@/components/workspace/documents-tab";
import { TrainingTab } from "@/components/workspace/training-tab";
import { AssessmentsTab } from "@/components/workspace/assessments-tab";
import { RoleplayTab } from "@/components/workspace/roleplay-tab";
import { AiAnalysisTab } from "@/components/workspace/ai-analysis-tab";
import { ResumeTab } from "@/components/workspace/resume-tab";
import { PlacementTab } from "@/components/workspace/placement-tab";
import { TimelineTab } from "@/components/workspace/timeline-tab";

import { CertificateCard } from "@/components/workspace/certificate-card";

import { EditCandidateSheet } from "@/components/workspace/edit-candidate-sheet";
import {
  ChangeCourseDialog,
  ChangeRecruiterDialog,
  DeactivateDialog,
  ReactivateDialog,
} from "@/components/workspace/dialogs";

export const Route = createFileRoute("/candidates/$candidateId")({
  ssr: false,
  component: CandidateWorkspacePage,
});

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  invited: "Invited",
  training_in_progress: "Training in progress",
  training_completed: "Training complete",
  qualified: "Qualified",
  rejected: "Rejected",
  placed: "Placed",
  inactive: "Inactive",
  training_failed: "Training failed",
  training_expired: "Training expired",
};

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function CandidateWorkspacePage() {
  const { candidateId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [courseOpen, setCourseOpen] = useState(false);
  const [recruiterOpen, setRecruiterOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await uploadCandidateFileWithProgress(
        candidateId,
        { file, bucket: "candidate-photos", fileType: "profile_photo" },
        () => {},
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["photo", candidateId] }),
        qc.invalidateQueries({ queryKey: ["candidate-detail", candidateId] }),
        qc.invalidateQueries({ queryKey: ["candidate-files", candidateId] }),
      ]);
      toast.success("Photo uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const detail = useQuery({
    queryKey: ["candidate-detail", candidateId],
    queryFn: () => fetchCandidateDetail(candidateId),
  });

  const c = detail.data;
  const enrollment = c?.candidate_courses?.[0];

  const photo = useQuery({
    queryKey: ["photo", candidateId, c?.profile?.avatar_url],
    queryFn: () => fetchCandidatePhotoUrl(candidateId, c?.profile?.avatar_url ?? null),
    enabled: !!c,
    staleTime: 300_000,
  });

  const lastActivity = useQuery({
    queryKey: ["last-activity", candidateId],
    queryFn: () => fetchLastActivity(candidateId),
    enabled: !!c,
  });

  const progress = useQuery({
    queryKey: ["course-progress-detail", candidateId, enrollment?.course_id],
    queryFn: () => fetchCourseProgressDetail(candidateId, enrollment!.course_id),
    enabled: !!enrollment?.course_id,
  });

  const placements = useQuery({
    queryKey: ["placements", candidateId],
    queryFn: () => fetchPlacements(candidateId),
    enabled: !!c,
  });

  const assessmentsQ = useQuery({
    queryKey: ["candidate-assessments", candidateId, enrollment?.course_id],
    queryFn: () => fetchCandidateAssessments(candidateId, enrollment!.course_id),
    enabled: !!enrollment?.course_id,
  });

  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["candidate-detail", candidateId] }),
        qc.invalidateQueries({ queryKey: ["last-activity", candidateId] }),
        qc.invalidateQueries({ queryKey: ["course-progress-detail", candidateId] }),
        qc.invalidateQueries({ queryKey: ["candidate-files", candidateId] }),
        qc.invalidateQueries({ queryKey: ["placements", candidateId] }),
        qc.invalidateQueries({ queryKey: ["candidate-assessments", candidateId] }),
        qc.invalidateQueries({ queryKey: ["photo", candidateId] }),
        qc.invalidateQueries({ queryKey: ["roleplay-sessions", candidateId] }),
        qc.invalidateQueries({ queryKey: ["candidate-roleplay", candidateId] }),
        qc.invalidateQueries({ queryKey: ["roleplay", candidateId] }),
        qc.invalidateQueries({ queryKey: ["ai-profile", candidateId] }),
        qc.invalidateQueries({ queryKey: ["interview-analysis", candidateId] }),
        qc.invalidateQueries({ queryKey: ["vetpod-resume", candidateId] }),
        qc.invalidateQueries({ queryKey: ["recruiter-notes", candidateId] }),
        qc.invalidateQueries({ queryKey: ["qa-readiness", candidateId] }),
        qc.invalidateQueries({ queryKey: ["timeline", candidateId] }),
        qc.invalidateQueries({ queryKey: ["activity-log"] }),
        qc.invalidateQueries({ queryKey: ["candidates"] }),
        qc.invalidateQueries({ queryKey: ["dashboard-counts"] }),
        qc.invalidateQueries({ queryKey: ["recent-activity"] }),
        qc.invalidateQueries({ queryKey: ["certificate", candidateId] }),
      ]);
      toast.success("Refreshed");
    } finally {
      setRefreshing(false);
    }
  };


  const handleResend = async () => {
    setResending(true);
    try {
      await resendInvitation(candidateId);
      toast.success("Invitation resent");
    } catch (e: any) {
      toast.error(e?.message || "Failed to resend");
    } finally {
      setResending(false);
    }
  };

  if (detail.isLoading) {
    return (
      <AppShell title="Candidate">
        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          <Skeleton className="h-[500px] rounded-2xl" />
          <Skeleton className="h-[500px] rounded-2xl" />
        </div>
      </AppShell>
    );
  }
  if (detail.isError || !c) {
    return (
      <AppShell title="Candidate">
        <div className="rounded-2xl border bg-card p-8 text-center">
          <p className="text-destructive font-medium">Failed to load candidate.</p>
          <p className="text-sm text-muted-foreground mt-1">
            {(detail.error as Error)?.message}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={() => detail.refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
            <Button variant="ghost" onClick={() => navigate({ to: "/candidates" })}>
              Back to directory
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const statusKey = c.status;
  const statusLabel = STATUS_LABEL[statusKey] ?? statusKey;
  const invitationLabel = statusKey === "invited" ? "Invited / pending" : "Active";

  return (
    <AppShell title={c.profile?.full_name || "Candidate"}>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link
            to="/candidates"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Candidate Pool
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit candidate
            </Button>
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          {/* LEFT RAIL */}
          <aside className="space-y-4">
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex flex-col items-center text-center">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
                    aria-label="Upload candidate photo"
                    title="Upload photo"
                  >
                    <Avatar className="h-24 w-24">
                      {photo.data && <AvatarImage src={photo.data} />}
                      <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                        {initials(c.profile?.full_name, c.profile?.email)}
                      </AvatarFallback>
                    </Avatar>
                    {uploadingPhoto && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
                    aria-label="Upload photo"
                    title="Upload photo"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoSelected}
                  />
                </div>
                <h2 className="mt-3 text-lg font-semibold leading-tight">
                  {c.profile?.full_name || "Unnamed candidate"}
                </h2>
                <p className="text-xs text-muted-foreground break-all">{c.profile?.email}</p>
                <Badge
                  className={`mt-2 border-0 ${
                    statusKey === "training_failed"
                      ? "bg-destructive/15 text-destructive"
                      : statusKey === "training_expired"
                        ? "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning-foreground)]"
                        : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {statusLabel}
                </Badge>
              </div>

              <dl className="mt-5 space-y-3 text-sm">
                <RailRow label="Candidate Status">{statusLabel}</RailRow>
                <RailRow label="Training Status">
                  {(() => {
                    const es = enrollment?.status;
                    if (es) return es.replace(/_/g, " ");
                    if (c.status === "training_in_progress") return "In training";
                    if (c.status === "training_completed") return "Training complete";
                    if (c.status === "invited") return "Not started";
                    return statusLabel;
                  })()}
                </RailRow>
                <RailRow label="Placement Status">
                  {(() => {
                    const p = placements.data?.[0];
                    if (!p) return <span className="italic text-muted-foreground">Not placed</span>;
                    return p.status.charAt(0).toUpperCase() + p.status.slice(1);
                  })()}
                </RailRow>
                <RailRow label="Recruiter">
                  {c.recruiter?.profile?.full_name ?? (
                    <span className="italic text-muted-foreground">Unassigned</span>
                  )}
                </RailRow>
                <RailRow label="Course">
                  {enrollment?.course?.title ?? (
                    <span className="italic text-muted-foreground">Not enrolled</span>
                  )}
                </RailRow>
                <RailRow label="Assigned Client">
                  {placements.data?.[0]?.client?.full_name ?? "—"}
                </RailRow>
                <RailRow label="Availability">{c.availability ?? "—"}</RailRow>
                <RailRow label="Invitation">{invitationLabel}</RailRow>
                <RailRow label="Created">
                  {format(new Date(c.created_at), "MMM d, yyyy")}
                </RailRow>
                <RailRow label="Last activity">
                  {lastActivity.data
                    ? format(new Date(lastActivity.data), "MMM d, yyyy")
                    : "—"}
                </RailRow>
                <RailRow label="Overall Progress">
                  {progress.data ? `${Math.round(progress.data.percent ?? 0)}%` : "—"}
                </RailRow>
                <RailRow label="Overall Score">
                  {(() => {
                    const scores: number[] = [];
                    (assessmentsQ.data ?? []).forEach((a) =>
                      a.attempts.forEach((at) => {
                        if (typeof at.score === "number") scores.push(at.score);
                      }),
                    );
                    if (!scores.length) return "—";
                    return `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%`;
                  })()}
                </RailRow>
                <RailRow label="Ready for Placement">
                  {c.status === "qualified" || progress.data?.graduated ? "Yes" : "No"}
                </RailRow>
                <RailRow label="Tags">
                  <span className="text-muted-foreground">No tags assigned</span>
                </RailRow>
              </dl>

            </div>

            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Quick Actions
              </h3>
              <div className="space-y-1">
                <ActionButton onClick={handleResend} disabled={resending} icon={Send}>
                  {resending ? "Sending…" : "Resend Invitation"}
                </ActionButton>
                <ActionButton onClick={() => setCourseOpen(true)} icon={BookOpen}>
                  {enrollment ? "Change Course" : "Assign Course"}
                </ActionButton>
                <ActionButton onClick={() => setRecruiterOpen(true)} icon={UserCog}>
                  Change Recruiter
                </ActionButton>
                <ActionButton onClick={() => setTab("documents")} icon={UploadIcon}>
                  Upload Documents
                </ActionButton>
                {c.status === "inactive" ? (
                  <ActionButton
                    onClick={() => setReactivateOpen(true)}
                    icon={RotateCcw}
                    variant="ghost"
                  >
                    Reactivate Candidate
                  </ActionButton>
                ) : (
                  <ActionButton
                    onClick={() => setDeactivateOpen(true)}
                    icon={PowerOff}
                    variant="destructive"
                  >
                    Deactivate Candidate
                  </ActionButton>
                )}
                <DisabledAction icon={Archive} label="Archive Candidate" />
                <DisabledAction icon={ExternalLink} label="Open Academy Profile" />
                <DisabledAction icon={Link2} label="Copy Academy Login Link" />
              </div>
            </div>
          </aside>

          {/* RIGHT WORKSPACE */}
          <section className="rounded-2xl border bg-card shadow-sm min-w-0">
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <div className="border-b px-2 overflow-x-auto">
                <TabsList className="bg-transparent h-auto p-0 gap-1">
                  {[
                    ["overview", "Overview"],
                    ["documents", "Documents"],
                    ["training", "Training"],
                    ["assessments", "Assessments"],
                    ["roleplay", "Roleplay"],
                    ["ai", "AI Analysis"],
                    ["resume", "VetPod Resume"],
                    ["placement", "Placement"],
                    ["timeline", "Activity"],

                  ].map(([v, l]) => (
                    <TabsTrigger
                      key={v}
                      value={v}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-3"
                    >
                      {l}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="p-5">
                <TabsContent value="overview" className="mt-0 space-y-5">
                  <OverviewTab candidate={c} />
                  <CertificateCard candidateId={candidateId} />
                  
                </TabsContent>
                <TabsContent value="documents" className="mt-0">
                  <DocumentsTab candidateId={candidateId} />
                </TabsContent>
                <TabsContent value="training" className="mt-0">
                  <TrainingTab candidate={c} />
                </TabsContent>
                <TabsContent value="assessments" className="mt-0">
                  <AssessmentsTab candidate={c} />
                </TabsContent>
                <TabsContent value="roleplay" className="mt-0">
                  <RoleplayTab candidateId={candidateId} />
                </TabsContent>
                <TabsContent value="ai" className="mt-0">
                  <AiAnalysisTab candidateId={candidateId} />
                </TabsContent>
                <TabsContent value="resume" className="mt-0">
                  <ResumeTab candidateId={candidateId} />
                </TabsContent>
                <TabsContent value="placement" className="mt-0">
                  <PlacementTab candidate={c} />
                </TabsContent>

                <TabsContent value="timeline" className="mt-0">
                  <TimelineTab candidate={c} />
                </TabsContent>
              </div>
            </Tabs>
          </section>
        </div>
      </div>

      <ChangeCourseDialog
        open={courseOpen}
        onOpenChange={setCourseOpen}
        candidate={c}
        onChanged={refreshAll}
      />
      <ChangeRecruiterDialog
        open={recruiterOpen}
        onOpenChange={setRecruiterOpen}
        candidate={c}
        onChanged={refreshAll}
      />
      <DeactivateDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        candidate={c}
        onChanged={refreshAll}
      />
      <ReactivateDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        candidate={c}
        onChanged={refreshAll}
      />
      <EditCandidateSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        candidate={c}
      />
    </AppShell>
  );
}

function RailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-sm text-right min-w-0 truncate">{children}</dd>
    </div>
  );
}

function ActionButton({
  children,
  icon: Icon,
  onClick,
  disabled,
  variant = "ghost",
}: {
  children: React.ReactNode;
  icon: any;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "ghost" | "destructive";
}) {
  return (
    <Button
      variant={variant === "destructive" ? "ghost" : "ghost"}
      className={`w-full justify-start ${
        variant === "destructive" ? "text-destructive hover:text-destructive" : ""
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-4 w-4 mr-2" />
      {children}
    </Button>
  );
}

function DisabledAction({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button
              variant="ghost"
              className="w-full justify-start opacity-50 cursor-not-allowed"
              disabled
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">Available in a later phase</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export type { CandidateDetail };
