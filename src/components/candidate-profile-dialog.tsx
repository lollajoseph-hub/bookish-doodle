import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowDown, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  displayName,
  firstNameOnlyAnalysis,
  formatDate,
  signedPhotoUrl,
  signedVideoUrl,
  toStringList,
} from "@/lib/matches";

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
}

const PROFILE_SELECT =
  "candidate_id,full_name,headline,availability,country,timezone,weekly_hours_available,preferred_shift,years_experience,earliest_start_date,approved_summary,highlights,skills,work_history,education,primary_role,secondary_roles,profile_photo_path,intro_video_path";

function availabilityLabel(value: string | null | undefined) {
  switch (value) {
    case "available":
      return "Available Immediately";
    case "open_to_offers":
      return "Open to offers";
    case "not_available":
      return "Not available";
    default:
      return null;
  }
}

interface Entry {
  title: string | null;
  subtitle: string | null;
  period: string | null;
  detail: string | null;
}

function str(o: Record<string, unknown>, ...keys: string[]) {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

/** jsonb arrays of loosely-shaped objects (work history / education). */
function toEntries(v: unknown): Entry[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => {
    if (typeof item === "string") {
      return { title: item, subtitle: null, period: null, detail: null };
    }
    const o = (item ?? {}) as Record<string, unknown>;
    const start = str(o, "start_date", "start", "from", "year_start");
    const end = str(o, "end_date", "end", "to", "year_end") ?? (o["current"] ? "Present" : null);
    const period = str(o, "period", "dates") ?? ([start, end].filter(Boolean).join(" – ") || null);
    return {
      title: str(o, "title", "role", "position", "degree", "qualification", "name"),
      subtitle: str(o, "company", "employer", "organisation", "organization", "institution", "school", "field_of_study"),
      period,
      detail: str(o, "description", "summary", "details", "notes"),
    };
  });
}

export function CandidateProfileDialog({
  candidateId,
  matchStatus,
  onClose,
}: {
  candidateId: string | null;
  matchStatus: string | null;
  onClose: () => void;
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
      setProfile(null);
      setPhoto(null);
      setVideo(null);
      setErr(null);
      return;
    }
    setVisibleWorkCount(5);
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("candidate_pool_profile")
        .select(PROFILE_SELECT)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setErr(error.message);
        return;
      }
      const p = (data as unknown as FullPoolProfile) ?? null;
      setProfile(p);
      const [ph, vi] = await Promise.all([
        signedPhotoUrl(p?.profile_photo_path),
        signedVideoUrl(p?.intro_video_path),
      ]);
      if (cancelled) return;
      setPhoto(ph);
      setVideo(vi);
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea || !candidateId) return;

    const updateScrollState = () => {
      setIsAtTop(scrollArea.scrollTop <= 1);
      setIsAtBottom(scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 1);
    };

    updateScrollState();
    scrollArea.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(scrollArea);
    if (scrollArea.firstElementChild) observer.observe(scrollArea.firstElementChild);

    return () => {
      scrollArea.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [candidateId, loading, profile, visibleWorkCount]);

  const name = displayName(profile?.full_name, matchStatus);
  const approvedSummary = firstNameOnlyAnalysis(profile?.approved_summary, profile?.full_name);
  const highlights = toStringList(profile?.highlights).map((highlight) =>
    firstNameOnlyAnalysis(highlight, profile?.full_name),
  );
  const skills = toStringList(profile?.skills);
  const roles = [...toStringList(profile?.primary_role), ...toStringList(profile?.secondary_roles)];
  const work = toEntries(profile?.work_history);
  const education = toEntries(profile?.education);
  const isHired = matchStatus === "hired";

  return (
    <Dialog open={!!candidateId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="card-amber max-h-[90vh] max-w-2xl overflow-hidden bg-card p-0">
        <div ref={scrollRef} className="candidate-profile-scroll max-h-[90vh] overflow-y-auto scroll-smooth" tabIndex={0}>
        {err && (
          <div className="space-y-4 p-6">
            <DialogHeader>
              <DialogTitle>Candidate profile</DialogTitle>
              <DialogDescription>We couldn&apos;t load this profile.</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {err}
            </div>
          </div>
        )}

        {loading && !profile ? (
          <div className="p-6">
            <DialogHeader>
              <DialogTitle>Loading profile…</DialogTitle>
              <DialogDescription>Full candidate profile</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          </div>
        ) : profile ? (
          <div>
            <div className="bg-primary-soft/60 px-6 py-6">
              <div className="flex items-center gap-5">
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-md ring-2 ring-primary/20"
                  />
                ) : (
                  <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-primary/10 text-3xl font-semibold text-primary ring-2 ring-primary/15">
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  {!isHired && (
                    <p className="text-sm italic text-foreground/70">Meet</p>
                  )}
                  <DialogHeader className="mt-0.5 items-start text-left">
                    <DialogTitle className="text-2xl leading-tight">{name}</DialogTitle>
                    <DialogDescription className="text-sm text-foreground/80">
                      {profile.headline ?? "Full candidate profile"}
                    </DialogDescription>
                  </DialogHeader>
                </div>
              </div>
            </div>

            <div className="space-y-6 px-6 py-6">
              <Separator />

              <section className="space-y-3">
                <h4 className="text-sm font-semibold tracking-tight">Availability</h4>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <Row label="Status" value={availabilityLabel(profile.availability)} />
                <Row label="Country" value={profile.country} />
                <Row label="Timezone" value={profile.timezone} />
                <Row
                  label="Weekly hours"
                  value={profile.weekly_hours_available ? `${profile.weekly_hours_available} hrs` : null}
                />
                <Row label="Preferred shift" value={profile.preferred_shift} />
                <Row
                  label="Experience"
                  value={profile.years_experience ? `${profile.years_experience} years` : null}
                />
                <Row label="Earliest start" value={formatDate(profile.earliest_start_date)} />
                </dl>
              </section>

              {video && (
                <Section title="Intro video">
                  <video src={video} controls className="w-full rounded-xl bg-foreground" preload="metadata" />
                </Section>
              )}

              {(roles.length > 0 || skills.length > 0) && (
                <Section title="Roles & skills">
                  {roles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {roles.map((role, index) => (
                        <Badge
                          key={`${role}-${index}`}
                          variant="secondary"
                          className={index === 0 ? "bg-primary/10 text-primary" : ""}
                        >
                          {role}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map((skill, index) => (
                        <Badge key={`${skill}-${index}`} variant="outline">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  )}
                </Section>
              )}

              {work.length > 0 && (
                <Section title="Work history">
                  <EntryList entries={work.slice(0, visibleWorkCount)} />
                  {visibleWorkCount < work.length && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mx-auto flex text-primary"
                      onClick={() => setVisibleWorkCount((count) => Math.min(count + 5, work.length))}
                    >
                      See more
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  )}
                </Section>
              )}

              {education.length > 0 && (
                <Section title="Education">
                  <EntryList entries={education} />
                </Section>
              )}

              {(approvedSummary || highlights.length > 0) && (
                <Section title="AI Analysis">
                  {approvedSummary && (
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{approvedSummary}</p>
                  )}
                  {highlights.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Highlights</h5>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {highlights.map((highlight, index) => <li key={index}>{highlight}</li>)}
                      </ul>
                    </div>
                  )}
                </Section>
              )}
            </div>
          </div>
        ) : null}
        </div>

        {profile && (
          <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-md border bg-card/95 p-1 shadow-md backdrop-blur-sm">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Scroll profile up"
              disabled={isAtTop}
              onClick={() => scrollRef.current?.scrollBy({ top: -300, behavior: "smooth" })}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Scroll profile down"
              disabled={isAtBottom}
              onClick={() => scrollRef.current?.scrollBy({ top: 300, behavior: "smooth" })}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Separator />
      <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
      {children}
    </div>
  );
}

function EntryList({ entries }: { entries: Entry[] }) {
  return (
    <ol className="space-y-3 border-l pl-4">
      {entries.map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
          <p className="text-sm font-medium">{e.title ?? "—"}</p>
          {e.subtitle && <p className="text-sm text-muted-foreground">{e.subtitle}</p>}
          {e.period && <p className="text-xs text-muted-foreground">{e.period}</p>}
          {e.detail && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{e.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
