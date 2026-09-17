import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";
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

export function RolesPanel() {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Categories candidates are grouped by</p>
        {isAdmin && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add new role
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading roles…</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => {
          const count = candidates.filter((c) => c.roleIds.includes(r.id)).length;
          return (
            <div
              key={r.id}
              className="card-amber rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md"
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
              {r.description && <p className="mt-3 text-sm text-muted-foreground">{r.description}</p>}
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
        <p className="mt-6 text-xs text-muted-foreground">Only admins can create new roles.</p>
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
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
