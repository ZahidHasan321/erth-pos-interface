import type { PillColor } from "@/components/shared/StatusPill";
import { titleCase } from "@/lib/format";

/**
 * One place to turn an order row into a display status.
 *
 * `status_label` comes from `assigned_order_status_label()`, which is only
 * meaningful for an in-progress WORK/ALTERATION order (in the shop it is only
 * ever computed under order_phase='in_progress'). The admin lists show every
 * non-draft order, so we resolve the terminal/non-production states here first
 * and only fall back to the production-derived label for genuinely in-progress
 * orders — otherwise a completed order reads "At shop" and a shelf sale reads
 * "In production".
 *
 * `pill` = render as a StatusPill (terminal, deserves emphasis); otherwise plain
 * muted text (in-flight).
 */
export interface OrderStatusView {
  label: string;
  color: PillColor;
  pill: boolean;
}

interface OrderStatusInput {
  order_type: string;
  checkout_status: string;
  order_phase: string | null;
  status_label: string | null;
}

export function orderStatusView(o: OrderStatusInput): OrderStatusView {
  if (o.checkout_status === "cancelled") return { label: "Cancelled", color: "red", pill: true };
  if (o.order_phase === "completed") return { label: "Completed", color: "green", pill: true };
  // SALES has no workshop flow and no order_phase; a shelf item is handed over
  // at the counter, so the production label never applies.
  if (o.order_type === "SALES") return { label: "Sold", color: "zinc", pill: false };
  if (o.order_phase === "new") return { label: "New", color: "zinc", pill: false };
  // In-progress WORK/ALTERATION: the production-derived label is authoritative.
  return { label: o.status_label ?? titleCase(o.order_phase ?? "-"), color: "zinc", pill: false };
}
