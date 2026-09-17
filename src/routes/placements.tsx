import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { fetchPlacements, labelize } from "@/lib/crm-queries";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const TABS = ["all", "active", "completed", "terminated"] as const;

export const Route = createFileRoute("/placements")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Placements | Candidate Review System" },
      { name: "description", content: "Active and completed candidate placements with clients." },
      { property: "og:title", content: "Placements | ScaleSource" },
      { property: "og:description", content: "Track placed candidates, seats and billing start dates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlacementsPage,
});

function PlacementsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [search, setSearch] = useState("");
  const { data: placements = [], isLoading } = useQuery({
    queryKey: ["placements"],
    queryFn: fetchPlacements,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return placements.filter((p) => {
      if (tab !== "all" && p.status !== tab) return false;
      if (!q) return true;
      return (
        (p.candidateName ?? "").toLowerCase().includes(q) ||
        (p.clientName ?? "").toLowerCase().includes(q)
      );
    });
  }, [placements, tab, search]);

  return (
    <AppShell title="Placements" description="Candidates placed with clients">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
              tab === t
                ? "border-amber bg-amber/15 text-amber-foreground shadow-sm"
                : "bg-card hover:border-primary/50"
            }`}
          >
            {t === "all" ? "All" : labelize(t)}
          </button>
        ))}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by candidate or client…"
          className="ml-auto max-w-xs"
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading placements…</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft">
                  <Briefcase className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Link
                    to="/candidates/$candidateId"
                    params={{ candidateId: p.candidate_id }}
                    className="font-semibold text-primary hover:underline"
                  >
                    {p.candidateName || "Candidate"}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {p.seat_title || p.roleName || "Seat"} ·{" "}
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: p.client_id }}
                      className="hover:underline"
                    >
                      {p.clientName}
                    </Link>
                  </div>
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  p.status === "active"
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : p.status === "terminated"
                      ? "border-border bg-muted text-muted-foreground"
                      : "border-primary/30 bg-primary-soft text-primary"
                }
              >
                {labelize(p.status)}
              </Badge>
            </div>
            <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <span>Billing start: {p.billing_start_date || "—"}</span>
              <span>Monthly rate: {p.monthly_rate != null ? p.monthly_rate : "—"}</span>
              <span>Guarantee ends: {p.guarantee_window_expires || "—"}</span>
            </div>
            {p.notes && <p className="mt-2 text-sm">{p.notes}</p>}
          </div>
        ))}
      </div>
      {!isLoading && !filtered.length && (
        <p className="text-sm text-muted-foreground">No placements in this view.</p>
      )}
    </AppShell>
  );
}
