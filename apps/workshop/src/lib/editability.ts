import type { WorkshopGarment } from "@repo/database";

export interface GarmentEditability {
  /** Can edit production_plan and assigned_date at all (at least one step unlocked) */
  canEditPlan: boolean;
  /** Can edit per-garment delivery_date */
  canEditDeliveryDate: boolean;
  /** Can press Start in terminal */
  canStart: boolean;
  /** Can press Complete & Advance in terminal */
  canComplete: boolean;
  /** Plan step keys that cannot be reassigned — already done or currently in progress.
   *  Dialogs render these as read-only. Keys are from PLAN_STEP_ORDER below. */
  lockedPlanSteps: Set<string>;
  /** Human-readable reason when editing is restricted */
  readOnlyReason: string | null;
}

const DONE_STAGES = new Set(["completed", "ready_for_pickup"]);

const NO_PLAN_EDIT_STAGES = new Set([
  "completed",
  "ready_for_pickup",
  "ready_for_dispatch",
  "waiting_for_acceptance",
]);

/** Plan step keys in production order. Mirror of PLAN_STEPS in dialogs. */
const PLAN_STEP_ORDER: Array<{ key: string; stage: string }> = [
  { key: "soaker", stage: "soaking" },
  { key: "cutter", stage: "cutting" },
  { key: "post_cutter", stage: "post_cutting" },
  { key: "sewer", stage: "sewing" },
  { key: "finisher", stage: "finishing" },
  { key: "ironer", stage: "ironing" },
  { key: "quality_checker", stage: "quality_check" },
];

/**
 * Compute which plan steps are locked for a given garment:
 *  - Prior stages (already done on this trip): always locked.
 *  - Current stage: locked only when work has started (`start_time` set).
 *  - Future stages: always editable.
 *
 * Exits early for pre-production stages (nothing locked) and post-production
 * stages (everything locked — though these stages also disable canEditPlan).
 */
export function getLockedPlanSteps(garment: WorkshopGarment): Set<string> {
  const stage = garment.piece_stage ?? "";
  const hasStarted = !!garment.start_time;
  const locked = new Set<string>();

  // Pre-production — nothing locked.
  if (!stage || stage === "waiting_cut" || stage === "waiting_for_acceptance") {
    return locked;
  }

  // Fully done / past production — everything locked.
  if (
    stage === "completed" ||
    stage === "ready_for_pickup" ||
    stage === "ready_for_dispatch" ||
    stage === "brova_trialed" ||
    stage === "awaiting_trial"
  ) {
    for (const s of PLAN_STEP_ORDER) locked.add(s.key);
    return locked;
  }

  // Mid-pipeline: lock everything up to and including the current stage
  // (current stage is locked only when work has started).
  for (const step of PLAN_STEP_ORDER) {
    if (step.stage === stage) {
      if (hasStarted) locked.add(step.key);
      return locked;
    }
    locked.add(step.key);
  }

  // Stage not in PLAN_STEP_ORDER — unknown, be conservative and lock all.
  for (const s of PLAN_STEP_ORDER) locked.add(s.key);
  return locked;
}

/** Central source of truth for what can be edited on a garment. */
export function getGarmentEditability(garment: WorkshopGarment): GarmentEditability {
  const stage = garment.piece_stage ?? "";
  const location = garment.location ?? "";
  const hasStarted = !!garment.start_time;

  // Done — nothing editable (delivery date only editable pre-completion)
  if (DONE_STAGES.has(stage)) {
    return {
      canEditPlan: false,
      canEditDeliveryDate: stage !== "completed",
      canStart: false,
      canComplete: false,
      lockedPlanSteps: new Set(PLAN_STEP_ORDER.map((s) => s.key)),
      readOnlyReason: "Garment is completed",
    };
  }

  // At shop — workshop can't touch it
  if (location === "shop") {
    return {
      canEditPlan: false,
      canEditDeliveryDate: true,
      canStart: false,
      canComplete: false,
      lockedPlanSteps: new Set(PLAN_STEP_ORDER.map((s) => s.key)),
      readOnlyReason: "Garment is at the shop",
    };
  }

  // In transit to shop — hands off
  if (location === "transit_to_shop") {
    return {
      canEditPlan: false,
      canEditDeliveryDate: true,
      canStart: false,
      canComplete: false,
      lockedPlanSteps: new Set(PLAN_STEP_ORDER.map((s) => s.key)),
      readOnlyReason: "Garment is in transit to shop",
    };
  }

  // Lost in transit — read-only
  if (location === "lost_in_transit") {
    return {
      canEditPlan: false,
      canEditDeliveryDate: true,
      canStart: false,
      canComplete: false,
      lockedPlanSteps: new Set(PLAN_STEP_ORDER.map((s) => s.key)),
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
      lockedPlanSteps: new Set(PLAN_STEP_ORDER.map((s) => s.key)),
      readOnlyReason: "Garment has not been received yet",
    };
  }

  // At workshop — the main editing context
  if (location === "workshop") {
    if (stage === "waiting_for_acceptance") {
      return {
        canEditPlan: false,
        canEditDeliveryDate: true,
        canStart: false,
        canComplete: false,
        lockedPlanSteps: new Set(),
        readOnlyReason: "Awaiting brova acceptance",
      };
    }

    if (stage === "ready_for_dispatch") {
      return {
        canEditPlan: false,
        canEditDeliveryDate: true,
        canStart: false,
        canComplete: false,
        lockedPlanSteps: new Set(PLAN_STEP_ORDER.map((s) => s.key)),
        readOnlyReason: "Production complete — ready for dispatch",
      };
    }

    const lockedPlanSteps = getLockedPlanSteps(garment);
    const allStepsLocked = lockedPlanSteps.size === PLAN_STEP_ORDER.length;
    // canEditPlan true as long as at least one future step remains open.
    // NO_PLAN_EDIT_STAGES covers pre-production parking stages; anything else
    // with at least one editable step can have its plan tweaked.
    const canEditPlan = !NO_PLAN_EDIT_STAGES.has(stage) && !allStepsLocked;

    return {
      canEditPlan,
      canEditDeliveryDate: true,
      canStart: !hasStarted,
      canComplete: hasStarted,
      lockedPlanSteps,
      readOnlyReason: hasStarted
        ? "In production — current stage locked"
        : null,
    };
  }

  // Fallback — read-only
  return {
    canEditPlan: false,
    canEditDeliveryDate: true,
    canStart: false,
    canComplete: false,
    lockedPlanSteps: new Set(PLAN_STEP_ORDER.map((s) => s.key)),
    readOnlyReason: "Unknown state",
  };
}
