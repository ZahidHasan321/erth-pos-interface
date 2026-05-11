import type { StockItemType, StockMovementType, UnitOfMeasure } from "@repo/database";

export const LOW_STOCK_THRESHOLDS: Record<StockItemType, number> = {
  fabric: 5,
  shelf: 3,
  accessory: 10,
};

export function isLowStock(itemType: StockItemType, qty: number): boolean {
  return qty > 0 && qty < LOW_STOCK_THRESHOLDS[itemType];
}

export function isOutOfStock(qty: number): boolean {
  return qty <= 0;
}

export function stockStatus(itemType: StockItemType, qty: number): "out" | "low" | "ok" {
  if (isOutOfStock(qty)) return "out";
  if (isLowStock(itemType, qty)) return "low";
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

// Semantic-tone mapping. Two movement types may share a tone — the icon/label
// disambiguates. Color reserved for meaning per workshop UI rules.
export const MOVEMENT_TYPE_COLORS: Record<StockMovementType, string> = {
  restock:      "bg-[var(--status-ok-bg)] text-[var(--status-ok)]",
  consumption:  "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  transfer_out: "bg-muted text-muted-foreground",
  transfer_in:  "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  adjustment:   "bg-[var(--status-warn-bg)] text-[var(--status-warn)]",
  waste:        "bg-[var(--status-bad-bg)] text-[var(--status-bad)]",
  return:       "bg-muted text-muted-foreground",
};

export const ADJUSTMENT_REASONS_ADD = [
  { value: "recount_up", label: "Recount — found more" },
  { value: "found", label: "Found / misplaced" },
  { value: "returned_from_customer", label: "Returned from customer" },
  { value: "other_add", label: "Other (specify)" },
] as const;

export const ADJUSTMENT_REASONS_REMOVE = [
  { value: "recount_down", label: "Recount — short" },
  { value: "damaged", label: "Damaged / unusable" },
  { value: "lost", label: "Lost / missing" },
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

export function isIntegerUnit(itemType: StockItemType, unit?: UnitOfMeasure | null): boolean {
  if (itemType === "shelf") return true;
  if (itemType === "accessory") return unit === "pieces" || unit === "rolls";
  return false;
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
