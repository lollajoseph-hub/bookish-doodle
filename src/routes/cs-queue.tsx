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
      { title: "CS queue | Candidate Review System" },
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <AppShell title="CS queue">
        <p className="text-sm text-muted-foreground">Only admins can view the CS queue.</p>
      </AppShell>
    );
  }

  const flagged = requests.filter((r) => r.status === "needs_attention");

  return (
    <AppShell title="CS queue" description="Client requests that need attention">
      {isLoading && <p className="text-sm text-muted-foreground">Loading queue…</p>}
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Waiting</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flagged.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.clientName ?? "—"}</TableCell>
                <TableCell className="text-sm">{r.roleName ?? r.title ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
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
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <LifeBuoy className="h-4 w-4" /> Nothing needs attention right now.
        </p>
      )}
    </AppShell>
  );
}
