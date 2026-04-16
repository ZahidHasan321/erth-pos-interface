import type { GarmentSummary } from "@/api/garments";
import type { PillColor } from "@/components/shared/StatusPill";
import { PIECE_STAGE_LABELS } from "@/lib/constants";

interface GarmentStatusLabel {
  text: string;
  color: PillColor;
}

/**
 * Human-readable garment status derived from compact summary data.
 * Each label maps to a real workshop page/section:
 *
 *   In receiving     → Receiving page
 *   In parking       → Parking page (main)
 *   In scheduler     → Scheduler page
 *   Cutting, Sewing… → Terminal pages (active production)
 *   etc.
 */
export function getGarmentStatusLabel(
  g: GarmentSummary,
  anyBrovaAccepted: boolean,
): GarmentStatusLabel {
  let base: GarmentStatusLabel;

  // --- Terminal states ---
  if (g.stage === "completed") {
    base = { text: "Completed", color: "green" };
  } else if (g.stage === "discarded") {
    base = { text: "Discarded", color: "red" };
  } else if (g.stage === "ready_for_dispatch") {
    base = { text: "Ready for dispatch", color: "emerald" };

  // --- Transit ---
  } else if (g.loc === "transit_to_workshop") {
    base = { text: "Transit to workshop", color: "orange" };
  } else if (g.loc === "transit_to_shop") {
    base = { text: "Transit to shop", color: "sky" };
  } else if (g.loc === "lost_in_transit") {
    base = { text: "Lost in transit", color: "red" };

  // --- Shop states ---
  } else if (g.loc === "shop" && (g.fb === "needs_repair" || g.fb === "needs_redo")) {
    base = { text: "Needs alteration", color: "red" };
  } else if (g.loc === "shop" && g.stage === "awaiting_trial") {
    base = { text: "Awaiting trial", color: "teal" };
  } else if (g.loc === "shop" && g.stage === "ready_for_pickup") {
    base = { text: "Ready for pickup", color: "green" };
  } else if (g.loc === "shop") {
    base = { text: "At shop", color: "green" };

  // --- Workshop: waiting_for_acceptance (finals blocked on brova) ---
  } else if (g.stage === "waiting_for_acceptance" && anyBrovaAccepted) {
    base = { text: "Customer approved", color: "violet" };
  } else if (g.stage === "waiting_for_acceptance") {
    base = { text: "Awaiting brova trial", color: "amber" };

  // --- Workshop: in parking (received, not sent to scheduler) ---
  } else if (g.loc === "workshop" && !g.in_prod) {
    base = { text: "In parking", color: "zinc" };

  // --- Workshop: in scheduler (in_production but no plan yet) ---
  } else if (g.loc === "workshop" && g.in_prod && !g.has_plan) {
    base = { text: "In scheduler", color: "amber" };

  // --- Workshop: has plan, actively working (has start_time) ---
  } else if (g.loc === "workshop" && g.in_prod && g.has_plan && g.started) {
    const stageName =
      PIECE_STAGE_LABELS[g.stage as keyof typeof PIECE_STAGE_LABELS] ?? g.stage;
    base = { text: stageName, color: "blue" };

  // --- Workshop: has plan, not started yet ---
  } else if (g.loc === "workshop" && g.in_prod && g.has_plan && !g.started) {
    base = { text: "Planned", color: "zinc" };

  // --- Fallback ---
  } else {
    base = { text: "In progress", color: "zinc" };
  }

  // --- Modifiers ---
  let text = base.text;

  // QC fail suffix
  if (g.qc_fail) {
    text += " (QC fix)";
  }

  // Alteration prefix
  if (g.trip > 1) {
    text = `Alt ${g.trip - 1}: ${text}`;
  }

  return { text, color: base.color };
}
