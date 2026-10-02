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
import { Skeleton } from "@/components/ui/skeleton";
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

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[120px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[120px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[120px] rounded-3xl bg-white/70" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => {
          const count = candidates.filter((c) => c.roleIds.includes(r.id)).length;
          return (
            <div
              key={r.id}
              className="card-amber rounded-3xl p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft">
                    <Briefcase className="h-4 w-4 text-primary" />
                  </div>
                  <div className="font-display text-2xl font-semibold leading-tight">{r.name}</div>
                </div>
                <Badge variant="secondary" className="h-6 rounded-full border-transparent px-2.5 text-[11.5px] font-semibold bg-primary-soft tabular-nums text-primary">{count}</Badge>
              </div>
              {r.description && <p className="mt-3 text-sm text-muted-foreground">{r.description}</p>}
              {r.is_active === false && (
                <Badge variant="outline" className="mt-3 h-6 rounded-full border-transparent px-2.5 text-[11.5px] font-semibold bg-foreground/[0.06] text-secondary-foreground">
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
