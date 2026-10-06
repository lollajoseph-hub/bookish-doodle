import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarCheck, CalendarPlus, ChevronDown, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DatePicker, TimePicker } from "@/components/date-time-fields";
import { TimezoneSelect } from "@/components/timezone-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DURATIONS = [30, 45, 60, 90];
const GAPS = [0, 15, 30];
const WEEKS = [1, 2, 3, 4, 6, 8];
const MAX_SLOTS = 400;
// Monday first; values are JavaScript weekday numbers (Sunday = 0).
const WEEKDAYS = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];

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

/* ---------------------------- timezone helpers ---------------------------- */

/** Milliseconds the timezone is ahead of UTC at a given instant. */
function tzOffsetMs(instant: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant when the clock in `tz` shows the given date and time (handles daylight saving). */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - tzOffsetMs(guess, tz);
  return new Date(guess - tzOffsetMs(first, tz));
}

function formatInTz(date: Date, tz: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...options }).format(date);
  } catch {
    return format(date, "PPp");
  }
}

function dayKeyInTz(date: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return format(date, "yyyy-MM-dd");
  }
}

function minutesOf(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Every interview start time for the weekly pattern, skipping times already in the past. */
function buildStarts({
  startDate,
  weeks,
  days,
  from,
  to,
  length,
  gap,
  tz,
}: {
  startDate: string;
  weeks: number;
  days: Set<number>;
  from: string;
  to: string;
  length: number;
  gap: number;
  tz: string;
}) {
  if (!startDate || !from || !to || days.size === 0) return [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const fromMin = minutesOf(from);
  const toMin = minutesOf(to);
  if (toMin <= fromMin) return [];
  const now = Date.now();
  const starts: Date[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const day = new Date(Date.UTC(sy, sm - 1, sd + i));
    if (!days.has(day.getUTCDay())) continue;
    for (let t = fromMin; t + length <= toMin; t += length + gap) {
      const start = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Math.floor(t / 60), t % 60, tz);
      if (start.getTime() > now) starts.push(start);
    }
  }
  return starts;
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
 * Times the candidate is free to interview. Staff add a weekly pattern (e.g. Monday to
 * Thursday, 8am to 2pm) in any timezone and the individual interview times are generated.
 * Clients who have the candidate on a request see the open times in their own timezone and
 * book one, which confirms the interview and sends the calendar invites.
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
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [tz, setTz] = useState(candidateTimezone || localTz);
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4]));
  const [from, setFrom] = useState("08:00");
  const [to, setTo] = useState("14:00");
  const [length, setLength] = useState("45");
  const [gap, setGap] = useState("15");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [weeks, setWeeks] = useState("2");
  const [singleOpen, setSingleOpen] = useState(false);
  const [singleDate, setSingleDate] = useState("");
  const [singleTime, setSingleTime] = useState("");
  const [deleteFor, setDeleteFor] = useState<SlotRow | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const queryKey = ["interview-slots", candidateId];

  const { data: slots = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchSlots(candidateId),
  });

  const planned = useMemo(
    () =>
      buildStarts({
        startDate,
        weeks: Number(weeks),
        days,
        from,
        to,
        length: Number(length),
        gap: Number(gap),
        tz,
      }),
    [startDate, weeks, days, from, to, length, gap, tz],
  );
  const existing = useMemo(() => new Set(slots.map((s) => new Date(s.starts_at).getTime())), [slots]);
  const newCount = planned.filter((d) => !existing.has(d.getTime())).length;

  async function insertStarts(starts: Date[], minutes: number) {
    const rows = starts.map((d) => ({
      candidate_id: candidateId,
      starts_at: d.toISOString(),
      duration_minutes: minutes,
    }));
    const { error } = await supabase
      .from("candidate_interview_slots")
      .upsert(rows, { onConflict: "candidate_id,starts_at", ignoreDuplicates: true });
    if (error) throw error;
  }

  const addWeekly = useMutation({
    mutationFn: async () => {
      if (minutesOf(to) <= minutesOf(from)) throw new Error("The end time must be after the start time.");
      if (planned.length === 0) throw new Error("Those settings don't produce any future times.");
      if (planned.length > MAX_SLOTS) throw new Error(`That's more than ${MAX_SLOTS} times. Use fewer weeks or days.`);
      await insertStarts(planned, Number(length));
    },
    onSuccess: () => {
      toast.success(newCount === 1 ? "Added 1 interview time" : `Added ${newCount} interview times`);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSingle = useMutation({
    mutationFn: async () => {
      const [y, mo, d] = singleDate.split("-").map(Number);
      const [h, mi] = singleTime.split(":").map(Number);
      const start = zonedToUtc(y, mo, d, h, mi, tz);
      if (start.getTime() <= Date.now()) throw new Error("Pick a time in the future.");
      if (existing.has(start.getTime())) throw new Error("That time is already in the list.");
      await insertStarts([start], Number(length));
    },
    onSuccess: () => {
      toast.success("Time added");
      setSingleTime("");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("candidate_interview_slots").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(count === 1 ? "Time removed" : `Removed ${count} open times`);
      setDeleteFor(null);
      setClearOpen(false);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openIds = slots.filter((s) => !bookedBy(s)).map((s) => s.id);
  const byDay = new Map<string, SlotRow[]>();
  for (const slot of slots) {
    const key = dayKeyInTz(new Date(slot.starts_at), tz);
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }
  const showLocal = tz !== localTz;

  const toggleDay = (day: number) =>
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  return (
    <div className="space-y-5">
      <section className="card-amber rounded-3xl p-5 sm:p-6">
        <h2 className="font-display text-2xl font-semibold leading-tight">Interview availability</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
          Set the hours this candidate is free and the interview times are created for you. Clients see the open
          times in their own timezone and book one, which confirms the interview and sends the calendar invites. A
          booked time disappears for everyone else.
        </p>

        <div className="mt-5 max-w-sm space-y-2">
          <Label htmlFor="slot-tz">Hours are in</Label>
          <TimezoneSelect id="slot-tz" value={tz} onChange={setTz} />
          <p className="text-xs text-muted-foreground">
            {candidateTimezone ? `Candidate's timezone: ${candidateTimezone}. ` : ""}Your timezone: {localTz}.
          </p>
        </div>

        {canEdit && (
          <>
            <form
              className="mt-6 space-y-5 rounded-2xl bg-stone/90 p-4 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.08)] sm:p-5"
              onSubmit={(e) => {
                e.preventDefault();
                addWeekly.mutate();
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Weekly hours</p>

              <div className="space-y-2">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Days">
                  {WEEKDAYS.map(({ day, label }) => {
                    const on = days.has(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleDay(day)}
                        className={cn(
                          "h-9 min-w-[52px] rounded-full px-3 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-300",
                          on
                            ? "bg-primary text-primary-foreground shadow-[0_10px_24px_-12px_rgb(67_24_103/0.6)]"
                            : "bg-white text-foreground/70 shadow-[inset_0_0_0_1px_rgb(26_19_32/0.1)] hover:text-primary",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="slot-from">From</Label>
                  <TimePicker id="slot-from" value={from} onChange={setFrom} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slot-to">To</Label>
                  <TimePicker id="slot-to" value={to} onChange={setTo} />
                </div>
                <div className="space-y-2">
                  <Label>Interview length</Label>
                  <Select value={length} onValueChange={setLength}>
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
                <div className="space-y-2">
                  <Label>Break between</Label>
                  <Select value={gap} onValueChange={setGap}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GAPS.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m === 0 ? "No break" : `${m} minutes`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slot-start">Starting</Label>
                  <DatePicker id="slot-start" value={startDate} onChange={setStartDate} disablePast />
                </div>
                <div className="space-y-2">
                  <Label>For</Label>
                  <Select value={weeks} onValueChange={setWeeks}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKS.map((w) => (
                        <SelectItem key={w} value={String(w)}>
                          {w === 1 ? "1 week" : `${w} weeks`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {minutesOf(to) <= minutesOf(from)
                    ? "The end time must be after the start time."
                    : planned.length === 0
                      ? "These settings don't produce any future times."
                      : newCount === 0
                        ? "All of these times are already listed."
                        : `Adds ${newCount} interview ${newCount === 1 ? "time" : "times"}${
                            newCount < planned.length ? ` (${planned.length - newCount} already listed)` : ""
                          }.`}
                </p>
                <Button type="submit" disabled={addWeekly.isPending || newCount === 0 || planned.length > MAX_SLOTS}>
                  {addWeekly.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                  Add times
                </Button>
              </div>
            </form>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setSingleOpen((v) => !v)}
                aria-expanded={singleOpen}
                className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary hover:underline hover:underline-offset-4"
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", singleOpen && "rotate-180")} />
                Add a single time instead
              </button>
              {singleOpen && (
                <form
                  className="mt-3 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!singleDate || !singleTime) {
                      toast.error("Pick a date and a time.");
                      return;
                    }
                    addSingle.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="single-date">Date</Label>
                    <DatePicker id="single-date" value={singleDate} onChange={setSingleDate} disablePast />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="single-time">Start time</Label>
                    <TimePicker id="single-time" value={singleTime} onChange={setSingleTime} />
                  </div>
                  <Button type="submit" variant="outline" disabled={addSingle.isPending || !singleDate || !singleTime}>
                    {addSingle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                    Add time ({length} min)
                  </Button>
                </form>
              )}
            </div>
          </>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {slots.length} upcoming {slots.length === 1 ? "time" : "times"}, {openIds.length} open. Shown in {tz}
              {showLocal ? ` (your time in brackets)` : ""}.
            </p>
            {canEdit && openIds.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setClearOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Remove all open times
              </Button>
            )}
          </div>
          {[...byDay.entries()].map(([day, daySlots]) => (
            <section key={day} className="card-amber rounded-3xl p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {formatInTz(new Date(daySlots[0].starts_at), tz, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
              <ul className="mt-3 divide-y divide-foreground/[0.06]">
                {daySlots.map((slot) => {
                  const client = bookedBy(slot);
                  const start = new Date(slot.starts_at);
                  return (
                    <li key={slot.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <span className="font-semibold tabular-nums">
                        {formatInTz(start, tz, { hour: "numeric", minute: "2-digit" })}
                      </span>
                      {showLocal && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          ({formatInTz(start, localTz, { weekday: "short", hour: "numeric", minute: "2-digit" })})
                        </span>
                      )}
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
          deleteFor
            ? `${formatInTz(new Date(deleteFor.starts_at), tz, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} will no longer be offered to clients.`
            : undefined
        }
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleteFor && remove.mutate([deleteFor.id])}
      />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title={`Remove all ${openIds.length} open times?`}
        description="Booked interviews stay as they are. Clients will no longer see any open times for this candidate."
        confirmLabel="Remove all"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(openIds)}
      />
    </div>
  );
}
