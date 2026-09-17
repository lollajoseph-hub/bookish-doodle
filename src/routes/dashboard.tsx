import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Users, Briefcase, UserCheck, Sparkles, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { fetchCandidates, fetchJobRoles, fetchStaffProfiles } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content:
          "Overview of the ScaleSource candidate pool: candidates by role, recruiter ownership and recent additions.",
      },
      { property: "og:title", content: "Dashboard | ScaleSource Candidate Review" },
      {
        property: "og:description",
        content: "Overview of the ScaleSource candidate pool review system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Users }) {
  return (
    <div className="rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="h-9 w-9 rounded-xl bg-primary-soft grid place-items-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold text-primary-dark">{value}</div>
    </div>
  );
}

function DashboardPage() {
  const { profile } = useAuth();
  const { data: candidates = [] } = useQuery({ queryKey: ["candidates"], queryFn: fetchCandidates });
  const { data: roles = [] } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaffProfiles });

  const mine = useMemo(
    () => candidates.filter((c) => c.recruiter_id === profile?.id),
    [candidates, profile?.id],
  );
  const recent = useMemo(() => candidates.slice(0, 6), [candidates]);

  return (
    <AppShell
      title={
        profile?.role === "admin" || profile?.role === "recruiter"
          ? profile?.full_name
            ? `Welcome, ${profile.full_name.split(" ")[0]} — here's your ${profile.role} dashboard`
            : `Welcome to your ${profile.role} dashboard`
          : profile?.full_name
            ? `Welcome, ${profile.full_name.split(" ")[0]}`
            : "Welcome"
      }
      description="ScaleSource Candidate Pool Review System"
      actions={
        <Button asChild>
          <Link to="/candidates">
            Browse pool <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Candidates" value={candidates.length} icon={Users} />
          <Stat label="Roles" value={roles.length} icon={Briefcase} />
          <Stat label="Assigned to me" value={mine.length} icon={UserCheck} />
          <Stat label="Team members" value={staff.length} icon={Sparkles} />
        </div>

        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
              Candidates by role
            </h2>
            <Link to="/roles" className="text-sm text-primary hover:underline">
              Manage roles
            </Link>
          </div>
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
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {!roles.length && <p className="text-sm text-muted-foreground">No roles yet.</p>}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
            Recently added
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recent.map((c) => (
              <Link
                key={c.id}
                to="/candidates/$candidateId"
                params={{ candidateId: c.id }}
                className="rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:border-amber hover:shadow-md"
              >
                <div className="font-medium truncate">{c.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.headline || c.email || "—"}
                </div>
                <div className="mt-1 text-[11px] text-primary">
                  {c.recruiterName ?? "Unassigned"}
                </div>
              </Link>
            ))}
            {!recent.length && (
              <p className="text-sm text-muted-foreground">No candidates added yet.</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
