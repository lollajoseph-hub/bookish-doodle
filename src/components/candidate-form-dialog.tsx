import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCandidate,
  fetchCandidateDetail,
  fetchJobRoles,
  fetchStaffProfiles,
  updateCandidate,
  type CandidateFormInput,
  type EducationInput,
  type WorkHistoryInput,
} from "@/lib/queries";
import { uploadCandidateFile } from "@/lib/crm-queries";
import type { CandidateFileType } from "@/lib/database.types";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = ["new", "screening", "shortlisted", "placed", "archived"];

function emptyForm(recruiterId: string | null): CandidateFormInput {
  return {
    full_name: "",
    email: "",
    phone: "",
    recruiter_id: recruiterId,
    status: "new",
    headline: "",
    years_experience: null,
    country: "",
    roleIds: [],
    skillNames: [],
    workHistory: [],
    education: [],
  };
}

export function CandidateFormDialog({
  open,
  onOpenChange,
  candidateId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidateId?: string;
  onSaved?: (id: string) => void;
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CandidateFormInput>(() => emptyForm(profile?.id ?? null));
  const [skillInput, setSkillInput] = useState("");

  const { data: roles = [] } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaffProfiles });
  const { data: detail } = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: () => fetchCandidateDetail(candidateId!),
    enabled: !!candidateId && open,
  });

  useEffect(() => {
    if (!open) return;
    if (candidateId && detail) {
      setForm({
        full_name: detail.candidate.full_name ?? "",
        email: detail.candidate.email ?? "",
        phone: detail.candidate.phone ?? "",
        recruiter_id: detail.candidate.recruiter_id ?? null,
        status: detail.candidate.status ?? "new",
        headline: detail.candidate.headline ?? "",
        years_experience: detail.candidate.years_experience ?? null,
        country: detail.candidate.country ?? "",
        roleIds: detail.roleIds,
        skillNames: detail.skills.map((s) => s.name),
        workHistory: detail.workHistory.map((w) => ({
          company: w.company ?? "",
          title: w.title ?? "",
          start_date: w.start_date,
          end_date: w.end_date,
          description: w.description,
        })),
        education: detail.education.map((e) => ({
          institution: e.institution ?? "",
          degree: e.degree ?? "",
          field: e.field,
          start_date: e.start_date,
          end_date: e.end_date,
        })),
      });
    } else if (!candidateId) {
      setForm(emptyForm(profile?.id ?? null));
    }
  }, [open, candidateId, detail, profile?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error("Full name is required");
      if (candidateId) {
        await updateCandidate(candidateId, form);
        return candidateId;
      }
      return createCandidate(form, profile?.id ?? null);
    },
    onSuccess: (id) => {
      toast.success(candidateId ? "Candidate updated" : "Candidate added");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", id] });
      onOpenChange(false);
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof CandidateFormInput>(k: K, v: CandidateFormInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function toggleRole(id: string) {
    set(
      "roleIds",
      form.roleIds.includes(id) ? form.roleIds.filter((r) => r !== id) : [...form.roleIds, id],
    );
  }

  function addSkill() {
    const v = skillInput.trim();
    if (!v) return;
    if (!form.skillNames.some((s) => s.toLowerCase() === v.toLowerCase())) {
      set("skillNames", [...form.skillNames, v]);
    }
    setSkillInput("");
  }

  function updateRow<T>(list: T[], i: number, patch: Partial<T>): T[] {
    return list.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{candidateId ? "Edit candidate" : "Add candidate"}</DialogTitle>
          <DialogDescription>
            Capture contact details, role fit, skills and background.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name *</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="headline">Headline</Label>
              <Input
                id="headline"
                placeholder="e.g. Bilingual CSR, 4 yrs"
                value={form.headline ?? ""}
                onChange={(e) => set("headline", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={form.country ?? ""}
                onChange={(e) => set("country", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="years">Years of experience</Label>
              <Input
                id="years"
                type="number"
                min={0}
                value={form.years_experience ?? ""}
                onChange={(e) =>
                  set("years_experience", e.target.value === "" ? null : Number(e.target.value))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status ?? "new"} onValueChange={(v: string) => set("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assigned recruiter</Label>
              {isAdmin ? (
                <Select
                  value={form.recruiter_id ?? "unassigned"}
                  onValueChange={(v: string) => set("recruiter_id", v === "unassigned" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
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
              ) : (
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                  {staff.find((s) => s.id === form.recruiter_id)?.full_name ||
                    profile?.full_name ||
                    "You"}
                  <span className="ml-2 text-xs">(admins can reassign)</span>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => {
                const on = form.roleIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRole(r.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition-all ${
                      on
                        ? "border-amber bg-amber-soft text-amber-foreground font-medium"
                        : "border-border bg-card hover:border-primary hover:text-primary"
                    }`}
                  >
                    {r.name}
                  </button>
                );
              })}
              {!roles.length && (
                <p className="text-xs text-muted-foreground">No roles yet — add one on the Roles page.</p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <Label>Skills</Label>
            <div className="flex gap-2">
              <Input
                value={skillInput}
                placeholder="Type a skill and press Enter"
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={addSkill}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {form.skillNames.map((s) => (
                <Badge
                  key={s}
                  variant="secondary"
                  className="gap-1 cursor-pointer"
                  onClick={() => set("skillNames", form.skillNames.filter((x) => x !== s))}
                >
                  {s} <Trash2 className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Work history</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  set("workHistory", [
                    ...form.workHistory,
                    { company: "", title: "", start_date: null, end_date: null, description: null },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add role
              </Button>
            </div>
            {form.workHistory.map((w: WorkHistoryInput, i) => (
              <div key={i} className="rounded-xl border p-3 space-y-2 bg-primary-soft/40">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Company"
                    value={w.company}
                    onChange={(e) => set("workHistory", updateRow(form.workHistory, i, { company: e.target.value }))}
                  />
                  <Input
                    placeholder="Job title"
                    value={w.title}
                    onChange={(e) => set("workHistory", updateRow(form.workHistory, i, { title: e.target.value }))}
                  />
                  <Input
                    type="date"
                    value={w.start_date ?? ""}
                    onChange={(e) =>
                      set("workHistory", updateRow(form.workHistory, i, { start_date: e.target.value || null }))
                    }
                  />
                  <Input
                    type="date"
                    value={w.end_date ?? ""}
                    onChange={(e) =>
                      set("workHistory", updateRow(form.workHistory, i, { end_date: e.target.value || null }))
                    }
                  />
                </div>
                <Textarea
                  placeholder="What they did"
                  value={w.description ?? ""}
                  onChange={(e) =>
                    set("workHistory", updateRow(form.workHistory, i, { description: e.target.value }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => set("workHistory", form.workHistory.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Education</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  set("education", [
                    ...form.education,
                    { institution: "", degree: "", field: null, start_date: null, end_date: null },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add education
              </Button>
            </div>
            {form.education.map((e0: EducationInput, i) => (
              <div key={i} className="rounded-xl border p-3 space-y-2 bg-primary-soft/40">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Institution"
                    value={e0.institution}
                    onChange={(e) => set("education", updateRow(form.education, i, { institution: e.target.value }))}
                  />
                  <Input
                    placeholder="Degree"
                    value={e0.degree}
                    onChange={(e) => set("education", updateRow(form.education, i, { degree: e.target.value }))}
                  />
                  <Input
                    placeholder="Field of study"
                    value={e0.field ?? ""}
                    onChange={(e) => set("education", updateRow(form.education, i, { field: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={e0.start_date ?? ""}
                      onChange={(e) =>
                        set("education", updateRow(form.education, i, { start_date: e.target.value || null }))
                      }
                    />
                    <Input
                      type="date"
                      value={e0.end_date ?? ""}
                      onChange={(e) =>
                        set("education", updateRow(form.education, i, { end_date: e.target.value || null }))
                      }
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => set("education", form.education.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>
            ))}
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {candidateId ? "Save changes" : "Add candidate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
