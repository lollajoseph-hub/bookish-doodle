import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TimezoneSelect } from "@/components/timezone-select";
import { PdfPagePreview } from "@/components/PdfPagePreview";
import { RejectCandidateDialog } from "@/components/reject-dialog";

import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
  Star,
  ThumbsDown,
  UserCheck,
  Video,
} from "lucide-react";

function availabilityLabel(v: string | null | undefined) {
  switch ((v ?? "").toLowerCase()) {
    case "available": return "Available Immediately";
    case "open_to_offers": return "Open to offers";
    case "not_available": return "Not available";
    default: return v ?? "—";
  }
}

async function signedUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export const Route = createFileRoute("/requests/$id")({
  head: () => ({ meta: [{ title: "Request — Candidate Pool" }] }),
  component: () => (
    <AppShell>
      <RequestDetail />
    </AppShell>
  ),
});

interface PresentedCandidate {
  match_id: string;
  candidate_name: string;
  headline?: string | null;
  availability?: string | null;
  shortlisted_at?: string | null;
  status?: string | null;
  client_status?: string | null;
  profile_photo_bucket?: string | null;
  profile_photo_path?: string | null;
  interview_scheduled_at?: string | null;
  interview_timezone?: string | null;
  interview_confirmed_at?: string | null;
  interview_link?: string | null;
  meet_url?: string | null;
  name_revealed?: boolean | null;
}



function InterviewStatusBlock({
  c,
  actingId,
  onAccept,
}: {
  c: PresentedCandidate;
  actingId: string | null;
  onAccept: (matchId: string) => void;
}) {
  const date = c.interview_scheduled_at
    ? `${new Date(c.interview_scheduled_at).toLocaleString()} (${c.interview_timezone ?? "—"})`
    : null;
  if (c.client_status === "scalesource_reviewing") {
    return (
      <div className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
        <Badge className="bg-sky-100 text-sky-800" variant="secondary">ScaleSource reviewing interview</Badge>
        {date && <div className="mt-1">Proposed: {date}</div>}
      </div>
    );
  }
  if (c.client_status === "scalesource_reschedule_proposed") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
        <Badge className="bg-amber-100 text-amber-800" variant="secondary">ScaleSource proposed a new time</Badge>
        {date && <div className="mt-1">New time: {date}</div>}
        <Button size="sm" className="mt-1 h-7 text-xs" disabled={actingId === c.match_id} onClick={() => onAccept(c.match_id)}>
          Accept new time
        </Button>
      </div>
    );
  }
  if (c.client_status === "interview_confirmed") {
    return null;
  }
  if (c.client_status === "interview_completed") {
    return null;
  }
  if (c.client_status === "scalesource_preparing_offer") {
    return (
      <div className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs text-indigo-900">
        <Badge className="bg-indigo-100 text-indigo-800" variant="secondary">ScaleSource preparing offer</Badge>
        <div className="mt-1">ScaleSource is preparing your employment offer.</div>
      </div>
    );
  }
  if (c.client_status === "candidate_declined") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
        <Badge className="bg-amber-100 text-amber-800" variant="secondary">Candidate declined</Badge>
        <div className="mt-1">Candidate declined. ScaleSource will assist with next steps.</div>
      </div>
    );
  }
  return null;
}

function RequestDetail() {
  const { id } = useParams({ from: "/requests/$id" });
  const [rows, setRows] = useState<PresentedCandidate[] | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [resumeFor, setResumeFor] = useState<PresentedCandidate | null>(null);
  const [scheduleFor, setScheduleFor] = useState<PresentedCandidate | null>(null);
  const [rejectFor, setRejectFor] = useState<PresentedCandidate | null>(null);
  const [requestingMore, setRequestingMore] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    supabase
      .rpc("get_client_presented_candidates", { p_request: id })
      .then(async ({ data, error }) => {
        if (error) { setErr(error.message); return; }
        const list = (data ?? []) as PresentedCandidate[];
        setRows(list);
        const entries = await Promise.all(
          list.map(async (c) => {
            if (c.profile_photo_bucket && c.profile_photo_path) {
              const u = await signedUrl(c.profile_photo_bucket, c.profile_photo_path);
              return [c.match_id, u] as const;
            }
            return [c.match_id, null] as const;
          })
        );
        setPhotoUrls(Object.fromEntries(entries));
      });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(rpc: string, match_id: string, label: string) {
    setActingId(match_id);
    const { error } = await supabase.rpc(rpc, { p_match_id: match_id });
    setActingId(null);
    if (error) toast.error(error.message);
    else {
      toast.success(label);
      load();
    }
  }

  async function requestMoreCandidates() {
    setRequestingMore(true);
    const { data, error } = await supabase.rpc("client_request_more_candidates", { p_request: id });
    setRequestingMore(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const added = (data as number) ?? 0;
    if (added > 0) {
      toast.success(`${added} more candidate${added === 1 ? "" : "s"} added`);
      load();
    } else {
      toast.message("No additional matching candidates are available right now.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/requests" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> All requests
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Presented Candidates</h1>
          <p className="text-sm text-muted-foreground">You're presented up to 4 candidates per request, with the option to see up to 4 more (8 total).</p>
        </div>
      </div>

      {err && <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{err}</div>}

      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading candidates…</p>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No candidates presented yet. Matching may still be in progress.
          </CardContent>
        </Card>
      ) : (
        <>
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((c) => {
            const isHired = c.status === "placement_confirmed" || c.status === "hired";
            const isShortlisted = !!c.shortlisted_at;
            const isRejected = c.status === "rejected";
            const interviewLocked =
              c.client_status === "scalesource_reviewing" ||
              c.client_status === "scalesource_reschedule_proposed" ||
              c.client_status === "interview_confirmed";
            // request_to_hire() throws unless the match is exactly interview_completed.
            const canHire = c.status === "interview_completed";
            const offerInProgress = c.client_status === "scalesource_preparing_offer" || c.client_status === "candidate_declined";
            const photo = photoUrls[c.match_id];
            const initial = (c.candidate_name ?? "?").slice(0, 1).toUpperCase();
            return (
              <Card key={c.match_id} className={`relative rounded-2xl ${isRejected ? "opacity-70" : ""}`}>
                {isHired ? (
                  <Badge className="absolute right-3 top-3 z-10 bg-emerald-100 text-emerald-800" variant="secondary">
                    <CheckCircle2 className="mr-1 h-3 w-3" />Hired
                  </Badge>
                ) : isShortlisted ? (
                  <Badge className="absolute right-3 top-3 z-10 bg-amber-100 text-amber-800" variant="secondary">
                    <Star className="mr-1 h-3 w-3 fill-amber-500 text-amber-500" />Shortlisted
                  </Badge>
                ) : isRejected ? (
                  <Badge className="absolute right-3 top-3 z-10 bg-red-100 text-red-800" variant="secondary">
                    Rejected
                  </Badge>
                ) : null}
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    {photo ? (
                      <img src={photo} alt="" className="h-16 w-16 flex-none rounded-full object-cover ring-2 ring-teal-50" />
                    ) : (
                      <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-teal-50 text-2xl font-semibold text-teal-700">
                        {initial}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 pr-20">
                      {c.name_revealed ? (
                        <h3 className="truncate text-base font-semibold leading-tight">{c.candidate_name}</h3>
                      ) : (
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium italic tracking-wide text-muted-foreground leading-none">Meet</p>
                          <h3 className="truncate text-base font-semibold leading-tight mt-0.5">{c.candidate_name}</h3>
                        </div>
                      )}
                      {c.headline && <p className="truncate text-xs text-muted-foreground">{c.headline}</p>}
                      <p className="mt-0.5 text-xs text-teal-700">{availabilityLabel(c.availability)}</p>
                    </div>

                  </div>

                  <InterviewStatusBlock
                    c={c}
                    actingId={actingId}
                    onAccept={(matchId) => act("client_accept_reschedule", matchId, "Interview confirmed")}
                  />

                  <div className="flex items-center gap-1.5">
                    <Button size="sm" className="flex-1" onClick={() => setResumeFor(c)}>
                      <UserCheck className="mr-1.5 h-4 w-4" />View Candidate Profile
                    </Button>
                    {isHired ? null : offerInProgress ? null : canHire ? (
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={actingId === c.match_id}
                        onClick={() => act("request_to_hire", c.match_id, "Hire request sent to ScaleSource")}
                      >
                        <UserCheck className="mr-1.5 h-4 w-4" />Request to Hire
                      </Button>
                    ) : isRejected ? (
                      <Button
                        variant="outline"
                        size="icon"
                        title="Undo rejection"
                        disabled={actingId === c.match_id}
                        onClick={() => act("client_unreject_candidate", c.match_id, "Rejection undone")}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant={isShortlisted ? "default" : "outline"}
                          size="icon"
                          title={isShortlisted ? "Unshortlist" : "Shortlist"}
                          className={isShortlisted ? "bg-amber-500 text-white hover:bg-amber-600" : ""}
                          disabled={actingId === c.match_id}
                          onClick={() => act("client_shortlist_candidate", c.match_id, isShortlisted ? "Unshortlisted" : "Shortlisted")}
                        >
                          <Star className={`h-4 w-4 ${isShortlisted ? "fill-current" : ""}`} />
                        </Button>
                        {!interviewLocked && (
                          <Button variant="outline" size="icon" title="Interview" disabled={actingId === c.match_id} onClick={() => setScheduleFor(c)}>
                            <Video className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="outline" size="icon" title="Reject" className="text-destructive hover:bg-destructive/10" disabled={actingId === c.match_id} onClick={() => setRejectFor(c)}>
                          <ThumbsDown className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {rows.length < 8 && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              disabled={requestingMore}
              onClick={requestMoreCandidates}
            >
              {requestingMore && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Show more candidates
            </Button>
          </div>
        )}
      </>)}

      <ResumeDialog
        candidate={resumeFor}
        onClose={() => setResumeFor(null)}
      />

      <InterviewSchedulerDialog
        candidate={scheduleFor}
        onClose={() => setScheduleFor(null)}
        onScheduled={() => { setScheduleFor(null); load(); }}
      />

      <RejectCandidateDialog
        matchId={rejectFor?.match_id ?? null}
        candidateName={rejectFor?.candidate_name ?? null}
        onClose={() => setRejectFor(null)}
        onRejected={() => { setRejectFor(null); load(); }}
      />
    </div>
  );
}

// ---------------------------- Interview Scheduler ----------------------------

function InterviewSchedulerDialog({
  candidate,
  onClose,
  onScheduled,
}: {
  candidate: PresentedCandidate | null;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const browserTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
  }, []);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [tz, setTz] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!candidate) return;
    if (candidate.interview_scheduled_at) {
      const d = new Date(candidate.interview_scheduled_at);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setDate("");
      setTime("");
    }
    setTz(candidate.interview_timezone || browserTz);
  }, [candidate, browserTz]);

  async function submit() {
    if (!candidate || !date || !time || !tz) {
      toast.error("Please set date, time, and timezone");
      return;
    }
    const iso = new Date(`${date}T${time}:00`).toISOString();
    setBusy(true);
    const { error } = await supabase.rpc("client_schedule_interview", {
      p_match: candidate.match_id,
      p_at: iso,
      p_timezone: tz,
      p_mode: "video",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Interview scheduled");
    onScheduled();
  }

  return (
    <Dialog open={!!candidate} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
          <DialogDescription>
            {candidate?.candidate_name ? `Pick a date and time for ${candidate.candidate_name}.` : "Pick a date and time."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="iv-date">Date</Label>
            <Input id="iv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iv-time">Time</Label>
            <Input id="iv-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iv-tz">Timezone</Label>
            <TimezoneSelect id="iv-tz" value={tz} onChange={setTz} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Confirm interview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ---------------------------- Resume Dialog ----------------------------

interface ResumePayload {
  resume: Record<string, any> | null;
}

function asList(v: any): string[] {
  if (!v) return [];
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n;]/) : [v];
  return raw
    .map((item) => {
      if (item == null) return "";
      if (typeof item === "string") return item.trim();
      if (typeof item === "object") {
        const label =
          item.name ??
          item.label ??
          item.skill ??
          item.language ??
          item.value ??
          item.title ??
          "";
        return String(label).trim();
      }
      return String(item).trim();
    })
    .filter(Boolean);
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <Badge key={i} variant="secondary" className="bg-teal-50 text-teal-800">{it}</Badge>
      ))}
    </div>
  );
}

function ChipGroup({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <Chips items={items} />
    </div>
  );
}

function fmtDate(v: any): string {
  if (!v) return "";
  const s = String(v);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="text-base font-semibold tracking-tight text-foreground">{children}</h3>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function SkillChips({ items, limit = 8 }: { items: string[]; limit?: number }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const shown = open ? items : items.slice(0, limit);
  const more = items.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((it, i) => (
        <Badge key={i} variant="secondary" className="bg-teal-50 text-teal-800">{it}</Badge>
      ))}
      {more > 0 && !open && (
        <button type="button" className="text-xs text-teal-700 underline" onClick={() => setOpen(true)}>
          +{more} more
        </button>
      )}
      {open && items.length > limit && (
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setOpen(false)}>
          Show less
        </button>
      )}
    </div>
  );
}


function getVideoEmbed(url: string): { kind: "iframe" | "video" | "link"; src: string } {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    // YouTube
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (path.startsWith("/shorts/")) {
        const id = path.split("/")[2];
        if (id) return { kind: "iframe", src: `https://www.youtube.com/embed/${id}` };
      }
      const v = u.searchParams.get("v");
      if (v) return { kind: "iframe", src: `https://www.youtube.com/embed/${v}` };
      const listMatch = path.match(/^\/embed\/([^/?]+)/);
      if (listMatch) return { kind: "iframe", src: `https://www.youtube.com/embed/${listMatch[1]}` };
      return { kind: "link", src: url };
    }
    if (host === "youtu.be") {
      const id = path.slice(1);
      if (id) return { kind: "iframe", src: `https://www.youtube.com/embed/${id}` };
      return { kind: "link", src: url };
    }

    // Vimeo
    if (host === "vimeo.com") {
      const m = path.match(/^\/(\d+)/);
      if (m) return { kind: "iframe", src: `https://player.vimeo.com/video/${m[1]}` };
      return { kind: "link", src: url };
    }

    // Loom
    if (host === "loom.com" || host.endsWith(".loom.com")) {
      const m = path.match(/^\/share\/([a-zA-Z0-9_-]+)/);
      if (m) return { kind: "iframe", src: `https://www.loom.com/embed/${m[1]}` };
      return { kind: "link", src: url };
    }

    // Google Drive
    if (host === "drive.google.com") {
      const m = path.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (m) return { kind: "iframe", src: `https://drive.google.com/file/d/${m[1]}/preview` };
      return { kind: "link", src: url };
    }
  } catch {
    // fall through to extension / link fallback
  }

  if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url)) {
    return { kind: "video", src: url };
  }

  return { kind: "link", src: url };
}

function ResumeDialog({
  candidate,
  onClose,
}: {
  candidate: PresentedCandidate | null;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<ResumePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [introUrl, setIntroUrl] = useState<string | null>(null);
  const [workExpanded, setWorkExpanded] = useState(false);

  useEffect(() => {
    if (!candidate) {
      setPayload(null);
      setResumeUrl(null); setPhotoUrl(null); setIntroUrl(null);
      setWorkExpanded(false);
      return;
    }
    setLoading(true);
    supabase
      .rpc("get_client_candidate_resume", { p_match: candidate.match_id })
      .then(async ({ data, error }) => {
        if (error) { toast.error(error.message); setLoading(false); return; }
        const p = data as ResumePayload;
        setPayload(p);
        const r = p?.resume ?? {};
        const [ru, ph, iv] = await Promise.all([
          r.resume_path ? signedUrl("candidate-resumes", r.resume_path) : null,
          r.profile_photo_path ? signedUrl("candidate-photos", r.profile_photo_path) : null,
          r.intro_video_path ? signedUrl("intro-videos", r.intro_video_path) : null,
        ]);
        setResumeUrl(ru); setPhotoUrl(ph); setIntroUrl(iv);
        setLoading(false);
      });
  }, [candidate]);

  const r = payload?.resume ?? null;
  const introEmbed = useMemo(() => (r?.intro_video_url ? getVideoEmbed(r.intro_video_url) : null), [r?.intro_video_url]);

  return (
    <Dialog open={!!candidate} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        {loading || !r ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading candidate profile…
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">Candidate Profile — {r.full_name}</DialogTitle>
              <DialogDescription className="sr-only">Full candidate profile</DialogDescription>
            </DialogHeader>

            {/* ───────── SECTION 1 — Professional Profile ───────── */}
            <section className="space-y-5">
              <div className="flex items-start gap-4">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="h-20 w-20 flex-none rounded-full object-cover ring-2 ring-teal-100" />
                ) : (
                  <div className="grid h-20 w-20 flex-none place-items-center rounded-full bg-teal-100 text-2xl font-semibold text-teal-800">
                    {(r.full_name ?? "?").slice(0,1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {r.name_revealed ? (
                    <h2 className="text-2xl font-semibold leading-tight">{r.full_name}</h2>
                  ) : (
                    <div>
                      <p className="text-xs font-medium italic tracking-wide text-muted-foreground leading-none">Meet</p>
                      <h2 className="text-2xl font-semibold leading-tight mt-1">{r.full_name}</h2>
                    </div>
                  )}
                  {(r.headline || r.primary_role) && (
                    <p className="text-sm italic text-muted-foreground">{r.headline ?? r.primary_role}</p>
                  )}
                </div>

              </div>

              {r.professional_summary && (
                <p className="whitespace-pre-line text-sm leading-relaxed">{r.professional_summary}</p>
              )}

              {Boolean(introUrl || introEmbed) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Introduction Video</div>
                    <a href={introEmbed?.src ?? introUrl ?? undefined} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline hover:text-foreground">
                      Open in new tab
                    </a>
                  </div>
                  <div className="overflow-hidden rounded-xl border bg-black">
                    {introEmbed ? (
                      introEmbed.kind === "iframe" ? (
                        <iframe
                          src={introEmbed.src}
                          className="aspect-video w-full"
                          allow="autoplay; fullscreen; picture-in-picture"
                          allowFullScreen
                        />
                      ) : introEmbed.kind === "video" ? (
                        <video
                          controls
                          src={introEmbed.src}
                          className="mx-auto max-h-[340px] w-full object-contain"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center text-white/80">
                          <p className="text-sm">Preview not available for this link</p>
                          <a
                            href={introEmbed.src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block rounded-md bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
                          >
                            Watch introduction video
                          </a>
                        </div>
                      )
                    ) : r.intro_video_mime_type === "application/pdf" ? (
                      <PdfPagePreview url={introUrl!} className="w-full bg-white" />
                    ) : (
                      <video
                        controls
                        src={introUrl!}
                        className="mx-auto max-h-[340px] w-full object-contain"
                      />
                    )}
                  </div>
                </div>
              )}


              {r.final_client_analysis && (
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-500" /> ScaleSource AI Assessment
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{r.final_client_analysis}</p>
                </div>
              )}


              <div className="rounded-xl border p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Availability</div>
                <div className="grid grid-cols-2 gap-y-1.5 text-sm md:grid-cols-4">
                  <div><span className="text-muted-foreground">Country:</span> <span className="font-medium">{r.country ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">Timezone:</span> <span className="font-medium">{r.timezone ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">Weekly hours:</span> <span className="font-medium">{r.weekly_hours_available ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">Preferred shift:</span> <span className="font-medium">{r.preferred_shift ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">Earliest start:</span> <span className="font-medium">{r.earliest_start_date ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">CS experience:</span> <span className="font-medium">{r.years_customer_service_experience != null ? `${r.years_customer_service_experience}y` : "—"}</span></div>
                </div>
              </div>

              {resumeUrl && (
                <div>
                  <Button asChild variant="default" size="sm">
                    <a href={resumeUrl} target="_blank" rel="noreferrer"><Download className="mr-1.5 h-4 w-4" />Download Profile PDF</a>
                  </Button>
                </div>
              )}
            </section>

            {/* ───────── SECTION 2 — Experience & Qualifications ───────── */}
            <section className="space-y-5">
              <SectionHeader>Experience &amp; Qualifications</SectionHeader>

              {Array.isArray(r.work_history) && r.work_history.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Work History</div>
                  <div className="space-y-3">
                    {(workExpanded ? r.work_history : r.work_history.slice(0, 3)).map((w: any, i: number) => (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="font-medium">
                          {w.job_title ?? "—"}{w.organization ? ` — ${w.organization}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(w.start_date)}{(w.start_date || w.end_date || w.is_current) ? " – " : ""}{w.is_current ? "Present" : fmtDate(w.end_date)}
                        </div>
                        {w.description && <p className="mt-1 whitespace-pre-line text-sm">{w.description}</p>}
                      </div>
                    ))}
                  </div>
                  {r.work_history.length > 3 && (
                    <Button variant="outline" size="sm" onClick={() => setWorkExpanded((e) => !e)}>
                      {workExpanded ? "See less" : `See more (${r.work_history.length - 3})`}
                    </Button>
                  )}
                </div>
              )}

              {Array.isArray(r.education) && r.education.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Education</div>
                  <div className="space-y-3">
                    {r.education.map((e: any, i: number) => {
                      const years = [e.start_year, e.end_year].filter(Boolean).join("–");
                      const line2 = [e.qualification, e.field_of_study, years].filter(Boolean).join(" · ");
                      return (
                        <div key={i} className="rounded-lg border p-3">
                          <div className="font-medium">{e.institution ?? "—"}</div>
                          {line2 && <div className="text-sm">{line2}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {asList(r.skills).length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</div>
                  <SkillChips items={asList(r.skills)} />
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <ChipGroup title="Software" items={asList(r.software)} />
                <ChipGroup title="Languages" items={asList(r.languages)} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ChipGroup title="Key Strengths" items={asList(r.key_strengths)} />
                <ChipGroup title="Transferable Skills" items={asList(r.transferable_skills)} />
                <ChipGroup title="Communication Skills" items={asList(r.communication_skills)} />
                <ChipGroup title="Certifications" items={asList(r.certifications)} />
              </div>
            </section>

            {/* ───────── SECTION 3 — Highlights ───────── */}
            <section className="space-y-5">
              <SectionHeader>Highlights</SectionHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <ChipGroup title="Achievements" items={asList(r.achievements)} />
                <ChipGroup title="Career Highlights" items={asList(r.career_highlights)} />
              </div>


              <ChipGroup title="Badges" items={asList(r.badges)} />
            </section>

          </>
        )}

      </DialogContent>
    </Dialog>
  );
}

function KV({ k, v }: { k: string; v: any }) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-sm font-medium">{v == null || v === "" ? "—" : String(v)}</div>
    </div>
  );
}
