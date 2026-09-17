import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Loader2, Mic, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchCandidateAssignedScenarios,
  fetchCandidateRoleplay,
  fetchRoleplayAudioUrl,
  readBackendVerdict,
  type AssignedScenario,
  type RoleplaySession,
} from "@/lib/queries";
import { transcodeWebmToMp4 } from "@/lib/audio-transcode";


export function RoleplayTab({ candidateId }: { candidateId: string }) {
  const sessions = useQuery({
    queryKey: ["roleplay", candidateId],
    queryFn: () => fetchCandidateRoleplay(candidateId),
  });
  const assigned = useQuery({
    queryKey: ["roleplay-assigned", candidateId],
    queryFn: () => fetchCandidateAssignedScenarios(candidateId),
  });

  if (sessions.isLoading || assigned.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }
  if (sessions.isError) return <p className="text-sm text-destructive">Failed to load roleplay sessions.</p>;

  const allSessions = sessions.data ?? [];
  const assignedList = assigned.data ?? [];

  // Fallback: no assignment
  if (assignedList.length === 0) {
    if (!allSessions.length) {
      return (
        <p className="text-sm text-muted-foreground italic">
          Scenarios are assigned once the candidate completes training.
        </p>
      );
    }
    return (
      <div className="space-y-4">
        {allSessions.map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
      </div>
    );
  }

  // Group sessions by scenario title
  const sessionsByTitle = new Map<string, RoleplaySession[]>();
  for (const s of allSessions) {
    const k = (s.scenario_name ?? "").trim();
    if (!k) continue;
    const arr = sessionsByTitle.get(k) ?? [];
    arr.push(s);
    sessionsByTitle.set(k, arr);
  }

  const gradedCount = assignedList.filter((a) => {
    const matches = sessionsByTitle.get((a.title ?? "").trim()) ?? [];
    return matches.some((m) => typeof m.score === "number");
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Assigned roleplay scenarios — {gradedCount}/{assignedList.length} graded
        </h3>
      </div>
      {assignedList.map((a) => {
        const matches = (sessionsByTitle.get((a.title ?? "").trim()) ?? [])
          .slice()
          .sort((x, y) => {
            const xg = typeof x.score === "number" ? 1 : 0;
            const yg = typeof y.score === "number" ? 1 : 0;
            if (xg !== yg) return yg - xg;
            return new Date(y.created_at).getTime() - new Date(x.created_at).getTime();
          });
        return (
          <ScenarioBlock key={a.scenarioId} assigned={a} sessions={matches} />
        );
      })}
    </div>
  );
}

function ScenarioBlock({
  assigned: a,
  sessions,
}: {
  assigned: AssignedScenario;
  sessions: RoleplaySession[];
}) {
  const headline = sessions[0];
  let status: { label: string; variant: "outline" | "secondary" | "default" } = {
    label: "Not started",
    variant: "outline",
  };
  if (headline) {
    if (typeof headline.score === "number") {
      status = { label: `Graded — ${headline.score}%`, variant: "default" };
    } else if (headline.completed_at == null) {
      status = { label: "Submitted — awaiting review", variant: "secondary" };
    } else {
      status = { label: "Submitted", variant: "secondary" };
    }
  }

  return (
    <article className="rounded-xl border p-4 space-y-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h4 className="font-semibold truncate">
            <span className="text-muted-foreground mr-2">#{a.position}</span>
            {a.title ?? "Untitled scenario"}
          </h4>
          {a.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={status.variant}
            className={status.variant === "default" ? "bg-primary/15 text-primary border-0" : ""}
          >
            {status.label}
          </Badge>
          {typeof headline?.score === "number" && (
            <Badge
              className={`border-0 ${
                headline.score >= 80
                  ? "bg-[color:var(--color-success)]/15 text-[color:var(--color-success-foreground)]"
                  : "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning-foreground)]"
              }`}
            >
              {headline.score >= 80 ? "Passed" : "Below benchmark"}
            </Badge>
          )}
        </div>
      </header>

      {sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No submissions yet.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <SessionDetail key={s.id} session={s} />
          ))}
        </div>
      )}
    </article>
  );
}

function SessionCard({ session: s }: { session: RoleplaySession }) {
  const awaiting = s.score == null && s.completed_at == null;
  return (
    <article className="rounded-xl border p-4 space-y-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h4 className="font-semibold truncate">{s.scenario_name ?? "Roleplay scenario"}</h4>
          <p className="text-xs text-muted-foreground">
            Submitted {format(new Date(s.created_at), "MMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {awaiting ? (
            <Badge variant="secondary">Submitted — awaiting review</Badge>
          ) : (
            <Badge className="bg-primary/15 text-primary border-0">Graded</Badge>
          )}
          {typeof s.score === "number" && (
            <span className="text-sm font-semibold tabular-nums">{s.score}%</span>
          )}
        </div>
      </header>
      <SessionDetail session={s} />
    </article>
  );
}

function SessionDetail({ session: s }: { session: RoleplaySession }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadPhase, setDownloadPhase] = useState<null | "preparing" | "converting">(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const verdict = readBackendVerdict(s.ai_feedback);
  const fb = s.ai_feedback;

  let durationLabel: string | null = null;
  if (s.created_at && s.completed_at) {
    const ms = new Date(s.completed_at).getTime() - new Date(s.created_at).getTime();
    if (ms > 0 && ms < 1000 * 60 * 60 * 24) {
      const mins = Math.round(ms / 60000);
      durationLabel = `${mins} min`;
    }
  }

  const loadAudio = async () => {
    setLoading(true);
    const url = await fetchRoleplayAudioUrl(s.audio_file_id);
    setLoading(false);
    setAudioUrl(url);
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  };

  const downloadAudio = async () => {
    if (!s.audio_file_id) return;
    setDownloadPhase("preparing");
    try {
      const dateStr = format(new Date(s.created_at), "yyyy-MM-dd");
      const scenario = (s.scenario_name ?? "roleplay").trim() || "roleplay";
      const base = `${scenario}-${dateStr}`;
      const url = await fetchRoleplayAudioUrl(s.audio_file_id);
      if (!url) return;

      let webmBlob: Blob;
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
        webmBlob = await resp.blob();
      } catch (err) {
        console.error("Audio fetch failed", err);
        return;
      }

      try {
        setDownloadPhase("converting");
        const mp4Blob = await transcodeWebmToMp4(webmBlob);
        triggerBlobDownload(mp4Blob, `${base}.mp4`);
      } catch (err) {
        console.error("Audio transcode failed, falling back to original .webm", err);
        triggerBlobDownload(webmBlob, `${base}.webm`);
      }
    } finally {
      setDownloadPhase(null);
    }
  };


  return (
    <div className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-muted-foreground">
          Submitted {format(new Date(s.created_at), "MMM d, yyyy 'at' h:mm a")}
          {durationLabel ? ` · ${durationLabel}` : ""}
        </p>
        <div className="flex items-center gap-2">
          {verdict && (
            <Badge variant="outline" className="capitalize">
              {verdict.verdict}
            </Badge>
          )}
          {typeof s.score === "number" && (
            <span className="text-sm font-semibold tabular-nums">{s.score}%</span>
          )}
        </div>
      </div>

      {fb && typeof fb === "object" && (
        <div className="rounded-lg border bg-secondary/30 p-3 text-sm">
          <div className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Reviewer feedback
          </div>
          <FeedbackBody feedback={fb} />
          <FrameworkScores frameworkScores={fb.framework_scores} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {s.audio_file_id && (
          audioUrl ? (
            <audio controls src={audioUrl} className="h-9" />
          ) : (
            <Button size="sm" variant="outline" onClick={loadAudio} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mic className="h-4 w-4 mr-2" />}
              Load audio
            </Button>
          )
        )}
        {s.audio_file_id && (
          <Button size="sm" variant="outline" onClick={downloadAudio} disabled={downloadPhase !== null}>
            {downloadPhase !== null ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {downloadPhase === "converting" ? "Converting…" : downloadPhase === "preparing" ? "Preparing…" : "Download"}
          </Button>
        )}
        {s.transcript && (
          <Button size="sm" variant="ghost" onClick={() => setShowTranscript((v) => !v)}>
            {showTranscript ? "Hide transcript" : "Show transcript"}
          </Button>
        )}
      </div>


      {showTranscript && s.transcript && (
        <pre className="text-xs whitespace-pre-wrap bg-secondary/40 rounded-lg p-3 max-h-96 overflow-auto">
          {s.transcript}
        </pre>
      )}
    </div>
  );
}

function FeedbackBody({ feedback }: { feedback: any }) {
  if (typeof feedback === "string") return <p className="whitespace-pre-wrap">{feedback}</p>;
  if (feedback.summary || feedback.overall) {
    return (
      <div className="space-y-2">
        {(feedback.summary || feedback.overall) && (
          <p className="whitespace-pre-wrap">{feedback.summary || feedback.overall}</p>
        )}
        {Array.isArray(feedback.strengths) && feedback.strengths.length > 0 && (
          <div>
            <div className="font-medium">Strengths</div>
            <ul className="list-disc pl-5">
              {feedback.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
        {Array.isArray(feedback.improvements || feedback.weaknesses) && (
          <div>
            <div className="font-medium">Improvements</div>
            <ul className="list-disc pl-5">
              {(feedback.improvements || feedback.weaknesses).map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
  return (
    <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(feedback, null, 2)}</pre>
  );
}

type StageStatus = "demonstrated" | "partial" | "missing" | "not_applicable";

function FrameworkScores({ frameworkScores }: { frameworkScores: any }) {
  if (!frameworkScores?.detail) return null;
  const { guide, adr } = frameworkScores.detail;
  const hasApplicable = guide?.applicable || adr?.applicable;
  if (!hasApplicable) return null;

  const statusBadge = (status: StageStatus) => {
    switch (status) {
      case "demonstrated":
        return (
          <Badge className="border-0 bg-[color:var(--color-success)]/15 text-[color:var(--color-success-foreground)]">
            Demonstrated
          </Badge>
        );
      case "partial":
        return (
          <Badge className="border-0 bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning-foreground)]">
            Partial
          </Badge>
        );
      case "missing":
        return (
          <Badge className="border-0 bg-[color:var(--color-destructive)]/15 text-[color:var(--color-destructive-foreground)]">
            Missing
          </Badge>
        );
      case "not_applicable":
        return <Badge variant="outline" className="text-muted-foreground">N/A</Badge>;
    }
  };

  return (
    <div className="mt-3 pt-3 border-t space-y-3">
      <div className="font-medium text-xs uppercase tracking-wider text-muted-foreground">
        Framework proficiency (GUIDE / ADR)
      </div>

      {guide?.applicable && (
        <div className="space-y-2">
          <div className="text-sm font-medium">GUIDE</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {guide.stages?.greet && (
              <div className="rounded-md border p-2 flex items-center justify-between gap-2">
                <span className="text-xs">G — Greet with Control</span>
                {statusBadge(guide.stages.greet)}
              </div>
            )}
            {guide.stages?.understand && (
              <div className="rounded-md border p-2 flex items-center justify-between gap-2">
                <span className="text-xs">U — Understand the Need</span>
                {statusBadge(guide.stages.understand)}
              </div>
            )}
            {guide.stages?.inform && (
              <div className="rounded-md border p-2 flex items-center justify-between gap-2">
                <span className="text-xs">I — Inform with Brevity</span>
                {statusBadge(guide.stages.inform)}
              </div>
            )}
            {guide.stages?.direct && (
              <div className="rounded-md border p-2 flex items-center justify-between gap-2">
                <span className="text-xs">D — Direct to the Next Step</span>
                {statusBadge(guide.stages.direct)}
              </div>
            )}
            {guide.stages?.end && (
              <div className="rounded-md border p-2 flex items-center justify-between gap-2">
                <span className="text-xs">E — End with Confirmation</span>
                {statusBadge(guide.stages.end)}
              </div>
            )}
          </div>
          {guide.note && <p className="text-xs text-muted-foreground">{guide.note}</p>}
        </div>
      )}

      {adr?.applicable ? (
        <div className="space-y-2">
          <div className="text-sm font-medium">A.R.D.</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {adr.stages?.acknowledge && (
              <div className="rounded-md border p-2 flex items-center justify-between gap-2">
                <span className="text-xs">A — Acknowledge</span>
                {statusBadge(adr.stages.acknowledge)}
              </div>
            )}
            {adr.stages?.reframe && (
              <div className="rounded-md border p-2 flex items-center justify-between gap-2">
                <span className="text-xs">R — Reframe</span>
                {statusBadge(adr.stages.reframe)}
              </div>
            )}
            {adr.stages?.direct && (
              <div className="rounded-md border p-2 flex items-center justify-between gap-2">
                <span className="text-xs">D — Direct</span>
                {statusBadge(adr.stages.direct)}
              </div>
            )}
          </div>
          {adr.note && <p className="text-xs text-muted-foreground">{adr.note}</p>}
        </div>
      ) : adr ? (
        <p className="text-xs text-muted-foreground italic">A.R.D. — Not applicable (no objection)</p>
      ) : null}
    </div>
  );
}
