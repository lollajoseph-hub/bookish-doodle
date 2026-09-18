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
import { MultiSelect } from "@/components/multi-select";
import { DAYS_OF_WEEK, ENGAGEMENT_TYPES, type Catalog } from "@/lib/catalog";

/** Hiring-request fields shared by the public wizard and authenticated request form. */
export interface RequestForm {
  role_id: string;
  engagement_type: string;
  hours_needed: string;
  days_of_week_needed: string[];
  must_have_skill_ids: string[];
  language_skill_ids: string[];
  nice_to_have_skill_ids: string[];
  hires_needed: string;
  years_experience_min: string;
  desired_start_date: string;
  notes: string;
}

export const emptyRequestForm: RequestForm = {
  role_id: "",
  engagement_type: "",
  hours_needed: "",
  days_of_week_needed: [],
  must_have_skill_ids: [],
  language_skill_ids: [],
  nice_to_have_skill_ids: [],
  hires_needed: "1",
  years_experience_min: "",
  desired_start_date: "",
  notes: "",
};

/** Returns a human-readable error for the first unmet requirement, or null when valid. */
export function validateRequestForm(f: RequestForm): string | null {
  return validateRoleFields(f) ?? validateScheduleFields(f) ?? validateRequirementsFields(f);
}

export function validateRoleFields(f: RequestForm): string | null {
  if (!f.role_id) return "Pick the role you're hiring for.";
  if (!f.engagement_type) return "Pick an engagement type.";
  if (!f.hires_needed || Number(f.hires_needed) < 1) return "Enter at least one hire.";
  return null;
}

export function validateScheduleFields(f: RequestForm): string | null {
  if (!f.hours_needed.trim()) return "Tell us how many hours you need.";
  if (f.days_of_week_needed.length === 0) return "Pick at least one day of the week.";
  return null;
}

export function validateRequirementsFields(f: RequestForm): string | null {
  if (f.must_have_skill_ids.length === 0) return "Pick at least one must-have skill.";
  if (f.language_skill_ids.length === 0) return "Pick at least one required language.";
  return null;
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

type RequestFieldsProps = {
  value: RequestForm;
  onChange: (next: RequestForm) => void;
  catalog: Catalog;
};

function useRequestFieldProps({ value: f, onChange, catalog }: RequestFieldsProps) {
  const set = <K extends keyof RequestForm>(k: K, v: RequestForm[K]) =>
    onChange({ ...f, [k]: v });
  const skillOptions = catalog.nonLanguageSkills.map((s) => ({
    value: s.id,
    label: s.name,
    group: s.category,
  }));
  const languageOptions = catalog.languageSkills.map((s) => ({ value: s.id, label: s.name }));
  return { f, set, skillOptions, languageOptions, catalog };
}

export function RequestRoleFields(props: RequestFieldsProps) {
  const { f, set, catalog } = useRequestFieldProps(props);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Role" required>
        <Select value={f.role_id} onValueChange={(v) => set("role_id", v)}>
          <SelectTrigger><SelectValue placeholder={catalog.loading ? "Loading roles…" : "Select a role"} /></SelectTrigger>
          <SelectContent>
            {catalog.roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Engagement type" required>
        <Select value={f.engagement_type} onValueChange={(v) => set("engagement_type", v)}>
          <SelectTrigger><SelectValue placeholder="Select engagement type" /></SelectTrigger>
          <SelectContent>
            {ENGAGEMENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="How many hires" required>
        <Input type="number" min="1" step="1" value={f.hires_needed} onChange={(e) => set("hires_needed", e.target.value)} />
      </Field>
    </div>
  );
}

export function RequestScheduleFields(props: RequestFieldsProps) {
  const { f, set } = useRequestFieldProps(props);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Hours needed" required hint="e.g. 40 hours/week, or 20–25 hours across mornings">
        <Input value={f.hours_needed} onChange={(e) => set("hours_needed", e.target.value)} placeholder="e.g. 40 hours per week" />
      </Field>
      <Field label="Days of the week needed" required>
        <MultiSelect options={DAYS_OF_WEEK.map((d) => ({ value: d.value, label: d.label }))} value={f.days_of_week_needed} onChange={(v) => set("days_of_week_needed", v)} placeholder="Select days" searchPlaceholder="Search days…" />
      </Field>
      <Field label="Desired start date">
        <Input type="date" value={f.desired_start_date} onChange={(e) => set("desired_start_date", e.target.value)} />
      </Field>
    </div>
  );
}

export function RequestRequirementsFields(props: RequestFieldsProps) {
  const { f, set, skillOptions, languageOptions, catalog } = useRequestFieldProps(props);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="md:col-span-2"><Field label="Must-have skills" required>
        <MultiSelect options={skillOptions} value={f.must_have_skill_ids} onChange={(v) => set("must_have_skill_ids", v)} placeholder={catalog.loading ? "Loading skills…" : "Select must-have skills"} searchPlaceholder="Search skills…" />
      </Field></div>
      <div className="md:col-span-2"><Field label="Required languages" required>
        <MultiSelect options={languageOptions} value={f.language_skill_ids} onChange={(v) => set("language_skill_ids", v)} placeholder={catalog.loading ? "Loading languages…" : "Select required languages"} searchPlaceholder="Search languages…" />
      </Field></div>
      <div className="md:col-span-2"><Field label="Nice-to-have skills">
        <MultiSelect options={skillOptions} value={f.nice_to_have_skill_ids} onChange={(v) => set("nice_to_have_skill_ids", v)} placeholder="Optional" searchPlaceholder="Search skills…" />
      </Field></div>
      <Field label="Minimum years of experience">
        <Input type="number" min="0" step="1" value={f.years_experience_min} onChange={(e) => set("years_experience_min", e.target.value)} placeholder="Optional" />
      </Field>
      <div className="md:col-span-2"><Field label="Notes">
        <Textarea rows={4} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything else we should know about the role or your team?" />
      </Field></div>
    </div>
  );
}

export function RequestFields({
  value: f,
  onChange,
  catalog,
}: {
  value: RequestForm;
  onChange: (next: RequestForm) => void;
  catalog: Catalog;
}) {
  return (
    <div className="space-y-6">
      <RequestRoleFields value={f} onChange={onChange} catalog={catalog} />
      <RequestScheduleFields value={f} onChange={onChange} catalog={catalog} />
      <RequestRequirementsFields value={f} onChange={onChange} catalog={catalog} />
    </div>
  );
}

/** Shared payload shape derived from the form — matches `client_requests` columns. */
export function requestPayload(f: RequestForm) {
  return {
    role_id: f.role_id,
    engagement_type: f.engagement_type,
    hours_needed: f.hours_needed.trim(),
    days_of_week_needed: f.days_of_week_needed,
    hires_needed: Number(f.hires_needed) || 1,
    years_experience_min: f.years_experience_min ? Number(f.years_experience_min) : null,
    desired_start_date: f.desired_start_date || null,
    notes: f.notes.trim() || null,
  };
}
