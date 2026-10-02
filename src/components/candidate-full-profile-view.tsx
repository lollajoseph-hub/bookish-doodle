import { useEffect, useRef, useState } from "react";
import { ArrowDown, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { availabilityLabel, CandidateSkillGap } from "@/components/candidate-card";
import { CandidateMessages } from "@/components/request-messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";
import { displayName, firstNameOnlyAnalysis, formatDate, signedPhotoUrl, signedVideoUrl, toStringList } from "@/lib/matches";

export interface FullPoolProfile {
  candidate_id: string;
  full_name: string | null;
  headline: string | null;
  availability: string | null;
  country: string | null;
  timezone: string | null;
  weekly_hours_available: number | null;
  preferred_shift: string | null;
  years_experience: number | null;
  earliest_start_date: string | null;
  approved_summary: string | null;
  highlights: unknown;
  skills: unknown;
  work_history: unknown;
  education: unknown;
  primary_role: unknown;
  secondary_roles: unknown;
  profile_photo_path: string | null;
  intro_video_path: string | null;
  intro_video_url: string | null;
}

interface Entry {
  title: string | null;
  subtitle: string | null;
  period: string | null;
  detail: string | null;
}

export const PROFILE_SELECT = "candidate_id,full_name,headline,availability,country,timezone,weekly_hours_available,preferred_shift,years_experience,earliest_start_date,approved_summary,highlights,skills,work_history,education,primary_role,secondary_roles,profile_photo_path,intro_video_path,intro_video_url";


function str(object: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function toEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { title: item, subtitle: null, period: null, detail: null };
    const object = (item ?? {}) as Record<string, unknown>;
    const start = str(object, "start_date", "start", "from", "year_start");
    const end = str(object, "end_date", "end", "to", "year_end") ?? (object["current"] ? "Present" : null);
    return {
      title: str(object, "title", "role", "position", "degree", "qualification", "name"),
      subtitle: str(object, "company", "employer", "organisation", "organization", "institution", "school", "field_of_study"),
      period: str(object, "period", "dates") ?? ([start, end].filter(Boolean).join(" – ") || null),
      detail: str(object, "description", "summary", "details", "notes"),
    };
  });
}

export function CandidateFullProfileView({ candidateId, matchId, matchStatus, matchReason, requiredSkills, candidateSkills, preloadedProfile, preloadedPhotoUrl, scrollable = false }: {
  candidateId: string | null;
  matchId?: string | null;
  matchStatus: string | null;
  matchReason?: string | null;
  requiredSkills?: string[];
  candidateSkills?: string[];
  preloadedProfile?: FullPoolProfile | null;
  /** Already-signed photo URL from the parent, so the photo is there on first paint (no letter-to-photo swap). */
  preloadedPhotoUrl?: string | null;
  scrollable?: boolean;
}) {
  // When the parent already has the profile, render it immediately (no "Loading…" flash between candidates).
  const [profile, setProfile] = useState<FullPoolProfile | null>(preloadedProfile ?? null);
  const [photo, setPhoto] = useState<string | null>(preloadedPhotoUrl ?? null);
  const shownCandidateRef = useRef<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleWorkCount, setVisibleWorkCount] = useState(5);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!candidateId) {
      setProfile(null); setPhoto(null); setVideo(null); setErr(null);
      return;
    }
    const isNewCandidate = shownCandidateRef.current !== candidateId;
    shownCandidateRef.current = candidateId;
    const preloaded = preloadedProfile !== undefined;
    if (isNewCandidate) setVisibleWorkCount(5);
    if (preloaded) {
      // Same data as before, shown without first clearing the view (polling refreshes no longer blank it).
      setProfile(preloadedProfile ?? null); setErr(null); setLoading(false);
    } else {
      setProfile(null); setErr(null); setLoading(true);
      if (isNewCandidate) { setPhoto(null); setVideo(null); }
    }
    // Analytics: record that the client opened this candidate's full profile.
    // Fire-and-forget — never block or break the viewing experience.
    if (matchId) {
      supabase.rpc("log_match_view", { p_match_id: matchId }).then(
        ({ error }) => { if (error) console.warn("log_match_view failed:", error.message); },
        () => {},
      );
    }
    let cancelled = false;
    void (async () => {
      const result = preloadedProfile === undefined
        ? await supabase.from("candidate_pool_profile").select(PROFILE_SELECT).eq("candidate_id", candidateId).maybeSingle()
        : { data: preloadedProfile, error: null };
      if (cancelled) return;
      setLoading(false);
      if (result.error) { setErr(result.error.message); return; }
      const nextProfile = (result.data as unknown as FullPoolProfile) ?? null;
      setProfile(nextProfile);
      const [nextPhoto, nextVideo] = await Promise.all([signedPhotoUrl(nextProfile?.profile_photo_path), signedVideoUrl(nextProfile?.intro_video_path)]);
      if (!cancelled) {
        // Keep the photo already on screen for this candidate so a refresh never re-loads the image.
        setPhoto((current) => (current && (!isNewCandidate || preloadedPhotoUrl) ? current : nextPhoto ?? current));
        setVideo(nextVideo);
      }
    })();
    return () => { cancelled = true; };
  }, [candidateId, preloadedProfile]);

  useEffect(() => {
    const area = scrollRef.current;
    if (!scrollable || !area || !candidateId) return;
    const update = () => {
      setIsAtTop(area.scrollTop <= 1);
      setIsAtBottom(area.scrollTop + area.clientHeight >= area.scrollHeight - 1);
    };
    update();
    area.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(area);
    if (area.firstElementChild) observer.observe(area.firstElementChild);
    return () => { area.removeEventListener("scroll", update); observer.disconnect(); };
  }, [candidateId, loading, profile, scrollable, visibleWorkCount]);

  const name = displayName(profile?.full_name, matchStatus);
  const summary = firstNameOnlyAnalysis(profile?.approved_summary, profile?.full_name);
  const highlights = toStringList(profile?.highlights).map((item) => firstNameOnlyAnalysis(item, profile?.full_name));
  const skills = toStringList(profile?.skills);
  const roles = [...toStringList(profile?.primary_role), ...toStringList(profile?.secondary_roles)];
  const work = toEntries(profile?.work_history);
  const education = toEntries(profile?.education);

  return (
    <div className={scrollable ? "relative" : "card-amber overflow-hidden rounded-[30px]"}>
      <div ref={scrollRef} className={scrollable ? "candidate-profile-scroll max-h-[90vh] overflow-y-auto scroll-smooth" : ""} tabIndex={scrollable ? 0 : undefined}>
        {err && <div className="space-y-4 p-6"><div><h2 className="text-lg font-semibold">Candidate profile</h2><p className="text-sm text-muted-foreground">We couldn&apos;t load this profile.</p></div><div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{err}</div></div>}
        {loading && !profile ? (
          <div className="p-6"><h2 className="text-lg font-semibold">Loading profile…</h2><p className="text-sm text-muted-foreground">Full candidate profile</p><div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></div>
        ) : profile ? (
          <div>
            <div className="bg-gradient-to-br from-primary-soft/80 via-white/40 to-amber-soft/40 px-6 py-7 sm:px-8"><div className="flex items-center gap-5">
              {photo ? <img src={photo} alt="" className="h-24 w-24 shrink-0 rounded-[26px] object-cover shadow-[0_14px_30px_-14px_rgb(46_16_73/0.5)]" /> : <div className="grid h-24 w-24 shrink-0 place-items-center rounded-[26px] bg-gradient-to-br from-[#ebddf7] to-[#d6c2ea] text-3xl font-semibold text-primary shadow-[0_14px_30px_-14px_rgb(46_16_73/0.5)]">{name.slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0"><h2 className="font-display text-[44px] font-semibold leading-[0.95]">{name}</h2><p className="mt-1.5 text-sm text-secondary-foreground">{profile.headline ?? "Full candidate profile"}</p>{matchId && <div className="mt-3"><CandidateMessages matchId={matchId} matchStatus={matchStatus} candidateName={name} /></div>}</div>
            </div></div>
            <div className="space-y-6 px-6 py-6 sm:px-8">
              <Separator />
              <section className="space-y-3"><h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Availability</h3><dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl bg-stone/80 p-4 text-sm tabular-nums shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] sm:grid-cols-3">
                <Row label="Status" value={availabilityLabel(profile.availability)} /><Row label="Country" value={profile.country} /><Row label="Timezone" value={profile.timezone} /><Row label="Weekly hours" value={profile.weekly_hours_available ? `${profile.weekly_hours_available} hrs` : null} /><Row label="Preferred shift" value={profile.preferred_shift} /><Row label="Experience" value={profile.years_experience ? `${profile.years_experience} years` : null} /><Row label="Earliest start" value={formatDate(profile.earliest_start_date)} />
              </dl></section>
               {matchReason?.trim() && (
                 <div>
                   <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Why this candidate</p>
                   <p className="mt-1.5 text-sm leading-relaxed text-secondary-foreground">{matchReason}</p>
                 </div>
               )}
               <CandidateSkillGap requiredSkills={requiredSkills ?? []} candidateSkills={candidateSkills ?? []} />
              {(video || profile.intro_video_url) && <Section title="Introductory Video">{video ? <video src={video} controls className="w-full rounded-2xl bg-[#1d0a2e]" preload="metadata" /> : <LinkedVideo url={profile.intro_video_url!} />}</Section>}
              {roles.length > 0 && <Section title="Roles"><div className="flex flex-wrap gap-1.5">{roles.map((role, index) => <Badge key={`${role}-${index}`} variant="secondary" className={index === 0 ? "rounded-full bg-primary/[0.08] px-3 py-1 text-primary" : "rounded-full px-3 py-1"}>{role}</Badge>)}</div></Section>}
              {skills.length > 0 && <Section title="Skills"><div className="flex flex-wrap gap-1.5">{skills.map((skill, index) => <Badge key={`${skill}-${index}`} variant="outline" className="rounded-full bg-white/80 px-3 py-1 font-medium">{skill}</Badge>)}</div></Section>}
              {work.length > 0 && <Section title="Work history"><EntryList entries={work.slice(0, visibleWorkCount)} />{visibleWorkCount < work.length && <Button type="button" variant="ghost" size="sm" className="mx-auto flex text-primary" onClick={() => setVisibleWorkCount((count) => Math.min(count + 5, work.length))}>See more <ArrowDown className="h-4 w-4" /></Button>}</Section>}
              {education.length > 0 && <Section title="Education"><EntryList entries={education} /></Section>}
              {(summary || highlights.length > 0) && <Section title="Summary">{summary && <p className="whitespace-pre-line text-sm text-muted-foreground">{summary}</p>}{highlights.length > 0 && <div className="space-y-2"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Highlights</h4><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{highlights.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</Section>}
            </div>
          </div>
        ) : null}
      </div>
      {scrollable && profile && <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-full border border-white/80 bg-white/85 p-1 shadow-[0_10px_30px_-12px_rgb(46_16_73/0.45)] backdrop-blur-md"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Scroll profile up" disabled={isAtTop} onClick={() => scrollRef.current?.scrollBy({ top: -300, behavior: "smooth" })}><ChevronUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Scroll profile down" disabled={isAtBottom} onClick={() => scrollRef.current?.scrollBy({ top: 300, behavior: "smooth" })}><ChevronDown className="h-4 w-4" /></Button></div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-semibold">{value}</dd></div>;
}

function youTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/)|youtu\.be\/)([\w-]+)/i);
  return match?.[1] ?? null;
}

function vimeoVideoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return match?.[1] ?? null;
}

function loomVideoId(url: string): string | null {
  const match = url.match(/loom\.com\/share\/([a-f0-9]+)/i);
  return match?.[1] ?? null;
}

const DIRECT_VIDEO_EXTENSION = /\.(mp4|webm|mov|ogg)(\?.*)?(#.*)?$/i;

function LinkedVideo({ url }: { url: string }) {
  const trimmed = url.trim();
  const youTubeId = youTubeVideoId(trimmed);
  if (youTubeId) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-foreground">
        <iframe src={`https://www.youtube.com/embed/${youTubeId}`} title="Introductory video" allow="fullscreen; picture-in-picture" allowFullScreen className="h-full w-full" />
      </div>
    );
  }
  const vimeoId = vimeoVideoId(trimmed);
  if (vimeoId) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-foreground">
        <iframe src={`https://player.vimeo.com/video/${vimeoId}`} title="Introductory video" allow="fullscreen; picture-in-picture" allowFullScreen className="h-full w-full" />
      </div>
    );
  }
  const loomId = loomVideoId(trimmed);
  if (loomId) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-foreground">
        <iframe src={`https://www.loom.com/embed/${loomId}`} title="Introductory video" allow="fullscreen" allowFullScreen className="h-full w-full" />
      </div>
    );
  }
  if (DIRECT_VIDEO_EXTENSION.test(trimmed)) {
    return <video src={trimmed} controls className="w-full rounded-2xl bg-[#1d0a2e]" preload="metadata" />;
  }
  return (
    <a href={trimmed} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      Watch the introductory video <span aria-hidden="true">↗</span>
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2.5"><h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>{children}</div>;
}

function EntryList({ entries }: { entries: Entry[] }) {
  return <ol className="space-y-3 border-l pl-4">{entries.map((entry, index) => <li key={index} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary shadow-[0_0_0_3px_rgb(67_24_103/0.12)]" /><p className="text-sm font-medium">{entry.title ?? "—"}</p>{entry.subtitle && <p className="text-sm text-muted-foreground">{entry.subtitle}</p>}{entry.period && <p className="text-xs text-muted-foreground">{entry.period}</p>}{entry.detail && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{entry.detail}</p>}</li>)}</ol>;
}