import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Building2, Plus, Loader2, Search, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { fetchClients, parseSkillNames } from "@/lib/crm-queries";
import { fetchCandidates, fetchJobRoles, fetchSkills, LANGUAGE_CATEGORY } from "@/lib/queries";
import { MultiSelect } from "@/components/multi-select";
import { FormSection } from "@/components/form-section";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Same list as the Candidate Pool app's get-started wizard, kept in sync.
const INDUSTRY_OPTIONS = [
  "Agriculture",
  "Automotive",
  "Construction",
  "Consulting",
  "Education",
  "Energy",
  "Entertainment",
  "Financial Services",
  "Food & Beverage",
  "Government",
  "Healthcare",
  "Hospitality",
  "Insurance",
  "Legal",
  "Logistics & Transportation",
  "Manufacturing",
  "Marketing & Advertising",
  "Media & Publishing",
  "Non-Profit",
  "Pharmaceuticals",
  "Professional Services",
  "Real Estate",
  "Retail",
  "Software & Technology",
  "Sports & Recreation",
  "Telecommunications",
  "Travel & Tourism",
  "Utilities",
  "Wellness & Fitness",
];

// Same list as the Candidate Pool app's get-started wizard, kept in sync.
const POSITION_OPTIONS = [
  "Owner",
  "Founder/Co-Founder",
  "CEO",
  "President",
  "COO",
  "CFO",
  "General Manager",
  "Operations Manager",
  "Office Manager",
  "Practice Manager",
  "Business Manager",
  "Administrative Manager",
  "HR Director",
  "HR Manager",
  "Recruiting Manager",
  "Talent Acquisition Manager",
  "Marketing Director",
  "Marketing Manager",
  "Sales Director",
  "Sales Manager",
  "Executive Assistant",
];

export const Route = createFileRoute("/clients/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Clients | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Companies ScaleSource places candidates with, their contacts and open requests." },
      { property: "og:title", content: "Clients | ScaleSource" },
      { property: "og:description", content: "Manage ScaleSource client companies and their hiring requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [isOtherIndustry, setIsOtherIndustry] = useState(false);
  const [parentId, setParentId] = useState("none");
  const [isFranchise, setIsFranchise] = useState(false);
  const [contactFirst, setContactFirst] = useState("");
  const [contactLast, setContactLast] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPosition, setContactPosition] = useState("");
  const [isOtherPosition, setIsOtherPosition] = useState(false);
  const navigate = useNavigate();
  // First request (created together with the client)
  const [reqSource, setReqSource] = useState<"standard" | "staff_curated">("standard");
  const [roleId, setRoleId] = useState("");
  const [engagement, setEngagement] = useState("full_time");
  const [reqTitle, setReqTitle] = useState("");
  const [reqNotes, setReqNotes] = useState("");
  const [hours, setHours] = useState("");
  const [tz, setTz] = useState("");
  const [minYears, setMinYears] = useState("");
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [mustSkills, setMustSkills] = useState("");
  const [langIds, setLangIds] = useState<string[]>([]);
  const [niceIds, setNiceIds] = useState<string[]>([]);
  const { data: allSkills = [] } = useQuery({ queryKey: ["skills"], queryFn: fetchSkills });
  const skillOptions = useMemo(() => allSkills.map((s) => ({ id: s.id, label: s.name })), [allSkills]);
  const languageOptions = useMemo(
    () => allSkills.filter((s) => s.category === LANGUAGE_CATEGORY).map((s) => ({ id: s.id, label: s.name })),
    [allSkills],
  );
  const [hiresNeeded, setHiresNeeded] = useState("1");
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [candSearch, setCandSearch] = useState("");

  const { data: clients = [], isLoading } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const { data: roles = [] } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
    enabled: open && reqSource === "staff_curated",
  });
  const filteredCandidates = useMemo(() => {
    const q = candSearch.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) => c.full_name.toLowerCase().includes(q) || (c.headline ?? "").toLowerCase().includes(q),
    );
  }, [candidates, candSearch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || (c.industry ?? "").toLowerCase().includes(q),
    );
  }, [clients, search]);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Company name is required");
      if (!contactFirst.trim() || !contactLast.trim()) {
        throw new Error("Primary contact first and last name are required");
      }
      if (!contactEmail.trim()) throw new Error("Primary contact email is required");

      if (!roleId) throw new Error("Pick a role for the first request");
      const isCustom = reqSource === "staff_curated";
      if (isCustom) {
        if (!candidateIds.length) throw new Error("Pick at least one candidate");
      } else {
        if (!hours.trim()) throw new Error("Hours needed is required");
        if (!langIds.length) throw new Error("Select at least one required language");
        if (!days.length) throw new Error("Select at least one day needed");
      }
      const request = isCustom
        ? {
            source: "staff_curated" as const,
            role_id: roleId,
            title: reqTitle.trim() || null,
            notes: reqNotes.trim() || null,
            engagement_type: engagement,
            candidate_ids: candidateIds,
          }
        : {
            source: "standard" as const,
            role_id: roleId,
            title: null,
            notes: reqNotes.trim() || null,
            engagement_type: engagement,
            hours_needed: hours.trim(),
            timezone_requirement: tz.trim() || null,
            years_experience_min: minYears.trim() ? Number(minYears) : null,
            desired_start_date: startDate || null,
            days_of_week_needed: days,
            must_have_skills_text: mustSkills.trim() || null,
            must_have_skill_names: parseSkillNames(mustSkills),
            language_skill_ids: langIds,
            nice_to_have_skill_ids: niceIds,
            hires_needed: Number(hiresNeeded) || 1,
          };

      const { data, error } = await supabase.functions.invoke("admin-create-client-with-request", {
        body: {
          name: name.trim(),
          industry: industry.trim() || null,
          parent_client_id: parentId === "none" ? null : parentId,
          is_franchise_brand: isFranchise,
          primary_contact: {
            first_name: contactFirst.trim(),
            last_name: contactLast.trim(),
            email: contactEmail.trim(),
            position: contactPosition.trim() || null,
          },
          request,
        },
      });
      const serverError =
        data && typeof data === "object" && "error" in data
          ? (data as { error?: string }).error
          : null;
      if (serverError) throw new Error(serverError);
      if (error) throw new Error(error.message || "Could not add client");
      return data as {
        ok: true;
        client_id: string;
        request_id: string;
        matched_count: number;
        invited: boolean;
        needs_manual_match: boolean;
      };
    },
    onSuccess: (res) => {
      if (res.needs_manual_match) {
        toast.warning(
          "Client and request created, but no candidates matched — add one manually, then send the invite from the client's page",
          { duration: 10000 },
        );
      } else if (res.invited) {
        toast.success("Client added, request created, and invite sent");
      } else {
        toast.success("Client and request created");
      }
      setName("");
      setIndustry("");
      setIsOtherIndustry(false);
      setParentId("none");
      setIsFranchise(false);
      setContactFirst("");
      setContactLast("");
      setContactEmail("");
      setContactPosition("");
      setIsOtherPosition(false);
      setReqSource("standard");
      setRoleId("");
      setEngagement("full_time");
      setReqTitle("");
      setReqNotes("");
      setHours("");
      setTz("");
      setMinYears("");
      setStartDate("");
      setDays([]);
      setMustSkills("");
      setLangIds([]);
      setNiceIds([]);
      setHiresNeeded("1");
      setCandidateIds([]);
      setCandSearch("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client-requests"] });
      if (res.request_id) {
        navigate({ to: "/requests/$requestId", params: { requestId: res.request_id } });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Clients" description="Companies hiring through ScaleSource">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Companies and their open requests</p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add client
        </Button>
      </div>

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="pl-9"
        />
      </div>


      {isLoading && <p className="text-sm text-muted-foreground">Loading clients…</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => (
          <Link
            key={c.id}
            to="/clients/$clientId"
            params={{ clientId: c.id }}
            className="card-amber rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-amber hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="font-semibold">{c.name}</div>
                  {c.industry && (
                    <div className="text-xs text-muted-foreground">{c.industry}</div>
                  )}
                </div>
              </div>
              {c.is_franchise_brand && <Badge variant="secondary">Franchise brand</Badge>}
            </div>
            {c.parentName && (
              <p className="mt-3 text-xs text-muted-foreground">Part of {c.parentName}</p>
            )}
            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {c.memberCount} contacts
              </span>
              <span className="inline-flex items-center gap-1">
                <ClipboardList className="h-3.5 w-3.5" /> {c.openRequests} open requests
              </span>
            </div>
          </Link>
        ))}
      </div>
      {!isLoading && !filtered.length && (
        <p className="text-sm text-muted-foreground">No clients yet.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add client</DialogTitle>
            <DialogDescription>
              Create the company and its first request. The primary contact is invited once the
              request has candidates in it.
            </DialogDescription>
          </DialogHeader>
          <div>
          <FormSection title="Company & primary contact" first>
            <div className="space-y-2">
              <Label htmlFor="client-name">Company name *</Label>
              <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select
                value={isOtherIndustry ? "other" : industry}
                onValueChange={(v) => {
                  if (v === "other") {
                    setIsOtherIndustry(true);
                    setIndustry("");
                  } else {
                    setIsOtherIndustry(false);
                    setIndustry(v);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {isOtherIndustry && (
                <Input
                  id="client-industry"
                  placeholder="Type the industry…"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Parent company</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-xl border p-3 space-y-3">
              <div>
                <Label>Primary contact *</Label>
                <p className="text-xs text-muted-foreground">
                  They receive an email invite to their client account.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contact-first">First name *</Label>
                  <Input
                    id="contact-first"
                    value={contactFirst}
                    onChange={(e) => setContactFirst(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-last">Last name *</Label>
                  <Input
                    id="contact-last"
                    value={contactLast}
                    onChange={(e) => setContactLast(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email *</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Position</Label>
                <Select
                  value={isOtherPosition ? "other" : contactPosition}
                  onValueChange={(v) => {
                    if (v === "other") {
                      setIsOtherPosition(true);
                      setContactPosition("");
                    } else {
                      setIsOtherPosition(false);
                      setContactPosition(v);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITION_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {isOtherPosition && (
                  <Input
                    id="contact-position"
                    placeholder="Type the position…"
                    value={contactPosition}
                    onChange={(e) => setContactPosition(e.target.value)}
                  />
                )}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <Label htmlFor="franchise">Franchise brand</Label>
                <p className="text-xs text-muted-foreground">Groups multiple locations under one brand.</p>
              </div>
              <Switch id="franchise" checked={isFranchise} onCheckedChange={setIsFranchise} />
            </div>
          </FormSection>

          <FormSection title="First request" description="Created together with the client.">
            <div className="grid grid-cols-2 gap-1 rounded-xl border p-1">
              {(["standard", "staff_curated"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setReqSource(v)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    reqSource === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "standard" ? "Standard (auto-match)" : "Custom (hand-picked)"}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select value={roleId} onValueChange={setRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Engagement type *</Label>
                <Select value={engagement} onValueChange={setEngagement}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full time</SelectItem>
                    <SelectItem value="part_time">Part time</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {reqSource === "standard" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="req-hours">Hours needed *</Label>
                    <Input id="req-hours" placeholder="20 hrs/week" value={hours} onChange={(e) => setHours(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="req-tz">Timezone requirement</Label>
                    <Input id="req-tz" placeholder="US Eastern" value={tz} onChange={(e) => setTz(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="req-minyears">Min years experience</Label>
                    <Input id="req-minyears" type="number" min={0} value={minYears} onChange={(e) => setMinYears(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="req-start">Desired start date</Label>
                    <Input id="req-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="req-hires">Hires needed</Label>
                    <Input id="req-hires" type="number" min={1} value={hiresNeeded} onChange={(e) => setHiresNeeded(e.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Days needed *</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS.map((d) => {
                        const on = days.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                              on
                                ? "border border-amber bg-amber-soft text-amber-foreground hover:bg-amber/80"
                                : "border bg-card text-muted-foreground hover:border-amber/60 hover:text-foreground"
                            }`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Required languages *</Label>
                    <MultiSelect
                      options={languageOptions}
                      selected={langIds}
                      onChange={setLangIds}
                      placeholder="Select languages"
                      searchPlaceholder="Search languages…"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Nice-to-have skills</Label>
                    <MultiSelect
                      options={skillOptions}
                      selected={niceIds}
                      onChange={setNiceIds}
                      placeholder="Select skills"
                      searchPlaceholder="Search skills…"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="req-skills">Must-have skills</Label>
                    <Textarea
                      id="req-skills"
                      placeholder="Skills the client says are non-negotiable, e.g. Spanish, QuickBooks"
                      value={mustSkills}
                      onChange={(e) => setMustSkills(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="req-title">Title</Label>
                    <Input id="req-title" value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label>Candidates * </Label>
                      <span className="text-xs text-muted-foreground">{candidateIds.length} selected</span>
                    </div>
                    <Input
                      placeholder="Search candidates…"
                      value={candSearch}
                      onChange={(e) => setCandSearch(e.target.value)}
                    />
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border p-2">
                      {filteredCandidates.map((c) => {
                        const on = candidateIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                              on ? "bg-amber/10" : "hover:bg-muted"
                            }`}
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={on}
                              onCheckedChange={(v) =>
                                setCandidateIds(
                                  v ? [...candidateIds, c.id] : candidateIds.filter((x) => x !== c.id),
                                )
                              }
                            />
                            <span>
                              <span className="font-medium">{c.full_name}</span>
                              {c.headline && (
                                <span className="block text-xs text-muted-foreground">{c.headline}</span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                      {!filteredCandidates.length && (
                        <p className="px-2 py-1 text-xs text-muted-foreground">No candidates found.</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="req-notes">Notes</Label>
                <Textarea id="req-notes" value={reqNotes} onChange={(e) => setReqNotes(e.target.value)} />
              </div>
            </div>
          </FormSection>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
