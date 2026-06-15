"use client";

import { cn } from "./lib/utils";

/**
 * Collar position — a categorical body measurement: Up / Down / Standard.
 *
 * Self-contained (no @repo/database dependency). "Standard" is the neutral
 * position and is stored as the *absence* of up/down (null in the DB), so the
 * form value model carries an explicit "standard" sentinel that the mappers
 * serialize to null. The three `value` strings here MUST stay in sync with the
 * `collar_position` enum (up/down) + the null=standard convention in
 * @repo/database.
 *
 * Lives next to `shoulder_slope` on the `measurements` row and mirrors its
 * §2.11 segmented-control pattern: an unanswered value renders "not filled"
 * (dashed amber, red when invalid) so the operator makes a deliberate choice.
 */
export type CollarPositionValue = "up" | "down" | "standard";

export const COLLAR_POSITION_UI: { value: CollarPositionValue; label: string }[] = [
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "standard", label: "Std" },
];

const isCollarPosition = (v: unknown): v is CollarPositionValue =>
  v === "up" || v === "down" || v === "standard";

/**
 * Editable three-choice picker. An unanswered value renders dashed amber (red
 * when invalid) so the operator must pick rather than accept a silent default.
 */
export function CollarPositionSelect({
  value,
  onChange,
  disabled,
  invalid,
  className,
}: {
  value: CollarPositionValue | null | undefined;
  onChange: (v: CollarPositionValue) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const answered = isCollarPosition(value);
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
      {COLLAR_POSITION_UI.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            title={o.label}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[4px] px-2.5 py-1 text-xs font-semibold transition-colors",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
              disabled && "cursor-not-allowed",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Read-only label for detail views and QC fail reports. The standard position
 * is stored as null/absence, so null reads back as "Standard".
 */
export function CollarPositionDisplay({
  value,
  className,
}: {
  value: CollarPositionValue | string | null | undefined;
  className?: string;
}) {
  const label = value === "up" ? "Up" : value === "down" ? "Down" : "Standard";
  return <span className={cn("text-xs font-medium", className)}>{label}</span>;
}
