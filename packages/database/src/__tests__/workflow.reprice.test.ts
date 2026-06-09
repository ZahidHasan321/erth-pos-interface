/**
 * Brova-trial style reprice — SPEC AS ORACLE (SPEC §2.5).
 *
 * A style change at the brova trial recomputes the style component and rolls it
 * into the per-garment style snapshots, work_orders.style_charge, and
 * orders.order_total — moving the customer's balance. The reprice is AUDIT-ONLY:
 *
 *   • It NEVER touches orders.paid (owned by sync_order_paid_from_transactions).
 *   • It writes the TRUE new total even below the amount already paid (unlike
 *     update_order_discount, which blocks) — the credit is a manual cashier
 *     refund (§2.6).
 *   • Only the STYLE component moves; fabric/stitching are untouched.
 *   • Absolute-assignment + idem key ⇒ a replay produces a single net effect.
 *
 * Every expected value derives from the accounting invariant
 *   newOrderTotal = oldOrderTotal + Σ(newSnapshot − oldSnapshot)
 * and the `paid`-immutability rule — never from the RPC body.
 *
 * Each test runs in a rolled-back transaction; committed reference data is
 * untouched. createWorkOrder confirms an order with order_total=84,
 * style_charge=9 (3 garments × style snapshot 3).
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, only, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

const KEY = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const KEY_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const SPECS: wf.GarmentSpec[] = [
  { garment_type: "brova" },
  { garment_type: "final" },
  { garment_type: "final" },
];

async function paidOf(tx: Tx, orderId: number): Promise<number> {
  return Number((await wf.getOrder(tx, orderId)).paid) || 0;
}
async function totalOf(tx: Tx, orderId: number): Promise<number> {
  return Number((await wf.getOrder(tx, orderId)).order_total) || 0;
}

describe("reprice_order_styles — brova-trial style reprice (§2.5)", () => {
  it("reprice UP: moves only the targeted snapshot + style_charge + order_total; paid untouched", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, SPECS);
      await wf.recordPayment(tx, orderId, 40);

      expect(await totalOf(tx, orderId)).toBe(84);
      expect(await wf.getStyleCharge(tx, orderId)).toBe(9);
      expect(await paidOf(tx, orderId)).toBe(40);

      // Garment 0's style price 3 → 5 (+2).
      await wf.repriceOrderStyles(tx, orderId, {
        garments: [{ garment_id: garments[0]!.id, style_price_snapshot: 5 }],
        newStyleCharge: 11, // 9 − 3 + 5
        newOrderTotal: 86, // 84 + 2
      });

      const snaps = await wf.getStyleSnapshots(tx, orderId);
      expect(snaps[garments[0]!.garment_id]).toBe(5);
      // Per-garment independence: the other two are untouched.
      expect(snaps[garments[1]!.garment_id]).toBe(3);
      expect(snaps[garments[2]!.garment_id]).toBe(3);

      expect(await wf.getStyleCharge(tx, orderId)).toBe(11);
      expect(await totalOf(tx, orderId)).toBe(86);
      // paid is NEVER touched by a reprice.
      expect(await paidOf(tx, orderId)).toBe(40);
      // New balance the cashier collects = 86 − 40.
      expect((await totalOf(tx, orderId)) - (await paidOf(tx, orderId))).toBe(46);
    });
  });

  it("reprice DOWN below paid: succeeds (no block), writes the true lower total, leaves a credit", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, SPECS);
      await wf.recordPayment(tx, orderId, 84); // fully paid

      // Garment 0's style price 3 → 1 (−2): total 84 → 82, BELOW the 84 paid.
      const res = await wf.repriceOrderStyles(tx, orderId, {
        garments: [{ garment_id: garments[0]!.id, style_price_snapshot: 1 }],
        newStyleCharge: 7,
        newOrderTotal: 82,
      });
      expect((res as { status: string }).status).toBe("success");

      expect(await totalOf(tx, orderId)).toBe(82);
      expect(await paidOf(tx, orderId)).toBe(84); // immutable
      // Negative balance = overpayment / credit (manual cashier refund, §2.6).
      expect((await totalOf(tx, orderId)) - (await paidOf(tx, orderId))).toBe(-2);
    });
  });

  it("idempotent: same key replayed → a single net effect", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, SPECS);
      const args = {
        garments: [{ garment_id: garments[0]!.id, style_price_snapshot: 5 }],
        newStyleCharge: 11,
        newOrderTotal: 86,
        idempotencyKey: KEY,
      };
      await wf.repriceOrderStyles(tx, orderId, args);
      await wf.repriceOrderStyles(tx, orderId, args); // replay

      expect(await totalOf(tx, orderId)).toBe(86);
      expect(await wf.getStyleCharge(tx, orderId)).toBe(11);
      expect((await wf.getStyleSnapshots(tx, orderId))[garments[0]!.garment_id]).toBe(5);
    });
  });

  it("absolute assignment: a different key with the SAME target converges (no double-apply)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, SPECS);
      await wf.repriceOrderStyles(tx, orderId, {
        garments: [{ garment_id: garments[0]!.id, style_price_snapshot: 5 }],
        newStyleCharge: 11,
        newOrderTotal: 86,
        idempotencyKey: KEY,
      });
      // A fresh submit (new key) with the SAME absolute target re-asserts, not adds.
      await wf.repriceOrderStyles(tx, orderId, {
        garments: [{ garment_id: garments[0]!.id, style_price_snapshot: 5 }],
        newStyleCharge: 11,
        newOrderTotal: 86,
        idempotencyKey: KEY_B,
      });
      expect(await totalOf(tx, orderId)).toBe(86);
      expect(await wf.getStyleCharge(tx, orderId)).toBe(11);
    });
  });
});
