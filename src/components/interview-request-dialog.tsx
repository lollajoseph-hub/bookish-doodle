import { useEffect, useState } from "react";
import { format, startOfDay } from "date-fns";
import { ArrowLeft, CalendarCheck, CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TimePicker } from "@/components/date-time-fields";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Slot {
  id: string;
  starts_at: string;
  duration_minutes: number;
}

/**
 * Request an interview. If ScaleSource has set times the candidate is free,
 * the client picks one and it is booked straight away. Proposing a different
 * time with the calendar stays available as a backup (ScaleSource confirms it).
 */
export function InterviewRequestDialog({
  matchId,
  candidateName,
  onClose,
  onRequested,
}: {
  matchId: string | null;
  candidateName?: string | null;
  onClose: () => void;
  onRequested: () => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [mode, setMode] = useState<"slots" | "propose">("slots");
  const [slotId, setSlotId] = useState<string | null>(null);
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    setDate(undefined);
    setTime("");
    setBusy(false);
    setSlotId(null);
    setSlots(null);
    setMode("slots");
    let cancelled = false;
    void supabase.rpc("get_match_interview_slots", { p_match_id: matchId }).then(({ data, error }) => {
      if (cancelled) return;
      const list = error ? [] : ((data ?? []) as Slot[]);
      setSlots(list);
      if (list.length === 0) setMode("propose");
    });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  async function book() {
    if (!matchId || !slotId) return;
    setBusy(true);
    const { error } = await supabase.rpc("client_book_interview_slot", { p_match_id: matchId, p_slot_id: slotId });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      // The time may have just been taken: refresh the list.
      const { data } = await supabase.rpc("get_match_interview_slots", { p_match_id: matchId });
      setSlots((data ?? []) as Slot[]);
      setSlotId(null);
      return;
    }
    toast.success("Interview booked. Calendar invites are on their way.");
    onRequested();
  }

  async function propose() {
    if (!matchId || !date || !time) {
      toast.error("Choose a proposed date and time.");
      return;
    }

    const [hours, minutes] = time.split(":").map(Number);
    const proposedAt = new Date(date);
    proposedAt.setHours(hours, minutes, 0, 0);
    if (proposedAt.getTime() <= Date.now()) {
      toast.error("Choose a future date and time.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.rpc("client_request_interview", {
      p_match_id: matchId,
      p_proposed_at: proposedAt.toISOString(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Interview time proposed");
    onRequested();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "slots") void book();
    else void propose();
  }

  const hasSlots = !!slots && slots.length > 0;
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const byDay = new Map<string, Slot[]>();
  for (const slot of slots ?? []) {
    const key = format(new Date(slot.starts_at), "yyyy-MM-dd");
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }

  return (
    <Dialog open={!!matchId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="card-amber max-h-[92vh] overflow-y-auto rounded-[28px] bg-white/95 sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Request an interview</DialogTitle>
            <DialogDescription>
              {mode === "slots"
                ? `Pick a time that suits you to meet ${candidateName || "this candidate"}. It's confirmed straight away.`
                : `Propose a time to meet ${candidateName || "this candidate"}. ScaleSource will confirm it.`}
            </DialogDescription>
          </DialogHeader>

          {slots === null ? (
            <div aria-busy="true" aria-label="Loading available times" className="space-y-2">
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-10 rounded-2xl" />
              <Skeleton className="h-10 rounded-2xl" />
            </div>
          ) : mode === "slots" ? (
            <div className="space-y-4">
              {[...byDay.entries()].map(([day, daySlots]) => (
                <div key={day} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {format(new Date(daySlots[0].starts_at), "EEEE, MMMM d")}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {daySlots.map((slot) => {
                      const selected = slot.id === slotId;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSlotId(slot.id)}
                          className={cn(
                            "rounded-2xl px-3 py-2.5 text-left transition-[background-color,color,box-shadow] duration-300",
                            selected
                              ? "bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_rgb(67_24_103/0.75)]"
                              : "bg-white shadow-[inset_0_0_0_1px_rgb(26_19_32/0.1)] hover:shadow-[inset_0_0_0_1px_rgb(67_24_103/0.45)]",
                          )}
                        >
                          <span className="block text-sm font-semibold tabular-nums">
                            {format(new Date(slot.starts_at), "h:mm a")}
                          </span>
                          <span
                            className={cn(
                              "block text-xs tabular-nums",
                              selected ? "text-primary-foreground/80" : "text-muted-foreground",
                            )}
                          >
                            {slot.duration_minutes} min
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Times shown in your timezone ({localTz}).</p>
              <button
                type="button"
                onClick={() => setMode("propose")}
                className="rounded text-sm font-medium text-primary hover:underline hover:underline-offset-4"
              >
                None of these work? Propose a different time
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {hasSlots ? (
                <button
                  type="button"
                  onClick={() => setMode("slots")}
                  className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary hover:underline hover:underline-offset-4"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to available times
                </button>
              ) : (
                <p className="rounded-2xl bg-primary/[0.06] p-3 text-sm text-primary">
                  No set times are available yet. Propose one and ScaleSource will confirm it.
                </p>
              )}
              <div className="space-y-1.5">
                <Label>Proposed date</Label>
                <div className="flex justify-center rounded-2xl bg-white shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)]">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={{ before: startOfDay(new Date()) }}
                    initialFocus
                    className="pointer-events-auto p-3"
                    classNames={{
                      day_button:
                        "transition-[background-color,color,transform,box-shadow] duration-300 data-[selected-single=true]:scale-105 data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:shadow-md",
                    }}
                  />
                </div>
                {date && <p className="text-xs text-muted-foreground">{format(date, "EEEE, MMMM d, yyyy")}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="interview-time">Proposed time</Label>
                <TimePicker id="interview-time" value={time} onChange={setTime} />
                <p className="text-xs text-muted-foreground">Shown in your current timezone.</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            {mode === "slots" ? (
              <Button type="submit" disabled={!slotId || busy || slots === null}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CalendarCheck className="mr-1.5 h-4 w-4" />}
                Book interview
              </Button>
            ) : (
              <Button type="submit" disabled={!date || !time || busy || slots === null}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-1.5 h-4 w-4" />}
                Propose time
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
