import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CandidateCard, MATCH_SELECT, type MatchRow } from "@/components/candidate-card";
import { CandidateProfileDialog } from "@/components/candidate-profile-dialog";
import { InterviewRequestDialog } from "@/components/interview-request-dialog";
import { toast } from "sonner";
import { ArrowLeft, Loader2, UsersRound } from "lucide-react";
import { ENGAGEMENT_TYPES, DAYS_OF_WEEK } from "@/lib/catalog";
import {
  REQUEST_STATUS_LABELS,
  requestStatusTone,
  signedPhotoUrl,
  displayName,
  formatDate,
  type MatchStatus,
} from "@/lib/matches";

export const Route = createFileRoute("/requests/$id")({
  head: () => ({
    meta: [
      { title: "Presented candidates — Candidate Pool" },
      { name: "description", content: "Review the candidates presented for this hiring request: shortlist, request an interview, or request to hire." },
      { property: "og:title", content: "Presented candidates — Candidate Pool" },
      { property: "og:description", content: "Review the candidates presented for this hiring request: shortlist, request an interview, or request to hire." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <RequestDetail />
    </AppShell>
  ),
});

interface RequestHeader {
  id: string;
  status: string | null;
  engagement_type: string | null;
  hours_needed: string | null;
  days_of_week_needed: string[] | null;
  hires_needed: number | null;
  timezone_requirement: string | null;
  years_experience_min: number | null;
  desired_start_date: string | null;
  notes: string | null;
  created_at: string;
  job_roles: { name: string | null } | null;
}

const REQUEST_SELECT =
  "id,status,engagement_type,hours_needed,days_of_week_needed,hires_needed,timezone_requirement,years_experience_min,desired_start_date,notes,created_at,job_roles(name)";

/** Disabled: candidates are only reshuffled from Admin Tools after a request is rejected 4x. */
const SHOW_MORE_CANDIDATES_ENABLED = false;

/** Active matches first, decided ones (hired / not a fit) last. */
const STATUS_ORDER: MatchStatus[] = [
  "interview_completed",
  "hire_requested",
  "interview_confirmed",
  "interview_requested",
  "shortlisted",
  "offer_extended",
  "recommended",
  "hired",
  "rejected",
];

function RequestDetail() {
  const { id } = useParams({ from: "/requests/$id" });
  const [request, setRequest] = useState<RequestHeader | null>(null);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [profileFor, setProfileFor] = useState<MatchRow | null>(null);
  const [interviewFor, setInterviewFor] = useState<MatchRow | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMoreCandidates, setNoMoreCandidates] = useState(false);
  const loadTokenRef = useRef(0);
  /** Stable display order of match ids, captured on first load per request id. */
  const orderRef = useRef<{ requestId: string; order: string[] } | null>(null);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    const [reqRes, matchRes] = await Promise.all([
      supabase.from("client_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle(),
      supabase.from("candidate_matches").select(MATCH_SELECT).eq("client_request_id", id),
    ]);

    if (reqRes.error) setErr(reqRes.error.message);
    else setRequest((reqRes.data as unknown as RequestHeader) ?? null);

    if (matchRes.error) {
      if (loadTokenRef.current !== token) return null;
      setErr(matchRes.error.message);
      setMatches([]);
      return null;
    }

    const raw = (matchRes.data ?? []) as unknown as MatchRow[];

    let list: MatchRow[];
    if (!orderRef.current || orderRef.current.requestId !== id) {
      // First load for this request: sort by status/score and capture that order.
      list = raw.slice().sort((a, b) => {
        const rank = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        if (rank !== 0) return rank;
        return (b.match_score ?? 0) - (a.match_score ?? 0);
      });
      orderRef.current = { requestId: id, order: list.map((m) => m.id) };
    } else {
      // Subsequent loads: keep every card in its captured slot so the grid never reshuffles.
      const stored = orderRef.current.order;
      const fresh = raw.filter((m) => !stored.includes(m.id));
      stored.push(...fresh.map((m) => m.id));
      const byId = new Map(raw.map((m) => [m.id, m]));
      list = stored.map((mid) => byId.get(mid)).filter((m): m is MatchRow => !!m);
    }

    if (loadTokenRef.current !== token) return null;
    setMatches(list);

    const entries = await Promise.all(
      list.map(async (m) => [m.id, await signedPhotoUrl(m.candidate_pool_profile?.profile_photo_path)] as const)
    );
    if (loadTokenRef.current !== token) return null;
    setPhotos(Object.fromEntries(entries));
    return list;
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function showMoreCandidates() {
    const existingIds = new Set((matches ?? []).map((match) => match.id));
    setLoadingMore(true);

    const { error } = await supabase.rpc("rank_and_match", {
      p_request_id: id,
      p_limit: 6,
    });

    if (error) {
      setLoadingMore(false);
      toast.error(error.message);
      return;
    }

    const refreshedMatches = await load();
    setLoadingMore(false);

    if (refreshedMatches && !refreshedMatches.some((match) => !existingIds.has(match.id))) {
      setNoMoreCandidates(true);
    }
  }

  const engagement =
    ENGAGEMENT_TYPES.find((e) => e.value === request?.engagement_type)?.label ?? request?.engagement_type;
  const days = (request?.days_of_week_needed ?? [])
    .map((d) => DAYS_OF_WEEK.find((x) => x.value === d)?.label ?? d)
    .join(", ");

  return (
    <div className="space-y-6">
      <Link to="/requests" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-3.5 w-3.5" /> All requests
      </Link>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,2.4fr)] lg:gap-6 lg:space-y-0 space-y-6">
        <div className="min-w-0 lg:self-start">
          <Card className="card-amber rounded-2xl">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{request?.job_roles?.name ?? "Hiring request"}</h1>
                {request && (
                  <Badge className={requestStatusTone(request.status)} variant="secondary">
                    {REQUEST_STATUS_LABELS[request.status ?? ""] ?? request.status ?? "—"}
                  </Badge>
                )}
              </div>

              {request && (
                <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
                  <Detail label="Engagement" value={engagement} />
                  <Detail label="Hours needed" value={request.hours_needed} />
                  <Detail label="Days needed" value={days || null} />
                  <Detail label="Hires needed" value={String(request.hires_needed ?? 1)} />
                  <Detail label="Minimum experience" value={request.years_experience_min ? `${request.years_experience_min} years` : null} />
                  <Detail label="Desired start" value={formatDate(request.desired_start_date)} />
                  <Detail label="Timezone" value={request.timezone_requirement} />
                  <Detail label="Submitted" value={formatDate(request.created_at)} />
                </dl>
              )}

              {request?.notes && (
                <>
                  <Separator className="my-4" />
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{request.notes}</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div aria-hidden className="hidden lg:block lg:w-px lg:bg-amber" />

        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Presented candidates</h2>
            <p className="text-sm text-muted-foreground">
              Shortlist the people you like, request an interview, or tell us why someone isn&apos;t a fit.
            </p>
          </div>

          {matches === null ? (
            <p className="text-sm text-muted-foreground">Loading candidates…</p>
          ) : matches.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No candidates presented yet — matching is still in progress. We&apos;ll email you when profiles are ready.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {matches.map((m) => (
                  <CandidateCard
                    key={m.id}
                    match={m}
                    photoUrl={photos[m.id] ?? null}
                    busy={actingId === m.id}
                    locked={actingId !== null && actingId !== m.id}
                    onViewProfile={() => setProfileFor(m)}
                    onShortlist={() =>
                      callRpc(
                        "client_shortlist_candidate",
                        m.id,
                        m.status === "shortlisted" ? "Removed from shortlist" : "Added to shortlist"
                      )
                    }
                    onRequestInterview={() => setInterviewFor(m)}
                    onRequestHire={() => callRpc("client_request_hire", m.id, "Hire request sent to ScaleSource")}
              onRejected={() => void load()}
                    onInterviewTimeAccepted={() => void load()}
                  />
                ))}
              </div>

              {SHOW_MORE_CANDIDATES_ENABLED && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  {noMoreCandidates ? (
                    <p className="text-sm text-muted-foreground">No more candidates available right now.</p>
                  ) : (
                    <Button variant="outline" disabled={loadingMore} onClick={showMoreCandidates}>
                      {loadingMore ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <UsersRound className="mr-2 h-4 w-4" />
                      )}
                      {loadingMore ? "Finding candidates…" : "Show more candidates"}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

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

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
