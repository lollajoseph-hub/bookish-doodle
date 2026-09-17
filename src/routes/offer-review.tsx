import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { HandCoins, Loader2, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/offer-review")({
  ssr: false,
  component: OfferReviewPage,
});

interface OfferRow {
  match_id: string;
  status: string;
  candidate_name: string | null;
  clinic_name: string | null;
  role_title: string | null;
  offer_position: string | null;
  offer_salary: number | null;
  offer_employment_type: string | null;
  offer_weekly_hours: number | null;
  offer_start_date: string | null;
  offer_expires_at: string | null;
  offer_notes: string | null;
  hire_requested_at: string | null;
  offer_extended_at: string | null;
  offer_accepted_at: string | null;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  hire_requested: {
    label: "Hire Requested — Prepare Offer",
    className: "bg-primary/15 text-primary border border-primary/30",
  },
  offer_extended: {
    label: "Offer sent — awaiting candidate",
    className: "bg-muted text-muted-foreground border border-border",
  },
  offer_accepted: {
    label: "Candidate Accepted — Ready to Confirm",
    className:
      "bg-[color:var(--color-success)]/15 text-[color:var(--color-success-foreground)] border border-[color:var(--color-success)]/40",
  },
  offer_declined: {
    label: "Candidate declined",
    className: "bg-destructive/15 text-destructive border border-destructive/40",
  },
  offer_expired: {
    label: "Offer expired — re-extend or close",
    className: "bg-amber-500/15 text-amber-700 border border-amber-500/40",
  },
  placement_confirmed: {
    label: "Placed",
    className: "bg-emerald-500/15 text-emerald-700 border border-emerald-500/40",
  },
};

async function fetchQueue(): Promise<OfferRow[]> {
  const { data, error } = await supabase.rpc("get_offer_review_queue");
  if (error) throw error;
  return (data ?? []) as OfferRow[];
}

const FILTER_OPTIONS: { value: string; label: string; status: string | null }[] = [
  { value: "all", label: "All", status: null },
  { value: "hire_requested", label: "Hire Requested", status: "hire_requested" },
  { value: "offer_extended", label: "Offer Sent", status: "offer_extended" },
  { value: "offer_accepted", label: "Accepted", status: "offer_accepted" },
  { value: "offer_declined", label: "Declined", status: "offer_declined" },
  { value: "offer_expired", label: "Expired", status: "offer_expired" },
  { value: "placement_confirmed", label: "Placed", status: "placement_confirmed" },
];

function OfferReviewPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["offer-review-queue"], queryFn: fetchQueue });
  const [filter, setFilter] = useState<string>("all");

  const refresh = () => qc.invalidateQueries({ queryKey: ["offer-review-queue"] });

  const filtered = (() => {
    if (!q.data) return [];
    const opt = FILTER_OPTIONS.find((o) => o.value === filter);
    if (!opt?.status) return q.data;
    return q.data.filter((r) => r.status === opt.status);
  })();

  return (
    <AppShell title="Offer Review">
      <div className="space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Offer Review</h2>
            <p className="text-sm text-muted-foreground">
              {q.data ? `${filtered.length} offers` : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              disabled={q.isFetching}
              onClick={async () => {
                await q.refetch();
                toast.success("Refreshed");
              }}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${q.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {q.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))
          ) : q.isError ? (
            <div className="rounded-2xl border bg-card p-8 text-center text-sm text-destructive space-y-3">
              <div>Failed to load. {(q.error as Error)?.message}</div>
              <Button size="sm" variant="outline" onClick={() => q.refetch()}>
                Retry
              </Button>
            </div>
          ) : !filtered.length ? (
            <div className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
              <HandCoins className="h-8 w-8 text-muted-foreground/60" />
              No offers to display.
            </div>
          ) : (
            filtered.map((row) => (
              <OfferCard key={row.match_id} row={row} onChanged={refresh} />
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

function formatMoney(n: number | null) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return String(n);
  }
}

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return d;
  }
}

function OfferSummary({ row }: { row: OfferRow }) {
  return (
    <div className="mt-3 rounded-xl border bg-muted/30 p-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
      <div>
        <div className="text-xs text-muted-foreground">Position</div>
        <div className="font-medium">{row.offer_position ?? row.role_title ?? "—"}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Salary (staff only)</div>
        <div className="font-medium">{formatMoney(row.offer_salary)}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Employment Type</div>
        <div className="font-medium">{row.offer_employment_type ?? "—"}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Weekly Hours</div>
        <div className="font-medium">{row.offer_weekly_hours ?? "—"}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Start Date</div>
        <div className="font-medium">{formatDate(row.offer_start_date)}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Expires</div>
        <div className="font-medium">{formatDate(row.offer_expires_at)}</div>
      </div>
      {row.offer_notes && (
        <div className="col-span-2 sm:col-span-3">
          <div className="text-xs text-muted-foreground">Internal Notes</div>
          <div className="font-medium whitespace-pre-wrap">{row.offer_notes}</div>
        </div>
      )}
    </div>
  );
}

function OfferCard({ row, onChanged }: { row: OfferRow; onChanged: () => void }) {
  const meta = STATUS_META[row.status] ?? {
    label: row.status.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground border border-border",
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reissueConfirmOpen, setReissueConfirmOpen] = useState(false);

  const runRpc = async (fn: string, params: Record<string, any>, successMsg: string) => {
    setBusy(fn);
    try {
      const { error } = await supabase.rpc(fn, params);
      if (error) throw error;
      toast.success(successMsg);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const headline =
    row.status === "hire_requested"
      ? `${row.clinic_name ?? "Clinic"} wishes to hire ${row.candidate_name ?? "candidate"}.`
      : null;

  const showSummary =
    row.status === "offer_extended" ||
    row.status === "offer_accepted" ||
    row.status === "offer_expired" ||
    row.status === "placement_confirmed";

  return (
    <div
      className={`rounded-2xl border bg-card shadow-sm p-4 ${
        row.status === "offer_accepted"
          ? "ring-1 ring-[color:var(--color-success)]/40"
          : ""
      }`}
    >
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">
              {row.candidate_name ?? (
                <span className="italic text-muted-foreground">Unknown candidate</span>
              )}
            </span>
            <Badge className={`${meta.className} border-0`}>{meta.label}</Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {(row.clinic_name ?? "—") + " · " + (row.role_title ?? "—")}
          </div>
          {headline && <div className="mt-2 text-sm">{headline}</div>}
          {row.status === "offer_accepted" && (
            <div className="mt-2 text-sm font-medium text-[color:var(--color-success-foreground)]">
              Candidate accepted.
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.status === "hire_requested" && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => setSendOpen(true)}
            >
              Prepare & Send Offer
            </Button>
          )}
          {row.status === "offer_extended" && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setSendOpen(true)}
              >
                Edit & Reissue
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setWithdrawOpen(true)}
              >
                Withdraw Offer
              </Button>
            </>
          )}
          {row.status === "offer_accepted" && (
            <>
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  runRpc(
                    "recruiter_confirm_placement",
                    { p_match: row.match_id },
                    "Placement confirmed",
                  )
                }
              >
                {busy === "recruiter_confirm_placement" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Confirm Placement
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setReissueConfirmOpen(true)}
              >
                Edit & Reissue
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setWithdrawOpen(true)}
              >
                Withdraw Offer
              </Button>
            </>
          )}
          {row.status === "offer_expired" && (
            <>
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => setSendOpen(true)}
              >
                Extend Offer Again
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setCloseOpen(true)}
              >
                Close Candidate
              </Button>
            </>
          )}
        </div>
      </div>

      {showSummary && <OfferSummary row={row} />}

      <SendOfferDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        row={row}
        busy={busy === "recruiter_send_offer"}
        onSubmit={async (params) => {
          await runRpc(
            "recruiter_send_offer",
            { p_match: row.match_id, ...params },
            "Offer sent",
          );
          setSendOpen(false);
        }}
      />

      <WithdrawOfferDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        busy={busy === "recruiter_withdraw_offer"}
        onConfirm={async () => {
          await runRpc(
            "recruiter_withdraw_offer",
            { p_match: row.match_id, p_reason: null },
            "Offer withdrawn",
          );
          setWithdrawOpen(false);
        }}
      />

      <CloseCandidateDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        busy={busy === "recruiter_close_candidate"}
        onConfirm={async () => {
          await runRpc(
            "recruiter_close_candidate",
            { p_match: row.match_id, p_reason: null },
            "Candidate closed",
          );
          setCloseOpen(false);
        }}
      />

      <Dialog open={reissueConfirmOpen} onOpenChange={setReissueConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit & reissue offer?</DialogTitle>
            <DialogDescription>
              This resets the candidate's acceptance — they will need to accept the new terms.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReissueConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setReissueConfirmOpen(false);
                setSendOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SendOfferDialog({
  open,
  onOpenChange,
  row,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: OfferRow;
  busy: boolean;
  onSubmit: (params: {
    p_position: string;
    p_salary: number;
    p_employment_type: string;
    p_weekly_hours: number;
    p_start_date: string;
    p_expires_at: string;
    p_notes: string | null;
  }) => Promise<void>;
}) {
  const [position, setPosition] = useState(
    row.offer_position ?? row.role_title ?? "",
  );
  const [salary, setSalary] = useState(
    row.offer_salary != null ? String(row.offer_salary) : "",
  );
  const [employmentType, setEmploymentType] = useState(
    row.offer_employment_type ?? "Full-time",
  );
  const [weeklyHours, setWeeklyHours] = useState(
    row.offer_weekly_hours != null ? String(row.offer_weekly_hours) : "40",
  );
  const [startDate, setStartDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState(row.offer_notes ?? "");

  const submit = async () => {
    const salaryNum = Number(salary);
    const hoursNum = Number(weeklyHours);
    if (!position.trim()) return toast.error("Position is required");
    if (!salary || Number.isNaN(salaryNum)) return toast.error("Salary is required");
    if (!employmentType.trim()) return toast.error("Employment type is required");
    if (!weeklyHours || Number.isNaN(hoursNum))
      return toast.error("Weekly hours required");
    if (!startDate) return toast.error("Start date is required");
    if (!expiresAt) return toast.error("Expiration date is required");

    await onSubmit({
      p_position: position.trim(),
      p_salary: salaryNum,
      p_employment_type: employmentType.trim(),
      p_weekly_hours: Math.round(hoursNum),
      p_start_date: startDate,
      p_expires_at: expiresAt,
      p_notes: notes.trim() ? notes.trim() : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Prepare & send offer</DialogTitle>
          <DialogDescription>
            Salary is internal/staff-only and stored on the offer record.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Position</label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Salary</label>
              <Input
                type="number"
                inputMode="decimal"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="e.g. 75000"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Employment Type</label>
              <Input
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                placeholder="Full-time / Part-time / Contract"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Weekly Hours</label>
              <Input
                type="number"
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(e.target.value)}
              />
            </div>
            <div />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Offer Expiration</label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Internal Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context for the team"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Send Offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawOfferDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  busy: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw offer?</DialogTitle>
          <DialogDescription>
            This will retract the offer from the candidate.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Withdraw Offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseCandidateDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  busy: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close candidate?</DialogTitle>
          <DialogDescription>
            This will close the candidate for this role and end the process.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Close Candidate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
