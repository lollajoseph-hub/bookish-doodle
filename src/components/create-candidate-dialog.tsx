import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, X } from "lucide-react";
import { TimezoneSelect } from "@/components/timezone-select";
import { toast } from "sonner";
import {
  fetchPublishedCourses,
  invokeCreateCandidate,
  updateCandidateYearsExperience,
  updateCandidateIntroVideoUrl,
  isLikelyValidUrl,
  uploadCandidateFile,
  resendInvitation,
  type UploadSpec,
} from "@/lib/queries";

const schema = z.object({
  first_name: z.string().min(1, "Required"),
  last_name: z.string().min(1, "Required"),
  email: z.string().email(),
  phone: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  experience_level: z.string().optional(),
  years_customer_service_experience: z.string().optional(),
  notes: z.string().optional(),
  course_id: z.string().min(1, "Select a course"),
});

type FormState = z.infer<typeof schema>;

interface FileSlot {
  key: keyof typeof FILE_SLOTS;
  file: File | null;
}

const FILE_SLOTS = {
  passport_photo: {
    label: "Passport Photograph",
    accept: "image/*",
    bucket: "candidate-photos" as const,
    fileType: "profile_photo" as const,
  },
  id_doc: {
    label: "Government-issued Photo ID",
    accept: "image/*,application/pdf",
    bucket: "candidate-resumes" as const,
    fileType: "id_document" as const,
  },
  resume: {
    label: "Original Resume / CV",
    accept: ".pdf,.doc,.docx",
    bucket: "candidate-resumes" as const,
    fileType: "original_resume" as const,
  },
  intro_video: {
    label: "Introduction Video",
    accept: "video/*,application/pdf",
    bucket: "intro-videos" as const,
    fileType: "intro_video" as const,
  },
  other: {
    label: "Additional Supporting Documents",
    accept: "*",
    bucket: "candidate-resumes" as const,
    fileType: "other" as const,
  },
};

const EXPERIENCE_LEVELS = ["Entry", "Junior", "Mid", "Senior", "Lead"];

export function CreateCandidateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    country: "",
    timezone: "",
    experience_level: "",
    years_customer_service_experience: "",
    notes: "",
    course_id: "",
  });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: string } | null>(null);
  const [uploadResults, setUploadResults] = useState<{ label: string; ok: boolean; error?: string }[]>([]);
  const [introVideoMode, setIntroVideoMode] = useState<"file" | "link">("file");
  const [introVideoUrl, setIntroVideoUrl] = useState("");

  const courses = useQuery({ queryKey: ["published-courses"], queryFn: fetchPublishedCourses, enabled: open });

  useEffect(() => {
    if (open) {
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        country: "",
        timezone: "",
        experience_level: "",
        years_customer_service_experience: "",
        notes: "",
        course_id: "",
      });
      setFiles({});
      setIntroVideoMode("file");
      setIntroVideoUrl("");
      setCreated(null);
      setUploadResults([]);
    }
  }, [open]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const resendMutation = useMutation({
    mutationFn: (id: string) => resendInvitation(id),
    onSuccess: () => toast.success("Invitation resent"),
    onError: (e: Error) => toast.error(e.message),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setSubmitting(true);
    try {
      const yearsNum = form.years_customer_service_experience
        ? Number(form.years_customer_service_experience)
        : undefined;
      const res = await invokeCreateCandidate({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || undefined,
        country: form.country || undefined,
        timezone: form.timezone || undefined,
        experience_level: form.experience_level || undefined,
        notes: form.notes || undefined,
        course_id: form.course_id,
      });
      const candidateId = res.candidate.id;
      setCreated({ id: candidateId });
      toast.success("Candidate created and invited");

      if (yearsNum != null && !isNaN(yearsNum)) {
        try {
          await updateCandidateYearsExperience(candidateId, yearsNum);
        } catch (err) {
          toast.error(`Couldn't save years of experience: ${(err as Error).message}`);
        }
      }

      const extraResults: { label: string; ok: boolean; error?: string }[] = [];
      if (introVideoMode === "link" && introVideoUrl.trim()) {
        if (!isLikelyValidUrl(introVideoUrl)) {
          toast.error("Introduction video link must be a valid http(s) URL");
        } else {
          try {
            await updateCandidateIntroVideoUrl(candidateId, introVideoUrl.trim());
            extraResults.push({ label: "Introduction Video (link)", ok: true });
          } catch (err) {
            extraResults.push({
              label: "Introduction Video (link)",
              ok: false,
              error: (err as Error).message,
            });
          }
        }
      }

      const specs: { label: string; spec: UploadSpec }[] = [];
      for (const [key, slot] of Object.entries(FILE_SLOTS)) {
        if (key === "intro_video" && introVideoMode === "link") continue;
        const f = files[key];
        if (f) specs.push({ label: slot.label, spec: { file: f, bucket: slot.bucket, fileType: slot.fileType } });
      }
      if (specs.length) {
        const results = await Promise.all(
          specs.map(async ({ label, spec }) => {
            try {
              await uploadCandidateFile(candidateId, spec);
              return { label, ok: true };
            } catch (err) {
              return { label, ok: false, error: (err as Error).message };
            }
          }),
        );
        setUploadResults([...results, ...extraResults]);
      } else if (extraResults.length) {
        setUploadResults(extraResults);
      }
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Candidate</DialogTitle>
          <DialogDescription>
            Send an invite email and enroll the candidate in a VetPod course. Files upload after the
            account is created.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-[color:var(--color-success)]/15 border border-[color:var(--color-success)]/30 p-4 text-sm">
              Candidate created and invitation sent.
            </div>
            {uploadResults.length > 0 && (
              <div className="rounded-xl border p-4">
                <div className="text-sm font-medium mb-2">File uploads</div>
                <ul className="space-y-1 text-sm">
                  {uploadResults.map((r) => (
                    <li key={r.label} className={r.ok ? "text-foreground" : "text-destructive"}>
                      {r.ok ? "✓" : "✗"} {r.label}
                      {!r.ok && r.error ? ` — ${r.error}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => resendMutation.mutate(created.id)}
                disabled={resendMutation.isPending}
              >
                {resendMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Resend invitation
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" required>
                <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} required />
              </Field>
              <Field label="Last name" required>
                <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} required />
              </Field>
              <Field label="Email" required className="col-span-2">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
              </Field>
              <Field label="Timezone">
                <TimezoneSelect
                  value={form.timezone ?? ""}
                  onChange={(v) => set("timezone", v)}
                />
              </Field>
              <Field label="Experience level">
                <Select value={form.experience_level} onValueChange={(v) => set("experience_level", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Previous CS experience (years)" className="col-span-2">
                <Input
                  type="number"
                  min={0}
                  value={form.years_customer_service_experience}
                  onChange={(e) => set("years_customer_service_experience", e.target.value)}
                />
              </Field>
              <Field label="Assign VetPod course" required className="col-span-2">
                <Select value={form.course_id} onValueChange={(v) => set("course_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={courses.isLoading ? "Loading…" : "Select a published course"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(courses.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Professional summary / notes" className="col-span-2">
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Field>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Uploads (optional)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(FILE_SLOTS)
                  .filter(([key]) => key !== "intro_video")
                  .map(([key, slot]) => (
                    <FileField
                      key={key}
                      label={slot.label}
                      accept={slot.accept}
                      file={files[key] ?? null}
                      onChange={(f) => setFiles((p) => ({ ...p, [key]: f }))}
                    />
                  ))}
              </div>

              <div className="mt-3 rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{FILE_SLOTS.intro_video.label}</span>
                  <div className="flex rounded-md border overflow-hidden">
                    {(["file", "link"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setIntroVideoMode(m)}
                        className={`px-3 py-1 text-xs ${
                          introVideoMode === m
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground"
                        }`}
                      >
                        {m === "file" ? "Upload file" : "Paste link"}
                      </button>
                    ))}
                  </div>
                </div>
                {introVideoMode === "file" ? (
                  <FileField
                    label={FILE_SLOTS.intro_video.label}
                    accept={FILE_SLOTS.intro_video.accept}
                    file={files["intro_video"] ?? null}
                    onChange={(f) => setFiles((p) => ({ ...p, intro_video: f }))}
                  />
                ) : (
                  <Input
                    type="url"
                    placeholder="https://youtube.com/watch?v=... or https://loom.com/share/..."
                    value={introVideoUrl}
                    onChange={(e) => setIntroVideoUrl(e.target.value)}
                  />
                )}
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                Files are uploaded after the account is created.
              </p>
            </div>


            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create & send invite
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function FileField({
  label,
  accept,
  file,
  onChange,
}: {
  label: string;
  accept: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-xl border border-dashed p-3 text-sm cursor-pointer hover:bg-secondary/50 transition-colors">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground truncate">
          {file ? file.name : "Click to select"}
        </div>
      </div>
      {file ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onChange(null);
          }}
          className="rounded-md p-1 hover:bg-secondary"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <Upload className="h-4 w-4 text-muted-foreground" />
      )}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
