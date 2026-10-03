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
import { usePollingRefresh } from "@/hooks/use-polling-refresh";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitWords, useEntrance } from "@/lib/motion";

export const Route = createFileRoute("/shortlisted")({
  ssr: false,
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

/** Only still-pending shortlists live here; anything past "shortlisted" belongs to Interviews. */
const ACTIVE_STATUSES: MatchStatus[] = ["shortlisted"];

interface RequestMeta {
  id: string;
  source: string | null;
  job_roles: { name: string | null } | null;
}

function ShortlistedPage() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  // Animates once when data first arrives; the 20s polling never replays it.
  const scope = useEntrance<HTMLDivElement>([matches === null]);
  const [requests, setRequests] = useState<Record<string, string>>({});
  const [curatedRequests, setCuratedRequests] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [requestSkills, setRequestSkills] = useState<Record<string, string[]>>({});
  const [candidateSkillsMap, setCandidateSkillsMap] = useState<Record<string, string[]>>({});
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
    const matchedRequestIds = [...new Set(raw.map((match) => match.client_request_id))];
    const candidateIds = [...new Set(raw.map((match) => match.candidate_id))];
    const [requestSkillsRes, candidateSkillsRes] = await Promise.all([
      matchedRequestIds.length
        ? supabase.from("client_request_skills").select("request_id,skills(name)").eq("is_required", true).in("request_id", matchedRequestIds)
        : Promise.resolve({ data: [], error: null }),
      candidateIds.length
        ? supabase.from("candidate_skills").select("candidate_id,skills(name)").in("candidate_id", candidateIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (requestSkillsRes.error || candidateSkillsRes.error) {
      if (loadTokenRef.current !== token) return;
      setErr(requestSkillsRes.error?.message ?? candidateSkillsRes.error?.message ?? "Unable to load skills");
    }

    const byRequest: Record<string, string[]> = {};
    for (const row of requestSkillsRes.data ?? []) {
      const requestId = row.request_id;
      const skillName = (row.skills as unknown as { name: string | null } | null)?.name?.trim();
      if (!requestId || !skillName) continue;
      byRequest[requestId] = [...(byRequest[requestId] ?? []), skillName];
    }
    const byCandidate: Record<string, string[]> = {};
    for (const row of candidateSkillsRes.data ?? []) {
      const candidateId = row.candidate_id;
      const skillName = (row.skills as unknown as { name: string | null } | null)?.name?.trim();
      if (!candidateId || !skillName) continue;
      byCandidate[candidateId] = [...(byCandidate[candidateId] ?? []), skillName];
    }

    let list: MatchRow[];
    if (!orderRef.current) {
      // First load: sort by match score and capture that order.
      list = raw.slice().sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
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
    setRequestSkills(byRequest);
    setCandidateSkillsMap(byCandidate);
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

  usePollingRefresh(load, 20000);

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
    <div ref={scope} className="space-y-8">
      <div>
        <h1 className="font-display text-5xl font-medium leading-none tracking-[-0.02em] sm:text-6xl">
          <SplitWords text="Shortlisted" /> <SplitWords text="candidates" className="italic text-primary" />
        </h1>
        <p data-rise className="mt-3 text-sm text-muted-foreground">
          Everyone you&apos;ve shortlisted across your hiring requests.
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {requestIds.length > 1 && (
        <div data-rise className="flex flex-wrap gap-2" role="group" aria-label="Filter by request">
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" aria-pressed={filter === "all"} className="h-9 px-4" onClick={() => setFilter("all")}>
            All requests
          </Button>
          {requestIds.map((rid) => (
            <Button
              key={rid}
              variant={filter === rid ? "default" : "outline"}
              size="sm"
              aria-pressed={filter === rid}
              className="h-9 px-4"
              onClick={() => setFilter(rid)}
            >
              {requests[rid] ?? "Hiring request"}
            </Button>
          ))}
        </div>
      )}

      {matches === null ? (
        <div className="grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[340px] rounded-3xl bg-white/70" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="card-amber rounded-3xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
              <Star className="h-7 w-7" />
            </span>
            <p className="font-display text-3xl font-medium">You haven&apos;t shortlisted anyone yet.</p>
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
              requiredSkills={requestSkills[m.client_request_id] ?? []}
              candidateSkills={candidateSkillsMap[m.candidate_id] ?? []}
              contextLabel={
                <Link to="/requests/$id" params={{ id: m.client_request_id }} className="rounded font-semibold text-primary hover:underline hover:underline-offset-4">
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
        matchId={profileFor?.id ?? null}
        matchStatus={profileFor?.status ?? null}
        matchReason={profileFor?.match_reason ?? null}
        requiredSkills={profileFor ? (requestSkills[profileFor.client_request_id] ?? []) : []}
        candidateSkills={profileFor ? (candidateSkillsMap[profileFor.candidate_id] ?? []) : []}
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
