import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Database, HardDrive } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { fetchAuditLogs, fetchSystemStats } from "@/lib/crm-queries";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/system-monitor")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "System monitor | Candidate Review System" },
      { name: "description", content: "Row counts, stored file usage and the latest system activity." },
      { property: "og:title", content: "System monitor | Candidate Review System" },
      { property: "og:description", content: "A lightweight health snapshot of the dashboard data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SystemMonitorPage,
});

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SystemMonitorPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const { data: stats, isLoading } = useQuery({
    queryKey: ["system-stats"],
    queryFn: fetchSystemStats,
    enabled: isAdmin,
  });
  const { data: logs = [] } = useQuery({
    queryKey: ["audit-logs", "recent"],
    queryFn: () => fetchAuditLogs(15),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <AppShell title="System monitor">
        <p className="text-sm text-muted-foreground">Only admins can view the system monitor.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="System monitor" description="A snapshot of what's stored in the system">
      {isLoading && <p className="text-sm text-muted-foreground">Loading snapshot…</p>}

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Database className="h-4 w-4 text-primary" /> Records
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Candidates" value={stats?.candidates ?? 0} />
          <Stat label="Clients" value={stats?.clients ?? 0} />
          <Stat label="Client requests" value={stats?.requests ?? 0} />
          <Stat label="Matches" value={stats?.matches ?? 0} />
          <Stat label="Placements" value={stats?.placements ?? 0} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <HardDrive className="h-4 w-4 text-primary" /> Stored files
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="Files uploaded" value={stats?.files ?? 0} />
          <Stat label="Storage used" value={formatBytes(stats?.storageBytes ?? 0)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Latest activity</h2>
        <div className="divide-y rounded-2xl border bg-card">
          {logs.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm">{l.userName ?? "System"}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {l.entity_type}
                  {l.entity_id ? ` · ${l.entity_id.slice(0, 8)}…` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary">{l.action}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
          {!logs.length && <p className="px-4 py-6 text-sm text-muted-foreground">No activity yet.</p>}
        </div>
      </section>
    </AppShell>
  );
}
