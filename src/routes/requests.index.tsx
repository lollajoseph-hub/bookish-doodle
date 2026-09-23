import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { CuratedBadge, RequestStatusBadge } from "@/components/match-status";
import {
  createClientRequest,
  fetchClientRequests,
  fetchClients,
  labelize,
} from "@/lib/crm-queries";
import { fetchJobRoles } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSection } from "@/components/form-section";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

const STATUS_TABS = ["all", "open", "needs_attention", "fulfilled", "closed"] as const;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Scrollable area with sidebar-style up/down arrows instead of a scrollbar. */
function ArrowScrollArea({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [canScroll, setCanScroll] = useState({ up: false, down: false });

  const updateScrollState = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScroll({
      up: el.scrollTop > 4,
      down: el.scrollTop + el.clientHeight < el.scrollHeight - 4,
    });
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollState]);

  const scroll = (dir: number) =>
    ref.current?.scrollBy({ top: dir * 160, behavior: "smooth" });

  return (
    <div className="relative flex min-h-0 flex-col">
      <div
        ref={ref}
        onScroll={updateScrollState}
        className="max-h-[58vh] space-y-4 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {canScroll.up && (
        <button
          type="button"
          aria-label="Scroll up"
          onClick={() => scroll(-1)}
          className="absolute left-1/2 top-0 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground/80 shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      )}
      {canScroll.down && (
        <button
          type="button"
          aria-label="Scroll down"
          onClick={() => scroll(1)}
          className="mx-auto mt-2 flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground/80 shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export const Route = createFileRoute("/requests/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Client requests | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "The queue of open hiring requests from ScaleSource clients." },
      { property: "og:title", content: "Client requests | ScaleSource" },
      { property: "og:description", content: "Work the queue of client hiring requests and their candidate batches." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RequestsPage,
});

function RequestsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof STATUS_TABS)[number]>("all");
  const [open, setOpen] = useState(false);

  const [clientId, setClientId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [hiresNeeded, setHiresNeeded] = useState("1");
  const [engagement, setEngagement] = useState("full_time");
  const [hours, setHours] = useState("");
  const [tz, setTz] = useState("");
  const [minYears, setMinYears] = useState("");
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [mustSkills, setMustSkills] = useState("");
  const [notes, setNotes] = useState("");
  const navigate = useNavigate();
  const [customOpen, setCustomOpen] = useState(false);
  const [cClientId, setCClientId] = useState("");
  const [cRoleId, setCRoleId] = useState("");
  const [cEngagement, setCEngagement] = useState("full_time");
  const [cTitle, setCTitle] = useState("");
  const [cNotes, setCNotes] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["client-requests"],
    queryFn: fetchClientRequests,
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const { data: roles = [] } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });

  const filtered = useMemo(
    () => (tab === "all" ? requests : requests.filter((r) => r.status === tab)),
    [requests, tab],
  );

  const create = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Pick a client");
      if (!roleId) throw new Error("Pick a role");
      if (!hours.trim()) throw new Error("Hours needed is required");
      if (!tz.trim()) throw new Error("Timezone requirement is required");
      if (!minYears.trim()) throw new Error("Min years experience is required");
      if (!startDate) throw new Error("Desired start date is required");
      if (!days.length) throw new Error("Select at least one day needed");
      const hires = Number(hiresNeeded) || 1;
      return createClientRequest({
        client_id: clientId,
        role_id: roleId,
        title: null,
        candidates_wanted: Math.max(4, hires * 4),
        hires_needed: hires,
        engagement_type: engagement,
        hours_needed: hours,
        timezone_requirement: tz,
        years_experience_min: minYears ? Number(minYears) : null,
        desired_start_date: startDate,
        days_of_week_needed: days,
        notes,
        must_have_skills_text: mustSkills,
        created_by: profile?.id ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Request created");
      setOpen(false);
      setNotes("");
      setMustSkills("");
      setDays([]);
      queryClient.invalidateQueries({ queryKey: ["client-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCustom = useMutation({
    mutationFn: async () => {
      if (!cClientId) throw new Error("Pick a client");
      if (!cRoleId) throw new Error("Pick a role");
      return createClientRequest({
        client_id: cClientId,
        role_id: cRoleId,
        title: cTitle,
        candidates_wanted: 1,
        hires_needed: 1,
        engagement_type: cEngagement,
        hours_needed: null,
        timezone_requirement: null,
        years_experience_min: null,
        desired_start_date: null,
        days_of_week_needed: [],
        notes: cNotes,
        source: "staff_curated",
        created_by: profile?.id ?? null,
      });
    },
    onSuccess: (id) => {
      toast.success("Custom request created — add candidates below");
      setCustomOpen(false);
      setCClientId("");
      setCRoleId("");
      setCEngagement("full_time");
      setCTitle("");
      setCNotes("");
      queryClient.invalidateQueries({ queryKey: ["client-requests"] });
      navigate({ to: "/requests/$requestId", params: { requestId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Client requests" description="Hiring requests to source review batches for">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Open seats waiting on candidate batches</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCustomOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New custom request
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New request
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
              tab === s
                ? "border-amber bg-amber/15 text-amber-foreground shadow-sm"
                : "bg-card hover:border-primary/50"
            }`}
          >
            {s === "all" ? "All" : labelize(s)}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading requests…</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map((r) => {
          const pct = r.candidates_wanted
            ? Math.min(100, Math.round((r.matchCount / r.candidates_wanted) * 100))
            : 0;
          return (
            <Link
              key={r.id}
              to="/requests/$requestId"
              params={{ requestId: r.id }}
              className="card-amber rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-amber hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{r.title || r.roleName || "Request"}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.clientName} · {r.roleName} · {labelize(r.engagement_type)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <CuratedBadge source={r.source} />
                  <RequestStatusBadge status={r.status} />
                </div>
              </div>

              <div className="mt-4 space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {r.matchCount} of {r.candidates_wanted} candidates in batch
                  </span>
                  <span>
                    {r.hiredCount}/{r.hires_needed} hired
                  </span>
                </div>
                <Progress value={pct} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                {r.desired_start_date && <Badge variant="secondary">Start {r.desired_start_date}</Badge>}
                {r.timezone_requirement && <Badge variant="outline">{r.timezone_requirement}</Badge>}
                {r.hours_needed && <Badge variant="outline">{r.hours_needed}</Badge>}
                {!!r.rejection_count && <Badge variant="outline">{r.rejection_count} rejected</Badge>}
              </div>
            </Link>
          );
        })}
      </div>
      {!isLoading && !filtered.length && (
        <p className="text-sm text-muted-foreground">No requests in this view.</p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New client request</DialogTitle>
            <DialogDescription>Define the seat and the size of the review batch.</DialogDescription>
          </DialogHeader>

          <ArrowScrollArea>
          <FormSection title="Client" first>
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormSection>

          <FormSection
            title="Matching criteria"
            description="Requirements the candidate batch must meet."
          >
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
              <div className="space-y-2">
                <Label htmlFor="hours">Hours needed *</Label>
                <Input id="hours" placeholder="20 hrs/week" value={hours} onChange={(e) => setHours(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tz">Timezone requirement *</Label>
                <Input id="tz" placeholder="US Eastern" value={tz} onChange={(e) => setTz(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minyears">Min years experience *</Label>
                <Input
                  id="minyears"
                  type="number"
                  min={0}
                  value={minYears}
                  onChange={(e) => setMinYears(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start">Desired start date *</Label>
                <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
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
                <Label htmlFor="must-skills">Must-have skills</Label>
                <Textarea
                  id="must-skills"
                  placeholder="Skills the client says are non-negotiable, e.g. Spanish, QuickBooks, Monday-Friday availability"
                  value={mustSkills}
                  onChange={(e) => setMustSkills(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Free text from the client — optional, stored exactly as they wrote it.
                </p>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Other details"
            description="Optional — how many people the client is hiring for this seat."
          >
            <div className="space-y-2">
              <Label htmlFor="hires">Hires needed</Label>
              <Input
                id="hires"
                type="number"
                min={1}
                value={hiresNeeded}
                onChange={(e) => setHiresNeeded(e.target.value)}
              />
            </div>
          </FormSection>

          <FormSection title="Additional notes" description="Anything else the sourcing team should know.">
            <Textarea id="req-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormSection>
          </ArrowScrollArea>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New custom request</DialogTitle>
            <DialogDescription>
              Hand-pick candidates for a client. Automatic matching never runs on these requests.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={cClientId} onValueChange={setCClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={cRoleId} onValueChange={setCRoleId}>
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
              <p className="text-xs text-muted-foreground">For labelling only — not used for scoring.</p>
            </div>
            <div className="space-y-2">
              <Label>Engagement type *</Label>
              <Select value={cEngagement} onValueChange={setCEngagement}>
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
            <div className="space-y-2">
              <Label htmlFor="c-title">Title</Label>
              <Input
                id="c-title"
                placeholder="Executive Assistant for Jane"
                value={cTitle}
                onChange={(e) => setCTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-notes">Notes</Label>
              <Textarea id="c-notes" value={cNotes} onChange={(e) => setCNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createCustom.mutate()} disabled={createCustom.isPending}>
              {createCustom.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create & add candidates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
