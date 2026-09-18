import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RejectCandidateDialog } from "@/components/reject-dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Star,
  ThumbsDown,
  Video,
} from "lucide-react";
import { ENGAGEMENT_TYPES, DAYS_OF_WEEK } from "@/lib/catalog";
import {
  MATCH_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  requestStatusTone,
  rejectionReasonLabel,
  signedMediaUrl,
  displayName,
  formatDate,
  formatDateTime,
  toStringList,
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

// ----------------------------------------------------------------- types

interface PoolProfile {
  candidate_id: string;
  full_name: string | null;
  headline: string | null;
  country: string | null;
  timezone: string | null;
  weekly_hours_available: number | null;
  preferred_shift: string | null;
  years_experience: number | null;
  earliest_start_date: string | null;
  approved_summary: string | null;
  highlights: unknown;
  skills: unknown;
  primary_role: unknown;
  secondary_roles: unknown;
  profile_photo_path: string | null;
}

interface MatchRow {
  id: string;
  status: MatchStatus;
  interview_scheduled_at: string | null;
  meet_url: string | null;
  interview_notes: string | null;
  rejection_reason: string | null;
  rejection_reason_note: string | null;
  rejected_at: string | null;
  match_score: number | null;
  match_reason: string | null;
  candidate_id: string;
  candidate_pool_profile: PoolProfile | null;
}

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

const MATCH_SELECT =
  "id,status,interview_scheduled_at,meet_url,interview_notes,rejection_reason,rejection_reason_note,rejected_at,match_score,match_reason,candidate_id," +
  "candidate_pool_profile(candidate_id,full_name,headline,country,timezone,weekly_hours_available,preferred_shift,years_experience,earliest_start_date,approved_summary,highlights,skills,primary_role,secondary_roles,profile_photo_path)";

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

// ----------------------------------------------------------------- page

function RequestDetail() {
  const { id } = useParams({ from: "/requests/$id" });
  const [request, setRequest] = useState<RequestHeader | null>(null);
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<MatchRow | null>(null);

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
      list.map(async (m) => [m.id, await signedMediaUrl(m.candidate_pool_profile?.profile_photo_path)] as const)
    );
    setPhotos(Object.fromEntries(entries));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function callRpc(fn: "client_shortlist_candidate" | "client_request_interview" | "request_to_hire", matchId: string, success: string) {
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

      {/* ---------------- request summary ---------------- */}
      <Card className="rounded-2xl">
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
              <p className="text-sm text-muted-foreground whitespace-pre-line">{request.notes}</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------------- candidates ---------------- */}
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
              onShortlist={() =>
                callRpc(
                  "client_shortlist_candidate",
                  m.id,
                  m.status === "shortlisted" ? "Removed from shortlist" : "Added to shortlist"
                )
              }
              onRequestInterview={() => callRpc("client_request_interview", m.id, "Interview requested")}
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

// ----------------------------------------------------------------- card

function CandidateCard({
  match,
  photoUrl,
  busy,
  onShortlist,
  onRequestInterview,
  onRequestHire,
  onReject,
}: {
  match: MatchRow;
  photoUrl: string | null;
  busy: boolean;
  onShortlist: () => void;
  onRequestInterview: () => void;
  onRequestHire: () => void;
  onReject: () => void;
}) {
  const p = match.candidate_pool_profile;
  const status = match.status;
  const isRejected = status === "rejected";
  const isHired = status === "hired";

  // Per-match rule: the full name is revealed only when THIS match is hired.
  const name = displayName(p?.full_name, status);
  const initial = name.slice(0, 1).toUpperCase();

  const primaryRole = toStringList(p?.primary_role)[0] ?? null;
  const scheduled = formatDateTime(match.interview_scheduled_at);

  const availability = [
    p?.weekly_hours_available ? `${p.weekly_hours_available} hrs/week` : null,
    p?.preferred_shift,
    p?.timezone,
    p?.earliest_start_date ? `available from ${formatDate(p.earliest_start_date)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className={`relative rounded-2xl ${isRejected ? "opacity-60" : ""}`}>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-16 w-16 flex-none rounded-full object-cover ring-2 ring-primary/15" />
          ) : (
            <div className="grid h-16 w-16 flex-none place-items-center rounded-full bg-primary/10 text-2xl font-semibold text-primary">
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold leading-tight">{name}</h3>
              <Badge variant="secondary" className={statusTone(status)}>
                {isHired && <CheckCircle2 className="mr-1 h-3 w-3" />}
                {MATCH_STATUS_LABELS[status] ?? status}
              </Badge>
            </div>
            {p?.headline && <p className="truncate text-xs text-muted-foreground">{p.headline}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[primaryRole, p?.years_experience ? `${p.years_experience} yrs experience` : null, p?.country]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        {p?.approved_summary && (
          <p className="line-clamp-4 text-sm text-muted-foreground">{p.approved_summary}</p>
        )}

        {availability && <p className="text-xs text-muted-foreground">{availability}</p>}

        {/* -------- status-specific blocks -------- */}
        {status === "interview_requested" && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Clock className="h-4 w-4 flex-none" />
            Interview requested — awaiting scheduling
          </div>
        )}

        {status === "interview_confirmed" && (
          <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <CalendarClock className="h-4 w-4 flex-none" />
              {scheduled ? `Interview on ${scheduled}` : "Interview confirmed"}
            </p>
            {match.meet_url && (
              <Button asChild size="sm" className="w-full">
                <a href={match.meet_url} target="_blank" rel="noreferrer">
                  <Video className="mr-1.5 h-4 w-4" />
                  Join Meet
                </a>
              </Button>
            )}
          </div>
        )}

        {status === "interview_completed" && (
          <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <CalendarClock className="h-4 w-4 flex-none" />
              {scheduled ? `Interview held on ${scheduled}` : "Interview completed"}
            </p>
            {match.interview_notes && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{match.interview_notes}</p>
            )}
          </div>
        )}

        {isRejected && (
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            <p className="font-medium">Not a fit — {rejectionReasonLabel(match.rejection_reason)}</p>
            {match.rejection_reason_note && (
              <p className="mt-0.5 text-muted-foreground">{match.rejection_reason_note}</p>
            )}
            {match.rejected_at && (
              <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(match.rejected_at)}</p>
            )}
          </div>
        )}

        {/* -------- actions -------- */}
        {(status === "recommended" || status === "shortlisted") && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant={status === "shortlisted" ? "default" : "outline"}
              size="sm"
              disabled={busy}
              onClick={onShortlist}
              className={status === "shortlisted" ? "bg-amber-500 text-white hover:bg-amber-600" : ""}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Star className={`mr-1.5 h-4 w-4 ${status === "shortlisted" ? "fill-current" : ""}`} />
              )}
              {status === "shortlisted" ? "Shortlisted" : "Shortlist"}
            </Button>
            <Button size="sm" disabled={busy} onClick={onRequestInterview}>
              <Video className="mr-1.5 h-4 w-4" />
              Request interview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onReject}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <ThumbsDown className="mr-1.5 h-4 w-4" />
              Not a fit
            </Button>
          </div>
        )}

        {status === "interview_completed" && (
          <Button className="w-full" disabled={busy} onClick={onRequestHire}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Request to hire
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function statusTone(s: MatchStatus) {
  switch (s) {
    case "hired":
      return "bg-emerald-100 text-emerald-800";
    case "shortlisted":
      return "bg-amber-100 text-amber-900";
    case "rejected":
      return "bg-slate-200 text-slate-700";
    case "interview_confirmed":
    case "interview_completed":
    case "offer_extended":
      return "bg-primary/10 text-primary";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}
