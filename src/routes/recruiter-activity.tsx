import { Fragment, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Activity, ChevronDown, ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/recruiter-activity")({
  ssr: false,
  component: RecruiterActivityPage,
});

export type StaffActivityEntry = {
  id: string;
  actor_id: string;
  actor_name: string | null;
  entity_type: string;
  entity_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  created_at: string;
  summary: string | null;
  ref_label: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
};

export async function fetchStaffActivityFeed(
  recruiterId: string | null,
  limit: number,
): Promise<StaffActivityEntry[]> {
  const { data, error } = await supabase.rpc("get_staff_activity_feed", {
    p_recruiter_id: recruiterId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as StaffActivityEntry[];
}

type RecruiterOption = { recruiter_id: string; recruiter_name: string | null };

async function fetchRecruiterOptions(): Promise<RecruiterOption[]> {
  const { data, error } = await supabase.rpc("admin_recruiter_performance");
  if (error) throw error;
  return (data ?? []) as RecruiterOption[];
}

export function activityLine(e: StaffActivityEntry) {
  const summary = e.summary ?? `${e.action.toLowerCase()} on ${e.entity_type.replace(/_/g, " ")}`;
  return e.ref_label ? `${summary} — ${e.ref_label}` : summary;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words">
        {value == null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function RecruiterActivityPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [selectedId, setSelectedId] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const recruiters = useQuery({
    queryKey: ["recruiter-perf"],
    queryFn: fetchRecruiterOptions,
    enabled: isAdmin,
  });

  const feed = useQuery({
    queryKey: ["staff-activity-feed", selectedId],
    queryFn: () => fetchStaffActivityFeed(selectedId === "all" ? null : selectedId, 100),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <AppShell title="Recruiter Activity">
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="max-w-md text-center rounded-2xl border bg-card p-8 shadow-sm">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Access restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Recruiter activity is available to admins only.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const rows = feed.data ?? [];

  return (
    <AppShell title="Recruiter Activity">
      <div className="space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Recruiter Activity</h2>
            <p className="text-sm text-muted-foreground">
              Audit trail of recruiter actions across candidates, requests and matches.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="All recruiters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All recruiters</SelectItem>
                {(recruiters.data ?? []).map((r) => (
                  <SelectItem key={r.recruiter_id} value={r.recruiter_id}>
                    {r.recruiter_name ?? "Unnamed recruiter"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={feed.isFetching}
              onClick={async () => {
                await feed.refetch();
                toast.success("Refreshed");
              }}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${feed.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm">
          {feed.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : feed.isError ? (
            <div className="p-8 text-center text-sm text-destructive space-y-3">
              <div>Failed to load activity. {(feed.error as Error)?.message}</div>
              <Button size="sm" variant="outline" onClick={() => feed.refetch()}>
                Retry
              </Button>
            </div>
          ) : !rows.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
              <Activity className="h-8 w-8 text-muted-foreground/60" />
              No recruiter activity yet.
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((e) => {
                const open = expanded === e.id;
                return (
                  <Fragment key={e.id}>
                    <li>
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : e.id)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                      >
                        <span className="mt-0.5 text-muted-foreground">
                          {open ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">
                            <span className="font-medium">{e.actor_name ?? "Unknown user"}</span>{" "}
                            <span className="text-muted-foreground">{activityLine(e)}</span>
                          </span>
                          <span
                            className="block text-xs text-muted-foreground mt-0.5"
                            title={new Date(e.created_at).toLocaleString()}
                          >
                            {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                          </span>
                        </span>
                      </button>
                    </li>
                    {open && (
                      <li className="bg-muted/20 px-4 py-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <JsonBlock label="Before" value={e.old_values} />
                          <JsonBlock label="After" value={e.new_values} />
                        </div>
                      </li>
                    )}
                  </Fragment>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
