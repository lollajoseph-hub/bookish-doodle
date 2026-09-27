import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusCircle, Users, ArrowRight, Sparkles } from "lucide-react";
import { REQUEST_STATUS_LABELS, requestStatusTone, formatDate } from "@/lib/matches";
import { ENGAGEMENT_TYPES } from "@/lib/catalog";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";

export const Route = createFileRoute("/requests/")({
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
      .select("id,status,source,engagement_type,hires_needed,created_at,job_roles(name),candidate_matches(count)")
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setRows((data ?? []) as unknown as RequestRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  usePollingRefresh(load, 20000);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My requests</h1>
          <p className="text-sm text-muted-foreground">All hiring requests for your company.</p>
        </div>
        <Button asChild>
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
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No requests yet</p>
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
              <Link key={r.id} to="/requests/$id" params={{ id: r.id }} className="block">
                <Card className="card-amber rounded-2xl transition hover:shadow-sm">
                  <CardContent className="flex items-center justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-medium">{r.job_roles?.name ?? "Role"}</h2>
                        <Badge className={requestStatusTone(r.status)} variant="secondary">
                          {REQUEST_STATUS_LABELS[r.status ?? ""] ?? r.status ?? "—"}
                        </Badge>
                        {r.source === "staff_curated" && (
                          <Badge className="bg-primary-soft text-primary" variant="secondary">
                            <Sparkles className="mr-1 h-3 w-3" />
                            Hand-picked
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {engagement ? `${engagement} · ` : ""}
                        {r.hires_needed ?? 1} hire{(r.hires_needed ?? 1) === 1 ? "" : "s"} ·{" "}
                        {count} candidate{count === 1 ? "" : "s"} presented · submitted{" "}
                        {formatDate(r.created_at)}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 flex-none text-muted-foreground" />
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
