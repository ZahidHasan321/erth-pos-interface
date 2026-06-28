/**
 * EOD / register-close suite — SPEC AS ORACLE.
 *
 * Every expected value in this file is derived from a UNIVERSAL accounting
 * identity or a codified CLAUDE.md rule — NEVER transcribed from the
 * close_register implementation in triggers.sql. The three oracles are:
 *
 *  (a) The universal cash-drawer identity. The cash physically in a drawer at
 *      close = opening float + everything received − everything paid out.
 *      Hence `expected_cash = opening_float + cash_payments − cash_refunds
 *      + cash_in − cash_out` and `variance = counted_cash − expected_cash`
 *      (negative = shortage). This is just bookkeeping arithmetic; it is true
 *      regardless of how any RPC computes it.
 *  (b) The universal net identity: `net = collected − refunded`. Definitional.
 *  (c) The codified CLAUDE.md "EOD / register close" rules (≈ CLAUDE.md
 *      lines 124+): cashier opens AND closes their own session; reopen is
 *      manager-only (sole manager gate); per-session attribution of
 *      payments/refunds; idempotent close (replay ⇒ original summary, NO extra
 *      audit event); append-only history (every close ⇒ a register_close_events
 *      row, register_sessions keeps only the LATEST close, reopen+reclose ⇒ +1
 *      event); frozen day rejects money (no open session ⇒
 *      record_payment_transaction rejected).
 *
 * `close_register` / `record_payment_transaction` / `get_eod_report` in
 * triggers.sql merely *implement* (a)–(c); the SQL is NEVER the source of
 * truth. A failing assertion means the implementation violates the identity or
 * the CLAUDE.md rule — a bug to fix in the RPC/trigger, never a test to relax,
 * skip, or `.fixme`.
 *
 * What is real vs mirrored:
 *  - DB RPCs + triggers run for real: record_payment_transaction,
 *    open_register, close_register, reopen_register, get_register_session,
 *    get_eod_report, the orders.paid sync trigger.  ← genuinely under test
 *  - Order setup uses the same createWorkOrder driver path the lifecycle suite
 *    uses (save_work_order_garments + complete_work_order RPCs).
 *
 * Every test runs in a transaction that is rolled back; the global-setup seed
 * (seed.ts:97 — ONE open ERTH register_sessions row, today, opening_float 0,
 * opened_by CASHIER) is the baseline each scenario starts from.
 *
 * Per-session attribution (scenario 2) is asserted because CLAUDE.md
 * §EOD codifies it: a cash payment recorded while a session is open counts
 * toward THAT session's reconciliation on close. If the implementation ever
 * stopped attributing the payment, expected_cash would no longer satisfy the
 * cash-drawer identity for that session — the assertion catches that.
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, only, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// ─── helpers ────────────────────────────────────────────────────────────────

/** Fetch the seeded open session's id via the real get_register_session RPC. */
async function sessionId(tx: Tx): Promise<number> {
  const s = await wf.getRegisterSession(tx);
  if (!s || s.id == null) throw new Error("no register session for BRAND");
  return Number(s.id);
}

interface SessionRow {
  id: number;
  status: string;
  opening_float: string | number;
  closing_counted_cash: string | number | null;
  expected_cash: string | number | null;
  variance: string | number | null;
}

async function sessionRow(tx: Tx, id: number): Promise<SessionRow> {
  return only(
    await tx`
      SELECT id, status, opening_float, closing_counted_cash,
             expected_cash, variance
      FROM register_sessions WHERE id = ${id}`,
    `register_sessions ${id}`,
  ) as unknown as SessionRow;
}

async function closeEventCount(tx: Tx, id: number): Promise<number> {
  const r = only(
    await tx`
      SELECT COUNT(*)::int AS n FROM register_close_events
      WHERE register_session_id = ${id}`,
    "register_close_events count",
  ) as unknown as { n: number };
  return r.n;
}

// ════════════════════════════════════════════════════════════════════════════

describe("register close — reconciliation (CLAUDE.md §EOD reconciliation; cash-drawer identity)", () => {
  it("SPEC: clean close, no activity ⇒ expected 0, variance 0, status closed, exactly ONE close event", async () => {
    await inRolledBackTx(async (tx) => {
      const id = await sessionId(tx);
      // SPEC: cash-drawer identity (CLAUDE.md §EOD reconciliation) — float 0,
      // nothing received, nothing paid out ⇒ drawer holds 0; counted 0 matches
      // ⇒ variance = 0 - 0 = 0.
      const res = await wf.closeRegister(tx, id, 0);
      expect(res.status).toBe("closed");
      expect(Number(res.expected_cash)).toBe(0);
      expect(Number(res.variance)).toBe(0);

      const row = await sessionRow(tx, id);
      expect(row.status).toBe("closed");
      expect(Number(row.expected_cash)).toBe(0);
      expect(Number(row.variance)).toBe(0);
      // SPEC: CLAUDE.md §EOD "Append-only history" — every close writes exactly
      // one register_close_events row.
      expect(await closeEventCount(tx, id)).toBe(1);
    });
  });

  it("SPEC: a cash payment recorded while the session is open is counted in expected_cash on close", async () => {
    await inRolledBackTx(async (tx) => {
      // Confirmed unpaid work order → cashier records a 28 cash payment.
      const { orderId } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      await wf.recordPayment(tx, orderId, 28);

      const id = await sessionId(tx);
      const res = await wf.closeRegister(tx, id, 28);

      // SPEC: cash-drawer identity (CLAUDE.md §EOD reconciliation) — float 0
      // + 28 cash received, nothing paid out ⇒ drawer holds 28; counted 28
      // matches ⇒ variance = 28 - 28 = 0. Per CLAUDE.md §EOD "Per-session
      // attribution", the 28 recorded while this session was open counts
      // toward THIS session. If attribution regressed the payment would be
      // unattributed → expected wrongly 0, variance -28 (violates the
      // identity). That would be the bug — do NOT weaken this assertion.
      expect(Number(res.cash_payments)).toBe(28);
      expect(Number(res.expected_cash)).toBe(28);
      expect(Number(res.variance)).toBe(0);

      const row = await sessionRow(tx, id);
      expect(Number(row.expected_cash)).toBe(28);
      expect(Number(row.variance)).toBe(0);
    });
  });

  it("SPEC: payment then refund nets correctly in expected_cash", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final", fabric_price: 30, stitching_price: 20 }],
        { paid: 0 },
      );
      await wf.recordPayment(tx, orderId, 50);
      await wf.recordPayment(tx, orderId, 20, {
        refund: {
          reason: "partial component refund",
          items: [{ garment_id: garments[0]!.id, stitching: true, amount: 20 }],
        },
      });

      const id = await sessionId(tx);
      const res = await wf.closeRegister(tx, id, 30);
      // SPEC: cash-drawer identity (CLAUDE.md §EOD reconciliation) — float 0
      // + 50 received − 20 refunded paid back out ⇒ drawer holds 30; counted
      // 30 matches ⇒ variance = 30 - 30 = 0.
      expect(Number(res.cash_payments)).toBe(50);
      expect(Number(res.cash_refunds)).toBe(20);
      expect(Number(res.expected_cash)).toBe(30);
      expect(Number(res.variance)).toBe(0);
    });
  });

  it("SPEC: counted < expected ⇒ negative variance (shortage), persisted on register_sessions", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      await wf.recordPayment(tx, orderId, 40);

      const id = await sessionId(tx);
      const res = await wf.closeRegister(tx, id, 35);
      // SPEC: cash-drawer identity (CLAUDE.md §EOD reconciliation) — float 0
      // + 40 received, nothing paid out ⇒ drawer should hold 40; only 35
      // counted ⇒ variance = 35 - 40 = -5 (shortage, negative by the
      // identity's sign convention).
      expect(Number(res.expected_cash)).toBe(40);
      expect(Number(res.variance)).toBe(-5);

      const row = await sessionRow(tx, id);
      // SPEC: the variance (shortage) is persisted on the session row.
      expect(Number(row.variance)).toBe(-5);
      expect(Number(row.closing_counted_cash)).toBe(35);
      expect(Number(row.expected_cash)).toBe(40);
    });
  });

  it("SPEC: close is idempotent — same key twice ⇒ ONE close event, same summary", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      await wf.recordPayment(tx, orderId, 40);

      const id = await sessionId(tx);
      const key = "11111111-1111-1111-1111-111111111111";
      // SPEC: CLAUDE.md §EOD "Idempotent close" — a replay with the same
      // idempotency key returns the original close summary and writes NO
      // additional audit event.
      const first = await wf.closeRegister(tx, id, 40, { idempotencyKey: key });
      const second = await wf.closeRegister(tx, id, 40, { idempotencyKey: key });

      // SPEC: cash-drawer identity — float 0 + 40 received ⇒ drawer holds 40;
      // counted 40 ⇒ variance 0.
      expect(Number(first.expected_cash)).toBe(40);
      expect(Number(first.variance)).toBe(0);
      expect(Number(second.expected_cash)).toBe(Number(first.expected_cash));
      expect(Number(second.variance)).toBe(Number(first.variance));
      expect(second.status).toBe(first.status);

      // SPEC: CLAUDE.md §EOD "Idempotent close" + "Append-only history" — the
      // replayed close writes NO additional event, so still exactly ONE row.
      expect(await closeEventCount(tx, id)).toBe(1);
    });
  });

  it("SPEC: reopen then re-close preserves history — TWO close events; session row reflects LATEST close", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      await wf.recordPayment(tx, orderId, 40);

      const id = await sessionId(tx);
      // First close: cash-drawer identity — float 0 + 40 received ⇒ expected
      // 40; only 35 counted ⇒ variance = 35 - 40 = -5 (shortage).
      const close1 = await wf.closeRegister(tx, id, 35);
      expect(Number(close1.variance)).toBe(-5);

      // SPEC: CLAUDE.md §EOD "Who" — reopen is no longer manager-only (any
      // active shop user may reopen; page-gated). A manager reopening still works.
      await wf.reopenRegister(tx, id);
      expect((await sessionRow(tx, id)).status).toBe("open");

      // One more cash payment, then a clean re-close.
      const { orderId: orderId2 } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      await wf.recordPayment(tx, orderId2, 10);

      const close2 = await wf.closeRegister(tx, id, 50);
      // SPEC: cash-drawer identity (CLAUDE.md §EOD reconciliation) — float 0
      // + (40 + 10) received across the session's lifetime, nothing paid out
      // ⇒ drawer holds 50; counted 50 ⇒ variance = 50 - 50 = 0.
      expect(Number(close2.expected_cash)).toBe(50);
      expect(Number(close2.variance)).toBe(0);

      // SPEC: CLAUDE.md §EOD "Append-only history" — reopen + re-close writes
      // one additional register_close_events row (the first close's shortage
      // history is preserved), so TWO rows total.
      expect(await closeEventCount(tx, id)).toBe(2);

      // SPEC: CLAUDE.md §EOD "Append-only history" — register_sessions keeps
      // only the LATEST close.
      const row = await sessionRow(tx, id);
      expect(row.status).toBe("closed");
      expect(Number(row.expected_cash)).toBe(50);
      expect(Number(row.variance)).toBe(0);
      expect(Number(row.closing_counted_cash)).toBe(50);
    });
  });

  it("SPEC: a closed register rejects new transactions (record_payment raises 'Register is not open')", async () => {
    await inRolledBackTx(async (tx) => {
      const id = await sessionId(tx);
      await wf.closeRegister(tx, id, 0);

      // SPEC: CLAUDE.md §EOD "Frozen day rejects money" — with no open
      // session for the brand, record_payment_transaction must be rejected;
      // no cash can be taken against a frozen/never-opened day. The thrown
      // message substring is matched as a secondary check only — the oracle
      // is the CLAUDE.md rule, not the SQL's wording.
      const { orderId } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      await expect(wf.recordPayment(tx, orderId, 25)).rejects.toThrow(
        /Register is not open/,
      );
    });
  });

  it("SPEC §3: inline confirmation payment (home brands) needs no open register", async () => {
    await inRolledBackTx(async (tx) => {
      // SPEC: CLAUDE.md §3 — home-based brands take payment INLINE at order
      // confirmation and have NO cashier/register. Close the day so no session
      // is open, then confirm a WORK order with deferToCashier=false + paid>0
      // (the home-brand new-work-order path). It must succeed, not raise
      // "Register is not open" — the register requirement lives only in the
      // cashier path (record_payment_transaction), not at confirmation.
      await wf.closeRegister(tx, await sessionId(tx), 0);

      const { orderId } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }],
        { paid: 40, deferToCashier: false },
      );

      // The inline payment is recorded (orders.paid summed by trigger) and the
      // transaction carries a NULL session — there is no register to attach to.
      const o = only(
        await tx`SELECT paid FROM orders WHERE id = ${orderId}`,
        "orders.paid",
      ) as { paid: string | number };
      expect(Number(o.paid)).toBe(40);

      const t = only(
        await tx`
          SELECT amount, register_session_id
          FROM payment_transactions WHERE order_id = ${orderId}`,
        "payment_transactions",
      ) as { amount: string | number; register_session_id: number | null };
      expect(Number(t.amount)).toBe(40);
      expect(t.register_session_id).toBeNull();
    });
  });
});

describe("EOD report sanity (CLAUDE.md §EOD; net = collected − refunded identity)", () => {
  it("SPEC: cash totals are internally consistent (net = collected - refunded)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final", fabric_price: 30, stitching_price: 20 }],
        { paid: 0 },
      );
      await wf.recordPayment(tx, orderId, 50);
      await wf.recordPayment(tx, orderId, 20, {
        refund: {
          reason: "component refund",
          items: [{ garment_id: garments[0]!.id, stitching: true, amount: 20 }],
        },
      });

      // get_register_session uses Kuwait server time internally; pass today's
      // local date as the range and let the RPC's tz handling do the rest.
      const today = only(
        await tx`SELECT (now() AT TIME ZONE 'Asia/Kuwait')::date::text AS d`,
        "today",
      ) as unknown as { d: string };

      const r = await wf.getEodReport(tx, { from: today.d, to: today.d });

      // Output-contract check only (NOT a spec oracle): CLAUDE.md §EOD speaks
      // of "collected/refunded/net" conceptually; assert the report exposes
      // those fields so the identity check below has something to bind to.
      expect(r).toHaveProperty("total_collected");
      expect(r).toHaveProperty("total_refunded");
      expect(r).toHaveProperty("net_revenue");

      const collected = Number(r.total_collected);
      const refunded = Number(r.total_refunded);
      const net = Number(r.net_revenue);

      // SPEC: universal net identity (CLAUDE.md §EOD "collected/refunded/net")
      // — net = collected − refunded. Definitional, holds regardless of
      // implementation. This order contributes +50 collected / -20 refunded,
      // so collected and refunded are monotonically at least those amounts
      // (other rolled-up activity can only add).
      expect(net).toBe(collected - refunded);
      expect(collected).toBeGreaterThanOrEqual(50);
      expect(refunded).toBeGreaterThanOrEqual(20);
    });
  });

  it("SPEC: stock-purchase settlements (cash + non-cash) roll up into report.purchases", async () => {
    await inRolledBackTx(async (tx) => {
      // A costed fabric restock mints a payable (total_cost = qty × unit_cost =
      // 10 × 5 = 50). Settle it in two steps: 20 cash + 15 knet.
      const r = await wf.restock(tx, { itemType: "fabric", qty: 10, unitCost: 5 });
      expect(r.purchase_id).not.toBeNull();
      expect(Number(r.total_cost)).toBe(50);

      // Fund the drawer first — a cash purchase posts a cash_out that can't
      // exceed the drawer balance, and the seeded session opens at float 0.
      const { orderId } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      await wf.recordPayment(tx, orderId, 40);

      const id = await sessionId(tx); // cash settlement needs an open session
      await wf.payStockPurchase(tx, r.purchase_id!, 20, { paymentType: "cash", sessionId: id });
      await wf.payStockPurchase(tx, r.purchase_id!, 15, { paymentType: "knet" });

      const today = only(
        await tx`SELECT (now() AT TIME ZONE 'Asia/Kuwait')::date::text AS d`,
        "today",
      ) as unknown as { d: string };

      const rep = await wf.getEodReport(tx, { from: today.d, to: today.d });

      // SPEC §3: the report exposes a purchases summary of settlements in range.
      expect(rep).toHaveProperty("purchases");
      const p = rep.purchases as {
        total_paid: number | string;
        payment_count: number | string;
        by_payment_method: { payment_type: string; total: number | string; count: number | string }[];
      };

      // SPEC: universal sum identity — purchases.total_paid = Σ settlements in
      // range, including non-cash. Both the 20 cash and the 15 knet are settled
      // "now" against THIS brand's payable, so the total is monotonically ≥ 35
      // across two records. (≥, not ==, because the seed may carry other ERTH
      // purchases; this scenario contributes exactly +35 over 2 records.)
      expect(Number(p.total_paid)).toBeGreaterThanOrEqual(35);
      expect(Number(p.payment_count)).toBeGreaterThanOrEqual(2);

      // SPEC: the non-cash settlement (knet) MUST appear — it never touches the
      // cash drawer, so if the report only mirrored cash_out it would be lost.
      const knet = p.by_payment_method.find((m) => m.payment_type === "knet");
      const cash = p.by_payment_method.find((m) => m.payment_type === "cash");
      expect(knet).toBeDefined();
      expect(Number(knet!.total)).toBeGreaterThanOrEqual(15);
      expect(cash).toBeDefined();
      expect(Number(cash!.total)).toBeGreaterThanOrEqual(20);
    });
  });

  it("SPEC: manual drawer cash movements (paid in/out) roll up into report.cash_flow", async () => {
    await inRolledBackTx(async (tx) => {
      // Fund the drawer first — a cash_out can't exceed the drawer balance.
      const { orderId } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      await wf.recordPayment(tx, orderId, 60);

      const id = await sessionId(tx);
      await wf.addCashMovement(tx, id, "cash_in", 10, { reasonCategory: "pickup" });
      await wf.addCashMovement(tx, id, "cash_out", 25, { reasonCategory: "bank_deposit" });

      const today = only(
        await tx`SELECT (now() AT TIME ZONE 'Asia/Kuwait')::date::text AS d`,
        "today",
      ) as unknown as { d: string };

      const rep = await wf.getEodReport(tx, { from: today.d, to: today.d });
      expect(rep).toHaveProperty("cash_flow");
      const cf = rep.cash_flow as {
        cash_in_total: number | string;
        cash_out_total: number | string;
        by_category: { type: string; reason_category: string; total: number | string; count: number | string }[];
      };

      // SPEC: definitional — cash_flow totals = Σ register_cash_movements by type
      // in range. The pickup (10 in) and bank deposit (25 out) MUST appear; this
      // is the only place a multi-day EOD surfaces drawer movements. (≥, not ==,
      // because the seed/other activity can only add.)
      expect(Number(cf.cash_in_total)).toBeGreaterThanOrEqual(10);
      expect(Number(cf.cash_out_total)).toBeGreaterThanOrEqual(25);
      const pickup = cf.by_category.find((c) => c.type === "cash_in" && c.reason_category === "pickup");
      const deposit = cf.by_category.find((c) => c.type === "cash_out" && c.reason_category === "bank_deposit");
      expect(pickup).toBeDefined();
      expect(Number(pickup!.total)).toBeGreaterThanOrEqual(10);
      expect(deposit).toBeDefined();
      expect(Number(deposit!.total)).toBeGreaterThanOrEqual(25);
    });
  });
});
