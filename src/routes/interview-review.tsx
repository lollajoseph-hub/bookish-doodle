import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CalendarClock, Loader2, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { TimezoneSelect } from "@/components/timezone-select";
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

export const Route = createFileRoute("/interview-review")({
  ssr: false,
  component: InterviewReviewPage,
});

interface QueueRow {
  match_id: string;
  status: string;
  candidate_name: string | null;
  clinic_name: string | null;
  role_title: string | null;
  interview_scheduled_at: string | null;
  interview_timezone: string | null;
  interview_link: string | null;
  meet_url: string | null;
  interview_mode: string | null;
  interview_confirmed_at: string | null;
}

const STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  interview_accepted: {
    label: "Candidate Accepted — Ready to Confirm",
    className:
      "bg-[color:var(--color-success)]/15 text-[color:var(--color-success-foreground)] border border-[color:var(--color-success)]/40",
  },
  interview_reschedule_requested: {
    label: "Candidate Requested Reschedule",
    className:
      "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning-foreground)] border border-[color:var(--color-warning)]/40",
  },
  interview_declined: {
    label: "Candidate Declined",
    className: "bg-destructive/15 text-destructive border border-destructive/40",
  },
  interview_proposed: {
    label: "Awaiting Candidate Response",
    className: "bg-muted text-muted-foreground border border-border",
  },
  interview_reschedule_proposed: {
    label: "Awaiting Clinic Acceptance",
    className: "bg-primary/15 text-primary border border-primary/30",
  },
  interview_confirmed: {
    label: "Interview Confirmed",
    className:
      "bg-[color:var(--color-success)]/15 text-[color:var(--color-success-foreground)] border border-[color:var(--color-success)]/40",
  },
  interview_completed: {
    label: "Interview completed",
    className: "bg-muted text-muted-foreground border border-border",
  },
  placement_confirmed: {
    label: "Placed",
    className:
      "bg-emerald-500/15 text-emerald-700 border border-emerald-500/40",
  },
};

const FILTER_OPTIONS: { value: string; label: string; statuses: string[] }[] = [
  { value: "all", label: "All", statuses: [] },
  { value: "proposed", label: "Proposed", statuses: ["interview_proposed"] },
  { value: "accepted", label: "Accepted", statuses: ["interview_accepted"] },
  { value: "reschedule", label: "Reschedule", statuses: ["interview_reschedule_requested", "interview_reschedule_proposed"] },
  { value: "declined", label: "Declined", statuses: ["interview_declined"] },
  { value: "confirmed", label: "Confirmed", statuses: ["interview_confirmed"] },
  { value: "completed", label: "Completed", statuses: ["interview_completed"] },
  { value: "placed", label: "Placed", statuses: ["placement_confirmed"] },
];

async function fetchQueue(): Promise<QueueRow[]> {
  const { data, error } = await supabase.rpc("get_interview_review_queue");
  if (error) throw error;
  return (data ?? []) as QueueRow[];
}

function InterviewReviewPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["interview-review-queue"], queryFn: fetchQueue });
  const [filter, setFilter] = useState<string>("all");

  const refresh = () => qc.invalidateQueries({ queryKey: ["interview-review-queue"] });

  const filtered = (q.data ?? []).filter((row) => {
    const opt = FILTER_OPTIONS.find((o) => o.value === filter);
    if (!opt || !opt.statuses.length) return true;
    return opt.statuses.includes(row.status);
  });

  return (
    <AppShell title="Interview Review">
      <div className="space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Interview Review</h2>
            <p className="text-sm text-muted-foreground">
              {q.data ? `${filtered.length} interviews` : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
              <CalendarClock className="h-8 w-8 text-muted-foreground/60" />
              No interviews match this filter.
            </div>
          ) : (
            filtered.map((row) => (
              <ReviewCard key={row.match_id} row={row} onChanged={refresh} />
            ))
          )}
        </div>

      </div>
    </AppShell>
  );
}

function ReviewCard({ row, onChanged }: { row: QueueRow; onChanged: () => void }) {
  const meta = STATUS_META[row.status] ?? {
    label: row.status.replace(/_/g, " "),
    className: "bg-muted text-muted-foreground border border-border",
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const showConfirm = row.status === "interview_accepted";
  const showProposeWithdraw =
    row.status === "interview_accepted" ||
    row.status === "interview_reschedule_requested" ||
    row.status === "interview_declined";
  const showComplete = row.status === "interview_confirmed";

  return (
    <div className="rounded-2xl border bg-card shadow-sm p-4">
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
          {row.interview_scheduled_at && (
            <div className="mt-1 text-sm">
              <CalendarClock className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-muted-foreground" />
              {format(new Date(row.interview_scheduled_at), "EEE, MMM d, yyyy 'at' h:mm a")}
              {row.interview_timezone ? ` (${row.interview_timezone})` : ""}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showConfirm && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => setConfirmOpen(true)}
            >
              Confirm Interview
            </Button>
          )}
          {showProposeWithdraw && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setProposeOpen(true)}
              >
                Propose New Time
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => setWithdrawOpen(true)}
              >
                Withdraw
              </Button>
            </>
          )}
          {showComplete && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                runRpc(
                  "mark_interview_completed",
                  { p_match: row.match_id },
                  "Marked completed",
                )
              }
            >
              {busy === "mark_interview_completed" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Mark Completed
            </Button>
          )}
          {row.meet_url && (
            <Button size="sm" variant="outline" asChild>
              <a
                href={row.meet_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join Google Meet
              </a>
            </Button>
          )}
        </div>
      </div>

      <ProposeTimeDialog
        open={proposeOpen}
        onOpenChange={setProposeOpen}
        defaultTimezone={row.interview_timezone}
        busy={busy === "recruiter_propose_reschedule"}
        onSubmit={async (isoAt, tz) => {
          await runRpc(
            "recruiter_propose_reschedule",
            { p_match: row.match_id, p_at: isoAt, p_timezone: tz, p_mode: "video" },
            "New time proposed",
          );
          setProposeOpen(false);
        }}
      />

      <WithdrawDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        busy={busy === "recruiter_withdraw_candidate"}
        onSubmit={async (reason) => {
          await runRpc(
            "recruiter_withdraw_candidate",
            { p_match: row.match_id, p_reason: reason },
            "Candidate withdrawn",
          );
          setWithdrawOpen(false);
        }}
      />

      <ConfirmInterviewDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        row={row}
        busy={busy === "recruiter_confirm_interview"}
        onConfirm={async () => {
          await runRpc(
            "recruiter_confirm_interview",
            { p_match: row.match_id },
            "Interview confirmed",
          );
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}

function ProposeTimeDialog({
  open,
  onOpenChange,
  defaultTimezone,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTimezone: string | null;
  busy: boolean;
  onSubmit: (isoAt: string, tz: string) => Promise<void>;
}) {
  const browserTz =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [tz, setTz] = useState(defaultTimezone ?? browserTz);

  const submit = async () => {
    if (!date || !time) {
      toast.error("Pick a date and time");
      return;
    }
    const iso = new Date(`${date}T${time}:00`).toISOString();
    await onSubmit(iso, tz);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose new interview time</DialogTitle>
          <DialogDescription>
            The candidate and clinic will be notified.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Time</label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Timezone</label>
            <TimezoneSelect value={tz} onChange={setTz} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Propose Time
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  busy: boolean;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw candidate?</DialogTitle>
          <DialogDescription>
            The candidate is removed from this interview. Optionally add a reason.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onSubmit(reason)} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Withdraw
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmInterviewDialog({
  open,
  onOpenChange,
  row,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: QueueRow;
  busy: boolean;
  onConfirm: () => Promise<void>;
}) {
  const datePart = row.interview_scheduled_at
    ? format(new Date(row.interview_scheduled_at), "EEEE, MMMM d, yyyy")
    : "—";
  const timePart = row.interview_scheduled_at
    ? format(new Date(row.interview_scheduled_at), "h:mm a")
    : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm interview?</DialogTitle>
          <DialogDescription>
            Please review the details before confirming.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Candidate:</span>{" "}
            <span className="font-medium">{row.candidate_name ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Clinic:</span>{" "}
            <span className="font-medium">{row.clinic_name ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Role:</span>{" "}
            <span className="font-medium">{row.role_title ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Date:</span>{" "}
            <span className="font-medium">{datePart}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Time:</span>{" "}
            <span className="font-medium">{timePart}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Timezone:</span>{" "}
            <span className="font-medium">{row.interview_timezone ?? "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Meeting Link:</span>{" "}
            {row.interview_link ? (
              <a
                href={row.interview_link}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline"
              >
                {row.interview_link}
              </a>
            ) : (
              <span className="font-medium">—</span>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Confirm Interview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
