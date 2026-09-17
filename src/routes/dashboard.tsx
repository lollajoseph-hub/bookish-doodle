import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Users,
  Briefcase,
  UserCheck,
  Sparkles,
  RefreshCw,
  Building2,
  ClipboardList,
  GitCompareArrows,
  CalendarCheck,
  BadgeCheck,
  UserPlus,
  UserMinus,
  Activity,
  UserCog,
  LifeBuoy,
  FileCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { fetchCandidates, fetchJobRoles, fetchStaffProfiles } from "@/lib/queries";
import {
  fetchAllMatches,
  fetchAuditLogs,
  fetchClientRequests,
  fetchClients,
  fetchPlacements,
  labelize,
} from "@/lib/crm-queries";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Operations overview | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content:
          "Operations overview of the ScaleSource pipeline: candidates, client requests, matches and placements.",
      },
      { property: "og:title", content: "Operations overview | ScaleSource" },
      {
        property: "og:description",
        content: "Candidate, client and placement pipeline overview for ScaleSource staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

type Tone = "default" | "primary" | "success" | "warning";

const TONES: Record<Tone, { wrap: string; icon: string; value: string }> = {
  default: { wrap: "bg-primary-soft", icon: "text-primary", value: "text-primary-dark" },
  primary: { wrap: "bg-primary", icon: "text-primary-foreground", value: "text-primary-dark" },
  success: { wrap: "bg-emerald-100", icon: "text-emerald-700", value: "text-emerald-700" },
  warning: { wrap: "bg-amber-soft", icon: "text-amber-foreground", value: "text-amber-foreground" },
};

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  loading = false,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  hint?: string;
  tone?: Tone;
  loading?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div className="card-amber rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={`grid h-9 w-9 place-items-center rounded-xl ${t.wrap}`}>
          <Icon className={`h-4 w-4 ${t.icon}`} />
        </div>
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-16 animate-pulse rounded-md bg-muted" />
      ) : (
        <div className={`mt-3 text-3xl font-semibold ${t.value}`}>{value}</div>
      )}
      {hint && !loading && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">{children}</h2>
      {action}
    </div>
  );
}

function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const candidatesQ = useQuery({ queryKey: ["candidates"], queryFn: fetchCandidates });
  const rolesQ = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const staffQ = useQuery({ queryKey: ["staff"], queryFn: fetchStaffProfiles });
  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: fetchClients });
  const requestsQ = useQuery({ queryKey: ["client-requests"], queryFn: fetchClientRequests });
  const matchesQ = useQuery({ queryKey: ["all-matches"], queryFn: fetchAllMatches });
  const placementsQ = useQuery({ queryKey: ["placements"], queryFn: fetchPlacements });
  const auditQ = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => fetchAuditLogs(20),
    enabled: isAdmin,
  });

  const candidates = candidatesQ.data ?? [];
  const roles = rolesQ.data ?? [];
  const staff = staffQ.data ?? [];
  const clients = clientsQ.data ?? [];
  const requests = requestsQ.data ?? [];
  const matches = matchesQ.data ?? [];
  const placements = placementsQ.data ?? [];
  const auditLogs = auditQ.data ?? [];

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const byStatus = (st: string) => candidates.filter((c) => (c.status ?? "new") === st).length;
    const byMatch = (...sts: string[]) =>
      matches.filter((m) => sts.includes(m.status ?? "")).length;
    return {
      total: candidates.length,
      newThisWeek: candidates.filter((c) => new Date(c.created_at).getTime() >= weekAgo).length,
      new: byStatus("new"),
      shortlisted: byStatus("shortlisted"),
      interviewed: byStatus("interviewed"),
      hiredCandidates: byStatus("hired"),
      placed: byStatus("placed"),
      rejected: byStatus("rejected"),
      mine: candidates.filter((c) => c.recruiter_id === profile?.id).length,
      unassigned: candidates.filter((c) => !c.recruiter_id).length,
      openRequests: requests.filter((r) => r.status === "open").length,
      needsAttention: requests.filter((r) => r.status === "needs_attention").length,
      recruiters: staff.filter((p) => p.role === "recruiter").length,
      pendingOffers: byMatch("offer_extended"),
      upcomingInterviews: byMatch("interview_requested", "interview_confirmed"),
      interviewing: byMatch(
        "interview_requested",
        "interview_confirmed",
        "interview_completed",
      ),
      hired: byMatch("hired"),
      activePlacements: placements.filter((p) => (p.status ?? "active") === "active").length,
    };
  }, [candidates, matches, requests, staff, placements, profile?.id]);

  const recent = useMemo(() => candidates.slice(0, 6), [candidates]);

  async function refreshAll() {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
      toast.success("Refreshed");
    } catch (e) {
      toast.error((e as Error).message || "Could not refresh");
    } finally {
      setRefreshing(false);
    }
  }

  const loadingCore = candidatesQ.isLoading;

  return (
    <AppShell
      title={
        profile?.full_name
          ? `Welcome ${profile.full_name.split(" ")[0]},`
          : "Welcome,"
      }
      description="Candidate Review System"
      actions={null}
    >
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-primary-dark">Operations overview</h1>
            <p className="text-sm text-muted-foreground">
              Live snapshot of the candidate pool, client demand and placements.
            </p>
          </div>
          <Button variant="outline" onClick={refreshAll} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <section className="space-y-3">
          <SectionTitle
            action={
              <Link to="/candidates" className="text-sm text-primary hover:underline">
                View candidates
              </Link>
            }
          >
            Candidate pipeline
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total candidates" value={stats.total} icon={Users} loading={loadingCore} />
            <StatCard
              label="New this week"
              value={stats.newThisWeek}
              icon={UserPlus}
              tone="success"
              hint="Added in the last 7 days"
              loading={loadingCore}
            />
            <StatCard label="New" value={stats.new} icon={Sparkles} loading={loadingCore} />
            <StatCard
              label="Shortlisted"
              value={stats.shortlisted}
              icon={BadgeCheck}
              tone="warning"
              loading={loadingCore}
            />
            <StatCard
              label="Interviewed"
              value={stats.interviewed}
              icon={CalendarCheck}
              loading={loadingCore}
            />
            <StatCard
              label="Hired"
              value={stats.hiredCandidates}
              icon={UserCheck}
              tone="success"
              loading={loadingCore}
            />
            <StatCard label="Placed" value={stats.placed} icon={Sparkles} tone="success" loading={loadingCore} />
            <StatCard label="Rejected" value={stats.rejected} icon={UserMinus} loading={loadingCore} />
            <StatCard label="Assigned to me" value={stats.mine} icon={UserCheck} loading={loadingCore} />
            <StatCard
              label="Unassigned"
              value={stats.unassigned}
              icon={UserMinus}
              tone="warning"
              hint="Need a recruiter"
              loading={loadingCore}
            />
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle
            action={
              <Link to="/requests" className="text-sm text-primary hover:underline">
                View requests
              </Link>
            }
          >
            Client &amp; placement pipeline
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active clients"
              value={clients.length}
              icon={Building2}
              loading={clientsQ.isLoading}
            />
            <StatCard
              label="Recruiters"
              value={stats.recruiters}
              icon={UserCog}
              loading={staffQ.isLoading}
            />
            <StatCard
              label="Open requests"
              value={stats.openRequests}
              icon={ClipboardList}
              tone="warning"
              loading={requestsQ.isLoading}
            />
            <StatCard
              label="Needs attention"
              value={stats.needsAttention}
              icon={LifeBuoy}
              tone="warning"
              hint="CS queue"
              loading={requestsQ.isLoading}
            />
            <StatCard
              label="Candidates matched"
              value={matches.length}
              icon={GitCompareArrows}
              loading={matchesQ.isLoading}
            />
            <StatCard
              label="Upcoming interviews"
              value={stats.upcomingInterviews}
              icon={CalendarCheck}
              loading={matchesQ.isLoading}
            />
            <StatCard
              label="Pending offers"
              value={stats.pendingOffers}
              icon={FileCheck}
              tone="warning"
              loading={matchesQ.isLoading}
            />
            <StatCard
              label="Active placements"
              value={stats.activePlacements}
              icon={Sparkles}
              tone="success"
              loading={placementsQ.isLoading}
            />
          </div>
        </section>

        {isAdmin && (
          <section className="space-y-3">
            <SectionTitle>Admin overview</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Team members" value={staff.length} icon={Users} loading={staffQ.isLoading} />
              <StatCard label="Total roles" value={roles.length} icon={Briefcase} loading={rolesQ.isLoading} />
            </div>
            <div className="card-amber rounded-2xl border bg-card p-5">
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Recent activity
                </span>
              </SectionTitle>
              <div className="mt-3 space-y-2">
                {auditQ.isLoading && <p className="text-sm text-muted-foreground">Loading activity…</p>}
                {auditLogs.slice(0, 10).map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{log.userName ?? "System"}</span>{" "}
                      <span className="text-muted-foreground">
                        {labelize(log.action).toLowerCase()} · {labelize(log.entity_type)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
                {!auditQ.isLoading && !auditLogs.length && (
                  <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
                )}
              </div>
            </div>
          </section>
        )}


        <section className="card-amber rounded-2xl border bg-card p-5">
          <SectionTitle
            action={
              <Link to="/roles" className="text-sm text-primary hover:underline">
                Manage roles
              </Link>
            }
          >
            Candidates by role
          </SectionTitle>
          <div className="mt-4 space-y-3">
            {roles.map((r) => {
              const count = candidates.filter((c) => c.roleIds.includes(r.id)).length;
              const pct = candidates.length ? Math.round((count / candidates.length) * 100) : 0;
              return (
                <div key={r.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{r.name}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-primary-soft">
                    <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {!roles.length && <p className="text-sm text-muted-foreground">No roles yet.</p>}
          </div>
        </section>

        <section className="card-amber rounded-2xl border bg-card p-5">
          <SectionTitle>Recently added</SectionTitle>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recent.map((c) => (
              <Link
                key={c.id}
                to="/candidates/$candidateId"
                params={{ candidateId: c.id }}
                className="rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:border-amber hover:shadow-md"
              >
                <div className="truncate font-medium">{c.full_name}</div>
                <div className="truncate text-xs text-muted-foreground">{c.headline || c.email || "—"}</div>
                <div className="mt-1 text-[11px] text-primary">{c.recruiterName ?? "Unassigned"}</div>
              </Link>
            ))}
            {!recent.length && <p className="text-sm text-muted-foreground">No candidates added yet.</p>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
