import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  addSkillToRole,
  fetchJobRoles,
  fetchRoleSkills,
  fetchSkillsWithUsage,
  removeSkillFromRole,
  OTHER_CATEGORY,
} from "@/lib/skills-admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function RoleSkillsPanel() {
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState("");
  const [open, setOpen] = useState(false);

  const { data: roles = [] } = useQuery({ queryKey: ["job-roles-list"], queryFn: fetchJobRoles });
  const { data: catalog = [] } = useQuery({ queryKey: ["skills-admin"], queryFn: fetchSkillsWithUsage });
  const { data: roleSkills = [], isLoading } = useQuery({
    queryKey: ["role-skills", roleId],
    queryFn: () => fetchRoleSkills(roleId),
    enabled: !!roleId,
  });

  const tagged = new Set(roleSkills.map((s) => s.skill_id));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["role-skills", roleId] });

  const add = useMutation({
    mutationFn: (s: { name: string; category: string | null }) =>
      addSkillToRole(roleId, s.name, s.category ?? OTHER_CATEGORY),
    onSuccess: () => {
      toast.success("Skill added to role");
      setOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (skillId: string) => removeSkillFromRole(roleId, skillId),
    onSuccess: () => {
      toast.success("Removed from this role");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose which skills belong to each job role. Removing a skill here only untags it from the role.
      </p>
      <div className="card-amber flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="space-y-2">
          <Label>Job role</Label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Pick a job role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {roleId && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" disabled={add.isPending}>
                {add.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                Add skill to this role
                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search all skills…" />
                <CommandList>
                  <CommandEmpty>No skills found.</CommandEmpty>
                  <CommandGroup>
                    {catalog.map((s) => {
                      const on = tagged.has(s.id);
                      return (
                        <CommandItem
                          key={s.id}
                          value={`${s.name} ${s.category ?? ""}`}
                          disabled={on}
                          onSelect={() => !on && add.mutate({ name: s.name, category: s.category })}
                        >
                          <Check className={on ? "mr-2 h-4 w-4 text-primary" : "mr-2 h-4 w-4 opacity-0"} />
                          <span className="flex-1 truncate">{s.name}</span>
                          <span className="text-xs text-muted-foreground">{s.category ?? OTHER_CATEGORY}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {roleId && (
        <div className="card-amber rounded-2xl border bg-card p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading role skills…</p>
          ) : roleSkills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skills tagged to this role yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roleSkills.map((s) => (
                <Badge key={s.skill_id} variant="secondary" className="gap-1 py-1 pl-3 pr-1">
                  {s.name}
                  <span className="text-muted-foreground">· {s.category ?? OTHER_CATEGORY}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${s.name} from this role`}
                    title="Remove from this role"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(s.skill_id)}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
