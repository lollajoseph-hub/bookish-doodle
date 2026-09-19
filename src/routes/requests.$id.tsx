import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RejectCandidateDialog } from "@/components/reject-dialog";
import { CandidateCard, MATCH_SELECT, type MatchRow } from "@/components/candidate-card";
import { CandidateProfileDialog } from "@/components/candidate-profile-dialog";
import { InterviewRequestDialog } from "@/components/interview-request-dialog";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
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

/** Active matches first, decided ones (hired / not a fit) last. */
const STATUS_ORDER: MatchStatus[] = [
  "interview_completed",
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
  const [rejectFor, setRejectFor] = useState<MatchRow | null>(null);
  const [profileFor, setProfileFor] = useState<MatchRow | null>(null);
  const [interviewFor, setInterviewFor] = useState<MatchRow | null>(null);

  const load = useCallback(async () => {
    const [reqRes, matchRes] = await Promise.all([
      supabase.from("client_requests").select(REQUEST_SELECT).eq("id", id).maybeSingle(),
      supabase.from("candidate_matches").select(MATCH_SELECT).eq("client_request_id", id),
    ]);

    if (reqRes.error) setErr(reqRes.error.message);
    else setRequest((reqRes.data as unknown as RequestHeader) ?? null);

    if (matchRes.error) {
      setErr(matchRes.error.message);
      setMatches([]);
      return;
    }

    const list = ((matchRes.data ?? []) as unknown as MatchRow[]).slice().sort((a, b) => {
      const rank = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
      if (rank !== 0) return rank;
      return (b.match_score ?? 0) - (a.match_score ?? 0);
    });
    setMatches(list);

    const entries = await Promise.all(
      list.map(async (m) => [m.id, await signedPhotoUrl(m.candidate_pool_profile?.profile_photo_path)] as const)
    );
    setPhotos(Object.fromEntries(entries));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function callRpc(
    fn: "client_shortlist_candidate" | "request_to_hire",
    matchId: string,
    success: string
  ) {
    setActingId(matchId);
    const { error } = await supabase.rpc(fn, { p_match_id: matchId });
    setActingId(null);
    if (error) toast.error(error.message);
    else {
      toast.success(success);
      void load();
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
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="grid gap-4 lg:grid-cols-2">
          {matches.map((m) => (
            <CandidateCard
              key={m.id}
              match={m}
              photoUrl={photos[m.id] ?? null}
              busy={actingId === m.id}
              onViewProfile={() => setProfileFor(m)}
              onShortlist={() =>
                callRpc(
                  "client_shortlist_candidate",
                  m.id,
                  m.status === "shortlisted" ? "Removed from shortlist" : "Added to shortlist"
                )
              }
              onRequestInterview={() => setInterviewFor(m)}
              onRequestHire={() => callRpc("request_to_hire", m.id, "Hire request sent to ScaleSource")}
              onReject={() => setRejectFor(m)}
            />
          ))}
        </div>
      )}

      <RejectCandidateDialog
        matchId={rejectFor?.id ?? null}
        candidateName={
          rejectFor ? displayName(rejectFor.candidate_pool_profile?.full_name, rejectFor.status) : null
        }
        onClose={() => setRejectFor(null)}
        onRejected={() => {
          setRejectFor(null);
          void load();
        }}
      />

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
