import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileCheck, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DatePicker } from "@/components/date-time-fields";
import { MatchStatusBadge } from "@/components/match-status";
import { RejectReasonDialog } from "@/components/reject-reason-dialog";
import {
  createPlacement,
  fetchMatchesByStatus,
  fetchPlacements,
  updateMatchStatus,
  type MatchPipelineView,
} from "@/lib/crm-queries";
import type { RejectionReason } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [rejectFor, setRejectFor] = useState<MatchPipelineView | null>(null);

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

  const reject = useMutation({
    mutationFn: ({ id, reason, note }: { id: string; reason: RejectionReason; note: string }) =>
      updateMatchStatus(id, "rejected", { rejection_reason: reason, rejection_reason_note: note }),
    onSuccess: () => {
      toast.success("Candidate rejected");
      setRejectFor(null);
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["all-matches"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Offer review" description="Offers awaiting a decision, and hires awaiting placement">
      <section className="space-y-4">
        <h2 className="font-display text-[32px] font-semibold leading-none">
          Offer out — create placement
        </h2>
        <p className="text-sm text-muted-foreground">
          The contract has been sent. Adding the commercial terms creates the placement and marks the
          candidate hired.
        </p>
        {isLoading && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-14 rounded-3xl bg-white/70" />
            <Skeleton className="h-14 rounded-3xl bg-white/70" />
            <Skeleton className="h-14 rounded-3xl bg-white/70" />
          </div>
        )}
        <div className="card-amber overflow-x-auto rounded-3xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Candidate</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Client</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Role</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link
                      to="/candidates/$candidateId"
                      params={{ candidateId: m.candidate_id }}
                      className="font-semibold text-primary hover:underline"
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
                      <Button size="sm" onClick={() => setPlacementFor(m)}>
                        Create placement
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reject.isPending}
                        onClick={() => setRejectFor(m)}
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
          <div className="card-amber flex flex-col items-center gap-4 rounded-3xl border-dashed px-6 py-14 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
              <FileCheck className="h-7 w-7" />
            </div>
            <p className="font-display text-3xl font-medium">No offers are pending a decision.</p>
          </div>
        )}
      </section>

      {/* Legacy: pre-existing "hired" matches with no placement row. Under the current
          pipeline this list stays empty, since creating the placement is what marks a
          match hired. Kept so older data is still visible. create_placement_and_mark_hired
          requires offer_extended, so it can't be used for these rows. */}
      <section className="mt-12 space-y-4">
        <h2 className="font-display text-[32px] font-semibold leading-none text-muted-foreground">
          Legacy — hired, awaiting placement
        </h2>
        <p className="text-sm text-muted-foreground">
          Older hires recorded before placements were created automatically.
        </p>
        <div className="card-amber overflow-x-auto rounded-3xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Candidate</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Client</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Role</TableHead>
                <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {awaitingPlacement.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link
                      to="/candidates/$candidateId"
                      params={{ candidateId: m.candidate_id }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {m.candidateName ?? "Candidate"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{m.clientName ?? "—"}</TableCell>
                  <TableCell className="text-sm">{m.roleName ?? m.requestTitle ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    Already marked hired without a placement record — create the placement manually.
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!awaitingPlacement.length && (
          <p className="rounded-2xl bg-stone/90 p-4 text-sm text-muted-foreground shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)]">Every hire has a placement record.</p>
        )}
      </section>

      <RejectReasonDialog
        open={!!rejectFor}
        onOpenChange={(o) => !o && setRejectFor(null)}
        pending={reject.isPending}
        onConfirm={(reason, note) => rejectFor && reject.mutate({ id: rejectFor.id, reason, note })}
      />

      <PlacementDialog
        match={placementFor}
        onClose={() => setPlacementFor(null)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["placements"] });
          queryClient.invalidateQueries({ queryKey: ["candidates"] });
          queryClient.invalidateQueries({ queryKey: ["matches"] });
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
        matchId: match.id,
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
              <DatePicker id="billing_start" value={billingStart} onChange={setBillingStart} />
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
            <DatePicker id="guarantee" value={guarantee} onChange={setGuarantee} />
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
