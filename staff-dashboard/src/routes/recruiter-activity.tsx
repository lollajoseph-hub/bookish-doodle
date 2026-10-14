import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { fetchAuditLogsWithRole } from "@/lib/crm-queries";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/recruiter-activity")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Recruiter activity | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Recent actions taken by ScaleSource recruiters." },
      { property: "og:title", content: "Recruiter activity | ScaleSource" },
      { property: "og:description", content: "Track what recruiters have been doing in the system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecruiterActivityPage,
});

function RecruiterActivityPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs", "with-role"],
    queryFn: () => fetchAuditLogsWithRole(300),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <AppShell title="Recruiter activity">
        <p className="text-sm text-muted-foreground">Only admins can view recruiter activity.</p>
      </AppShell>
    );
  }

  const recruiterLogs = logs.filter((l) => l.userRole === "recruiter");

  return (
    <AppShell title="Recruiter activity" description="What recruiters have been doing">
      {isLoading && (
        <div className="mb-4 space-y-2" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[52px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[52px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[52px] rounded-3xl bg-white/70" />
        </div>
      )}
      <div className="card-amber overflow-x-auto rounded-3xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">When</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recruiter</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Action</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recruiterLogs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-sm font-medium">{l.userName ?? "Recruiter"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="h-6 rounded-full border-transparent px-2.5 text-[11.5px] font-semibold bg-primary-soft text-primary">{l.action}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {l.entity_type}
                  {l.entity_id ? ` · ${l.entity_id.slice(0, 8)}…` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!isLoading && !recruiterLogs.length && (
        <p className="mt-4 text-sm text-muted-foreground">No recruiter activity recorded yet.</p>
      )}
    </AppShell>
  );
}
