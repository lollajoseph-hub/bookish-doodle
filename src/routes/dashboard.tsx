import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { fetchDashboardCounts, fetchRecentActivity } from "@/lib/queries";
import { fetchStaffActivityFeed, activityLine } from "@/routes/recruiter-activity";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  Users,
  Mail,
  GraduationCap,
  PlayCircle,
  CheckCircle2,
  Sparkles,
  ClipboardList,
  TrendingUp,
  UserPlus,
  BookOpen,
  Mic,
  RefreshCw,
  Upload,
  Award,
  XCircle,
  AlarmClock,
  Building2,
  Eye,
  CalendarClock,
  HandCoins,
  HeartHandshake,

} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  component: DashboardPage,
});

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  loading,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  hint?: string;
  loading?: boolean;
  tone?: "default" | "primary" | "success" | "warning";
}) {
  const tones: Record<string, string> = {
    default: "bg-secondary text-secondary-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success-foreground)]",
    warning: "bg-[color:var(--color-warning)]/20 text-[color:var(--color-warning-foreground)]",
  };
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-center justify-between">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight">
        {loading ? <Skeleton className="h-8 w-16" /> : value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function RecentPanel<T>({ title, items, loading, render }: { title: string; items: T[]; loading?: boolean; render: (item: T) => React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <h4 className="font-semibold text-sm mb-3">{title}</h4>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : !items.length ? (
        <div className="text-xs text-muted-foreground py-4 text-center">Nothing recent.</div>
      ) : (
        <ul className="divide-y">
          {items.slice(0, 6).map((item, i) => (
            <li key={i} className="py-2">{render(item)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}



const activityIcon: Record<string, any> = {
  candidate: UserPlus,
  enrollment: BookOpen,
  lesson: CheckCircle2,
  assessment: ClipboardList,
  roleplay: Mic,
};

function DashboardPage() {
  const counts = useQuery({ queryKey: ["dashboard-counts"], queryFn: fetchDashboardCounts });
  const activity = useQuery({ queryKey: ["recent-activity"], queryFn: () => fetchRecentActivity(15) });
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const adminMetrics = useQuery({
    queryKey: ["admin-dashboard-metrics"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_metrics");
      if (error) throw error;
      return (data ?? {}) as {
        cs_queue_awaiting?: number;
        recovery_active?: number;
        system_alerts?: number;
        today_activity?: number;
      };
    },
  });
  const adminRecent = useQuery({
    queryKey: ["admin-recent"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_recent", { p_limit: 6 });
      if (error) throw error;
      return (data ?? {}) as {
        recent_placements?: any[];
        recent_requests?: any[];
        recent_registrations?: any[];
        recent_notifications?: any[];
        recent_failures?: any[];
      };
    },
  });
  const recruiterActivity = useQuery({
    queryKey: ["staff-activity-feed", "dashboard"],
    enabled: isAdmin,
    queryFn: () => fetchStaffActivityFeed(null, 6),
  });

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Operations overview</h2>
            <p className="text-sm text-muted-foreground">
              Snapshot of the candidate pool and recent activity.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={counts.isFetching || activity.isFetching}
            onClick={async () => {
              await Promise.all([counts.refetch(), activity.refetch()]);
              toast.success("Refreshed");
            }}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${counts.isFetching || activity.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {counts.isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm flex items-center justify-between">
            <span>Failed to load metrics. {(counts.error as Error)?.message}</span>
            <Button size="sm" variant="outline" onClick={() => counts.refetch()}>
              Retry
            </Button>
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Academy — training pipeline</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Total Candidates" value={counts.data?.total ?? 0} loading={counts.isLoading} tone="primary" />
            <StatCard icon={UserPlus} label="New This Week" value={counts.data?.newThisWeek ?? 0} loading={counts.isLoading} hint="Last 7 days" />
            <StatCard icon={Mail} label="Invited" value={counts.data?.invited ?? 0} loading={counts.isLoading} />
            <StatCard icon={Upload} label="Uploaded" value={counts.data?.uploaded ?? 0} loading={counts.isLoading} hint="Added, not yet invited" />
            <StatCard icon={PlayCircle} label="In Training" value={counts.data?.inTraining ?? 0} loading={counts.isLoading} />
            <StatCard icon={ClipboardList} label="Awaiting Review" value={counts.data?.awaitingReview ?? 0} loading={counts.isLoading} tone="warning" hint="Ungraded roleplays" />
            <StatCard icon={GraduationCap} label="Graduated" value={counts.data?.graduated ?? 0} loading={counts.isLoading} tone="success" />
            <StatCard icon={CheckCircle2} label="Ready for Placement" value={counts.data?.readyForPlacement ?? 0} loading={counts.isLoading} tone="success" />
            <StatCard
              icon={TrendingUp}
              label="Avg Training Progress"
              value={counts.data?.avgProgress != null ? `${Math.round(counts.data.avgProgress)}%` : "—"}
              loading={counts.isLoading}
            />
            <StatCard icon={Award} label="Certificates Issued" value={counts.data?.certificatesIssued ?? 0} loading={counts.isLoading} tone="success" />
            <StatCard icon={XCircle} label="Training Failed" value={counts.data?.trainingFailed ?? 0} loading={counts.isLoading} tone="warning" />
            <StatCard icon={AlarmClock} label="Training Expired" value={counts.data?.trainingExpired ?? 0} loading={counts.isLoading} tone="warning" />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Placement pipeline</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Building2} label="Active Clinics" value={counts.data?.activeClinics ?? 0} loading={counts.isLoading} tone="primary" />
            <StatCard icon={ClipboardList} label="Open Requests" value={counts.data?.openRequests ?? 0} loading={counts.isLoading} tone="primary" hint="Active client requests" />
            <StatCard icon={RefreshCw} label="Needs Rematch" value={counts.data?.needsRematch ?? 0} loading={counts.isLoading} tone="warning" />
            <StatCard icon={Eye} label="Under Review" value={counts.data?.underReview ?? 0} loading={counts.isLoading} hint="Presented, awaiting clinic" />
            <StatCard icon={CalendarClock} label="Interviews In Progress" value={counts.data?.interviewsActive ?? 0} loading={counts.isLoading} hint="Across the interview gate" />
            <StatCard icon={HandCoins} label="Offers Out" value={counts.data?.offersOut ?? 0} loading={counts.isLoading} hint="Awaiting acceptance" />
            <StatCard icon={CheckCircle2} label="Placements Confirmed" value={counts.data?.placementsConfirmed ?? 0} loading={counts.isLoading} tone="success" />
            <StatCard icon={HeartHandshake} label="Pending CS Handoffs" value={counts.data?.pendingHandoffs ?? 0} loading={counts.isLoading} tone="warning" hint="Awaiting Customer Success" />
          </div>
        </section>

        {isAdmin && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Admin operations</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link to="/cs-queue" className="block">
                <StatCard icon={HeartHandshake} label="CS Awaiting" value={adminMetrics.data?.cs_queue_awaiting ?? 0} loading={adminMetrics.isLoading} tone="primary" />
              </Link>
              <Link to="/system-monitor" className="block">
                <StatCard icon={RefreshCw} label="Recovery Active" value={adminMetrics.data?.recovery_active ?? 0} loading={adminMetrics.isLoading} />
              </Link>
              <Link to="/system-monitor" className="block">
                <StatCard icon={XCircle} label="System Alerts" value={adminMetrics.data?.system_alerts ?? 0} loading={adminMetrics.isLoading} tone="warning" />
              </Link>
              <StatCard icon={Sparkles} label="Today's Activity" value={adminMetrics.data?.today_activity ?? 0} loading={adminMetrics.isLoading} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <RecentPanel title="Recent Placements" items={adminRecent.data?.recent_placements ?? []} loading={adminRecent.isLoading} render={(p: any) => (
                <>
                  <div className="text-sm truncate">{p.candidate_name ?? "—"} · <span className="text-muted-foreground">{p.clinic_name ?? "—"}</span></div>
                  <div className="text-xs text-muted-foreground">{p.placement_date ? formatDistanceToNow(new Date(p.placement_date), { addSuffix: true }) : ""}</div>
                </>
              )} />
              <RecentPanel title="Recent Clinic Requests" items={adminRecent.data?.recent_requests ?? []} loading={adminRecent.isLoading} render={(r: any) => (
                <>
                  <div className="text-sm truncate">{r.clinic_name ?? "—"} · <span className="text-muted-foreground">{r.role_needed ?? r.title ?? "—"}</span></div>
                  <div className="text-xs text-muted-foreground capitalize">{(r.status ?? "").replace(/_/g, " ")}</div>
                </>
              )} />
              <RecentPanel title="Recent Registrations" items={adminRecent.data?.recent_registrations ?? []} loading={adminRecent.isLoading} render={(c: any) => (
                <>
                  <div className="text-sm truncate">{c.candidate_name ?? c.full_name ?? "—"} · <span className="text-muted-foreground capitalize">{(c.status ?? "").replace(/_/g, " ")}</span></div>
                  <div className="text-xs text-muted-foreground">{c.recruiter_name ?? "Unassigned"}</div>
                </>
              )} />
              <RecentPanel title="Recent Notifications" items={adminRecent.data?.recent_notifications ?? []} loading={adminRecent.isLoading} render={(n: any) => (
                <>
                  <div className="text-sm truncate">{n.title ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{n.type ?? ""}</div>
                </>
              )} />
              <RecentPanel title="Recent Failures" items={adminRecent.data?.recent_failures ?? []} loading={adminRecent.isLoading} render={(f: any) => (
                <>
                  <div className="text-sm truncate">{f.pipeline ?? "—"} · <span className="text-muted-foreground">{f.attempts ?? 0} attempts</span></div>
                  <div className="text-xs text-muted-foreground">{f.needs_attention ? "Needs attention" : ""}</div>
                </>
              )} />
              <Link to="/recruiter-activity" className="block">
                <RecentPanel title="Recruiter Activity" items={recruiterActivity.data ?? []} loading={recruiterActivity.isLoading} render={(e: any) => (
                  <>
                    <div className="text-sm truncate">
                      <span className="font-medium">{e.actor_name ?? "Unknown user"}</span>{" "}
                      <span className="text-muted-foreground">{activityLine(e)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground" title={new Date(e.created_at).toLocaleString()}>
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </div>
                  </>
                )} />
              </Link>
            </div>
          </section>
        )}




        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent activity</h3>
            <span className="text-xs text-muted-foreground">Latest 15 events</span>
          </div>
          {activity.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : activity.isError ? (
            <div className="text-sm text-destructive">Failed to load activity.</div>
          ) : !activity.data?.length ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No activity yet.</div>
          ) : (
            <ul className="divide-y">
              {activity.data.map((a) => {
                const Icon = activityIcon[a.type] ?? Sparkles;
                return (
                  <li key={a.id} className="py-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{a.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.at), { addSuffix: true })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
