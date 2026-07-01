"use client";

import { cn } from "./lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

/**
 * Shoulder slope — a categorical body measurement with ten fixed values,
 * entered as a plain text dropdown (no shape glyphs).
 *
 * Self-contained (no @repo/database dependency): the ten `value` strings here
 * MUST stay in sync with `SHOULDER_SLOPE_VALUES` / `SHOULDER_SLOPE_LABELS` in
 * @repo/database (the DB enum + Zod validation source). `normal` is an explicit
 * stored value (labelled "NORMAL" — no notable slope), distinct from a
 * never-filled NULL.
 */
export type ShoulderSlopeValue =
  | "normal"
  | "right_down"
  | "right_up"
  | "right_straight"
  | "left_down"
  | "left_up"
  | "left_straight"
  | "both_down"
  | "both_up"
  | "both_straight";

export const SHOULDER_SLOPE_UI: { value: ShoulderSlopeValue; label: string }[] = [
  { value: "normal", label: "NORMAL" },
  { value: "right_down", label: "RIGHT SHOULDER DOWN" },
  { value: "right_up", label: "RIGHT SHOULDER UP" },
  { value: "right_straight", label: "RIGHT SHOULDER STRAIGHT" },
  { value: "left_down", label: "LEFT SHOULDER DOWN" },
  { value: "left_up", label: "LEFT SHOULDER UP" },
  { value: "left_straight", label: "LEFT SHOULDER STRAIGHT" },
  { value: "both_down", label: "LEFT AND RIGHT SHOULDER DOWN" },
  { value: "both_up", label: "LEFT AND RIGHT SHOULDER UP" },
  { value: "both_straight", label: "LEFT AND RIGHT SHOULDER STRAIGHT" },
];

const isSlope = (v: unknown): v is ShoulderSlopeValue =>
  SHOULDER_SLOPE_UI.some((o) => o.value === v);

/**
 * Editable dropdown picker. An unanswered value renders "not filled" (dashed
 * amber, or red when invalid) so the operator must make a deliberate choice
 * rather than accept a silent default.
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
    <Select
      value={answered ? (value as string) : undefined}
      onValueChange={(v) => onChange(v as ShoulderSlopeValue)}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn(
          "w-full",
          !answered &&
            (invalid ? "border-red-400" : "border-dashed border-amber-400"),
          className,
        )}
      >
        <SelectValue placeholder="Select shoulder slope" />
      </SelectTrigger>
      <SelectContent>
        {SHOULDER_SLOPE_UI.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Read-only label, for detail views and QC fail reports. */
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
  return <span className={cn("text-xs font-medium", className)}>{label}</span>;
}
