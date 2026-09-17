import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const FALLBACK = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Phoenix",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Perth",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

const ZONES: string[] =
  typeof (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
    .supportedValuesOf === "function"
    ? (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
        "timeZone",
      )
    : FALLBACK;

function offsetFor(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // Normalize "GMT" alone to "GMT+00:00"
    if (tzName === "GMT") return "GMT+00:00";
    return tzName;
  } catch {
    return "";
  }
}

function pretty(zone: string) {
  return zone.replace(/_/g, " ");
}

export interface TimezoneSelectProps {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TimezoneSelect({
  value,
  onChange,
  id,
  placeholder = "Select timezone…",
  disabled,
  className,
}: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () =>
      ZONES.map((z) => ({
        zone: z,
        label: pretty(z),
        offset: offsetFor(z),
      })),
    [],
  );

  const current = value ? items.find((i) => i.zone === value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !current && "text-muted-foreground")}>
            {current
              ? `${current.label}${current.offset ? ` (${current.offset})` : ""}`
              : value || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]" align="start">
        <Command>
          <CommandInput placeholder="Search timezones…" />
          <CommandList className="max-h-72 overflow-y-auto">
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.zone}
                  value={`${item.zone} ${item.label} ${item.offset}`}
                  onSelect={() => {
                    onChange(item.zone);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === item.zone ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.offset && (
                    <span className="ml-2 text-xs text-muted-foreground">{item.offset}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
