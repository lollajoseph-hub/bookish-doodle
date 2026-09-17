import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Mail, Plus, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { fetchStaffProfiles } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
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

export function TeamPanel({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: fetchStaffProfiles,
    enabled: isAdmin,
  });
  const { data: signinStatus } = useQuery({
    queryKey: ["staff-signin-status"],
    queryFn: fetchSigninStatus,
    enabled: isAdmin,
  });

  const resend = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-resend-staff-invite", {
        body: { user_id: userId },
      });
      const message = invokeError(error, data);
      if (message) throw new Error(message);
    },
    onSuccess: () => toast.success("Invite resent"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">Only admins can invite other admins.</p>;
  }

  const admins = staff.filter((s) => s.role === "admin");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Invite and manage admin accounts</p>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Invite admin
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading admins…</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {admins.map((s) => {
          const pendingInvite = signinStatus ? signinStatus[s.id] === false : true;
          return (
            <div key={s.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{s.full_name || s.email}</div>
                  <Badge variant="secondary" className="mt-1">
                    <ShieldCheck className="mr-1 h-3 w-3" /> Admin
                  </Badge>
                </div>
                {pendingInvite && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="Resend invite"
                    title="Resend invite"
                    disabled={resend.isPending}
                    onClick={() => resend.mutate(s.id)}
                  >
                    {resend.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              {s.email && (
                <div className="mt-3 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> {s.email}
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                {pendingInvite ? "Invite pending" : "Active account"}
              </div>
            </div>
          );
        })}
      </div>
      {!isLoading && !admins.length && (
        <p className="text-sm text-muted-foreground">No admin accounts yet.</p>
      )}

      <InviteAdminDialog
        open={open}
        onOpenChange={setOpen}
        onInvited={() => {
          queryClient.invalidateQueries({ queryKey: ["staff"] });
          queryClient.invalidateQueries({ queryKey: ["staff-signin-status"] });
        }}
      />
    </div>
  );
}

function InviteAdminDialog({
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
        body: { email: email.trim(), full_name, role: "admin" },
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
          <DialogTitle>Invite an admin</DialogTitle>
          <DialogDescription>
            They receive an email to set their password and get full admin access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="admin_first">First name</Label>
              <Input id="admin_first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin_last">Last name</Label>
              <Input id="admin_last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin_email">Email</Label>
            <Input
              id="admin_email"
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
