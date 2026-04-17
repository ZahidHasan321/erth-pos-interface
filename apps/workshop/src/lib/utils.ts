import type React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { type WorkshopGarment, TIMEZONE } from "@repo/database";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = TIMEZONE;
export { TIMEZONE };

/** Get a date as YYYY-MM-DD in Kuwait timezone */
export function getLocalDateStr(date?: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date ?? new Date());
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

/** Get Kuwait midnight as a UTC ISO string (for DB timestamp queries) */
export function getLocalMidnightUtc(): string {
  return getKuwaitMidnight().toISOString();
}

/**
 * UTC ISO bounds covering a Kuwait-local day.
 * `dateStr` is YYYY-MM-DD in Kuwait tz (omit for today).
 * Start = Kuwait 00:00, End = Kuwait 23:59:59.999 — both expressed as UTC ISO
 * strings safe to pass to Supabase `gte/lte` filters on `timestamp` columns.
 */
export function getKuwaitDayRange(dateStr?: string): { start: string; end: string } {
  const base = dateStr ?? getLocalDateStr();
  const start = new Date(base + "T00:00:00.000+03:00");
  const end = new Date(start.getTime() + 86_400_000 - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Format an ISO date/timestamp to a readable short date like "Mar 22" or "Mar 22, 2025" (if not current year) */
export function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-GB", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// ── Order grouping helpers (shared across pages) ─────────────────────────────

export interface OrderGroup {
  order_id: number;
  invoice_number?: number;
  customer_name?: string;
  customer_mobile?: string;
  brands: string[];
  express: boolean;
  soaking: boolean;
  home_delivery?: boolean;
  delivery_date?: string;
  garments: WorkshopGarment[];
}

export function groupByOrder(garments: WorkshopGarment[]): OrderGroup[] {
  const map = new Map<number, OrderGroup>();
  for (const g of garments) {
    if (!map.has(g.order_id)) {
      map.set(g.order_id, {
        order_id: g.order_id,
        invoice_number: g.invoice_number,
        customer_name: g.customer_name,
        customer_mobile: g.customer_mobile,
        brands: [],
        express: false,
        soaking: false,
        home_delivery: g.home_delivery_order,
        delivery_date: g.delivery_date_order,
        garments: [],
      });
    }
    const entry = map.get(g.order_id)!;
    entry.garments.push(g);
    if (g.express) entry.express = true;
    if (g.soaking) entry.soaking = true;
    if (g.order_brand && !entry.brands.includes(g.order_brand)) entry.brands.push(g.order_brand);
  }
  return Array.from(map.values());
}

export function garmentSummary(garments: WorkshopGarment[]): string {
  const b = garments.filter((g) => g.garment_type === "brova").length;
  const f = garments.filter((g) => g.garment_type === "final").length;
  const parts: string[] = [];
  if (b) parts.push(`${b} Brova`);
  if (f) parts.push(`${f} Final${f > 1 ? "s" : ""}`);
  return parts.join(" + ") || `${garments.length} garment${garments.length !== 1 ? "s" : ""}`;
}

// ── Delivery urgency helpers ────────────────────────────────────────────────

export type DeliveryUrgencyStatus = 'overdue' | 'urgent' | 'normal' | 'none';

export const DELIVERY_URGENCY_STYLES = {
  overdue: { pill: "bg-red-100 text-red-800", text: "text-red-700" },
  urgent: { pill: "bg-amber-100 text-amber-800", text: "text-amber-700" },
  normal: { pill: "text-muted-foreground", text: "text-muted-foreground" },
  none: { pill: "", text: "" },
} as const;

export function getDeliveryUrgency(dateValue: string | null | undefined) {
  if (!dateValue) return { daysLeft: null, label: null, status: 'none' as const, ...DELIVERY_URGENCY_STYLES.none };
  const daysLeft = Math.ceil((parseUtcTimestamp(dateValue).getTime() - Date.now()) / 86400000);
  const label = daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `${daysLeft}d`;
  if (daysLeft < 0) return { daysLeft, label, status: 'overdue' as const, ...DELIVERY_URGENCY_STYLES.overdue };
  if (daysLeft <= 2) return { daysLeft, label, status: 'urgent' as const, ...DELIVERY_URGENCY_STYLES.urgent };
  return { daysLeft, label, status: 'normal' as const, ...DELIVERY_URGENCY_STYLES.normal };
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
