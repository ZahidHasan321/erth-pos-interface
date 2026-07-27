import { describe, expect, it } from "vitest";
import type { WorkshopGarment } from "@repo/database";
import { getGarmentEditability } from "./editability";

/**
 * The invariant under test: a garment must never end up at piece_stage
 * 'waiting_cut' while carrying a production_plan. That pair belongs to no
 * workshop queue -- the Scheduler lists waiting_cut pieces and the cutting
 * terminal lists piece_stage='cutting' -- so the garment silently disappears
 * from every surface (this stranded garment 2589-1, and 2534-1 before it).
 *
 * Scheduling from the Scheduler sets plan AND stage together, so it is safe.
 * Re-entry planning for returns resolves a re-entry stage, so it is safe too.
 * Only the tracker's plain "new" plan dialog writes a plan without moving the
 * stage, which is why a fresh waiting_cut piece is not plan-editable there.
 */

const g = (over: Partial<WorkshopGarment>): WorkshopGarment =>
  ({
    id: "g1",
    piece_stage: "waiting_cut",
    location: "workshop",
    trip_number: 1,
    start_time: null,
    production_plan: null,
    ...over,
  }) as WorkshopGarment;

describe("getGarmentEditability - waiting_cut belongs to the Scheduler", () => {
  it("blocks plan editing on a fresh waiting_cut piece and says where to go", () => {
    const e = getGarmentEditability(g({}));
    expect(e.canEditPlan).toBe(false);
    expect(e.readOnlyReason).toMatch(/Scheduler/);
  });

  it("blocks it even when a stale plan is already attached", () => {
    // The 2589-1 shape. Editing here would re-save the plan and leave the
    // garment stranded all over again.
    expect(getGarmentEditability(g({ production_plan: { cutter: "IRFEN" } })).canEditPlan).toBe(false);
  });

  it("still allows delivery-date edits while the plan is off limits", () => {
    expect(getGarmentEditability(g({})).canEditDeliveryDate).toBe(true);
  });

  it("exempts returns, which re-enter through the rework dialog", () => {
    // trip 2+ uses mode="rework", which always resolves a re-entry stage and
    // therefore always moves the garment out of waiting_cut.
    expect(getGarmentEditability(g({ trip_number: 2 })).canEditPlan).toBe(true);
    expect(getGarmentEditability(g({ trip_number: 5 })).canEditPlan).toBe(true);
  });

  it("keeps plan editing open once the garment is actually in production", () => {
    expect(getGarmentEditability(g({ piece_stage: "cutting" })).canEditPlan).toBe(true);
    expect(getGarmentEditability(g({ piece_stage: "sewing" })).canEditPlan).toBe(true);
  });

  it("leaves the existing parked-final and done-stage rules alone", () => {
    expect(getGarmentEditability(g({ piece_stage: "waiting_for_acceptance" })).canEditPlan).toBe(false);
    expect(getGarmentEditability(g({ piece_stage: "ready_for_dispatch" })).canEditPlan).toBe(false);
    expect(getGarmentEditability(g({ piece_stage: "completed" })).canEditPlan).toBe(false);
  });
});
