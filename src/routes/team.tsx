import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useMembership } from "@/lib/membership";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Mail, UserPlus, Users } from "lucide-react";
import { formatDate } from "@/lib/matches";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Team — Candidate Pool" },
      { name: "description", content: "See the colleagues at your company who can review candidates, and invite new ones." },
      { property: "og:title", content: "Team — Candidate Pool" },
      { property: "og:description", content: "See the colleagues at your company who can review candidates, and invite new ones." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <TeamPage />
    </AppShell>
  ),
});

interface MemberRow {
  profile_id: string;
  is_primary: boolean | null;
  created_at: string | null;
  profiles: { email: string | null; full_name: string | null } | null;
}

function TeamPage() {
  const { user } = useAuth();
  const { membership, loading: membershipLoading, error: membershipError } = useMembership();
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const { data, error } = await supabase
      .from("client_members")
      .select("profile_id,is_primary,created_at,profiles(email,full_name)")
      .eq("client_id", membership.client_id);
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    const list = (data ?? []) as unknown as MemberRow[];
    list.sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary));
    setRows(list);
  }, [membership]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Colleagues at {membership?.client_name ?? "your company"} who can review candidates.
          </p>
        </div>
        {membership?.is_primary && <InviteDialog onInvited={load} />}
      </div>

      {(err || membershipError) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {err ?? membershipError}
        </div>
      )}

      {membershipLoading || rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No colleagues listed yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((m) => {
            const name = m.profiles?.full_name ?? m.profiles?.email ?? "Team member";
            return (
              <Card key={m.profile_id} className="rounded-2xl">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {name}
                        {m.profile_id === user?.id && (
                          <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                        )}
                      </p>
                      {m.profiles?.email && (
                        <p className="truncate text-sm text-muted-foreground">{m.profiles.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.is_primary && (
                      <Badge variant="secondary" className="bg-primary/10 text-primary">
                        Primary contact
                      </Badge>
                    )}
                    {m.created_at && (
                      <span className="text-xs text-muted-foreground">Joined {formatDate(m.created_at)}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InviteDialog({ onInvited }: { onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [position, setPosition] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Enter their email address.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("client-invite-colleague", {
      body: {
        email: email.trim(),
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        position: position.trim() || null,
      },
    });
    setBusy(false);
    const failure = error?.message ?? (data as { error?: string } | null)?.error;
    if (failure) {
      toast.error(failure);
      return;
    }
    toast.success(`Invitation sent to ${email.trim()}`);
    setEmail("");
    setFirstName("");
    setLastName("");
    setPosition("");
    setOpen(false);
    onInvited();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Invite colleague
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Invite a colleague</DialogTitle>
            <DialogDescription>
              They&apos;ll get an email to set a password and will see the same hiring requests and candidates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Full name (optional)</Label>
              <Input
                id="invite-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Alex Morgan"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
