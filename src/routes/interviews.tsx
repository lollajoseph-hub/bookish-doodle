import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, Video, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/interviews")({
  head: () => ({ meta: [{ title: "Interviews — Candidate Pool" }] }),
  component: () => (
    <AppShell>
      <InterviewsPage />
    </AppShell>
  ),
});

interface InterviewRow {
  match_id: string;
  status: string | null;
  client_status: string | null;
  candidate_name: string | null;
  role_title: string | null;
  company_name: string | null;
  interview_scheduled_at: string | null;
  interview_timezone: string | null;
  interview_mode: string | null;
  interview_confirmed_at: string | null;
  meet_url: string | null;
}

function statusMeta(cs: string | null | undefined): { label: string; tone: string } {
  switch ((cs ?? "").toLowerCase()) {
    case "interview_confirmed":
      return { label: "Interview confirmed", tone: "bg-emerald-100 text-emerald-700" };
    case "scalesource_reviewing":
      return { label: "ScaleSource reviewing", tone: "bg-sky-100 text-sky-700" };
    case "scalesource_reschedule_proposed":
      return { label: "Reschedule proposed", tone: "bg-amber-100 text-amber-700" };
    case "interview_completed":
      return { label: "Completed", tone: "bg-slate-100 text-slate-700" };
    case "scalesource_preparing_offer":
      return { label: "Preparing offer", tone: "bg-emerald-100 text-emerald-700" };
    case "candidate_declined":
      return { label: "Candidate declined", tone: "bg-rose-100 text-rose-700" };
    default:
      return { label: cs ?? "—", tone: "bg-slate-100 text-slate-700" };
  }
}

function formatWhen(iso: string | null, tz: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const timeZone = tz || undefined;
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function InterviewsPage() {
  const [rows, setRows] = useState<InterviewRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_clinic_interviews").then(({ data, error }) => {
      if (error) {
        setErr(error.message);
        setRows([]);
        return;
      }
      const list = (data ?? []) as InterviewRow[];
      list.sort((a, b) => {
        const ta = a.interview_scheduled_at ? new Date(a.interview_scheduled_at).getTime() : Infinity;
        const tb = b.interview_scheduled_at ? new Date(b.interview_scheduled_at).getTime() : Infinity;
        return ta - tb;
      });
      setRows(list);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Interviews</h1>
        <p className="text-sm text-muted-foreground">
          All scheduled and past interviews across your hiring requests.
        </p>
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
            <CalendarClock className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No interviews scheduled yet.</p>
            <p className="text-sm text-muted-foreground">
              Interviews you schedule from a request will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => {
            const meta = statusMeta(r.client_status);
            const canJoin = ["interview_confirmed", "interview_completed"].includes((r.client_status ?? "").toLowerCase()) && !!r.meet_url;
            return (
              <Card key={r.match_id} className="rounded-2xl">
                <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium">{r.candidate_name ?? "Candidate"}</h3>
                      <Badge variant="secondary" className={meta.tone}>
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {r.role_title ?? "—"}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/80">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                        {formatWhen(r.interview_scheduled_at, r.interview_timezone)}
                      </span>
                      {r.interview_mode && (
                        <span className="inline-flex items-center gap-1.5 capitalize">
                          <Video className="h-4 w-4 text-muted-foreground" />
                          {r.interview_mode}
                        </span>
                      )}
                    </div>
                  </div>
                  {canJoin && (
                    <a
                      href={r.meet_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                    >
                      <Button className="gap-1.5">
                        <Video className="h-4 w-4" />
                        Join Google Meet
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
