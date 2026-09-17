import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Mail, Phone, Globe, Pencil, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CandidateFormDialog } from "@/components/candidate-form-dialog";
import { CandidateFilesCard } from "@/components/candidate-files-card";
import { MatchStatusBadge } from "@/components/match-status";
import {
  fetchCandidateAiProfile,
  fetchMatchesForCandidate,
  labelize,
  saveApprovedSummary,
} from "@/lib/crm-queries";
import {
  addRecruiterNote,
  fetchCandidateDetail,
  fetchJobRoles,
  fetchStaffProfiles,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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

function dateRange(start?: string | null, end?: string | null) {
  const f = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short" }) : null);
  const s = f(start);
  const e = f(end);
  if (!s && !e) return "";
  return `${s ?? "?"} – ${e ?? "Present"}`;
}

function CandidateDetailPage() {
  const { candidateId } = useParams({ from: "/candidates/$candidateId" });
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [note, setNote] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: () => fetchCandidateDetail(candidateId),
  });
  const { data: roles = [] } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaffProfiles });

  const isAdmin = profile?.role === "admin";
  const isOwner = !!data && data.candidate.recruiter_id === profile?.id;
  const canEdit = isAdmin || isOwner;

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

  if (isLoading) {
    return (
      <AppShell title="Candidate">
        <p className="text-sm text-muted-foreground">Loading profile…</p>
      </AppShell>
    );
  }
  if (error || !data) {
    return (
      <AppShell title="Candidate">
        <div className="rounded-2xl border bg-card p-8 text-center">
          <p className="font-medium">Candidate not found</p>
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
        canEdit ? (
          <Button onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" /> View only
          </Badge>
        )
      }
    >
      <div className="space-y-6">
        <Link to="/candidates" className="inline-flex items-center text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to candidate pool
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
                Contact
              </h2>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
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
                  <span key={r} className="rounded-full bg-primary-soft px-2.5 py-1 text-xs text-primary">
                    {r}
                  </span>
                ))}
                {c.status && (
                  <Badge variant="secondary" className="capitalize">
                    {c.status}
                  </Badge>
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">Skills</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.skills.length ? (
                  data.skills.map((s) => (
                    <Badge key={s.id} variant="outline">
                      {s.name}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No skills recorded.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
                Work history
              </h2>
              <div className="mt-3 space-y-4">
                {data.workHistory.length ? (
                  data.workHistory.map((w) => (
                    <div key={w.id} className="border-l-2 border-primary/40 pl-3">
                      <div className="font-medium">{w.title || "Role"}</div>
                      <div className="text-sm text-muted-foreground">
                        {w.company} {dateRange(w.start_date, w.end_date) && `· ${dateRange(w.start_date, w.end_date)}`}
                      </div>
                      {w.description && <p className="mt-1 text-sm">{w.description}</p>}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No work history recorded.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
                Education
              </h2>
              <div className="mt-3 space-y-3">
                {data.education.length ? (
                  data.education.map((e) => (
                    <div key={e.id} className="border-l-2 border-primary/40 pl-3">
                      <div className="font-medium">{e.degree || "Studies"}</div>
                      <div className="text-sm text-muted-foreground">
                        {[e.institution, e.field].filter(Boolean).join(" · ")}{" "}
                        {dateRange(e.start_date, e.end_date)}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No education recorded.</p>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
                Recruiter ownership
              </h2>
              <p className="mt-2 text-sm">{recruiterName}</p>
              {isAdmin ? (
                <div className="mt-3 space-y-2">
                  <Select
                    value={c.recruiter_id ?? "unassigned"}
                    onValueChange={(v: string) => reassign.mutate(v === "unassigned" ? null : v)}
                  >
                    <SelectTrigger>
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
                  <p className="text-xs text-muted-foreground">Admins only: reassign ownership.</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Only an admin can reassign this candidate.
                </p>
              )}
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">Notes</h2>
              {canEdit && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={note}
                    placeholder="Add a recruiter note…"
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button size="sm" onClick={() => saveNote.mutate()} disabled={saveNote.isPending}>
                    {saveNote.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add note
                  </Button>
                </div>
              )}
              <div className="mt-4 space-y-3">
                {data.notes.length ? (
                  data.notes.map((n) => (
                    <div key={n.id} className="rounded-xl bg-primary-soft/60 p-3 text-sm">
                      <p>{n.note}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <CandidateFormDialog open={editOpen} onOpenChange={setEditOpen} candidateId={candidateId} />
    </AppShell>
  );
}
