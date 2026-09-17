import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/course-stats")({
  ssr: false,
  component: CourseStatsPage,
});

type CourseListRow = {
  id: string;
  title: string;
  status: string;
  version: number;
  is_published: boolean;
};

type Stats = {
  enrolled: number | null;
  completed: number | null;
  completion_pct: number | null;
  avg_lesson_time_min: number | null;
  avg_exam_score: number | null;
  avg_final_score: number | null;
  avg_roleplay_score: number | null;
  graduation_pct: number | null;
  certificates_issued: number | null;
  qualification_pct: number | null;
};

async function fetchCourses(): Promise<CourseListRow[]> {
  const { data, error } = await supabase.rpc("admin_course_list");
  if (error) throw error;
  return (data ?? []) as CourseListRow[];
}

async function fetchStats(courseId: string): Promise<Stats> {
  const { data, error } = await supabase.rpc("admin_course_statistics", { p_course: courseId });
  if (error) throw error;
  return data as Stats;
}

function StatCard({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  const display = value === null || value === undefined ? "—" : `${Math.round(Number(value) * 100) / 100}${suffix ?? ""}`;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{display}</div>
      </CardContent>
    </Card>
  );
}

function CourseStatsPage() {
  const [courseId, setCourseId] = useState<string>("");
  const courses = useQuery({ queryKey: ["admin-course-list"], queryFn: fetchCourses });
  const stats = useQuery({
    queryKey: ["admin-course-stats", courseId],
    queryFn: () => fetchStats(courseId),
    enabled: !!courseId,
  });

  return (
    <AppShell title="Course Statistics">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Course Statistics</h2>
          <p className="text-sm text-muted-foreground">Operational metrics per course</p>
        </div>

        <div className="max-w-md">
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger>
              <SelectValue placeholder={courses.isLoading ? "Loading courses…" : "Select a course"} />
            </SelectTrigger>
            <SelectContent>
              {(courses.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title} — v{c.version} ({c.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!courseId && (
          <div className="text-sm text-muted-foreground">Select a course to view its statistics.</div>
        )}

        {courseId && stats.isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}

        {courseId && stats.isError && (
          <div className="text-sm text-destructive">Failed to load statistics.</div>
        )}

        {courseId && stats.data && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <StatCard label="Enrolled" value={stats.data.enrolled} />
            <StatCard label="Completed" value={stats.data.completed} />
            <StatCard label="Completion" value={stats.data.completion_pct} suffix="%" />
            <StatCard label="Certificates issued" value={stats.data.certificates_issued} />
            <StatCard label="Avg lesson time" value={stats.data.avg_lesson_time_min} suffix=" min" />
            <StatCard label="Avg exam score" value={stats.data.avg_exam_score} />
            <StatCard label="Avg final score" value={stats.data.avg_final_score} />
            <StatCard label="Avg roleplay score" value={stats.data.avg_roleplay_score} />
            <StatCard label="Graduation" value={stats.data.graduation_pct} suffix="%" />
            <StatCard label="Qualification" value={stats.data.qualification_pct} suffix="%" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
