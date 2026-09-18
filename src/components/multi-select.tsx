import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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

export interface MultiSelectOption {
  value: string;
  label: string;
  group?: string | null;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No options found.",
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.value));

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  const groups = new Map<string, MultiSelectOption[]>();
  for (const o of options) {
    const key = o.group ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-auto min-h-10 w-full justify-between px-3 py-2 font-normal"
        >
          <span className="flex flex-1 flex-wrap items-center gap-1 text-left">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((o) => (
                <Badge key={o.value} variant="secondary" className="gap-1">
                  {o.label}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${o.label}`}
                    className="rounded-full outline-none hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(o.value);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </Badge>
              ))
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {[...groups.entries()].map(([group, items]) => (
              <CommandGroup key={group} heading={group || undefined}>
                {items.map((o) => (
                  <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(o.value) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
