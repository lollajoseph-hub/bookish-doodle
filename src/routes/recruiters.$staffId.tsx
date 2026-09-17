import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Mail, Phone, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { fetchCandidates, fetchStaffProfiles } from "@/lib/queries";
import { labelize } from "@/lib/crm-queries";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/recruiters/$staffId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Recruiter | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content: "Recruiter profile: contact details, pipeline breakdown and owned candidates.",
      },
      { property: "og:title", content: "Recruiter | ScaleSource" },
      {
        property: "og:description",
        content: "Recruiter profile in the ScaleSource Candidate Pool Review System.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecruiterDetailPage,
});

const PIPELINE_STATUSES = [
  "new",
  "shortlisted",
  "interviewed",
  "hired",
  "placed",
  "rejected",
  "archived",
];

/** Best-effort: an admin-only RPC may expose who has signed in. Missing RPC → null. */
async function fetchSigninStatus(): Promise<Record<string, boolean> | null> {
  const { data, error } = await supabase.rpc("admin_staff_signin_status");
  if (error || !Array.isArray(data)) return null;
  const out: Record<string, boolean> = {};
  for (const row of data as { user_id: string; confirmed: boolean }[]) {
    out[row.user_id] = !!row.confirmed;
  }
  return out;
}

function invokeError(error: unknown, data: unknown): string | null {
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    return String((data as { error?: string }).error);
  }
  if (error) return (error as Error).message || "Something went wrong";
  return null;
}

function RecruiterDetailPage() {
  const { staffId } = useParams({ from: "/recruiters/$staffId" });
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const { data: staff = [], isLoading, error } = useQuery({
    queryKey: ["staff"],
    queryFn: fetchStaffProfiles,
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
  });
  const { data: signinStatus } = useQuery({
    queryKey: ["staff-signin-status"],
    queryFn: fetchSigninStatus,
    enabled: isAdmin,
  });

  const resend = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error: err } = await supabase.functions.invoke("admin-resend-staff-invite", {
        body: { user_id: userId },
      });
      const message = invokeError(err, data);
      if (message) throw new Error(message);
    },
    onSuccess: () => toast.success("Invite resent"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AppShell title="Recruiter">
        <p className="text-sm text-muted-foreground">Loading recruiter…</p>
      </AppShell>
    );
  }

  const member = staff.find((s) => s.id === staffId);
  if (error || !member) {
    return (
      <AppShell title="Recruiter">
        <div className="card-amber rounded-2xl border bg-card p-8 text-center">
          <p className="font-medium">Recruiter not found</p>
          <Link to="/recruiters">
            <Button className="mt-4">Back to team</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const owned = candidates.filter((c) => c.recruiter_id === staffId);
  const breakdown = PIPELINE_STATUSES.map((status) => ({
    status,
    count: owned.filter((c) => (c.status ?? "new") === status).length,
  })).filter((b) => b.count > 0);
  const pendingInvite = signinStatus ? signinStatus[member.id] === false : true;

  return (
    <AppShell
      title={member.full_name || member.email}
      description="Recruiter workload and owned candidates"
      actions={
        isAdmin && pendingInvite ? (
          <Button
            variant="outline"
            disabled={resend.isPending}
            onClick={() => resend.mutate(member.id)}
          >
            {resend.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            Resend invite
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <Link
          to="/recruiters"
          className="inline-flex items-center text-sm text-primary hover:underline"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to recruiter pool
        </Link>

        <section className="card-amber rounded-2xl border bg-card p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-lg font-semibold">{member.full_name || member.email}</div>
              <Badge variant="secondary" className="mt-1 capitalize">
                {member.role}
              </Badge>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold text-primary-dark">{owned.length}</div>
              <div className="text-[11px] text-muted-foreground">candidates</div>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            {member.email && (
              <div className="flex items-center gap-1.5 truncate">
                <Mail className="h-3.5 w-3.5" /> {member.email}
              </div>
            )}
            {member.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {member.phone}
              </div>
            )}
          </div>
        </section>

        <section className="card-amber rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
            Pipeline breakdown
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {breakdown.map((b) => (
              <Badge key={b.status} variant="outline" className="text-[11px] font-normal">
                {b.count} {labelize(b.status).toLowerCase()}
              </Badge>
            ))}
            {!breakdown.length && (
              <span className="text-xs text-muted-foreground">No candidates assigned yet.</span>
            )}
          </div>
        </section>

        <section className="card-amber rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
            Owned candidates
          </h2>
          <div className="mt-3 space-y-2">
            {owned.map((c) => (
              <Link
                key={c.id}
                to="/candidates/$candidateId"
                params={{ candidateId: c.id }}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-amber hover:bg-amber/5"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.full_name}</div>
                  {c.headline && (
                    <div className="truncate text-xs text-muted-foreground">{c.headline}</div>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0 capitalize">
                  {labelize(c.status ?? "new")}
                </Badge>
              </Link>
            ))}
            {!owned.length && (
              <p className="text-sm text-muted-foreground">
                No candidates assigned to this recruiter yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
