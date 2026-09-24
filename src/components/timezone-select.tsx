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

const TIMEZONE_OPTIONS: { id: string; label: string }[] = [
  { id: "America/New_York", label: "US/Eastern" },
  { id: "America/Chicago", label: "US/Central" },
  { id: "America/Denver", label: "US/Mountain" },
  { id: "America/Los_Angeles", label: "US/Pacific" },
  { id: "America/Anchorage", label: "US/Alaska" },
  { id: "Pacific/Honolulu", label: "US/Hawaii" },
  { id: "America/Toronto", label: "Canada/Eastern" },
  { id: "America/Vancouver", label: "Canada/Pacific" },
  { id: "America/Mexico_City", label: "America/Mexico City" },
  { id: "America/Sao_Paulo", label: "America/Sao Paulo" },
  { id: "Europe/London", label: "Europe/London" },
  { id: "Europe/Dublin", label: "Europe/Dublin" },
  { id: "Europe/Lisbon", label: "Europe/Lisbon" },
  { id: "Europe/Madrid", label: "Europe/Madrid" },
  { id: "Europe/Paris", label: "Europe/Paris" },
  { id: "Europe/Berlin", label: "Europe/Berlin" },
  { id: "Europe/Amsterdam", label: "Europe/Amsterdam" },
  { id: "Europe/Rome", label: "Europe/Rome" },
  { id: "Europe/Athens", label: "Europe/Athens" },
  { id: "Africa/Lagos", label: "Africa/Lagos" },
  { id: "Africa/Accra", label: "Africa/Accra" },
  { id: "Africa/Nairobi", label: "Africa/Nairobi" },
  { id: "Africa/Johannesburg", label: "Africa/Johannesburg" },
  { id: "Africa/Cairo", label: "Africa/Cairo" },
  { id: "Asia/Dubai", label: "Asia/Dubai" },
  { id: "Asia/Riyadh", label: "Asia/Riyadh" },
  { id: "Asia/Kolkata", label: "Asia/Kolkata" },
  { id: "Asia/Manila", label: "Asia/Manila" },
  { id: "Asia/Singapore", label: "Asia/Singapore" },
  { id: "Asia/Shanghai", label: "Asia/Shanghai" },
  { id: "Asia/Tokyo", label: "Asia/Tokyo" },
  { id: "Australia/Sydney", label: "Australia/Sydney" },
];

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
      TIMEZONE_OPTIONS.map((opt) => ({
        zone: opt.id,
        label: opt.label,
        offset: offsetFor(opt.id),
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
