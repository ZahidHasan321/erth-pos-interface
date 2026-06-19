/**
 * End-to-end garment lifecycle suite — SPEC AS ORACLE.
 *
 * Assertions encode the *intended* behaviour defined in CLAUDE.md
 * ("Order Lifecycle" / "Branch Tree" / "Showroom Status Labels"), NOT
 * whatever the code currently does. A failing test therefore means the
 * system violates the spec — a bug to fix in the implementation (RPC /
 * trigger / app-layer step), not a test to relax.
 *
 * What is real vs mirrored:
 *  - DB RPCs + triggers run for real (save_work_order_garments,
 *    complete_work_order, record_payment_transaction, toggle_home_delivery,
 *    collect_garments, create_complete_sales_order, recompute_order_phase,
 *    sync_order_paid_from_transactions, idempotency).  ← genuinely under test
 *  - App-layer steps (dispatch / receive / production / QC / shop-receive /
 *    feedback persist / send-back / replacement) are reproduced by the driver
 *    as the exact mutations the app issues, each citing app file:line. A spec
 *    failure on one of those points at the cited app code.
 *
 * Every test runs in a transaction that is rolled back; committed reference
 * data is untouched and scenarios are isolated.
 */
import { describe, it, expect, afterAll } from "vitest";
import {
  sql,
  inRolledBackTx,
  tryInSavepoint,
  only,
  type Tx,
} from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";
import { isAlteration, getAlterationNumber } from "../utils";
import { deriveReworkEnabledKeys } from "../../../../apps/workshop/src/lib/production-logic";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// ─── assertion-friendly accessors (no raw indexing under strict TS) ─────────

async function pick(tx: Tx, id: string): Promise<wf.GarmentRow> {
  return only(
    await tx`
      SELECT id, garment_id, garment_type, piece_stage, location, trip_number,
             acceptance_status, feedback_status, fulfillment_type, in_production,
             home_delivery, replaced_by_garment_id, trip_history, qc_rework_stages
      FROM garments WHERE id = ${id}`,
    `garment ${id}`,
  ) as unknown as wf.GarmentRow;
}

const idsOf = (gs: wf.GarmentRow[], t: string) =>
  gs.filter((x) => x.garment_type === t).map((x) => x.id);

function oneId(gs: wf.GarmentRow[], t: string): string {
  const id = idsOf(gs, t)[0];
  if (id === undefined) throw new Error(`no ${t} garment in order`);
  return id;
}
function allIds(gs: wf.GarmentRow[]): string[] {
  return gs.map((x) => x.id);
}

/** Workshop happy path → garments received at shop. */
async function toShop(tx: Tx, orderId: number, ids: string[]) {
  await wf.dispatchOrder(tx, orderId);
  await wf.workshopReceive(tx, ids, { start: true });
  await wf.runProduction(tx, ids);
  for (const id of ids) await wf.submitQc(tx, id, { pass: true });
  await wf.workshopDispatch(tx, ids);
  await wf.shopReceive(tx, ids);
}

// ════════════════════════════════════════════════════════════════════════════

describe("order creation + cashier split (CLAUDE.md §Order Lifecycle 1–2)", () => {
  it("SPEC: paid=0 confirm ⇒ confirmed & unpaid (cashier queue); order_phase 'new'", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      const o = await wf.getOrder(tx, orderId);
      expect(o.checkout_status).toBe("confirmed");
      expect(Number(o.paid)).toBe(0);
      expect(o.order_phase).toBe("new");
      expect(garments).toHaveLength(1);
      // SPEC: a final with no brova in the order starts at waiting_cut.
      expect(only(garments, "g").piece_stage).toBe("waiting_cut");
    });
  });

  it("SPEC: cashier payment via record_payment_transaction sums into orders.paid (trigger)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      const res = await wf.recordPayment(tx, orderId, 84);
      expect(Number(res.order_paid)).toBe(84);
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(84);
    });
  });

  it("SPEC: inline payment at order-taking (paid=full) records the transaction", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }, { garment_type: "final" }],
        { paid: 84 },
      );
      const o = await wf.getOrder(tx, orderId);
      expect(o.checkout_status).toBe("confirmed");
      expect(Number(o.paid)).toBe(84);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════

/** True when the WORK order's §3 cashier-processing gate is cleared. */
async function isProcessed(tx: Tx, orderId: number): Promise<boolean> {
  const [w] = await tx`
    SELECT cashier_processed_at FROM work_orders WHERE order_id = ${orderId}
  `;
  return (w as { cashier_processed_at: unknown } | undefined)?.cashier_processed_at != null;
}

describe("SPEC §3: WORK cashier-processing gate", () => {
  it("SPEC: a confirmed WORK order is pending (cashier_processed_at NULL) until a cashier acts", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      expect(await isProcessed(tx, orderId)).toBe(false);
    });
  });

  it("SPEC: dispatch is REJECTED while the order is still pending (no garment moves)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      // Raw dispatch (no cashier step) must be rejected by the gate.
      const err = await tryInSavepoint(tx, (sp) =>
        wf.dispatchOrder(sp, orderId, undefined, { skipCashierProcess: true }),
      );
      expect(err).not.toBeNull();
      // Nothing moved: garments still at trip 0 / shop, order_phase still 'new'.
      const gs = await wf.getGarments(tx, orderId);
      expect(gs.every((g) => g.trip_number === 0 && g.location === "shop")).toBe(true);
      expect((await wf.getOrder(tx, orderId)).order_phase).toBe("new");
    });
  });

  it("SPEC: confirm-without-payment clears the gate (paid stays 0) and unlocks dispatch", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      await wf.cashierProcess(tx, orderId);
      expect(await isProcessed(tx, orderId)).toBe(true);
      // The marker — not payment — is the gate: paid is still 0.
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(0);

      // Dispatch now succeeds (already processed; skip the helper's auto-step).
      await wf.dispatchOrder(tx, orderId, undefined, { skipCashierProcess: true });
      const gs = await wf.getGarments(tx, orderId);
      expect(gs.every((g) => g.trip_number === 1 && g.location === "transit_to_workshop")).toBe(true);
      expect((await wf.getOrder(tx, orderId)).order_phase).toBe("in_progress");
      void garments;
    });
  });

  it("SPEC: the first payment also clears the gate (paid via record_payment_transaction)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      expect(await isProcessed(tx, orderId)).toBe(false);
      await wf.recordPayment(tx, orderId, 40); // partial advance
      expect(await isProcessed(tx, orderId)).toBe(true);
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(40);
      // Gate satisfied → dispatch allowed.
      await wf.dispatchOrder(tx, orderId, undefined, { skipCashierProcess: true });
      expect((await wf.getOrder(tx, orderId)).order_phase).toBe("in_progress");
    });
  });

  it("SPEC: ALTERATION dispatch is NOT gated by cashier processing", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createAlterationOrder(tx, [
        { garment_type: "alteration" },
      ]);
      // No cashier step; the gate must not block a non-WORK order.
      await wf.dispatchOrder(tx, orderId, undefined, { skipCashierProcess: true });
      const gs = await wf.getGarments(tx, orderId);
      expect(gs.every((g) => g.trip_number === 1 && g.location === "transit_to_workshop")).toBe(true);
      void garments;
    });
  });
});

describe("SPEC §3: bulk cashier payment (atomic + idempotent)", () => {
  it("SPEC: bulk payment charges each order its own amount and clears each gate", async () => {
    await inRolledBackTx(async (tx) => {
      const a = (await wf.createWorkOrder(tx, [{ garment_type: "final" }])).orderId;
      const b = (await wf.createWorkOrder(tx, [{ garment_type: "final" }])).orderId;
      const c = (await wf.createWorkOrder(tx, [{ garment_type: "final" }])).orderId;

      const res = await wf.recordBulkPayment(tx, [
        { orderId: a, amount: 40 }, // partial advance
        { orderId: b, amount: 84 }, // full
        { orderId: c, amount: 10 },
      ]);
      expect(Number(res.count)).toBe(3);
      expect(Number(res.total_charged)).toBe(134);

      expect(Number((await wf.getOrder(tx, a)).paid)).toBe(40);
      expect(Number((await wf.getOrder(tx, b)).paid)).toBe(84);
      expect(Number((await wf.getOrder(tx, c)).paid)).toBe(10);
      expect(await isProcessed(tx, a)).toBe(true);
      expect(await isProcessed(tx, b)).toBe(true);
      expect(await isProcessed(tx, c)).toBe(true);
    });
  });

  it("SPEC: a replayed bulk batch (same key) charges ONCE — no double credit", async () => {
    await inRolledBackTx(async (tx) => {
      const a = (await wf.createWorkOrder(tx, [{ garment_type: "final" }])).orderId;
      const b = (await wf.createWorkOrder(tx, [{ garment_type: "final" }])).orderId;
      const key = "11111111-1111-1111-1111-111111111111";

      await wf.recordBulkPayment(tx, [
        { orderId: a, amount: 40 },
        { orderId: b, amount: 84 },
      ], { idempotencyKey: key });
      // Lost-response replay with the SAME batch key.
      await wf.recordBulkPayment(tx, [
        { orderId: a, amount: 40 },
        { orderId: b, amount: 84 },
      ], { idempotencyKey: key });

      // Paid moved once, not twice.
      expect(Number((await wf.getOrder(tx, a)).paid)).toBe(40);
      expect(Number((await wf.getOrder(tx, b)).paid)).toBe(84);
      // Exactly one payment transaction per order.
      const [countA] = await tx`
        SELECT COUNT(*)::int AS n FROM payment_transactions WHERE order_id = ${a}
      `;
      expect((countA as { n: number }).n).toBe(1);
    });
  });

  it("SPEC: bulk payment is ALL-OR-NOTHING — one bad order aborts the whole batch (no cash leak)", async () => {
    await inRolledBackTx(async (tx) => {
      const a = (await wf.createWorkOrder(tx, [{ garment_type: "final" }])).orderId;
      const bogus = 999_999; // non-existent order → record_payment_transaction raises

      const err = await tryInSavepoint(tx, (sp) =>
        wf.recordBulkPayment(sp, [
          { orderId: a, amount: 40 },
          { orderId: bogus, amount: 10 },
        ]),
      );
      expect(err).not.toBeNull();

      // The good order's payment was rolled back with the batch: nothing leaked.
      expect(Number((await wf.getOrder(tx, a)).paid)).toBe(0);
      expect(await isProcessed(tx, a)).toBe(false);
      const [count] = await tx`
        SELECT COUNT(*)::int AS n FROM payment_transactions WHERE order_id = ${a}
      `;
      expect((count as { n: number }).n).toBe(0);
    });
  });
});

describe("garment combos (CLAUDE.md §Branch Tree, brova-parking rule)", () => {
  it("SPEC: finals-only (no brova) ⇒ NOT parked; through to ready_for_pickup then completed", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      expect(garments.every((x) => x.piece_stage === "waiting_cut")).toBe(true);

      const ids = allIds(garments);
      await toShop(tx, orderId, ids);
      const atShop = await wf.getGarments(tx, orderId);
      expect(atShop.every((x) => x.piece_stage === "ready_for_pickup")).toBe(
        true,
      );

      await wf.recordPayment(tx, orderId, 84, { collectGarmentIds: ids });
      const done = await wf.getGarments(tx, orderId);
      expect(done.every((x) => x.piece_stage === "completed")).toBe(true);
      expect(done.every((x) => x.fulfillment_type === "collected")).toBe(true);
      // SPEC §Order-Level Phase: all terminal ⇒ order_phase completed.
      expect((await wf.getOrder(tx, orderId)).order_phase).toBe("completed");
    });
  });

  it("SPEC: 2 brovas + 2 finals ⇒ finals parked at waiting_for_acceptance until a brova accepted", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
        { garment_type: "brova" },
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      expect(
        garments
          .filter((x) => x.garment_type === "final")
          .every((x) => x.piece_stage === "waiting_for_acceptance"),
      ).toBe(true);

      const brovaIds = idsOf(garments, "brova");
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, allIds(garments), { start: true });
      await wf.runProduction(tx, brovaIds);
      for (const id of brovaIds) await wf.submitQc(tx, id, { pass: true });
      await wf.workshopDispatch(tx, brovaIds);
      await wf.shopReceive(tx, brovaIds);

      // SPEC: finals still parked while brovas await trial.
      let gs = await wf.getGarments(tx, orderId);
      expect(
        gs
          .filter((x) => x.garment_type === "final")
          .every((x) => x.piece_stage === "waiting_for_acceptance"),
      ).toBe(true);

      // SPEC §Branch Tree: ANY one accepted brova releases ALL finals;
      // a parallel reject does not block the release.
      const b0 = brovaIds[0];
      const b1 = brovaIds[1];
      if (b0 === undefined || b1 === undefined) throw new Error("need 2 brovas");
      const r1 = await wf.brovaFeedback(tx, orderId, b0, "accepted");
      expect(r1.releaseFinals).toBe(true);
      await wf.brovaFeedback(tx, orderId, b1, "needs_repair_rejected");

      await wf.releaseFinals(tx, orderId);
      gs = await wf.getGarments(tx, orderId);
      const finalIds = idsOf(gs, "final");
      expect(
        gs
          .filter((x) => finalIds.includes(x.id))
          .every((x) => x.piece_stage === "waiting_cut"),
      ).toBe(true);

      await wf.workshopReceive(tx, finalIds, { start: true });
      await wf.runProduction(tx, finalIds);
      for (const id of finalIds) await wf.submitQc(tx, id, { pass: true });
      await wf.workshopDispatch(tx, finalIds);
      await wf.shopReceive(tx, finalIds);
      const finalRows = (await wf.getGarments(tx, orderId)).filter((x) =>
        finalIds.includes(x.id),
      );
      expect(finalRows.every((x) => x.piece_stage === "ready_for_pickup")).toBe(
        true,
      );
    });
  });

  it("SPEC: brova-only order ⇒ trial then collect", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
      ]);
      const id = oneId(garments, "brova");
      await toShop(tx, orderId, [id]);
      expect((await pick(tx, id)).piece_stage).toBe("awaiting_trial");
      const r = await wf.brovaFeedback(tx, orderId, id, "accepted");
      expect(r.newStage).toBe("brova_trialed");
      await wf.recordPayment(tx, orderId, 84, { collectGarmentIds: [id] });
      expect((await pick(tx, id)).piece_stage).toBe("completed");
    });
  });
});

describe("brova feedback Branch Tree (CLAUDE.md §Branch Tree table)", () => {
  async function brovaAtShop(tx: Tx) {
    const { orderId, garments } = await wf.createWorkOrder(tx, [
      { garment_type: "brova" },
      { garment_type: "final" },
    ]);
    const bId = oneId(garments, "brova");
    await wf.dispatchOrder(tx, orderId);
    await wf.workshopReceive(tx, allIds(garments), { start: true });
    await wf.runProduction(tx, [bId]);
    await wf.submitQc(tx, bId, { pass: true });
    await wf.workshopDispatch(tx, [bId]);
    await wf.shopReceive(tx, [bId]);
    return { orderId, bId, garments };
  }

  it("SPEC Accept: brova_trialed · accepted · acceptance=true · finals released", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, bId } = await brovaAtShop(tx);
      const r = await wf.brovaFeedback(tx, orderId, bId, "accepted");
      expect(r).toMatchObject({
        newStage: "brova_trialed",
        feedbackStatus: "accepted",
        acceptanceStatus: true,
        releaseFinals: true,
      });
      const b = await pick(tx, bId);
      expect(b.piece_stage).toBe("brova_trialed");
      expect(b.acceptance_status).toBe(true);
      expect(b.feedback_status).toBe("accepted");
    });
  });

  it("SPEC Accept-with-Fix: needs_repair · acceptance=true · finals released · back to workshop (trip+1)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, bId } = await brovaAtShop(tx);
      const r = await wf.brovaFeedback(
        tx,
        orderId,
        bId,
        "needs_repair_accepted",
      );
      expect(r).toMatchObject({
        feedbackStatus: "needs_repair",
        acceptanceStatus: true,
        releaseFinals: true,
      });
      await wf.sendBackToWorkshop(tx, bId);
      const b = await pick(tx, bId);
      expect(b.piece_stage).toBe("waiting_cut");
      expect(b.trip_number).toBe(2);
      expect(isAlteration(b.trip_number)).toBe(true);
      expect(getAlterationNumber(b.trip_number)).toBe(1);
    });
  });

  it("SPEC Reject-Repair: needs_repair · acceptance=false · finals stay parked · brova returns", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, bId, garments } = await brovaAtShop(tx);
      const r = await wf.brovaFeedback(
        tx,
        orderId,
        bId,
        "needs_repair_rejected",
      );
      expect(r.acceptanceStatus).toBe(false);
      expect(r.releaseFinals).toBe(false);
      const finalId = oneId(garments, "final");
      expect((await pick(tx, finalId)).piece_stage).toBe(
        "waiting_for_acceptance",
      );

      await wf.sendBackToWorkshop(tx, bId);
      await wf.workshopReceive(tx, [bId], { start: true });
      await wf.runProduction(tx, [bId]);
      await wf.submitQc(tx, bId, { pass: true });
      await wf.workshopDispatch(tx, [bId]);
      await wf.shopReceive(tx, [bId]);
      const r2 = await wf.brovaFeedback(tx, orderId, bId, "accepted");
      expect(r2.releaseFinals).toBe(true);
      expect((await pick(tx, bId)).trip_number).toBe(2);
    });
  });

  it("SPEC Reject-Redo: original discarded (terminal) · shop creates replacement at the shop (replaces↔replaced_by)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, bId } = await brovaAtShop(tx);
      const r = await wf.brovaFeedback(tx, orderId, bId, "needs_redo");
      expect(r.newStage).toBe("discarded");
      expect((await pick(tx, bId)).piece_stage).toBe("discarded");

      const replId = await wf.createReplacement(tx, bId);
      expect((await pick(tx, bId)).replaced_by_garment_id).toBe(replId);
      const repl = await pick(tx, replId);
      // SPEC §2.5: shop-initiated → the replacement lands in the shop dispatch
      // queue (location shop, trip 0), then dispatches like any fresh garment.
      expect(repl).toMatchObject({
        piece_stage: "waiting_cut",
        location: "shop",
        trip_number: 0,
      });

      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [replId], { start: true });
      await wf.runProduction(tx, [replId]);
      await wf.submitQc(tx, replId, { pass: true });
      await wf.workshopDispatch(tx, [replId]);
      await wf.shopReceive(tx, [replId]);
      const r2 = await wf.brovaFeedback(tx, orderId, replId, "accepted");
      expect(r2.releaseFinals).toBe(true);
    });
  });
});

describe("repeated send-backs — alteration cycles (CLAUDE.md §Alteration Thresholds)", () => {
  it("SPEC: each send-back increments trip; trip N ⇒ alteration #(N-1), no cap", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
        { garment_type: "final" },
      ]);
      const bId = oneId(garments, "brova");
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, allIds(garments), { start: true });

      for (let cycle = 1; cycle <= 3; cycle++) {
        await wf.runProduction(tx, [bId]);
        await wf.submitQc(tx, bId, { pass: true });
        await wf.workshopDispatch(tx, [bId]);
        await wf.shopReceive(tx, [bId]);
        if (cycle < 3) {
          await wf.brovaFeedback(tx, orderId, bId, "needs_repair_accepted");
          await wf.sendBackToWorkshop(tx, bId);
          await wf.workshopReceive(tx, [bId], { start: true });
        } else {
          await wf.brovaFeedback(tx, orderId, bId, "accepted");
        }
      }
      const b = await pick(tx, bId);
      expect(b.trip_number).toBe(3); // initial + 2 send-backs
      expect(getAlterationNumber(b.trip_number)).toBe(2);
    });
  });
});

describe("QC fail rework (CLAUDE.md §QC Fail)", () => {
  it("SPEC: fail bounces to earliest failed stage · NO trip increment · attempt logged · then pass", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      const id = oneId(garments, "final");
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [id], { start: true });
      await wf.runProduction(tx, [id]); // → quality_check

      await wf.submitQc(tx, id, {
        pass: false,
        returnStages: ["finishing", "sewing"],
      });
      let g = await pick(tx, id);
      // SPEC: bounced to the EARLIEST failed stage (sewing < finishing).
      expect(g.piece_stage).toBe("sewing");
      expect(g.qc_rework_stages).toEqual(["sewing", "finishing"]);
      expect(g.trip_number).toBe(1); // SPEC: QC fail does NOT bump trip
      const attempts = g.trip_history?.find((h) => h.trip === 1)?.qc_attempts;
      expect(attempts?.some((a) => a.result === "fail")).toBe(true);

      await wf.runProduction(tx, [id]);
      await wf.submitQc(tx, id, { pass: true });
      g = await pick(tx, id);
      expect(g.piece_stage).toBe("ready_for_dispatch");
      expect(g.qc_rework_stages).toBe(null);
      expect(g.trip_number).toBe(1);
    });
  });

  it("SPEC: real evaluateQc — measurement out of tolerance fails & bounces; corrected passes", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      const id = oneId(garments, "final");
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [id], { start: true });
      await wf.runProduction(tx, [id]); // → quality_check

      const enabled = new Set(["shoulder"]);
      // SPEC §QC Fail: a real measurement past QC_TOLERANCE (0.125") must fail.
      const fail = await wf.submitQcReal(tx, id, {
        expectedMeasurements: { shoulder: 20 },
        inputs: { measurements: { shoulder: 20.6 }, options: {}, quality_ratings: {} },
        enabledKeys: enabled,
        returnStagesOnFail: ["finishing", "sewing"],
      });
      expect(fail.result).toBe("fail");
      let g = await pick(tx, id);
      expect(g.piece_stage).toBe("sewing"); // earliest failed stage
      expect(g.trip_number).toBe(1); // QC fail never bumps trip

      await wf.runProduction(tx, [id]);
      // SPEC: within tolerance ⇒ pass (0.1" < 0.125").
      const pass = await wf.submitQcReal(tx, id, {
        expectedMeasurements: { shoulder: 20 },
        inputs: { measurements: { shoulder: 20.1 }, options: {}, quality_ratings: {} },
        enabledKeys: enabled,
      });
      expect(pass.result).toBe("pass");
      g = await pick(tx, id);
      expect(g.piece_stage).toBe("ready_for_dispatch");
      expect(g.trip_number).toBe(1);
    });
  });
});

describe("final hand-over — pickup vs home delivery (CLAUDE.md §Final Collection)", () => {
  it("SPEC: pickup ⇒ fulfillment_type 'collected', piece_stage completed", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      const id = oneId(garments, "final");
      await toShop(tx, orderId, [id]);
      await wf.finalCollect(tx, id, { homeDelivery: false });
      const g = await pick(tx, id);
      expect(g.piece_stage).toBe("completed");
      expect(g.fulfillment_type).toBe("collected");
    });
  });

  it("SPEC: toggle_home_delivery swaps delivery charge into order_total; delivered fulfillment", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      const id = oneId(garments, "final");
      const before = await wf.getOrder(tx, orderId);
      const res = await wf.toggleHomeDelivery(tx, orderId, true);
      expect(Number(res.delivery_charge)).toBe(2); // seeded HOME_DELIVERY
      const after = await wf.getOrder(tx, orderId);
      expect(Number(after.order_total)).toBe(Number(before.order_total) + 2);
      expect(after.home_delivery).toBe(true);

      await toShop(tx, orderId, [id]);
      await wf.collectGarments(tx, orderId, [id]);
      // SPEC §collect_garments: home_delivery ⇒ fulfillment 'delivered'.
      expect((await pick(tx, id)).fulfillment_type).toBe("delivered");
    });
  });
});

describe("mid-trial split: collect some now, deliver the rest (CLAUDE.md §pickup_ungated)", () => {
  it("SPEC: one garment handed over (override collected), rest switched to delivery + paid in one cashier txn", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      const ids = allIds(garments);
      const g1 = ids[0];
      const g2 = ids[1];
      if (g1 === undefined || g2 === undefined) throw new Error("need 2");
      await toShop(tx, orderId, [g1, g2]);

      await wf.toggleHomeDelivery(tx, orderId, true);

      const res = await wf.recordPayment(tx, orderId, 86, {
        collectGarmentIds: [g1, g2],
        fulfillmentOverrides: { [g1]: "collected" },
      });
      expect(res.collected_count).toBe(2);
      const r1 = await pick(tx, g1);
      const r2 = await pick(tx, g2);
      expect(r1.fulfillment_type).toBe("collected"); // explicit override
      expect(r2.fulfillment_type).toBe("delivered"); // home_delivery default
      expect(Number(res.order_paid)).toBe(86);
    });
  });
});

describe("refund / cancellation (CLAUDE.md §Cancellation / Refund)", () => {
  it("SPEC: full per-garment refund ⇒ discarded; orders.paid drops via trigger; order stays confirmed; sibling untouched", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }, { garment_type: "final" }],
        { paid: 84 },
      );
      const ids = allIds(garments);
      const victim = ids[0];
      const sibling = ids[1];
      if (victim === undefined || sibling === undefined)
        throw new Error("need 2");
      await wf.recordPayment(tx, orderId, 28, {
        refund: {
          reason: "customer cancelled one piece",
          items: [
            {
              garment_id: victim,
              fabric: true,
              stitching: true,
              style: true,
              amount: 28,
            },
          ],
        },
      });
      expect((await pick(tx, victim)).piece_stage).toBe("discarded");
      const o = await wf.getOrder(tx, orderId);
      expect(Number(o.paid)).toBe(84 - 28);
      expect(o.checkout_status).toBe("confirmed");
      expect((await pick(tx, sibling)).piece_stage).toBe("waiting_cut");
    });
  });

  it("SPEC: partial component refund keeps the garment alive (not discarded)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }],
        { paid: 84 },
      );
      const id = oneId(garments, "final");
      await wf.recordPayment(tx, orderId, 3, {
        refund: {
          reason: "style downgrade",
          items: [{ garment_id: id, style: true, amount: 3 }],
        },
      });
      expect((await pick(tx, id)).piece_stage).not.toBe("discarded");
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(81);
    });
  });
});

describe("sales order (CLAUDE.md §Inventory: complete_sales_order)", () => {
  it("SPEC: create_complete_sales_order ⇒ confirmed SALES + shelf shop_stock decremented", async () => {
    await inRolledBackTx(async (tx) => {
      const before = only(
        await tx`SELECT shop_stock FROM shelf WHERE id = 1`,
        "shelf 1",
      );
      const row = await wf.createSalesOrder(tx, [
        { id: 1, quantity: 2, unitPrice: 25 },
      ]);
      expect(row.checkout_status).toBe("confirmed");
      expect(row.order_type).toBe("SALES");
      expect(Number(row.paid)).toBe(50);
      const after = only(
        await tx`SELECT shop_stock FROM shelf WHERE id = 1`,
        "shelf 1",
      );
      expect(Number(after.shop_stock)).toBe(Number(before.shop_stock) - 2);
    });
  });
});

describe("final hand-over rejections (CLAUDE.md §Final Collection)", () => {
  /** Drive a lone final to ready_for_pickup at shop. */
  async function finalAtShop(tx: Tx) {
    const { orderId, garments } = await wf.createWorkOrder(tx, [
      { garment_type: "final" },
    ]);
    const id = oneId(garments, "final");
    await toShop(tx, orderId, [id]);
    return { orderId, id };
  }

  it("SPEC: Needs Repair → brova_trialed + needs_repair; sendBack → trip 2 / alteration cycle", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, id } = await finalAtShop(tx);
      await wf.finalReject(tx, id, "needs_repair");
      const g = await pick(tx, id);
      expect(g.piece_stage).toBe("brova_trialed");
      expect(g.feedback_status).toBe("needs_repair");
      expect(g.acceptance_status).toBe(false);

      await wf.sendBackToWorkshop(tx, id);
      const g2 = await pick(tx, id);
      expect(g2.trip_number).toBe(2);
      // SPEC §Alteration Thresholds: trip 2 = alteration.
      expect(isAlteration(g2.trip_number)).toBe(true);
    });
  });

  it("SPEC: Needs Redo on normal final → discarded; createReplacement → waiting_cut at shop/trip 0, replaced_by set", async () => {
    await inRolledBackTx(async (tx) => {
      const { id } = await finalAtShop(tx);
      await wf.finalReject(tx, id, "needs_redo");
      const g = await pick(tx, id);
      expect(g.piece_stage).toBe("discarded");
      expect(g.feedback_status).toBe("needs_redo");

      const replId = await wf.createReplacement(tx, id);
      expect((await pick(tx, id)).replaced_by_garment_id).toBe(replId);
      const repl = await pick(tx, replId);
      // SPEC §2.5: shop-initiated → replacement created at the shop (trip 0).
      expect(repl.piece_stage).toBe("waiting_cut");
      expect(repl.location).toBe("shop");
      expect(repl.trip_number).toBe(0);
    });
  });

  it("SPEC: Needs Redo on ALTERATION-order garment → brova_trialed (NOT discarded — customer property)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createAlterationOrder(tx, [
        { garment_type: "alteration" },
      ]);
      const id = oneId(garments, "alteration");
      // Drive through workshop to shop (alteration_orders has no brova-parking).
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [id], { start: true });
      await wf.runProduction(tx, [id]);
      await wf.submitQc(tx, id, { pass: true });
      await wf.workshopDispatch(tx, [id]);
      await wf.shopReceive(tx, [id]);

      await wf.finalReject(tx, id, "needs_redo", { isAlterationOrder: true });
      const g = await pick(tx, id);
      // SPEC §Branch Tree Final Collection: alteration garment is NEVER discarded.
      expect(g.piece_stage).not.toBe("discarded");
      expect(g.piece_stage).toBe("brova_trialed");
      expect(g.feedback_status).toBe("needs_redo");
    });
  });
});

describe("edge cases", () => {
  it("SPEC: partial dispatch — dispatched ⇒ trip 1 / transit; undispatched stays trip 0 / shop", async () => {
    await inRolledBackTx(async (tx) => {
      // dispatchOrder gates on trip_number=0 (orders.ts:279); a garment not
      // in the IDs list must not be re-stamped on a subsequent bulk dispatch.
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      const [a, b, c] = garments.map((x) => x.id);
      if (!a || !b || !c) throw new Error("need 3 garments");

      await wf.dispatchOrder(tx, orderId, [a, b]);
      const gs1 = await wf.getGarments(tx, orderId);
      const byId = (id: string) => gs1.find((x) => x.id === id)!;
      expect(byId(a).location).toBe("transit_to_workshop");
      expect(byId(a).trip_number).toBe(1);
      expect(byId(b).location).toBe("transit_to_workshop");
      expect(byId(b).trip_number).toBe(1);
      // SPEC: c not dispatched — must remain trip 0 / shop.
      expect(byId(c).trip_number).toBe(0);
      expect(byId(c).location).toBe("shop");

      // Dispatch the remaining garment; it goes to trip 1 (not 2).
      await wf.dispatchOrder(tx, orderId, [c]);
      expect((await pick(tx, c)).trip_number).toBe(1);
      expect((await pick(tx, c)).location).toBe("transit_to_workshop");
    });
  });

  it("SPEC: all brovas rejected (no acceptance) ⇒ finals park forever at waiting_for_acceptance", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
        { garment_type: "brova" },
        { garment_type: "final" },
      ]);
      const brovaIds = idsOf(garments, "brova");
      const finalId = oneId(garments, "final");

      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, allIds(garments), { start: true });
      await wf.runProduction(tx, brovaIds);
      for (const id of brovaIds) await wf.submitQc(tx, id, { pass: true });
      await wf.workshopDispatch(tx, brovaIds);
      await wf.shopReceive(tx, brovaIds);

      const [b0, b1] = brovaIds;
      if (!b0 || !b1) throw new Error("need 2 brovas");
      await wf.brovaFeedback(tx, orderId, b0, "needs_repair_rejected");
      await wf.brovaFeedback(tx, orderId, b1, "needs_repair_rejected");

      // SPEC §Finals Release: if ALL brovas rejected (none ever accepted),
      // finals stay waiting_for_acceptance indefinitely.
      expect((await pick(tx, finalId)).piece_stage).toBe("waiting_for_acceptance");
    });
  });

  it("SPEC: full-order cancel ⇒ checkout_status cancelled; garments NOT auto-discarded", async () => {
    await inRolledBackTx(async (tx) => {
      // Full-order cancel: updateOrder({ checkout_status: 'cancelled' }, orderId)
      // (apps/pos-interface/src/components/forms/customer-demographics/
      //  pending-orders-dialog.tsx:200). Direct orders UPDATE only — no garment touch.
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }, { garment_type: "final" }],
        { paid: 84 },
      );
      const stageBefore = garments.map((g) => g.piece_stage);
      await wf.cancelOrder(tx, orderId);
      const o = await wf.getOrder(tx, orderId);
      expect(o.checkout_status).toBe("cancelled");
      // SPEC §Cancellation: garments are NOT auto-discarded on full-order cancel.
      const gs = await wf.getGarments(tx, orderId);
      gs.forEach((g, i) => expect(g.piece_stage).toBe(stageBefore[i]));
    });
  });

  it("SPEC: refund full amount ⇒ paid 0; re-pay partial ⇒ paid equals new amount", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final", fabric_price: 15, stitching_price: 10, style_price: 3 }],
        { paid: 84 },
      );
      await wf.recordPayment(tx, orderId, 84, {
        refund: {
          reason: "customer changed mind",
          items: [
            {
              garment_id: (await wf.getGarments(tx, orderId))[0]!.id,
              fabric: true,
              stitching: true,
              style: true,
              amount: 84,
            },
          ],
        },
      });
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(0);

      await wf.recordPayment(tx, orderId, 50);
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(50);
    });
  });

  it("SPEC: toggle_home_delivery on then off ⇒ order_total back to original, home_delivery false", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      const before = await wf.getOrder(tx, orderId);
      const originalTotal = Number(before.order_total);

      await wf.toggleHomeDelivery(tx, orderId, true);
      const withDelivery = await wf.getOrder(tx, orderId);
      expect(Number(withDelivery.order_total)).toBeGreaterThan(originalTotal);
      expect(withDelivery.home_delivery).toBe(true);

      await wf.toggleHomeDelivery(tx, orderId, false);
      const afterToggleOff = await wf.getOrder(tx, orderId);
      expect(Number(afterToggleOff.order_total)).toBe(originalTotal);
      expect(afterToggleOff.home_delivery).toBe(false);
    });
  });

  it("SPEC: isAlteration / getAlterationNumber COALESCE semantics (pure unit guards)", () => {
    // null trip_number COALESCEs to 1 (pre-dispatch or missing) → not an alteration.
    expect(isAlteration(null)).toBe(false);
    expect(isAlteration(undefined)).toBe(false);
    expect(isAlteration(1)).toBe(false);
    // Trip 2 = first alteration cycle.
    expect(isAlteration(2)).toBe(true);
    expect(getAlterationNumber(2)).toBe(1);
    // Trip N → alteration #(N-1), no cap.
    expect(getAlterationNumber(5)).toBe(4);
    expect(getAlterationNumber(1)).toBe(null);
  });
});

describe("QC iterative rework loop — multi-round (CLAUDE.md §QC Fail rework)", () => {
  it("SPEC: 3-round loop: fail(2 keys) → fail(1 key) → pass(0); trip never increments; attempt breadcrumb shrinks 2→1→0; out-of-scope key immune", async () => {
    await inRolledBackTx(async (tx) => {
      // ── Setup: single final garment ──────────────────────────────────────
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      const id = oneId(garments, "final");
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [id], { start: true });
      await wf.runProduction(tx, [id]); // → quality_check

      // Expected measurements used for QC comparison (inline, matches existing pattern).
      const expectedMeasurements = { shoulder: 20, chest_full: 50, sleeve_length: 25 };

      // ── Round 1: all 3 measurement keys in scope; 2 fail, 1 passes ───────
      // Additionally, set an out-of-scope quality key wrong — proves it never bleeds in.
      const round1Keys = new Set(["shoulder", "chest_full", "sleeve_length"]);
      const r1 = await wf.submitQcReal(tx, id, {
        expectedMeasurements,
        inputs: {
          measurements: {
            shoulder: 21.0,     // +1.0" → fail (> 0.125" tolerance)
            chest_full: 50.05,  // +0.05" → PASS (within tolerance)
            sleeve_length: 26.0, // +1.0" → fail
          },
          options: {},
          quality_ratings: {},
        },
        enabledKeys: round1Keys,
        returnStagesOnFail: ["sewing", "finishing"],
      });

      // SPEC: 2 measurements failed.
      expect(r1.result).toBe("fail");
      expect(r1.failedKeys).toHaveLength(2);
      expect(r1.failedKeys).toContain("shoulder");
      expect(r1.failedKeys).toContain("sleeve_length");
      expect(r1.failedKeys).not.toContain("chest_full");

      let g = await pick(tx, id);
      // SPEC: QC fail bounces garment to earliest return stage.
      expect(g.piece_stage).toBe("sewing");
      // SPEC: trip_number MUST NOT increment on QC fail.
      expect(g.trip_number).toBe(1);

      // ── Round 2: narrow to round-1 failedKeys via the real shared fn ─────
      // Also deliberately set chest_full (previously passing) to a wrong value.
      // It must be ignored because it is not in the narrowed enabledKeys.
      const lastAttempt1 = g.trip_history?.find((h) => h.trip === 1)?.qc_attempts?.at(-1);
      const round2Keys = deriveReworkEnabledKeys(lastAttempt1);
      // Confirm the function derived exactly the 2 failed keys from round 1.
      expect(round2Keys).toEqual(new Set(["shoulder", "sleeve_length"]));

      await wf.runProduction(tx, [id]); // rework → back to quality_check

      const r2 = await wf.submitQcReal(tx, id, {
        expectedMeasurements,
        inputs: {
          measurements: {
            shoulder: 21.0,      // still wrong → fail
            sleeve_length: 25.0, // fixed → pass
            chest_full: 55.0,    // deliberately wrong BUT out of scope → must not fail
          },
          options: {},
          quality_ratings: {},
        },
        enabledKeys: round2Keys,
        returnStagesOnFail: ["sewing"],
      });

      // SPEC: only the still-wrong in-scope key fails; out-of-scope chest_full is ignored.
      expect(r2.result).toBe("fail");
      expect(r2.failedKeys).toHaveLength(1);
      expect(r2.failedKeys).toContain("shoulder");
      expect(r2.failedKeys).not.toContain("sleeve_length"); // fixed
      expect(r2.failedKeys).not.toContain("chest_full");    // out-of-scope: immune

      g = await pick(tx, id);
      expect(g.piece_stage).toBe("sewing");
      // SPEC: trip still 1 after second fail.
      expect(g.trip_number).toBe(1);

      // ── Round 3: narrow from round-2 failedKeys; fix the last key ────────
      const lastAttempt2 = g.trip_history?.find((h) => h.trip === 1)?.qc_attempts?.at(-1);
      const round3Keys = deriveReworkEnabledKeys(lastAttempt2);
      expect(round3Keys).toEqual(new Set(["shoulder"]));

      await wf.runProduction(tx, [id]); // rework → back to quality_check

      const r3 = await wf.submitQcReal(tx, id, {
        expectedMeasurements,
        inputs: {
          measurements: { shoulder: 20.05 }, // within ±0.125" → pass
          options: {},
          quality_ratings: {},
        },
        enabledKeys: round3Keys,
      });

      // SPEC: zero failures → pass.
      expect(r3.result).toBe("pass");
      expect(r3.failedKeys).toHaveLength(0);

      g = await pick(tx, id);
      // SPEC: pass → piece_stage ready_for_dispatch.
      expect(g.piece_stage).toBe("ready_for_dispatch");
      // SPEC: qc_rework_stages cleared on pass.
      expect(g.qc_rework_stages).toBeNull();
      // SPEC: trip_number never incremented through all 3 rounds.
      expect(g.trip_number).toBe(1);

      // ── Assert trip_history breadcrumb ───────────────────────────────────
      const tripEntry = g.trip_history?.find((h) => h.trip === 1);
      expect(tripEntry).toBeDefined();
      const attempts = tripEntry?.qc_attempts ?? [];
      // SPEC: exactly 3 attempts in trip 1.
      expect(attempts).toHaveLength(3);

      // attempt_number is sequential 1, 2, 3.
      expect(attempts[0]?.attempt_number).toBe(1);
      expect(attempts[1]?.attempt_number).toBe(2);
      expect(attempts[2]?.attempt_number).toBe(3);

      // failed_* breadcrumb shrinks: 2 → 1 → 0 (quality always empty here).
      const totalFailed = (a: (typeof attempts)[number]) =>
        (a.failed_measurements?.length ?? 0) +
        (a.failed_options?.length ?? 0) +
        (a.failed_quality?.length ?? 0);
      expect(totalFailed(attempts[0]!)).toBe(2);
      expect(totalFailed(attempts[1]!)).toBe(1);
      expect(totalFailed(attempts[2]!)).toBe(0);

      // results: fail, fail, pass.
      expect(attempts[0]?.result).toBe("fail");
      expect(attempts[1]?.result).toBe("fail");
      expect(attempts[2]?.result).toBe("pass");
    });
  });
});

describe("order phase rollup (CLAUDE.md §Order-Level Phase)", () => {
  it("SPEC: 9 completed + 1 discarded ⇒ order_phase completed (discarded is terminal)", async () => {
    await inRolledBackTx(async (tx) => {
      const specs = Array.from({ length: 10 }, () => ({
        garment_type: "final" as const,
      }));
      const { orderId, garments } = await wf.createWorkOrder(tx, specs, {
        paid: 84,
      });
      const ids = allIds(garments);
      const victim = ids[0];
      if (victim === undefined) throw new Error("need garments");
      await toShop(tx, orderId, ids);
      await wf.recordPayment(tx, orderId, 28, {
        refund: {
          reason: "one cancelled",
          items: [
            {
              garment_id: victim,
              fabric: true,
              stitching: true,
              style: true,
              amount: 28,
            },
          ],
        },
      });
      await wf.collectGarments(tx, orderId, ids.slice(1));
      const gs = await wf.getGarments(tx, orderId);
      expect(gs.filter((x) => x.piece_stage === "discarded")).toHaveLength(1);
      expect(gs.filter((x) => x.piece_stage === "completed")).toHaveLength(9);
      expect((await wf.getOrder(tx, orderId)).order_phase).toBe("completed");
    });
  });
});
