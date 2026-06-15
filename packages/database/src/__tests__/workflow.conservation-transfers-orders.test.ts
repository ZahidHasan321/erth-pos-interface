/**
 * Stock-conservation suite for TRANSFERS + ORDER-CONFIRM — SPEC AS ORACLE.
 *
 * Companion to the lifecycle/refund/idempotency suites. Pins the invariants the
 * just-applied stock-conservation hardening pass must satisfy. EVERY expected
 * value here derives from the SPEC (CLAUDE.md §4 Inventory & transfers, §2.6
 * Refund/cancel) or a UNIVERSAL INVARIANT — NEVER transcribed from the
 * dispatch_transfer / receive_transfer / complete_work_order /
 * create_complete_sales_order bodies in triggers.sql. A test derived from the
 * implementation is green by construction and catches nothing (CLAUDE.md
 * §0.5 / §6.6). triggers.sql is cited ONLY as a suspected-bug location.
 *
 * The oracles used here:
 *
 *  (CONSERVATION) Stock is conserved. Units of an item are never silently
 *      created or destroyed. CLAUDE.md §4: "The only way stock crosses sides is
 *      a recorded transfer." A transfer takes units out of the source count,
 *      moves them in transit, and lands them in the destination count; a partial
 *      receive leaves the remainder accounted (in-transit / lost-in-transit),
 *      "never silently gained/vanished". So for any item across a transfer:
 *
 *          source_after + dest_after + in_transit_remainder == total_before
 *
 *      where in_transit_remainder = dispatched − received (the units that left
 *      the source but have not landed — open in transit, or booked lost). This
 *      identity is bookkeeping arithmetic; it holds regardless of how the RPCs
 *      compute it. (It is the inventory analogue of the cash-drawer identity in
 *      workflow-eod.test.ts.)
 *
 *  (POSITIVE-QTY) CLAUDE.md §4: transferred quantities are real physical
 *      amounts — a side "sends whatever it has: the full quantity, a partial
 *      quantity, or none." A "none" send is the absence of a dispatch, not a
 *      zero/negative one; a negative quantity would manufacture phantom stock
 *      (conservation violation). So a dispatch/receive of qty ≤ 0 must be
 *      rejected. (N1.)
 *
 *  (ISOLATION) CLAUDE.md §4: a dispatch acts on the items of THE transfer being
 *      sent. An item id that belongs to a *different* transfer must not have its
 *      stock debited under this transfer — that would move stock with no
 *      recorded transfer for it (conservation/audit violation). (N2.)
 *
 *  (NO-DOUBLE-MOVE) CLAUDE.md §4 status machine: requested → send → receive.
 *      A transfer is sent ONCE and received against what was sent. Re-sending an
 *      already-dispatched transfer, or receiving more than was dispatched, would
 *      move units twice / inflate the destination — both break conservation. So
 *      both are rejected and leave stock unchanged.
 *
 *  (ON-HAND GUARD) CLAUDE.md §4: a confirm consumes stock the side physically
 *      holds; stock counts are physical and never negative. Confirming an order
 *      that needs MORE than is on hand must be rejected and leave stock
 *      unchanged. Customer-brought OUT fabric "is never part of either stock and
 *      is never decremented." (F5.)
 *
 *  (IDEMPOTENT-BY-STATE) CLAUDE.md §7.7 + §Order Created Phase C: a confirm is
 *      retryable; confirming the SAME order twice must produce exactly ONE
 *      decrement. Asserted with a FRESH key on the second call (so the dedup is
 *      a real already-confirmed guard, not just the idempotency-key cache). (N4.)
 *
 * Every test runs in a transaction that is ALWAYS rolled back; the global-setup
 * seed (seed.ts) is the untouched baseline. Catalog baseline from seed.ts:
 * fabrics shop_stock 1000 / workshop_stock 0; shelf shop_stock 100 /
 * workshop_stock 0.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, tryInSavepoint, only, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";
import {
  CASHIER,
  MANAGER,
  BRAND,
  CUSTOMER_ID,
  FABRIC_A_ID,
  FABRIC_B_ID,
  SHELF_A_ID,
} from "../../scripts/lifecycle/fixtures";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// ─── stock accessors (same raw-row pattern as the sibling suites) ───────────

async function fabricStocks(
  tx: Tx,
  id: number,
): Promise<{ shop: number; workshop: number }> {
  const r = only(
    await tx`SELECT shop_stock, workshop_stock FROM fabrics WHERE id = ${id}`,
    `fabric ${id}`,
  ) as unknown as { shop_stock: string; workshop_stock: string };
  return { shop: Number(r.shop_stock), workshop: Number(r.workshop_stock) };
}

async function shelfStocks(
  tx: Tx,
  id: number,
): Promise<{ shop: number; workshop: number }> {
  const r = only(
    await tx`SELECT shop_stock, workshop_stock FROM shelf WHERE id = ${id}`,
    `shelf ${id}`,
  ) as unknown as { shop_stock: string | number; workshop_stock: string | number };
  return { shop: Number(r.shop_stock), workshop: Number(r.workshop_stock) };
}

// ─── transfer helpers ───────────────────────────────────────────────────────
// The app issues create_transfer / dispatch_transfer / receive_transfer; the
// driver doesn't expose transfer helpers, so we (a) seed the `requested` row
// with the exact inserts the request flow issues — a transfer_requests row in
// 'requested' status + one transfer_request_items row — and (b) call the
// dispatch_transfer / receive_transfer RPCs directly via tx, the same way the
// driver invokes every other RPC. The REAL deployed RPCs run; nothing about
// their behavior is mirrored here.

/** Create a `requested` fabric transfer for `qty`; returns transfer + item ids. */
async function requestFabricTransfer(
  tx: Tx,
  fabricId: number,
  qty: number,
  direction: "shop_to_workshop" | "workshop_to_shop" = "shop_to_workshop",
): Promise<{ transferId: number; itemId: number }> {
  const t = only(
    await tx`
      INSERT INTO transfer_requests (brand, direction, item_type, status, requested_by)
      VALUES (${BRAND}::brand, ${direction}::transfer_direction, 'fabric'::transfer_item_type,
              'requested'::transfer_status, ${MANAGER.id}::uuid)
      RETURNING id`,
    "requestFabricTransfer: transfer_requests",
  );
  const transferId = t.id as number;
  const i = only(
    await tx`
      INSERT INTO transfer_request_items (transfer_request_id, fabric_id, requested_qty)
      VALUES (${transferId}, ${fabricId}, ${qty})
      RETURNING id`,
    "requestFabricTransfer: transfer_request_items",
  );
  return { transferId, itemId: i.id as number };
}

function dispatchTransfer(
  tx: Tx,
  transferId: number,
  items: { id: number; dispatched_qty: number }[],
) {
  return tx`
    SELECT dispatch_transfer(
      ${transferId}, ${MANAGER.id}::uuid, ${tx.json(items)}::jsonb, ${randomUUID()}::uuid
    )`;
}

function receiveTransfer(
  tx: Tx,
  transferId: number,
  items: { id: number; received_qty: number }[],
) {
  return tx`
    SELECT receive_transfer(
      ${transferId}, ${MANAGER.id}::uuid, ${tx.json(items)}::jsonb, ${randomUUID()}::uuid
    )`;
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSFER CONSERVATION
// ════════════════════════════════════════════════════════════════════════════

describe("transfer stock conservation (CLAUDE.md §4 Inventory & transfers)", () => {
  it("CONSERVATION: full receive ⇒ source_after + dest_after == total_before, all moved across, nothing gained/lost", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStocks(tx, FABRIC_A_ID);
      const total = before.shop + before.workshop;
      const D = 40; // full send + full receive

      const { transferId, itemId } = await requestFabricTransfer(tx, FABRIC_A_ID, D);
      await dispatchTransfer(tx, transferId, [{ id: itemId, dispatched_qty: D }]);
      await receiveTransfer(tx, transferId, [{ id: itemId, received_qty: D }]);

      const after = await fabricStocks(tx, FABRIC_A_ID);

      // ORACLE (CONSERVATION): a full transfer moves units from source to dest
      // with no remainder in transit. source + dest is conserved across the move.
      expect(after.shop + after.workshop).toBe(total);
      // CLAUDE.md §4: "Sent stock leaves the source count" — shop drops by D.
      expect(after.shop).toBe(before.shop - D);
      // CLAUDE.md §4: "stock lands in the destination count" — workshop gains D.
      expect(after.workshop).toBe(before.workshop + D);
    });
  });

  it("CONSERVATION: partial receive ⇒ (dispatched − received) stays accounted as in-transit/lost, total still conserved", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStocks(tx, FABRIC_A_ID);
      const total = before.shop + before.workshop;
      const D = 30; // dispatched
      const R = 18; // received (< dispatched ⇒ remainder)
      const remainder = D - R; // 12 units that left source but didn't land

      const { transferId, itemId } = await requestFabricTransfer(tx, FABRIC_A_ID, D);
      await dispatchTransfer(tx, transferId, [{ id: itemId, dispatched_qty: D }]);
      await receiveTransfer(tx, transferId, [{ id: itemId, received_qty: R }]);

      const after = await fabricStocks(tx, FABRIC_A_ID);

      // ORACLE (CONSERVATION): units are conserved across source + dest + the
      // remainder that left the source but has not landed. CLAUDE.md §4: the
      // shortfall is "never silently gained/vanished". The arithmetic identity
      // (source_after + dest_after + remainder == total_before) is the oracle —
      // NOT any RPC line.
      expect(after.shop + after.workshop + remainder).toBe(total);
      // CLAUDE.md §4: "Sent stock leaves the source count" — the FULL dispatched
      // amount left the source, not just the received part.
      expect(after.shop).toBe(before.shop - D);
      // CLAUDE.md §4: destination lands only what actually arrived.
      expect(after.workshop).toBe(before.workshop + R);
    });
  });

  it("CONSERVATION: remainder is a one-way LOSS, not returned to source (CLAUDE.md §4 — only a recorded transfer moves stock)", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStocks(tx, FABRIC_A_ID);
      const D = 30;
      const R = 18;

      const { transferId, itemId } = await requestFabricTransfer(tx, FABRIC_A_ID, D);
      await dispatchTransfer(tx, transferId, [{ id: itemId, dispatched_qty: D }]);
      await receiveTransfer(tx, transferId, [{ id: itemId, received_qty: R }]);

      const after = await fabricStocks(tx, FABRIC_A_ID);

      // CLAUDE.md §4: "The only way stock crosses sides is a recorded transfer."
      // The lost-in-transit remainder was NOT silently re-credited to the source
      // (there is no transfer moving it back) — so source reflects the full send.
      // If the code refunded the remainder to source, source would read
      // before.shop - R and this conservation/no-phantom-credit check fails.
      expect(after.shop).toBe(before.shop - D);
      // And the visible counts must total LESS than before by exactly the loss
      // (the loss is real shrinkage, accounted, not a vanish nor a gain).
      expect(after.shop + after.workshop).toBe(
        before.shop + before.workshop - (D - R),
      );
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// N1 — POSITIVE QUANTITY GUARDS
// ════════════════════════════════════════════════════════════════════════════

describe("transfer positive-quantity guards (CLAUDE.md §4 — N1)", () => {
  it("POSITIVE-QTY: dispatch_transfer with dispatched_qty <= 0 REJECTS and debits NO source stock", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStocks(tx, FABRIC_A_ID);
      const { transferId, itemId } = await requestFabricTransfer(tx, FABRIC_A_ID, 10);

      // qty 0 — a non-send is the ABSENCE of a dispatch, not a zero dispatch.
      // (tryInSavepoint scopes the RAISE so the tx survives for the post-check.)
      expect(
        await tryInSavepoint(tx, (sp) =>
          dispatchTransfer(sp, transferId, [{ id: itemId, dispatched_qty: 0 }]),
        ),
      ).not.toBeNull();

      // qty negative — would ADD phantom stock to the source (conservation
      // violation). Must reject.
      expect(
        await tryInSavepoint(tx, (sp) =>
          dispatchTransfer(sp, transferId, [{ id: itemId, dispatched_qty: -5 }]),
        ),
      ).not.toBeNull();

      // ORACLE (POSITIVE-QTY + CONSERVATION): a rejected dispatch moves no stock.
      const after = await fabricStocks(tx, FABRIC_A_ID);
      expect(after.shop).toBe(before.shop);
      expect(after.workshop).toBe(before.workshop);
    });
  });

  it("POSITIVE-QTY: receive_transfer with received_qty <= 0 REJECTS and credits NO destination stock", async () => {
    await inRolledBackTx(async (tx) => {
      const D = 12;
      const { transferId, itemId } = await requestFabricTransfer(tx, FABRIC_A_ID, D);
      await dispatchTransfer(tx, transferId, [{ id: itemId, dispatched_qty: D }]);

      const afterDispatch = await fabricStocks(tx, FABRIC_A_ID);

      expect(
        await tryInSavepoint(tx, (sp) =>
          receiveTransfer(sp, transferId, [{ id: itemId, received_qty: 0 }]),
        ),
      ).not.toBeNull();
      expect(
        await tryInSavepoint(tx, (sp) =>
          receiveTransfer(sp, transferId, [{ id: itemId, received_qty: -3 }]),
        ),
      ).not.toBeNull();

      // ORACLE (POSITIVE-QTY + CONSERVATION): a rejected receive credits no dest
      // stock (a negative receive would DESTROY dest stock). Source already
      // debited at dispatch stays debited.
      const after = await fabricStocks(tx, FABRIC_A_ID);
      expect(after.workshop).toBe(afterDispatch.workshop);
      expect(after.shop).toBe(afterDispatch.shop);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// N2 — CROSS-TRANSFER ITEM ISOLATION
// ════════════════════════════════════════════════════════════════════════════

describe("transfer item isolation (CLAUDE.md §4 — N2)", () => {
  it("ISOLATION: dispatching transfer A with an item id belonging to transfer B REJECTS and debits NO stock", async () => {
    await inRolledBackTx(async (tx) => {
      // Two independent transfers, each with its own item row.
      const a = await requestFabricTransfer(tx, FABRIC_A_ID, 10);
      const b = await requestFabricTransfer(tx, FABRIC_B_ID, 10);

      const before = await fabricStocks(tx, FABRIC_B_ID);

      // Dispatch transfer A but hand it transfer B's item id. CLAUDE.md §4: a
      // send acts on THE transfer's own items; a foreign item must not be moved
      // under this transfer.
      expect(
        await tryInSavepoint(tx, (sp) =>
          dispatchTransfer(sp, a.transferId, [{ id: b.itemId, dispatched_qty: 5 }]),
        ),
      ).not.toBeNull();

      // ORACLE (ISOLATION + CONSERVATION): the foreign item's stock (fabric B)
      // is untouched — no stock moved with no recorded transfer for it.
      const after = await fabricStocks(tx, FABRIC_B_ID);
      expect(after.shop).toBe(before.shop);
      expect(after.workshop).toBe(before.workshop);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// DOUBLE-DISPATCH / OVER-RECEIVE
// ════════════════════════════════════════════════════════════════════════════

describe("transfer no-double-move (CLAUDE.md §4 status machine)", () => {
  it("NO-DOUBLE-MOVE: a second dispatch of an already-dispatched transfer REJECTS and debits source only once", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStocks(tx, FABRIC_A_ID);
      const D = 20;
      const { transferId, itemId } = await requestFabricTransfer(tx, FABRIC_A_ID, D);

      await dispatchTransfer(tx, transferId, [{ id: itemId, dispatched_qty: D }]);
      const afterFirst = await fabricStocks(tx, FABRIC_A_ID);

      // CLAUDE.md §4: a transfer is sent ONCE (requested → dispatched). A second
      // send would debit the source twice for one transfer (conservation
      // violation). Must reject (transfer is no longer 'requested').
      expect(
        await tryInSavepoint(tx, (sp) =>
          dispatchTransfer(sp, transferId, [{ id: itemId, dispatched_qty: D }]),
        ),
      ).not.toBeNull();

      // ORACLE (NO-DOUBLE-MOVE + CONSERVATION): source debited exactly once.
      const after = await fabricStocks(tx, FABRIC_A_ID);
      expect(afterFirst.shop).toBe(before.shop - D);
      expect(after.shop).toBe(before.shop - D);
    });
  });

  it("NO-DOUBLE-MOVE: receiving MORE than dispatched REJECTS and credits no destination stock", async () => {
    await inRolledBackTx(async (tx) => {
      const D = 15;
      const { transferId, itemId } = await requestFabricTransfer(tx, FABRIC_A_ID, D);
      await dispatchTransfer(tx, transferId, [{ id: itemId, dispatched_qty: D }]);
      const afterDispatch = await fabricStocks(tx, FABRIC_A_ID);

      // CLAUDE.md §4: receive lands what arrived, bounded by what was sent.
      // Receiving more than dispatched would inflate the destination beyond what
      // ever left the source (units created from nothing — conservation
      // violation). Must reject.
      expect(
        await tryInSavepoint(tx, (sp) =>
          receiveTransfer(sp, transferId, [{ id: itemId, received_qty: D + 1 }]),
        ),
      ).not.toBeNull();

      // ORACLE (NO-DOUBLE-MOVE + CONSERVATION): destination unchanged by the
      // rejected over-receive.
      const after = await fabricStocks(tx, FABRIC_A_ID);
      expect(after.workshop).toBe(afterDispatch.workshop);
      expect(after.shop).toBe(afterDispatch.shop);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// F5 — ORDER-CONFIRM ON-HAND GUARD
// ════════════════════════════════════════════════════════════════════════════

describe("order-confirm on-hand guard (CLAUDE.md §4 — F5)", () => {
  it("ON-HAND GUARD: confirming a WORK order needing more fabric than on hand REJECTS and leaves fabric stock unchanged", async () => {
    await inRolledBackTx(async (tx) => {
      // Drive fabric A's shop stock below what the order needs. The driver's
      // completeWorkOrder consumes fabric A length 3 per garment (driver.ts).
      await tx`UPDATE fabrics SET shop_stock = 2, real_stock = 2 WHERE id = ${FABRIC_A_ID}`;
      const before = await fabricStocks(tx, FABRIC_A_ID);
      expect(before.shop).toBe(2); // need 3, have 2

      const orderId = await wf.createOrder(tx);
      const specs: wf.GarmentSpec[] = [{ garment_type: "final" }];
      await wf.saveWorkOrderGarments(tx, orderId, specs);

      // ORACLE (ON-HAND GUARD): CLAUDE.md §4 — a confirm consumes only stock the
      // side holds; counts never go negative. need (3) > on-hand (2) ⇒ reject.
      expect(
        await tryInSavepoint(tx, (sp) =>
          wf.completeWorkOrder(sp, orderId, specs, { paid: 0 }),
        ),
      ).not.toBeNull();

      // ORACLE (CONSERVATION): a rejected confirm decrements nothing.
      const after = await fabricStocks(tx, FABRIC_A_ID);
      expect(after.shop).toBe(before.shop);

      // The order must NOT be left confirmed by a rejected (rolled-back) confirm.
      expect((await wf.getOrder(tx, orderId)).checkout_status).toBe("draft");
    });
  });

  it("ON-HAND GUARD: confirming a SALES order for more shelf qty than on hand REJECTS and leaves shelf stock unchanged", async () => {
    await inRolledBackTx(async (tx) => {
      // Drive shelf A's shop stock below the requested quantity.
      await tx`UPDATE shelf SET shop_stock = 1, stock = 1 WHERE id = ${SHELF_A_ID}`;
      const before = await shelfStocks(tx, SHELF_A_ID);
      expect(before.shop).toBe(1); // need 3, have 1

      // ORACLE (ON-HAND GUARD): CLAUDE.md §4 — consume only what's on hand.
      // need (3) > on-hand (1) ⇒ reject; no order/stock change commits.
      expect(
        await tryInSavepoint(tx, (sp) =>
          wf.createSalesOrder(sp, [{ id: SHELF_A_ID, quantity: 3, unitPrice: 25 }]),
        ),
      ).not.toBeNull();

      const after = await shelfStocks(tx, SHELF_A_ID);
      expect(after.shop).toBe(before.shop);
    });
  });

  it("ON-HAND GUARD: customer-brought OUT fabric is NEVER decremented (CLAUDE.md §4 — customer fabric is not part of either stock)", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStocks(tx, FABRIC_A_ID);

      // A WORK order whose garment uses the customer's own cloth. The app filters
      // fabric_source='IN' before passing p_fabric_items, so an OUT garment
      // contributes NO fabric line to the confirm. We confirm with an EMPTY
      // fabric list to model that (createOrder + save + a confirm carrying no
      // fabric items).
      const orderId = await wf.createOrder(tx);
      await wf.saveWorkOrderGarments(tx, orderId, [{ garment_type: "final" }]);
      await confirmWithNoFabric(tx, orderId);

      // ORACLE: CLAUDE.md §4 — customer (OUT) fabric "is never part of either
      // stock and is never decremented." Catalog fabric stock is untouched.
      const after = await fabricStocks(tx, FABRIC_A_ID);
      expect(after.shop).toBe(before.shop);
      expect(after.workshop).toBe(before.workshop);
      expect((await wf.getOrder(tx, orderId)).checkout_status).toBe("confirmed");
    });
  });
});

/** complete_work_order carrying NO fabric items — models an all-OUT-fabric order. */
async function confirmWithNoFabric(tx: Tx, orderId: number) {
  await tx`
    SELECT complete_work_order(
      ${orderId},
      ${tx.json({
        paymentType: "cash",
        paid: 0,
        orderTaker: CASHIER.id,
        discountType: "flat",
        discountValue: 0,
        discountPercentage: 0,
        referralCode: null,
        orderTotal: 13,
        fabricCharge: 0,
        stitchingCharge: 10,
        styleCharge: 3,
        deliveryCharge: 0,
        expressCharge: 0,
        soakingCharge: 0,
        shelfCharge: 0,
        homeDelivery: false,
        deliveryDate: null,
        advance: 0,
        stitchingPrice: 10,
      })}::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      ${randomUUID()}::uuid
    )`;
}

// ════════════════════════════════════════════════════════════════════════════
// N4 — CONFIRM IDEMPOTENT-BY-STATE
// ════════════════════════════════════════════════════════════════════════════

describe("order-confirm idempotent-by-state (CLAUDE.md §7.7 — N4)", () => {
  it("IDEMPOTENT-BY-STATE: confirming the SAME WORK order twice (FRESH key each time) decrements fabric EXACTLY ONCE", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStocks(tx, FABRIC_A_ID);
      const orderId = await wf.createOrder(tx);
      const specs: wf.GarmentSpec[] = [
        { garment_type: "final" },
        { garment_type: "final" },
      ];
      await wf.saveWorkOrderGarments(tx, orderId, specs);

      // First confirm — fresh key #1.
      await wf.completeWorkOrder(tx, orderId, specs, {
        paid: 0,
        idempotencyKey: randomUUID(),
      });
      const afterOne = await fabricStocks(tx, FABRIC_A_ID);
      const singleDecrement = before.shop - afterOne.shop;
      expect(singleDecrement).toBeGreaterThan(0);

      // Second confirm — DIFFERENT key. The idempotency-key cache does NOT cover
      // this; the already-confirmed guard must. CLAUDE.md §7.7 + §Order Created
      // Phase C: confirming a confirmed order must not re-decrement.
      await wf.completeWorkOrder(tx, orderId, specs, {
        paid: 0,
        idempotencyKey: randomUUID(),
      });
      const afterTwo = await fabricStocks(tx, FABRIC_A_ID);

      // ORACLE (IDEMPOTENT-BY-STATE + CONSERVATION): stock after two confirms ==
      // stock after one. The second (fresh-key) confirm of an already-confirmed
      // order moved no stock.
      expect(afterTwo.shop).toBe(afterOne.shop);
      expect(before.shop - afterTwo.shop).toBe(singleDecrement);
    });
  });

  it("IDEMPOTENT-BY-STATE: re-confirming a confirmed SALES order (FRESH key) decrements shelf EXACTLY ONCE", async () => {
    await inRolledBackTx(async (tx) => {
      // create_complete_sales_order CREATES the order; re-running it with a fresh
      // key creates a *second* order, so it can't double-decrement the first.
      // The state-guarded re-confirm path is complete_sales_order (re-confirming
      // an EXISTING order). Build a draft SALES order, confirm it, then confirm
      // again with a fresh key.
      const before = await shelfStocks(tx, SHELF_A_ID);
      const qty = 4;

      const o = only(
        await tx`
          INSERT INTO orders (customer_id, brand, checkout_status, order_type, order_taker_id)
          VALUES (${CUSTOMER_ID}, ${BRAND}::brand, 'draft', 'SALES', ${CASHIER.id}::uuid)
          RETURNING id`,
        "sales draft",
      );
      const orderId = o.id as number;

      await confirmSalesOrder(tx, orderId, qty, randomUUID());
      const afterOne = await shelfStocks(tx, SHELF_A_ID);
      const singleDecrement = before.shop - afterOne.shop;
      expect(singleDecrement).toBe(qty);

      // Re-confirm with a DIFFERENT key — already-confirmed guard must stop the
      // re-decrement (CLAUDE.md §7.7).
      await confirmSalesOrder(tx, orderId, qty, randomUUID());
      const afterTwo = await shelfStocks(tx, SHELF_A_ID);

      // ORACLE (IDEMPOTENT-BY-STATE + CONSERVATION): exactly one decrement.
      expect(afterTwo.shop).toBe(afterOne.shop);
      expect(before.shop - afterTwo.shop).toBe(singleDecrement);
    });
  });
});

/** complete_sales_order RPC — re-confirm an existing draft/confirmed SALES order. */
async function confirmSalesOrder(
  tx: Tx,
  orderId: number,
  qty: number,
  key: string,
) {
  await tx`
    SELECT complete_sales_order(
      ${orderId},
      ${tx.json({
        paymentType: "cash",
        paid: 0,
        orderTaker: CASHIER.id,
        discountType: "flat",
        discountValue: 0,
        discountPercentage: 0,
        referralCode: null,
        total: qty * 25,
        orderTotal: qty * 25,
        shelfCharge: qty * 25,
        deliveryCharge: 0,
        expressCharge: 0,
        soakingCharge: 0,
        homeDelivery: false,
      })}::jsonb,
      ${tx.json([{ id: SHELF_A_ID, quantity: qty, unitPrice: 25 }])}::jsonb,
      ${key}::uuid
    )`;
}

// ════════════════════════════════════════════════════════════════════════════
// LEDGER METADATA ISOLATION — per-movement context must not leak forward
// ════════════════════════════════════════════════════════════════════════════
// Stock movements are stamped from transaction-local GUCs (app.movement_*) that
// the AFTER-UPDATE audit trigger reads. An RPC that sets a GUC but never clears
// it would leave it set for the NEXT stock change in the same transaction, which
// would silently inherit the stale value. This pins the invoice-photo case: an
// RPC that records a photo (restock_item) must reset app.movement_image_url so a
// later movement in the same tx carries its OWN context, not the photo.

/** restock_item with an invoice photo (named args; idempotency key stays last). */
function restockWithPhoto(tx: Tx, fabricId: number, qty: number, url: string) {
  return tx`
    SELECT restock_item(
      p_item_type => 'fabric'::stock_item_type,
      p_item_id => ${fabricId},
      p_location => 'shop'::stock_location,
      p_qty => ${qty},
      p_image_url => ${url},
      p_user_id => ${MANAGER.id}::uuid,
      p_idempotency_key => ${randomUUID()}::uuid
    )`;
}

/** image_url of the most-recent ledger row for a fabric + movement_type. */
async function latestImageUrl(
  tx: Tx,
  fabricId: number,
  movementType: string,
): Promise<string | null> {
  const r = only(
    await tx`
      SELECT image_url FROM stock_movements
      WHERE item_type = 'fabric'::stock_item_type AND item_id = ${fabricId}
        AND movement_type = ${movementType}::stock_movement_type
      ORDER BY id DESC LIMIT 1`,
    `latest ${movementType} movement for fabric ${fabricId}`,
  ) as unknown as { image_url: string | null };
  return r.image_url;
}

describe("ledger metadata isolation (movement context does not leak forward)", () => {
  it("IMAGE-URL ISOLATION: a restock invoice photo does not piggyback onto a later movement in the same transaction", async () => {
    await inRolledBackTx(async (tx) => {
      const url = "https://example.test/supplier-invoice.jpg";

      await restockWithPhoto(tx, FABRIC_A_ID, 5, url);

      // POSITIVE CONTROL: the restock row carries its own invoice photo.
      expect(await latestImageUrl(tx, FABRIC_A_ID, "restock")).toBe(url);

      // INVARIANT (per-movement metadata isolation): a later movement that
      // carries no photo of its own (a transfer dispatch) reflects ONLY its own
      // context — the restock photo must NOT bleed onto the transfer_out row.
      // If restock_item failed to reset app.movement_image_url, this row would
      // inherit the stale URL and the assertion would fail.
      const { transferId, itemId } = await requestFabricTransfer(tx, FABRIC_A_ID, 3);
      await dispatchTransfer(tx, transferId, [{ id: itemId, dispatched_qty: 3 }]);

      expect(await latestImageUrl(tx, FABRIC_A_ID, "transfer_out")).toBeNull();
    });
  });
});
