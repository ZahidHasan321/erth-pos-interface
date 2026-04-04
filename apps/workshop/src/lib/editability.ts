import type { WorkshopGarment } from "@repo/database";

export interface GarmentEditability {
  /** Can edit production_plan and assigned_date */
  canEditPlan: boolean;
  /** Can edit per-garment delivery_date */
  canEditDeliveryDate: boolean;
  /** Can press Start in terminal */
  canStart: boolean;
  /** Can press Complete & Advance in terminal */
  canComplete: boolean;
  /** Human-readable reason when editing is restricted */
  readOnlyReason: string | null;
}

/** Done stages — fully locked */
const DONE_STAGES = new Set(["completed", "ready_for_pickup"]);

/** Stages where plan editing is never allowed */
const NO_PLAN_EDIT_STAGES = new Set([
  "completed",
  "ready_for_pickup",
  "ready_for_dispatch",
  "waiting_for_acceptance",
]);

/**
 * Central source of truth for what can be edited on a garment.
 * Used by all editing surfaces (order detail, garment detail, API layer).
 */
export function getGarmentEditability(garment: WorkshopGarment): GarmentEditability {
  const stage = garment.piece_stage ?? "";
  const location = garment.location ?? "";
  const hasStarted = !!garment.start_time;

  // Done — nothing editable
  if (DONE_STAGES.has(stage)) {
    return {
      canEditPlan: false,
      canEditDeliveryDate: false,
      canStart: false,
      canComplete: false,
      readOnlyReason: "Garment is completed",
    };
  }

  // At shop — workshop can't touch it
  if (location === "shop") {
    return {
      canEditPlan: false,
      canEditDeliveryDate: false,
      canStart: false,
      canComplete: false,
      readOnlyReason: "Garment is at the shop",
    };
  }

  // In transit to shop — hands off
  if (location === "transit_to_shop") {
    return {
      canEditPlan: false,
      canEditDeliveryDate: false,
      canStart: false,
      canComplete: false,
      readOnlyReason: "Garment is in transit to shop",
    };
  }

  // Lost in transit — read-only
  if (location === "lost_in_transit") {
    return {
      canEditPlan: false,
      canEditDeliveryDate: false,
      canStart: false,
      canComplete: false,
      readOnlyReason: "Garment is lost in transit",
    };
  }

  // In transit to workshop — not received yet, no pre-planning
  if (location === "transit_to_workshop") {
    return {
      canEditPlan: false,
      canEditDeliveryDate: true,
      canStart: false,
      canComplete: false,
      readOnlyReason: "Garment has not been received yet",
    };
  }

  // At workshop — the main editing context
  if (location === "workshop") {
    // Parked finals waiting for brova acceptance
    if (stage === "waiting_for_acceptance") {
      return {
        canEditPlan: false,
        canEditDeliveryDate: true,
        canStart: false,
        canComplete: false,
        readOnlyReason: "Awaiting brova acceptance",
      };
    }

    // Ready for dispatch — production done
    if (stage === "ready_for_dispatch") {
      return {
        canEditPlan: false,
        canEditDeliveryDate: true,
        canStart: false,
        canComplete: false,
        readOnlyReason: "Production complete — ready for dispatch",
      };
    }

    // In production (start_time set) — plan locked, delivery date stays open
    if (hasStarted) {
      return {
        canEditPlan: false,
        canEditDeliveryDate: true,
        canStart: false, // already started
        canComplete: true,
        readOnlyReason: "In production — plan is locked",
      };
    }

    // At workshop, not started — full edit
    return {
      canEditPlan: !NO_PLAN_EDIT_STAGES.has(stage),
      canEditDeliveryDate: true,
      canStart: true,
      canComplete: false, // must start first
      readOnlyReason: null,
    };
  }

  // Fallback — read-only
  return {
    canEditPlan: false,
    canEditDeliveryDate: false,
    canStart: false,
    canComplete: false,
    readOnlyReason: "Unknown state",
  };
}
