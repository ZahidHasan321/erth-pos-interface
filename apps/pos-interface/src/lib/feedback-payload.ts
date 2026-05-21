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
