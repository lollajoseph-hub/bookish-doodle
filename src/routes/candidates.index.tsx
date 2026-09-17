import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { CreateCandidateDialog } from "@/components/create-candidate-dialog";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import {
  fetchCandidates,
  fetchCourseProgress,
  fetchLastActivity,
  fetchCandidatePhotoUrl,
  type CandidateRow,
} from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, FileText, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/candidates/")({
  ssr: false,
  component: CandidatesPage,
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

const STATUS_TONE: Record<string, string> = {
  uploaded: "bg-secondary text-secondary-foreground",
  invited: "bg-secondary text-secondary-foreground",
  training_in_progress: "bg-primary/15 text-primary",
  training_completed: "bg-secondary text-secondary-foreground",
  qualified: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success-foreground)]",
  rejected: "bg-destructive/15 text-destructive",
  placed: "bg-accent text-accent-foreground",
  inactive: "bg-muted text-muted-foreground",
  training_failed: "bg-destructive/15 text-destructive",
  training_expired: "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning-foreground)]",
};

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

type SortKey = "name" | "email" | "status" | "course" | "recruiter" | "progress" | "created";

function CandidatesPage() {
  const candidates = useQuery({ queryKey: ["candidates"], queryFn: fetchCandidates });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [recruiterFilter, setRecruiterFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [createOpen, setCreateOpen] = useState(false);
  const [previewCandidate, setPreviewCandidate] = useState<CandidateRow | null>(null);

  const courseOptions = useMemo(() => {
    const m = new Map<string, string>();
    candidates.data?.forEach((c) => {
      const enr = c.candidate_courses?.[0];
      if (enr?.course_id) m.set(enr.course_id, enr.course?.title ?? "Untitled course");
    });
    return Array.from(m.entries());
  }, [candidates.data]);

  const recruiterOptions = useMemo(() => {
    const m = new Map<string, string>();
    candidates.data?.forEach((c) => {
      if (c.recruiter_id) m.set(c.recruiter_id, c.recruiter?.profile?.full_name ?? "Unnamed");
    });
    return Array.from(m.entries());
  }, [candidates.data]);

  const filtered = useMemo(() => {
    let rows = candidates.data ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const name = r.profile?.full_name?.toLowerCase() ?? "";
        const email = r.profile?.email?.toLowerCase() ?? "";
        return name.includes(q) || email.includes(q);
      });
    }
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (courseFilter !== "all")
      rows = rows.filter((r) => r.candidate_courses?.[0]?.course_id === courseFilter);
    if (recruiterFilter !== "all")
      rows = rows.filter((r) => r.recruiter_id === recruiterFilter);

    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = sortVal(a, sortKey);
      const bv = sortVal(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
    return rows;
  }, [candidates.data, search, statusFilter, courseFilter, recruiterFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <AppShell title="Candidate Pool">
      <div className="space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Candidates</h2>
            <p className="text-sm text-muted-foreground">
              {candidates.data ? `${candidates.data.length} total` : "Loading…"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={candidates.isFetching} onClick={async () => { await candidates.refetch(); toast.success("Refreshed"); }}>
              <RefreshCw className={`h-4 w-4 mr-2 ${candidates.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add candidate
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={courseFilter} onValueChange={(v) => { setCourseFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Course" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All courses</SelectItem>
                {courseOptions.map(([id, title]) => (
                  <SelectItem key={id} value={id}>{title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={recruiterFilter} onValueChange={(v) => { setRecruiterFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Recruiter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All recruiters</SelectItem>
                {recruiterOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={`${sortKey}:${sortDir}`} onValueChange={(v) => {
              const [k, d] = v.split(":") as [SortKey, "asc" | "desc"];
              setSortKey(k); setSortDir(d);
            }}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created:desc">Newest first</SelectItem>
                <SelectItem value="created:asc">Oldest first</SelectItem>
                <SelectItem value="name:asc">Name A–Z</SelectItem>
                <SelectItem value="name:desc">Name Z–A</SelectItem>
                <SelectItem value="email:asc">Email A–Z</SelectItem>
                <SelectItem value="status:asc">Status A–Z</SelectItem>
                <SelectItem value="course:asc">Course A–Z</SelectItem>
                <SelectItem value="recruiter:asc">Recruiter A–Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          {candidates.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : candidates.isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              Failed to load candidates. {(candidates.error as Error)?.message}
            </div>
          ) : !filtered.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No candidates match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">Candidate</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Recruiter</th>
                    <th className="px-4 py-3 font-medium">Course</th>
                    <th className="px-4 py-3 font-medium">Progress</th>
                    <th className="px-4 py-3 font-medium">Experience</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Last activity</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((c) => (
                    <CandidateRowItem
                      key={c.id}
                      row={c}
                      onPreview={() => setPreviewCandidate(c)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between p-3 border-t text-sm">
              <span className="text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CreateCandidateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <FilePreviewDialog
        open={!!previewCandidate}
        onOpenChange={(v) => !v && setPreviewCandidate(null)}
        candidateId={previewCandidate?.id ?? null}
        candidateName={previewCandidate?.profile?.full_name}
      />
    </AppShell>
  );
}

function sortVal(c: CandidateRow, k: SortKey): string | number | null {
  switch (k) {
    case "name": return (c.profile?.full_name ?? "").toLowerCase();
    case "email": return (c.profile?.email ?? "").toLowerCase();
    case "status": return c.status;
    case "course": return (c.candidate_courses?.[0]?.course?.title ?? "").toLowerCase();
    case "recruiter": return (c.recruiter?.profile?.full_name ?? "").toLowerCase();
    case "progress": return 0; // dynamic; not used for stable sort
    case "created": return new Date(c.created_at).getTime();
  }
}

function CandidateRowItem({ row, onPreview }: { row: CandidateRow; onPreview: () => void }) {
  const enrollment = row.candidate_courses?.[0];
  const progress = useQuery({
    queryKey: ["progress", row.id, enrollment?.course_id],
    queryFn: () => fetchCourseProgress(row.id, enrollment!.course_id),
    enabled: !!enrollment?.course_id,
    staleTime: 60_000,
  });
  const lastAct = useQuery({
    queryKey: ["last-activity", row.id],
    queryFn: () => fetchLastActivity(row.id),
    staleTime: 60_000,
  });
  const photo = useQuery({
    queryKey: ["photo", row.id, row.profile?.avatar_url],
    queryFn: () => fetchCandidatePhotoUrl(row.id, row.profile?.avatar_url ?? null),
    staleTime: 300_000,
  });
  const navigate = useNavigate();

  const last = lastAct.data ?? row.created_at;
  const statusKey = row.status;
  const statusTone = STATUS_TONE[statusKey] ?? "bg-secondary text-secondary-foreground";

  return (
    <tr
      className="border-t hover:bg-secondary/30 cursor-pointer"
      role="link"
      tabIndex={0}
      aria-label={`Open ${row.profile?.full_name ?? "candidate"} workspace`}
      onClick={() => navigate({ to: "/candidates/$candidateId", params: { candidateId: row.id } })}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate({ to: "/candidates/$candidateId", params: { candidateId: row.id } }); } }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            {photo.data && <AvatarImage src={photo.data} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials(row.profile?.full_name, row.profile?.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-medium truncate hover:text-primary">
              {row.profile?.full_name ?? "Unnamed"}
            </div>
            <div className="text-xs text-muted-foreground truncate">{row.profile?.email}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge className={`${statusTone} border-0`}>{STATUS_LABEL[statusKey] ?? statusKey}</Badge>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {row.recruiter?.profile?.full_name ?? <span className="italic">Unassigned</span>}
      </td>
      <td className="px-4 py-3">
        {enrollment ? (
          <div>
            <div className="font-medium truncate max-w-[200px]">{enrollment.course?.title ?? "Course"}</div>
            <div className="text-xs text-muted-foreground capitalize">
              {(enrollment.status ?? "enrolled").replace(/_/g, " ")}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground italic">Not enrolled</span>
        )}
      </td>
      <td className="px-4 py-3 w-[140px]">
        {!enrollment ? (
          <span className="text-muted-foreground">—</span>
        ) : progress.isLoading ? (
          <Skeleton className="h-2 w-24" />
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.max(0, progress.data ?? 0))}%` }}
              />
            </div>
            <span className="text-xs tabular-nums w-9 text-right">
              {progress.data != null ? `${Math.round(progress.data)}%` : "—"}
            </span>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {(() => {
          const cs = row.years_customer_service_experience;
          const vet = row.years_veterinary_experience;
          if (cs == null && vet == null) return "—";
          const parts: string[] = [];
          if (cs != null) parts.push(`CS: ${cs}y`);
          if (vet != null) parts.push(`Vet: ${vet}y`);
          return parts.join(" · ");
        })()}
      </td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
        {format(new Date(row.created_at), "MMM d, yyyy")}
      </td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
        {last ? format(new Date(last), "MMM d, yyyy") : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onPreview(); }}>
          <FileText className="h-4 w-4 mr-1" /> Files
        </Button>
      </td>
    </tr>
  );
}
