import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchCandidateAssessments, type CandidateDetail } from "@/lib/queries";

export function AssessmentsTab({ candidate }: { candidate: CandidateDetail }) {
  const enrollment = candidate.candidate_courses?.[0];
  if (!enrollment) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        Not enrolled in a course — no assessments to show.
      </div>
    );
  }

  const data = useQuery({
    queryKey: ["candidate-assessments", candidate.id, enrollment.course_id],
    queryFn: () => fetchCandidateAssessments(candidate.id, enrollment.course_id),
  });

  if (data.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }
  if (data.isError) return <p className="text-sm text-destructive">Failed to load assessments.</p>;
  if (!data.data?.length)
    return <p className="text-sm text-muted-foreground italic">No assessments defined for this course.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-muted-foreground text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Assessment</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Questions</th>
            <th className="px-3 py-2 font-medium">Attempts</th>
            <th className="px-3 py-2 font-medium">Started</th>
            <th className="px-3 py-2 font-medium">Submitted</th>
            <th className="px-3 py-2 font-medium">Score</th>
            <th className="px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((a) => {
            const used = a.attempts.length;
            const max = a.assessment.max_attempts;
            const last = a.attempts[a.attempts.length - 1];
            const passed = last?.passed;
            return (
              <tr key={a.assessment.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">{a.assessment.title}</div>
                  <div className="text-xs text-muted-foreground">{a.module_title}</div>
                </td>
                <td className="px-3 py-2 capitalize">{a.assessment.kind ?? "—"}</td>
                <td className="px-3 py-2">{a.question_count}</td>
                <td className="px-3 py-2">
                  {used}
                  {max != null ? ` / ${max} (${Math.max(0, max - used)} left)` : ""}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {last?.started_at ? format(new Date(last.started_at), "MMM d, yyyy") : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {last?.submitted_at ? format(new Date(last.submitted_at), "MMM d, yyyy") : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">{last?.score != null ? `${last.score}%` : "—"}</td>
                <td className="px-3 py-2">
                  {passed === true ? (
                    <Badge className="bg-primary/15 text-primary border-0">Passed</Badge>
                  ) : passed === false ? (
                    <Badge className="bg-destructive/15 text-destructive border-0">Failed</Badge>
                  ) : last && last.score == null ? (
                    <Badge variant="secondary">Manual review</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
