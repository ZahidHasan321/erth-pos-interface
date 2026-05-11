"use client";
import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { cn } from "./lib/utils";
import { Input } from "./input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverAnchor, PopoverContent } from "./popover";

export interface AutocompleteOption {
  value: string;
  label: string;
  node?: React.ReactNode;
}

export interface AutocompleteProps {
  /** Selected option value, or null if nothing selected. */
  value: string | null;
  /** Fires with the new value (or null on clear). */
  onChange: (value: string | null) => void;
  options: AutocompleteOption[];
  placeholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  /** When set, shows a "Create '<query>'" item when the typed query has no exact match. */
  onCreate?: (query: string) => void | Promise<void>;
  /** Label for the create row. Defaults to: Create "<query>". */
  createLabel?: (query: string) => React.ReactNode;
  /** Disables the create row while the parent mutation is in flight. */
  isCreating?: boolean;
  /** Override how a selected option renders inside the input area. Defaults to its label. */
  renderSelected?: (option: AutocompleteOption) => React.ReactNode;
}

/**
 * Type-to-search combobox. Renders as a regular text input with a floating
 * suggestion list — type to filter, click or Enter to select, optionally
 * create new items inline via `onCreate`.
 */
export function Autocomplete({
  value,
  onChange,
  options,
  placeholder = "Search…",
  emptyMessage = "No results.",
  isLoading = false,
  disabled = false,
  clearable = true,
  className,
  onCreate,
  createLabel,
  isCreating = false,
  renderSelected,
}: AutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const displayValue = open ? query : selected ? (renderSelected ? "" : selected.label) : query;
  const showSelectedChip = !open && !!selected && !!renderSelected;

  const trimmedQuery = query.trim();
  const filtered = React.useMemo(() => {
    if (!trimmedQuery) return options;
    const q = trimmedQuery.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, trimmedQuery]);

  const exactMatch = trimmedQuery && options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());
  const canCreate = !!onCreate && trimmedQuery.length > 0 && !exactMatch && !isCreating;

  function commitOption(opt: AutocompleteOption) {
    onChange(opt.value);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleCreate() {
    if (!onCreate || !trimmedQuery) return;
    void onCreate(trimmedQuery);
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <Popover open={open && !disabled} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <PopoverAnchor asChild>
        <div className={cn("relative", className)}>
          {showSelectedChip && selected && renderSelected && (
            <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none">
              {renderSelected(selected)}
            </div>
          )}
          <Input
            ref={inputRef}
            value={displayValue}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpen(true);
              // Typing after a selection clears the selection so the input
              // reflects only the active query.
              if (selected) onChange(null);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                inputRef.current?.blur();
                return;
              }
              if (e.key === "ArrowDown" && !open) setOpen(true);
              if (e.key === "Enter" && open) {
                const exact = trimmedQuery
                  ? options.find((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase())
                  : null;
                if (exact) {
                  e.preventDefault();
                  commitOption(exact);
                } else if (canCreate) {
                  e.preventDefault();
                  handleCreate();
                } else if (filtered.length === 1) {
                  e.preventDefault();
                  commitOption(filtered[0]);
                } else if (filtered.length > 0 || trimmedQuery) {
                  // Suppress accidental form submit while the popover is open.
                  e.preventDefault();
                }
              }
            }}
            placeholder={selected && !open ? "" : placeholder}
            disabled={disabled}
            className={cn(
              showSelectedChip && "text-transparent caret-foreground",
              "pr-16",
            )}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1">
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {clearable && selected && !disabled && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleClear(); }}
                className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                aria-label="Clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="!w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Don't close on clicks inside the trigger anchor (the input itself).
          if ((e.target as HTMLElement)?.closest?.("[data-slot='popover-anchor']")) {
            e.preventDefault();
          }
        }}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {isLoading && (
              <div className="py-6 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && filtered.length === 0 && !canCreate && (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            )}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => commitOption(option)}
                  >
                    {option.node ?? option.label}
                    {option.value === value && <Check className="ml-auto h-4 w-4 shrink-0" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canCreate && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${trimmedQuery}`}
                  onSelect={handleCreate}
                  className="text-primary"
                >
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  {createLabel ? createLabel(trimmedQuery) : <>Create "{trimmedQuery}"</>}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
