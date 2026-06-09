import type { Style, StylePricingRule } from "@repo/database";
import { calculateGarmentStylePrice } from "@/lib/utils/style-utils";

/**
 * Brova-trial style reprice (SPEC §2.5).
 *
 * When a style change at the brova trial alters what the workshop will build,
 * the order must be repriced for the garments whose style actually changed. We
 * recompute each changed garment's style price with the SAME engine used at
 * order creation (`calculateGarmentStylePrice`), so the flat-override styles
 * (qallabi collar, designer) keep their fixed price automatically — tweaking
 * other options on a flat-priced garment yields no delta.
 *
 * Only the STYLE component moves: the delta is added to the current
 * `order_total` / `style_charge`, leaving fabric/stitching/delivery and any
 * earlier discount untouched. `orders.paid` is never involved here.
 *
 * Old and new prices are both computed under the CURRENT rules, so the delta
 * isolates the spec change and is never contaminated by a rules change since
 * order creation.
 */

type StyleSpec = Parameters<typeof calculateGarmentStylePrice>[0];

export interface RepriceGarmentInput {
  garmentId: string;
  /** The garment's style spec BEFORE this feedback's edits (the current DB row). */
  oldSpec: StyleSpec;
  /** The garment's style spec AFTER applying this feedback's style edits. */
  newSpec: StyleSpec;
}

export interface RepricePreview {
  /** New style-price snapshots to persist — only garments whose price changed. */
  snapshots: { garment_id: string; style_price_snapshot: number }[];
  /** Net change to the order: Σ (newPrice − oldPrice) over changed garments. */
  delta: number;
  oldOrderTotal: number;
  newOrderTotal: number;
  oldStyleCharge: number;
  newStyleCharge: number;
  /** True when at least one garment's style price moved (snapshots non-empty). */
  changed: boolean;
}

/** Round to KWD precision (3 decimals) to keep float drift out of money fields. */
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function computeStyleReprice(args: {
  garments: RepriceGarmentInput[];
  styles: Style[];
  rules: StylePricingRule[];
  currentOrderTotal: number;
  currentStyleCharge: number;
}): RepricePreview {
  const { garments, styles, rules, currentOrderTotal, currentStyleCharge } = args;

  const snapshots: { garment_id: string; style_price_snapshot: number }[] = [];
  let delta = 0;

  for (const g of garments) {
    const oldPrice = round3(calculateGarmentStylePrice(g.oldSpec, styles, rules));
    const newPrice = round3(calculateGarmentStylePrice(g.newSpec, styles, rules));
    if (newPrice !== oldPrice) {
      snapshots.push({ garment_id: g.garmentId, style_price_snapshot: newPrice });
      delta += newPrice - oldPrice;
    }
  }

  delta = round3(delta);

  return {
    snapshots,
    delta,
    oldOrderTotal: round3(currentOrderTotal),
    newOrderTotal: round3(currentOrderTotal + delta),
    oldStyleCharge: round3(currentStyleCharge),
    newStyleCharge: round3(currentStyleCharge + delta),
    changed: snapshots.length > 0,
  };
}
