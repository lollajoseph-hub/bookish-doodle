import { CandidateRating } from "@/components/candidate-rating";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CandidateProfileDialog } from "@/components/candidate-profile-dialog";
import { CandidateSkillGap, MatchStatusIcon, statusTone, MATCH_SELECT, type MatchRow } from "@/components/candidate-card";
import { toast } from "sonner";
import { CalendarClock, ChevronDown, Clock, ExternalLink, Loader2, StickyNote, ThumbsDown, UserSearch, Video } from "lucide-react";
import {
  MATCH_STATUS_LABELS,
  displayName,
  formatDateTime,
  signedPhotoUrl,
  type MatchStatus,
} from "@/lib/matches";
import { createThread, findThreadId } from "@/components/request-messages";
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

/** Stage tabs, in display order. */
const STAGE_TABS: { value: string; label: string; status: MatchStatus }[] = [
  { value: "requested", label: "Requested", status: "interview_requested" },
  { value: "confirmed", label: "Confirmed", status: "interview_confirmed" },
  { value: "completed", label: "Completed", status: "interview_completed" },
  { value: "hire", label: "Hire requested", status: "hire_requested" },
];

interface RequestMeta {
  id: string;
  job_roles: { name: string | null } | null;
}

interface ThreadNote {
  id: string;
  thread_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

interface NoteAuthor {
  id: string;
  full_name: string | null;
  role: string | null;
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Shared, append-only prep notes for a candidate's interview (thread_notes on
 * the candidate-kind thread). Each note is attributed to its author.
 */
function PrepNotes({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [notes, setNotes] = useState<ThreadNote[]>([]);
  const [authors, setAuthors] = useState<Record<string, NoteAuthor>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadNotes = useCallback(async (tid: string) => {
    const [{ data: rows, error }, { data: authorRows }] = await Promise.all([
      supabase.from("thread_notes").select("id, thread_id, author_id, body, created_at").eq("thread_id", tid).order("created_at", { ascending: true }),
      supabase.rpc("get_thread_note_authors", { p_thread_id: tid }),
    ]);
    if (error) toast.error(error.message);
    const map: Record<string, NoteAuthor> = {};
    for (const a of (authorRows as NoteAuthor[] | null) ?? []) map[a.id] = a;
    return { rows: (rows as ThreadNote[] | null) ?? [], map };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!cancelled) setUserId(auth.user?.id ?? null);
      const { id: tid, error } = await findThreadId({ kind: "candidate", id: matchId });
      if (cancelled) return;
      if (error) {
        toast.error(error);
        return;
      }
      if (!tid) {
        setLoaded(true);
        return;
      }
      setThreadId(tid);
      const { rows, map } = await loadNotes(tid);
      if (cancelled) return;
      setNotes(rows);
      setAuthors(map);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, matchId, loadNotes]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      let tid = threadId;
      if (!tid) {
        tid = await createThread({ kind: "candidate", id: matchId });
        setThreadId(tid);
      }
      const { data, error } = await supabase.rpc("add_thread_note", { p_thread_id: tid, p_body: body });
      if (error) throw new Error(error.message);
      const returned = (Array.isArray(data) ? data[0] : data) as ThreadNote | string | null;
      if (returned && typeof returned === "object" && "id" in returned && "body" in returned) {
        setNotes((prev) => [...prev, returned]);
      } else {
        const { rows, map } = await loadNotes(tid);
        setNotes(rows);
        setAuthors(map);
      }
      setDraft("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function authorLabel(n: ThreadNote) {
    if (n.author_id && n.author_id === userId) return "You";
    const a = n.author_id ? authors[n.author_id] : undefined;
    if (!a) return "ScaleSource Team";
    const first = (a.full_name ?? "").trim().split(/\s+/)[0] || "ScaleSource Team";
    return a.role ? `${first} (${capitalize(a.role)})` : first;
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        <StickyNote className="mr-1.5 h-4 w-4" />
        Prep notes
        <ChevronDown className={`ml-1.5 h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div className="space-y-3 rounded-lg bg-primary/5 px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-primary">Interview Prep Notes</p>
            <p className="text-xs text-muted-foreground">Shared prep notes for this candidate&apos;s interview.</p>
          </div>
          {!loaded ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md bg-background px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">{authorLabel(n)}</span>
                    <span className="text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2">
            <Textarea
              value={draft}
              disabled={!loaded || sending}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a question, talking point, or thing to cover…"
              rows={3}
              className="resize-none bg-background"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => void submit()} disabled={!loaded || sending || !draft.trim()}>
                {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Add note
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InterviewReason({ reason }: { reason: string }) {
  const [reasonExpanded, setReasonExpanded] = useState(false);

  return (
    <div className="border-t border-border/70 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this candidate</p>
      <p className={reasonExpanded ? "mt-1 text-sm leading-relaxed text-muted-foreground" : "mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-2"}>{reason}</p>
      {reason.length > 120 && (
        <button type="button" onClick={() => setReasonExpanded((v) => !v)} className="mt-0.5 text-xs font-medium text-primary">
          {reasonExpanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/**
 * Client-side parity with staff when ScaleSource counter-proposes an interview
 * time: accept (handled by the page) or reject the time by proposing another.
 */
function CounterProposalActions({ matchId, locked, onRefresh }: { matchId: string; locked: boolean; onRefresh: () => void }) {
  const [proposing, setProposing] = useState(false);
  const [proposedAt, setProposedAt] = useState("");
  const [proposingBusy, setProposingBusy] = useState(false);

  async function submitPropose() {
    if (!proposedAt || proposingBusy) return;
    const when = new Date(proposedAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      toast.error("Pick a date and time in the future.");
      return;
    }
    setProposingBusy(true);
    const { error } = await supabase.rpc("client_propose_interview_time", {
      p_match_id: matchId,
      p_proposed_at: when.toISOString(),
    });
    setProposingBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("New time proposed — ScaleSource will confirm.");
    setProposing(false);
    setProposedAt("");
    onRefresh();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={locked || proposingBusy}
        onClick={() => setProposing((v) => !v)}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <ThumbsDown className="mr-1.5 h-4 w-4" />
        Reject this time
      </Button>

      {proposing && (
        <div className="w-full space-y-2 rounded-lg border border-border bg-background/60 p-3">
          <p className="text-sm font-medium">
            You've declined that time — suggest one that works:
          </p>
          <Label htmlFor={`propose-when-${matchId}`}>Your preferred time</Label>
          <Input
            id={`propose-when-${matchId}`}
            type="datetime-local"
            value={proposedAt}
            onChange={(e) => setProposedAt(e.target.value)}
            className="bg-background"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={proposingBusy}
              onClick={() => {
                setProposing(false);
                setProposedAt("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={!proposedAt || proposingBusy} onClick={() => void submitPropose()}>
              {proposingBusy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Send proposal
            </Button>
          </div>
        </div>
      )}
    </>
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

  const renderCard = (m: MatchRow) => {
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

                   {m.match_reason?.trim() && <InterviewReason reason={m.match_reason} />}

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
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" disabled={acceptingId === m.id} onClick={() => acceptInterviewTime(m.id)}>
                            {acceptingId === m.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                            Accept this time
                          </Button>
                          <CounterProposalActions matchId={m.id} locked={acceptingId === m.id} onRefresh={() => void load()} />
                        </div>
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
  };

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
        <Tabs defaultValue="requested" className="space-y-3">
          <TabsList>
            {STAGE_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {STAGE_TABS.map((tab) => {
            const stageRows = rows.filter((m) => m.status === tab.status);
            return (
              <TabsContent key={tab.value} value={tab.value} className="mt-3">
                {stageRows.length === 0 ? (
                  <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    No candidates in this stage right now.
                  </p>
                ) : (
                  <div className="grid gap-3">{stageRows.map(renderCard)}</div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
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
