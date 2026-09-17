import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PdfPagePreview } from "@/components/PdfPagePreview";
import {
  fetchCandidateAssignedScenarios,
  fetchCandidateDetail,
  fetchCandidateRoleplay,
  fetchRoleplayAudioUrl,
  fetchVetpodResume,
  getSignedUrl,
} from "@/lib/queries";

export function ResumeTab({ candidateId }: { candidateId: string }) {
  const resume = useQuery({
    queryKey: ["vetpod-resume", candidateId],
    queryFn: () => fetchVetpodResume(candidateId),
  });
  const detail = useQuery({
    queryKey: ["candidate-detail", candidateId],
    queryFn: () => fetchCandidateDetail(candidateId),
  });
  const roleplay = useQuery({
    queryKey: ["roleplay", candidateId],
    queryFn: () => fetchCandidateRoleplay(candidateId),
  });
  const assigned = useQuery({
    queryKey: ["roleplay-assigned", candidateId],
    queryFn: () => fetchCandidateAssignedScenarios(candidateId),
  });

  const [introUrl, setIntroUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [fallbackAudioUrl, setFallbackAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const r = resume.data;
    if (r?.intro_video_path) {
      getSignedUrl("intro-videos", r.intro_video_path).then(setIntroUrl);
    } else {
      setIntroUrl(null);
    }
  }, [resume.data?.intro_video_path]);

  useEffect(() => {
    const path = (resume.data as any)?.profile_photo_path;
    if (path) {
      getSignedUrl("candidate-photos", path).then(setPhotoUrl);
    } else {
      setPhotoUrl(null);
    }
  }, [(resume.data as any)?.profile_photo_path]);

  // Fallback to legacy single submission only when no assigned scenarios exist.
  useEffect(() => {
    if ((assigned.data?.length ?? 0) > 0) {
      setFallbackAudioUrl(null);
      return;
    }
    const audioId = roleplay.data?.find((r) => r.audio_file_id)?.audio_file_id;
    if (!audioId) {
      setFallbackAudioUrl(null);
      return;
    }
    fetchRoleplayAudioUrl(audioId).then(setFallbackAudioUrl);
  }, [roleplay.data, assigned.data]);

  if (resume.isLoading) return <Skeleton className="h-64" />;
  if (!resume.data) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        No VetPod Resume data published for this candidate yet.
      </div>
    );
  }

  const r = resume.data;
  const skills = Array.isArray(r.skills) ? r.skills : [];
  const software = Array.isArray(r.software) ? r.software : [];
  const languages = Array.isArray(r.languages) ? r.languages : [];
  const badges = Array.isArray(r.badges) ? r.badges : [];

  const roleplayScore = typeof (r as any).roleplay_score === "number" ? (r as any).roleplay_score as number : null;
  const courseScore = typeof (r as any).course_score === "number" ? (r as any).course_score as number : null;

  const recommendation = (() => {
    if (roleplayScore === null) return null;
    if (roleplayScore >= 90) return "Highly Recommended";
    if (roleplayScore >= 85) return "Recommended";
    if (roleplayScore >= 80) return "Strong Candidate";
    return null;
  })();

  const roleplayWord = (() => {
    if (roleplayScore === null) return null;
    if (roleplayScore >= 90) return "Excellent";
    if (roleplayScore >= 85) return "Strong";
    if (roleplayScore >= 80) return "Solid";
    return null;
  })();

  return (
    <div className="space-y-8">
      <p className="text-xs text-muted-foreground italic">
        Recruiter preview — fields shown here are the only ones a client will see. PII (email,
        phone, address, government ID, resume PDF) is intentionally excluded.
      </p>

      {/* ─── SECTION 1: Professional Profile ─── */}
      <div className="space-y-5">
        <SectionHeader title="Professional Profile" />

        <section className="rounded-xl border p-4">
          <div className="flex items-start gap-4">
            {photoUrl && (
              <img
                src={photoUrl}
                alt={r.full_name ?? "Candidate"}
                className="h-20 w-20 rounded-full object-cover border shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold mb-1">{r.full_name ?? "Candidate"}</h4>
              {((r as any).headline || r.primary_role) && (
                <p className="text-sm text-muted-foreground italic mt-0.5">{(r as any).headline || r.primary_role}</p>
              )}
              {r.professional_summary && (
                <p className="mt-3 text-sm whitespace-pre-wrap">{r.professional_summary}</p>
              )}
            </div>
          </div>
        </section>

        {introUrl && (
          <section className="rounded-xl border overflow-hidden">
            <header className="px-4 py-2 border-b font-semibold text-sm flex items-center justify-between">
              <span>Introduction Video</span>
              <a href={introUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-normal text-muted-foreground hover:text-foreground underline">
                Open in new tab
              </a>
            </header>
            {resume.data?.intro_video_mime_type === "application/pdf" ? (
              <PdfPagePreview url={introUrl} className="w-full bg-white" />
            ) : (
              <video src={introUrl} controls className="w-full max-h-[60vh] bg-black" />
            )}
          </section>
        )}

        {typeof (r as any).final_client_analysis === "string" && (r as any).final_client_analysis.trim() && (
          <section className="rounded-xl border p-5 bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              <h4 className="font-semibold text-base">VetPod AI Assessment</h4>
              {recommendation && (
                <Badge variant="default" className="ml-auto">{recommendation}</Badge>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{(r as any).final_client_analysis}</p>
          </section>
        )}

        {(r as any).certificate_status === "issued" && (
          <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              ✓ VetPod Academy Certified
            </span>
            {(r as any).certificate_number && (
              <span className="text-muted-foreground">
                · <span className="font-mono text-xs">{(r as any).certificate_number}</span>
              </span>
            )}
            {(r as any).certificate_verification_id && (
              <span className="text-muted-foreground">
                · Verify ID{" "}
                <span className="font-mono text-xs">{(r as any).certificate_verification_id}</span>
              </span>
            )}
          </section>
        )}

        {(roleplayScore !== null || courseScore !== null) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {roleplayScore !== null && (
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Roleplay Performance</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{roleplayScore}%</div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{roleplayWord}</span>
                  <Badge variant="secondary" className="text-xs">Passed</Badge>
                </div>
              </div>
            )}
            {courseScore !== null && (
              <div className="rounded-xl border p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Final Exam Score</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{courseScore}%</div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <Badge variant="secondary" className="text-xs">
                    {courseScore >= 80 ? "Passed" : "Below Benchmark"}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}

        <section className="rounded-xl border p-4">
          <h4 className="font-semibold mb-2">Availability</h4>
          <dl className="text-sm grid grid-cols-2 gap-y-1">
            <dt className="text-muted-foreground">Country</dt><dd>{r.country ?? "—"}</dd>
            <dt className="text-muted-foreground">Timezone</dt><dd>{r.timezone ?? "—"}</dd>
            <dt className="text-muted-foreground">Weekly hours</dt><dd>{r.weekly_hours_available ?? "—"}</dd>
            <dt className="text-muted-foreground">Preferred shift</dt><dd>{r.preferred_shift ?? "—"}</dd>
            <dt className="text-muted-foreground">Earliest start</dt><dd>{r.earliest_start_date ?? "—"}</dd>
            <dt className="text-muted-foreground">Customer service exp.</dt><dd>{(r as any).years_customer_service_experience != null ? `${(r as any).years_customer_service_experience}y` : "—"}</dd>
            <dt className="text-muted-foreground">Veterinary exp.</dt><dd>{(r as any).years_veterinary_experience != null ? `${(r as any).years_veterinary_experience}y` : "—"}</dd>
          </dl>
        </section>
      </div>

      {/* ─── SECTION 2: Experience & Qualifications ─── */}
      <div className="space-y-5">
        <SectionHeader title="Experience & Qualifications" />

        <WorkHistory entries={Array.isArray((r as any).work_history) ? (r as any).work_history : []} />
        <Education entries={Array.isArray((r as any).education) ? (r as any).education : []} />

        <CollapsibleChips
          title="Skills"
          items={skills.map((s: any) => (typeof s === "string" ? s : s.name))}
          initialLimit={8}
        />

        <div className="grid md:grid-cols-2 gap-4">
          <Chips title="Software" items={software.map((s: any) => (typeof s === "string" ? s : s.name))} />
          <Chips
            title="Languages"
            items={languages.map((l: any) => (typeof l === "string" ? l : l.name || l.language))}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {asStrings((r as any).key_strengths).length > 0 && <Chips title="Key Strengths" items={asStrings((r as any).key_strengths)} />}
          {asStrings((r as any).transferable_skills).length > 0 && <Chips title="Transferable Skills" items={asStrings((r as any).transferable_skills)} />}
          {asStrings((r as any).communication_skills).length > 0 && <Chips title="Communication Skills" items={asStrings((r as any).communication_skills)} />}
          {asStrings((r as any).certifications).length > 0 && <Chips title="Certifications" items={asStrings((r as any).certifications)} />}
        </div>
      </div>

      {/* ─── SECTION 3: Highlights ─── */}
      <div className="space-y-5">
        <SectionHeader title="Highlights" />

        <div className="grid md:grid-cols-2 gap-4">
          {asStrings((r as any).achievements).length > 0 && <Chips title="Achievements" items={asStrings((r as any).achievements)} />}
          {asStrings((r as any).career_highlights).length > 0 && <Chips title="Career Highlights" items={asStrings((r as any).career_highlights)} />}
        </div>

        <RoleplayAudioSamples
          assigned={assigned.data ?? []}
          sessions={roleplay.data ?? []}
          fallbackUrl={fallbackAudioUrl}
        />


        <div className="grid md:grid-cols-2 gap-4">
          <Chips title="Badges" items={badges.map((b: any) => (typeof b === "string" ? b : b.name))} />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground shrink-0">{title}</h3>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function Chips({ title, items }: { title: string; items: (string | null | undefined)[] }) {
  const clean = items.filter(Boolean) as string[];
  if (clean.length === 0) return null;
  return (
    <div className="rounded-xl border p-4">
      <h4 className="font-semibold mb-2">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {clean.map((c, i) => (
          <Badge key={i} variant="secondary">{c}</Badge>
        ))}
      </div>
    </div>
  );
}

function CollapsibleChips({ title, items, initialLimit = 8 }: { title: string; items: (string | null | undefined)[]; initialLimit?: number }) {
  const clean = items.filter(Boolean) as string[];
  const [expanded, setExpanded] = useState(false);
  const hasMore = clean.length > initialLimit;
  const visible = expanded ? clean : clean.slice(0, initialLimit);
  if (clean.length === 0) return null;

  return (
    <div className="rounded-xl border p-4">
      <h4 className="font-semibold mb-2">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((c, i) => (
          <Badge key={i} variant="secondary">{c}</Badge>
        ))}
      </div>
      {hasMore && (
        <Button variant="ghost" size="sm" className="mt-2 h-auto px-0 text-xs" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "View less" : "View more"}
        </Button>
      )}
    </div>
  );
}

function asStrings(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : x?.name ?? x?.label ?? "")).filter(Boolean);
}

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function WorkHistory({ entries }: { entries: any[] }) {
  if (!entries.length) return null;
  return (
    <section className="rounded-xl border p-4">
      <h4 className="font-semibold mb-3">Work History</h4>
      <ul className="space-y-4">
        {entries.map((e, i) => {
          const range = `${fmtDate(e.start_date) || "—"} – ${e.is_current ? "Present" : fmtDate(e.end_date) || "—"}`;
          return (
            <li key={i} className="text-sm">
              <div className="font-medium">
                {e.job_title ?? "Role"}
                {e.organization ? ` — ${e.organization}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">{range}</div>
              {e.description && <p className="mt-1 whitespace-pre-wrap">{e.description}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Education({ entries }: { entries: any[] }) {
  if (!entries.length) return null;
  return (
    <section className="rounded-xl border p-4">
      <h4 className="font-semibold mb-3">Education</h4>
      <ul className="space-y-3">
        {entries.map((e, i) => {
          const years = [e.start_year, e.end_year].filter(Boolean).join(" – ");
          return (
            <li key={i} className="text-sm">
              <div className="font-medium">{e.institution ?? "Institution"}</div>
              <div className="text-xs text-muted-foreground">
                {[e.qualification, e.field_of_study].filter(Boolean).join(" · ")}
                {years ? ` · ${years}` : ""}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RoleplayAudioSamples({
  assigned,
  sessions,
  fallbackUrl,
}: {
  assigned: { scenarioId: string; title: string | null; position: number }[];
  sessions: { scenario_name: string | null; audio_file_id: string | null; score: number | null; created_at: string }[];
  fallbackUrl: string | null;
}) {
  // Fallback: no assigned scenarios — preserve previous single-submission behavior.
  if (assigned.length === 0) {
    if (!fallbackUrl) return null;
    return (
      <section className="rounded-xl border p-4">
        <h4 className="font-semibold mb-2">Roleplay Audio Submission</h4>
        <audio src={fallbackUrl} controls className="w-full" />
      </section>
    );
  }

  const ordered = [...assigned].sort((a, b) => a.position - b.position);

  const pickSession = (title: string | null) => {
    const t = (title ?? "").trim();
    if (!t) return null;
    const candidates = sessions.filter(
      (s) => s.audio_file_id && (s.scenario_name ?? "").trim() === t,
    );
    if (candidates.length === 0) return null;
    const graded = candidates.filter((s) => typeof s.score === "number");
    const pool = graded.length > 0 ? graded : candidates;
    return pool
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  };

  return (
    <section className="rounded-xl border p-4">
      <h4 className="font-semibold mb-3">Roleplay Audio Submissions</h4>
      <div className="space-y-4">
        {ordered.map((a) => {
          const session = pickSession(a.title);
          return (
            <div key={a.scenarioId} className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{a.title ?? "Untitled scenario"}</span>
                {session && typeof session.score === "number" && (
                  <Badge variant="secondary" className="text-xs">{session.score}%</Badge>
                )}
              </div>
              {session?.audio_file_id ? (
                <ScenarioAudio audioFileId={session.audio_file_id} />
              ) : (
                <p className="text-xs text-muted-foreground italic">No recording yet</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ScenarioAudio({ audioFileId }: { audioFileId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchRoleplayAudioUrl(audioFileId)
      .then((u) => {
        if (cancelled) return;
        if (u) setUrl(u);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [audioFileId]);

  if (failed) return <p className="text-xs text-muted-foreground italic">Recording unavailable</p>;
  if (!url) return <div className="h-9 rounded bg-muted/40 animate-pulse" />;
  return <audio src={url} controls className="w-full h-9" />;
}
