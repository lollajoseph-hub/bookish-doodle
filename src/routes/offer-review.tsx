import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileCheck, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MatchStatusBadge } from "@/components/match-status";
import {
  createPlacement,
  fetchMatchesByStatus,
  fetchPlacements,
  updateMatchStatus,
  type MatchPipelineView,
} from "@/lib/crm-queries";
import type { MatchStatus } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      { name: "description", content: "Offers awaiting a decision and hires awaiting a placement record." },
      { property: "og:title", content: "Offer review | ScaleSource" },
      { property: "og:description", content: "Decide on offers and confirm placements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfferReviewPage,
});

function OfferReviewPage() {
  const queryClient = useQueryClient();
  const [placementFor, setPlacementFor] = useState<MatchPipelineView | null>(null);

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["matches", "offer"],
    queryFn: () => fetchMatchesByStatus(["offer_extended"]),
  });
  const { data: hired = [] } = useQuery({
    queryKey: ["matches", "hired"],
    queryFn: () => fetchMatchesByStatus(["hired"]),
  });
  const { data: placements = [] } = useQuery({ queryKey: ["placements"], queryFn: fetchPlacements });

  const placedKeys = new Set(placements.map((p) => `${p.candidate_id}:${p.client_request_id ?? ""}`));
  const awaitingPlacement = hired.filter(
    (m) => !placedKeys.has(`${m.candidate_id}:${m.client_request_id ?? ""}`),
  );

  const decide = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MatchStatus }) => updateMatchStatus(id, status),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Offer review" description="Offers awaiting a decision, and hires awaiting placement">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
          Awaiting decision
        </h2>
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
              {offers.map((m) => (
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
        {!isLoading && !offers.length && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileCheck className="h-4 w-4" /> No offers are pending a decision.
          </p>
        )}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
          Hired, awaiting placement
        </h2>
        <p className="text-sm text-muted-foreground">
          The offer was accepted — add the commercial terms to create the placement record.
        </p>
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {awaitingPlacement.map((m) => (
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
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => setPlacementFor(m)}>
                      Create placement
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!awaitingPlacement.length && (
          <p className="text-sm text-muted-foreground">Every hire has a placement record.</p>
        )}
      </section>

      <PlacementDialog
        match={placementFor}
        onClose={() => setPlacementFor(null)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["placements"] });
          queryClient.invalidateQueries({ queryKey: ["candidates"] });
        }}
      />
    </AppShell>
  );
}

function PlacementDialog({
  match,
  onClose,
  onCreated,
}: {
  match: MatchPipelineView | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [seatTitle, setSeatTitle] = useState("");
  const [billingStart, setBillingStart] = useState("");
  const [monthlyRate, setMonthlyRate] = useState("");
  const [guarantee, setGuarantee] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!match?.client_request_id) throw new Error("This match has no client request");
      return createPlacement({
        candidateId: match.candidate_id,
        clientRequestId: match.client_request_id,
        seatTitle: seatTitle || match.requestTitle || match.roleName,
        billingStartDate: billingStart || null,
        monthlyRate: monthlyRate === "" ? null : Number(monthlyRate),
        guaranteeWindowExpires: guarantee || null,
        notes,
      });
    },
    onSuccess: () => {
      toast.success("Placement created");
      setSeatTitle("");
      setBillingStart("");
      setMonthlyRate("");
      setGuarantee("");
      setNotes("");
      onCreated();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!match} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create placement</DialogTitle>
          <DialogDescription>
            {match?.candidateName ?? "Candidate"} at {match?.clientName ?? "the client"}. This marks
            them as placed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seat_title">Seat title</Label>
            <Input
              id="seat_title"
              placeholder={match?.requestTitle ?? match?.roleName ?? "e.g. Customer Support Rep"}
              value={seatTitle}
              onChange={(e) => setSeatTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="billing_start">Billing start date</Label>
              <Input
                id="billing_start"
                type="date"
                value={billingStart}
                onChange={(e) => setBillingStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly_rate">Monthly rate</Label>
              <Input
                id="monthly_rate"
                type="number"
                min={0}
                value={monthlyRate}
                onChange={(e) => setMonthlyRate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="guarantee">Guarantee window expires</Label>
            <Input
              id="guarantee"
              type="date"
              value={guarantee}
              onChange={(e) => setGuarantee(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="placement_notes">Notes</Label>
            <Textarea
              id="placement_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create placement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
