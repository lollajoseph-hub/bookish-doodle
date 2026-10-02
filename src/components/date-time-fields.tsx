import { useEffect, useMemo, useRef, useState } from "react";
import { format, startOfDay } from "date-fns";
import { CalendarClock, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Styled replacements for the browser's native time / datetime-local inputs.
 * They produce exactly the same value strings ("HH:mm" and "yyyy-MM-ddTHH:mm"),
 * so every caller's parsing and validation stays unchanged.
 */

const SLOT_MINUTES = 15;

/** Every 15 minutes across the day, as "HH:mm". */
function buildSlots() {
  const slots: string[] = [];
  for (let m = 0; m < 24 * 60; m += SLOT_MINUTES) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}

export function formatTimeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return format(d, "h:mm a");
}

/** Scrollable list of time slots. Scrolls the chosen (or a sensible default) time into view. */
function TimeSlotList({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const slots = useMemo(buildSlots, []);
  // Keep a non-slot value (e.g. 10:07 from older data) selectable and visible.
  const list = value && !slots.includes(value) ? [...slots, value].sort() : slots;
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-time="${value || "09:00"}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [value]);
  return (
    <div ref={listRef} role="listbox" aria-label="Time" className="grid max-h-[17rem] gap-1 overflow-y-auto pr-1">
      {list.map((t) => {
        const selected = t === value;
        return (
          <button
            key={t}
            type="button"
            role="option"
            aria-selected={selected}
            data-time={t}
            onClick={() => onPick(t)}
            className={cn(
              "h-9 shrink-0 rounded-full px-4 text-left text-[13px] tabular-nums transition-[background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-primary font-semibold text-primary-foreground shadow-[0_8px_18px_-8px_rgb(67_24_103/0.7)]"
                : "text-secondary-foreground hover:bg-primary/[0.07] hover:text-foreground",
            )}
          >
            {formatTimeLabel(t)}
          </button>
        );
      })}
    </div>
  );
}

const triggerClass =
  "h-10 w-full justify-start gap-2 rounded-xl border border-input bg-white/90 px-3.5 text-left text-sm font-normal shadow-none hover:bg-white data-[empty=true]:text-muted-foreground";

/** Replaces <input type="time">. value / onChange use "HH:mm" like the native input. */
export function TimePicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} data-empty={!value} className={triggerClass}>
          <Clock className="h-4 w-4 text-primary" />
          {value ? formatTimeLabel(value) : "Pick a time"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 rounded-3xl p-2">
        <TimeSlotList
          value={value}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function splitDateTime(value: string): { date: Date | undefined; time: string } {
  if (!value) return { date: undefined, time: "" };
  const [d, t] = value.split("T");
  const [y, mo, da] = (d ?? "").split("-").map(Number);
  const date = y && mo && da ? new Date(y, mo - 1, da) : undefined;
  return { date, time: (t ?? "").slice(0, 5) };
}

/**
 * Replaces <input type="datetime-local">. value / onChange use "yyyy-MM-ddTHH:mm" like the native input,
 * and emit "" until both a date and a time are chosen (the native input behaves the same way).
 */
export function DateTimePicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const initial = splitDateTime(value);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(initial.date);
  const [time, setTime] = useState(initial.time);

  // Follow resets from the parent (e.g. Cancel clears the value).
  useEffect(() => {
    const next = splitDateTime(value);
    if (!value) {
      setDate(undefined);
      setTime("");
    } else {
      setDate(next.date);
      setTime(next.time);
    }
  }, [value]);

  const emit = (d: Date | undefined, t: string) => {
    onChange(d && t ? `${format(d, "yyyy-MM-dd")}T${t}` : "");
  };

  const label = date && time ? `${format(date, "EEE, MMM d, yyyy")} · ${formatTimeLabel(time)}` : date ? `${format(date, "EEE, MMM d, yyyy")} · pick a time` : "Pick a date and time";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} data-empty={!(date && time)} className={triggerClass}>
          <CalendarClock className="h-4 w-4 text-primary" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] rounded-3xl p-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              setDate(d);
              emit(d, time);
            }}
            disabled={{ before: startOfDay(new Date()) }}
            initialFocus
            className="p-1"
          />
          <div className="grid gap-2 border-t border-border pt-3 sm:w-40 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-1">
            <p className="px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Time</p>
            <TimeSlotList
              value={time}
              onPick={(t) => {
                setTime(t);
                emit(date, t);
              }}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Shown in your current timezone.</p>
          <Button type="button" size="sm" className="h-9 px-4" disabled={!(date && time)} onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
