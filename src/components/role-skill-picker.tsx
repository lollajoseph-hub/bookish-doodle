import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { MultiSelect } from "@/components/multi-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addSkillToRole, fetchRoleSkills, OTHER_CATEGORY } from "@/lib/skills-admin";

/** Must-have skills picker scoped to a job role; supports adding an unlisted skill. */
export function RoleSkillPicker({
  roleId,
  selected,
  onChange,
}: {
  roleId: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const { data: roleSkills = [], isLoading } = useQuery({
    queryKey: ["role-skills", roleId],
    queryFn: () => fetchRoleSkills(roleId),
    enabled: !!roleId,
  });

  if (!roleId) {
    return <p className="text-xs text-muted-foreground">Pick a role first to see its skills.</p>;
  }

  async function addNew() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addSkillToRole(roleId, name, OTHER_CATEGORY);
      const fresh = await queryClient.fetchQuery({
        queryKey: ["role-skills", roleId],
        queryFn: () => fetchRoleSkills(roleId),
        staleTime: 0,
      });
      const hit = fresh.find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (hit && !selected.includes(hit.skill_id)) onChange([...selected, hit.skill_id]);
      setNewName("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      <MultiSelect
        options={roleSkills.map((s) => ({ id: s.skill_id, label: s.name }))}
        selected={selected}
        onChange={onChange}
        placeholder={isLoading ? "Loading skills…" : "Select must-have skills"}
        searchPlaceholder="Search skills…"
        emptyText="No skills for this role yet."
      />
      <div className="flex gap-2">
        <Input
          placeholder="+ Add a skill not listed"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addNew();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => void addNew()} disabled={adding || !newName.trim()}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}
