import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { fetchPlacements, labelize } from "@/lib/crm-queries";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = ["all", "active", "completed", "terminated"] as const;

export const Route = createFileRoute("/placements")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Placements | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Active and completed candidate placements with ScaleSource clients." },
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
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-9 rounded-full px-4 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-200 ${
              tab === t
                ? "bg-primary text-primary-foreground shadow-[0_10px_24px_-14px_rgb(46_16_73/0.7)]"
                : "bg-white/70 text-secondary-foreground shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] backdrop-blur-md hover:bg-white hover:text-primary"
            }`}
          >
            {t === "all" ? "All" : labelize(t)}
          </button>
        ))}
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by candidate or client…"
          className="ml-auto max-w-xs rounded-full"
        />
      </div>

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[150px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[150px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[150px] rounded-3xl bg-white/70" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="card-amber rounded-3xl p-5 transition-[box-shadow,border-color] duration-300 hover:border-[rgb(122_89_163/0.25)] hover:shadow-[0_22px_44px_-24px_rgb(46_16_73/0.5)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft">
                  <Briefcase className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Link
                    to="/candidates/$candidateId"
                    params={{ candidateId: p.candidate_id }}
                    className="font-display text-xl font-semibold leading-tight text-primary hover:underline"
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
                className={`h-6 rounded-full border-transparent text-[11.5px] font-semibold ${
                  p.status === "active"
                    ? "bg-[#e9f2ea] text-[#2f5f35]"
                    : p.status === "terminated"
                      ? "bg-foreground/[0.06] text-secondary-foreground"
                      : "bg-primary-soft text-primary"
                }`}
              >
                {labelize(p.status)}
              </Badge>
            </div>
            <div className="mt-4 grid gap-1 rounded-2xl bg-stone/90 p-3 text-xs tabular-nums text-muted-foreground shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] sm:grid-cols-2">
              <span>Billing start: {p.billing_start_date || "—"}</span>
              <span>Monthly rate: {p.monthly_rate != null ? p.monthly_rate : "—"}</span>
              <span>Guarantee ends: {p.guarantee_window_expires || "—"}</span>
            </div>
            {p.notes && <p className="mt-2 text-sm">{p.notes}</p>}
          </div>
        ))}
      </div>
      {!isLoading && !filtered.length && (
        <div className="card-amber flex flex-col items-center gap-4 rounded-3xl border-dashed px-6 py-14 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
            <Briefcase className="h-7 w-7" />
          </div>
          <p className="font-display text-3xl font-medium">No placements in this view.</p>
        </div>
      )}
    </AppShell>
  );
}
