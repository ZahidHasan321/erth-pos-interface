/**
 * Spec-matrix gaps — the brova/redo/QC/soak flows the happy-path lifecycle and
 * the original no-leak suite don't reach. Drives real RPCs through the driver
 * and asserts BOTH the spec behaviour (where the garment goes) AND that no
 * garment ever hides (isGarmentLeaked === false at every step).
 *
 * Covers (CLAUDE.md §2):
 *  - 2 brovas + finals: any ONE brova accepted releases ALL parked finals.
 *  - Reject-Redo → replacement from the customer's OWN (OUT) fabric: parked at
 *    customer_decision until resumed, then flows like any garment.
 *  - QC fail → return staging + PARTIAL rework routing: a garment sent back to
 *    only specific stages (e.g. sewing+ironing) visits ONLY those, skips the
 *    rest, and returns to QC — never ready_for_dispatch. No trip increment.
 *  - Soak-once: soak runs ONLY on the initial send (trip 1). A fix (trip >= 2)
 *    never re-soaks and is never stranded by the cutting soak-gate.
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
  inSoakQueue,
} from "../workshop-surfaces";
// Same cross-package relative-import pattern the driver uses for qc-spec — the
// REAL app routing function, so a regression in stage-skipping fails this suite.
import { getNextPlanStage } from "../../../../apps/workshop/src/lib/constants";

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

async function assertNoLeak(tx: Tx, orderId: number, label: string) {
  const rows = await surfaceRows(tx, orderId);
  const ctx = buildSurfaceContext(rows);
  const leaked = rows.filter((g) => isGarmentLeaked(g, ctx));
  expect(
    leaked,
    `${label}: ${leaked.length} leaked garment(s) — workshop-responsibility, ` +
      `not terminal, yet in NO actionable surface:\n${JSON.stringify(leaked, null, 2)}`,
  ).toEqual([]);
}

const idsByType = (gs: { id: string; garment_type: string }[], t: string) =>
  gs.filter((g) => g.garment_type === t).map((g) => g.id);

describe("spec matrix: brova / redo / QC / soak (CLAUDE.md §2)", () => {
  it("2 brovas + finals: accepting ONE brova releases ALL parked finals, nothing hides", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
        { garment_type: "brova" },
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      const allIds = garments.map((g) => g.id);
      const brovas = idsByType(garments, "brova");
      const finals = idsByType(garments, "final");
      await wf.dispatchOrder(tx, orderId);
      // Receive the whole order: with brovas present, finals park at
      // waiting_for_acceptance.
      await wf.workshopReceive(tx, allIds, { start: false });
      await assertNoLeak(tx, orderId, "2 brovas + finals received (finals parked)");

      // Take BOTH brovas through production and back to the shop for trial.
      await wf.workshopReceive(tx, brovas, { start: true });
      await wf.runProduction(tx, brovas);
      for (const id of brovas) await wf.submitQc(tx, id, { pass: true });
      await wf.workshopDispatch(tx, brovas);
      await wf.shopReceive(tx, brovas);
      await assertNoLeak(tx, orderId, "both brovas at shop for trial, finals parked");

      // Accept ONLY the first brova → ALL finals release (the §2.5 rule:
      // ANY one accepted brova releases every parked final).
      await wf.brovaFeedback(tx, orderId, brovas[0]!, "accepted");
      await wf.releaseFinals(tx, orderId);
      const rows = await surfaceRows(tx, orderId);
      const releasedFinals = rows.filter(
        (g) => finals.includes(g.id!) && g.piece_stage !== "waiting_for_acceptance",
      );
      expect(
        releasedFinals.length,
        "both finals should release after a single brova acceptance",
      ).toBe(2);
      // The second brova is still awaiting its own trial; neither it nor the
      // released finals may hide.
      await assertNoLeak(tx, orderId, "one brova accepted, finals released, 2nd brova pending");
    });
  });

  it("Reject-Redo → customer's own (OUT) fabric: parked at customer_decision, resumes, never hides", async () => {
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

      // Redo with the customer's OWN cloth: the replacement is created but
      // parked in the dispatch queue (nothing consumed from our stock) until
      // the customer brings the fabric.
      const repl = await wf.createReplacementResult(tx, brovaId, { fabricSource: "OUT" });
      expect(repl.fabric_source).toBe("OUT");
      expect(repl.parked, "OUT replacement must wait for the customer's cloth").toBe(true);
      expect(repl.parked_reason).toBe("customer_decision");
      await assertNoLeak(tx, orderId, "OUT replacement parked at shop (original discarded)");

      // Customer brings the cloth → resume → dispatch → receive at the workshop.
      const resumed = await wf.resumeParkedRedo(tx, repl.id);
      expect(resumed.resumed).toBe(true);
      await wf.dispatchOrder(tx, orderId);
      await assertNoLeak(tx, orderId, "resumed OUT replacement dispatched");
      const inTransit = (await surfaceRows(tx, orderId)).filter(
        (g) => g.location === "transit_to_workshop",
      );
      await wf.workshopReceive(tx, inTransit.map((g) => g.id!), { start: true });
      await assertNoLeak(tx, orderId, "OUT replacement received at workshop");
    });
  });

  it("QC fail → partial rework (sewing+ironing only): return staging, no trip increment, back to QC", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      const id = garments[0]!.id;
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [id], { start: true });
      await wf.runProduction(tx, [id]); // → quality_check

      const tripBefore = (await surfaceRows(tx, orderId))[0]!.trip_number;

      // Inspector sends it back to ONLY sewing + ironing (note: passed out of
      // pipeline order to prove the staging is sorted by the pipeline).
      await wf.submitQc(tx, id, { pass: false, returnStages: ["ironing", "sewing"] });

      const row = only(await tx`
        SELECT trip_number, piece_stage, qc_rework_stages, trip_history
        FROM garments WHERE id = ${id}
      `);
      // Earliest selected stage in pipeline order owns the garment now.
      expect(row.piece_stage).toBe("sewing");
      // Stored breadcrumb is ordered by the pipeline (sewing before ironing).
      expect(row.qc_rework_stages).toEqual(["sewing", "ironing"]);
      // QC fail is a same-trip rework — NEVER a trip increment.
      expect(row.trip_number).toBe(tripBefore);
      const lastAttempt = (row.trip_history as { qc_attempts: { result: string }[] }[])
        .at(-1)!.qc_attempts.at(-1)!;
      expect(lastAttempt.result).toBe("fail");
      await assertNoLeak(tx, orderId, "QC-fail garment at sewing terminal");

      // The REAL routing function: from sewing it SKIPS finishing → ironing,
      // then from ironing it returns to QC (never ready_for_dispatch).
      const rework = ["sewing", "ironing"];
      expect(getNextPlanStage("sewing", null, rework)).toBe("ironing");
      expect(getNextPlanStage("ironing", null, rework)).toBe("quality_check");
    });
  });

  it("getNextPlanStage: rework + plan both restrict the path (pure routing)", () => {
    // Rework to a single stage: sewing → straight back to QC.
    expect(getNextPlanStage("sewing", null, ["sewing"])).toBe("quality_check");
    // Rework to sewing+ironing: finishing is skipped.
    expect(getNextPlanStage("sewing", null, ["sewing", "ironing"])).toBe("ironing");
    // After the last rework stage, always QC — never ready_for_dispatch.
    expect(getNextPlanStage("ironing", null, ["sewing", "ironing"])).toBe("quality_check");
    // A partial PLAN (no finisher assigned) also skips finishing on a normal run.
    expect(getNextPlanStage("sewing", { sewer: "A", ironer: "B" }, null)).toBe("ironing");
    // No plan, no rework → plain linear pipeline.
    expect(getNextPlanStage("cutting", null, null)).toBe("sewing");
  });

  it("soak runs ONCE (trip 1 only): a fix never re-soaks and is never stranded", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova", soaking: true },
      ]);
      const id = garments[0]!.id;
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [id], { start: true });

      // Trip 1, soak pending: the soak queue is what keeps it visible.
      let rows = await surfaceRows(tx, orderId);
      expect(inSoakQueue(rows[0]!), "trip-1 soak-pending garment is in the soak queue").toBe(true);
      await assertNoLeak(tx, orderId, "trip 1, soak pending");

      // Soak completes ONCE, then the garment finishes trip 1 and goes to the
      // shop for its brova trial.
      await tx`UPDATE garments SET soaking_completed_at = NOW() WHERE id = ${id}`;
      await wf.runProduction(tx, [id]);
      await wf.submitQc(tx, id, { pass: true });
      await wf.workshopDispatch(tx, [id]);
      await wf.shopReceive(tx, [id]);

      // Reject-Repair → the fix sends it back as trip 2.
      await wf.brovaFeedback(tx, orderId, id, "needs_repair_rejected");
      await wf.sendBackToWorkshop(tx, id);

      rows = await surfaceRows(tx, orderId);
      const g = rows[0]!;
      expect(g.trip_number, "the fix is trip 2").toBe(2);
      // The soak completion from trip 1 PERSISTS (never reset) ...
      expect(g.soaking, "soaking flag persists").toBe(true);
      expect(g.soaking_completed_at, "soaking_completed_at is NOT reset on a fix").not.toBeNull();
      // ... so the fix is NOT in the soak queue (trip != 1) and never re-soaks.
      expect(inSoakQueue(g), "a trip-2 fix is never re-queued for soaking").toBe(false);

      // Receive + schedule the fix: it goes straight into production, never soak,
      // and is never stranded by the cutting soak-gate.
      await wf.workshopReceive(tx, [id], { start: true });
      const after = (await surfaceRows(tx, orderId))[0]!;
      const surfaces = classifyGarmentSurfaces(after, buildSurfaceContext([after]));
      expect(surfaces, "the fix is never routed back into the soak queue").not.toContain("soaking");
      await assertNoLeak(tx, orderId, "trip-2 fix in production, no re-soak");
    });
  });
});

// Local copy of the driver's single-row accessor (kept private to this file).
function only<T = Record<string, unknown>>(rows: readonly T[]): T {
  if (rows.length !== 1) {
    throw new Error(`expected exactly 1 row, got ${rows.length}`);
  }
  return rows[0]!;
}
