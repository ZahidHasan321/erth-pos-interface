"use client";

import { cn } from "./lib/utils";

/**
 * Shoulder slope — a categorical body measurement with four fixed shapes.
 *
 * Self-contained (no @repo/database dependency): the four `value` strings here
 * MUST stay in sync with `SHOULDER_SLOPE_VALUES` / `SHOULDER_SLOPE_LABELS` in
 * @repo/database (the DB enum + Zod validation source). The shape drawings live
 * only here — they're pure presentation.
 *
 *   sloped_down  ╲   line high on the left, dropping to the right
 *   sloped_up    ╱   line low on the left, rising to the right
 *   straight    ───  flat / level shoulders
 *   peaked       ╱╲  rises to a centre point, drops to both sides
 */
export type ShoulderSlopeValue = "sloped_down" | "sloped_up" | "straight" | "peaked";

export const SHOULDER_SLOPE_UI: { value: ShoulderSlopeValue; label: string }[] = [
  { value: "sloped_down", label: "Sloped Down" },
  { value: "sloped_up", label: "Sloped Up" },
  { value: "straight", label: "Straight" },
  { value: "peaked", label: "Peaked" },
];

const isSlope = (v: unknown): v is ShoulderSlopeValue =>
  v === "sloped_down" || v === "sloped_up" || v === "straight" || v === "peaked";

/** The line drawing for one slope variant. Inherits color via `currentColor`. */
export function ShoulderSlopeShape({
  variant,
  className,
}: {
  variant: ShoulderSlopeValue;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {variant === "sloped_down" && <line x1="3" y1="5" x2="21" y2="11" />}
      {variant === "sloped_up" && <line x1="3" y1="11" x2="21" y2="5" />}
      {variant === "straight" && <line x1="3" y1="8" x2="21" y2="8" />}
      {variant === "peaked" && <polyline points="3,12 12,5 21,12" />}
    </svg>
  );
}

/**
 * Editable four-shape picker. Mirrors the §2.11 segmented-control pattern: an
 * unanswered value renders "not filled" (dashed amber, or red when invalid) so
 * the operator must make a deliberate choice rather than accept a silent default.
 */
export function ShoulderSlopeSelect({
  value,
  onChange,
  disabled,
  invalid,
  className,
}: {
  value: ShoulderSlopeValue | null | undefined;
  onChange: (v: ShoulderSlopeValue) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const answered = isSlope(value);
  return (
    <div
      className={cn(
        "inline-flex flex-wrap rounded-md border p-0.5 gap-0.5",
        disabled && "opacity-50",
        !answered
          ? invalid
            ? "border-red-400"
            : "border-dashed border-amber-400"
          : "border-border",
        className,
      )}
    >
      {SHOULDER_SLOPE_UI.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            title={o.label}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-[4px] px-2 py-1 transition-colors",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
              disabled && "cursor-not-allowed",
            )}
          >
            <ShoulderSlopeShape variant={o.value} className="h-4 w-7" />
            <span className="text-[10px] font-semibold leading-none">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Read-only shape + label, for detail views and QC fail reports. */
export function ShoulderSlopeDisplay({
  value,
  className,
}: {
  value: ShoulderSlopeValue | string | null | undefined;
  className?: string;
}) {
  if (!isSlope(value)) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  const label = SHOULDER_SLOPE_UI.find((o) => o.value === value)?.label ?? value;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <ShoulderSlopeShape variant={value} className="h-4 w-6" />
      <span className="text-xs font-medium">{label}</span>
    </span>
  );
}
