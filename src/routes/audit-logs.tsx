import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";
import { fetchAuditLogs } from "@/lib/crm-queries";
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
      { title: "Audit logs | Candidate Review System" },
      { name: "description", content: "Admin-only record of changes made across the candidate review system." },
      { property: "og:title", content: "Audit logs | ScaleSource" },
      { property: "og:description", content: "Admin-only change history for the dashboard." },
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
    queryKey: ["audit-logs"],
    queryFn: () => fetchAuditLogs(),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <AppShell title="Audit logs">
        <p className="text-sm text-muted-foreground">Only admins can view the audit log.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Audit logs" description="Recent changes across the system">
      {isLoading && <p className="text-sm text-muted-foreground">Loading logs…</p>}
      <div className="overflow-x-auto rounded-2xl border bg-card">
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
