import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Activity, AlertTriangle, RefreshCw, RotateCw, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/system-monitor")({
  ssr: false,
  component: SystemMonitorPage,
});

type MonitorData = {
  recovery_by_pipeline: Array<{
    pipeline: string;
    active: number;
    stuck: number;
    last_attempt: string | null;
  }>;
  stuck_total: number;
  active_total: number;
  stuck_items: Array<{
    pipeline: string;
    ref_id: string;
    attempts: number;
    last_attempt_at: string | null;
    alerted_at: string | null;
  }>;
  crons: Array<{ job: string; schedule: string; active: boolean }>;
};

async function fetchMonitor(): Promise<MonitorData> {
  const { data, error } = await supabase.rpc("admin_system_monitor");
  if (error) throw error;
  return (data ?? {
    recovery_by_pipeline: [],
    stuck_total: 0,
    active_total: 0,
    stuck_items: [],
    crons: [],
  }) as MonitorData;
}

function fmtTs(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "MMM d, HH:mm");
  } catch {
    return d;
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  tone?: "default" | "warning";
}) {
  const toneCls =
    tone === "warning"
      ? "bg-[color:var(--color-warning)]/20 text-[color:var(--color-warning-foreground)]"
      : "bg-primary/10 text-primary";
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function SystemMonitorPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();
  const mon = useQuery({
    queryKey: ["system-monitor"],
    queryFn: fetchMonitor,
    enabled: isAdmin,
    refetchInterval: 30_000,
  });
  const [retryingKey, setRetryingKey] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <AppShell title="System Monitor">
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md text-center rounded-2xl border bg-card p-8 shadow-sm">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Access restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              System Monitor is available to admins only.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const retry = async (pipeline: string, ref: string) => {
    const key = `${pipeline}:${ref}`;
    setRetryingKey(key);
    try {
      const { error } = await supabase.rpc("admin_retry_recovery", {
        p_pipeline: pipeline,
        p_ref: ref,
      });
      if (error) throw error;
      toast.success("Queued for retry");
      await qc.invalidateQueries({ queryKey: ["system-monitor"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Retry failed");
    } finally {
      setRetryingKey(null);
    }
  };

  return (
    <AppShell title="System Monitor">
      <div className="space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">System Monitor</h2>
            <p className="text-sm text-muted-foreground">Recovery pipelines and background jobs</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={mon.isFetching}
            onClick={async () => {
              await mon.refetch();
              toast.success("Refreshed");
            }}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${mon.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard icon={Activity} label="Active recovery items" value={mon.data?.active_total ?? 0} />
          <StatCard
            icon={AlertTriangle}
            label="Needs attention"
            value={mon.data?.stuck_total ?? 0}
            tone="warning"
          />
        </div>

        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold">Recovery pipelines</h3>
          </div>
          {mon.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !mon.data?.recovery_by_pipeline?.length ? (
            <div className="p-8 text-sm text-muted-foreground text-center">No pipelines registered.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Stuck</TableHead>
                  <TableHead>Last attempt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mon.data.recovery_by_pipeline.map((r) => (
                  <TableRow key={r.pipeline}>
                    <TableCell className="font-medium">{r.pipeline}</TableCell>
                    <TableCell>{r.active}</TableCell>
                    <TableCell>
                      {r.stuck > 0 ? (
                        <Badge className="bg-amber-500/15 text-amber-700 border-0">{r.stuck}</Badge>
                      ) : (
                        r.stuck
                      )}
                    </TableCell>
                    <TableCell>{fmtTs(r.last_attempt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold">Stuck items (needs attention)</h3>
          </div>
          {mon.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !mon.data?.stuck_items?.length ? (
            <div className="p-8 text-sm text-muted-foreground text-center">
              No stuck pipelines — all healthy.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Ref ID</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Last attempt</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mon.data.stuck_items.map((s) => {
                  const key = `${s.pipeline}:${s.ref_id}`;
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{s.pipeline}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs" title={s.ref_id}>
                          {s.ref_id.length > 12 ? `${s.ref_id.slice(0, 8)}…${s.ref_id.slice(-4)}` : s.ref_id}
                        </span>
                      </TableCell>
                      <TableCell>{s.attempts}</TableCell>
                      <TableCell>{fmtTs(s.last_attempt_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryingKey === key}
                          onClick={() => retry(s.pipeline, s.ref_id)}
                        >
                          <RotateCw
                            className={`h-4 w-4 mr-1 ${retryingKey === key ? "animate-spin" : ""}`}
                          />
                          Retry
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h3 className="font-semibold">Background jobs (cron)</h3>
          </div>
          {mon.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !mon.data?.crons?.length ? (
            <div className="p-8 text-sm text-muted-foreground text-center">No cron jobs registered.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mon.data.crons.map((c) => (
                  <TableRow key={c.job}>
                    <TableCell className="font-medium">{c.job}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{c.schedule}</span>
                    </TableCell>
                    <TableCell>
                      {c.active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 border-0">Active</Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground border-0">Inactive</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </AppShell>
  );
}
