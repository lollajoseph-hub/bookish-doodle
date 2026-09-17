import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCandidate,
  fetchCandidateDetail,
  fetchJobRoles,
  fetchStaffProfiles,
  updateCandidate,
  LANGUAGE_CATEGORY,
  type CandidateFormInput,
} from "@/lib/queries";
import { uploadCandidateFile } from "@/lib/crm-queries";
import type { CandidateFileType } from "@/lib/database.types";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimezoneSelect } from "@/components/timezone-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const UPLOAD_FIELDS: { key: CandidateFileType; label: string; accept?: string }[] = [
  { key: "profile_photo", label: "Profile photo", accept: "image/*" },
  { key: "resume", label: "Resume", accept: ".pdf,.doc,.docx" },
  { key: "id_document", label: "ID document", accept: "image/*,.pdf" },
  { key: "other", label: "Other / reference documents" },
];

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
    availability: "available",
    timezone: null,
    weekly_hours_available: null,
    preferred_shift: null,
    earliest_start_date: null,
    intro_video_url: null,
    roleIds: [],
    languageNames: [],

  };
}

function FormSection({
  title,
  description,
  first = false,
  children,
}: {
  title: string;
  description?: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-4", !first && "mt-6")}>
      {!first && (
        <div className="mb-6" aria-hidden>
          <div className="h-px bg-amber/70 shadow-[0_0_6px_0_rgb(245_158_11_/_0.55),0_0_14px_2px_rgb(245_158_11_/_0.25)]" />
        </div>
      )}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function CandidateForm({
  candidateId,
  active = true,
  onSaved,
  onCancel,
}: {
  candidateId?: string;
  /** when false (closed dialog) the form resets on next open */
  active?: boolean;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CandidateFormInput>(() => emptyForm(profile?.id ?? null));
  const [files, setFiles] = useState<Partial<Record<CandidateFileType, File>>>({});
  const [videoMode, setVideoMode] = useState<"upload" | "link">("link");
  const [languageDraft, setLanguageDraft] = useState("");

  const { data: roles = [] } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaffProfiles });
  const { data: detail } = useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: () => fetchCandidateDetail(candidateId!),
    enabled: !!candidateId && active,
  });

  useEffect(() => {
    if (!active) return;
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
        availability: detail.candidate.availability ?? "available",
        timezone: detail.candidate.timezone ?? null,
        weekly_hours_available: detail.candidate.weekly_hours_available ?? null,
        preferred_shift: detail.candidate.preferred_shift ?? null,
        earliest_start_date: detail.candidate.earliest_start_date ?? null,
        intro_video_url: detail.candidate.intro_video_url ?? null,
        roleIds: detail.roleIds,
        languageNames: detail.skills
          .filter((s) => s.category === LANGUAGE_CATEGORY)
          .map((s) => s.name),

      });
    } else if (!candidateId) {
      setForm(emptyForm(profile?.id ?? null));
      setFiles({});
    }
  }, [active, candidateId, detail, profile?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error("Full name is required");
      const payload: CandidateFormInput = { ...form };
      const id = candidateId
        ? (await updateCandidate(candidateId, payload), candidateId)
        : await createCandidate(payload, profile?.id ?? null);

      const pending = (Object.entries(files) as [CandidateFileType, File][]).filter(([, f]) => !!f);
      if (pending.length) {
        const results = await Promise.all(
          pending.map(([fileType, file]) =>
            uploadCandidateFile({ candidateId: id, file, fileType, uploadedBy: profile?.id ?? null })
              .then(() => ({ fileType, ok: true as const }))
              .catch((e: Error) => ({ fileType, ok: false as const, message: e.message })),
          ),
        );
        const ok = results.filter((r) => r.ok);
        const failed = results.filter((r) => !r.ok);
        if (ok.length) toast.success(`${ok.length} file${ok.length > 1 ? "s" : ""} uploaded`);
        for (const f of failed) {
          toast.error(
            `${UPLOAD_FIELDS.find((u) => u.key === f.fileType)?.label ?? f.fileType} failed to upload${
              "message" in f && f.message ? `: ${f.message}` : ""
            }`,
          );
        }
      }
      return id;
    },
    onSuccess: (id) => {
      toast.success(candidateId ? "Candidate updated" : "Candidate added");
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", id] });
      queryClient.invalidateQueries({ queryKey: ["candidate-files", id] });
      setFiles({});
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

  function addLanguage(raw: string) {
    const name = raw.trim();
    setLanguageDraft("");
    if (!name) return;
    if (form.languageNames.some((l) => l.toLowerCase() === name.toLowerCase())) return;
    set("languageNames", [...form.languageNames, name]);
  }

  function removeLanguage(name: string) {
    set(
      "languageNames",
      form.languageNames.filter((l) => l !== name),
    );
  }



  function pickFile(key: CandidateFileType, picked: File | undefined) {
    setFiles((prev) => {
      const next = { ...prev };
      if (picked) next[key] = picked;
      else delete next[key];
      return next;
    });
  }

  return (
    <div>
      <FormSection title="Personal information" description="Basic contact details and assignment." first>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name *</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
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
                {staff.find((s) => s.id === form.recruiter_id)?.full_name || profile?.full_name || "You"}
                <span className="ml-2 text-xs">(admins can reassign)</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="h-9 w-full justify-between rounded-md border-input bg-transparent px-3 py-2 text-left font-normal text-foreground shadow-sm"
                >
                  <span className="truncate">
                    {form.roleIds.length
                      ? form.roleIds
                          .map((id) => roles.find((r) => r.id === id)?.name)
                          .filter(Boolean)
                          .join(", ")
                      : "Select roles"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search roles…" />
                  <CommandList>
                    <CommandEmpty>No roles yet — add one on the Roles page.</CommandEmpty>
                    <CommandGroup>
                      {roles.map((r) => {
                        const on = form.roleIds.includes(r.id);
                        return (
                          <CommandItem key={r.id} onSelect={() => toggleRole(r.id)}>
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                on ? "opacity-100 text-primary" : "opacity-0",
                              )}
                            />
                            {r.name}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.roleIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.roleIds.map((id) => {
                  const role = roles.find((r) => r.id === id);
                  if (!role) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleRole(id)}
                      className="rounded-full border-amber bg-amber-soft px-3 py-0.5 text-xs font-medium text-amber-foreground transition-colors hover:bg-amber/80"
                    >
                      {role.name} ✕
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </FormSection>

      <FormSection title="Availability" description="When and how much this candidate can work.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="availability">Schedule</Label>
            <Select
              value={form.availability ?? "available"}
              onValueChange={(v: string) =>
                set("availability", v as CandidateFormInput["availability"])
              }
            >
              <SelectTrigger id="availability">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="open_to_offers">Open to offers</SelectItem>
                <SelectItem value="not_available">Not available</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <TimezoneSelect
              id="timezone"
              value={form.timezone ?? ""}
              onChange={(v) => set("timezone", v || null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weekly_hours">Weekly hours available</Label>
            <Input
              id="weekly_hours"
              type="number"
              min={0}
              max={80}
              placeholder="e.g. 40"
              value={form.weekly_hours_available ?? ""}
              onChange={(e) =>
                set(
                  "weekly_hours_available",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferred_shift">Preferred shift</Label>
            <Input
              id="preferred_shift"
              placeholder="e.g. Morning, Evening, Flexible"
              value={form.preferred_shift ?? ""}
              onChange={(e) => set("preferred_shift", e.target.value || null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="earliest_start">Earliest start date</Label>
            <Input
              id="earliest_start"
              type="date"
              value={form.earliest_start_date ?? ""}
              onChange={(e) => set("earliest_start_date", e.target.value || null)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="languages">Languages</Label>
            <Input
              id="languages"
              placeholder="Type a language and press Enter"
              value={languageDraft}
              onChange={(e) => setLanguageDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addLanguage(languageDraft);
                } else if (e.key === "Backspace" && !languageDraft && form.languageNames.length) {
                  removeLanguage(form.languageNames[form.languageNames.length - 1]!);
                }
              }}
              onBlur={() => addLanguage(languageDraft)}
            />
            {form.languageNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.languageNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => removeLanguage(name)}
                    className="rounded-full border-amber bg-amber-soft px-3 py-0.5 text-xs font-medium text-amber-foreground transition-colors hover:bg-amber/80"
                  >
                    {name} ✕
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

      </FormSection>

      <FormSection
        title="Upload documents"
        description={candidateId ? undefined : "Optional — attached right after the candidate is created."}
      >
        <div className="space-y-3">
          <div>
            <Label>Introductory video</Label>
            <p className="text-xs text-muted-foreground">
              Upload a short intro clip, or paste a link to one (YouTube, Loom, Drive…).
            </p>
          </div>
          <div className="inline-flex rounded-full border bg-card p-0.5 text-xs">
            {(["link", "upload"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setVideoMode(mode)}
                className={`rounded-full px-3 py-1 transition-all ${
                  videoMode === mode
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                {mode === "link" ? "Paste a link" : "Upload a file"}
              </button>
            ))}
          </div>
          {videoMode === "link" ? (
            <Input
              type="url"
              placeholder="https://…"
              value={form.intro_video_url ?? ""}
              onChange={(e) => set("intro_video_url", e.target.value || null)}
            />
          ) : (
            <div className="space-y-1.5 rounded-xl border bg-primary-soft/40 p-3">
              <Input
                type="file"
                accept="video/*"
                className="h-9 text-xs"
                onChange={(e) => pickFile("intro_video", e.target.files?.[0])}
              />
              {files.intro_video && (
                <p className="truncate text-[11px] text-muted-foreground">{files.intro_video.name}</p>
              )}
            </div>
          )}
        </div>

        {!candidateId && (
          <div className="grid gap-3 sm:grid-cols-2">
            {UPLOAD_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5 rounded-xl border p-3 bg-primary-soft/40">
                <Label htmlFor={`file-${f.key}`} className="text-xs">
                  {f.label}
                </Label>
                <Input
                  id={`file-${f.key}`}
                  type="file"
                  accept={f.accept}
                  className="h-9 text-xs"
                  onChange={(e) => pickFile(f.key, e.target.files?.[0])}
                />
                {files[f.key] && (
                  <p className="truncate text-[11px] text-muted-foreground">{files[f.key]!.name}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <div className="mt-6 flex justify-end gap-2 border-t border-primary/25 pt-4">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {candidateId ? "Save changes" : "Add candidate"}
        </Button>
      </div>
    </div>
  );
}
