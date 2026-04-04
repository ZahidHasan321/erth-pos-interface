import type React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const TZ = "Asia/Kuwait";

/** Get a date as YYYY-MM-DD in Kuwait timezone */
export function getLocalDateStr(date?: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date ?? new Date());
}

/** Kuwait UTC+3 = 180 minutes. */
export function getLocalTzOffsetMinutes(): number {
  return 180;
}

/** Get Kuwait midnight as a UTC Date (for date boundary comparisons) */
export function getKuwaitMidnight(date?: Date): Date {
  const kuwaitDateStr = getLocalDateStr(date);
  return new Date(kuwaitDateStr + "T00:00:00+03:00");
}

/**
 * Parse a DB timestamp correctly as UTC.
 * Supabase returns `timestamp without tz` as "2025-04-04T21:00:00" (no Z),
 * so JS would parse it as local time. The value is actually UTC — append Z.
 */
export function parseUtcTimestamp(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (value.endsWith("Z") || value.includes("+")) return new Date(value);
  return new Date(value + "Z");
}

/** Parse any date value to local YYYY-MM-DD string */
export function toLocalDateStr(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : getLocalDateStr(d);
}

/**
 * Escape special PostgREST filter characters in user-provided search terms.
 * Prevents filter injection via characters like commas, dots, and parens
 * that have syntactic meaning in PostgREST .or() / .ilike() filters.
 */
export function sanitizeFilterValue(value: string): string {
  // Remove characters that are syntactically meaningful in PostgREST filters:
  // , (separates OR conditions), . (separates table.column), ( ) (grouping)
  // \ (escape char). We strip them rather than escape because PostgREST
  // doesn't have a reliable escaping mechanism for these in filter strings.
  return value.replace(/[,.()\\\x00]/g, '');
}

export function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };

  return debounced as (...args: Parameters<F>) => void;
}

/** Props to make a non-button element keyboard-accessible as a button */
export function clickableProps(onClick: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };
}
