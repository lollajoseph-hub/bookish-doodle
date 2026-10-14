import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Merge, Pencil, Plus, Search, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  createSkill,
  distinctCategories,
  fetchSkillsWithUsage,
  mergeSkills,
  updateSkill,
  OTHER_CATEGORY,
  type SkillWithUsage,
} from "@/lib/skills-admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleSkillsPanel } from "@/components/role-skills-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ALL = "__all__";
const SKILL_CATEGORY_OPTIONS = ["Software", "Customer Service", "Languages", OTHER_CATEGORY];

export function SkillsPanel() {
  return (
    <Tabs defaultValue="catalog" className="space-y-4">
      <TabsList>
        <TabsTrigger value="catalog">Skill catalog</TabsTrigger>
        <TabsTrigger value="roles">Role skills</TabsTrigger>
      </TabsList>
      <TabsContent value="catalog"><CatalogPanel /></TabsContent>
      <TabsContent value="roles"><RoleSkillsPanel /></TabsContent>
    </Tabs>
  );
}

function CatalogPanel() {
  const queryClient = useQueryClient();
  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["skills-admin"],
    queryFn: fetchSkillsWithUsage,
  });

  const [category, setCategory] = useState<string>(OTHER_CATEGORY);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<SkillWithUsage | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<string>(OTHER_CATEGORY);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>(OTHER_CATEGORY);

  const categories = useMemo(() => distinctCategories(skills), [skills]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter(
      (s) =>
        (category === ALL || (s.category ?? OTHER_CATEGORY) === category) &&
        (!q || s.name.toLowerCase().includes(q)),
    );
  }, [skills, category, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, SkillWithUsage[]>();
    for (const s of visible) {
      const key = s.category ?? OTHER_CATEGORY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  const selectedSkills = useMemo(
    () => skills.filter((s) => selected.includes(s.id)),
    [skills, selected],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["skills-admin"] });
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await updateSkill(editing.id, { name: editName, category: editCategory });
    },
    onSuccess: () => {
      toast.success("Skill updated");
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const merge = useMutation({
    mutationFn: async () => {
      if (!mergeTarget) throw new Error("Pick the skill to keep");
      await mergeSkills(
        selected.filter((id) => id !== mergeTarget),
        mergeTarget,
      );
    },
    onSuccess: () => {
      toast.success("Skills merged");
      setMergeOpen(false);
      setSelected([]);
      setMergeTarget("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      if (!name) throw new Error("Skill name is required");
      const dupe = skills.some(
        (s) =>
          (s.category ?? OTHER_CATEGORY) === newCategory &&
          s.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (dupe) {
        throw new Error(
          `"${name}" already exists in ${newCategory} — merge it if this is a duplicate.`,
        );
      }
      await createSkill(name, newCategory);
    },
    onSuccess: () => {
      toast.success("Skill added to the catalog");
      setCreateOpen(false);
      setNewName("");
      setNewCategory(OTHER_CATEGORY);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Clean up skill tags clients typed in — rename, recategorize, merge duplicates.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add skill
          </Button>
          <Button
            disabled={selected.length < 2}
            onClick={() => {
              setMergeTarget(selected[0] ?? "");
              setMergeOpen(true);
            }}
          >
            <Merge className="mr-1 h-4 w-4" /> Merge selected ({selected.length})
          </Button>
        </div>
      </div>

      <div className="card-amber flex flex-wrap items-center gap-3 rounded-3xl p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search skills by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-[220px] rounded-3xl bg-white/70" />
          <Skeleton className="h-[160px] rounded-3xl bg-white/70" />
        </div>
      )}
      {!isLoading && visible.length === 0 && (
        <p className="card-amber rounded-3xl border-dashed p-8 text-center font-display text-3xl font-medium">No skills match this filter.</p>
      )}

      {grouped.map(([cat, rows]) => (
        <div key={cat} className="card-amber overflow-hidden rounded-3xl">
          <div className="flex items-center justify-between border-b border-foreground/[0.06] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft">
                <Tag className="h-4 w-4 text-primary" />
              </div>
              <span className="font-display text-2xl font-semibold leading-tight">{cat}</span>
            </div>
            <Badge variant="secondary" className="h-6 rounded-full border-transparent px-2.5 text-[11.5px] font-semibold bg-primary-soft tabular-nums text-primary">{rows.length}</Badge>
          </div>
          <div className="divide-y divide-foreground/[0.06]">
            {rows.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-5 py-3 transition-colors duration-300 hover:bg-primary/[0.03]"
              >
                <Checkbox
                  checked={selected.includes(s.id)}
                  onCheckedChange={() => toggle(s.id)}
                  aria-label={`Select ${s.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {s.candidateCount} candidate{s.candidateCount === 1 ? "" : "s"} ·{" "}
                    {s.requestCount} request{s.requestCount === 1 ? "" : "s"}
                  </div>
                </div>
                <Badge
                  variant={s.usageCount === 0 ? "outline" : "secondary"}
                  className={`h-6 rounded-full border-transparent px-2.5 text-[11.5px] font-semibold tabular-nums ${s.usageCount === 0 ? "bg-foreground/[0.06] text-secondary-foreground" : "bg-primary-soft text-primary"}`}
                >
                  {s.usageCount} use{s.usageCount === 1 ? "" : "s"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-primary hover:bg-primary-soft"
                  aria-label={`Edit ${s.name}`}
                  onClick={() => {
                    setEditing(s);
                    setEditName(s.name);
                    setEditCategory(s.category ?? OTHER_CATEGORY);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add skill */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a skill</DialogTitle>
            <DialogDescription>
              Adds the skill straight to the catalog — you can tag it to roles afterwards from the
              Role skills tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-skill-name">Skill name *</Label>
              <Input
                id="new-skill-name"
                value={newName}
                placeholder="e.g. Salesforce"
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add skill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit skill</DialogTitle>
            <DialogDescription>Rename the skill or move it to another category.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="skill-name">Skill name *</Label>
              <Input
                id="skill-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge skills</DialogTitle>
            <DialogDescription>
              Pick the skill to keep. Every candidate and request linked to the others moves over,
              and the duplicates are removed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Keep this skill</Label>
            <Select value={mergeTarget} onValueChange={setMergeTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Choose the canonical skill" />
              </SelectTrigger>
              <SelectContent>
                {selectedSkills.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.usageCount} uses)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="pt-2 text-xs text-muted-foreground">
              Merging in:{" "}
              {selectedSkills
                .filter((s) => s.id !== mergeTarget)
                .map((s) => s.name)
                .join(", ") || "—"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => merge.mutate()} disabled={merge.isPending || !mergeTarget}>
              {merge.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Merge skills
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
