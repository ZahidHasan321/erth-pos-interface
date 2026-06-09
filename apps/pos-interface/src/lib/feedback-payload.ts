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
 * The measurement-difference reasons that re-point the garment's spec — the
 * recorded measurement itself was wrong, so the target must change:
 *   • "Customer Request" — the customer wants a different size.
 *   • "Shop Error"       — the shop recorded the measurement wrong.
 *
 * "Workshop Error" is deliberately NOT here: the spec was right, the workshop
 * built it wrong, so the target is unchanged and the garment is re-fixed to it
 * (audit-only). CLAUDE.md §2.5. The shop UI labels these "Customer Request" /
 * "Workshop Error" / "Shop Error".
 */
export const MEASUREMENT_PROPAGATION_REASONS = ["Customer Request", "Shop Error"] as const;

/** True when a feedback measurement reason re-points the target spec (§2.5). */
export function reasonPropagates(reason: string | null | undefined): boolean {
  return reason != null && (MEASUREMENT_PROPAGATION_REASONS as readonly string[]).includes(reason);
}

/**
 * Pure decision for whether a feedback submission re-points the garment's
 * measurement spec (§2.5 reason gate).
 *
 * A new measurement row is created (and the garment re-pointed) ONLY when at
 * least one entered measurement carries a spec-correcting reason (customer_request
 * OR shop_error — the recorded measurement was wrong). Workshop-error rows are
 * audit-only → no new row, no re-point.
 *
 * The OLD sibling fan-out (`scope: "siblings"` keyed on a shared measurement_id,
 * gated by a single global "this garment only" toggle) is gone. Each parked final
 * now adopts-or-keeps the brova's new measurement explicitly, per-final, in the
 * feedback handler (§2.5 brova-trial resolution).
 */
export function planMeasurementPropagation(args: {
  rows: { reason: string | null; hasValue: boolean }[];
}): { createNewMeasurement: boolean } {
  const hasPropagatingReason = args.rows.some(
    (r) => r.hasValue && reasonPropagates(r.reason),
  );
  return { createNewMeasurement: hasPropagatingReason };
}
