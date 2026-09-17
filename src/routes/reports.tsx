import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { fetchCandidates } from "@/lib/queries";
import { fetchAllMatches, fetchClientRequests, fetchPlacements, labelize } from "@/lib/crm-queries";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reports")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reports | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Summary of candidates, requests, matches and placements." },
      { property: "og:title", content: "Reports | ScaleSource" },
      { property: "og:description", content: "Exportable summary of ScaleSource pipeline activity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function tally(values: (string | null | undefined)[]) {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = v ?? "unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function downloadCsv(name: string, rows: [string, number][]) {
  const csv = ["Label,Count", ...rows.map(([k, v]) => `"${labelize(k)}",${v}`)].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportCard({ title, rows }: { title: string; rows: [string, number][] }) {
  const total = rows.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => downloadCsv(title.toLowerCase().replace(/\s+/g, "-"), rows)}
        >
          <Download className="mr-1 h-3.5 w-3.5" /> CSV
        </Button>
      </div>
      <div className="space-y-3">
        {rows.map(([label, count]) => (
          <div key={label}>
            <div className="flex items-center justify-between text-sm">
              <span>{labelize(label)}</span>
              <span className="text-muted-foreground">{count}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${(count / total) * 100}%` }} />
            </div>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-muted-foreground">No data yet.</p>}
      </div>
    </div>
  );
}

function ReportsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
    enabled: isAdmin,
  });
  const { data: requests = [] } = useQuery({
    queryKey: ["client-requests"],
    queryFn: fetchClientRequests,
    enabled: isAdmin,
  });
  const { data: matches = [] } = useQuery({
    queryKey: ["matches", "all"],
    queryFn: fetchAllMatches,
    enabled: isAdmin,
  });
  const { data: placements = [] } = useQuery({
    queryKey: ["placements"],
    queryFn: fetchPlacements,
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <AppShell title="Reports">
        <p className="text-sm text-muted-foreground">Only admins can view reports.</p>
      </AppShell>
    );
  }

  const now = new Date();
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const thisMonth = monthKey(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = monthKey(lastMonthDate);
  const placementMonth = (p: { billing_start_date: string | null; created_at: string }) =>
    monthKey(new Date(p.billing_start_date ?? p.created_at));
  const placedThisMonth = placements.filter((p) => placementMonth(p) === thisMonth).length;
  const placedLastMonth = placements.filter((p) => placementMonth(p) === lastMonth).length;

  return (
    <AppShell title="Reports" description="Pipeline summary you can print or export">
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Placements this month</div>
          <div className="mt-1 text-2xl font-semibold">{placedThisMonth}</div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Placements last month</div>
          <div className="mt-1 text-2xl font-semibold">{placedLastMonth}</div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total candidates</div>
          <div className="mt-1 text-2xl font-semibold">{candidates.length}</div>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total requests</div>
          <div className="mt-1 text-2xl font-semibold">{requests.length}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportCard title="Candidates by status" rows={tally(candidates.map((c) => c.status))} />
        <ReportCard title="Requests by status" rows={tally(requests.map((r) => r.status))} />
        <ReportCard title="Matches by stage" rows={tally(matches.map((m) => m.status))} />
      </div>
    </AppShell>
  );
}
