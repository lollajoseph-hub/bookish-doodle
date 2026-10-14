import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RequestStatusBadge } from "@/components/match-status";
import { fetchClientRequests, updateRequestStatus } from "@/lib/crm-queries";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/cs-queue")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CS queue | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Client requests flagged as needing attention from the team." },
      { property: "og:title", content: "CS queue | ScaleSource" },
      { property: "og:description", content: "Client requests that need attention." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CsQueuePage,
});

function CsQueuePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["client-requests"],
    queryFn: fetchClientRequests,
    enabled: isAdmin,
  });

  const reopen = useMutation({
    mutationFn: (id: string) => updateRequestStatus(id, "open"),
    onSuccess: () => {
      toast.success("Request moved back to open");
      queryClient.invalidateQueries({ queryKey: ["client-requests"] });
      queryClient.invalidateQueries({ queryKey: ["client-request"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <AppShell title="CS queue">
        <p className="rounded-2xl bg-primary/[0.06] p-4 text-sm text-primary">Only admins can view the CS queue.</p>
      </AppShell>
    );
  }

  const flagged = requests.filter((r) => r.status === "needs_attention");

  return (
    <AppShell title="CS queue" description="Client requests that need attention">
      {isLoading && (
        <div className="mb-4 space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-14 rounded-3xl bg-white/70" />
          <Skeleton className="h-14 rounded-3xl bg-white/70" />
          <Skeleton className="h-14 rounded-3xl bg-white/70" />
        </div>
      )}
      <div className="card-amber overflow-x-auto rounded-3xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Client</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Role</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Waiting</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flagged.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.clientName ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.roleName ?? r.title ?? "—"}</TableCell>
                <TableCell className="text-xs tabular-nums text-muted-foreground">
                  {formatDistanceToNow(new Date(r.updated_at ?? r.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <RequestStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/requests/$requestId" params={{ requestId: r.id }}>
                        Open request
                      </Link>
                    </Button>
                    <Button size="sm" disabled={reopen.isPending} onClick={() => reopen.mutate(r.id)}>
                      Mark open
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!isLoading && !flagged.length && (
        <div className="card-amber mt-4 flex flex-col items-center gap-4 rounded-3xl border-dashed px-6 py-14 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
            <LifeBuoy className="h-7 w-7" />
          </div>
          <p className="font-display text-3xl font-medium">Nothing needs attention right now.</p>
        </div>
      )}
    </AppShell>
  );
}
