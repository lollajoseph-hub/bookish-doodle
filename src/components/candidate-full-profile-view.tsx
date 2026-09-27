import { useEffect, useRef, useState } from "react";
import { ArrowDown, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { CandidateMessages } from "@/components/request-messages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";
import { displayName, firstNameOnlyAnalysis, formatDate, signedPhotoUrl, signedVideoUrl, toStringList } from "@/lib/matches";

interface FullPoolProfile {
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
}

interface Entry {
  title: string | null;
  subtitle: string | null;
  period: string | null;
  detail: string | null;
}

const PROFILE_SELECT = "candidate_id,full_name,headline,availability,country,timezone,weekly_hours_available,preferred_shift,years_experience,earliest_start_date,approved_summary,highlights,skills,work_history,education,primary_role,secondary_roles,profile_photo_path,intro_video_path";

function availabilityLabel(value: string | null | undefined) {
  if (value === "available") return "Available Immediately";
  if (value === "open_to_offers") return "Open to offers";
  if (value === "not_available") return "Not available";
  return null;
}

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

export function CandidateFullProfileView({ candidateId, matchId, matchStatus, scrollable = false }: {
  candidateId: string | null;
  matchId?: string | null;
  matchStatus: string | null;
  scrollable?: boolean;
}) {
  const [profile, setProfile] = useState<FullPoolProfile | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
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
    setVisibleWorkCount(5); setProfile(null); setErr(null); setLoading(true);
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from("candidate_pool_profile").select(PROFILE_SELECT).eq("candidate_id", candidateId).maybeSingle();
      if (cancelled) return;
      setLoading(false);
      if (error) { setErr(error.message); return; }
      const nextProfile = (data as unknown as FullPoolProfile) ?? null;
      setProfile(nextProfile);
      const [nextPhoto, nextVideo] = await Promise.all([signedPhotoUrl(nextProfile?.profile_photo_path), signedVideoUrl(nextProfile?.intro_video_path)]);
      if (!cancelled) { setPhoto(nextPhoto); setVideo(nextVideo); }
    })();
    return () => { cancelled = true; };
  }, [candidateId]);

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
    <div className={scrollable ? "relative" : "overflow-hidden rounded-lg border border-border bg-card"}>
      <div ref={scrollRef} className={scrollable ? "candidate-profile-scroll max-h-[90vh] overflow-y-auto scroll-smooth" : ""} tabIndex={scrollable ? 0 : undefined}>
        {err && <div className="space-y-4 p-6"><div><h2 className="text-lg font-semibold">Candidate profile</h2><p className="text-sm text-muted-foreground">We couldn&apos;t load this profile.</p></div><div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{err}</div></div>}
        {loading && !profile ? (
          <div className="p-6"><h2 className="text-lg font-semibold">Loading profile…</h2><p className="text-sm text-muted-foreground">Full candidate profile</p><div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></div>
        ) : profile ? (
          <div>
            <div className="bg-primary-soft/60 px-6 py-6"><div className="flex items-center gap-5">
              {photo ? <img src={photo} alt="" className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-md ring-2 ring-primary/20" /> : <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-primary/10 text-3xl font-semibold text-primary ring-2 ring-primary/15">{name.slice(0, 1).toUpperCase()}</div>}
              <div className="min-w-0">{matchStatus !== "hired" && <p className="text-sm italic text-foreground/70">Meet</p>}<h2 className="mt-0.5 text-2xl font-semibold leading-tight">{name}</h2><p className="text-sm text-foreground/80">{profile.headline ?? "Full candidate profile"}</p>{matchId && <div className="mt-3"><CandidateMessages matchId={matchId} matchStatus={matchStatus} candidateName={name} /></div>}</div>
            </div></div>
            <div className="space-y-6 px-6 py-6">
              <Separator />
              <section className="space-y-3"><h3 className="text-sm font-semibold tracking-tight">Availability</h3><dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <Row label="Status" value={availabilityLabel(profile.availability)} /><Row label="Country" value={profile.country} /><Row label="Timezone" value={profile.timezone} /><Row label="Weekly hours" value={profile.weekly_hours_available ? `${profile.weekly_hours_available} hrs` : null} /><Row label="Preferred shift" value={profile.preferred_shift} /><Row label="Experience" value={profile.years_experience ? `${profile.years_experience} years` : null} /><Row label="Earliest start" value={formatDate(profile.earliest_start_date)} />
              </dl></section>
              {video && <Section title="Introductory Video"><video src={video} controls className="w-full rounded-xl bg-foreground" preload="metadata" /></Section>}
              {roles.length > 0 && <Section title="Roles"><div className="flex flex-wrap gap-1.5">{roles.map((role, index) => <Badge key={`${role}-${index}`} variant="secondary" className={index === 0 ? "bg-primary/10 text-primary" : ""}>{role}</Badge>)}</div></Section>}
              {skills.length > 0 && <Section title="Skills"><div className="flex flex-wrap gap-1.5">{skills.map((skill, index) => <Badge key={`${skill}-${index}`} variant="outline">{skill}</Badge>)}</div></Section>}
              {work.length > 0 && <Section title="Work history"><EntryList entries={work.slice(0, visibleWorkCount)} />{visibleWorkCount < work.length && <Button type="button" variant="ghost" size="sm" className="mx-auto flex text-primary" onClick={() => setVisibleWorkCount((count) => Math.min(count + 5, work.length))}>See more <ArrowDown className="h-4 w-4" /></Button>}</Section>}
              {education.length > 0 && <Section title="Education"><EntryList entries={education} /></Section>}
              {(summary || highlights.length > 0) && <Section title="AI Analysis">{summary && <p className="whitespace-pre-line text-sm text-muted-foreground">{summary}</p>}{highlights.length > 0 && <div className="space-y-2"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Highlights</h4><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{highlights.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</Section>}
            </div>
          </div>
        ) : null}
      </div>
      {scrollable && profile && <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-md border bg-card/95 p-1 shadow-md backdrop-blur-sm"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Scroll profile up" disabled={isAtTop} onClick={() => scrollRef.current?.scrollBy({ top: -300, behavior: "smooth" })}><ChevronUp className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Scroll profile down" disabled={isAtBottom} onClick={() => scrollRef.current?.scrollBy({ top: 300, behavior: "smooth" })}><ChevronDown className="h-4 w-4" /></Button></div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Separator /><h3 className="text-sm font-semibold tracking-tight">{title}</h3>{children}</div>;
}

function EntryList({ entries }: { entries: Entry[] }) {
  return <ol className="space-y-3 border-l pl-4">{entries.map((entry, index) => <li key={index} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" /><p className="text-sm font-medium">{entry.title ?? "—"}</p>{entry.subtitle && <p className="text-sm text-muted-foreground">{entry.subtitle}</p>}{entry.period && <p className="text-xs text-muted-foreground">{entry.period}</p>}{entry.detail && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{entry.detail}</p>}</li>)}</ol>;
}