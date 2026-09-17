import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  addRecruiterNote,
  fetchCandidateAiProfile,
  fetchCourseModules,
  fetchModuleProgress,
  fetchFirstIncompleteLesson,
  fetchRecruiterNotes,
  fetchCourseProgressDetail,
  type CandidateDetail,
} from "@/lib/queries";

function initials(name?: string | null) {
  const s = (name || "?").trim().split(/\s+/);
  if (s.length >= 2) return (s[0][0] + s[1][0]).toUpperCase();
  return s[0].slice(0, 2).toUpperCase();
}

export function OverviewTab({ candidate }: { candidate: CandidateDetail }) {
  const enrollment = candidate.candidate_courses?.[0];
  const courseId = enrollment?.course_id;

  const ai = useQuery({
    queryKey: ["ai-profile", candidate.id],
    queryFn: () => fetchCandidateAiProfile(candidate.id),
  });

  const summary = ai.data?.approved_summary || candidate.headline || null;

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* Candidate Info */}
      <section className="rounded-xl border p-4">
        <h3 className="font-semibold mb-3">Candidate Information</h3>
        <dl className="text-sm space-y-2">
          <Field label="Full name">{candidate.profile?.full_name || "—"}</Field>
          <Field label="Email">{candidate.profile?.email || "—"}</Field>
          <Field label="Phone">{candidate.profile?.phone || "—"}</Field>
          <Field label="Country">{candidate.country || "—"}</Field>
          <Field label="Timezone">{candidate.timezone || "—"}</Field>
          <Field label="Availability">
            {candidate.availability || candidate.preferred_shift || "—"}
          </Field>
          <Field label="Weekly hours">
            {candidate.weekly_hours_available ?? "—"}
          </Field>
          <Field label="Customer service exp.">
            {candidate.years_customer_service_experience != null
              ? `${candidate.years_customer_service_experience} yrs`
              : "—"}
          </Field>
          <Field label="Veterinary exp.">
            {candidate.years_veterinary_experience != null
              ? `${candidate.years_veterinary_experience} yrs`
              : "—"}
          </Field>
        </dl>
      </section>

      {/* Professional Summary + Course context */}
      <section className="space-y-5">
        <div className="rounded-xl border p-4">
          <h3 className="font-semibold mb-2">Professional Summary</h3>
          {summary ? (
            <p className="text-sm whitespace-pre-wrap text-foreground/90">{summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No summary recorded yet.</p>
          )}
        </div>
        <CourseContext candidateId={candidate.id} courseId={courseId} enrollmentStatus={enrollment?.status ?? null} courseTitle={enrollment?.course?.title ?? null} />
      </section>

      {/* Notes — full width */}
      <section className="lg:col-span-2 rounded-xl border p-4">
        <h3 className="font-semibold mb-3">Internal Recruiter Notes</h3>
        <NotesPanel candidateId={candidate.id} />
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed last:border-0 pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right min-w-0 truncate">{children}</dd>
    </div>
  );
}

function CourseContext({
  candidateId,
  courseId,
  enrollmentStatus,
  courseTitle,
}: {
  candidateId: string;
  courseId: string | undefined;
  enrollmentStatus: string | null;
  courseTitle: string | null;
}) {
  const progress = useQuery({
    queryKey: ["course-progress-detail", candidateId, courseId],
    queryFn: () => fetchCourseProgressDetail(candidateId, courseId!),
    enabled: !!courseId,
  });
  const modules = useQuery({
    queryKey: ["course-modules", courseId],
    queryFn: () => fetchCourseModules(courseId!),
    enabled: !!courseId,
  });

  const currentModule = useQuery({
    queryKey: ["current-module", candidateId, courseId, modules.data?.map((m) => m.id).join(",")],
    queryFn: async () => {
      for (const m of modules.data ?? []) {
        const mp = await fetchModuleProgress(candidateId, m.id);
        if (mp?.unlocked && !mp.complete) return { module: m, mp };
      }
      return null;
    },
    enabled: !!modules.data?.length,
  });

  const currentLesson = useQuery({
    queryKey: ["current-lesson", candidateId, currentModule.data?.module.id],
    queryFn: () => fetchFirstIncompleteLesson(candidateId, currentModule.data!.module.id),
    enabled: !!currentModule.data?.module.id,
  });

  if (!courseId) {
    return (
      <div className="rounded-xl border p-4">
        <h3 className="font-semibold mb-2">Course</h3>
        <p className="text-sm text-muted-foreground italic">Not enrolled in a course.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4 space-y-2 text-sm">
      <h3 className="font-semibold mb-1">Course Context</h3>
      <Field label="Assigned course">{courseTitle ?? "—"}</Field>
      <Field label="Enrollment status">
        <span className="capitalize">{(enrollmentStatus ?? "enrolled").replace(/_/g, " ")}</span>
      </Field>
      <Field label="Overall progress">
        {progress.data ? `${Math.round(progress.data.percent ?? 0)}%` : "—"}
      </Field>
      <Field label="Current module">
        {currentModule.data?.module.title ?? <span className="text-muted-foreground italic">All modules complete</span>}
      </Field>
      <Field label="Current lesson">
        {currentLesson.data?.title ?? <span className="text-muted-foreground italic">—</span>}
      </Field>
    </div>
  );
}

function NotesPanel({ candidateId }: { candidateId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const notes = useQuery({
    queryKey: ["recruiter-notes", candidateId],
    queryFn: () => fetchRecruiterNotes(candidateId),
  });
  const mut = useMutation({
    mutationFn: () => addRecruiterNote(candidateId, text.trim()),
    onSuccess: () => {
      toast.success("Note added");
      setText("");
      qc.invalidateQueries({ queryKey: ["recruiter-notes", candidateId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add note"),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a private note for the recruiting team…"
          rows={3}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!text.trim() || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Add note
          </Button>
        </div>
      </div>
      {notes.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : !notes.data?.length ? (
        <p className="text-sm text-muted-foreground italic">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.data.map((n) => (
            <li key={n.id} className="rounded-lg border p-3 bg-secondary/30">
              <div className="flex items-center gap-2 mb-1.5">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                    {initials(n.recruiter?.profile?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {n.recruiter?.profile?.full_name || "Recruiter"}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {format(new Date(n.created_at), "MMM d, yyyy 'at' h:mm a")}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{n.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
