import { CandidateRating } from "@/components/candidate-rating";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CandidateProfileDialog } from "@/components/candidate-profile-dialog";
import { CandidateSkillGap, MatchStatusIcon, statusTone, MATCH_SELECT, type MatchRow } from "@/components/candidate-card";
import { toast } from "sonner";
import { CalendarClock, ChevronDown, Clock, ExternalLink, Loader2, StickyNote, UserSearch, Video } from "lucide-react";
import {
  MATCH_STATUS_LABELS,
  displayName,
  formatDateTime,
  signedPhotoUrl,
  type MatchStatus,
} from "@/lib/matches";
import { usePollingRefresh } from "@/hooks/use-polling-refresh";

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
  "hire_requested",
];

const ORDER: MatchStatus[] = [
  "interview_confirmed",
  "interview_requested",
  "interview_completed",
  "hire_requested",
];

interface RequestMeta {
  id: string;
  job_roles: { name: string | null } | null;
}

/**
 * Shared prep notes for a candidate's interview, stored on the candidate-kind
 * thread's scratchpad. Autosaves ~800ms after typing stops; last write wins.
 */
function PrepNotes({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("get_or_create_thread", {
        p_client_request_id: null,
        p_candidate_match_id: matchId,
        p_client_id: null,
      });
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as { id: string } | string | null;
      const tid = typeof row === "string" ? row : row?.id;
      if (!tid) return;
      setThreadId(tid);
      const { data: pad } = await supabase
        .from("thread_scratchpad")
        .select("content")
        .eq("thread_id", tid)
        .maybeSingle();
      if (cancelled) return;
      // Don't clobber text the client started typing while this load was in flight.
      if (!dirtyRef.current) setContent((pad as { content: string | null } | null)?.content ?? "");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, matchId]);

  const save = useCallback(
    async (text: string) => {
      if (!threadId) return;
      setSaving("saving");
      const { error } = await supabase.rpc("update_thread_scratchpad", { p_thread_id: threadId, p_content: text });
      if (error) {
        setSaving("idle");
        toast.error(error.message);
        return;
      }
      dirtyRef.current = false;
      setSaving("saved");
    },
    [threadId]
  );

  function onChange(text: string) {
    setContent(text);
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(text), 800);
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        <StickyNote className="mr-1.5 h-4 w-4" />
        Prep notes
        <ChevronDown className={`ml-1.5 h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-primary">Interview Prep Notes</p>
              <p className="text-xs text-muted-foreground">Shared prep notes for this candidate&apos;s interview.</p>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}
            </span>
          </div>
          <Textarea
            value={content}
            disabled={!loaded}
            onChange={(e) => onChange(e.target.value)}
            placeholder={loaded ? "Jot down questions, talking points, or things to cover…" : "Loading…"}
            rows={4}
            className="resize-none bg-background"
          />
        </div>
      )}
    </div>
  );
}

function InterviewsPage() {
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [requests, setRequests] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [requestSkills, setRequestSkills] = useState<Record<string, string[]>>({});
  const [candidateSkillsMap, setCandidateSkillsMap] = useState<Record<string, string[]>>({});
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

    const raw = (matchRes.data ?? []) as unknown as MatchRow[];
    const requestIds = [...new Set(raw.map((match) => match.client_request_id))];
    const candidateIds = [...new Set(raw.map((match) => match.candidate_id))];
    const [requestSkillsRes, candidateSkillsRes] = await Promise.all([
      requestIds.length
        ? supabase.from("client_request_skills").select("request_id,skills(name)").eq("is_required", true).in("request_id", requestIds)
        : Promise.resolve({ data: [], error: null }),
      candidateIds.length
        ? supabase.from("candidate_skills").select("candidate_id,skills(name)").in("candidate_id", candidateIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (requestSkillsRes.error || candidateSkillsRes.error) {
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
    setRequestSkills(byRequest);
    setCandidateSkillsMap(byCandidate);

    const list = raw.slice().sort((a, b) => {
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

  usePollingRefresh(load, 20000);

  async function requestHire(matchId: string) {
    setActingId(matchId);
    const { error } = await supabase.rpc("client_request_hire", { p_match_id: matchId });
    setActingId(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Hire request sent to ScaleSource");
      void load();
    }
  }

  async function acceptInterviewTime(matchId: string) {
    setAcceptingId(matchId);
    const { error } = await supabase.rpc("client_confirm_interview_time", { p_match_id: matchId });
    setAcceptingId(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Interview confirmed");
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

                   {m.match_reason?.trim() && (
                     <div className="border-t border-border/70 pt-3">
                       <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this candidate</p>
                       <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{m.match_reason}</p>
                     </div>
                   )}

                   <CandidateSkillGap
                     requiredSkills={requestSkills[m.client_request_id] ?? []}
                     candidateSkills={candidateSkillsMap[m.candidate_id] ?? []}
                   />

                  {m.status === "interview_requested" &&
                    (m.interview_proposed_by === "staff" ? (
                      <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary">
                        <p className="flex items-center gap-2 font-medium">
                          <Clock className="h-4 w-4 flex-none" />
                          ScaleSource proposed a new time: {formatDateTime(m.interview_proposed_at)}
                        </p>
                        <Button size="sm" disabled={acceptingId === m.id} onClick={() => acceptInterviewTime(m.id)}>
                          {acceptingId === m.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                          Accept this time
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm text-primary">
                        <Clock className="h-4 w-4 flex-none" />
                        {proposed
                          ? `You proposed ${proposed} — waiting for ScaleSource to confirm.`
                          : "Interview requested — waiting for ScaleSource to confirm."}
                      </div>
                    ))}

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
                      {m.status === "interview_completed" && (m.meeting_notes_text || m.recording_url) && (
                        <div className="mt-2 space-y-1.5 border-t border-primary/10 pt-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Meeting notes &amp; recording</p>
                          {m.meeting_notes_text && (
                            <p className="whitespace-pre-line text-sm text-muted-foreground">{m.meeting_notes_text}</p>
                          )}
                          <div className="flex flex-wrap gap-3 pt-1">
                            {m.meeting_notes_doc_url && (
                              <a href={m.meeting_notes_doc_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline underline-offset-2">
                                View full notes doc
                              </a>
                            )}
                            {m.recording_url && (
                              <a href={m.recording_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline underline-offset-2">
                                Watch recording
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <PrepNotes matchId={m.id} />

                  <CandidateRating
                    matchId={m.id}
                    interviewCompletedAt={m.interview_completed_at}
                    rating={m.client_rating}
                    note={m.client_rating_note}
                    onSaved={() => void load()}
                  />

                  {m.status === "hire_requested" && (
                    <div className="space-y-2 rounded-lg bg-primary/5 px-3 py-2">
                      <p className="text-sm font-medium text-primary">
                        Hire requested — waiting on ScaleSource to send the contract.
                      </p>
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
        matchId={profileFor?.id ?? null}
        matchStatus={profileFor?.status ?? null}
        matchReason={profileFor?.match_reason ?? null}
        requiredSkills={profileFor ? (requestSkills[profileFor.client_request_id] ?? []) : []}
        candidateSkills={profileFor ? (candidateSkillsMap[profileFor.candidate_id] ?? []) : []}
        onClose={() => setProfileFor(null)}
      />
    </div>
  );
}
