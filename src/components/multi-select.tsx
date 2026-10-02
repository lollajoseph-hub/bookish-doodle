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

export type MultiSelectOption = { id: string; label: string };

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No options found.",
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="h-10 w-full justify-between rounded-xl border-input bg-white/90 px-3.5 py-2 text-left text-sm font-normal text-foreground shadow-none hover:bg-white/90 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10"
          >
            <span className="truncate">
              {selected.length
                ? selected
                    .map((id) => options.find((o) => o.id === id)?.label)
                    .filter(Boolean)
                    .join(", ")
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] overflow-hidden rounded-2xl p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const on = selected.includes(o.id);
                  return (
                    <CommandItem key={o.id} onSelect={() => toggle(o.id)}>
                      <Check
                        className={cn("mr-2 h-4 w-4", on ? "opacity-100 text-primary" : "opacity-0")}
                      />
                      {o.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const opt = options.find((o) => o.id === id);
            if (!opt) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className="inline-flex h-[26px] items-center rounded-full bg-primary-soft px-3 text-[11.5px] font-semibold text-primary transition-colors duration-300 hover:bg-primary/15"
              >
                {opt.label} ✕
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
