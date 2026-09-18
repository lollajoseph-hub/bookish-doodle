import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TimezoneSelect } from "@/components/timezone-select";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const Route = createFileRoute("/new-request")({
  head: () => ({ meta: [{ title: "New Hiring Request — Candidate Pool" }] }),
  component: () => (
    <AppShell>
      <NewRequest />
    </AppShell>
  ),
});

const POSITIONS = [
  "Practice Owner",
  "Practice Manager",
  "Hospital Administrator",
  
  "Office Manager",
  "HR",
  "Other",
];

const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Temporary"];
const SHIFTS = ["day", "evening", "overnight", "flexible"];

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function NewRequest() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [f, setF] = useState({
    first_name: "",
    last_name: "",
    contact_email: "",
    contact_phone: "",
    position: "",
    company_name: "",
    company_address: "",
    title: "",
    role_needed: "",
    employment_type: "",
    weekly_hours: "",
    shift: "",
    timezone: "",
    country: "",
    min_experience_years: "",
    software_experience: "",
    required_skills: "",
    specialization: "",
    languages: "",
    start_date: "",
    description: "",
    headcount: "1",
  });

  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_client_request", {
      p_client: {
        name: f.company_name,
        address: f.company_address,
        contact_email: f.contact_email,
        contact_phone: f.contact_phone,
        position: f.position,
      },
      p_request: {
        title: f.title || f.role_needed,
        role_needed: f.role_needed,
        specialization: f.specialization,
        location: f.company_address,
        employment_type: f.employment_type,
        weekly_hours: f.weekly_hours,
        shift: f.shift,
        timezone: f.timezone,
        country: f.country,
        min_experience_years: f.min_experience_years,
        software_experience: f.software_experience,
        required_skills: f.required_skills,
        languages: f.languages,
        start_date: f.start_date,
        headcount: f.headcount,
        description: f.description,
      },
      p_client_id: null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Request submitted — matching is running");
    const id = typeof data === "string" ? data : (data as any)?.id ?? data;
    if (id) navigate({ to: "/requests/$id", params: { id: String(id) } });
    else navigate({ to: "/requests" });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Hiring Request</h1>
        <p className="text-sm text-muted-foreground">Tell us about your company and the role you need filled.</p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>Your contact and company details</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="First Name" required>
            <Input value={f.first_name} onChange={(e) => set("first_name")(e.target.value)} required />
          </Field>
          <Field label="Last Name" required>
            <Input value={f.last_name} onChange={(e) => set("last_name")(e.target.value)} required />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={f.contact_email} onChange={(e) => set("contact_email")(e.target.value)} required />
          </Field>
          <Field label="Phone" required>
            <Input value={f.contact_phone} onChange={(e) => set("contact_phone")(e.target.value)} required />
          </Field>
          <Field label="Position">
            <Select value={f.position} onValueChange={set("position")}>
              <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
              <SelectContent>
                {POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Company Name" required>
            <Input value={f.company_name} onChange={(e) => set("company_name")(e.target.value)} required />
          </Field>
          <div className="md:col-span-2">
            <Field label="Company Address" required>
              <Input value={f.company_address} onChange={(e) => set("company_address")(e.target.value)} required />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Hiring Requirements</CardTitle>
          <CardDescription>The essentials — you can submit with just these</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Role" required>
            <Input placeholder="e.g. Front Desk Operator, Receptionist, Client Care Coordinator" value={f.role_needed} onChange={(e) => { const v = e.target.value; set("role_needed")(v); set("title")(v); }} required />
          </Field>
          <Field label="Employment Type" required>
            <Select value={f.employment_type} onValueChange={set("employment_type")}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Additional Notes">
              <Textarea rows={4} value={f.description} onChange={(e) => set("description")(e.target.value)} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="w-full justify-between px-2 font-normal text-muted-foreground hover:text-foreground">
            <span>{detailsOpen ? "− Hide additional details" : "+ Add more details to improve your matches"}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="rounded-2xl mt-2">
            <CardHeader>
              <CardTitle>Additional Details</CardTitle>
              <CardDescription>Optional — helps us find better matches, but you can submit without these</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Weekly Hours">
                <Input type="number" min="0" value={f.weekly_hours} onChange={(e) => set("weekly_hours")(e.target.value)} />
              </Field>
              <Field label="Shift">
                <Select value={f.shift} onValueChange={set("shift")}>
                  <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                  <SelectContent>
                    {SHIFTS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Timezone">
                <TimezoneSelect value={f.timezone} onChange={set("timezone")} />
              </Field>
              <Field label="Experience (min years)">
                <Input type="number" min="0" value={f.min_experience_years} onChange={(e) => set("min_experience_years")(e.target.value)} />
              </Field>
              <Field label="Software Experience">
                <Input placeholder="e.g. Salesforce, HubSpot" value={f.software_experience} onChange={(e) => set("software_experience")(e.target.value)} />
              </Field>
              <Field label="Required Skills">
                <Input placeholder="Comma-separated" value={f.required_skills} onChange={(e) => set("required_skills")(e.target.value)} />
              </Field>
              <Field label="Specialization">
                <Input placeholder="e.g. Enterprise Sales, Payroll" value={f.specialization} onChange={(e) => set("specialization")(e.target.value)} />
              </Field>
              <Field label="Language">
                <Input placeholder="e.g. English, Spanish" value={f.languages} onChange={(e) => set("languages")(e.target.value)} />
              </Field>
              <Field label="Start Date">
                <Input type="date" value={f.start_date} onChange={(e) => set("start_date")(e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/requests" })}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit Request"}</Button>
      </div>
    </form>
  );
}
