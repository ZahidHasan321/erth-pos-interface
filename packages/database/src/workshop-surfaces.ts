/**
 * Workshop garment "surface" classifier — the single source of truth for which
 * actionable queue (surface) a garment belongs to at any moment.
 *
 * WHY THIS EXISTS
 * ----------------
 * Each workshop page derives its queue membership with its own client-side
 * filters (parking.tsx, receiving.tsx, dispatch.tsx, ProductionTerminal.tsx) or
 * a server RPC (getSchedulerGarments / getTerminalStageGarments / getSoakingQueue
 * in apps/workshop/src/api/garments.ts). Because those predicates are scattered,
 * it is not obvious that EVERY garment the workshop is responsible for is
 * rendered in at least one place. A garment matching no surface is invisible — a
 * "leaked" garment that a worker can never act on.
 *
 * This module mirrors each surface's RENDERED membership as a pure function, so
 * the partition can be tested mechanically (see __tests__/workshop-surfaces.test.ts
 * and workflow.no-leak.test.ts). Stage 1 is additive: the pages are NOT yet
 * refactored to import these. Keeping the predicates faithful to the current code
 * is the whole point, so they can become the shared source in Stage 2.
 *
 * The "actionable surfaces" are receiving, parking, scheduler, the per-stage
 * production terminals, the soak queue, and dispatch. Read-only overviews (board,
 * production tracker) are intentionally excluded — they don't let a worker move a
 * garment forward, so they don't count toward "is this garment actionable".
 */
import { isAlteration } from "./utils";
import type { Location, PieceStage } from "./schema";
import type { ProductionPlan } from "./workshop-types";

/**
 * Minimal structural view of a garment — only the fields the surface predicates
 * read. WorkshopGarment is assignable to this (verified in the test), so callers
 * can pass a full WorkshopGarment or a hand-built row.
 */
export interface SurfaceGarment {
  id?: string;
  order_id?: number | null;
  location?: Location | null;
  in_production?: boolean | null;
  piece_stage?: PieceStage | null;
  trip_number?: number | null;
  garment_type?: string | null;
  express?: boolean | null;
  soaking?: boolean | null;
  soaking_completed_at?: Date | string | null;
  production_plan?: ProductionPlan | null;
  feedback_status?: string | null;
  acceptance_status?: boolean | null;
  /** Used only by the intra-terminal "currently working" split, which does not
   *  affect surface membership (a working garment is still at its stage). */
  start_time?: Date | string | null;
}

/** Locations the workshop is responsible for (getWorkshopGarments universe). */
export const WORKSHOP_UNIVERSE_LOCATIONS: Location[] = [
  "workshop",
  "transit_to_workshop",
  "transit_to_shop",
  "lost_in_transit",
];

/** Stages with a production terminal page (post_cutting is disabled; soaking is
 *  a parallel flag-driven track handled by inSoakQueue, not a piece_stage here). */
export const PRODUCTION_TERMINAL_STAGES: PieceStage[] = [
  "cutting",
  "sewing",
  "finishing",
  "ironing",
  "quality_check",
];

/**
 * Order-level context the parking predicates need. Mirrors parking.tsx's
 * hadBrova / isBrovaApprovedForOrder: derived from the full garment set.
 * (parking.tsx additionally falls back to a DB lookup for brovas already
 * dispatched to the shop; when the caller passes the order's complete garment
 * set — as the workflow assertion does — this in-memory derivation matches.)
 */
export interface SurfaceContext {
  hadBrova: (orderId: number | null | undefined) => boolean;
  isBrovaApproved: (orderId: number | null | undefined) => boolean;
}

export function buildSurfaceContext(all: SurfaceGarment[]): SurfaceContext {
  const brovaOrders = new Set<number>();
  const approvedOrders = new Set<number>();
  for (const g of all) {
    if (g.garment_type === "brova" && g.order_id != null) {
      brovaOrders.add(g.order_id);
      if (g.acceptance_status === true) approvedOrders.add(g.order_id);
    }
  }
  return {
    hadBrova: (id) => id != null && brovaOrders.has(id),
    isBrovaApproved: (id) => id != null && approvedOrders.has(id),
  };
}

/** getWorkshopGarments universe: location in workshop scope, not discarded. */
export function isInWorkshopUniverse(g: SurfaceGarment): boolean {
  return (
    g.location != null &&
    WORKSHOP_UNIVERSE_LOCATIONS.includes(g.location) &&
    g.piece_stage !== "discarded"
  );
}

/** Terminal states are allowed to appear in no actionable surface. */
export function isTerminalGarmentState(g: SurfaceGarment): boolean {
  return (
    g.piece_stage === "completed" ||
    g.piece_stage === "discarded" ||
    g.location === "lost_in_transit"
  );
}

// ── Per-surface membership (mirrors the rendered queues) ─────────────────────

export type ReceivingSection =
  | "lost"
  | "alteration_out"
  | "express"
  | "brova"
  | "finals"
  | "work_order_alt";

/**
 * receiving.tsx — exclusive section assignment (Lost + 5 transit-to-workshop
 * sections). Returns the section a garment renders in, or null.
 */
export function receivingSection(g: SurfaceGarment): ReceivingSection | null {
  if (g.location === "lost_in_transit") return "lost";
  if (g.location !== "transit_to_workshop") return null;
  if (g.garment_type === "alteration") return "alteration_out";
  const trip = g.trip_number ?? 1;
  if (trip === 1) {
    if (g.express) return "express"; // express brova + express final
    if (g.garment_type === "brova") return "brova";
    if (g.garment_type === "final") return "finals";
    return null;
  }
  return isAlteration(trip, g.garment_type) ? "work_order_alt" : null;
}

/** receiving.tsx — Lost + 5 transit-to-workshop sections. */
export function inReceiving(g: SurfaceGarment): boolean {
  return receivingSection(g) !== null;
}

export type ParkingSection =
  | "express"
  | "brova"
  | "alteration_out"
  | "returns"
  | "finals"
  | "customer_approved"
  | "finals_not_yet_approved";

/**
 * parking.tsx — exclusive section assignment. Mirrors the rendered sub-sections
 * (NOT the broad `parked` array), so a garment in `parked` that falls into no
 * sub-section is detected as a leak. Returns the section, or null.
 */
export function parkingSection(
  g: SurfaceGarment,
  ctx: SurfaceContext,
): ParkingSection | null {
  if (g.location !== "workshop" || g.in_production) return null;
  const trip = g.trip_number ?? 1;

  // Finals locked at waiting_for_acceptance (finals only, trip 1): split by
  // whether a brova in the order has been approved.
  if (g.piece_stage === "waiting_for_acceptance") {
    if (g.garment_type !== "final" || trip !== 1) return null;
    return ctx.isBrovaApproved(g.order_id)
      ? "customer_approved"
      : "finals_not_yet_approved";
  }

  // `parked` = workshop & !in_production & not waiting_for_acceptance.
  if (g.garment_type === "alteration") return "alteration_out";

  if (trip > 1) {
    // Returns section — excluded once accepted.
    return g.feedback_status !== "accepted" ? "returns" : null;
  }

  // trip === 1 work-order garment (brova / final).
  if (g.garment_type === "brova") {
    return g.express ? "express" : "brova";
  }
  if (g.garment_type === "final") {
    // Express section takes express finals only in orders with NO brova; every
    // other released final renders in the schedulable "Finals" section.
    return g.express === true && !ctx.hadBrova(g.order_id) ? "express" : "finals";
  }
  return null;
}

/**
 * parking.tsx — true iff the garment renders in any parking sub-section.
 * Mirrors the VISIBLE sections, so a `parked` garment in no sub-section leaks.
 */
export function inParking(g: SurfaceGarment, ctx: SurfaceContext): boolean {
  return parkingSection(g, ctx) !== null;
}

/** getSchedulerGarments. */
export function inScheduler(g: SurfaceGarment): boolean {
  return (
    g.location === "workshop" &&
    g.in_production === true &&
    g.piece_stage === "waiting_cut" &&
    g.production_plan == null
  );
}

/** getTerminalStageGarments — returns the owning stage, or null. */
export function terminalStageOf(g: SurfaceGarment): PieceStage | null {
  if (g.location !== "workshop") return null;
  const stage = g.piece_stage;
  if (stage == null || !PRODUCTION_TERMINAL_STAGES.includes(stage)) return null;
  // Cutting soak-gate: a garment still pending soak is hidden from the cutting
  // terminal (server `or(soaking.eq.false,soaking_completed_at.not.is.null)`).
  if (stage === "cutting" && g.soaking === true && g.soaking_completed_at == null) {
    return null;
  }
  return stage;
}

/** getSoakingQueue — parallel track, trip 1 only. */
export function inSoakQueue(g: SurfaceGarment): boolean {
  return (
    g.soaking === true &&
    g.soaking_completed_at == null &&
    g.location === "workshop" &&
    g.trip_number === 1
  );
}

export type DispatchTab = "ready" | "in_transit";

/** dispatch.tsx — exclusive tab assignment (Ready / In transit), or null. */
export function dispatchTab(g: SurfaceGarment): DispatchTab | null {
  if (g.location === "transit_to_shop") return "in_transit";
  if (g.location === "workshop" && g.piece_stage === "ready_for_dispatch") {
    return "ready";
  }
  return null;
}

/** dispatch.tsx — Ready tab + In-transit tab. */
export function inDispatch(g: SurfaceGarment): boolean {
  return dispatchTab(g) !== null;
}

export type WorkshopSurface =
  | "receiving"
  | "parking"
  | "scheduler"
  | "soaking"
  | "dispatch"
  | `terminal:${string}`;

/** Every actionable surface this garment is rendered in. */
export function classifyGarmentSurfaces(
  g: SurfaceGarment,
  ctx: SurfaceContext,
): WorkshopSurface[] {
  const surfaces: WorkshopSurface[] = [];
  if (inReceiving(g)) surfaces.push("receiving");
  if (inParking(g, ctx)) surfaces.push("parking");
  if (inScheduler(g)) surfaces.push("scheduler");
  const stage = terminalStageOf(g);
  if (stage) surfaces.push(`terminal:${stage}`);
  if (inSoakQueue(g)) surfaces.push("soaking");
  if (inDispatch(g)) surfaces.push("dispatch");
  return surfaces;
}

/**
 * A garment is "leaked" when it is the workshop's responsibility, is not in a
 * terminal state, yet appears in NO actionable surface. This is the invariant
 * the tests assert never happens on reachable states.
 */
export function isGarmentLeaked(g: SurfaceGarment, ctx: SurfaceContext): boolean {
  return (
    isInWorkshopUniverse(g) &&
    !isTerminalGarmentState(g) &&
    classifyGarmentSurfaces(g, ctx).length === 0
  );
}
