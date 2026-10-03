import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Mail, Phone, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { fetchCandidates, fetchStaffProfiles } from "@/lib/queries";
import { labelize } from "@/lib/crm-queries";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
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
  "available",
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
        <div className="space-y-6" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[140px] rounded-[30px] bg-white/70" />
          <Skeleton className="h-[96px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[220px] rounded-3xl bg-white/70" />
        </div>
      </AppShell>
    );
  }

  const member = staff.find((s) => s.id === staffId);
  if (error || !member) {
    return (
      <AppShell title="Recruiter">
        <div className="card-amber rounded-3xl border-dashed p-10 text-center">
          <p className="font-display text-3xl font-medium">Recruiter not found</p>
          <Link to="/recruiters">
            <Button className="mt-5">Back to team</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const owned = candidates.filter((c) => c.recruiter_id === staffId);
  const breakdown = PIPELINE_STATUSES.map((status) => ({
    status,
    count: owned.filter((c) => (c.status ?? "available") === status).length,
  })).filter((b) => b.count > 0);
  const pendingInvite = signinStatus ? signinStatus[member.id] === false : true;

  return (
    <AppShell
      title={member.full_name || member.email || "Recruiter"}
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
          className="inline-flex items-center text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to recruiter pool
        </Link>

        <section className="card-amber rounded-[30px] p-6 sm:p-7">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-display text-[32px] font-semibold leading-none">{member.full_name || member.email}</div>
              <Badge variant="secondary" className="mt-2 h-6 rounded-full border-transparent px-2.5 text-[11.5px] font-semibold bg-primary-soft text-primary capitalize">
                {member.role}
              </Badge>
            </div>
            <div className="text-right">
              <div className="font-display text-4xl font-semibold leading-none tabular-nums text-primary">{owned.length}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">candidates</div>
            </div>
          </div>
          <div className="mt-4 space-y-1 text-sm text-muted-foreground">
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

        <section className="card-amber rounded-3xl p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Pipeline breakdown
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {breakdown.map((b) => (
              <Badge key={b.status} variant="outline" className="h-6 rounded-full border-transparent px-2.5 text-[11.5px] font-semibold bg-foreground/[0.06] text-secondary-foreground">
                {b.count} {labelize(b.status).toLowerCase()}
              </Badge>
            ))}
            {!breakdown.length && (
              <span className="text-xs text-muted-foreground">No candidates assigned yet.</span>
            )}
          </div>
        </section>

        <section className="card-amber rounded-3xl p-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Owned candidates
          </h2>
          <div className="mt-3 space-y-2">
            {owned.map((c) => (
              <Link
                key={c.id}
                to="/candidates/$candidateId"
                params={{ candidateId: c.id }}
                className="flex items-center justify-between gap-3 rounded-2xl border border-foreground/[0.08] bg-white/70 px-4 py-3 transition-[box-shadow,border-color] duration-300 hover:border-[rgb(122_89_163/0.25)] hover:shadow-[0_22px_44px_-24px_rgb(46_16_73/0.5)]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.full_name}</div>
                  {c.headline && (
                    <div className="truncate text-xs text-muted-foreground">{c.headline}</div>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0 h-6 rounded-full border-transparent px-2.5 text-[11.5px] font-semibold bg-primary-soft text-primary capitalize">
                  {labelize(c.status ?? "available")}
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
