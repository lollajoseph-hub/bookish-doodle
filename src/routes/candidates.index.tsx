import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search, Mail, Phone, UserCheck, Users } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { fetchCandidates, fetchJobRoles, type CandidateListItem } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const candidateSearchSchema = z.object({ role: z.string().optional() });

export const Route = createFileRoute("/candidates/")({
  ssr: false,
  validateSearch: candidateSearchSchema,
  head: () => ({
    meta: [
      { title: "Candidate Pool | ScaleSource Candidate Review Dashboard" },
      {
        name: "description",
        content: "Browse the ScaleSource candidate pool grouped by role, with recruiter ownership.",
      },
      { property: "og:title", content: "Candidate Pool | ScaleSource" },
      {
        property: "og:description",
        content: "Browse the ScaleSource candidate pool grouped by role.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CandidatesPage,
});

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function statusTone(status: string) {
  switch (status) {
    case "hired":
    case "placed":
      return "bg-[#e9f2ea] text-[#2f5f35]";
    case "shortlisted":
      return "bg-amber-soft text-gold-ink";
    case "available":
    case "interviewed":
      return "bg-primary-soft text-primary";
    case "rejected":
      return "bg-destructive/10 text-destructive";
    default:
      return "bg-foreground/[0.06] text-secondary-foreground";
  }
}

function CandidateTile({
  candidate,
  roleNames,
  selected,
  onSelect,
  onOpen,
}: {
  candidate: CandidateListItem;
  roleNames: string[];
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group text-left card-amber rounded-3xl p-5 transition-[box-shadow,border-color] duration-300 hover:border-[rgb(122_89_163/0.25)] hover:shadow-[0_22px_44px_-24px_rgb(46_16_73/0.5)] ${
        selected ? "ring-2 ring-amber" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#ebddf7] to-[#d6c2ea] text-sm font-semibold text-primary">
          {initials(candidate.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-xl font-semibold leading-tight">{candidate.full_name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {candidate.headline || roleNames[0] || "No headline"}
          </div>
        </div>
        {candidate.status && (
          <Badge variant="secondary" className={`h-6 shrink-0 rounded-full border-0 px-2.5 text-[11.5px] font-semibold capitalize ${statusTone(candidate.status)}`}>
            {candidate.status}
          </Badge>
        )}
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        {candidate.email && (
          <div className="flex items-center gap-1.5 truncate">
            <Mail className="h-3.5 w-3.5" /> {candidate.email}
          </div>
        )}
        {candidate.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" /> {candidate.phone}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <UserCheck className="h-3.5 w-3.5" /> {candidate.recruiterName ?? "Unassigned"}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {roleNames.slice(0, 3).map((r) => (
          <span key={r} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            {r}
          </span>
        ))}
        {candidate.skillCount > 0 && (
          <span className="rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-secondary-foreground">
            {candidate.skillCount} skills
          </span>
        )}
      </div>

      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        Open full profile →
      </div>
    </button>
  );
}

function CandidatesPage() {
  const navigate = useNavigate({ from: "/candidates/" });
  const { role } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: roles = [] } = useQuery({ queryKey: ["job-roles"], queryFn: fetchJobRoles });
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
  });
  const activeRole = role ?? "all";

  const roleName = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (!q) return true;
      return (
        c.full_name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.headline ?? "").toLowerCase().includes(q)
      );
    });
  }, [candidates, search]);

  const groups = useMemo(() => {
    const visibleRoles = activeRole === "all" ? roles : roles.filter((r) => r.id === activeRole);
    const out = visibleRoles.map((r) => ({
      id: r.id,
      name: r.name,
      items: filtered.filter((c) => c.roleIds.includes(r.id)),
    }));
    if (activeRole === "all") {
      const unassigned = filtered.filter((c) => c.roleIds.length === 0);
      if (unassigned.length) out.push({ id: "none", name: "No role assigned", items: unassigned });
    }
    return out.filter((g) => g.items.length > 0);
  }, [filtered, roles, activeRole]);

  return (
    <AppShell title="Candidate Pool" description="All candidates, grouped by role">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Every candidate in the pool, grouped by role</p>
          <Button onClick={() => navigate({ to: "/candidates/new" })}>
            <Plus className="h-4 w-4 mr-1" /> Add candidate
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="rounded-full bg-white/70 pl-9 backdrop-blur-md"
              placeholder="Search name, email, headline"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="text-sm tabular-nums text-muted-foreground">
            {filtered.length} of {candidates.length} candidates
          </div>
        </div>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-[188px] rounded-3xl bg-white/70" />
            <Skeleton className="h-[188px] rounded-3xl bg-white/70" />
            <Skeleton className="h-[188px] rounded-3xl bg-white/70" />
          </div>
        )}

        {!isLoading && !groups.length && (
          <div className="card-amber rounded-3xl border-dashed p-10 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
              <Users className="h-7 w-7" />
            </div>
            <p className="mt-4 font-display text-3xl font-medium">No candidates to show</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first candidate to start building the pool.
            </p>
            <Button className="mt-5" onClick={() => navigate({ to: "/candidates/new" })}>
              <Plus className="h-4 w-4 mr-1" /> Add candidate
            </Button>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.id} className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-[32px] font-semibold leading-none">
                {group.name}
              </h2>
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11.5px] font-semibold tabular-nums text-primary">
                {group.items.length}
              </span>
              <div className="h-px flex-1 bg-[rgb(26_19_32/0.08)]" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((c) => (
                <CandidateTile
                  key={`${group.id}-${c.id}`}
                  candidate={c}
                  roleNames={c.roleIds.map((id) => roleName.get(id) ?? "").filter(Boolean)}
                  selected={selectedId === c.id}
                  onSelect={() => setSelectedId(c.id)}
                  onOpen={() =>
                    navigate({ to: "/candidates/$candidateId", params: { candidateId: c.id } })
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
