import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { WorkshopGarment } from "@repo/database";

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

// ── Order grouping helpers (shared across pages) ─────────────────────────────

export interface OrderGroup {
  order_id: number;
  invoice_number?: number;
  customer_name?: string;
  customer_mobile?: string;
  brands: string[];
  express: boolean;
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
        home_delivery: g.home_delivery_order,
        delivery_date: g.delivery_date_order,
        garments: [],
      });
    }
    const entry = map.get(g.order_id)!;
    entry.garments.push(g);
    if (g.express) entry.express = true;
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
