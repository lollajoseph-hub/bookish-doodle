import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CandidateProfileDialog } from "@/components/candidate-profile-dialog";
import { MatchStatusIcon, statusTone, MATCH_SELECT, type MatchRow } from "@/components/candidate-card";
import { toast } from "sonner";
import { CalendarClock, Clock, ExternalLink, Loader2, UserSearch, Video } from "lucide-react";
import {
  MATCH_STATUS_LABELS,
  displayName,
  formatDateTime,
  signedPhotoUrl,
  type MatchStatus,
} from "@/lib/matches";

export const Route = createFileRoute("/interviews")({
  head: () => ({
    meta: [
      { title: "Interviews — Candidate Pool" },
      { name: "description", content: "Every interview requested, scheduled or completed across your hiring requests." },
      { property: "og:title", content: "Interviews — Candidate Pool" },
      { property: "og:description", content: "Every interview requested, scheduled or completed across your hiring requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <InterviewsPage />
    </AppShell>
  ),
});

const INTERVIEW_STATUSES: MatchStatus[] = [
  "interview_requested",
  "interview_confirmed",
  "interview_completed",
];

const ORDER: MatchStatus[] = ["interview_confirmed", "interview_requested", "interview_completed"];

interface RequestMeta {
  id: string;
  job_roles: { name: string | null } | null;
}

function InterviewsPage() {
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [requests, setRequests] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [profileFor, setProfileFor] = useState<MatchRow | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const [matchRes, reqRes] = await Promise.all([
      supabase.from("candidate_matches").select(MATCH_SELECT).in("status", INTERVIEW_STATUSES),
      supabase.from("client_requests").select("id,job_roles(name)"),
    ]);

    if (reqRes.data) {
      const map: Record<string, string> = {};
      for (const r of reqRes.data as unknown as RequestMeta[]) {
        map[r.id] = r.job_roles?.name ?? "Hiring request";
      }
      setRequests(map);
    }

    if (matchRes.error) {
      setErr(matchRes.error.message);
      setRows([]);
      return;
    }

    const list = ((matchRes.data ?? []) as unknown as MatchRow[]).slice().sort((a, b) => {
      const rank = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
      if (rank !== 0) return rank;
       const aTime = a.interview_scheduled_at ?? a.interview_proposed_at;
       const bTime = b.interview_scheduled_at ?? b.interview_proposed_at;
       const ta = aTime ? new Date(aTime).getTime() : Infinity;
       const tb = bTime ? new Date(bTime).getTime() : Infinity;
      return ta - tb;
    });
    setRows(list);

    const entries = await Promise.all(
      list.map(async (m) => [m.id, await signedPhotoUrl(m.candidate_pool_profile?.profile_photo_path)] as const)
    );
    setPhotos(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestHire(matchId: string) {
    setActingId(matchId);
    const { error } = await supabase.rpc("request_to_hire", { p_match_id: matchId });
    setActingId(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Hire request sent to ScaleSource");
      void load();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Interviews</h1>
        <p className="text-sm text-muted-foreground">
          Every interview requested, scheduled or already held across your hiring requests.
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
            <p className="font-medium">No interviews yet.</p>
            <p className="text-sm text-muted-foreground">
              Request an interview from a candidate&apos;s card and it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((m) => {
            const p = m.candidate_pool_profile;
            const name = displayName(p?.full_name, m.status);
            const when = formatDateTime(m.interview_scheduled_at);
            const proposed = formatDateTime(m.interview_proposed_at);
            const photo = photos[m.id] ?? null;
            return (
              <Card key={m.id} className="card-amber rounded-2xl">
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      {photo ? (
                        <img src={photo} alt="" className="h-14 w-14 flex-none rounded-full object-cover ring-2 ring-primary/15" />
                      ) : (
                        <div className="grid h-14 w-14 flex-none place-items-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
                          {name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <div className="min-w-0">
                            {m.status !== "hired" && (
                              <p className="text-sm italic leading-none text-muted-foreground">Meet</p>
                            )}
                            <h3 className="truncate font-semibold leading-tight">{name}</h3>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(m.status)}`}
                          >
                            <MatchStatusIcon status={m.status} />
                            {MATCH_STATUS_LABELS[m.status] ?? m.status}
                          </span>
                        </div>
                        {p?.headline && <p className="truncate text-xs text-muted-foreground">{p.headline}</p>}
                        <Link
                          to="/requests/$id"
                          params={{ id: m.client_request_id }}
                          className="block text-xs text-muted-foreground hover:text-foreground"
                        >
                          For: {requests[m.client_request_id] ?? "Hiring request"}
                        </Link>
                      </div>
                    </div>

                    <div className="flex flex-none flex-wrap items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setProfileFor(m)}>
                        <UserSearch className="mr-1.5 h-4 w-4" />
                        View full profile
                      </Button>
                      {m.status === "interview_confirmed" && m.meet_url && (
                        <Button asChild size="sm">
                          <a href={m.meet_url} target="_blank" rel="noreferrer">
                            <Video className="mr-1.5 h-4 w-4" />
                            Join Google Meet
                            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>

                  {m.status === "interview_requested" && (
                    <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary">
                      <Clock className="h-4 w-4 flex-none" />
                      {proposed
                        ? `You proposed ${proposed} — waiting for ScaleSource to confirm.`
                        : "Interview requested — waiting for ScaleSource to confirm."}
                    </div>
                  )}

                  {(m.status === "interview_confirmed" || m.status === "interview_completed") && (
                    <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2">
                      <p className="flex items-center gap-2 text-sm font-medium text-primary">
                        <CalendarClock className="h-4 w-4 flex-none" />
                        {when
                          ? m.status === "interview_completed"
                            ? `Interview held on ${when}`
                            : `Interview on ${when}`
                          : MATCH_STATUS_LABELS[m.status]}
                      </p>
                      {m.status === "interview_completed" && m.interview_notes && (
                        <p className="whitespace-pre-line text-sm text-muted-foreground">{m.interview_notes}</p>
                      )}
                    </div>
                  )}

                  {m.status === "interview_completed" && (
                    <Button
                      className="w-full sm:w-auto"
                      disabled={actingId === m.id}
                      onClick={() => requestHire(m.id)}
                    >
                      {actingId === m.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                      Request to hire
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CandidateProfileDialog
        candidateId={profileFor?.candidate_id ?? null}
        matchStatus={profileFor?.status ?? null}
        onClose={() => setProfileFor(null)}
      />
    </div>
  );
}
