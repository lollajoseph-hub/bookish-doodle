import { toast } from "sonner";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { fetchActivityLog } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  Clock,
  UserPlus,
  BookOpen,
  FileText,
  StickyNote,
  ClipboardCheck,
  Mic,
  Award,
  GraduationCap,
  Briefcase,
  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/activity")({
  ssr: false,
  component: ActivityLogPage,
});

const TYPE_ICON: Record<string, typeof Clock> = {
  candidate: UserPlus,
  enrollment: BookOpen,
  file: FileText,
  note: StickyNote,
  assessment: ClipboardCheck,
  roleplay: Mic,
  certificate: Award,
  graduation: GraduationCap,
  placement: Briefcase,
};

function ActivityLogPage() {
  const activity = useQuery({
    queryKey: ["activity-log"],
    queryFn: () => fetchActivityLog(80),
  });

  return (
    <AppShell title="Activity Log">
      <div className="space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Activity Log</h2>
            <p className="text-sm text-muted-foreground">
              Operational activity derived from candidate records. The full audit trail is
              available to admins.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={activity.isFetching} onClick={async () => { await activity.refetch(); toast.success("Refreshed"); }}>
            <RefreshCw className={`h-4 w-4 mr-2 ${activity.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm">
          {activity.isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : activity.isError ? (
            <div className="p-8 text-center text-sm text-destructive space-y-3">
              <div>Failed to load activity. {(activity.error as Error)?.message}</div>
              <Button size="sm" variant="outline" onClick={() => activity.refetch()}>
                Retry
              </Button>
            </div>
          ) : !activity.data?.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
              <Activity className="h-8 w-8 text-muted-foreground/60" />
              No operational activity yet.
            </div>
          ) : (
            <ul className="divide-y">
              {activity.data.map((item) => {
                const Icon = TYPE_ICON[item.type] ?? Clock;
                return (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        <span className="font-medium">{item.label}</span>
                        {item.detail && (
                          <span className="text-muted-foreground"> — {item.detail}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        {item.candidate_id ? (
                          <Link
                            to="/candidates/$candidateId"
                            params={{ candidateId: item.candidate_id }}
                            className="hover:text-primary hover:underline"
                          >
                            {item.candidate_name ?? "Candidate"}
                          </Link>
                        ) : (
                          <span>System</span>
                        )}
                        <span>·</span>
                        <span title={new Date(item.at).toLocaleString()}>
                          {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
