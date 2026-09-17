import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { TimezoneSelect } from "@/components/timezone-select";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addCandidateLanguage,
  fetchCandidateLanguages,
  listRecruiters,
  removeCandidateLanguage,
  updateCandidate,
  updateCandidateProfile,
  type CandidateDetail,
  type UpdateCandidateFields,
} from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth";

const UNASSIGNED = "__unassigned__";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "uploaded", label: "Uploaded" },
  { value: "invited", label: "Invited" },
  { value: "training_in_progress", label: "Training in progress" },
  { value: "training_completed", label: "Training completed" },
  { value: "training_expired", label: "Training expired" },
  { value: "training_failed", label: "Training failed" },
  { value: "qualified", label: "Qualified" },
  { value: "placed", label: "Placed" },
  { value: "inactive", label: "Inactive" },
];

const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "open_to_offers", label: "Open to offers" },
  { value: "not_available", label: "Not available" },
];

const SHIFT_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "evening", label: "Evening" },
  { value: "overnight", label: "Overnight" },
  { value: "flexible", label: "Flexible" },
];

const EMPLOYMENT_OPTIONS = [
  { value: "employed", label: "Employed" },
  { value: "unemployed", label: "Unemployed" },
  { value: "self_employed", label: "Self-employed" },
  { value: "student", label: "Student" },
  { value: "open_to_work", label: "Open to work" },
];

function splitName(full: string | null | undefined): { first: string; last: string } {
  const trimmed = (full ?? "").trim();
  if (!trimmed) return { first: "", last: "" };
  const parts = trimmed.split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

interface FormState {
  first_name: string;
  last_name: string;
  phone: string;
  headline: string;
  specialization: string;
  bio: string;
  country: string;
  timezone: string;
  availability: string;
  years_experience: string;
  years_customer_service_experience: string;
  years_veterinary_experience: string;
  weekly_hours_available: string;
  preferred_shift: string;
  employment_status: string;
  status: string;
  recruiter_id: string;
}

function buildInitial(c: CandidateDetail): FormState {
  const { first, last } = splitName(c.profile?.full_name);
  return {
    first_name: first,
    last_name: last,
    phone: c.profile?.phone ?? "",
    headline: c.headline ?? "",
    specialization: c.specialization ?? "",
    bio: c.bio ?? "",
    country: c.country ?? "",
    timezone: c.timezone ?? "",
    availability: c.availability ?? "",
    years_experience: (c as any).years_experience != null ? String((c as any).years_experience) : "",
    years_customer_service_experience:
      c.years_customer_service_experience != null ? String(c.years_customer_service_experience) : "",
    years_veterinary_experience:
      c.years_veterinary_experience != null ? String(c.years_veterinary_experience) : "",
    weekly_hours_available:
      c.weekly_hours_available != null ? String(c.weekly_hours_available) : "",
    preferred_shift: c.preferred_shift ?? "",
    employment_status: c.employment_status ?? "",
    status: c.status,
    recruiter_id: c.recruiter_id ?? UNASSIGNED,
  };
}

const textOrNull = (v: string) => {
  const t = v.trim();
  return t === "" ? null : t;
};
const numOrNull = (v: string) => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
};

export function EditCandidateSheet({
  open,
  onOpenChange,
  candidate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidate: CandidateDetail;
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(() => buildInitial(candidate));

  useEffect(() => {
    if (open) setForm(buildInitial(candidate));
  }, [open, candidate]);

  const recruiters = useQuery({ queryKey: ["recruiters"], queryFn: listRecruiters });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const numbersValid = (["years_experience", "years_customer_service_experience", "years_veterinary_experience", "weekly_hours_available"] as const).every(
    (k) => {
      const v = form[k].trim();
      if (v === "") return true;
      const n = Number(v);
      return !isNaN(n) && n >= 0;
    },
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const candidateUpdate: UpdateCandidateFields = {
        status: form.status,
        recruiter_id: form.recruiter_id === UNASSIGNED ? null : form.recruiter_id,
        headline: textOrNull(form.headline),
        specialization: textOrNull(form.specialization),
        bio: textOrNull(form.bio),
        country: textOrNull(form.country),
        timezone: textOrNull(form.timezone),
        availability: textOrNull(form.availability),
        preferred_shift: textOrNull(form.preferred_shift),
        employment_status: textOrNull(form.employment_status),
        years_experience: numOrNull(form.years_experience),
        years_customer_service_experience: numOrNull(form.years_customer_service_experience),
        years_veterinary_experience: numOrNull(form.years_veterinary_experience),
        weekly_hours_available: numOrNull(form.weekly_hours_available),
      };
      await updateCandidate(candidate.id, candidateUpdate);

      if (isAdmin) {
        const orig = splitName(candidate.profile?.full_name);
        const newFull = `${form.first_name} ${form.last_name}`.trim();
        const origFull = `${orig.first} ${orig.last}`.trim();
        const nameChanged = newFull !== origFull;
        const phoneChanged = (candidate.profile?.phone ?? "") !== form.phone;
        if (nameChanged || phoneChanged) {
          const profileFields: { full_name?: string; phone?: string | null } = {};
          if (nameChanged) profileFields.full_name = newFull;
          if (phoneChanged) profileFields.phone = textOrNull(form.phone);
          await updateCandidateProfile(candidate.profile_id, profileFields);
        }
      }
    },
    onMutate: async () => {
      const key = ["candidate-detail", candidate.id];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<CandidateDetail>(key);
      if (prev) {
        const patched: CandidateDetail = {
          ...prev,
          status: form.status,
          recruiter_id: form.recruiter_id === UNASSIGNED ? null : form.recruiter_id,
          headline: textOrNull(form.headline),
          specialization: textOrNull(form.specialization),
          bio: textOrNull(form.bio),
          country: textOrNull(form.country),
          timezone: textOrNull(form.timezone),
          availability: textOrNull(form.availability),
          preferred_shift: textOrNull(form.preferred_shift),
          employment_status: textOrNull(form.employment_status),
          years_customer_service_experience: numOrNull(form.years_customer_service_experience),
          years_veterinary_experience: numOrNull(form.years_veterinary_experience),
          weekly_hours_available: numOrNull(form.weekly_hours_available),
          profile: prev.profile
            ? {
                ...prev.profile,
                full_name: isAdmin
                  ? `${form.first_name} ${form.last_name}`.trim() || prev.profile.full_name
                  : prev.profile.full_name,
                phone: isAdmin ? textOrNull(form.phone) : prev.profile.phone,
              }
            : prev.profile,
        };
        qc.setQueryData(key, patched);
      }
      return { prev };
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["candidate-detail", candidate.id], ctx.prev);
      const msg = String(err?.message ?? "");
      const code = String(err?.code ?? "");
      if (
        /row-level security|permission/i.test(msg) ||
        code === "42501"
      ) {
        toast.error("You don't have permission to change those fields.");
      } else {
        toast.error(msg || "Failed to update candidate");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidate-detail", candidate.id] });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      toast.success("Candidate updated");
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit candidate</SheetTitle>
          <SheetDescription>
            Update candidate details. {isAdmin ? "" : "Some identity fields are admin-only."}
          </SheetDescription>
        </SheetHeader>

        <form
          className="mt-6 space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!numbersValid) {
              toast.error("Numeric fields must be 0 or greater.");
              return;
            }
            mutation.mutate();
          }}
        >
          <section className="space-y-3">
            <h4 className="text-sm font-semibold">Identity</h4>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                Only admins can edit name and phone.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <Input
                  value={form.first_name}
                  onChange={(e) => set("first_name", e.target.value)}
                  disabled={!isAdmin}
                />
              </Field>
              <Field label="Last name">
                <Input
                  value={form.last_name}
                  onChange={(e) => set("last_name", e.target.value)}
                  disabled={!isAdmin}
                />
              </Field>
            </div>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                disabled={!isAdmin}
              />
            </Field>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold">Profile</h4>
            <Field label="Headline / Experience level">
              <Input value={form.headline} onChange={(e) => set("headline", e.target.value)} />
            </Field>
            <Field label="Specialization">
              <Input
                value={form.specialization}
                onChange={(e) => set("specialization", e.target.value)}
              />
            </Field>
            <Field label="Professional summary">
              <Textarea
                rows={4}
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country">
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
              </Field>
              <Field label="Timezone">
                <TimezoneSelect value={form.timezone} onChange={(v) => set("timezone", v)} />
              </Field>
            </div>
          </section>

          <LanguagesSection candidateId={candidate.id} />



          <section className="space-y-3">
            <h4 className="text-sm font-semibold">Work preferences</h4>
            <Field label="Availability">
              <SelectInput
                value={form.availability}
                onChange={(v) => set("availability", v)}
                options={AVAILABILITY_OPTIONS}
                placeholder="Select availability"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preferred shift">
                <SelectInput
                  value={form.preferred_shift}
                  onChange={(v) => set("preferred_shift", v)}
                  options={SHIFT_OPTIONS}
                  placeholder="Select shift"
                />
              </Field>
              <Field label="Employment status">
                <SelectInput
                  value={form.employment_status}
                  onChange={(v) => set("employment_status", v)}
                  options={EMPLOYMENT_OPTIONS}
                  placeholder="Select status"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Years of experience">
                <Input
                  type="number"
                  min={0}
                  value={form.years_experience}
                  onChange={(e) => set("years_experience", e.target.value)}
                />
              </Field>
              <Field label="Weekly hours available">
                <Input
                  type="number"
                  min={0}
                  value={form.weekly_hours_available}
                  onChange={(e) => set("weekly_hours_available", e.target.value)}
                />
              </Field>
              <Field label="Customer service exp. (yrs)">
                <Input
                  type="number"
                  min={0}
                  value={form.years_customer_service_experience}
                  onChange={(e) => set("years_customer_service_experience", e.target.value)}
                />
              </Field>
              <Field label="Veterinary exp. (yrs)">
                <Input
                  type="number"
                  min={0}
                  value={form.years_veterinary_experience}
                  onChange={(e) => set("years_veterinary_experience", e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold">Assignment</h4>
            <Field label="Candidate status">
              <SelectInput
                value={form.status}
                onChange={(v) => set("status", v)}
                options={STATUS_OPTIONS}
                placeholder="Select status"
              />
            </Field>
            <Field label="Assigned recruiter">
              <Select value={form.recruiter_id} onValueChange={(v) => set("recruiter_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select recruiter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {(recruiters.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.full_name || r.agency_name || "Recruiter"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </section>

          <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LanguagesSection({ candidateId }: { candidateId: string }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");

  const langs = useQuery({
    queryKey: ["candidate-languages", candidateId],
    queryFn: () => fetchCandidateLanguages(candidateId),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["candidate-languages", candidateId] });
    qc.invalidateQueries({ queryKey: ["vetpod-resume", candidateId] });
    qc.invalidateQueries({ queryKey: ["candidate-detail", candidateId] });
  };

  const addMut = useMutation({
    mutationFn: (name: string) => addCandidateLanguage(candidateId, name),
    onSuccess: () => {
      toast.success("Language added");
      setInput("");
      invalidateAll();
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      if (/duplicate|already/i.test(msg)) {
        toast.message("Language already on candidate");
        setInput("");
        invalidateAll();
      } else {
        toast.error(msg || "Failed to add language");
      }
    },
  });

  const removeMut = useMutation({
    mutationFn: (skillId: string) => removeCandidateLanguage(candidateId, skillId),
    onSuccess: () => {
      toast.success("Language removed");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message || "Failed to remove language"),
  });

  const onAdd = () => {
    const name = input.trim();
    if (!name || addMut.isPending) return;
    addMut.mutate(name);
  };

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">Languages</h4>
      <p className="text-xs text-muted-foreground">
        Shown on the VetPod Resume. Add languages the candidate speaks.
      </p>
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {langs.isLoading ? (
          <span className="text-xs text-muted-foreground">Loading…</span>
        ) : (langs.data ?? []).length === 0 ? (
          <span className="text-xs italic text-muted-foreground">None</span>
        ) : (
          (langs.data ?? []).map((l) => (
            <Badge key={l.skillId} variant="secondary" className="gap-1 pr-1">
              {l.name}
              <button
                type="button"
                aria-label={`Remove ${l.name}`}
                disabled={removeMut.isPending}
                onClick={() => removeMut.mutate(l.skillId)}
                className="ml-1 inline-flex items-center justify-center rounded-sm hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a language (e.g. Spanish)"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
        />
        <Button
          type="button"
          onClick={onAdd}
          disabled={!input.trim() || addMut.isPending}
        >
          {addMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Add
        </Button>
      </div>
    </section>
  );
}
