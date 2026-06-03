import type { StockItemType, StockMovementType, UnitOfMeasure } from "@repo/database";

export const LOW_STOCK_THRESHOLDS: Record<StockItemType, number> = {
  fabric: 5,
  shelf: 3,
  accessory: 10,
};

/** Resolve effective threshold: per-item override (if set) else type default. */
export function getLowStockThreshold(
  itemType: StockItemType,
  override?: number | string | null,
): number {
  const n = override == null ? NaN : Number(override);
  return Number.isFinite(n) && n > 0 ? n : LOW_STOCK_THRESHOLDS[itemType];
}

export function isLowStock(
  itemType: StockItemType,
  qty: number,
  threshold?: number | string | null,
): boolean {
  return qty > 0 && qty < getLowStockThreshold(itemType, threshold);
}

export function isOutOfStock(qty: number): boolean {
  return qty <= 0;
}

export function stockStatus(
  itemType: StockItemType,
  qty: number,
  threshold?: number | string | null,
): "out" | "low" | "ok" {
  if (isOutOfStock(qty)) return "out";
  if (isLowStock(itemType, qty, threshold)) return "low";
  return "ok";
}

export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  restock: "Restock",
  consumption: "Consumed",
  transfer_out: "Sent out",
  transfer_in: "Received",
  adjustment: "Adjusted",
  waste: "Lost",
  return: "Returned",
};

export const MOVEMENT_TYPE_COLORS: Record<StockMovementType, string> = {
  restock: "bg-green-100 text-green-700",
  consumption: "bg-blue-100 text-blue-700",
  transfer_out: "bg-orange-100 text-orange-700",
  transfer_in: "bg-sky-100 text-sky-700",
  adjustment: "bg-amber-100 text-amber-700",
  waste: "bg-red-100 text-red-700",
  return: "bg-purple-100 text-purple-700",
};

// Adjustment reasons split by direction. UI shows the matching list based on
// whether the stepper delta is positive or negative; "recount" appears in both
// because a stocktake can correct either way.
export const ADJUSTMENT_REASONS_ADD = [
  { value: "recount_up", label: "Recount — found more" },
  { value: "found", label: "Found / misplaced" },
  { value: "returned_from_customer", label: "Returned from customer" },
  { value: "other_add", label: "Other (specify)" },
] as const;

// Adjust is for count corrections only. Damaged / lost stock goes through the
// dedicated Damage/Waste action (WASTE_REASONS below) which records cost impact
// + fault category — see CLAUDE.md §4.
export const ADJUSTMENT_REASONS_REMOVE = [
  { value: "recount_down", label: "Recount — short" },
  { value: "expired", label: "Expired" },
  { value: "returned_to_supplier", label: "Returned to supplier" },
  { value: "other_remove", label: "Other (specify)" },
] as const;

export type AdjustmentReasonValue =
  | (typeof ADJUSTMENT_REASONS_ADD)[number]["value"]
  | (typeof ADJUSTMENT_REASONS_REMOVE)[number]["value"];

export function getReasonLabel(value: string): string {
  return (
    [...ADJUSTMENT_REASONS_ADD, ...ADJUSTMENT_REASONS_REMOVE].find((r) => r.value === value)?.label ??
    value
  );
}

// ─── Damage / Waste ─────────────────────────────────────────────────────
// Dedicated action distinct from Adjust: removes stock as a `waste` movement
// with a fault category, optional photo, and recorded cost impact.
export const WASTE_REASONS = [
  { value: "supplier_defect", label: "Supplier defect" },
  { value: "staff_mistake", label: "Staff mistake" },
  { value: "customer_damage", label: "Customer damage" },
  { value: "lost", label: "Lost / missing" },
  { value: "mis_cut", label: "Mis-cut" },
  { value: "other", label: "Other (specify)" },
] as const;

export type WasteReasonValue = (typeof WASTE_REASONS)[number]["value"];

export function getWasteReasonLabel(value: string): string {
  return WASTE_REASONS.find((r) => r.value === value)?.label ?? value;
}

// Cost at/above which a Damage/Waste record requires a manager. Mirror of
// v_threshold in record_waste (triggers.sql). Below it, any waste-permitted
// user records directly; at/above, only a manager/admin (enforced server-side).
export const WASTE_APPROVAL_THRESHOLD = 25;

// ─── Unit handling ────────────────────────────────────────────────────
// Fabric is always meters. Shelf is always whole pieces. Accessories carry a
// per-item `unit_of_measure` (pieces / meters / rolls / kg).

export const UNIT_SUFFIX: Record<UnitOfMeasure, string> = {
  pieces: "pcs",
  meters: "m",
  rolls: "rolls",
  kg: "kg",
};

export function getUnitSuffix(itemType: StockItemType, unit?: UnitOfMeasure | null): string {
  if (itemType === "fabric") return "m";
  if (itemType === "shelf") return "pcs";
  return unit ? UNIT_SUFFIX[unit] : "";
}

/** Integer-only units. Decimal makes no sense here. */
export function isIntegerUnit(itemType: StockItemType, unit?: UnitOfMeasure | null): boolean {
  if (itemType === "shelf") return true;
  if (itemType === "accessory") return unit === "pieces" || unit === "rolls";
  return false; // fabric meters, accessory meters/kg → decimals allowed
}

export function getQtyStep(itemType: StockItemType, unit?: UnitOfMeasure | null): number {
  return isIntegerUnit(itemType, unit) ? 1 : 0.25;
}

export function getQtyMin(itemType: StockItemType, unit?: UnitOfMeasure | null): number {
  return isIntegerUnit(itemType, unit) ? 1 : 0.01;
}

export function formatQty(
  itemType: StockItemType,
  qty: number | null | undefined,
  unit?: UnitOfMeasure | null,
  opts: { withSuffix?: boolean } = { withSuffix: true },
): string {
  const n = Number(qty ?? 0);
  const integer = isIntegerUnit(itemType, unit);
  const num = integer ? n.toFixed(0) : n.toFixed(n % 1 === 0 ? 0 : 2);
  if (opts.withSuffix === false) return num;
  const suffix = getUnitSuffix(itemType, unit);
  return suffix ? `${num} ${suffix}` : num;
}
