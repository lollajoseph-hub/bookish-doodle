import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Award,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  Mic,
  StickyNote,
  Upload,
  UserPlus,
  XCircle,
  Briefcase,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  fetchCandidateAssessments,
  fetchCandidateCertificates,
  fetchCandidateFiles,
  fetchCandidateGraduations,
  fetchCandidateRoleplay,
  fetchPlacements,
  fetchRecruiterNotes,
  type CandidateDetail,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";

interface Event {
  id: string;
  at: string;
  icon: any;
  label: string;
  detail?: string;
  tone?: "default" | "success" | "danger";
}

const FILE_TYPE_LABEL: Record<string, string> = {
  profile_photo: "Passport photo uploaded",
  id_document: "Photo ID uploaded",
  original_resume: "Resume uploaded",
  intro_video: "Intro video uploaded",
  other: "Supporting document uploaded",
};

export function TimelineTab({ candidate }: { candidate: CandidateDetail }) {
  const candidateId = candidate.id;
  const courseId = candidate.candidate_courses?.[0]?.course_id;
  const [tab, setTab] = useState("training");

  const lessons = useQuery({
    queryKey: ["lesson-progress", candidateId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_progress")
        .select("lesson_id, completed_at, lesson:lessons(title)")
        .eq("candidate_id", candidateId)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });
  const assessments = useQuery({
    queryKey: ["candidate-assessments", candidateId, courseId],
    queryFn: () => fetchCandidateAssessments(candidateId, courseId!),
    enabled: !!courseId,
  });
  const roleplay = useQuery({
    queryKey: ["roleplay", candidateId],
    queryFn: () => fetchCandidateRoleplay(candidateId),
  });
  const certs = useQuery({
    queryKey: ["certificates", candidateId],
    queryFn: () => fetchCandidateCertificates(candidateId),
  });
  const grads = useQuery({
    queryKey: ["graduations", candidateId],
    queryFn: () => fetchCandidateGraduations(candidateId),
  });
  const notes = useQuery({
    queryKey: ["recruiter-notes", candidateId],
    queryFn: () => fetchRecruiterNotes(candidateId),
  });
  const files = useQuery({
    queryKey: ["candidate-files", candidateId],
    queryFn: () => fetchCandidateFiles(candidateId),
  });
  const placements = useQuery({
    queryKey: ["placements", candidateId],
    queryFn: () => fetchPlacements(candidateId),
  });

  const loading =
    lessons.isLoading ||
    assessments.isLoading ||
    roleplay.isLoading ||
    certs.isLoading ||
    grads.isLoading ||
    notes.isLoading ||
    files.isLoading ||
    placements.isLoading;

  // Individual query errors are handled below — a single failed source no longer blanks the tab.


  // ---- Training Timeline (learning events) ----
  const trainingEvents: Event[] = [];

  trainingEvents.push({
    id: `created-${candidate.id}`,
    at: candidate.created_at,
    icon: UserPlus,
    label: "Candidate created",
  });

  candidate.candidate_courses?.forEach((cc) => {
    if (cc.enrolled_at)
      trainingEvents.push({
        id: `enroll-${cc.id}`,
        at: cc.enrolled_at,
        icon: BookOpen,
        label: `Enrolled in ${cc.course?.title ?? "course"}`,
      });
  });

  (lessons.data ?? []).forEach((l: any, i: number) =>
    trainingEvents.push({
      id: `lesson-${l.lesson_id}-${i}`,
      at: l.completed_at,
      icon: CheckCircle2,
      label: `Lesson completed${l.lesson?.title ? `: ${l.lesson.title}` : ""}`,
      tone: "success",
    }),
  );

  (assessments.data ?? []).forEach((a) =>
    a.attempts.forEach((at) => {
      if (!at.submitted_at) return;
      trainingEvents.push({
        id: `assess-${at.id}`,
        at: at.submitted_at,
        icon: at.passed === false ? XCircle : CheckCircle2,
        label: `Assessment ${at.passed ? "passed" : at.passed === false ? "failed" : "submitted"}: ${a.assessment.title}`,
        detail: at.score != null ? `${at.score}%` : undefined,
        tone: at.passed ? "success" : at.passed === false ? "danger" : "default",
      });
    }),
  );

  (roleplay.data ?? []).forEach((r) => {
    trainingEvents.push({
      id: `rp-c-${r.id}`,
      at: r.created_at,
      icon: Mic,
      label: `Roleplay submitted: ${r.scenario_name ?? "scenario"}`,
    });
    if (r.completed_at)
      trainingEvents.push({
        id: `rp-g-${r.id}`,
        at: r.completed_at,
        icon: Mic,
        label: `Roleplay graded: ${r.scenario_name ?? "scenario"}`,
        detail: r.score != null ? `${r.score}%` : undefined,
        tone: "success",
      });
  });

  (certs.data ?? []).forEach((c) => {
    if (c.issued_at)
      trainingEvents.push({
        id: `cert-${c.id}`,
        at: c.issued_at,
        icon: Award,
        label: "Certificate issued",
        tone: "success",
      });
  });

  (grads.data ?? []).forEach((g) =>
    trainingEvents.push({
      id: `grad-${g.id}`,
      at: g.graduated_at,
      icon: GraduationCap,
      label: "Graduated",
      tone: "success",
    }),
  );

  (notes.data ?? []).forEach((n) =>
    trainingEvents.push({
      id: `note-${n.id}`,
      at: n.created_at,
      icon: StickyNote,
      label: `Recruiter note added by ${n.recruiter?.profile?.full_name ?? "recruiter"}`,
    }),
  );

  (files.data ?? []).forEach((f) =>
    trainingEvents.push({
      id: `file-${f.id}`,
      at: f.created_at,
      icon: Upload,
      label: `Document uploaded: ${f.file_name}`,
    }),
  );

  trainingEvents.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // ---- Operational Activity ----
  // Normalized event list built only from truthfully sourceable data.
  // Future: admin users could also be fed audit_logs-derived events into this same array.
  const opEvents: Event[] = [];

  opEvents.push({
    id: `op-created-${candidate.id}`,
    at: candidate.created_at,
    icon: UserPlus,
    label: "Candidate created",
  });

  (files.data ?? []).forEach((f) =>
    opEvents.push({
      id: `op-file-${f.id}`,
      at: f.created_at,
      icon: Upload,
      label: FILE_TYPE_LABEL[f.file_type] ?? `Document uploaded`,
      detail: f.file_name,
    }),
  );

  candidate.candidate_courses?.forEach((cc) => {
    if (cc.enrolled_at)
      opEvents.push({
        id: `op-enroll-${cc.id}`,
        at: cc.enrolled_at,
        icon: BookOpen,
        label: `Course assigned: ${cc.course?.title ?? "course"}`,
      });
  });

  (notes.data ?? []).forEach((n) =>
    opEvents.push({
      id: `op-note-${n.id}`,
      at: n.created_at,
      icon: StickyNote,
      label: `Recruiter note added by ${n.recruiter?.profile?.full_name ?? "recruiter"}`,
    }),
  );

  (assessments.data ?? []).forEach((a) =>
    a.attempts.forEach((at) => {
      if (!at.submitted_at) return;
      opEvents.push({
        id: `op-assess-${at.id}`,
        at: at.submitted_at,
        icon: at.passed === false ? XCircle : CheckCircle2,
        label: `Assessment ${at.passed ? "passed" : at.passed === false ? "completed (failed)" : "completed"}: ${a.assessment.title}`,
        detail: at.score != null ? `${at.score}%` : undefined,
        tone: at.passed ? "success" : at.passed === false ? "danger" : "default",
      });
    }),
  );

  (roleplay.data ?? []).forEach((r) => {
    opEvents.push({
      id: `op-rp-c-${r.id}`,
      at: r.created_at,
      icon: Mic,
      label: `Roleplay submitted: ${r.scenario_name ?? "scenario"}`,
    });
    if (r.completed_at)
      opEvents.push({
        id: `op-rp-g-${r.id}`,
        at: r.completed_at,
        icon: Mic,
        label: `Roleplay graded: ${r.scenario_name ?? "scenario"}`,
        detail: r.score != null ? `${r.score}%` : undefined,
        tone: "success",
      });
  });

  (certs.data ?? []).forEach((c) => {
    const at = c.issued_at;
    if (!at) return;
    opEvents.push({
      id: `op-cert-${c.id}`,
      at,
      icon: Award,
      label: "Certificate created",
    });
  });


  (placements.data ?? []).forEach((p) => {
    opEvents.push({
      id: `op-plc-c-${p.id}`,
      at: p.created_at,
      icon: Briefcase,
      label: `Placement created: ${p.position_title}`,
      detail: p.client?.full_name ?? undefined,
    });
    if (p.updated_at && p.updated_at !== p.created_at) {
      opEvents.push({
        id: `op-plc-u-${p.id}`,
        at: p.updated_at,
        icon: Briefcase,
        label: `Placement updated: ${p.position_title}`,
        detail: p.client?.full_name ?? undefined,
      });
    }
  });

  opEvents.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }

  const failedQueries = [
    lessons,
    assessments,
    roleplay,
    certs,
    grads,
    notes,
    files,
    placements,
  ].filter((q) => q.isError);
  const hasErrors = failedQueries.length > 0;



  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList>
        <TabsTrigger value="training">Training Timeline</TabsTrigger>
        <TabsTrigger value="operational">Operational Activity</TabsTrigger>
      </TabsList>
      {hasErrors && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span>Some activity may be incomplete.</span>
          <button
            type="button"
            className="inline-flex items-center underline hover:text-foreground"
            onClick={() => failedQueries.forEach((q) => q.refetch())}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </button>
        </div>
      )}
      <TabsContent value="training" className="mt-4">
        <EventList events={trainingEvents} />
      </TabsContent>
      <TabsContent value="operational" className="mt-4">
        <EventList events={opEvents} />
      </TabsContent>
    </Tabs>
  );
}

function EventList({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No activity yet.</p>;
  }
  return (
    <ol className="relative border-l-2 border-secondary ml-2 space-y-4">
      {events.map((e) => {
        const Icon = e.icon;
        const tone =
          e.tone === "success"
            ? "bg-primary text-primary-foreground"
            : e.tone === "danger"
              ? "bg-destructive text-destructive-foreground"
              : "bg-secondary text-secondary-foreground";
        return (
          <li key={e.id} className="ml-4">
            <span
              className={`absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full ${tone}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="text-sm">
              <span className="font-medium">{e.label}</span>
              {e.detail && <span className="text-muted-foreground"> · {e.detail}</span>}
            </div>
            <time className="text-xs text-muted-foreground">
              {format(new Date(e.at), "MMM d, yyyy 'at' h:mm a")}
            </time>
          </li>
        );
      })}
    </ol>
  );
}

// suppress unused
void FileText;
