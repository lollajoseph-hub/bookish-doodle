import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { fetchAuditLogs, fetchMyAuditLogs } from "@/lib/crm-queries";
import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/audit-logs")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Activity log | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Activity log of actions in the ScaleSource Candidate Review Dashboard." },
      { property: "og:title", content: "Activity log | ScaleSource" },
      { property: "og:description", content: "Activity log of actions in the ScaleSource dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs", isAdmin ? "all" : profile?.id],
    queryFn: async () => {
      if (isAdmin) return fetchAuditLogs();
      const rows = await fetchMyAuditLogs(profile!.id);
      return rows.map((l) => ({
        ...l,
        userName: profile?.full_name ?? profile?.email ?? null,
      }));
    },
    enabled: !!profile?.id,
  });

  return (
    <AppShell
      title={isAdmin ? "Activity Log" : "My Activity"}
      description={isAdmin ? "Recent changes across the system" : "Your recent actions in the system"}
    >
      {isLoading && (
        <div className="mb-4 space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-14 rounded-3xl bg-white/70" />
          <Skeleton className="h-14 rounded-3xl bg-white/70" />
          <Skeleton className="h-14 rounded-3xl bg-white/70" />
        </div>
      )}
      <div className="card-amber overflow-x-auto rounded-3xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">When</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Who</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Action</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {new Date(l.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-sm">{l.userName || "System"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="h-6 rounded-full border-transparent bg-primary-soft text-[11.5px] font-semibold text-primary">{l.action}</Badge>
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
      {!isLoading && !logs.length && (
        <div className="card-amber mt-4 flex flex-col items-center gap-4 rounded-3xl border-dashed px-6 py-14 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
            <Activity className="h-7 w-7" />
          </div>
          <p className="font-display text-3xl font-medium">No audit entries yet.</p>
        </div>
      )}
    </AppShell>
  );
}
