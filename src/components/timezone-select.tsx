import * as React from "react";
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

function offsetOf(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const tzn = parts.find((p) => p.type === "timeZoneName")?.value;
    return tzn ?? "";
  } catch {
    return "";
  }
}

function prettify(zone: string) {
  return zone.replace(/_/g, " ");
}

export interface TimezoneSelectProps {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function TimezoneSelect({
  value,
  onChange,
  id,
  placeholder = "Select timezone…",
  disabled,
}: TimezoneSelectProps) {
  const [open, setOpen] = React.useState(false);

  const labelFor = React.useCallback((z: string) => {
    const opt = TIMEZONE_OPTIONS.find((o) => o.id === z);
    const name = opt ? opt.label : prettify(z);
    const off = offsetOf(z);
    return off ? `${name} (${off})` : name;
  }, []);

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
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{value ? labelFor(value) : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search timezone…" />
          <CommandList className="max-h-72 overflow-auto">
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {TIMEZONE_OPTIONS.map((tz) => {
                const label = labelFor(tz.id);
                return (
                  <CommandItem
                    key={tz.id}
                    value={`${tz.id} ${label}`}
                    onSelect={() => {
                      onChange(tz.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === tz.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default TimezoneSelect;
