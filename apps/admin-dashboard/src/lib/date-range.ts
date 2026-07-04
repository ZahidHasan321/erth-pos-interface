/**
 * Dashboard date-range presets → UTC instant bounds [from, to).
 *
 * Every window is expressed in Kuwait-local calendar days (Asia/Kuwait, no DST)
 * and converted to UTC ISO strings, because the RPCs compare against UTC
 * `timestamp` columns with `>= p_from AND < p_to`. `to` is the start of
 * tomorrow (Kuwait), so the current day is always included.
 */
import { getLocalDateStr } from "@/lib/utils";

export type RangePreset = "today" | "week" | "month" | "quarter" | "all";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "quarter", label: "90 days" },
  { value: "all", label: "All time" },
];

/** Kuwait-local midnight (start of the given YYYY-MM-DD) as a UTC Date. */
function kuwaitMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000+03:00`);
}

/** Add `days` to a YYYY-MM-DD string, returning a new YYYY-MM-DD (UTC-safe). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface RangeBounds {
  from: string; // UTC ISO
  to: string; // UTC ISO (exclusive)
}

export function getRangeBounds(preset: RangePreset): RangeBounds {
  const today = getLocalDateStr(); // Kuwait YYYY-MM-DD
  const tomorrow = kuwaitMidnight(addDays(today, 1)).toISOString();

  if (preset === "all") {
    return { from: "2000-01-01T00:00:00.000Z", to: tomorrow };
  }

  const back = preset === "today" ? 0 : preset === "week" ? 6 : preset === "month" ? 29 : 89;
  const from = kuwaitMidnight(addDays(today, -back)).toISOString();
  return { from, to: tomorrow };
}
