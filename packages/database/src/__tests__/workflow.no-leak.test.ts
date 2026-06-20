/**
 * "No garment hides" — empirical companion to workshop-surfaces.test.ts.
 *
 * Drives real lifecycles through the driver (real RPCs + the exact app
 * mutations) and, at every meaningful step, asserts that NO garment in the
 * order is "leaked" — i.e. every workshop-responsibility, non-terminal garment
 * appears in at least one actionable surface. This is what actually validates
 * the "unreachable by construction" justifications in the pure test against the
 * running RPCs (notably the accepted-feedback-back-at-workshop family: a
 * sent-back brova must carry needs_repair, never accepted).
 *
 * Runs under `pnpm test:workflow` (Docker postgres via global-setup).
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";
import {
  type SurfaceGarment,
  buildSurfaceContext,
  isGarmentLeaked,
  classifyGarmentSurfaces,
} from "../workshop-surfaces";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

async function surfaceRows(tx: Tx, orderId: number): Promise<SurfaceGarment[]> {
  return (await tx`
    SELECT id, order_id, location, in_production, piece_stage, trip_number,
           garment_type, express, soaking, soaking_completed_at, production_plan,
           feedback_status, acceptance_status, start_time
    FROM garments WHERE order_id = ${orderId}
  `) as unknown as SurfaceGarment[];
}

/** Assert no garment in the order is invisible at this moment. */
async function assertNoLeak(tx: Tx, orderId: number, label: string) {
  const rows = await surfaceRows(tx, orderId);
  const ctx = buildSurfaceContext(rows);
  const leaked = rows.filter((g) => isGarmentLeaked(g, ctx));
  expect(
    leaked,
    `${label}: ${leaked.length} leaked garment(s) — in the workshop universe, ` +
      `not terminal, yet in NO actionable surface:\n${JSON.stringify(leaked, null, 2)}`,
  ).toEqual([]);
}

const idsByType = (gs: { id: string; garment_type: string }[], t: string) =>
  gs.filter((g) => g.garment_type === t).map((g) => g.id);

describe("lifecycle: no garment ever hides (CLAUDE.md §2)", () => {
  it("initial production round-trip (no brova): never leaks", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      const ids = garments.map((g) => g.id);
      await assertNoLeak(tx, orderId, "after create");
      await wf.dispatchOrder(tx, orderId);
      await assertNoLeak(tx, orderId, "after dispatch (transit_to_workshop)");
      await wf.workshopReceive(tx, ids, { start: true });
      await assertNoLeak(tx, orderId, "after receive & start (scheduler)");
      await wf.runProduction(tx, ids);
      await assertNoLeak(tx, orderId, "in production (quality_check terminal)");
      for (const id of ids) await wf.submitQc(tx, id, { pass: true });
      await assertNoLeak(tx, orderId, "after QC pass (dispatch ready)");
      await wf.workshopDispatch(tx, ids);
      await assertNoLeak(tx, orderId, "after workshop dispatch (transit_to_shop)");
      await wf.shopReceive(tx, ids);
      await assertNoLeak(tx, orderId, "after shop receive (ready_for_pickup)");
    });
  });

  it("soaking original: covered by the soak queue while cutting is gated", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final", soaking: true },
      ]);
      const ids = garments.map((g) => g.id);
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, ids, { start: true });
      // Advance to cutting while soak is still pending — the cutting terminal
      // gate hides it, so it must be the soak queue keeping it visible.
      await tx`UPDATE garments SET piece_stage='cutting' WHERE id = ANY(${tx.array(ids)}::uuid[])`;
      const rows = await surfaceRows(tx, orderId);
      const ctx = buildSurfaceContext(rows);
      expect(classifyGarmentSurfaces(rows[0]!, ctx)).toContain("soaking");
      await assertNoLeak(tx, orderId, "cutting + soak pending");
      // Soak complete → now the cutting terminal owns it.
      await tx`UPDATE garments SET soaking_completed_at = NOW() WHERE id = ANY(${tx.array(ids)}::uuid[])`;
      await assertNoLeak(tx, orderId, "cutting + soak done");
    });
  });

  it("parked finals at the workshop never leak (brova + finals)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      const allIds = garments.map((g) => g.id);
      const brova = idsByType(garments, "brova");
      await wf.dispatchOrder(tx, orderId);
      // Receive the whole order: finals arrive parked at waiting_for_acceptance.
      await wf.workshopReceive(tx, allIds, { start: false });
      await assertNoLeak(tx, orderId, "finals parked at workshop (not yet approved)");
      // Start the brova through production; parked finals stay put.
      await wf.workshopReceive(tx, brova, { start: true });
      await wf.runProduction(tx, brova);
      await assertNoLeak(tx, orderId, "brova in production, finals parked");
      for (const id of brova) await wf.submitQc(tx, id, { pass: true });
      await wf.workshopDispatch(tx, brova);
      await wf.shopReceive(tx, brova);
      await assertNoLeak(tx, orderId, "brova at shop for trial, finals parked");
      // Accept the brova → finals released → schedulable.
      await wf.brovaFeedback(tx, orderId, brova[0]!, "accepted");
      await wf.releaseFinals(tx, orderId);
      await assertNoLeak(tx, orderId, "brova accepted, finals released");
    });
  });

  it("brova Reject-Repair return: returning brova lands in Returns, never hides", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
      ]);
      const brovaId = idsByType(garments, "brova")[0]!;
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [brovaId], { start: true });
      await wf.runProduction(tx, [brovaId]);
      await wf.submitQc(tx, brovaId, { pass: true });
      await wf.workshopDispatch(tx, [brovaId]);
      await wf.shopReceive(tx, [brovaId]);
      await wf.brovaFeedback(tx, orderId, brovaId, "needs_repair_rejected");
      await wf.sendBackToWorkshop(tx, brovaId);
      await assertNoLeak(tx, orderId, "reject-repair brova in transit back");
      await wf.workshopReceive(tx, [brovaId], { start: false });
      await assertNoLeak(tx, orderId, "reject-repair brova received (trip 2, Returns)");
    });
  });

  it("brova Accept-with-Fix return: acceptance=true + needs_repair never hides", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
        { garment_type: "final" },
      ]);
      const brovaId = idsByType(garments, "brova")[0]!;
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [brovaId], { start: true });
      await wf.runProduction(tx, [brovaId]);
      await wf.submitQc(tx, brovaId, { pass: true });
      await wf.workshopDispatch(tx, [brovaId]);
      await wf.shopReceive(tx, [brovaId]);
      await wf.brovaFeedback(tx, orderId, brovaId, "needs_repair_accepted");
      await wf.releaseFinals(tx, orderId);
      await wf.sendBackToWorkshop(tx, brovaId);
      await assertNoLeak(tx, orderId, "accept-with-fix brova in transit back");
      await wf.workshopReceive(tx, [brovaId], { start: false });
      // The empirical check for the "accepted at workshop" leak family: the
      // returned brova carries needs_repair (not accepted) → Returns section.
      const row = (await surfaceRows(tx, orderId)).find((g) => g.id === brovaId)!;
      expect(row.feedback_status).not.toBe("accepted");
      await assertNoLeak(tx, orderId, "accept-with-fix brova received back");
    });
  });

  it("alteration-out order: never leaks through production", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createAlterationOrder(tx, [
        { garment_type: "alteration" },
      ]);
      const ids = garments.map((g) => g.id);
      await wf.dispatchOrder(tx, orderId);
      await assertNoLeak(tx, orderId, "alteration dispatched (receiving alt-out)");
      await wf.workshopReceive(tx, ids, { start: true });
      await assertNoLeak(tx, orderId, "alteration received & started");
      await wf.runProduction(tx, ids);
      await assertNoLeak(tx, orderId, "alteration in production");
      for (const id of ids) await wf.submitQc(tx, id, { pass: true });
      await wf.workshopDispatch(tx, ids);
      await wf.shopReceive(tx, ids);
      await assertNoLeak(tx, orderId, "alteration back at shop");
    });
  });

  it("shop-initiated redo (promote a final): no garment stranded", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      const brovaId = idsByType(garments, "brova")[0]!;
      const finals = idsByType(garments, "final");
      const promoteId = finals[0]!;
      await wf.dispatchOrder(tx, orderId);
      // Finals dispatched alongside the brova; they stay parked at the workshop.
      await wf.workshopReceive(tx, [brovaId, ...finals], { start: true });
      await wf.runProduction(tx, [brovaId]);
      await wf.submitQc(tx, brovaId, { pass: true });
      await wf.workshopDispatch(tx, [brovaId]);
      await wf.shopReceive(tx, [brovaId]);
      // Outcome 3: the promote RPC discards the brova AND promotes one parked
      // final to be the new trial brova (no preceding feedback submit).
      await wf.promoteFinalToBrova(tx, brovaId, promoteId);
      await assertNoLeak(tx, orderId, "after promote-final redo (brova discarded, other final still parked)");
      // The promoted brova (workshop, waiting_cut) flows forward like any garment.
      await wf.runProduction(tx, [promoteId]);
      await assertNoLeak(tx, orderId, "promoted brova in production, other final parked");
    });
  });

  it("shop-initiated redo (replacement from stock): replacement is always visible", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
      ]);
      const brovaId = idsByType(garments, "brova")[0]!;
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [brovaId], { start: true });
      await wf.runProduction(tx, [brovaId]);
      await wf.submitQc(tx, brovaId, { pass: true });
      await wf.workshopDispatch(tx, [brovaId]);
      await wf.shopReceive(tx, [brovaId]);
      await wf.brovaFeedback(tx, orderId, brovaId, "needs_redo");
      await wf.createReplacement(tx, brovaId);
      await assertNoLeak(tx, orderId, "after replacement created (original discarded)");
      // Dispatch the replacement and receive it at the workshop.
      await wf.dispatchOrder(tx, orderId);
      await assertNoLeak(tx, orderId, "replacement dispatched");
      const repl = (await surfaceRows(tx, orderId)).filter(
        (g) => g.piece_stage !== "discarded" && g.location === "transit_to_workshop",
      );
      await wf.workshopReceive(tx, repl.map((g) => g.id!), { start: true });
      await assertNoLeak(tx, orderId, "replacement received at workshop");
    });
  });
});
