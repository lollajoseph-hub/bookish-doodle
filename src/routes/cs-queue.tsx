import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { HeartHandshake, RefreshCw, ShieldCheck, UserCog } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/cs-queue")({
  ssr: false,
  component: CsQueuePage,
});

type CsRow = {
  handoff_id: string;
  placement_id: string;
  candidate_id: string;
  candidate_name: string | null;
  clinic_name: string | null;
  recruiter_name: string | null;
  placement_date: string | null;
  start_date: string | null;
  status: string;
  assigned_cs_id: string | null;
  assigned_cs_name: string | null;
  position_title: string | null;
  created_at: string;
};

type StaffRow = { id: string; full_name: string | null; email: string | null; role: string };

const STATUS_TONE: Record<string, string> = {
  awaiting_pickup: "bg-amber-500/15 text-amber-700 border border-amber-500/40",
  contacted: "bg-sky-500/15 text-sky-700 border border-sky-500/40",
  onboarding_started: "bg-indigo-500/15 text-indigo-700 border border-indigo-500/40",
  onboarding_complete: "bg-emerald-500/15 text-emerald-700 border border-emerald-500/40",
  monitoring_started: "bg-violet-500/15 text-violet-700 border border-violet-500/40",
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_pickup: "Awaiting Pickup",
  contacted: "Contacted",
  onboarding_started: "Onboarding Started",
  onboarding_complete: "Onboarding Complete",
  monitoring_started: "Monitoring Started",
};

const NEXT_ACTIONS: Record<string, Array<{ value: string; label: string }>> = {
  awaiting_pickup: [{ value: "contacted", label: "Mark Contacted" }],
  contacted: [{ value: "onboarding_started", label: "Mark Onboarding Started" }],
  onboarding_started: [{ value: "onboarding_complete", label: "Mark Onboarding Complete" }],
  onboarding_complete: [{ value: "monitoring_started", label: "Mark Monitoring Started" }],
};

async function fetchCsQueue(): Promise<CsRow[]> {
  const { data, error } = await supabase.rpc("get_cs_queue");
  if (error) throw error;
  return (data ?? []) as CsRow[];
}

async function fetchStaff(): Promise<StaffRow[]> {
  const { data, error } = await supabase.rpc("admin_list_staff");
  if (error) throw error;
  return (data ?? []) as StaffRow[];
}

function fmt(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return d;
  }
}

function CsQueuePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();
  const queue = useQuery({ queryKey: ["cs-queue"], queryFn: fetchCsQueue, enabled: isAdmin });
  const staff = useQuery({ queryKey: ["admin-staff"], queryFn: fetchStaff, enabled: isAdmin });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const rows = queue.data ?? [];
    if (statusFilter === "all") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [queue.data, statusFilter]);

  if (!isAdmin) {
    return (
      <AppShell title="CS Queue">
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md text-center rounded-2xl border bg-card p-8 shadow-sm">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Access restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The Customer Success queue is available to admins only.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const assignOwner = async (handoffId: string, cs: string) => {
    setBusyId(handoffId);
    try {
      const { error } = await supabase.rpc("admin_cs_assign_owner", {
        p_handoff: handoffId,
        p_cs: cs,
      });
      if (error) throw error;
      toast.success("Owner assigned");
      await qc.invalidateQueries({ queryKey: ["cs-queue"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to assign");
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (handoffId: string, status: string) => {
    setBusyId(handoffId);
    try {
      const { error } = await supabase.rpc("admin_cs_set_status", {
        p_handoff: handoffId,
        p_status: status,
      });
      if (error) throw error;
      toast.success(`Marked ${STATUS_LABEL[status] ?? status}`);
      await qc.invalidateQueries({ queryKey: ["cs-queue"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update status");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell title="CS Queue">
      <div className="space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Customer Success Queue</h2>
            <p className="text-sm text-muted-foreground">
              {queue.data ? `${queue.data.length} placements in handoff` : "Loading…"}
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={queue.isFetching}
              onClick={async () => {
                await queue.refetch();
                toast.success("Refreshed");
              }}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${queue.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          {queue.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : queue.isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              Failed to load. {(queue.error as Error)?.message}
            </div>
          ) : !filtered.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
              <HeartHandshake className="h-8 w-8 text-muted-foreground/60" />
              No placements in the Customer Success queue.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Recruiter</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Placement</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned CS</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const nexts = NEXT_ACTIONS[r.status] ?? [];
                  return (
                    <TableRow key={r.handoff_id}>
                      <TableCell className="font-medium">{r.candidate_name ?? "—"}</TableCell>
                      <TableCell>{r.clinic_name ?? "—"}</TableCell>
                      <TableCell>{r.recruiter_name ?? "—"}</TableCell>
                      <TableCell>{r.position_title ?? "—"}</TableCell>
                      <TableCell>{fmt(r.placement_date)}</TableCell>
                      <TableCell>{fmt(r.start_date)}</TableCell>
                      <TableCell>
                        <Badge
                          className={`${STATUS_TONE[r.status] ?? "bg-secondary text-secondary-foreground"} border-0`}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.assigned_cs_name ? (
                          <span className="text-sm">{r.assigned_cs_name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId === r.handoff_id}
                              >
                                <UserCog className="h-4 w-4 mr-1" /> Assign
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Assign CS Owner</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {staff.isLoading ? (
                                <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
                              ) : !staff.data?.length ? (
                                <DropdownMenuItem disabled>No staff found</DropdownMenuItem>
                              ) : (
                                staff.data.map((s) => (
                                  <DropdownMenuItem
                                    key={s.id}
                                    onClick={() => assignOwner(r.handoff_id, s.id)}
                                  >
                                    <div className="flex flex-col">
                                      <span>{s.full_name ?? s.email}</span>
                                      <span className="text-[11px] text-muted-foreground capitalize">
                                        {s.role}
                                      </span>
                                    </div>
                                  </DropdownMenuItem>
                                ))
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {nexts.map((a) => (
                            <Button
                              key={a.value}
                              size="sm"
                              disabled={busyId === r.handoff_id}
                              onClick={() => setStatus(r.handoff_id, a.value)}
                            >
                              {a.label}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
