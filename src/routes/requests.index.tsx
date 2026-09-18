import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusCircle, Users, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/requests/")({
  head: () => ({ meta: [{ title: "My Requests — Candidate Pool" }] }),
  component: () => (
    <AppShell>
      <Requests />
    </AppShell>
  ),
});

interface Row {
  id: string;
  title: string | null;
  role_needed: string | null;
  status: string | null;
  headcount: number | null;
  created_at: string;
}

function statusTone(s: string | null) {
  switch ((s ?? "").toLowerCase()) {
    case "matched":
    case "completed":
      return "bg-emerald-100 text-emerald-700";
    case "in_progress":
    case "matching":
      return "bg-amber-100 text-amber-700";
    case "submitted":
    case "pending":
      return "bg-sky-100 text-sky-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function Requests() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("client_requests")
      .select("id,title,role_needed,status,headcount,created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else setRows((data ?? []) as Row[]);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Requests</h1>
          <p className="text-sm text-muted-foreground">All hiring requests for your company.</p>
        </div>
        <Button asChild>
          <Link to="/new-request"><PlusCircle className="mr-1.5 h-4 w-4" />New Request</Link>
        </Button>
      </div>

      {err && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{err}</div>}

      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No requests yet</p>
            <p className="text-sm text-muted-foreground">Submit your first hiring request to start matching.</p>
            <Button asChild className="mt-2"><Link to="/new-request">New Request</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Link key={r.id} to="/requests/$id" params={{ id: r.id }}>
              <Card className="rounded-2xl transition hover:border-primary/40 hover:shadow-sm">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium">{r.title || r.role_needed || "Untitled role"}</h3>
                      <Badge className={statusTone(r.status)} variant="secondary">{r.status ?? "—"}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.role_needed ?? "—"} · {r.headcount ?? 1} candidate{(r.headcount ?? 1) === 1 ? "" : "s"} ·
                      {" "}submitted {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
