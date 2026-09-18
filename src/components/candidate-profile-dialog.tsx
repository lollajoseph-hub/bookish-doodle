import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { displayName, formatDate, signedPhotoUrl, signedVideoUrl, toStringList } from "@/lib/matches";

export interface FullPoolProfile {
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
  work_history: unknown;
  education: unknown;
  primary_role: unknown;
  secondary_roles: unknown;
  profile_photo_path: string | null;
  intro_video_path: string | null;
}

const PROFILE_SELECT =
  "candidate_id,full_name,headline,country,timezone,weekly_hours_available,preferred_shift,years_experience,earliest_start_date,approved_summary,highlights,skills,work_history,education,primary_role,secondary_roles,profile_photo_path,intro_video_path";

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
    const period = str(o, "period", "dates") ?? [start, end].filter(Boolean).join(" – ") || null;
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

  useEffect(() => {
    if (!candidateId) {
      setProfile(null);
      setPhoto(null);
      setVideo(null);
      setErr(null);
      return;
    }
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

  const name = displayName(profile?.full_name, matchStatus);
  const highlights = toStringList(profile?.highlights);
  const skills = toStringList(profile?.skills);
  const roles = [...toStringList(profile?.primary_role), ...toStringList(profile?.secondary_roles)];
  const work = toEntries(profile?.work_history);
  const education = toEntries(profile?.education);

  return (
    <Dialog open={!!candidateId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{loading ? "Loading profile…" : name}</DialogTitle>
          <DialogDescription>{profile?.headline ?? "Full candidate profile"}</DialogDescription>
        </DialogHeader>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {err}
          </div>
        )}

        {loading && !profile ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : profile ? (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              {photo ? (
                <img src={photo} alt="" className="h-24 w-24 flex-none rounded-2xl object-cover ring-2 ring-primary/15" />
              ) : (
                <div className="grid h-24 w-24 flex-none place-items-center rounded-2xl bg-primary/10 text-3xl font-semibold text-primary">
                  {name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm">
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
            </div>

            {roles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {roles.map((r, i) => (
                  <Badge key={`${r}-${i}`} variant="secondary" className={i === 0 ? "bg-primary/10 text-primary" : ""}>
                    {r}
                  </Badge>
                ))}
              </div>
            )}

            {video && (
              <Section title="Intro video">
                <video src={video} controls className="w-full rounded-xl bg-black" preload="metadata" />
              </Section>
            )}

            {profile.approved_summary && (
              <Section title="Summary">
                <p className="whitespace-pre-line text-sm text-muted-foreground">{profile.approved_summary}</p>
              </Section>
            )}

            {highlights.length > 0 && (
              <Section title="Highlights">
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </Section>
            )}

            {skills.length > 0 && (
              <Section title="Skills">
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s, i) => (
                    <Badge key={`${s}-${i}`} variant="outline">
                      {s}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {work.length > 0 && (
              <Section title="Work history">
                <EntryList entries={work} />
              </Section>
            )}

            {education.length > 0 && (
              <Section title="Education">
                <EntryList entries={education} />
              </Section>
            )}
          </div>
        ) : null}
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
