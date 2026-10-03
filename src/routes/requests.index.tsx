import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusCircle, Users, ArrowRight, Sparkles } from "lucide-react";
import { REQUEST_STATUS_LABELS, REQUEST_PRIORITY_LABELS, requestStatusTone, requestPriorityTone, formatDate } from "@/lib/matches";
import { ENGAGEMENT_TYPES } from "@/lib/catalog";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitWords, useEntrance } from "@/lib/motion";

export const Route = createFileRoute("/requests/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "My hiring requests — Candidate Pool" },
      { name: "description", content: "Track every hiring request your company has submitted and review the candidates presented for each one." },
      { property: "og:title", content: "My hiring requests — Candidate Pool" },
      { property: "og:description", content: "Track every hiring request your company has submitted and review the candidates presented for each one." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <RequestsList />
    </AppShell>
  ),
});

interface RequestRow {
  id: string;
  status: string | null;
  source: string | null;
  priority: string | null;
  engagement_type: string | null;
  hires_needed: number | null;
  created_at: string;
  job_roles: { name: string | null } | null;
  candidate_matches: { count: number }[];
}

function RequestsList() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("client_requests")
      .select("id,status,source,priority,engagement_type,hires_needed,created_at,job_roles(name),candidate_matches(count)")
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setRows((data ?? []) as unknown as RequestRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  usePollingRefresh(load, 20000);
  // Entrance runs once when data first arrives; the 20s polling never replays it.
  const scope = useEntrance<HTMLDivElement>([rows === null]);

  return (
    <div ref={scope} className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-medium leading-none tracking-[-0.02em] sm:text-6xl">
            <SplitWords text="My" /> <SplitWords text="requests" className="italic text-primary" />
          </h1>
          <p data-rise className="mt-3 text-sm text-muted-foreground">All hiring requests for your company.</p>
        </div>
        <Button asChild data-rise className="h-11 px-5">
          <Link to="/new-request" search={{}}>
            <PlusCircle className="mr-1.5 h-4 w-4" />
            New request
          </Link>
        </Button>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {rows === null ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[92px] rounded-3xl bg-white/70" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="card-amber rounded-3xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
              <Users className="h-7 w-7" />
            </span>
            <p className="font-display text-3xl font-medium">No requests yet</p>
            <p className="text-sm text-muted-foreground">
              Submit your first hiring request and we&apos;ll start matching candidates.
            </p>
            <Button asChild className="mt-2">
              <Link to="/new-request" search={{}}>New request</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => {
            const count = r.candidate_matches?.[0]?.count ?? 0;
            const engagement =
              ENGAGEMENT_TYPES.find((e) => e.value === r.engagement_type)?.label ?? r.engagement_type;
            return (
              <Link key={r.id} to="/requests/$id" params={{ id: r.id }} data-rise className="group block rounded-3xl">
                <Card className="card-amber rounded-3xl">
                  <CardContent className="flex items-center justify-between gap-4 p-5 sm:p-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display truncate text-2xl font-semibold leading-tight">{r.job_roles?.name ?? "Role"}</h2>
                        <Badge className={requestStatusTone(r.status)} variant="secondary">
                          {REQUEST_STATUS_LABELS[r.status ?? ""] ?? r.status ?? "—"}
                        </Badge>
                        {r.source === "staff_curated" && (
                          <Badge className="bg-primary-soft text-primary" variant="secondary">
                            <Sparkles className="mr-1 h-3 w-3" />
                            Hand-picked
                          </Badge>
                        )}
                        {r.priority && r.priority !== "normal" && (
                          <Badge className={requestPriorityTone(r.priority)} variant="secondary">
                            {REQUEST_PRIORITY_LABELS[r.priority] ?? r.priority}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm tabular-nums text-muted-foreground">
                        {engagement ? `${engagement} · ` : ""}
                        {r.hires_needed ?? 1} hire{(r.hires_needed ?? 1) === 1 ? "" : "s"} ·{" "}
                        {count} candidate{count === 1 ? "" : "s"} presented · submitted{" "}
                        {formatDate(r.created_at)}
                      </p>
                    </div>
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary/[0.06] text-primary transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-1">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
