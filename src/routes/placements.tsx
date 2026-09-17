import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { fetchAllPlacements, type PlacementListRow } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/placements")({
  ssr: false,
  component: PlacementsPage,
});

const STATUS_TONE: Record<string, string> = {
  active: "bg-primary/15 text-primary",
  completed: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success-foreground)]",
  terminated: "bg-destructive/15 text-destructive",
};

function PlacementsPage() {
  const placements = useQuery({
    queryKey: ["placements", "all"],
    queryFn: fetchAllPlacements,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    let rows: PlacementListRow[] = placements.data ?? [];
    if (status !== "all") rows = rows.filter((r) => (r.status ?? "") === status);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        return (
          (r.candidate_name ?? "").toLowerCase().includes(q) ||
          (r.client_name ?? "").toLowerCase().includes(q) ||
          (r.position_title ?? "").toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [placements.data, search, status]);

  return (
    <AppShell title="Placements">
      <div className="space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Placements</h2>
            <p className="text-sm text-muted-foreground">
              {placements.data ? `${placements.data.length} total` : "Loading…"}
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={placements.isFetching} onClick={async () => { await placements.refetch(); toast.success("Refreshed"); }}>
            <RefreshCw className={`h-4 w-4 mr-2 ${placements.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search candidate, client or position…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          {placements.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : placements.isError ? (
            <div className="p-8 text-center text-sm text-destructive space-y-3">
              <div>Failed to load placements. {(placements.error as Error)?.message}</div>
              <Button size="sm" variant="outline" onClick={() => placements.refetch()}>
                Retry
              </Button>
            </div>
          ) : !filtered.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-muted-foreground/60" />
              {placements.data?.length
                ? "No placements match your filters."
                : "No placements recorded yet."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">Candidate</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Position</th>
                    <th className="px-4 py-3 font-medium">Placement date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const tone =
                      STATUS_TONE[r.status ?? ""] ?? "bg-secondary text-secondary-foreground";
                    const go = () =>
                      navigate({
                        to: "/candidates/$candidateId",
                        params: { candidateId: r.candidate_id },
                      });
                    return (
                      <tr
                        key={r.id}
                        className="border-t hover:bg-secondary/30 cursor-pointer"
                        role="link"
                        tabIndex={0}
                        aria-label={`Open workspace for ${r.candidate_name ?? "candidate"}`}
                        onClick={go}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            go();
                          }
                        }}
                      >
                        <td className="px-4 py-3 font-medium">
                          {r.candidate_name ?? <span className="italic text-muted-foreground">Unknown</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.client_name ?? <span className="italic">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3">
                          {r.position_title ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {r.placement_date
                            ? format(new Date(r.placement_date), "MMM d, yyyy")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`${tone} border-0 capitalize`}>
                            {r.status ?? "unknown"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
