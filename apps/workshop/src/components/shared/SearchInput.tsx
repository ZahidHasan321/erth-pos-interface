import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@repo/ui/input";
import { cn } from "@/lib/utils";

// ── SearchInput ───────────────────────────────────────────────────────────
// The one search box for the workshop app: leading search icon, a clear-X that
// is always present (and tappable, not hover-only) while there's a value, a
// touch-sized control on coarse pointers, and an INTERNAL debounce so the input
// stays responsive while the parent's filter value updates ~200ms behind.
//
// The parent owns the value (so it can be cleared externally / reflected in a
// subtitle); this component keeps a local draft that it flushes on the debounce
// and resyncs whenever the controlled value changes from outside.

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Debounce in ms before the parent's onChange fires. Default 200. */
  debounceMs?: number;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  debounceMs = 200,
}: SearchInputProps) {
  const [draft, setDraft] = React.useState(value);

  // Resync the local draft when the controlled value changes from outside
  // (external clear, reset, etc.) — but not when our own debounced flush is
  // what changed it (draft already equals value in that case).
  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  React.useEffect(() => {
    if (draft === value) return;
    const id = window.setTimeout(() => onChange(draft), debounceMs);
    return () => window.clearTimeout(id);
  }, [draft, value, onChange, debounceMs]);

  const clear = () => {
    setDraft("");
    onChange("");
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="pl-9 pr-9 pointer-coarse:h-11"
      />
      {draft && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center size-7 pointer-coarse:size-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
