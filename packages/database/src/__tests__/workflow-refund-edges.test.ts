/**
 * Refund edge cases — CLAUDE.md AS THE SINGLE SOURCE OF TRUTH.
 *
 * Companion to workflow.test.ts. Covers the refund edges the existing
 * "refund / cancellation" block does NOT exercise: refund after hand-over
 * (garment completed), refund mid-production, refund of the only brova at
 * trial, and refund while a garment is in transit. Plus a positive control
 * (refund at ready_for_pickup) and an order-phase interaction check.
 *
 * EVERY `expect` derives its expected value from a named rule in CLAUDE.md
 * §"Cancellation / Refund" (the codified edge rules amended at lines ~187-192)
 * or §"Order-Level Phase" — or a universal domain invariant. NO expected
 * value is sourced from triggers.sql. Each assertion carries a `// SPEC:`
 * comment naming the CLAUDE.md rule it encodes. A failing assertion means the
 * implementation violates the spec: a bug to fix, never a test to relax.
 *
 * triggers.sql is referenced ONLY as a suspected-bug location (where the code
 * that must change lives) — never as the origin of an expected value.
 *
 * Every test runs in a rolled-back transaction; reference data is untouched.
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, only, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";
import { FABRIC_A_ID } from "../../scripts/lifecycle/fixtures";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// ─── assertion-friendly accessors (mirrors workflow.test.ts:pick) ───────────

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

/** refunded_* flag row — not on GarmentRow, fetched raw. */
async function refundFlags(tx: Tx, id: string) {
  return only(
    await tx`
      SELECT refunded_fabric, refunded_stitching, refunded_style,
             refunded_express, refunded_soaking, start_time
      FROM garments WHERE id = ${id}`,
    `refund flags ${id}`,
  ) as unknown as {
    refunded_fabric: boolean;
    refunded_stitching: boolean;
    refunded_style: boolean;
    refunded_express: boolean;
    refunded_soaking: boolean;
    start_time: string | null;
  };
}

async function fabricStock(tx: Tx, fabricId: number) {
  return only(
    await tx`SELECT real_stock, shop_stock FROM fabrics WHERE id = ${fabricId}`,
    `fabric ${fabricId}`,
  ) as unknown as { real_stock: string; shop_stock: string };
}

function allIds(gs: wf.GarmentRow[]): string[] {
  return gs.map((x) => x.id);
}

/** Full per-garment refund: fabric+stitching+style true, matching amount. */
function fullRefund(garmentId: string, amount: number, fabricRestock = false) {
  return {
    reason: "customer cancelled the piece",
    items: [
      {
        garment_id: garmentId,
        fabric: true,
        stitching: true,
        style: true,
        ...(fabricRestock ? { fabric_restock: true } : {}),
        amount,
      },
    ],
  };
}

/** Workshop happy path → garments received at shop (mirrors workflow.test.ts:toShop). */
async function toShop(tx: Tx, orderId: number, ids: string[]) {
  await wf.dispatchOrder(tx, orderId);
  await wf.workshopReceive(tx, ids, { start: true });
  await wf.runProduction(tx, ids);
  for (const id of ids) await wf.submitQc(tx, id, { pass: true });
  await wf.workshopDispatch(tx, ids);
  await wf.shopReceive(tx, ids);
}

// Default per-garment price snapshot is 15+10+3 = 28 (driver.ts:178-180).
const GARMENT_PRICE = 28;

// ════════════════════════════════════════════════════════════════════════════

describe("refund edges (CLAUDE.md §Cancellation / Refund codified edge rules)", () => {
  // ── Scenario 1 ────────────────────────────────────────────────────────────
  it("CLAUDE.md §Cancellation 'Post-hand-over exception': refund of a completed garment ⇒ money + flags applied but piece_stage STAYS completed; no fabric restock", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }],
        { paid: GARMENT_PRICE },
      );
      const id = allIds(garments)[0]!;
      await toShop(tx, orderId, [id]);
      await wf.finalCollect(tx, id, { homeDelivery: false });
      expect((await pick(tx, id)).piece_stage).toBe("completed");

      const stockBefore = await fabricStock(tx, FABRIC_A_ID);
      const paidBefore = Number((await wf.getOrder(tx, orderId)).paid);

      // Full per-garment refund WITH fabric_restock requested.
      await wf.recordPayment(tx, orderId, GARMENT_PRICE, {
        refund: fullRefund(id, GARMENT_PRICE, true),
      });

      // SPEC: CLAUDE.md §Cancellation "Post-hand-over exception" — a full
      // refund of an already-completed garment refunds the money and sets the
      // refunded_* flags. This part of the rule holds regardless of stage.
      const flags = await refundFlags(tx, id);
      expect(flags.refunded_fabric).toBe(true);
      expect(flags.refunded_stitching).toBe(true);
      expect(flags.refunded_style).toBe(true);
      // SPEC: CLAUDE.md §Cancellation "Post-hand-over exception" — "refunds the
      // money (orders.paid drops)".
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(
        paidBefore - GARMENT_PRICE,
      );

      // SPEC: CLAUDE.md §Cancellation "Post-hand-over exception" — the garment
      // "stays completed — it is NOT discarded (you cannot un-deliver a
      // physical garment). Discard applies only when piece_stage NOT IN
      // (discarded, completed)."
      expect((await pick(tx, id)).piece_stage).toBe("completed");

      // SPEC: CLAUDE.md §Cancellation "Post-hand-over exception" —
      // "fabric-restock does not apply even if requested (the fabric is in the
      // customer's garment)". Stock columns must be unchanged.
      const stockAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockAfter.real_stock)).toBe(Number(stockBefore.real_stock));
      expect(Number(stockAfter.shop_stock)).toBe(Number(stockBefore.shop_stock));
    });
  });

  // ── Scenario 2 ────────────────────────────────────────────────────────────
  it("CLAUDE.md §Cancellation general rule + 'Refund-discard side-effects' + 'Per-garment isolation': refund mid-production ⇒ discarded, flags cleared, sibling untouched, order stays confirmed", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }, { garment_type: "final" }],
        { paid: GARMENT_PRICE * 2 },
      );
      const ids = allIds(garments);
      const victim = ids[0]!;
      const sibling = ids[1]!;

      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, ids, { start: true });
      await wf.runProductionTo(tx, [victim], "sewing");

      const v0 = await pick(tx, victim);
      expect(v0.piece_stage).toBe("sewing");
      expect(v0.in_production).toBe(true);
      expect(v0.location).toBe("workshop");

      await wf.recordPayment(tx, orderId, GARMENT_PRICE, {
        refund: fullRefund(victim, GARMENT_PRICE),
      });

      // SPEC: CLAUDE.md §Cancellation general rule — "full garment refund →
      // piece_stage: discarded" (the garment is not completed/discarded yet).
      const v = await pick(tx, victim);
      const vf = await refundFlags(tx, victim);
      expect(v.piece_stage).toBe("discarded");
      // SPEC: CLAUDE.md §Cancellation "Refund-discard side-effects" — "when a
      // refund discards a garment it also clears in_production=false,
      // start_time=NULL, feedback_status=NULL, acceptance_status=NULL".
      expect(v.in_production).toBe(false);
      expect(vf.start_time).toBeNull();
      expect(v.feedback_status).toBeNull();
      expect(v.acceptance_status).toBeNull();

      // SPEC: CLAUDE.md §Cancellation "Per-garment isolation" — "a refund
      // targeting one garment never mutates a sibling garment's stage or
      // refunded_* flags".
      const sib = await pick(tx, sibling);
      expect(sib.piece_stage).not.toBe("discarded");
      const sibFlags = await refundFlags(tx, sibling);
      expect(sibFlags.refunded_fabric).toBe(false);
      expect(sibFlags.refunded_stitching).toBe(false);
      expect(sibFlags.refunded_style).toBe(false);

      // SPEC: CLAUDE.md §Cancellation general rule — "Order stays confirmed"
      // (only a full-order cancel sets checkout_status: cancelled). Money:
      // orders.paid drops by the refunded amount.
      const o = await wf.getOrder(tx, orderId);
      expect(o.checkout_status).toBe("confirmed");
      expect(Number(o.paid)).toBe(GARMENT_PRICE * 2 - GARMENT_PRICE);
    });
  });

  // ── Scenario 6 (mid-production refund, order-phase interaction) ────────────
  it("CLAUDE.md §Order-Level Phase: after mid-production refund-discard, a still-active sibling keeps order_phase = 'in_progress'", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }, { garment_type: "final" }],
        { paid: GARMENT_PRICE * 2 },
      );
      const ids = allIds(garments);
      const victim = ids[0]!;
      const sibling = ids[1]!;

      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, ids, { start: true });
      await wf.runProductionTo(tx, [victim], "sewing");

      await wf.recordPayment(tx, orderId, GARMENT_PRICE, {
        refund: fullRefund(victim, GARMENT_PRICE),
      });

      // SPEC: CLAUDE.md §Cancellation general rule — "full garment refund →
      // piece_stage: discarded".
      expect((await pick(tx, victim)).piece_stage).toBe("discarded");
      // Sibling is still pre-/in-production, not terminal.
      const sib = await pick(tx, sibling);
      expect(["waiting_cut", "cutting", "sewing", "finishing", "ironing"]).toContain(
        sib.piece_stage,
      );

      // SPEC: CLAUDE.md §Order-Level Phase — order_phase 'completed' only when
      // ALL garments are terminal (completed/discarded); order_phase
      // 'in_progress' once "at least one garment beyond pre-dispatch". The
      // dispatched-and-sewing sibling makes the order in_progress, and the
      // single discard with a still-active sibling must NOT complete it.
      expect((await wf.getOrder(tx, orderId)).order_phase).toBe("in_progress");
    });
  });

  // ── Scenario 3 ────────────────────────────────────────────────────────────
  it("CLAUDE.md §Cancellation 'Orphaned-finals rule' (EXPECTED RED): refund-discarding the only brova ⇒ brova discarded, NO replacement, parked finals RELEASED waiting_for_acceptance→waiting_cut", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [
          { garment_type: "brova" },
          { garment_type: "final" },
          { garment_type: "final" },
        ],
        { paid: GARMENT_PRICE },
      );
      const brovaId = garments.find((g) => g.garment_type === "brova")!.id;
      const finalIds = garments
        .filter((g) => g.garment_type === "final")
        .map((g) => g.id);

      // Brova through production to shop; finals parked from creation.
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, allIds(garments), { start: true });
      await wf.runProduction(tx, [brovaId]);
      await wf.submitQc(tx, brovaId, { pass: true });
      await wf.workshopDispatch(tx, [brovaId]);
      await wf.shopReceive(tx, [brovaId]);

      expect((await pick(tx, brovaId)).piece_stage).toBe("awaiting_trial");
      for (const fId of finalIds) {
        expect((await pick(tx, fId)).piece_stage).toBe("waiting_for_acceptance");
      }

      // Full refund on the brova — NO brova feedback given first.
      await wf.recordPayment(tx, orderId, GARMENT_PRICE, {
        refund: fullRefund(brovaId, GARMENT_PRICE),
      });

      // SPEC: CLAUDE.md §Cancellation general rule — "full garment refund →
      // piece_stage: discarded" (awaiting_trial is not completed/discarded).
      const b = await pick(tx, brovaId);
      expect(b.piece_stage).toBe("discarded");

      // SPEC: CLAUDE.md §Cancellation "Orphaned-finals rule" — "Refund/discard
      // never auto-creates a replacement garment — replacement is a separate
      // manual workshop action (Reject-Redo path only)." So replaced_by stays
      // null and the order still has exactly its original 3 garments.
      expect(b.replaced_by_garment_id).toBeNull();
      const all = await wf.getGarments(tx, orderId);
      expect(all).toHaveLength(3); // brova + 2 finals, no clone

      // SPEC: CLAUDE.md §Cancellation "Orphaned-finals rule" (INTENDED;
      // EXPECTED RED until the code is fixed) — "refund-discarding the last
      // remaining brova on an order must release its parked finals
      // (waiting_for_acceptance → waiting_cut) so they are not permanently
      // orphaned." The only brova is gone; the finals MUST be freed. This red
      // is the deliverable — do not weaken or skip it.
      const finalStages = (
        await Promise.all(finalIds.map((fId) => pick(tx, fId)))
      ).map((g) => g.piece_stage);
      expect(
        finalStages,
        "CLAUDE.md §Cancellation 'Orphaned-finals rule': refund-discarding the last brova must release parked finals waiting_for_acceptance→waiting_cut",
      ).toEqual(["waiting_cut", "waiting_cut"]);
    });
  });

  // ── Scenario 4 ────────────────────────────────────────────────────────────
  it("CLAUDE.md §Cancellation general rule + 'Refund-discard side-effects' (location left as-is): refund while in transit ⇒ discarded, transit location retained", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }],
        { paid: GARMENT_PRICE },
      );
      const id = allIds(garments)[0]!;

      await wf.dispatchOrder(tx, orderId);
      const inTransit = await pick(tx, id);
      expect(inTransit.location).toBe("transit_to_workshop");
      expect(inTransit.trip_number).toBe(1);

      await wf.recordPayment(tx, orderId, GARMENT_PRICE, {
        refund: fullRefund(id, GARMENT_PRICE),
      });

      // SPEC: CLAUDE.md §Cancellation general rule — "full garment refund →
      // piece_stage: discarded". transit_to_workshop is not
      // completed/discarded, so the discard applies even mid-transfer.
      const g = await pick(tx, id);
      expect(g.piece_stage).toBe("discarded");

      // SPEC: CLAUDE.md §Cancellation "Refund-discard side-effects" — "The
      // garment's location is left as-is — a garment refund-discarded while
      // transit_to_* keeps its transit location and is dropped at the
      // receiving step (no location/ledger reconciliation; documented
      // behavior, not auto-fixed)."
      expect(g.location).toBe("transit_to_workshop");
    });
  });

  // ── Scenario 5: positive control ──────────────────────────────────────────
  it("CLAUDE.md §Cancellation general rule + 'Refund-discard side-effects': refund at ready_for_pickup ⇒ discarded, feedback/acceptance cleared, paid drops", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }],
        { paid: GARMENT_PRICE },
      );
      const id = allIds(garments)[0]!;
      await toShop(tx, orderId, [id]);
      expect((await pick(tx, id)).piece_stage).toBe("ready_for_pickup");

      await wf.recordPayment(tx, orderId, GARMENT_PRICE, {
        refund: fullRefund(id, GARMENT_PRICE),
      });

      // SPEC: CLAUDE.md §Cancellation general rule — "full garment refund →
      // piece_stage: discarded". ready_for_pickup is not completed/discarded,
      // so discard applies (the explicit contrast with scenario 1's
      // "Post-hand-over exception", which guards 'completed' out of discard).
      const g = await pick(tx, id);
      expect(g.piece_stage).toBe("discarded");
      // SPEC: CLAUDE.md §Cancellation "Refund-discard side-effects" — discard
      // clears feedback_status=NULL and acceptance_status=NULL.
      expect(g.feedback_status).toBeNull();
      expect(g.acceptance_status).toBeNull();
      // SPEC: CLAUDE.md §Cancellation general rule — "orders.paid drops via
      // trigger"; full refund of the only garment zeroes the balance.
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(0);
    });
  });
});
