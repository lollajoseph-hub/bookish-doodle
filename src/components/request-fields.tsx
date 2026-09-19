import { useState } from "react";
import { format } from "date-fns";
import {
  BriefcaseBusiness,
  CalendarIcon,
  Check,
  ChevronDown,
  Clock3,
  FolderKanban,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MultiSelect } from "@/components/multi-select";
import { DAYS_OF_WEEK, ENGAGEMENT_TYPES, type Catalog } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/** Hiring-request fields shared by the public wizard and authenticated request form. */
export interface RequestForm {
  role_id: string;
  engagement_type: string;
  hours_needed: string;
  days_of_week_needed: string[];
  must_have_skill_names: string[];
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
  must_have_skill_names: [],
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
  if (f.must_have_skill_names.length === 0) return "Add at least one must-have skill.";
  if (f.language_skill_ids.length === 0) return "Pick at least one required language.";
  return null;
}

/** Creatable tag input: type a name, press Enter or comma to commit it as a removable pill. */
export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (value.some((v) => v.toLowerCase() === name.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, name]);
    setDraft("");
  };

  return (
    <div
      className="rounded-md border border-input bg-background p-2"
      onKeyDownCapture={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          commit(draft);
        }
      }}
    >
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1 text-xs font-medium text-primary"
            >
              {name}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => onChange(value.filter((v) => v !== name))}
                className="grid h-4 w-4 place-items-center rounded-full text-primary/70 hover:bg-primary/20 hover:text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) {
            v.split(",").forEach(commit);
          } else {
            setDraft(v);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={placeholder}
        className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
      />
    </div>
  );
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

type ChoiceOption = {
  value: string;
  label: string;
  icon?: LucideIcon;
};

function ChoiceCards({
  value,
  onChange,
  options,
  columns = "grid-cols-2 sm:grid-cols-3",
  pageSize,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  columns?: string;
  pageSize?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(pageSize ?? options.length);
  const [revealFrom, setRevealFrom] = useState<number | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const displayedOptions = pageSize
    ? options.slice(0, Math.max(visibleCount, selectedIndex + 1))
    : options;
  const canShowMore = Boolean(pageSize && !value && displayedOptions.length < options.length);

  return (
    <div className="space-y-2.5">
      <div className={cn("grid gap-2", columns)} role="radiogroup">
        {displayedOptions.map((option, index) => {
          const selected = value === option.value;
          const Icon = option.icon ?? BriefcaseBusiness;
          const revealed = revealFrom !== null && index >= revealFrom;
          return (
            <Button
              key={option.value}
              type="button"
              variant="outline"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "group relative h-auto min-h-14 whitespace-normal px-2.5 py-2 text-left transition-all duration-300 ease-out hover:-translate-y-0.5",
                selected
                  ? "scale-[1.02] border-primary bg-primary text-primary-foreground shadow-md hover:bg-primary hover:text-primary-foreground"
                  : "bg-card text-foreground hover:border-primary/40 hover:bg-primary-soft",
                revealed && "wizard-choice-reveal",
              )}
              style={
                revealed ? { animationDelay: `${(index - revealFrom) * 70}ms` } : undefined
              }
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded transition-colors duration-300",
                    selected ? "bg-primary-foreground/15 text-primary-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 text-xs font-medium leading-tight">{option.label}</span>
              </span>
              <Check
                className={cn(
                  "absolute right-2 top-2 h-3.5 w-3.5 transition-all duration-300",
                  selected ? "scale-100 opacity-100" : "scale-50 opacity-0",
                )}
              />
            </Button>
          );
        })}
      </div>
      {canShowMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setRevealFrom(visibleCount);
            setVisibleCount((count) => Math.min(count + (pageSize ?? 0), options.length));
          }}
          className="mx-auto flex text-primary"
        >
          See more
          <ChevronDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

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
    <div className="grid grid-cols-1 gap-5">
      <Field label={catalog.loading ? "Role — loading…" : "Role"} required>
        <ChoiceCards
          value={f.role_id}
          onChange={(v) => set("role_id", v)}
          options={catalog.roles.map((role) => ({ value: role.id, label: role.name }))}
          pageSize={3}
        />
      </Field>
      <Field label="Engagement type" required>
        <ChoiceCards
          value={f.engagement_type}
          onChange={(v) => set("engagement_type", v)}
          options={ENGAGEMENT_TYPES.map((type, index) => ({
            value: type.value,
            label: type.label,
            icon: [BriefcaseBusiness, Clock3, FolderKanban][index],
          }))}
          columns="grid-cols-1 sm:grid-cols-3"
        />
      </Field>
      <Field label="How many hires" required>
        <Input type="number" min="1" step="1" value={f.hires_needed} onChange={(e) => set("hires_needed", e.target.value)} />
      </Field>
    </div>
  );
}

export function RequestScheduleFields(props: RequestFieldsProps) {
  const { f, set } = useRequestFieldProps(props);
  const selectedDate = parseFormDate(f.desired_start_date);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="Hours needed" required hint="e.g. 40 hours/week, or 20–25 hours across mornings">
        <Input value={f.hours_needed} onChange={(e) => set("hours_needed", e.target.value)} placeholder="e.g. 40 hours per week" />
      </Field>
      <Field label="Days of the week needed" required>
        <MultiSelect options={DAYS_OF_WEEK.map((d) => ({ value: d.value, label: d.label }))} value={f.days_of_week_needed} onChange={(v) => set("days_of_week_needed", v)} placeholder="Select days" searchPlaceholder="Search days…" />
      </Field>
      <Field label="Desired start date">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="h-4 w-4" />
              {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => set("desired_start_date", date ? format(date, "yyyy-MM-dd") : "")}
              defaultMonth={selectedDate}
              className="pointer-events-auto p-3"
              classNames={{
                day_button:
                  "transition-[background-color,color,transform,box-shadow] duration-300 data-[selected-single=true]:scale-105 data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:shadow-md",
              }}
            />
          </PopoverContent>
        </Popover>
      </Field>
    </div>
  );
}

function parseFormDate(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

export function RequestRequirementsFields(props: RequestFieldsProps) {
  const { f, set, skillOptions, languageOptions, catalog } = useRequestFieldProps(props);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="md:col-span-2"><Field label="Must-have skills" required hint="Type a skill and press Enter to add it — e.g. Excel, QuickBooks, cold calling.">
        <TagInput value={f.must_have_skill_names} onChange={(v) => set("must_have_skill_names", v)} placeholder="The skills a candidate absolutely must have" />
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
    must_have_skill_names: f.must_have_skill_names,
    notes: f.notes.trim() || null,
  };
}
