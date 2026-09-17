import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { fetchAuditLogs, fetchMyAuditLogs } from "@/lib/crm-queries";
import { Badge } from "@/components/ui/badge";
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
      {isLoading && <p className="text-sm text-muted-foreground">Loading logs…</p>}
      <div className="overflow-x-auto card-amber rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-sm">{l.userName || "System"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{l.action}</Badge>
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
        <p className="mt-4 text-sm text-muted-foreground">No audit entries yet.</p>
      )}
    </AppShell>
  );
}
