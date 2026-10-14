import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, Phone, Plus, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { fetchCandidates, fetchStaffProfiles } from "@/lib/queries";
import { labelize } from "@/lib/crm-queries";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/recruiters/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Team | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content: "ScaleSource recruiters and admins, with the candidates each one owns.",
      },
      { property: "og:title", content: "Team | ScaleSource" },
      { property: "og:description", content: "Recruiters and admins in the candidate review system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

/** Best-effort: an admin-only RPC may expose who has signed in. Missing RPC → show for all. */
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

const PIPELINE_STATUSES = [
  "available",
  "shortlisted",
  "interviewed",
  "hired",
  "placed",
  "rejected",
  "archived",
];

function TeamPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: staff = [], isLoading } = useQuery({ queryKey: ["staff"], queryFn: fetchStaffProfiles });
  const { data: candidates = [] } = useQuery({ queryKey: ["candidates"], queryFn: fetchCandidates });
  const { data: signinStatus } = useQuery({
    queryKey: ["staff-signin-status"],
    queryFn: fetchSigninStatus,
    enabled: isAdmin,
  });

  // Only the card whose invite is being resent shows the spinner.
  const [resendingId, setResendingId] = useState<string | null>(null);
  const resend = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-resend-staff-invite", {
        body: { user_id: userId },
      });
      const message = invokeError(error, data);
      if (message) throw new Error(message);
    },
    onMutate: (userId: string) => setResendingId(userId),
    onSuccess: () => toast.success("Invite resent"),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setResendingId(null),
  });

  return (
    <AppShell
      title="Recruiter Pool"
      description="Recruiters and admins, and the candidates each one carries"
  >
      {isAdmin && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Recruiters and the candidates each one carries</p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add recruiter
          </Button>
        </div>
      )}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[180px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[180px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[180px] rounded-3xl bg-white/70" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {staff
          .filter((s) => s.role === "recruiter")
          .map((s) => {
          const ownedList = candidates.filter((c) => c.recruiter_id === s.id);
          const owned = ownedList.length;
          const breakdown = PIPELINE_STATUSES.map((status) => ({
            status,
            count: ownedList.filter((c) => (c.status ?? "available") === status).length,
          })).filter((b) => b.count > 0);
          const pendingInvite = signinStatus ? signinStatus[s.id] === false : true;
          return (
            <Link
              key={s.id}
              to="/recruiters/$staffId"
              params={{ staffId: s.id }}
              className="card-amber block rounded-3xl p-5 transition-[box-shadow,border-color] duration-300 hover:border-[rgb(122_89_163/0.25)] hover:shadow-[0_22px_44px_-24px_rgb(46_16_73/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-2xl font-semibold leading-tight">{s.full_name || s.email}</div>
                  <Badge variant="secondary" className="mt-1.5 h-6 rounded-full border-transparent px-2.5 text-[11.5px] font-semibold bg-primary-soft text-primary capitalize">
                    {s.role}
                  </Badge>
                </div>
                <div className="flex items-start gap-2">
                  {isAdmin && pendingInvite && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-full text-primary hover:bg-primary-soft"
                      aria-label="Resend invite"
                      title="Resend invite"
                      disabled={resendingId === s.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        resend.mutate(s.id);
                      }}
                    >
                      {resendingId === s.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <div className="text-right">
                    <div className="font-display text-4xl font-semibold leading-none tabular-nums text-primary">{owned}</div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">candidates</div>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {breakdown.map((b) => (
                  <Badge key={b.status} variant="outline" className="h-6 rounded-full border-transparent px-2.5 text-[11.5px] font-semibold bg-foreground/[0.06] text-secondary-foreground">
                    {b.count} {labelize(b.status).toLowerCase()}
                  </Badge>
                ))}
                {!breakdown.length && (
                  <span className="text-xs text-muted-foreground">No candidates assigned yet.</span>
                )}
              </div>
              <div className="mt-4 space-y-1 border-t border-foreground/[0.06] pt-3 text-xs text-muted-foreground">
                {s.email && (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="h-3.5 w-3.5" /> {s.email}
                  </div>
                )}
                {s.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {s.phone}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {isAdmin && (
        <AddStaffDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onInvited={() => {
            queryClient.invalidateQueries({ queryKey: ["staff"] });
            queryClient.invalidateQueries({ queryKey: ["staff-signin-status"] });
          }}
        />
      )}
    </AppShell>
  );
}

function AddStaffDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const invite = useMutation({
    mutationFn: async () => {
      const full_name = `${firstName.trim()} ${lastName.trim()}`.trim();
      if (!full_name) throw new Error("Enter a name");
      if (!email.trim()) throw new Error("Enter an email address");
      const { data, error } = await supabase.functions.invoke("admin-create-staff", {
        body: { email: email.trim(), full_name, role: "recruiter" },
      });
      const message = invokeError(error, data);
      if (message) throw new Error(message);
    },
    onSuccess: () => {
      toast.success("Invite sent");
      setFirstName("");
      setLastName("");
      setEmail("");
      onOpenChange(false);
      onInvited();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add recruiter</DialogTitle>
          <DialogDescription>
            Invite a new recruiter. They receive an email to set their password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff_email">Email</Label>
            <Input
              id="staff_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => invite.mutate()} disabled={invite.isPending}>
            {invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
