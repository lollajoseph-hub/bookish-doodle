import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** Id prefix for skills typed by an unauthenticated visitor, not yet created. */
export const PENDING_PREFIX = "new:";

interface RoleSkill {
  skill_id: string;
  name: string;
  category: string | null;
}

/**
 * Must-have skills picker scoped to a role via `get_role_skills`. Unlisted skills are
 * added through `add_or_get_skill_for_role` (category 'Other') and selected immediately.
 * `knownNames` resolves labels for selected ids not tagged to the role (e.g. cloned requests).
 */
export function RoleSkillSelect({
  roleId,
  value,
  onChange,
  knownNames,
  localAdd,
}: {
  roleId: string;
  value: string[];
  onChange: (ids: string[], names: string[]) => void;
  knownNames: Record<string, string>;
  /**
   * Unauthenticated flows: don't call the RPC — add unlisted skills as pending entries
   * with id `new:<name>`, to be resolved server-side on submission.
   */
  localAdd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<RoleSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!roleId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_role_skills", { p_role_id: roleId });
      if (cancelled) return;
      if (error) toast.error("We couldn't load skills for this role.");
      setOptions(((data as RoleSkill[] | null) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [roleId]);

  const labelFor = (id: string) =>
    (id.startsWith(PENDING_PREFIX) ? id.slice(PENDING_PREFIX.length) : undefined) ??
    options.find((o) => o.skill_id === id)?.name ?? knownNames[id] ?? "Skill";

  const emit = (ids: string[]) => onChange(ids, ids.map(labelFor));

  const toggle = (id: string) =>
    emit(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  async function addSkill() {
    const name = draft.trim();
    if (!name || !roleId) return;
    const existing = options.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!value.includes(existing.skill_id)) emit([...value, existing.skill_id]);
      setDraft("");
      return;
    }
    if (localAdd) {
      const pendingId = `${PENDING_PREFIX}${name}`;
      const already = value.find((v) => labelFor(v).toLowerCase() === name.toLowerCase());
      if (!already) emit([...value, pendingId]);
      setDraft("");
      return;
    }
    setAdding(true);
    const { data, error } = await supabase.rpc("add_or_get_skill_for_role", {
      p_role_id: roleId,
      p_skill_name: name,
      p_category: "Other",
    });
    setAdding(false);
    const row = (Array.isArray(data) ? data[0] : data) as
      | string
      | { skill_id?: string; id?: string; name?: string; category?: string | null }
      | null;
    const id = typeof row === "string" ? row : row?.skill_id ?? row?.id;
    if (error || !id) {
      toast.error(error?.message ?? "We couldn't add that skill.");
      return;
    }
    const skillName = (typeof row === "object" && row?.name) || name;
    const nextOptions = options.some((o) => o.skill_id === id)
      ? options
      : [...options, { skill_id: id, name: skillName, category: "Other" }];
    setOptions(nextOptions);
    const nextIds = value.includes(id) ? value : [...value, id];
    onChange(
      nextIds,
      nextIds.map((sid) => nextOptions.find((o) => o.skill_id === sid)?.name ?? knownNames[sid] ?? "Skill"),
    );
    setDraft("");
  }

  const disabled = !roleId;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-auto min-h-10 w-full justify-between px-3 py-2 font-normal"
        >
          <span className="flex flex-1 flex-wrap items-center gap-1 text-left">
            {disabled ? (
              <span className="text-muted-foreground">Select a role first</span>
            ) : value.length === 0 ? (
              <span className="text-muted-foreground">
                {loading ? "Loading skills…" : "Select the skills a candidate must have"}
              </span>
            ) : (
              value.map((id) => (
                <Badge key={id} variant="secondary" className="gap-1">
                  {labelFor(id)}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${labelFor(id)}`}
                    className="rounded-full outline-none hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search skills…" />
          <CommandList>
            <CommandEmpty>{loading ? "Loading…" : "No matching skills."}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.skill_id} value={o.name} onSelect={() => toggle(o.skill_id)}>
                  <Check
                    className={cn("mr-2 h-4 w-4", value.includes(o.skill_id) ? "opacity-100" : "opacity-0")}
                  />
                  {o.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t p-2">
          <div className="mb-1 text-xs font-medium text-muted-foreground">+ Add a skill not listed</div>
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  void addSkill();
                }
              }}
              placeholder="Skill name"
              className="h-8"
            />
            <Button type="button" size="sm" onClick={() => void addSkill()} disabled={adding || !draft.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
