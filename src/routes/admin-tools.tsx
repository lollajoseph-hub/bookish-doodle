import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Archive, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { fetchCandidates, fetchStaffProfiles } from "@/lib/queries";
import { fetchClientRequests, labelize, setCandidateRecruiter, setCandidateStatus } from "@/lib/crm-queries";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CANDIDATE_STATUSES = [
  "available",
  "shortlisted",
  "interviewed",
  "hired",
  "placed",
  "rejected",
  "inactive",
  "archived",
];

export const Route = createFileRoute("/admin-tools")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin tools | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Admin interventions: change candidate status, reassign or archive." },
      { property: "og:title", content: "Admin tools | ScaleSource" },
      { property: "og:description", content: "Direct admin interventions on candidate records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminToolsPage,
});

function AdminToolsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["candidates"],
    queryFn: fetchCandidates,
    enabled: isAdmin,
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["staff"],
    queryFn: fetchStaffProfiles,
    enabled: isAdmin,
  });
  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ["client-requests"],
    queryFn: fetchClientRequests,
    enabled: isAdmin,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates.slice(0, 50);
    return candidates
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [candidates, search]);

  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  const needsRematch = useMemo(
    () =>
      requests
        .filter((r) => (r.rejection_count ?? 0) >= 4)
        .sort((a, b) => (b.rejection_count ?? 0) - (a.rejection_count ?? 0)),
    [requests],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => setCandidateStatus(id, status),
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recruiterMutation = useMutation({
    mutationFn: ({ id, recruiterId }: { id: string; recruiterId: string | null }) =>
      setCandidateRecruiter(id, recruiterId),
    onSuccess: () => {
      toast.success("Recruiter reassigned");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reshuffleMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc("reshuffle_request", {
        p_request_id: requestId,
        p_limit: 6,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Reshuffled — new candidates are being matched");
      queryClient.invalidateQueries({ queryKey: ["client-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <AppShell title="Admin tools">
        <p className="text-sm text-muted-foreground">Only admins can use these tools.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin tools" description="Direct interventions on candidate records">
      <Tabs defaultValue="candidates">
        <TabsList>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="mt-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search candidates…"
                  className="pl-9"
                />
              </div>
              {isLoading && <p className="text-sm text-muted-foreground">Loading candidates…</p>}
              <div className="divide-y overflow-hidden card-amber rounded-2xl border bg-card">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                      selectedId === c.id ? "bg-primary-soft" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{c.full_name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.recruiterName ?? "Unassigned"}
                      </div>
                    </div>
                    <Badge variant="secondary">{labelize(c.status)}</Badge>
                  </button>
                ))}
                {!isLoading && !filtered.length && (
                  <p className="px-4 py-6 text-sm text-muted-foreground">No candidates found.</p>
                )}
              </div>
            </div>

            <div className="card-amber rounded-2xl border bg-card p-5">
              {!selected ? (
                <p className="text-sm text-muted-foreground">
                  Pick a candidate on the left to change status, reassign or archive.
                </p>
              ) : (
                <div className="space-y-5">
                  <div>
                    <div className="text-lg font-semibold">{selected.full_name}</div>
                    <div className="text-sm text-muted-foreground">{selected.email ?? "No email"}</div>
                  </div>

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={selected.status ?? "available"}
                      onValueChange={(status) => statusMutation.mutate({ id: selected.id, status })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CANDIDATE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {labelize(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Recruiter</Label>
                    <Select
                      value={selected.recruiter_id ?? "none"}
                      onValueChange={(value) =>
                        recruiterMutation.mutate({
                          id: selected.id,
                          recruiterId: value === "none" ? null : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name || s.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant="outline"
                    disabled={statusMutation.isPending || selected.status === "archived"}
                    onClick={() => statusMutation.mutate({ id: selected.id, status: "archived" })}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    {selected.status === "archived" ? "Already archived" : "Archive candidate"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-5">
          <div className="card-amber rounded-2xl border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
                Requests needing a rematch
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Requests where the client has rejected 4 or more candidates. Reshuffling clears the
                rejections and matches a fresh batch.
              </p>
            </div>
            <div className="divide-y">
              {needsRematch.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <Link
                      to="/requests/$requestId"
                      params={{ requestId: r.id }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {r.clientName ?? "Client"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {r.roleName ?? "Role"} ·{" "}
                      <span className="font-medium text-amber-foreground">
                        {r.rejection_count}/4 rejected
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reshuffleMutation.isPending}
                    onClick={() => reshuffleMutation.mutate(r.id)}
                  >
                    {reshuffleMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Reshuffle
                  </Button>
                </div>
              ))}
              {!requestsLoading && !needsRematch.length && (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No requests need a rematch right now.
                </p>
              )}
              {requestsLoading && (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Loading requests…
                </p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
