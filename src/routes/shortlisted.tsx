import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CandidateCard, MATCH_SELECT, type MatchRow } from "@/components/candidate-card";
import { CandidateProfileDialog } from "@/components/candidate-profile-dialog";
import { InterviewRequestDialog } from "@/components/interview-request-dialog";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { displayName, signedPhotoUrl, type MatchStatus } from "@/lib/matches";

export const Route = createFileRoute("/shortlisted")({
  head: () => ({
    meta: [
      { title: "Shortlisted — Candidate Pool" },
      { name: "description", content: "Every candidate you have shortlisted across all of your hiring requests." },
      { property: "og:title", content: "Shortlisted — Candidate Pool" },
      { property: "og:description", content: "Every candidate you have shortlisted across all of your hiring requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <ShortlistedPage />
    </AppShell>
  ),
});

/** Shortlisted and everything after it, but not hired and not rejected. */
const ACTIVE_STATUSES: MatchStatus[] = [
  "shortlisted",
  "interview_requested",
  "interview_confirmed",
  "interview_completed",
  "hire_requested",
  "offer_extended",
];

const ORDER: MatchStatus[] = [
  "interview_completed",
  "hire_requested",
  "offer_extended",
  "interview_confirmed",
  "interview_requested",
  "shortlisted",
];

interface RequestMeta {
  id: string;
  source: string | null;
  job_roles: { name: string | null } | null;
}

function ShortlistedPage() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [requests, setRequests] = useState<Record<string, string>>({});
  const [curatedRequests, setCuratedRequests] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [profileFor, setProfileFor] = useState<MatchRow | null>(null);
  const [interviewFor, setInterviewFor] = useState<MatchRow | null>(null);
  const loadTokenRef = useRef(0);
  /** Stable display order of match ids, captured on first load. */
  const orderRef = useRef<string[] | null>(null);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    setErr(null);
    const [matchRes, reqRes] = await Promise.all([
      supabase.from("candidate_matches").select(MATCH_SELECT).in("status", ACTIVE_STATUSES),
      supabase.from("client_requests").select("id,job_roles(name),source"),
    ]);

    if (reqRes.data) {
      const map: Record<string, string> = {};
      const curated: string[] = [];
      for (const r of reqRes.data as unknown as RequestMeta[]) {
        map[r.id] = r.job_roles?.name ?? "Hiring request";
        if (r.source === "staff_curated") curated.push(r.id);
      }
      setRequests(map);
      setCuratedRequests(new Set(curated));
    }

    if (matchRes.error) {
      if (loadTokenRef.current !== token) return;
      setErr(matchRes.error.message);
      setMatches([]);
      return;
    }

    const raw = (matchRes.data ?? []) as unknown as MatchRow[];

    let list: MatchRow[];
    if (!orderRef.current) {
      // First load: sort by status/score and capture that order.
      list = raw.slice().sort((a, b) => {
        const rank = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
        if (rank !== 0) return rank;
        return (b.match_score ?? 0) - (a.match_score ?? 0);
      });
      orderRef.current = list.map((m) => m.id);
    } else {
      // Subsequent loads: keep every card in its captured slot so the grid never reshuffles.
      const stored = orderRef.current;
      const fresh = raw.filter((m) => !stored.includes(m.id));
      stored.push(...fresh.map((m) => m.id));
      const byId = new Map(raw.map((m) => [m.id, m]));
      list = stored.map((mid) => byId.get(mid)).filter((m): m is MatchRow => !!m);
    }

    if (loadTokenRef.current !== token) return;
    setMatches(list);

    const entries = await Promise.all(
      list.map(async (m) => [m.id, await signedPhotoUrl(m.candidate_pool_profile?.profile_photo_path)] as const)
    );
    if (loadTokenRef.current !== token) return;
    setPhotos(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requestIds = useMemo(
    () => Array.from(new Set((matches ?? []).map((m) => m.client_request_id))),
    [matches]
  );

  const visible = (matches ?? []).filter((m) => filter === "all" || m.client_request_id === filter);

  async function callRpc(
    fn: "client_shortlist_candidate" | "client_request_hire",
    matchId: string,
    success: string
  ) {
    setActingId(matchId);
    const { error } = await supabase.rpc(fn, { p_match_id: matchId });
    if (error) {
      setActingId(null);
      toast.error(error.message);
      return;
    }
    toast.success(success);
    await load();
    setActingId(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shortlisted candidates</h1>
        <p className="text-sm text-muted-foreground">
          Everyone you&apos;ve moved forward across all your hiring requests, up until they&apos;re hired or ruled out.
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {requestIds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
            All requests
          </Button>
          {requestIds.map((rid) => (
            <Button
              key={rid}
              variant={filter === rid ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(rid)}
            >
              {requests[rid] ?? "Hiring request"}
            </Button>
          ))}
        </div>
      )}

      {matches === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Star className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">You haven&apos;t shortlisted anyone yet.</p>
            <p className="text-sm text-muted-foreground">
              Star a candidate from one of your requests to add them here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((m) => (
            <CandidateCard
              key={m.id}
              match={m}
              photoUrl={photos[m.id] ?? null}
              busy={actingId === m.id}
              locked={actingId !== null && actingId !== m.id}
              curated={curatedRequests.has(m.client_request_id)}
              contextLabel={
                <Link to="/requests/$id" params={{ id: m.client_request_id }} className="hover:text-foreground">
                  For: {requests[m.client_request_id] ?? "Hiring request"}
                </Link>
              }
              onViewProfile={() => setProfileFor(m)}
              onShortlist={() => callRpc("client_shortlist_candidate", m.id, "Removed from shortlist")}
              onRequestInterview={() => setInterviewFor(m)}
              onRequestHire={() => callRpc("client_request_hire", m.id, "Hire request sent to ScaleSource")}
              onRejected={() => void load()}
              onInterviewTimeAccepted={() => void load()}
            />
          ))}
        </div>
      )}

      <CandidateProfileDialog
        candidateId={profileFor?.candidate_id ?? null}
        matchStatus={profileFor?.status ?? null}
        onClose={() => setProfileFor(null)}
      />

      <InterviewRequestDialog
        matchId={interviewFor?.id ?? null}
        candidateName={interviewFor ? displayName(interviewFor.candidate_pool_profile?.full_name, interviewFor.status) : null}
        onClose={() => setInterviewFor(null)}
        onRequested={() => {
          setInterviewFor(null);
          void load();
        }}
      />
    </div>
  );
}
