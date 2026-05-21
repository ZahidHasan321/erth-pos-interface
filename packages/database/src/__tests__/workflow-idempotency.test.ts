/**
 * RPC idempotency suite — SPEC AS ORACLE.
 *
 * Assertions encode the *intended* idempotency contract, NOT whatever the code
 * currently does. A failing test therefore means the system violates the spec —
 * a double-write / double-decrement bug to fix in the implementation (RPC /
 * trigger), not a test to relax.
 *
 * Why this suite exists (see auto-memory project_writeloss_rootcause_free_tier):
 * the Supabase Free shared edge/pooler exhibits a ~5s tail that drops the
 * RESPONSE of a mutation that *did* commit. The client cannot tell "lost
 * response" from "lost request" and retries. The proven real fix is a plan
 * upgrade; idempotency is the mitigation that must hold until then. These
 * tests reproduce that exact double-submit and pin the spec:
 *
 *   SPEC (CLAUDE.md §Cashier Payment / §Order Created Phase C / §Inventory):
 *   submitting the SAME logical request twice with the SAME idempotency key
 *   must produce the SAME single effect — the second call is a replay that
 *   returns the original result and changes nothing further. DIFFERENT keys
 *   are NOT deduped (the dedupe is keyed, not accidental).
 *
 * Every expected value here derives from an INDEPENDENT source — a named
 * CLAUDE.md rule or a universal accounting/idempotency invariant — asserted
 * against durable domain rows. Never from the RPC return-payload shape or
 * triggers.sql; a triggers.sql line may be cited only as the *suspected* bug
 * location, never as the source of truth.
 *
 * Mechanism under test (triggers.sql idem_claim / idem_store / idem_replay;
 * record_payment_transaction has its own payment_transactions.idempotency_key
 * short-circuit) — cited as the suspected-bug location only.
 *
 * Every test runs in a transaction that is rolled back; committed reference
 * data is untouched and scenarios are isolated.
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, only, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// A fixed key reused across the two submits of one logical request.
const KEY = "11111111-1111-1111-1111-111111111111";
const KEY_B = "22222222-2222-2222-2222-222222222222";

// ─── raw-row helpers (same pattern as workflow.test.ts) ─────────────────────

async function fabricStock(tx: Tx, id: number): Promise<number> {
  return Number(
    only(
      await tx`SELECT shop_stock FROM fabrics WHERE id = ${id}`,
      `fabric ${id}`,
    ).shop_stock,
  );
}

async function shelfStock(tx: Tx, id: number): Promise<number> {
  return Number(
    only(
      await tx`SELECT shop_stock FROM shelf WHERE id = ${id}`,
      `shelf ${id}`,
    ).shop_stock,
  );
}

async function txnCount(
  tx: Tx,
  orderId: number,
  key: string,
  type: "payment" | "refund",
): Promise<number> {
  return Number(
    only(
      await tx`
        SELECT count(*)::int AS n FROM payment_transactions
        WHERE order_id = ${orderId}
          AND idempotency_key = ${key}::uuid
          AND transaction_type = ${type}
      `,
      "txnCount",
    ).n,
  );
}

// ════════════════════════════════════════════════════════════════════════════

describe("complete_work_order double-submit (CLAUDE.md §Order Created Phase C)", () => {
  it("SPEC: same key twice ⇒ confirmed once, ONE invoice, stock decremented ONCE", async () => {
    await inRolledBackTx(async (tx) => {
      // SPEC §Order Created Phase C: complete_work_order generates an invoice #
      // and decrements fabric/shelf stock. A lost-response retry (same key)
      // must NOT re-bump the invoice nor double-decrement stock.
      const orderId = await wf.createOrder(tx);
      const specs: wf.GarmentSpec[] = [
        { garment_type: "final" },
        { garment_type: "final" },
      ];
      await wf.saveWorkOrderGarments(tx, orderId, specs);

      const stockBefore = await fabricStock(tx, 1);

      await wf.completeWorkOrder(tx, orderId, specs, {
        paid: 0,
        idempotencyKey: KEY,
      });
      const orderAfter1 = await wf.getOrder(tx, orderId);
      const invoice1 = orderAfter1.invoice_number;
      const stockAfter1 = await fabricStock(tx, 1);

      await wf.completeWorkOrder(tx, orderId, specs, {
        paid: 0,
        idempotencyKey: KEY,
      });
      const orderAfter2 = await wf.getOrder(tx, orderId);
      const stockAfter2 = await fabricStock(tx, 1);

      // SPEC CLAUDE.md §Order Created Phase C (complete_work_order ⇒
      // checkout_status: confirmed). Durable orders row, asserted once per
      // call; replay must not toggle / re-confirm.
      expect(orderAfter1.checkout_status).toBe("confirmed");
      expect(orderAfter2.checkout_status).toBe("confirmed");

      // SPEC CLAUDE.md §Order Created Phase C ("invoice # generated") +
      // idempotency invariant "one key ⇒ one effect": exactly ONE invoice
      // number on the durable orders row; the same-key replay must not mint a
      // second invoice.
      expect(invoice1).not.toBeNull();
      expect(orderAfter2.invoice_number).toBe(invoice1);

      // SPEC CLAUDE.md §Order Created Phase C ("fabric stock decremented") +
      // idempotency invariant "one key ⇒ one effect": durable fabrics.shop_stock
      // decremented exactly ONCE — net decrement after the replay equals the
      // single-confirm decrement, never double.
      const singleDecrement = stockBefore - stockAfter1;
      expect(singleDecrement).toBeGreaterThan(0);
      expect(stockAfter2).toBe(stockAfter1);
      expect(stockBefore - stockAfter2).toBe(singleDecrement);
    });
  });
});

describe("record_payment_transaction double-submit — payment (CLAUDE.md §Cashier Payment)", () => {
  it("SPEC: same key twice ⇒ orders.paid moves 28 ONCE (not 56); exactly one payment txn row", async () => {
    await inRolledBackTx(async (tx) => {
      // SPEC §Cashier Payment: record_payment_transaction inserts a
      // payment_transactions row; a trigger sums payments → orders.paid. A
      // lost-response retry with the same key must not double-credit
      // (triggers.sql:852 idempotency short-circuit).
      const { orderId } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(0);

      await wf.recordPayment(tx, orderId, 28, {
        idempotencyKey: KEY,
      });
      const paidAfter1 = Number((await wf.getOrder(tx, orderId)).paid);

      await wf.recordPayment(tx, orderId, 28, {
        idempotencyKey: KEY,
      });
      const paidAfter2 = Number((await wf.getOrder(tx, orderId)).paid);

      // SPEC CLAUDE.md §Cashier Payment ("a DB trigger sums payments →
      // orders.paid") + idempotency invariant "one key ⇒ one effect": the
      // durable orders.paid moved by exactly one 28, not 56, after the
      // same-key replay.
      expect(paidAfter1).toBe(28);
      expect(paidAfter2).toBe(28);

      // SPEC idempotency invariant "one key ⇒ one effect": exactly ONE durable
      // payment_transactions row for this key/order (CLAUDE.md §Cashier Payment
      // "inserts a payment_transactions row").
      expect(await txnCount(tx, orderId, KEY, "payment")).toBe(1);
    });
  });
});

describe("record_payment_transaction double-submit — refund (CLAUDE.md §Cancellation / Refund)", () => {
  it("SPEC: same key twice ⇒ refund applied ONCE (paid drops once), one refund row, discard applied once", async () => {
    await inRolledBackTx(async (tx) => {
      // SPEC §Cancellation / Refund: a full per-garment refund records ONE
      // refund payment_transaction, orders.paid drops via trigger, and the
      // garment is discarded. A retry with the same key must not refund twice
      // nor re-process the discard.
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }, { garment_type: "final" }],
        { paid: 84 },
      );
      const victim = garments[0]?.id;
      const sibling = garments[1]?.id;
      if (victim === undefined || sibling === undefined)
        throw new Error("need 2 garments");

      const refundArgs = {
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
        idempotencyKey: KEY,
      };

      await wf.recordPayment(tx, orderId, 28, refundArgs);
      const paidAfter1 = Number((await wf.getOrder(tx, orderId)).paid);
      const victimStage1 = only(
        await tx`SELECT piece_stage FROM garments WHERE id = ${victim}`,
        "victim",
      ).piece_stage;

      await wf.recordPayment(tx, orderId, 28, refundArgs);
      const paidAfter2 = Number((await wf.getOrder(tx, orderId)).paid);
      const victimStage2 = only(
        await tx`SELECT piece_stage FROM garments WHERE id = ${victim}`,
        "victim",
      ).piece_stage;

      // SPEC CLAUDE.md §Cancellation / Refund ("orders.paid drops via
      // trigger") + idempotency invariant "one key ⇒ one effect": durable
      // orders.paid dropped by exactly one 28 (84 → 56), not 84 → 28.
      expect(paidAfter1).toBe(84 - 28);
      expect(paidAfter2).toBe(84 - 28);

      // SPEC idempotency invariant "one key ⇒ one effect" (CLAUDE.md
      // §Cancellation / Refund "Records a refund payment_transaction"):
      // exactly ONE durable refund row for this key/order.
      expect(await txnCount(tx, orderId, KEY, "refund")).toBe(1);

      // SPEC CLAUDE.md §Cancellation / Refund ("full garment refund →
      // piece_stage: discarded") + idempotency invariant "one key ⇒ one
      // effect": durable garments.piece_stage discarded once and stays
      // discarded across the replay.
      expect(victimStage1).toBe("discarded");
      expect(victimStage2).toBe("discarded");

      // SPEC CLAUDE.md §Cancellation / Refund ("Order stays confirmed"):
      // durable orders.checkout_status unchanged by a per-garment refund.
      const o = await wf.getOrder(tx, orderId);
      expect(o.checkout_status).toBe("confirmed");
      // SPEC CLAUDE.md §Cancellation / Refund (per-component refund affects
      // only the refunded garment): sibling garment untouched, still at its
      // pre-dispatch Phase B stage waiting_cut (CLAUDE.md §Order Created
      // Phase B).
      expect(
        only(
          await tx`SELECT piece_stage FROM garments WHERE id = ${sibling}`,
          "sibling",
        ).piece_stage,
      ).toBe("waiting_cut");
    });
  });
});

describe("create_complete_sales_order double-submit (CLAUDE.md §Inventory: complete_sales_order)", () => {
  it("SPEC: same key twice ⇒ ONE sales order, shelf shop_stock decremented ONCE, both calls return same order", async () => {
    await inRolledBackTx(async (tx) => {
      // SPEC §Inventory: create_complete_sales_order creates a confirmed SALES
      // order and decrements shelf shop_stock. A lost-response retry with the
      // same key must not create a second order nor double-decrement stock
      // (triggers.sql:402 idem_claim).
      const before = await shelfStock(tx, 1);

      const r1 = await wf.createSalesOrder(
        tx,
        [{ id: 1, quantity: 2, unitPrice: 25 }],
        { idempotencyKey: KEY },
      );
      const after1 = await shelfStock(tx, 1);

      const r2 = await wf.createSalesOrder(
        tx,
        [{ id: 1, quantity: 2, unitPrice: 25 }],
        { idempotencyKey: KEY },
      );
      const after2 = await shelfStock(tx, 1);

      // SPEC idempotency invariant "one key ⇒ one effect; replay returns the
      // same entity": the same-key replay returns the SAME order id (not a
      // newly-created order).
      expect(r2.id).toBe(r1.id);

      // SPEC CLAUDE.md §Inventory (create_complete_sales_order creates a
      // confirmed SALES order): asserted against the durable orders row by id,
      // not the RPC payload.
      const salesOrder = only(
        await tx`
          SELECT checkout_status, order_type FROM orders WHERE id = ${r1.id}
        `,
        "salesOrder",
      );
      expect(salesOrder.checkout_status).toBe("confirmed");
      expect(salesOrder.order_type).toBe("SALES");

      // SPEC idempotency invariant "one key ⇒ one effect": exactly ONE durable
      // SALES order for this returned id (no duplicate created by the replay).
      const salesOrderCount = Number(
        only(
          await tx`
            SELECT count(*)::int AS n FROM orders
            WHERE id = ${r1.id} AND order_type = 'SALES'
          `,
          "salesOrderCount",
        ).n,
      );
      expect(salesOrderCount).toBe(1);

      // SPEC CLAUDE.md §Inventory (create_complete_sales_order decrements
      // shelf shop_stock) + idempotency invariant "one key ⇒ one effect":
      // durable shelf.shop_stock decremented exactly once (by 2, not 4).
      expect(before - after1).toBe(2);
      expect(after2).toBe(after1);
      expect(before - after2).toBe(2);
    });
  });
});

describe("idempotency is KEYED, not accidental (negative control)", () => {
  it("SPEC: same logical payment with TWO DIFFERENT keys ⇒ effect applies TWICE", async () => {
    await inRolledBackTx(async (tx) => {
      // SPEC: dedupe is by idempotency key. Two distinct keys describe two
      // distinct logical requests, so the effect MUST apply twice. This guards
      // against a false-positive idempotency implementation that dedupes on
      // amount/order alone (which would silently drop a legitimate second
      // installment payment).
      const { orderId } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
      ]);

      await wf.recordPayment(tx, orderId, 28, { idempotencyKey: KEY });
      const paidAfter1 = Number((await wf.getOrder(tx, orderId)).paid);

      await wf.recordPayment(tx, orderId, 28, { idempotencyKey: KEY_B });
      const paidAfter2 = Number((await wf.getOrder(tx, orderId)).paid);

      // SPEC idempotency invariant "one key ⇒ one effect": first key applied
      // once → durable orders.paid 28.
      expect(paidAfter1).toBe(28);
      // SPEC idempotency invariant "distinct keys ⇒ independent effects" +
      // CLAUDE.md §Cashier Payment ("Supports partial/installment payments"):
      // a DIFFERENT key is a distinct logical installment and MUST apply
      // again → durable orders.paid 56 (not deduped on amount/order alone).
      expect(paidAfter2).toBe(56);

      // SPEC idempotency invariant "distinct keys ⇒ independent effects": one
      // durable payment_transactions row per distinct key.
      expect(await txnCount(tx, orderId, KEY, "payment")).toBe(1);
      expect(await txnCount(tx, orderId, KEY_B, "payment")).toBe(1);
    });
  });
});

describe("close_register double-submit (CLAUDE.md §EOD / register close)", () => {
  it("SPEC: same key twice ⇒ ONE register_close_events row, replay reports same reconciliation", async () => {
    await inRolledBackTx(async (tx) => {
      // SPEC CLAUDE.md §EOD / register close — "Idempotent close:
      // close_register is idempotent on its idempotency key — a replay
      // returns the original close summary and writes NO additional audit
      // event" + "Append-only history: every close writes a
      // register_close_events row". A same-key replay must therefore leave
      // exactly ONE register_close_events row.
      // Uses the seeded open ERTH register session; the close is rolled back
      // with the test transaction, so committed state is untouched.
      const session = await wf.getRegisterSession(tx);
      if (!session || typeof session.id !== "number") {
        throw new Error("no seeded open register session for BRAND");
      }
      const sessionId = session.id;

      const r1 = await wf.closeRegister(tx, sessionId, 0, {
        idempotencyKey: KEY,
      });
      const r2 = await wf.closeRegister(tx, sessionId, 0, {
        idempotencyKey: KEY,
      });

      // SPEC CLAUDE.md §EOD / register close ("Idempotent close ... writes NO
      // additional audit event" + "Append-only history: every close writes a
      // register_close_events row"): exactly ONE durable close-event row for
      // this session after two same-key closes.
      const closeEvents = Number(
        only(
          await tx`
            SELECT count(*)::int AS n FROM register_close_events
            WHERE register_session_id = ${sessionId}
          `,
          "register_close_events",
        ).n,
      );
      expect(closeEvents).toBe(1);

      // SPEC CLAUDE.md §EOD / register close ("a replay returns the original
      // close summary"): the durable register_sessions row is closed.
      const sessionRow = only(
        await tx`SELECT status FROM register_sessions WHERE id = ${sessionId}`,
        "register_sessions",
      );
      expect(sessionRow.status).toBe("closed");

      // SPEC CLAUDE.md §EOD / register close ("a replay returns the original
      // close summary") + Reconciliation formula (variance = counted_cash −
      // expected_cash, the universal cash-drawer identity): the replay reports
      // the SAME spec quantities as the original close. These are spec-named
      // reconciliation values, NOT a whole-payload shape assertion.
      expect(r2.status).toBe(r1.status);
      expect(Number(r2.expected_cash)).toBe(Number(r1.expected_cash));
      expect(Number(r2.variance)).toBe(Number(r1.variance));
    });
  });
});
