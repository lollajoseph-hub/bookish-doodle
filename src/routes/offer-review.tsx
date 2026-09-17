import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MatchStatusBadge } from "@/components/match-status";
import { fetchMatchesByStatus, updateMatchStatus } from "@/lib/crm-queries";
import type { MatchStatus } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/offer-review")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Offer review | ScaleSource Candidate Review Dashboard" },
      { name: "description", content: "Candidates with an offer extended, awaiting a hire decision." },
      { property: "og:title", content: "Offer review | ScaleSource" },
      { property: "og:description", content: "Mark offers as hired or rejected." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfferReviewPage,
});

function OfferReviewPage() {
  const queryClient = useQueryClient();
  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["matches", "offer"],
    queryFn: () => fetchMatchesByStatus(["offer_extended"]),
  });

  const decide = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MatchStatus }) => updateMatchStatus(id, status),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Offer review" description="Offers extended, awaiting a decision">
      {isLoading && <p className="text-sm text-muted-foreground">Loading offers…</p>}
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link
                    to="/candidates/$candidateId"
                    params={{ candidateId: m.candidate_id }}
                    className="font-medium hover:underline"
                  >
                    {m.candidateName ?? "Candidate"}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{m.clientName ?? "—"}</TableCell>
                <TableCell className="text-sm">{m.roleName ?? m.requestTitle ?? "—"}</TableCell>
                <TableCell>
                  <MatchStatusBadge status={m.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: m.id, status: "hired" })}
                    >
                      Mark hired
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: m.id, status: "rejected" })}
                    >
                      Reject
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!isLoading && !matches.length && (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <FileCheck className="h-4 w-4" /> No offers are pending a decision.
        </p>
      )}
    </AppShell>
  );
}
