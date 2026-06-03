/**
 * Stock-conservation suite — CLAUDE.md AS THE SINGLE SOURCE OF TRUTH.
 *
 * Companion to workflow-refund-edges.test.ts. Where that file pins the garment
 * lifecycle around refunds, this file pins the STOCK side: refund restock caps,
 * customer-brought (OUT) fabric, and the dedicated inventory mutators
 * (record_waste / adjust_stock / validate_stocktake). It exercises the
 * stock-conservation hardening (N3 capped shelf restock, N6 OUT-fabric guard,
 * record_waste / adjust_stock locks + reason gates, validate_stocktake
 * all-or-nothing) against the real RPCs/triggers.
 *
 * TEST DISCIPLINE (CLAUDE.md §0.5 / §6.6 — tests are oracles, not mirrors):
 * EVERY `expect` derives its expected value from a named rule in CLAUDE.md
 * §4 (Inventory & transfers) / §2.6 (Cancellation / refund) or from a
 * UNIVERSAL INVARIANT — conservation of stock (you cannot return/waste more
 * than physically left/was on hand; the ledger's signed qty_delta sums to the
 * net physical change), idempotency = exactly-once, all-or-nothing validation.
 * NO expected value is sourced from triggers.sql. Each assertion carries a
 * `// SPEC:` or `// INVARIANT:` comment naming the rule it encodes. A failing
 * assertion means the implementation violates the spec/invariant: a bug to fix
 * in the code, never a test to relax.
 *
 * triggers.sql is referenced ONLY as a suspected-bug location — never as the
 * origin of an expected value.
 *
 * Every test runs in a rolled-back transaction; committed reference data is
 * untouched. The inventory RPCs (record_waste / adjust_stock / start_stocktake
 * / save_stocktake_counts / validate_stocktake) are not in the lifecycle
 * driver (which covers the garment flow), so they are called directly here on
 * the SAME committed fixtures and shared seed helpers — no new harness.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, tryInSavepoint, actAs, only, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";
import {
  CASHIER,
  MANAGER,
  ORDER_TAKER,
  FABRIC_A_ID,
  SHELF_A_ID,
} from "../../scripts/lifecycle/fixtures";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// ─── accessors ──────────────────────────────────────────────────────────────

async function fabricStock(tx: Tx, fabricId: number) {
  return only(
    await tx`SELECT real_stock, shop_stock, workshop_stock FROM fabrics WHERE id = ${fabricId}`,
    `fabric ${fabricId}`,
  ) as unknown as { real_stock: string; shop_stock: string; workshop_stock: string };
}

async function shelfStock(tx: Tx, shelfId: number) {
  return only(
    await tx`SELECT stock, shop_stock, workshop_stock FROM shelf WHERE id = ${shelfId}`,
    `shelf ${shelfId}`,
  ) as unknown as { stock: number; shop_stock: number; workshop_stock: number };
}

/** Sum of signed qty_delta on the ledger for an item+location+movement_type. */
async function ledgerDelta(
  tx: Tx,
  itemType: "fabric" | "shelf" | "accessory",
  itemId: number,
  location: "shop" | "workshop",
  movementType?: string,
): Promise<number> {
  const row = only(
    await tx`
      SELECT COALESCE(SUM(qty_delta), 0)::numeric AS d, COUNT(*)::int AS n
      FROM stock_movements
      WHERE item_type = ${itemType}::stock_item_type
        AND item_id = ${itemId}
        AND location = ${location}::stock_location
        ${movementType ? tx`AND movement_type = ${movementType}::stock_movement_type` : tx``}
    `,
    "ledgerDelta",
  ) as unknown as { d: string; n: number };
  return Number(row.d);
}

async function ledgerCount(
  tx: Tx,
  itemType: "fabric" | "shelf" | "accessory",
  itemId: number,
  location: "shop" | "workshop",
  movementType: string,
): Promise<number> {
  const row = only(
    await tx`
      SELECT COUNT(*)::int AS n
      FROM stock_movements
      WHERE item_type = ${itemType}::stock_item_type
        AND item_id = ${itemId}
        AND location = ${location}::stock_location
        AND movement_type = ${movementType}::stock_movement_type
    `,
    "ledgerCount",
  ) as unknown as { n: number };
  return row.n;
}

/** order_shelf_items row created by a sales-order confirm (its id is the refund's shelf_item_id). */
async function shelfLine(tx: Tx, orderId: number, shelfId: number) {
  return only(
    await tx`
      SELECT id, quantity, refunded_qty
      FROM order_shelf_items WHERE order_id = ${orderId} AND shelf_id = ${shelfId}`,
    `shelf line for order ${orderId}`,
  ) as unknown as { id: number; quantity: number; refunded_qty: number };
}

/** Direct record_waste RPC call (not in the lifecycle driver). */
async function recordWaste(
  tx: Tx,
  args: {
    itemType?: "fabric" | "shelf" | "accessory";
    itemId: number;
    location?: "shop" | "workshop";
    qty: number;
    reason?: string;
    unitCost?: number | null;
    actingUserId: string;
    idempotencyKey?: string;
  },
) {
  await actAs(tx, args.actingUserId);
  const res = only(
    await tx`
      SELECT record_waste(
        ${args.itemType ?? "fabric"}::stock_item_type,
        ${args.itemId},
        ${args.location ?? "shop"}::stock_location,
        ${args.qty},
        ${args.reason ?? "staff_mistake"},
        NULL, NULL,
        ${args.unitCost ?? null}::numeric,
        ${args.actingUserId}::uuid,
        ${args.idempotencyKey ?? randomUUID()}::uuid
      ) AS r`,
    "record_waste",
  );
  return res.r as { success: boolean; new_stock: string; cost: string };
}

/** Direct adjust_stock RPC call (not in the lifecycle driver). */
async function adjustStock(
  tx: Tx,
  args: {
    itemType?: "fabric" | "shelf" | "accessory";
    itemId: number;
    location?: "shop" | "workshop";
    newQty: number;
    reason?: string;
    actingUserId: string;
  },
) {
  await actAs(tx, args.actingUserId);
  const res = only(
    await tx`
      SELECT adjust_stock(
        ${args.itemType ?? "fabric"}::stock_item_type,
        ${args.itemId},
        ${args.location ?? "shop"}::stock_location,
        ${args.newQty},
        ${args.reason ?? "recount"},
        NULL,
        ${args.actingUserId}::uuid
      ) AS r`,
    "adjust_stock",
  );
  return res.r as { success: boolean; old_stock: string; new_stock: string };
}

/** Stocktake start → save counts → validate, all direct RPCs (not in the driver). */
async function startStocktake(tx: Tx, side: "shop" | "workshop", actingUserId: string) {
  await actAs(tx, actingUserId);
  const res = only(
    await tx`SELECT start_stocktake(${side}::stock_location, 'ERTH'::brand, ${actingUserId}::uuid, ${randomUUID()}::uuid) AS r`,
    "start_stocktake",
  );
  return (res.r as { session_id: number }).session_id;
}

async function saveStocktakeCounts(
  tx: Tx,
  sessionId: number,
  counts: { item_type: string; item_id: number; counted_qty: number; reason?: string }[],
  actingUserId: string,
) {
  await actAs(tx, actingUserId);
  await tx`SELECT save_stocktake_counts(${sessionId}, ${tx.json(counts)}::jsonb, ${actingUserId}::uuid)`;
}

async function validateStocktake(
  tx: Tx,
  sessionId: number,
  actingUserId: string,
  idempotencyKey?: string,
) {
  await actAs(tx, actingUserId);
  const res = only(
    await tx`SELECT validate_stocktake(${sessionId}, ${actingUserId}::uuid, ${idempotencyKey ?? randomUUID()}::uuid) AS r`,
    "validate_stocktake",
  );
  return res.r as { success: boolean; adjustments_applied: number };
}

// Default per-garment price snapshot is 15+10+3 = 28 (driver.ts saveWorkOrderGarments).
const GARMENT_PRICE = 28;

// ════════════════════════════════════════════════════════════════════════════
// N3 — shelf-refund restock cap (conservation: cannot return more than left)
// ════════════════════════════════════════════════════════════════════════════

describe("N3 shelf-refund restock cap (CLAUDE.md §4 stock ledger; conservation)", () => {
  it("refund of EXACTLY the remaining quantity restocks the full delta — net shelf stock returns to pre-order", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await shelfStock(tx, SHELF_A_ID);

      // Sales order: 3 units of SHELF_A. Confirm decrements shop_stock by 3.
      const orderId = (
        await wf.createSalesOrder(tx, [
          { id: SHELF_A_ID, quantity: 3, unitPrice: 25 },
        ])
      ).id as number;

      const consumed = await shelfStock(tx, SHELF_A_ID);
      // INVARIANT (conservation): confirm consumed exactly the ordered qty.
      expect(before.shop_stock - consumed.shop_stock).toBe(3);

      const line = await shelfLine(tx, orderId, SHELF_A_ID);

      // Refund all 3 (the full unrefunded remainder), restock=true.
      await wf.recordPayment(tx, orderId, 75, {
        refund: {
          reason: "customer returned all 3",
          items: [{ shelf_item_id: line.id, quantity: 3, amount: 75, restock: true }],
        },
      });

      const after = await shelfStock(tx, SHELF_A_ID);
      // SPEC: CLAUDE.md §4 "Receive ... stock lands" + transfer/return semantics —
      // a returned shelf unit re-enters the side's own count.
      // INVARIANT (conservation): returning exactly what was consumed restores
      // the pre-order shop_stock — no more, no less.
      expect(after.shop_stock).toBe(before.shop_stock);

      // INVARIANT (ledger conserves): signed qty_delta over the whole episode
      // (one −3 consumption + one +3 return) nets to zero on the shop side.
      expect(await ledgerDelta(tx, "shelf", SHELF_A_ID, "shop")).toBe(0);
      // The return movement adds back exactly +3.
      expect(await ledgerDelta(tx, "shelf", SHELF_A_ID, "shop", "return")).toBe(3);
    });
  });

  it("refund BEYOND the remaining quantity restocks ONLY the capped delta — never more than was consumed", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await shelfStock(tx, SHELF_A_ID);

      // Sales order: 2 units. Only 2 ever left inventory.
      const orderId = (
        await wf.createSalesOrder(tx, [
          { id: SHELF_A_ID, quantity: 2, unitPrice: 25 },
        ])
      ).id as number;
      const line = await shelfLine(tx, orderId, SHELF_A_ID);

      const consumed = await shelfStock(tx, SHELF_A_ID);
      expect(before.shop_stock - consumed.shop_stock).toBe(2); // exactly 2 consumed

      // Cashier mistakenly asks to refund 5 (more than the 2 ordered). Refund
      // amount stays within the items-total cap (2 units @ 25 = 50): a single
      // line's `amount` is what bounds the cash refund, while `quantity` is the
      // restock request. Here amount=50 (the true 2-unit value), quantity=5.
      await wf.recordPayment(tx, orderId, 50, {
        refund: {
          reason: "over-quantity restock attempt",
          items: [{ shelf_item_id: line.id, quantity: 5, amount: 50, restock: true }],
        },
      });

      const after = await shelfStock(tx, SHELF_A_ID);
      // SPEC: CLAUDE.md §4 + INVARIANT (conservation) — "you cannot return more
      // than left". Only 2 units were ever consumed, so at most 2 may re-enter
      // stock. Restocking 5 would manufacture 3 phantom units.
      expect(after.shop_stock).toBe(before.shop_stock); // exactly +2 back, not +5
      expect(after.shop_stock - consumed.shop_stock).toBe(2);

      // refunded_qty is itself capped at the ordered quantity (cannot exceed 2).
      const lineAfter = await shelfLine(tx, orderId, SHELF_A_ID);
      expect(lineAfter.refunded_qty).toBe(2);

      // INVARIANT (ledger): the return movement is the capped +2, not +5.
      expect(await ledgerDelta(tx, "shelf", SHELF_A_ID, "shop", "return")).toBe(2);
      // Whole episode nets to zero (−2 consume + 2 return).
      expect(await ledgerDelta(tx, "shelf", SHELF_A_ID, "shop")).toBe(0);
    });
  });

  it("a SECOND refund after fully refunding the line restocks NOTHING (remainder already zero)", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await shelfStock(tx, SHELF_A_ID);
      const orderId = (
        await wf.createSalesOrder(tx, [
          { id: SHELF_A_ID, quantity: 2, unitPrice: 25 },
        ])
      ).id as number;
      const line = await shelfLine(tx, orderId, SHELF_A_ID);

      // First refund: all 2 back.
      await wf.recordPayment(tx, orderId, 50, {
        refund: {
          reason: "return both",
          items: [{ shelf_item_id: line.id, quantity: 2, amount: 50, restock: true }],
        },
      });
      const afterFirst = await shelfStock(tx, SHELF_A_ID);
      expect(afterFirst.shop_stock).toBe(before.shop_stock);

      // Second refund of the SAME line, qty 2 again. Remainder is now 0, so the
      // capped delta is 0 — nothing re-enters stock. (Amount 0: nothing left to
      // refund in cash either, but the restock cap is the conservation point.)
      await wf.recordPayment(tx, orderId, 0, {
        refund: {
          reason: "duplicate return",
          items: [{ shelf_item_id: line.id, quantity: 2, amount: 0, restock: true }],
        },
      });

      const afterSecond = await shelfStock(tx, SHELF_A_ID);
      // INVARIANT (conservation): no units left a second time, so none come
      // back. Stock unchanged from after the first (full) refund.
      expect(afterSecond.shop_stock).toBe(afterFirst.shop_stock);
      // Total return on the ledger is still exactly the 2 that were consumed.
      expect(await ledgerDelta(tx, "shelf", SHELF_A_ID, "shop", "return")).toBe(2);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §2.6 — refund money caps + idempotent replay (conservation of paid + stock)
// ════════════════════════════════════════════════════════════════════════════

describe("§2.6 refund caps + idempotency (CLAUDE.md §2.6 'Refund amount is capped' / §7.7 idempotency)", () => {
  it("a refund cannot drive orders.paid below 0 — over-paid refund is rejected, paid + stock unchanged", async () => {
    await inRolledBackTx(async (tx) => {
      // Work order, one garment, paid in full (28).
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }],
        { paid: GARMENT_PRICE },
      );
      const id = garments[0]!.id;

      const paidBefore = Number((await wf.getOrder(tx, orderId)).paid);
      const stockBefore = await fabricStock(tx, FABRIC_A_ID);
      expect(paidBefore).toBe(GARMENT_PRICE);

      // Attempt to refund MORE than was ever paid (28 paid, refund 40).
      // SPEC: CLAUDE.md §2.6 "Refund amount is capped" — "A refund may not drive
      // orders.paid below 0". The RPC must reject.
      expect(
        await tryInSavepoint(tx, (sp) =>
          wf.recordPayment(sp, orderId, 40, {
            refund: {
              reason: "attempt to over-refund",
              items: [
                {
                  garment_id: id,
                  fabric: true,
                  stitching: true,
                  style: true,
                  amount: 40,
                },
              ],
            },
          }),
        ),
      ).not.toBeNull();

      // INVARIANT (conservation): a rejected refund changes nothing — neither
      // the money nor the fabric stock moved.
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(paidBefore);
      const stockAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockAfter.shop_stock)).toBe(Number(stockBefore.shop_stock));
      expect(Number(stockAfter.real_stock)).toBe(Number(stockBefore.real_stock));
    });
  });

  it("a refund replayed with the SAME idempotency key applies once — paid + stock + restock unchanged on replay", async () => {
    await inRolledBackTx(async (tx) => {
      const stockBefore = await shelfStock(tx, SHELF_A_ID);

      const orderId = (
        await wf.createSalesOrder(tx, [
          { id: SHELF_A_ID, quantity: 2, unitPrice: 25 },
        ])
      ).id as number;
      const line = await shelfLine(tx, orderId, SHELF_A_ID);

      const KEY = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const refund = {
        reason: "return both — replayed",
        items: [{ shelf_item_id: line.id, quantity: 2, amount: 50, restock: true }],
      };

      // First call: the refund commits.
      await wf.recordPayment(tx, orderId, 50, { refund, idempotencyKey: KEY });
      const paidAfterFirst = Number((await wf.getOrder(tx, orderId)).paid);
      const stockAfterFirst = await shelfStock(tx, SHELF_A_ID);

      // Lost-response replay: SAME key. Must be a no-op replay.
      const replay = await wf.recordPayment(tx, orderId, 50, {
        refund,
        idempotencyKey: KEY,
      });

      // SPEC: CLAUDE.md §7.7 "Idempotency is mandatory on retryable mutations …
      // a lost-response replay must produce exactly one effect" + §2.6
      // "Idempotent. A refund replayed with the same idempotency key applies
      // once."
      expect((replay as { idempotent_replay?: boolean }).idempotent_replay).toBe(true);

      // INVARIANT (exactly-once): money refunded once, stock restocked once.
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(paidAfterFirst);
      const stockAfterReplay = await shelfStock(tx, SHELF_A_ID);
      expect(stockAfterReplay.shop_stock).toBe(stockAfterFirst.shop_stock);
      // The +2 return is not double-applied: net of (−2 consume, +2 return) = 0,
      // and stock is back to pre-order, never above it.
      expect(stockAfterReplay.shop_stock).toBe(stockBefore.shop_stock);
      expect(await ledgerDelta(tx, "shelf", SHELF_A_ID, "shop", "return")).toBe(2);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// N6 — customer-brought (OUT) fabric + post-hand-over: restock NOTHING
// ════════════════════════════════════════════════════════════════════════════

describe("N6 customer fabric / post-hand-over refund restocks nothing (CLAUDE.md §4 customer fabric, §2.6)", () => {
  it("full-garment refund with fabric_restock on an OUT-fabric garment restocks NOTHING (OUT fabric never entered stock)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }],
        { paid: GARMENT_PRICE },
      );
      const id = garments[0]!.id;

      // Mark the garment as using the customer's OWN cloth. CLAUDE.md §4:
      // "Customer fabric is never part of either stock and is never
      // decremented." The driver seeds fabric_source='IN'; here the test owns
      // the scenario and flips it to OUT to model customer-brought cloth.
      await tx`UPDATE garments SET fabric_source = 'OUT' WHERE id = ${id}`;

      // Snapshot AFTER flipping to OUT — this is the conservation baseline.
      const stockBefore = await fabricStock(tx, FABRIC_A_ID);

      // Full per-garment refund WITH fabric_restock requested.
      await wf.recordPayment(tx, orderId, GARMENT_PRICE, {
        refund: {
          reason: "customer cancelled — brought own cloth",
          items: [
            {
              garment_id: id,
              fabric: true,
              stitching: true,
              style: true,
              fabric_restock: true,
              amount: GARMENT_PRICE,
            },
          ],
        },
      });

      // SPEC: CLAUDE.md §4 "Customer fabric ... is never decremented" — and so
      // never RE-stocked on return. INVARIANT (conservation): OUT cloth never
      // entered the catalogue stock, so a restock of it must add zero.
      const stockAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockAfter.shop_stock)).toBe(Number(stockBefore.shop_stock));
      expect(Number(stockAfter.real_stock)).toBe(Number(stockBefore.real_stock));
      // No 'return' ledger row was written for this fabric+side.
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "return")).toBe(0);
    });
  });

  it("post-hand-over (completed) garment full refund: money refunded, stays completed, fabric NOT restocked", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(
        tx,
        [{ garment_type: "final" }],
        { paid: GARMENT_PRICE },
      );
      const id = garments[0]!.id;

      // Drive to shop and hand over (collect) → completed.
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [id], { start: true });
      await wf.runProduction(tx, [id]);
      await wf.submitQc(tx, id, { pass: true });
      await wf.workshopDispatch(tx, [id]);
      await wf.shopReceive(tx, [id]);
      await wf.finalCollect(tx, id, { homeDelivery: false });

      const g0 = only(
        await tx`SELECT piece_stage FROM garments WHERE id = ${id}`,
        "garment",
      ) as unknown as { piece_stage: string };
      expect(g0.piece_stage).toBe("completed");

      const stockBefore = await fabricStock(tx, FABRIC_A_ID);
      const paidBefore = Number((await wf.getOrder(tx, orderId)).paid);

      // Full refund WITH fabric_restock requested on the completed garment.
      await wf.recordPayment(tx, orderId, GARMENT_PRICE, {
        refund: {
          reason: "post-handover refund",
          items: [
            {
              garment_id: id,
              fabric: true,
              stitching: true,
              style: true,
              fabric_restock: true,
              amount: GARMENT_PRICE,
            },
          ],
        },
      });

      // SPEC: CLAUDE.md §2.6 "Post-hand-over exception" — money is refunded.
      expect(Number((await wf.getOrder(tx, orderId)).paid)).toBe(
        paidBefore - GARMENT_PRICE,
      );
      // SPEC: §2.6 — the garment "stays completed — NOT discarded (you cannot
      // un-deliver a physical garment)".
      const g1 = only(
        await tx`SELECT piece_stage FROM garments WHERE id = ${id}`,
        "garment",
      ) as unknown as { piece_stage: string };
      expect(g1.piece_stage).toBe("completed");

      // SPEC: §2.6 — "fabric-restock does not apply even if requested (the
      // fabric is in the customer's garment)". INVARIANT (conservation): the
      // physical fabric left in the handed-over piece; nothing re-enters stock.
      const stockAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockAfter.shop_stock)).toBe(Number(stockBefore.shop_stock));
      expect(Number(stockAfter.real_stock)).toBe(Number(stockBefore.real_stock));
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "return")).toBe(0);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// record_waste — exact-qty decrement, qty<=0 reject, cost-threshold manager gate
// ════════════════════════════════════════════════════════════════════════════

describe("record_waste (CLAUDE.md §4 Damage/Waste; conservation)", () => {
  it("decrements the side's OWN stock by EXACTLY qty and writes a waste movement of −qty", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStock(tx, FABRIC_A_ID);

      // Waste 4 meters of shop fabric. Unit cost 0 so the manager gate is moot
      // (this test isolates the conservation invariant; the gate is tested below).
      const res = await recordWaste(tx, {
        itemId: FABRIC_A_ID,
        location: "shop",
        qty: 4,
        reason: "mis_cut",
        unitCost: 0,
        actingUserId: ORDER_TAKER.id, // staff may waste below the threshold
      });

      const after = await fabricStock(tx, FABRIC_A_ID);
      // SPEC: CLAUDE.md §4 "Damage/Waste ... Quantity damaged (the amount
      // removed — not a new total) ... against the side's own count".
      // INVARIANT (conservation): exactly qty leaves the side's own count.
      expect(Number(before.shop_stock) - Number(after.shop_stock)).toBe(4);
      expect(Number(res.new_stock)).toBe(Number(after.shop_stock));

      // SPEC: §4 two-stocks rule — the OTHER side's count is untouched.
      expect(Number(after.workshop_stock)).toBe(Number(before.workshop_stock));

      // INVARIANT (ledger conserves): the waste row is signed −4.
      expect(await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(-4);
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(1);
    });
  });

  it("rejects qty <= 0 — no stock change, no ledger row", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStock(tx, FABRIC_A_ID);

      // SPEC: CLAUDE.md §4 "Quantity damaged (the amount removed)" — a removal
      // of zero/negative is not a removal. INVARIANT: a no-op cannot mutate
      // stock. (N1-style guard: qty<=0 rejected.)
      expect(
        await tryInSavepoint(tx, (sp) =>
          recordWaste(sp, {
            itemId: FABRIC_A_ID,
            location: "shop",
            qty: 0,
            reason: "mis_cut",
            unitCost: 0,
            actingUserId: ORDER_TAKER.id,
          }),
        ),
      ).not.toBeNull();
      expect(
        await tryInSavepoint(tx, (sp) =>
          recordWaste(sp, {
            itemId: FABRIC_A_ID,
            location: "shop",
            qty: -3,
            reason: "mis_cut",
            unitCost: 0,
            actingUserId: ORDER_TAKER.id,
          }),
        ),
      ).not.toBeNull();

      const after = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(after.shop_stock)).toBe(Number(before.shop_stock));
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(0);
    });
  });

  it("cannot waste MORE than is on hand (conservation: stock never goes negative)", async () => {
    await inRolledBackTx(async (tx) => {
      // FABRIC_B has the same seed; isolate by acting on a small shop count.
      // Reduce FABRIC_A shop count to a known small value via adjust, then try
      // to waste beyond it.
      await adjustStock(tx, {
        itemId: FABRIC_A_ID,
        location: "shop",
        newQty: 2,
        reason: "recount for waste-overflow test",
        actingUserId: MANAGER.id,
      });
      const before = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(before.shop_stock)).toBe(2);

      // SPEC: §4 waste "against the side's own count"; INVARIANT (conservation):
      // you cannot remove more than physically present — stock must never go
      // negative.
      expect(
        await tryInSavepoint(tx, (sp) =>
          recordWaste(sp, {
            itemId: FABRIC_A_ID,
            location: "shop",
            qty: 5,
            reason: "lost",
            unitCost: 0,
            actingUserId: MANAGER.id,
          }),
        ),
      ).not.toBeNull();

      const after = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(after.shop_stock)).toBe(2); // unchanged, not negative
    });
  });

  it("AT/ABOVE the cost threshold a NON-manager is rejected; a manager succeeds (RBAC gate by cost)", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStock(tx, FABRIC_A_ID);

      // SPEC: CLAUDE.md §4 "Manager-approval gate by cost ... At/above the
      // threshold, only a manager/admin may perform it — the RPC rejects an
      // over-threshold waste from a non-manager". Use a high unit_cost so
      // qty * unit_cost is unambiguously over any small threshold, regardless
      // of the exact KWD figure (which is an impl detail, not asserted).
      const rejection = await tryInSavepoint(tx, (sp) =>
        recordWaste(sp, {
          itemId: FABRIC_A_ID,
          location: "shop",
          qty: 10,
          reason: "supplier_defect",
          unitCost: 100, // 10 * 100 = 1000 KWD: unambiguously over any threshold
          actingUserId: ORDER_TAKER.id, // role 'staff' — not a manager
        }),
      );
      expect(rejection).not.toBeNull();
      // Secondary check (message is impl wording; the oracle is the §4 rule).
      expect(String((rejection as Error).message)).toMatch(/manager/i);

      // Rejected ⇒ no stock change.
      const afterReject = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(afterReject.shop_stock)).toBe(Number(before.shop_stock));

      // SPEC: §4 — a manager/admin MAY record the same over-threshold waste.
      const res = await recordWaste(tx, {
        itemId: FABRIC_A_ID,
        location: "shop",
        qty: 10,
        reason: "supplier_defect",
        unitCost: 100,
        actingUserId: MANAGER.id, // role 'manager'
      });
      const afterAllow = await fabricStock(tx, FABRIC_A_ID);
      // INVARIANT (conservation): the manager's waste removes exactly qty.
      expect(Number(before.shop_stock) - Number(afterAllow.shop_stock)).toBe(10);
      expect(Number(res.new_stock)).toBe(Number(afterAllow.shop_stock));
    });
  });

  it("replayed with the SAME idempotency key, waste applies once (exactly-once)", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStock(tx, FABRIC_A_ID);
      const KEY = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

      await recordWaste(tx, {
        itemId: FABRIC_A_ID,
        location: "shop",
        qty: 3,
        reason: "mis_cut",
        unitCost: 0,
        actingUserId: MANAGER.id,
        idempotencyKey: KEY,
      });
      const afterFirst = await fabricStock(tx, FABRIC_A_ID);

      // Lost-response replay, SAME key.
      await recordWaste(tx, {
        itemId: FABRIC_A_ID,
        location: "shop",
        qty: 3,
        reason: "mis_cut",
        unitCost: 0,
        actingUserId: MANAGER.id,
        idempotencyKey: KEY,
      });

      // SPEC: CLAUDE.md §7.7 idempotency. INVARIANT (exactly-once): the second
      // waste is a replay — exactly one −3, not −6.
      expect(Number(before.shop_stock) - Number(afterFirst.shop_stock)).toBe(3);
      const afterReplay = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(afterReplay.shop_stock)).toBe(Number(afterFirst.shop_stock));
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(1);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// adjust_stock — absolute set; ledger delta == new − old
// ════════════════════════════════════════════════════════════════════════════

describe("adjust_stock (CLAUDE.md §4 Adjust = count correction; conservation of the diff)", () => {
  it("sets the absolute count and writes ONE adjustment movement whose delta == new − old (up)", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStock(tx, FABRIC_A_ID);
      const oldQty = Number(before.shop_stock);
      const newQty = oldQty + 12; // count correction up (e.g. "found")

      const res = await adjustStock(tx, {
        itemId: FABRIC_A_ID,
        location: "shop",
        newQty,
        reason: "recount up",
        actingUserId: MANAGER.id,
      });

      const after = await fabricStock(tx, FABRIC_A_ID);
      // SPEC: CLAUDE.md §4 "Adjust is for count corrections (recount up/down...)";
      // it sets an absolute new value. INVARIANT: the stored count IS the new
      // absolute value.
      expect(Number(after.shop_stock)).toBe(newQty);
      expect(Number(res.old_stock)).toBe(oldQty);
      expect(Number(res.new_stock)).toBe(newQty);

      // INVARIANT (ledger conserves): the adjustment's signed delta equals the
      // net change new − old.
      expect(await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop", "adjustment")).toBe(
        newQty - oldQty,
      );
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "adjustment")).toBe(1);
      // Two-stocks rule: the workshop side is untouched.
      expect(Number(after.workshop_stock)).toBe(Number(before.workshop_stock));
    });
  });

  it("sets the absolute count down and the ledger delta is the (negative) net change", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStock(tx, FABRIC_A_ID);
      const oldQty = Number(before.shop_stock);
      const newQty = oldQty - 7;

      await adjustStock(tx, {
        itemId: FABRIC_A_ID,
        location: "shop",
        newQty,
        reason: "recount down",
        actingUserId: MANAGER.id,
      });

      const after = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(after.shop_stock)).toBe(newQty);
      // INVARIANT (ledger conserves): delta == new − old (== −7).
      expect(await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop", "adjustment")).toBe(
        newQty - oldQty,
      );
    });
  });

  it("rejects a missing reason — count correction always carries a reason (no silent stock edit)", async () => {
    await inRolledBackTx(async (tx) => {
      const before = await fabricStock(tx, FABRIC_A_ID);

      // SPEC: CLAUDE.md §4 "No silent stock edits ... each requiring a reason."
      await actAs(tx, MANAGER.id);
      expect(
        await tryInSavepoint(
          tx,
          (sp) =>
            sp`SELECT adjust_stock('fabric'::stock_item_type, ${FABRIC_A_ID}, 'shop'::stock_location, ${Number(before.shop_stock) + 1}, ''::text, NULL, ${MANAGER.id}::uuid)`,
        ),
      ).not.toBeNull();

      const after = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(after.shop_stock)).toBe(Number(before.shop_stock));
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "adjustment")).toBe(0);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// validate_stocktake — apply variances, all-or-nothing, idempotent
// ════════════════════════════════════════════════════════════════════════════

describe("validate_stocktake (CLAUDE.md §4 Stocktake; conservation + all-or-nothing)", () => {
  it("applies each non-zero variance so post-validate stock == counted (variance reason present)", async () => {
    await inRolledBackTx(async (tx) => {
      const fBefore = await fabricStock(tx, FABRIC_A_ID);
      const sBefore = await shelfStock(tx, SHELF_A_ID);

      const fCounted = Number(fBefore.shop_stock) - 6; // physical short by 6
      const sCounted = sBefore.shop_stock + 4; // physical over by 4

      const sessionId = await startStocktake(tx, "shop", MANAGER.id);
      await saveStocktakeCounts(
        tx,
        sessionId,
        [
          { item_type: "fabric", item_id: FABRIC_A_ID, counted_qty: fCounted, reason: "recount short" },
          { item_type: "shelf", item_id: SHELF_A_ID, counted_qty: sCounted, reason: "found extras" },
        ],
        MANAGER.id,
      );

      const res = await validateStocktake(tx, sessionId, MANAGER.id);
      // SPEC: CLAUDE.md §4 "each non-zero variance is applied as an adjustment".
      expect(res.adjustments_applied).toBe(2);

      // SPEC: §4 "system computes variance (counted − system)" and applies it.
      // INVARIANT: after validate, the side's stock equals the entered physical
      // count — the recount is the new truth.
      const fAfter = await fabricStock(tx, FABRIC_A_ID);
      const sAfter = await shelfStock(tx, SHELF_A_ID);
      expect(Number(fAfter.shop_stock)).toBe(fCounted);
      expect(sAfter.shop_stock).toBe(sCounted);

      // INVARIANT (ledger conserves): each applied variance is one adjustment
      // whose delta is counted − system.
      expect(await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop", "adjustment")).toBe(
        fCounted - Number(fBefore.shop_stock),
      );
      expect(await ledgerDelta(tx, "shelf", SHELF_A_ID, "shop", "adjustment")).toBe(
        sCounted - sBefore.shop_stock,
      );
    });
  });

  it("a zero-variance line applies NO adjustment (counted == system → nothing to reconcile)", async () => {
    await inRolledBackTx(async (tx) => {
      const fBefore = await fabricStock(tx, FABRIC_A_ID);

      const sessionId = await startStocktake(tx, "shop", MANAGER.id);
      // Count exactly equals system — no reason needed (variance is zero).
      await saveStocktakeCounts(
        tx,
        sessionId,
        [{ item_type: "fabric", item_id: FABRIC_A_ID, counted_qty: Number(fBefore.shop_stock) }],
        MANAGER.id,
      );

      const res = await validateStocktake(tx, sessionId, MANAGER.id);
      // SPEC: §4 "a variance reason is mandatory on any NON-ZERO line" — a zero
      // line is fine and applies nothing. INVARIANT: stock unchanged.
      expect(res.adjustments_applied).toBe(0);
      const fAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(fAfter.shop_stock)).toBe(Number(fBefore.shop_stock));
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "adjustment")).toBe(0);
    });
  });

  it("a non-zero variance with NO reason ABORTS the whole validate — no partial application", async () => {
    await inRolledBackTx(async (tx) => {
      const fBefore = await fabricStock(tx, FABRIC_A_ID);
      const sBefore = await shelfStock(tx, SHELF_A_ID);

      const sessionId = await startStocktake(tx, "shop", MANAGER.id);
      // First line: a valid non-zero variance WITH a reason (would apply).
      // Second line: a non-zero variance with NO reason (must abort everything).
      await saveStocktakeCounts(
        tx,
        sessionId,
        [
          { item_type: "fabric", item_id: FABRIC_A_ID, counted_qty: Number(fBefore.shop_stock) - 3, reason: "short" },
          { item_type: "shelf", item_id: SHELF_A_ID, counted_qty: sBefore.shop_stock + 5 /* NO reason */ },
        ],
        MANAGER.id,
      );

      // SPEC: CLAUDE.md §4 "a variance reason is mandatory on any non-zero line"
      // → "a manager validates to COMMIT". A missing reason on any non-zero line
      // aborts the commit.
      expect(
        await tryInSavepoint(tx, (sp) => validateStocktake(sp, sessionId, MANAGER.id)),
      ).not.toBeNull();

      // INVARIANT (all-or-nothing / atomic commit): NEITHER line's stock moved —
      // not even the valid first line. The whole transaction rolled back.
      const fAfter = await fabricStock(tx, FABRIC_A_ID);
      const sAfter = await shelfStock(tx, SHELF_A_ID);
      expect(Number(fAfter.shop_stock)).toBe(Number(fBefore.shop_stock));
      expect(sAfter.shop_stock).toBe(sBefore.shop_stock);
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "adjustment")).toBe(0);
      expect(await ledgerCount(tx, "shelf", SHELF_A_ID, "shop", "adjustment")).toBe(0);

      // The session is NOT frozen — it can be corrected and re-validated.
      const session = only(
        await tx`SELECT status FROM stocktake_sessions WHERE id = ${sessionId}`,
        "stocktake session",
      ) as unknown as { status: string };
      expect(session.status).toBe("open");
    });
  });

  it("a replayed validate (SAME key) applies once — stock + adjustments unchanged on replay", async () => {
    await inRolledBackTx(async (tx) => {
      const fBefore = await fabricStock(tx, FABRIC_A_ID);
      const fCounted = Number(fBefore.shop_stock) - 8;

      const sessionId = await startStocktake(tx, "shop", MANAGER.id);
      await saveStocktakeCounts(
        tx,
        sessionId,
        [{ item_type: "fabric", item_id: FABRIC_A_ID, counted_qty: fCounted, reason: "recount" }],
        MANAGER.id,
      );

      const KEY = "cccccccc-cccc-cccc-cccc-cccccccccccc";
      const first = await validateStocktake(tx, sessionId, MANAGER.id, KEY);
      expect(first.adjustments_applied).toBe(1);
      const fAfterFirst = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(fAfterFirst.shop_stock)).toBe(fCounted);

      // Lost-response replay, SAME key.
      const replay = await validateStocktake(tx, sessionId, MANAGER.id, KEY);

      // SPEC: CLAUDE.md §7.7 idempotency. INVARIANT (exactly-once): the replay
      // returns the original summary and applies no further adjustment.
      expect(replay.adjustments_applied).toBe(1);
      const fAfterReplay = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(fAfterReplay.shop_stock)).toBe(fCounted); // not double-adjusted
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "adjustment")).toBe(1);
    });
  });

  it("only a MANAGER may validate — a non-manager is rejected (no stock change)", async () => {
    await inRolledBackTx(async (tx) => {
      const fBefore = await fabricStock(tx, FABRIC_A_ID);

      const sessionId = await startStocktake(tx, "shop", ORDER_TAKER.id); // staff may enter
      await saveStocktakeCounts(
        tx,
        sessionId,
        [{ item_type: "fabric", item_id: FABRIC_A_ID, counted_qty: Number(fBefore.shop_stock) - 2, reason: "short" }],
        ORDER_TAKER.id,
      );

      // SPEC: CLAUDE.md §4 "Entering counts is open to staff; only a manager
      // validates." A staff validate must be rejected.
      expect(
        await tryInSavepoint(tx, (sp) => validateStocktake(sp, sessionId, ORDER_TAKER.id)),
      ).not.toBeNull();

      const fAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(fAfter.shop_stock)).toBe(Number(fBefore.shop_stock));
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "adjustment")).toBe(0);
    });
  });
});
