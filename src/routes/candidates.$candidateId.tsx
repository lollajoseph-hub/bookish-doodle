import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  MessageSquare,
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  Pencil,
  Lock,
  Loader2,
  Camera,
  Upload,
  Video,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CandidateFormDialog } from "@/components/candidate-form-dialog";
import { CandidateFilesCard } from "@/components/candidate-files-card";
import { InterviewAvailabilityCard } from "@/components/interview-availability-card";
import { MatchStatusBadge } from "@/components/match-status";
import {
  fetchCandidateAiProfile,
  fetchCandidateMedia,
  fetchMatchesForCandidate,
  labelize,
  saveApprovedSummary,
  uploadCandidateFile,
} from "@/lib/crm-queries";
import {
  addRecruiterNote,
  deleteCandidate,
  fetchCandidateDetail,
  fetchJobRoles,
  fetchStaffProfiles,
  type CandidateDetail,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/candidates/$candidateId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Candidate profile | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content: "Full candidate profile: contact details, roles, skills, work history and notes.",
      },
      { property: "og:title", content: "Candidate profile | ScaleSource" },
      {
        property: "og:description",
        content: "Full candidate profile in the ScaleSource Candidate Pool Review System.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CandidateDetailPage,
});

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatPartialDate(d?: string | null): string | null {
  if (!d) return null;
  const trimmed = d.trim();
  if (!trimmed) return null;
  const ym = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (ym) {
    const monthIdx = parseInt(ym[2], 10) - 1;
    if (monthIdx >= 0 && monthIdx < 12) return `${MONTH_ABBR[monthIdx]} ${ym[1]}`;
  }
  const yOnly = /^(\d{4})$/.exec(trimmed);
  if (yOnly) return yOnly[1];
  // Full YYYY-MM-DD or other date strings: build the Date from local components
  // (never pass the raw string into `new Date()`, which parses as UTC and can
  // roll back a day/month/year once reformatted in the viewer's local timezone).
  const full = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (full) {
    const dt = new Date(parseInt(full[1], 10), parseInt(full[2], 10) - 1, parseInt(full[3], 10));
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  }
  return trimmed; // last resort: show the raw stored value rather than a wrong date
}

function dateRange(start?: string | null, end?: string | null) {
  const s = formatPartialDate(start);
  const e = end === "Present" ? "Present" : formatPartialDate(end);
  if (!s && !e) return "";
  return `${s ?? "?"} – ${e ?? "Present"}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function statusTone(status: string) {
  switch (status) {
    case "hired":
    case "placed":
      return "bg-[#e9f2ea] text-[#2f5f35]";
    case "shortlisted":
      return "bg-amber-soft text-gold-ink";
    case "available":
    case "interviewed":
      return "bg-primary-soft text-primary";
    case "rejected":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-foreground/[0.06] text-secondary-foreground";
  }
}

function isDirectVideo(url: string) {
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-amber rounded-3xl p-5 sm:p-6">
      <h2 className="font-display text-2xl font-semibold leading-tight">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CandidateDetailPage() {
  const { candidateId } = useParams({ from: "/candidates/$candidateId" });
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState("overview");
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: () => fetchCandidateDetail(candidateId),
    staleTime: 30_000,
  });
  const { data: roles = [] } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaffProfiles });
  const { data: matches = [] } = useQuery({
    queryKey: ["candidate-matches", candidateId],
    queryFn: () => fetchMatchesForCandidate(candidateId),
  });
  // Poll every 4s until the AI profile row exists (async resume processing),
  // capping at 2 minutes so a genuinely failed pipeline doesn't poll forever.
  const aiPollRef = useRef<{ id: string; start: number } | null>(null);
  const { data: aiProfile } = useQuery({
    queryKey: ["candidate-ai", candidateId],
    queryFn: () => fetchCandidateAiProfile(candidateId),
    refetchInterval: (query) => {
      if (query.state.data) return false;
      const poll =
        aiPollRef.current?.id === candidateId ? aiPollRef.current : null;
      if (!poll) {
        aiPollRef.current = { id: candidateId, start: Date.now() };
        return 4000;
      }
      return Date.now() - poll.start < 120_000 ? 4000 : false;
    },
  });
  const { data: media } = useQuery({
    queryKey: ["candidate-media", candidateId],
    queryFn: () => fetchCandidateMedia(candidateId),
  });

  const isAdmin = profile?.role === "admin";
  const isOwner = !!data && data.candidate.recruiter_id === profile?.id;
  const canEdit = isAdmin || isOwner;

  const uploadPhoto = useMutation({
    mutationFn: (file: File) =>
      uploadCandidateFile({
        candidateId,
        file,
        fileType: "profile_photo",
        uploadedBy: profile?.id ?? null,
      }),
    onSuccess: () => {
      toast.success("Photo updated");
      queryClient.invalidateQueries({ queryKey: ["candidate-media", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidate-files", candidateId] });
    },
    onError: (e: Error) => toast.error(e.message || "Upload failed"),
  });

  const reassign = useMutation({
    mutationFn: async (recruiterId: string | null) => {
      const { error: err } = await supabase
        .from("candidates")
        .update({ recruiter_id: recruiterId })
        .eq("id", candidateId);
      if (err) throw err;
    },
    onSuccess: () => {
      toast.success("Recruiter updated");
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNote = useMutation({
    mutationFn: async () => {
      if (!note.trim()) throw new Error("Write a note first");
      await addRecruiterNote(candidateId, profile!.id, note.trim());
    },
    onSuccess: () => {
      setNote("");
      toast.success("Note added");
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCand = useMutation({
    mutationFn: () => deleteCandidate(candidateId),
    onSuccess: () => {
      toast.success("Candidate deleted");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      navigate({ to: "/candidates" });
    },
    onError: (e: Error & { code?: string }) => {
      if (e.code === "23503" || /foreign key/i.test(e.message)) {
        toast.error(
          "This candidate has a placement on record and can't be deleted — archive them from Admin Tools instead.",
        );
      } else {
        toast.error(e.message || "Delete failed");
      }
    },
  });

  if (isLoading) {
    return (
      <AppShell title="Candidate">
        <div className="space-y-6">
          <div className="h-4 w-40 animate-pulse rounded-full bg-primary/10" />
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="space-y-6">
              <section className="card-amber rounded-[30px] p-6 text-center">
                <div className="mx-auto h-28 w-28 animate-pulse rounded-2xl bg-primary/10" />
                <div className="mx-auto mt-3 h-5 w-40 animate-pulse rounded bg-primary/10" />
                <div className="mx-auto mt-2 h-4 w-52 animate-pulse rounded bg-primary/10" />
                <div className="mt-4 space-y-2 border-t border-[rgb(26_19_32/0.08)] pt-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-primary/10" />
                  ))}
                </div>
              </section>
              <section className="card-amber rounded-3xl p-5">
                <div className="h-4 w-28 animate-pulse rounded bg-primary/10" />
                <div className="mt-3 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-9 animate-pulse rounded-full bg-primary/10" />
                  ))}
                </div>
              </section>
            </div>
            <div className="card-amber rounded-[30px] p-4 sm:p-6">
              <div className="flex w-full flex-wrap gap-1 rounded-full bg-white/70 p-1 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] sm:w-fit">
                {["Overview", "Documents", "AI Profile", "Client Pipeline", "Notes"].map(
                  (label, i) => (
                    <span
                      key={label}
                      className={`rounded-full px-4 py-2 text-[13px] font-semibold ${
                        i === 0
                          ? "bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_rgb(67_24_103/0.6)]"
                          : "text-foreground/70"
                      }`}
                    >
                      {label}
                    </span>
                  ),
                )}
              </div>
              <div className="mt-4 space-y-5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="card-amber rounded-3xl p-5">
                    <div className="h-4 w-24 animate-pulse rounded bg-primary/10" />
                    <div className="mt-3 space-y-2">
                      <div className="h-4 animate-pulse rounded bg-primary/10" />
                      <div className="h-4 w-3/4 animate-pulse rounded bg-primary/10" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell title="Candidate">
        <div className="card-amber rounded-3xl border-dashed p-10 text-center">
          <p className="font-display text-3xl font-medium">Candidate not found</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/candidates" })}>
            Back to pool
          </Button>
        </div>
      </AppShell>
    );
  }

  const c = data.candidate;
  const roleNames = data.roleIds
    .map((id) => roles.find((r) => r.id === id)?.name)
    .filter(Boolean) as string[];
  const recruiterName =
    staff.find((s) => s.id === c.recruiter_id)?.full_name ??
    staff.find((s) => s.id === c.recruiter_id)?.email ??
    "Unassigned";

  return (
    <AppShell
      title={c.full_name}
      description={c.headline ?? roleNames.join(", ")}
      actions={
        canEdit ? null : (
          <Badge variant="secondary" className="h-6 gap-1 rounded-full border-0 bg-foreground/[0.06] px-2.5 text-[11.5px] font-semibold text-secondary-foreground">
            <Lock className="h-3 w-3" /> View only
          </Badge>
        )
      }
    >
      <div className="space-y-6">
        <Link to="/candidates" className="inline-flex items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to candidate pool
        </Link>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* ------------------------------ left rail ------------------------------ */}
          <div className="space-y-6">
            <section className="card-amber rounded-[30px] p-6 text-center">
              <div className="relative mx-auto w-fit">
                <Avatar className="h-28 w-28 rounded-2xl shadow-[0_18px_36px_-20px_rgb(46_16_73/0.55)]">
                  {media?.photoUrl && <AvatarImage src={media.photoUrl} alt={c.full_name} className="object-cover" />}
                  <AvatarFallback className="rounded-2xl bg-gradient-to-br from-[#ebddf7] to-[#d6c2ea] font-display text-3xl font-semibold text-primary">
                    {initials(c.full_name)}
                  </AvatarFallback>
                </Avatar>
                {canEdit && (
                  <>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadPhoto.mutate(f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Upload photo"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploadPhoto.isPending}
                      className="absolute -bottom-1.5 -right-1.5 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_rgb(67_24_103/0.7)] transition-[background-color,box-shadow] duration-300 hover:bg-primary/90"
                    >
                      {uploadPhoto.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>
                  </>
                )}
              </div>
              <h2 className="mt-4 font-display text-[28px] font-semibold leading-tight">{c.full_name}</h2>
              {c.email && <p className="truncate text-sm text-muted-foreground">{c.email}</p>}
              {c.status && (
                <Badge variant="secondary" className={`mt-2 h-6 rounded-full border-0 px-2.5 text-[11.5px] font-semibold capitalize ${statusTone(c.status)}`}>
                  {c.status}
                </Badge>
              )}

              <dl className="mt-5 space-y-2.5 border-t border-[rgb(26_19_32/0.08)] pt-4 text-left text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Role(s)</dt>
                  <dd className="text-right">{roleNames.join(", ") || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Recruiter</dt>
                  <dd className="text-right">{recruiterName}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Experience</dt>
                  <dd className="tabular-nums">{c.years_experience != null ? `${c.years_experience} yrs` : "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Added</dt>
                  <dd className="tabular-nums">{new Date(c.created_at).toLocaleDateString()}</dd>
                </div>
              </dl>
            </section>

            <section className="card-amber rounded-3xl p-5">
              <h2 className="font-display text-2xl font-semibold leading-tight">
                Quick actions
              </h2>
              <div className="mt-3 space-y-2">
                <Button
                  className="w-full justify-start rounded-full border-transparent bg-transparent px-4 py-2 text-foreground/80 hover:border-transparent hover:bg-primary/[0.08] hover:text-primary"
                  variant="ghost"
                  disabled={!canEdit}
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Edit candidate
                </Button>
                <Button
                  className="w-full justify-start rounded-full border-transparent bg-transparent px-4 py-2 text-foreground/80 hover:border-transparent hover:bg-primary/[0.08] hover:text-primary"
                  variant="ghost"
                  onClick={() => setTab("documents")}
                >
                  <Upload className="mr-2 h-4 w-4" /> Upload documents
                </Button>
                {isAdmin && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Reassign recruiter</p>
                    <Select
                      value={c.recruiter_id ?? "unassigned"}
                      onValueChange={(v: string) => reassign.mutate(v === "unassigned" ? null : v)}
                    >
                      <SelectTrigger className="rounded-full">
                        <SelectValue placeholder="Reassign recruiter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name || s.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {isAdmin && (
                  <Button
                    className="w-full justify-start rounded-full border-transparent bg-transparent px-4 py-2 text-destructive hover:border-transparent hover:bg-destructive/10 hover:text-destructive"
                    variant="ghost"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete candidate
                  </Button>
                )}
              </div>
            </section>
          </div>

          {/* ------------------------------- tabs ---------------------------------- */}
          <div className="card-amber rounded-[30px] p-4 sm:p-6">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-full border-0 bg-white/70 p-1 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] backdrop-blur-md sm:w-fit">
                <TabsTrigger
                  value="overview"
                  className="rounded-full px-4 py-2 text-[13px] font-semibold text-foreground/70 transition-[background-color,color,box-shadow] duration-300 hover:bg-primary/[0.08] hover:text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_10px_24px_-12px_rgb(67_24_103/0.6)] data-[state=active]:hover:bg-primary"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="documents"
                  className="rounded-full px-4 py-2 text-[13px] font-semibold text-foreground/70 transition-[background-color,color,box-shadow] duration-300 hover:bg-primary/[0.08] hover:text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_10px_24px_-12px_rgb(67_24_103/0.6)] data-[state=active]:hover:bg-primary"
                >
                  Documents
                </TabsTrigger>
                <TabsTrigger
                  value="ai"
                  className="rounded-full px-4 py-2 text-[13px] font-semibold text-foreground/70 transition-[background-color,color,box-shadow] duration-300 hover:bg-primary/[0.08] hover:text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_10px_24px_-12px_rgb(67_24_103/0.6)] data-[state=active]:hover:bg-primary"
                >
                  AI Profile
                </TabsTrigger>
                <TabsTrigger
                  value="pipeline"
                  className="rounded-full px-4 py-2 text-[13px] font-semibold text-foreground/70 transition-[background-color,color,box-shadow] duration-300 hover:bg-primary/[0.08] hover:text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_10px_24px_-12px_rgb(67_24_103/0.6)] data-[state=active]:hover:bg-primary"
                >
                  Client Pipeline
                </TabsTrigger>
                <TabsTrigger
                  value="availability"
                  className="rounded-full px-4 py-2 text-[13px] font-semibold text-foreground/70 transition-[background-color,color,box-shadow] duration-300 hover:bg-primary/[0.08] hover:text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_10px_24px_-12px_rgb(67_24_103/0.6)] data-[state=active]:hover:bg-primary"
                >
                  Availability
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="rounded-full px-4 py-2 text-[13px] font-semibold text-foreground/70 transition-[background-color,color,box-shadow] duration-300 hover:bg-primary/[0.08] hover:text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-[0_10px_24px_-12px_rgb(67_24_103/0.6)] data-[state=active]:hover:bg-primary"
                >
                  Notes
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-5">
                <SectionCard title="Contact">
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" /> {c.email || "—"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-primary" /> {c.phone || "—"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" /> {c.country || "—"}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Experience:</span>
                      {c.years_experience != null ? `${c.years_experience} yrs` : "—"}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {roleNames.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </SectionCard>

                <IntroVideoCard
                  videoUrl={media?.videoUrl ?? null}
                  linkUrl={c.intro_video_url}
                  mimeType={media?.videoMimeType ?? null}
                />

                <SkillsSection skills={data.skills} />
                <WorkHistorySection workHistory={data.workHistory} />
                <EducationSection education={data.education} />
              </TabsContent>

              <TabsContent value="documents" className="mt-4">
                <CandidateFilesCard candidateId={candidateId} canEdit={canEdit} />
              </TabsContent>

              <TabsContent value="ai" className="mt-4 space-y-5">
                <section className="flex items-center gap-4 card-amber rounded-3xl p-5 sm:p-6">
                  <Avatar className="h-16 w-16 rounded-2xl">
                    {media?.photoUrl && <AvatarImage src={media.photoUrl} alt={c.full_name} className="object-cover" />}
                    <AvatarFallback className="rounded-2xl bg-gradient-to-br from-[#ebddf7] to-[#d6c2ea] font-display text-xl font-semibold text-primary">
                      {initials(c.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="font-display text-2xl font-semibold leading-tight">{c.full_name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {c.headline || roleNames.join(", ") || "No headline"}
                    </p>
                  </div>
                </section>

                <AiSummaryCard
                  candidateId={candidateId}
                  canEdit={canEdit}
                  recruiterSummary={aiProfile?.recruiter_summary ?? null}
                  approvedSummary={aiProfile?.approved_summary ?? null}
                  rankScore={aiProfile?.rank_score ?? null}
                  highlights={(aiProfile?.highlights as string[] | null) ?? null}
                />

                <IntroVideoCard
                  videoUrl={media?.videoUrl ?? null}
                  linkUrl={c.intro_video_url}
                  mimeType={media?.videoMimeType ?? null}
                  showEmpty
                />

                <SkillsSection skills={data.skills} />
                <WorkHistorySection workHistory={data.workHistory} />
                <EducationSection education={data.education} />
              </TabsContent>

              <TabsContent value="pipeline" className="mt-4">
                <SectionCard title="Client pipeline">
                  <div className="space-y-2">
                    {matches.length ? (
                      matches.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-2xl bg-stone/90 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] p-4 transition-[box-shadow,border-color] duration-300 hover:shadow-[inset_0_0_0_1px_rgb(122_89_163/0.25),0_22px_44px_-24px_rgb(46_16_73/0.5)]"
                        >
                          <Link
                            to="/requests/$requestId"
                            params={{ requestId: m.client_request_id }}
                            className="block"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">
                                {m.requestTitle || m.roleName || "Request"}
                              </span>
                              <MatchStatusBadge status={m.status} />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {m.clientName ?? "Client"}
                              {m.status === "rejected" ? ` · ${labelize(m.rejection_reason)}` : ""}
                            </p>
                          </Link>
                          {m.status !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-3 rounded-full"
                              onClick={() => navigate({ to: "/messages", search: { match: m.id } })}
                            >
                              <MessageSquare className="mr-1 h-3.5 w-3.5" /> Talk to us about{" "}
                              {c.full_name.split(" ")[0]}
                            </Button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Not in any client review batch yet.
                      </p>
                    )}
                  </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="availability" className="mt-4">
                <InterviewAvailabilityCard
                  candidateId={candidateId}
                  candidateTimezone={data.candidate.timezone}
                  canEdit={canEdit}
                />
              </TabsContent>

              <TabsContent value="notes" className="mt-4">
                <SectionCard title="Recruiter notes">
                  {canEdit && (
                    <div className="space-y-2">
                      <Textarea
                        value={note}
                        placeholder="Add a recruiter note…"
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <Button size="sm" onClick={() => saveNote.mutate()} disabled={saveNote.isPending}>
                        {saveNote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add note
                      </Button>
                    </div>
                  )}
                  <div className="mt-4 space-y-3">
                    {data.notes.length ? (
                      data.notes.map((n) => (
                        <div key={n.id} className="rounded-2xl bg-stone/90 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] p-4 text-sm">
                          <p>{n.note}</p>
                          <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No notes yet.</p>
                    )}
                  </div>
                </SectionCard>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <CandidateFormDialog open={editOpen} onOpenChange={setEditOpen} candidateId={candidateId} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {c.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes their profile, files, notes, and match history. This can't
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCand.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCand.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteCand.mutate(undefined, { onSettled: () => setDeleteOpen(false) });
              }}
            >
              {deleteCand.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function IntroVideoCard({
  videoUrl,
  linkUrl,
  mimeType = null,
  showEmpty = false,
}: {
  videoUrl: string | null;
  linkUrl: string | null;
  mimeType?: string | null;
  showEmpty?: boolean;
}) {
  if (!videoUrl && !linkUrl) {
    if (!showEmpty) return null;
    return (
      <SectionCard title="Introduction video">
        <p className="text-sm text-muted-foreground">No introductory video yet</p>
      </SectionCard>
    );
  }
  const source = videoUrl ?? linkUrl!;
  const isImage = !!videoUrl && !!mimeType && mimeType.startsWith("image/");
  const isVideoFile = !!videoUrl && (!mimeType || mimeType.startsWith("video/"));
  const embeddable = isVideoFile || (!videoUrl && linkUrl ? isDirectVideo(linkUrl) : false);
  return (
    <SectionCard title="Introduction video">
      {isImage ? (
        <img src={source} alt="Candidate introduction" className="w-full rounded-2xl" />
      ) : embeddable ? (
        <video src={source} controls className="w-full rounded-2xl bg-[#1d0a2e]" />
      ) : (
        <a
          href={source}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-primary/[0.06] px-4 py-2 text-sm font-medium text-primary transition-colors duration-300 hover:bg-primary/[0.1]"
        >
          <Video className="h-4 w-4" /> Open introductory video
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </SectionCard>
  );
}

function SkillsSection({ skills }: { skills: CandidateDetail["skills"] }) {
  return (
    <SectionCard title="Skills">
      <div className="flex flex-wrap gap-2">
        {skills.length ? (
          skills.map((s) => (
            <Badge key={s.id} variant="outline" className="h-6 rounded-full border-0 bg-foreground/[0.06] px-2.5 text-[11.5px] font-semibold text-secondary-foreground">
              {s.name}
            </Badge>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No skills recorded.</p>
        )}
      </div>
    </SectionCard>
  );
}

function WorkHistorySection({ workHistory }: { workHistory: CandidateDetail["workHistory"] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? workHistory : workHistory.slice(0, 5);
  const hidden = workHistory.length - visible.length;
  return (
    <SectionCard title="Work history">
      <div className="space-y-4">
        {workHistory.length ? (
          <>
            {visible.map((w) => (
              <div key={w.id} className="border-l-2 border-[rgb(122_89_163/0.3)] pl-4">
                <div className="font-medium">{w.title || "Role"}</div>
                <div className="text-sm tabular-nums text-muted-foreground">
                  {w.company}{" "}
                  {dateRange(w.start_date, w.end_date) && `· ${dateRange(w.start_date, w.end_date)}`}
                </div>
                {w.description && <p className="mt-1 text-sm">{w.description}</p>}
              </div>
            ))}
            {(hidden > 0 || expanded) && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-primary"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "See less" : `See more (${hidden})`}
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No work history recorded.</p>
        )}
      </div>
    </SectionCard>
  );
}

function EducationSection({ education }: { education: CandidateDetail["education"] }) {
  return (
    <SectionCard title="Education">
      <div className="space-y-3">
        {education.length ? (
          education.map((e) => (
            <div key={e.id} className="border-l-2 border-[rgb(122_89_163/0.3)] pl-4">
              <div className="font-medium">{e.degree || "Studies"}</div>
              <div className="text-sm tabular-nums text-muted-foreground">
                {[e.institution, e.field].filter(Boolean).join(" · ")}{" "}
                {dateRange(e.start_date, e.end_date)}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No education recorded.</p>
        )}
      </div>
    </SectionCard>
  );
}

function AiSummaryCard({
  candidateId,
  canEdit,
  recruiterSummary,
  approvedSummary,
  rankScore,
  highlights,
}: {
  candidateId: string;
  canEdit: boolean;
  recruiterSummary: string | null;
  approvedSummary: string | null;
  rankScore: number | null;
  highlights: string[] | null;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? approvedSummary ?? "";

  const save = useMutation({
    mutationFn: () => saveApprovedSummary(candidateId, value),
    onSuccess: () => {
      toast.success("Summary saved");
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["candidate-ai", candidateId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="card-amber rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold leading-tight">
          Candidate summary
        </h2>
        {rankScore != null && <Badge variant="secondary" className="h-6 rounded-full border-0 bg-primary-soft px-2.5 text-[11.5px] font-semibold tabular-nums text-primary">AI score {rankScore}/15</Badge>}
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          AI-generated recruiter summary
        </p>
        <p className="rounded-2xl bg-primary/[0.06] p-4 text-sm">
          {recruiterSummary || "No AI summary generated yet."}
        </p>
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Approved client-facing summary
        </p>
        {canEdit ? (
          <>
            <Textarea
              value={value}
              placeholder="Approved summary shared with clients…"
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save summary
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {approvedSummary || "No approved summary yet."}
          </p>
        )}
      </div>
      {highlights && highlights.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Highlights (client-visible)
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
