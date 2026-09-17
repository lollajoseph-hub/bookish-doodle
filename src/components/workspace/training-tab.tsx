import { useQuery, useQueries } from "@tanstack/react-query";
import {
  fetchCourseModules,
  fetchModuleProgress,
  fetchCourseProgressDetail,
  fetchCourseFinalAssessment,
  fetchCandidateAssessments,
  fetchCandidateRoleplay,
  fetchCandidateCertificates,
  fetchCandidateGraduations,
  fetchFirstIncompleteLesson,
  type CandidateDetail,
} from "@/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Lock } from "lucide-react";

export function TrainingTab({ candidate }: { candidate: CandidateDetail }) {
  const enrollment = candidate.candidate_courses?.[0];
  if (!enrollment) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        This candidate is not enrolled in a course yet.
      </div>
    );
  }
  const courseId = enrollment.course_id;
  const candidateId = candidate.id;

  const overall = useQuery({
    queryKey: ["course-progress-detail", candidateId, courseId],
    queryFn: () => fetchCourseProgressDetail(candidateId, courseId),
  });
  const modules = useQuery({
    queryKey: ["course-modules", courseId],
    queryFn: () => fetchCourseModules(courseId),
  });
  const moduleProgress = useQueries({
    queries: (modules.data ?? []).map((m) => ({
      queryKey: ["module-progress", candidateId, m.id],
      queryFn: () => fetchModuleProgress(candidateId, m.id),
    })),
  });

  const finalAssess = useQuery({
    queryKey: ["course-final", courseId],
    queryFn: () => fetchCourseFinalAssessment(courseId),
  });
  const assessments = useQuery({
    queryKey: ["candidate-assessments", candidateId, courseId],
    queryFn: () => fetchCandidateAssessments(candidateId, courseId),
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

  // current module/lesson
  const currentModuleIdx = moduleProgress.findIndex((q) => q.data?.unlocked && !q.data.complete);
  const currentModule = currentModuleIdx >= 0 ? modules.data?.[currentModuleIdx] : null;
  const currentLesson = useQuery({
    queryKey: ["current-lesson", candidateId, currentModule?.id],
    queryFn: () => fetchFirstIncompleteLesson(candidateId, currentModule!.id),
    enabled: !!currentModule,
  });

  const completedLessons = moduleProgress.reduce(
    (a, q) => a + (q.data?.completed_lessons ?? 0),
    0,
  );
  const completedModules = overall.data?.completed_modules ?? 0;
  const remainingModules = overall.data
    ? Math.max(0, (overall.data.total_modules ?? 0) - completedModules)
    : null;

  const allAttempts = (assessments.data ?? []).flatMap((a) => a.attempts);
  const scored = allAttempts.filter((a) => typeof a.score === "number");
  const assessmentAvg = scored.length
    ? Math.round((scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length) * 10) / 10
    : null;

  // Final exam: best score on assessment(s) within final module
  let finalScore: number | null = null;
  let finalPassed: boolean | null = null;
  if (finalAssess.data?.module_id) {
    const finals = (assessments.data ?? []).filter(
      (a) => a.module_id === finalAssess.data!.module_id,
    );
    const finalAttempts = finals.flatMap((f) => f.attempts);
    if (finalAttempts.length) {
      const best = finalAttempts.reduce((b, a) =>
        (a.score ?? -1) > (b.score ?? -1) ? a : b,
      );
      finalScore = best.score ?? null;
      finalPassed = best.passed ?? null;
    }
  }

  const roleplayCompleted = (roleplay.data ?? []).filter((r) => r.completed_at).length;
  const issuedCert = (certs.data ?? []).find((c) => c.status === "issued");
  const graduation = grads.data?.[0];

  const pct = Math.round(overall.data?.percent ?? 0);

  return (
    <div className="space-y-6">
      {/* Top: progress + summary */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border p-5 flex flex-col items-center justify-center">
          <ProgressRing percent={pct} />
          <p className="mt-2 text-sm font-medium">Overall Progress</p>
        </div>
        <div className="rounded-xl border p-5 md:col-span-2 grid grid-cols-2 gap-y-3 text-sm">
          <Metric label="Current module" value={currentModule?.title ?? "—"} />
          <Metric label="Current lesson" value={currentLesson.data?.title ?? "—"} />
          <Metric label="Completed lessons" value={String(completedLessons)} />
          <Metric label="Completed modules" value={String(completedModules)} />
          <Metric label="Remaining modules" value={remainingModules != null ? String(remainingModules) : "—"} />
          <Metric label="Assessment average" value={assessmentAvg != null ? `${assessmentAvg}%` : "—"} />
          <Metric
            label="Final exam"
            value={
              finalScore != null
                ? `${finalScore}%${finalPassed ? " · Passed" : finalPassed === false ? " · Failed" : ""}`
                : "—"
            }
          />
          <Metric label="Roleplay sessions" value={`${roleplayCompleted} completed`} />
          <Metric label="Certificate" value={issuedCert ? "Issued" : "Not issued"} />
          <Metric label="Graduation" value={graduation ? `Graduated ${new Date(graduation.graduated_at).toLocaleDateString()}` : "Not graduated"} />
          <Metric label="Learning status" value={enrollment.status ?? "enrolled"} />
        </div>
      </div>

      {/* Module list */}
      <div className="rounded-xl border">
        <header className="px-4 py-3 border-b font-semibold">Modules</header>
        {modules.isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : !modules.data?.length ? (
          <p className="p-4 text-sm text-muted-foreground italic">No modules published.</p>
        ) : (
          <ul className="divide-y">
            {modules.data.map((m, i) => {
              const mp = moduleProgress[i]?.data;
              const icon = mp?.complete ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : mp?.unlocked ? (
                <Circle className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Lock className="h-5 w-5 text-muted-foreground/50" />
              );
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  {icon}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{m.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {mp
                        ? `${mp.completed_lessons}/${mp.total_lessons} lessons · ${Math.round(mp.percent ?? 0)}%`
                        : "—"}
                    </div>
                  </div>
                  {mp?.required_assessments ? (
                    <Badge variant="secondary">
                      Assess {mp.assessments_passed}/{mp.required_assessments}
                    </Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, percent)) / 100) * c;
  return (
    <div className="relative h-24 w-24">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
        <circle cx="44" cy="44" r={r} className="fill-none stroke-secondary" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={r}
          className="fill-none stroke-primary transition-all"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums">
        {percent}%
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}
