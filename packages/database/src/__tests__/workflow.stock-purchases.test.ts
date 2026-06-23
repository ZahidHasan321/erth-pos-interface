/**
 * Stock-purchase payables + WAC suite — SPEC AS ORACLE.
 *
 * Every expected value here is derived from a UNIVERSAL identity or a codified
 * SPEC/CLAUDE.md rule — NEVER transcribed from the restock_item /
 * pay_stock_purchase implementation in triggers.sql. The oracles are:
 *
 *  (a) Weighted-average cost (WAC) is definitional: after blending a delivery of
 *      `qty` units at `unit_cost` into `old_qty` units carried at `old_avg`, the
 *      new basis is (old_qty·old_avg + qty·unit_cost)/(old_qty+qty). Opening
 *      stock with no known cost (avg_cost NULL) has no basis, so the first costed
 *      restock SEEDS the basis to its unit_cost (SPEC §4 "Cost basis").
 *  (b) A payable's settled amount = Σ of its settlements; it is `paid` once that
 *      reaches its total_cost, `partially_paid` while between, `unpaid` at zero
 *      (SPEC §3 — mirrors the orders.paid identity).
 *  (c) total_cost of a purchase = qty × unit_cost (frozen at purchase).
 *  (d) The universal cash-drawer identity (CLAUDE.md §EOD): a CASH purchase
 *      settlement is a payout, so it lowers expected_cash by exactly its amount;
 *      a non-cash settlement never touches the drawer.
 *
 * restock_item / pay_stock_purchase / get_stock_purchases / the sync trigger in
 * triggers.sql merely IMPLEMENT (a)-(d). A failing assertion is a bug in the
 * RPC/trigger, never a test to relax.
 *
 * Each test runs in a rolled-back transaction off the global seed (FABRIC_A_ID:
 * shop_stock 1000, price_per_meter 5, avg_cost NULL; one open ERTH register,
 * float 0, opened by CASHIER).
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, only, tryInSavepoint, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";
import { FABRIC_A_ID, SHELF_A_ID } from "../../scripts/lifecycle/fixtures";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

async function sessionId(tx: Tx): Promise<number> {
  const s = await wf.getRegisterSession(tx);
  if (!s || s.id == null) throw new Error("no register session for BRAND");
  return Number(s.id);
}

interface PurchaseRow {
  id: number;
  status: string;
  qty: string | number;
  unit_cost: string | number;
  total_cost: string | number;
  amount_paid: string | number;
  stock_movement_id: number | null;
  brand: string;
}

async function purchaseRow(tx: Tx, id: number): Promise<PurchaseRow> {
  return only(
    await tx`SELECT id, status, qty, unit_cost, total_cost, amount_paid, stock_movement_id, brand
             FROM stock_purchases WHERE id = ${id}`,
    `stock_purchases ${id}`,
  ) as unknown as PurchaseRow;
}

async function paymentCount(tx: Tx, purchaseId: number): Promise<number> {
  const r = only(
    await tx`SELECT COUNT(*)::int AS n FROM stock_purchase_payments WHERE purchase_id = ${purchaseId}`,
    "stock_purchase_payments count",
  ) as unknown as { n: number };
  return r.n;
}

// ════════════════════════════════════════════════════════════════════════════

describe("weighted-average cost (SPEC §4 cost basis; WAC is definitional)", () => {
  it("SPEC: first costed restock SEEDS avg_cost; a second blends by the WAC identity", async () => {
    await inRolledBackTx(async (tx) => {
      // Opening stock 1000 @ unknown cost (avg_cost NULL). SPEC §4: the first
      // costed restock seeds the basis to its unit_cost (no prior basis to blend).
      const r1 = await wf.restock(tx, { itemId: FABRIC_A_ID, qty: 100, unitCost: 5 });
      expect(Number(r1.avg_cost)).toBe(5);
      expect(Number(await wf.getItemAvgCost(tx, "fabric", FABRIC_A_ID))).toBe(5);

      // Now 1100 @ 5 blended with 100 @ 10 ⇒ (1100·5 + 100·10)/1200 = 5.41666…
      // Universal WAC identity — independent of how the RPC computes it.
      const r2 = await wf.restock(tx, { itemId: FABRIC_A_ID, qty: 100, unitCost: 10 });
      const expected = (1100 * 5 + 100 * 10) / 1200;
      expect(Number(r2.avg_cost)).toBeCloseTo(expected, 2);
      expect(Number(await wf.getItemAvgCost(tx, "fabric", FABRIC_A_ID))).toBeCloseTo(expected, 2);
    });
  });

  it("SPEC: shop fabric/shelf restock without a unit cost is rejected (it creates a payable)", async () => {
    await inRolledBackTx(async (tx) => {
      // SPEC §3/§4: a shop fabric/shelf restock spends money ⇒ a cost is required.
      const err = await tryInSavepoint(tx, (sp) =>
        wf.restock(sp, { itemId: FABRIC_A_ID, qty: 10, unitCost: null }),
      );
      expect(err).not.toBeNull();
      expect(String(err)).toMatch(/unit cost is required/i);
    });
  });
});

describe("payable creation (SPEC §3; total = qty × unit_cost)", () => {
  it("SPEC: a costed shop restock mints an UNPAID payable linked to its restock movement", async () => {
    await inRolledBackTx(async (tx) => {
      const r = await wf.restock(tx, { itemId: FABRIC_A_ID, qty: 20, unitCost: 7 });
      expect(r.purchase_id).not.toBeNull();
      // (c) total_cost = qty × unit_cost = 20 × 7 = 140.
      expect(Number(r.total_cost)).toBe(140);

      const p = await purchaseRow(tx, r.purchase_id!);
      expect(p.status).toBe("unpaid");
      expect(Number(p.amount_paid)).toBe(0);
      expect(Number(p.qty)).toBe(20);
      expect(Number(p.unit_cost)).toBe(7);
      expect(Number(p.total_cost)).toBe(140);
      expect(p.brand).toBe("ERTH");
      expect(p.stock_movement_id).not.toBeNull();

      // The linked movement is the +20 restock just logged.
      const mv = only(
        await tx`SELECT movement_type, qty_delta FROM stock_movements WHERE id = ${p.stock_movement_id}`,
        "linked movement",
      ) as unknown as { movement_type: string; qty_delta: string };
      expect(mv.movement_type).toBe("restock");
      expect(Number(mv.qty_delta)).toBe(20);

      // SPEC: the open queue surfaces it; the paid filter does not.
      const open = await wf.getStockPurchases(tx, { filter: "open" });
      expect(open.some((row) => Number(row.id) === r.purchase_id)).toBe(true);
      const paid = await wf.getStockPurchases(tx, { filter: "paid" });
      expect(paid.some((row) => Number(row.id) === r.purchase_id)).toBe(false);
    });
  });
});

describe("settlement (SPEC §3; amount_paid = Σ settlements, mirrors orders.paid)", () => {
  it("SPEC: full payment ⇒ paid; partial ⇒ partially_paid; remainder ⇒ paid; overpay rejected", async () => {
    await inRolledBackTx(async (tx) => {
      // Fund the drawer first so cash payouts have cash to draw (a cash payout
      // can't exceed the drawer balance — same rule as add_cash_movement).
      const { orderId } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      await wf.recordPayment(tx, orderId, 100);
      const sid = await sessionId(tx);

      const r = await wf.restock(tx, { itemId: FABRIC_A_ID, qty: 10, unitCost: 5 }); // total 50
      const pid = r.purchase_id!;

      // Partial 20 ⇒ partially_paid, amount_paid 20 (identity (b)).
      const a = await wf.payStockPurchase(tx, pid, 20, { sessionId: sid });
      expect(a.status).toBe("partially_paid");
      expect(Number(a.amount_paid)).toBe(20);

      // Remainder 30 ⇒ paid, amount_paid 50.
      const b = await wf.payStockPurchase(tx, pid, 30, { sessionId: sid });
      expect(b.status).toBe("paid");
      expect(Number(b.amount_paid)).toBe(50);
      expect(Number((await purchaseRow(tx, pid)).amount_paid)).toBe(50);

      // SPEC: no overpayment past the remaining balance (now 0).
      const err = await tryInSavepoint(tx, (sp) =>
        wf.payStockPurchase(sp, pid, 1, { sessionId: sid }),
      );
      expect(err).not.toBeNull();
      expect(String(err)).toMatch(/exceeds the remaining balance/i);
    });
  });

  it("SPEC: settlement is idempotent — same key twice ⇒ ONE payment row, amount_paid unchanged", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      await wf.recordPayment(tx, orderId, 60);
      const sid = await sessionId(tx);

      const r = await wf.restock(tx, { itemId: FABRIC_A_ID, qty: 10, unitCost: 5 }); // total 50
      const pid = r.purchase_id!;
      const key = "22222222-2222-2222-2222-222222222222";

      const first = await wf.payStockPurchase(tx, pid, 50, { sessionId: sid, idempotencyKey: key });
      const second = await wf.payStockPurchase(tx, pid, 50, { sessionId: sid, idempotencyKey: key });

      // SPEC: replay returns the original result and writes NO second row.
      expect(Number(first.amount_paid)).toBe(50);
      expect(Number(second.amount_paid)).toBe(50);
      expect(second.status).toBe(first.status);
      expect(await paymentCount(tx, pid)).toBe(1);
      expect(Number((await purchaseRow(tx, pid)).amount_paid)).toBe(50);
    });
  });
});

describe("drawer reconciliation (CLAUDE.md §EOD; cash-drawer identity)", () => {
  it("SPEC: a CASH settlement lowers expected_cash; a non-cash settlement does not", async () => {
    await inRolledBackTx(async (tx) => {
      // Fund the drawer: a 100 cash customer payment.
      const { orderId } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      await wf.recordPayment(tx, orderId, 100);
      const sid = await sessionId(tx);

      // Purchase p1 paid in CASH (40) ⇒ drawer cash_out 40.
      const r1 = await wf.restock(tx, { itemId: FABRIC_A_ID, qty: 8, unitCost: 5 }); // 40
      const c1 = await wf.payStockPurchase(tx, r1.purchase_id!, 40, { sessionId: sid, paymentType: "cash" });
      expect(c1.cash_movement_id).not.toBeNull();

      // Purchase p2 paid by BANK TRANSFER (40) ⇒ no drawer movement.
      const r2 = await wf.restock(tx, { itemId: SHELF_A_ID, itemType: "shelf", qty: 40, unitCost: 1 }); // 40
      const c2 = await wf.payStockPurchase(tx, r2.purchase_id!, 40, { paymentType: "bank_transfer" });
      expect(c2.status).toBe("paid");
      expect(c2.cash_movement_id).toBeNull();

      // Cash-drawer identity: float 0 + 100 received − 0 refunded + 0 in − 40 out
      // ⇒ drawer holds 60. Only the CASH purchase payout (40) is a cash_out; the
      // bank transfer never touched the drawer. counted 60 ⇒ variance 0.
      const res = await wf.closeRegister(tx, sid, 60);
      expect(Number(res.cash_payments)).toBe(100);
      expect(Number(res.cash_out)).toBe(40);
      expect(Number(res.expected_cash)).toBe(60);
      expect(Number(res.variance)).toBe(0);
    });
  });

  it("SPEC: a cash settlement needs an open register and cannot overdraw the drawer", async () => {
    await inRolledBackTx(async (tx) => {
      const r = await wf.restock(tx, { itemId: FABRIC_A_ID, qty: 10, unitCost: 5 }); // 50
      const pid = r.purchase_id!;

      // No session id ⇒ a cash payout is rejected (it must reconcile at EOD).
      const noSession = await tryInSavepoint(tx, (sp) =>
        wf.payStockPurchase(sp, pid, 50, { paymentType: "cash", sessionId: null }),
      );
      expect(noSession).not.toBeNull();
      expect(String(noSession)).toMatch(/requires an open register/i);

      // Drawer is empty (float 0, no cash taken) ⇒ a 50 cash payout overdraws it.
      const sid = await sessionId(tx);
      const overdraw = await tryInSavepoint(tx, (sp) =>
        wf.payStockPurchase(sp, pid, 50, { paymentType: "cash", sessionId: sid }),
      );
      expect(overdraw).not.toBeNull();
      expect(String(overdraw)).toMatch(/exceeds drawer balance/i);
    });
  });
});
