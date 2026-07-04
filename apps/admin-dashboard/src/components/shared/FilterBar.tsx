import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { Switch } from "@repo/ui/switch";
import { cn } from "@/lib/utils";

// ── FilterBar toolkit ───────────────────────────────────────────────────────
// One standard for every list filter in the admin dashboard. Pick the control
// by the shape of the choice, not by habit:
//   • Segmented  — single-select, 2–5 short options, all worth seeing at once.
//   • FilterSelect — single-select with many options or long labels.
//   • FilterToggle — a boolean on/off.
// Each control is labelled (via FilterField) and laid out by FilterBar so the
// spacing, wrapping, and search alignment are identical on every page.

/** Layout wrapper: labelled controls on the left, an optional search on the right. */
export function FilterBar({
  children,
  search,
  className,
}: {
  children: React.ReactNode;
  search?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 mb-4 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{children}</div>
      {search && <div className="lg:shrink-0">{search}</div>}
    </div>
  );
}

/** A muted label paired with its control. */
export function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      {children}
    </div>
  );
}

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

/** Segmented button group — single-select across a small set of short options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly FilterOption<T>[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 pointer-coarse:p-1",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "h-8 px-2.5 pointer-coarse:h-9 pointer-coarse:px-3 rounded text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Radix Select forbids an empty-string item value, so "all" rides a sentinel.
const ALL = "__all__";

/**
 * Single-select dropdown. An empty string means "no filter"; when `allLabel`
 * is given it renders a leading option that clears back to that empty value.
 */
export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  allLabel,
  placeholder,
  className,
}: {
  value: T | "";
  onChange: (value: T | "") => void;
  options: readonly FilterOption<T>[];
  allLabel?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select
      value={value === "" ? ALL : value}
      onValueChange={(v) => onChange(v === ALL ? "" : (v as T))}
    >
      <SelectTrigger
        size="sm"
        className={cn("h-9 pointer-coarse:h-11 bg-card", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A boolean on/off with an inline label. */
export function FilterToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        {label}
      </span>
    </label>
  );
}
