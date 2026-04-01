import * as React from "react";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/popover";

// 15-min intervals, full 24 hours
const TIME_SLOTS: { value: string; label: string }[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    const value = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ampm = h < 12 ? "AM" : "PM";
    const label = `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
    TIME_SLOTS.push({ value, label });
  }
}

export function formatTime24to12(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour12}:${mStr} ${ampm}`;
}

/** Parse user input like "2:30 pm", "14:30", "2pm" into "HH:mm" or null */
function parseTimeInput(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, "");

  // Match patterns: "2:30pm", "14:30", "2pm", "230pm", "1430"
  const match = cleaned.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];

  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;

  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Fuzzy filter — matches against label and 24h value, e.g. "2p" matches "2:00 PM", "14" matches "2:00 PM" */
function filterSlots(query: string) {
  if (!query.trim()) return TIME_SLOTS;

  const q = query.trim().toLowerCase().replace(/\s+/g, "");

  return TIME_SLOTS.filter((slot) => {
    const label = slot.label.toLowerCase().replace(/\s+/g, "");
    const val = slot.value; // "HH:mm"
    // Match against 12h label, 24h value, or just the hour number
    return label.includes(q) || val.includes(q) || val.replace(":", "").includes(q);
  });
}

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TimePicker({
  value,
  onChange,
  placeholder = "Time",
  disabled,
  className,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  // Sync input display with value
  React.useEffect(() => {
    if (!open) {
      setInputValue(value ? formatTime24to12(value) : "");
    } else {
      // Clear on open so user can type to search immediately
      setInputValue("");
    }
  }, [value, open]);

  // Auto-scroll to selected time when opening
  React.useEffect(() => {
    if (open && selectedRef.current) {
      requestAnimationFrame(() => {
        selectedRef.current?.scrollIntoView({ block: "center" });
      });
    }
  }, [open]);

  const filtered = React.useMemo(() => filterSlots(inputValue), [inputValue]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      // Try exact parse first
      const parsed = parseTimeInput(inputValue);
      if (parsed) {
        onChange(parsed);
        setOpen(false);
        return;
      }
      // Otherwise select first filtered result
      if (filtered.length > 0) {
        onChange(filtered[0].value);
        setOpen(false);
      }
    }
  }

  function handleSlotClick(slotValue: string) {
    onChange(slotValue);
    setOpen(false);
  }

  const displayLabel = value ? formatTime24to12(value) : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex items-center gap-2 w-full h-9 rounded-md border bg-background px-3 text-sm transition-colors hover:bg-accent/50",
            disabled && "opacity-50 cursor-not-allowed",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 text-left truncate">{displayLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="!w-[var(--radix-popover-trigger-width)] min-w-[160px] p-0 pointer-events-auto"
      >
        {/* Search input */}
        <div className="border-b px-3 py-2">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Type to filter..."
            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        {/* Scrollable time list */}
        <div className="max-h-[240px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-center text-muted-foreground">
              No matching time — press Enter to use "{inputValue}"
            </div>
          ) : (
            filtered.map((slot) => {
              const isSelected = slot.value === value;
              return (
                <button
                  key={slot.value}
                  ref={isSelected ? selectedRef : undefined}
                  type="button"
                  onClick={() => handleSlotClick(slot.value)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-accent",
                  )}
                >
                  {slot.label}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
