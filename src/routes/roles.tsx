import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { createJobRole, fetchCandidates, fetchJobRoles } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/roles")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Roles | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content: "Manage the roles candidates are grouped by, from CSR to marketing positions.",
      },
      { property: "og:title", content: "Roles | ScaleSource" },
      { property: "og:description", content: "Manage candidate roles in the ScaleSource pool." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RolesPage,
});

function RolesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: roles = [], isLoading } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const { data: candidates = [] } = useQuery({ queryKey: ["candidates"], queryFn: fetchCandidates });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Role name is required");
      return createJobRole({ name, description, createdBy: profile?.id ?? null });
    },
    onSuccess: () => {
      toast.success("Role created");
      setName("");
      setDescription("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["job-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Roles"
      description="Categories candidates are grouped by"
      actions={
        isAdmin ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add new role
          </Button>
        ) : undefined
      }
    >
      {isLoading && <p className="text-sm text-muted-foreground">Loading roles…</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => {
          const count = candidates.filter((c) => c.roleIds.includes(r.id)).length;
          return (
            <div
              key={r.id}
              className="rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-xl bg-primary-soft grid place-items-center">
                    <Briefcase className="h-4 w-4 text-primary" />
                  </div>
                  <div className="font-semibold">{r.name}</div>
                </div>
                <Badge variant="secondary">{count}</Badge>
              </div>
              {r.description && (
                <p className="mt-3 text-sm text-muted-foreground">{r.description}</p>
              )}
              {r.is_active === false && (
                <Badge variant="outline" className="mt-3">
                  Inactive
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      {!isAdmin && (
        <p className="mt-6 text-xs text-muted-foreground">
          Only admins can create new roles.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new role</DialogTitle>
            <DialogDescription>
              Roles group the candidate pool — for example CSR or Bookkeeping.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Role name *</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-desc">Description</Label>
              <Textarea
                id="role-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
