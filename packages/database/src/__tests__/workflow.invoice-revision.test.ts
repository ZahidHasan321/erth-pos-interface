/**
 * Invoice revision = signed-invoice CONTENT changes — SPEC AS ORACLE (SPEC §3).
 *
 * Confirmation issues the invoice at revision 0 — the ORIGINAL invoice the
 * customer is given and signs. A PLAIN payment (advance / installment / full)
 * records a payment_transaction but does NOT mint a revision: paying does not
 * change the invoice. A revision is minted whenever the CONTENT of the signed
 * invoice changes on a confirmed order — not only its total:
 *   • a refund (record_payment_transaction, transaction_type = 'refund');
 *   • a brova-trial style reprice that MOVES order_total (reprice_order_styles);
 *   • a brova-trial style change at UNCHANGED price (bump_invoice_revision) —
 *     "revised invoice but no delta in price"; and
 *   • a delivery-TYPE change, home <-> pickup (toggle_home_delivery).
 * Each bump is idempotent (a replayed RPC must not double-bump) and a no-op
 * change (a same-total reprice, or a delivery toggle to the value already set)
 * does not bump.
 *
 * Every expected value derives from that spec rule and the idempotency property
 * — never from the RPC body. createWorkOrder confirms an order with
 * order_total=84, style_charge=9 (3 garments × style snapshot 3), home_delivery
 * = false, paid = 0.
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

const SPECS: wf.GarmentSpec[] = [
  { garment_type: "brova" },
  { garment_type: "final" },
  { garment_type: "final" },
];

const REFUND_KEY = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const REPRICE_KEY = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const BUMP_KEY = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

async function revOf(tx: Tx, orderId: number): Promise<number> {
  return wf.getInvoiceRevision(tx, orderId);
}

describe("invoice revision — signed-invoice content changes (§3)", () => {
  it("confirmation issues the original at revision 0; plain payments never bump", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, SPECS);
      expect(await revOf(tx, orderId)).toBe(0); // the original invoice

      await wf.recordPayment(tx, orderId, 40); // advance
      expect(await revOf(tx, orderId)).toBe(0);

      await wf.recordPayment(tx, orderId, 44); // settles the 84 balance
      expect(await revOf(tx, orderId)).toBe(0); // still the original, not "-R1"
    });
  });

  it("a refund mints a revision (0 → 1)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, SPECS);
      await wf.recordPayment(tx, orderId, 84); // full
      expect(await revOf(tx, orderId)).toBe(0);

      // Refund garment 0's style component (3 KWD) — a price change.
      await wf.recordPayment(tx, orderId, 3, {
        refund: {
          reason: "customer changed mind on style",
          items: [{ garment_id: garments[0]!.id, style: true, amount: 3 }],
        },
      });
      expect(await revOf(tx, orderId)).toBe(1);
    });
  });

  it("a refund replay (same idempotency key) bumps the revision exactly once", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, SPECS);
      await wf.recordPayment(tx, orderId, 84);

      const refund = {
        refund: {
          reason: "lost-response replay",
          items: [{ garment_id: garments[0]!.id, style: true, amount: 3 }],
        },
        idempotencyKey: REFUND_KEY,
      };
      await wf.recordPayment(tx, orderId, 3, refund);
      await wf.recordPayment(tx, orderId, 3, refund); // retried with same key
      expect(await revOf(tx, orderId)).toBe(1); // single bump, not 2
    });
  });

  it("a style reprice that moves the total mints a revision; a no-op reprice does not; a replay bumps once", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, SPECS);
      expect(await revOf(tx, orderId)).toBe(0);

      // Style 3 → 5 (+2): order_total 84 → 86 — a price change.
      await wf.repriceOrderStyles(tx, orderId, {
        garments: [{ garment_id: garments[0]!.id, style_price_snapshot: 5 }],
        newStyleCharge: 11,
        newOrderTotal: 86,
      });
      expect(await revOf(tx, orderId)).toBe(1);

      // No-op reprice: same snapshot, same total (86) → no new revision.
      await wf.repriceOrderStyles(tx, orderId, {
        garments: [{ garment_id: garments[0]!.id, style_price_snapshot: 5 }],
        newStyleCharge: 11,
        newOrderTotal: 86,
      });
      expect(await revOf(tx, orderId)).toBe(1);

      // A real reprice (86 → 88) and its lost-response replay (same key) net to
      // a single additional bump.
      const reprice = {
        garments: [{ garment_id: garments[0]!.id, style_price_snapshot: 7 }],
        newStyleCharge: 13,
        newOrderTotal: 88,
        idempotencyKey: REPRICE_KEY,
      };
      await wf.repriceOrderStyles(tx, orderId, reprice);
      await wf.repriceOrderStyles(tx, orderId, reprice);
      expect(await revOf(tx, orderId)).toBe(2);
    });
  });

  it("a style change with no price move mints a revision (revised invoice, no price delta)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, SPECS);
      expect(await revOf(tx, orderId)).toBe(0);

      // The feedback flow calls this when it wrote a style-spec change the
      // reprice found no price delta for (flat qallabi/designer, net-zero edit).
      await wf.bumpInvoiceRevision(tx, orderId, { reason: "flat-style swap" });
      expect(await revOf(tx, orderId)).toBe(1);
    });
  });

  it("a bump_invoice_revision replay (same idempotency key) bumps exactly once", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, SPECS);

      const bump = { reason: "lost-response replay", idempotencyKey: BUMP_KEY };
      await wf.bumpInvoiceRevision(tx, orderId, bump);
      await wf.bumpInvoiceRevision(tx, orderId, bump); // retried with same key
      expect(await revOf(tx, orderId)).toBe(1); // single bump, not 2
    });
  });

  it("a delivery-TYPE change mints a revision each way; a no-op toggle does not", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, SPECS); // home_delivery = false
      expect(await revOf(tx, orderId)).toBe(0);

      await wf.toggleHomeDelivery(tx, orderId, true); // pickup → home: a real change
      expect(await revOf(tx, orderId)).toBe(1);

      await wf.toggleHomeDelivery(tx, orderId, false); // home → pickup: a real change
      expect(await revOf(tx, orderId)).toBe(2);

      await wf.toggleHomeDelivery(tx, orderId, false); // already pickup: no-op
      expect(await revOf(tx, orderId)).toBe(2); // unchanged
    });
  });
});
