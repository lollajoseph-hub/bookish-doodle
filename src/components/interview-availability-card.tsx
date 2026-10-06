import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { CalendarCheck, CalendarPlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DatePicker, TimePicker } from "@/components/date-time-fields";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DURATIONS = [30, 45, 60, 90];

interface SlotRow {
  id: string;
  starts_at: string;
  duration_minutes: number;
  booked_match_id: string | null;
  candidate_matches: {
    status: string;
    interview_scheduled_at: string | null;
    client_requests: { title: string | null; clients: { name: string | null } | null } | null;
  } | null;
}

/** A slot is booked only while the match that took it is still confirmed for that exact time. */
function bookedBy(slot: SlotRow) {
  const m = slot.candidate_matches;
  if (!slot.booked_match_id || !m) return null;
  if (!["interview_confirmed", "interview_completed"].includes(m.status)) return null;
  if (!m.interview_scheduled_at || new Date(m.interview_scheduled_at).getTime() !== new Date(slot.starts_at).getTime()) {
    return null;
  }
  return m.client_requests?.clients?.name ?? "A client";
}

async function fetchSlots(candidateId: string): Promise<SlotRow[]> {
  const { data, error } = await supabase
    .from("candidate_interview_slots")
    .select(
      "id,starts_at,duration_minutes,booked_match_id,candidate_matches(status,interview_scheduled_at,client_requests(title,clients(name)))",
    )
    .eq("candidate_id", candidateId)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as SlotRow[];
}

/**
 * Times the candidate is free to interview. Clients who have the candidate on a
 * request see the open times in the Candidate Pool and book one, which confirms
 * the interview and sends the calendar invites.
 */
export function InterviewAvailabilityCard({
  candidateId,
  candidateTimezone,
  canEdit,
}: {
  candidateId: string;
  candidateTimezone?: string | null;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("45");
  const [deleteFor, setDeleteFor] = useState<SlotRow | null>(null);
  const queryKey = ["interview-slots", candidateId];

  const { data: slots = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchSlots(candidateId),
  });

  const add = useMutation({
    mutationFn: async () => {
      const [y, mo, d] = date.split("-").map(Number);
      const [h, mi] = time.split(":").map(Number);
      const startsAt = new Date(y, mo - 1, d, h, mi, 0, 0);
      if (startsAt.getTime() <= Date.now()) throw new Error("Pick a time in the future.");
      const { error } = await supabase.from("candidate_interview_slots").insert({
        candidate_id: candidateId,
        starts_at: startsAt.toISOString(),
        duration_minutes: Number(duration),
      });
      if (error) {
        if (error.code === "23505") throw new Error("That time is already in the list.");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Time added");
      setTime("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candidate_interview_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Time removed");
      setDeleteFor(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const byDay = new Map<string, SlotRow[]>();
  for (const slot of slots) {
    const key = format(new Date(slot.starts_at), "yyyy-MM-dd");
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }

  return (
    <div className="space-y-5">
      <section className="card-amber rounded-3xl p-5 sm:p-6">
        <h2 className="font-display text-2xl font-semibold leading-tight">Interview availability</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
          Add the times this candidate is free to interview. Clients see the open times and book one, which
          confirms the interview and sends the calendar invites. A booked time disappears for everyone else.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Times are in your timezone ({localTz})
          {candidateTimezone ? `. Candidate's timezone: ${candidateTimezone}.` : "."}
        </p>

        {canEdit && (
          <form
            className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!date || !time) {
                toast.error("Pick a date and a time.");
                return;
              }
              add.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="slot-date">Date</Label>
              <DatePicker id="slot-date" value={date} onChange={setDate} disablePast />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slot-time">Start time</Label>
              <TimePicker id="slot-time" value={time} onChange={setTime} />
            </div>
            <div className="space-y-2">
              <Label>Length</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={add.isPending || !date || !time}>
              {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Add time
            </Button>
          </form>
        )}
      </section>

      {isLoading ? (
        <div aria-busy="true" aria-label="Loading" className="space-y-3">
          <Skeleton className="h-20 rounded-3xl bg-white/70" />
          <Skeleton className="h-20 rounded-3xl bg-white/70" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.06] p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : slots.length === 0 ? (
        <div className="card-amber rounded-3xl border-dashed p-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-soft to-amber-soft text-primary">
            <CalendarCheck className="h-7 w-7" />
          </div>
          <p className="mt-4 font-display text-3xl font-medium">No upcoming times</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Until times are added, clients can still propose their own time.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([day, daySlots]) => (
            <section key={day} className="card-amber rounded-3xl p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {format(new Date(daySlots[0].starts_at), "EEEE, MMMM d, yyyy")}
              </p>
              <ul className="mt-3 divide-y divide-foreground/[0.06]">
                {daySlots.map((slot) => {
                  const client = bookedBy(slot);
                  return (
                    <li key={slot.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <span className="font-semibold tabular-nums">{format(new Date(slot.starts_at), "h:mm a")}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">{slot.duration_minutes} min</span>
                      {client ? (
                        <span className="inline-flex h-6 items-center rounded-full bg-[#e9f2ea] px-2.5 text-[11.5px] font-semibold text-[#2f5f35]">
                          Booked by {client}
                        </span>
                      ) : (
                        <span className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2.5 text-[11.5px] font-semibold text-primary">
                          Open
                        </span>
                      )}
                      {canEdit && !client && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto text-destructive hover:text-destructive"
                          onClick={() => setDeleteFor(slot)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteFor}
        onOpenChange={(o) => !o && setDeleteFor(null)}
        title="Remove this time?"
        description={
          deleteFor ? `${format(new Date(deleteFor.starts_at), "EEE, MMM d 'at' h:mm a")} will no longer be offered to clients.` : undefined
        }
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleteFor && remove.mutate(deleteFor.id)}
      />
    </div>
  );
}
