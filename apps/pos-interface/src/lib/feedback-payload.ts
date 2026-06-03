import type { Garment } from "@repo/database";

/**
 * Pure helper that maps a final-garment feedback action to the DB update payload.
 *
 * Encodes the three-branch decision tree from CLAUDE.md §Branch Tree "Final Collection":
 *
 *   Accept             → completed, fulfillment_type=collected|delivered, acceptance_status=true
 *   Needs Redo (non-alt) → discarded, acceptance_status=false  (workshop creates replacement)
 *   Needs Repair / Needs Redo on alteration → brova_trialed, acceptance_status=false
 *     (customer-owned garment is never discarded — same row loops back to workshop)
 *
 * Used by both the production handler (feedback.$orderId.tsx) and the unit tests,
 * so tests verify the real logic rather than a mirror copy.
 */
export function buildFinalGarmentPayload(args: {
  feedbackAction: string | null;
  isAlterationGarment: boolean;
  isHomeDelivery: boolean;
}): Partial<Garment> {
  const { feedbackAction, isAlterationGarment, isHomeDelivery } = args;

  if (feedbackAction === "accepted") {
    return {
      piece_stage: "completed",
      fulfillment_type: isHomeDelivery ? "delivered" : "collected",
      acceptance_status: true,
      feedback_status: "accepted",
    };
  }

  if (feedbackAction === "needs_redo" && !isAlterationGarment) {
    // Redo = discard original. Workshop creates a replacement garment row.
    // Alteration orders skip this branch — the same physical garment goes
    // back to workshop for another pass; we never discard customer property.
    return {
      piece_stage: "discarded",
      feedback_status: "needs_redo",
      acceptance_status: false,
    };
  }

  // needs_repair on any garment type, OR needs_redo on an alteration garment.
  return {
    piece_stage: "brova_trialed",
    feedback_status: feedbackAction,
    acceptance_status: false,
  };
}

/**
 * The single measurement-difference reason that re-points the garment's spec.
 *
 * CLAUDE.md §2.5 "Measurement reason gates propagation": only `customer_request`
 * writes a new measurements row and re-points `measurement_id`. `workshop_error`
 * / `shop_error` are audit-only (the spec was right, the executor erred — target
 * unchanged). The shop UI labels these "Customer Request" / "Workshop Error" /
 * "Shop Error"; this is the label that gates propagation.
 */
export const MEASUREMENT_PROPAGATION_REASON = "Customer Request";

/**
 * Pure decision for measurement-spec propagation on a feedback submission.
 *
 * Encodes two CLAUDE.md §2.5 rules:
 *   • Reason gate — a new measurement row is created (and the garment re-pointed)
 *     ONLY when at least one entered measurement carries the customer_request
 *     reason. Workshop/shop-error rows are audit-only → no new row, no re-point.
 *   • Sibling fan-out — a brova's correction fans out to every order garment
 *     sharing its old measurement_id ("siblings"), so parked finals inherit the
 *     body change; UNLESS the user scoped it to "this garment only". Finals and
 *     alteration garments (and brovas with no prior measurement) re-point only
 *     themselves ("single").
 *
 * `scope` maps to the write the caller performs: "siblings" → bulkRepointMeasurement,
 * "single" → updateGarment(self, { measurement_id }), "none" → no write.
 */
export function planMeasurementPropagation(args: {
  rows: { reason: string | null; hasValue: boolean }[];
  garmentType: string | null;
  prevMeasurementId: string | null;
  thisGarmentOnly: boolean;
}): { createNewMeasurement: boolean; scope: "siblings" | "single" | "none" } {
  const hasCustomerRequest = args.rows.some(
    (r) => r.hasValue && r.reason === MEASUREMENT_PROPAGATION_REASON,
  );
  if (!hasCustomerRequest) return { createNewMeasurement: false, scope: "none" };

  const scope =
    args.garmentType === "brova" && !!args.prevMeasurementId && !args.thisGarmentOnly
      ? "siblings"
      : "single";
  return { createNewMeasurement: true, scope };
}

/**
 * Pure decision for style/option-spec propagation on a feedback submission.
 *
 * CLAUDE.md §2.5 "Brova feedback fans out to siblings": a brova's style/option
 * changes apply to every sibling sharing its style_id ("siblings"), so parked
 * finals inherit the design correction before they're produced. Finals and
 * alteration garments update only themselves ("single") — their siblings may
 * already be in a different production state. No changes → "none".
 *
 * "siblings" → bulkUpdateStyleFields, "single" → updateGarment(self, fields).
 */
export function planStylePropagation(args: {
  hasStyleChanges: boolean;
  garmentType: string | null;
  styleId: number | null;
}): "siblings" | "single" | "none" {
  if (!args.hasStyleChanges) return "none";
  return args.garmentType === "brova" && args.styleId != null ? "siblings" : "single";
}
