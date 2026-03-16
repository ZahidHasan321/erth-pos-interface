import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Get a date as YYYY-MM-DD in the user's local timezone */
export function getLocalDateStr(date?: Date): string {
  return new Intl.DateTimeFormat("en-CA").format(date ?? new Date());
}

/** Parse any date value to local YYYY-MM-DD string */
export function toLocalDateStr(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : getLocalDateStr(d);
}

/** Get local midnight as a UTC ISO string (for DB timestamp queries) */
export function getLocalMidnightUtc(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Format an ISO date/timestamp to a readable short date like "Mar 22" or "Mar 22, 2025" (if not current year) */
export function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
