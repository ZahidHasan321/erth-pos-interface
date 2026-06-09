/**
 * Redo material & waste conservation suite — CLAUDE.md AS THE SINGLE SOURCE OF
 * TRUTH (Group A: §2.5 Reject-Redo / final Needs-Redo, §4 redo material waste,
 * §2.8 "finals waiting on replacement brova").
 *
 * Companion to workflow.conservation-refund-waste.test.ts. Where that file pins
 * refund/record_waste/adjust/stocktake conservation, this file pins the REDO
 * episode's fabric accounting: the replacement auto-consumes a fresh cut while
 * the scrapped original's already-cut length is recorded as a NET-ZERO waste
 * annotation (qty_delta=0, annotated_qty=L) attributed by root_cause — so the
 * ledger conserves at exactly -2L (one wasted cut + one good replacement left
 * stock) and the waste report still surfaces the scrap with its cost.
 *
 * TEST DISCIPLINE (CLAUDE.md §0.2 / §7 — tests are oracles, not mirrors):
 * EVERY `expect` derives its value from a named rule in the Group A plan / spec
 * or from a UNIVERSAL INVARIANT — stock conservation (the ledger's
 * ABS(qty_delta)+annotated_qty surfaces every physical loss exactly once; the
 * signed qty_delta sums to the net physical change), idempotency = exactly-once,
 * the double-replacement guard. NO expected value is read off the RPC body.
 * L = 3 m (driver consumes length:3 per garment from FABRIC_A); FABRIC_A's
 * price_per_meter is 5 (seed) ⇒ scrap cost = L × 5 = 15.
 *
 * Every test runs in a rolled-back transaction; committed reference data is
 * untouched.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, tryInSavepoint, only, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";
import { FABRIC_A_ID } from "../../scripts/lifecycle/fixtures";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// L = fabric length cut per garment by the driver (driver.ts completeWorkOrder
// passes { length: 3 } per garment). FABRIC_A price_per_meter = 5 (seed.ts).
const L = 3;
const FABRIC_A_PRICE = 5;

// ─── accessors ──────────────────────────────────────────────────────────────

async function fabricStock(tx: Tx, fabricId: number) {
  return only(
    await tx`SELECT real_stock, shop_stock, workshop_stock FROM fabrics WHERE id = ${fabricId}`,
    `fabric ${fabricId}`,
  ) as unknown as { real_stock: string; shop_stock: string; workshop_stock: string };
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
      SELECT COALESCE(SUM(qty_delta), 0)::numeric AS d
      FROM stock_movements
      WHERE item_type = ${itemType}::stock_item_type
        AND item_id = ${itemId}
        AND location = ${location}::stock_location
        ${movementType ? tx`AND movement_type = ${movementType}::stock_movement_type` : tx``}
    `,
    "ledgerDelta",
  ) as unknown as { d: string };
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

/** Latest `waste` ledger row for an item+location (the redo scrap annotation). */
async function wasteAnnotation(
  tx: Tx,
  fabricId: number,
  location: "shop" | "workshop",
): Promise<{
  annotated_qty: number | null;
  root_cause: string | null;
  unit_cost: number | null;
  qty_delta: number;
} | null> {
  const rows = (await tx`
    SELECT annotated_qty, root_cause, unit_cost, qty_delta
    FROM stock_movements
    WHERE item_type = 'fabric'::stock_item_type
      AND item_id = ${fabricId}
      AND location = ${location}::stock_location
      AND movement_type = 'waste'::stock_movement_type
    ORDER BY id DESC
    LIMIT 1
  `) as unknown as {
    annotated_qty: string | null;
    root_cause: string | null;
    unit_cost: string | null;
    qty_delta: string;
  }[];
  const r = rows[0];
  if (!r) return null;
  return {
    annotated_qty: r.annotated_qty === null ? null : Number(r.annotated_qty),
    root_cause: r.root_cause,
    unit_cost: r.unit_cost === null ? null : Number(r.unit_cost),
    qty_delta: Number(r.qty_delta),
  };
}

async function pick(tx: Tx, id: string) {
  return only(
    await tx`
      SELECT piece_stage, location, trip_number, in_production, garment_type,
             redo_priority, redo_parked_reason, redo_customer_must_provide_fabric,
             root_cause, replaced_by_garment_id, promoted_to_brova_at
      FROM garments WHERE id = ${id}`,
    `garment ${id}`,
  ) as unknown as {
    piece_stage: string;
    location: string;
    trip_number: number;
    in_production: boolean;
    garment_type: string;
    redo_priority: string | null;
    redo_parked_reason: string | null;
    redo_customer_must_provide_fabric: boolean;
    root_cause: string | null;
    replaced_by_garment_id: string | null;
    promoted_to_brova_at: string | null;
  };
}

const idsOf = (gs: wf.GarmentRow[], t: string) =>
  gs.filter((x) => x.garment_type === t).map((x) => x.id);
function oneId(gs: wf.GarmentRow[], t: string): string {
  const id = idsOf(gs, t)[0];
  if (id === undefined) throw new Error(`no ${t} garment in order`);
  return id;
}

/**
 * Brova driven to shop and Reject-Redo'd → discarded. Returns the discarded
 * brova id and the order id (the order also has one parked final). Mirrors the
 * brovaAtShop helper in workflow.test.ts.
 */
async function brovaDiscardedAtShop(tx: Tx) {
  const { orderId, garments } = await wf.createWorkOrder(tx, [
    { garment_type: "brova" },
    { garment_type: "final" },
  ]);
  const bId = oneId(garments, "brova");
  const fId = oneId(garments, "final");
  await wf.dispatchOrder(tx, orderId);
  await wf.workshopReceive(tx, [bId, fId], { start: true });
  await wf.runProduction(tx, [bId]);
  await wf.submitQc(tx, bId, { pass: true });
  await wf.workshopDispatch(tx, [bId]);
  await wf.shopReceive(tx, [bId]);
  const r = await wf.brovaFeedback(tx, orderId, bId, "needs_redo");
  // SPEC §2.5 Reject-Redo: original discarded (terminal).
  expect(r.newStage).toBe("discarded");
  return { orderId, bId, fId };
}

// ════════════════════════════════════════════════════════════════════════════
// T1 — redo episode conserves at -2L; net-zero scrap annotation carries L+cause
// ════════════════════════════════════════════════════════════════════════════

describe("T1 redo episode fabric conservation (CLAUDE.md §2.5/§4 redo material waste)", () => {
  it("auto-consumes a fresh -L cut and records the scrapped L as a net-zero waste annotation → episode nets -2L", async () => {
    await inRolledBackTx(async (tx) => {
      const { bId } = await brovaDiscardedAtShop(tx);
      // Baseline captured at discard: the original brova's -L cut is ALREADY on
      // the ledger (booked as consumption at order confirmation). We measure the
      // redo episode as the INCREMENTAL change from here.
      const stockBefore = await fabricStock(tx, FABRIC_A_ID);
      const consumeBefore = await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop", "consumption");
      const signedBefore = await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop");

      const res = await wf.createReplacementResult(tx, bId, {
        rootCause: "production_error",
      });
      expect(res.parked).toBe(false);

      const stockAfter = await fabricStock(tx, FABRIC_A_ID);
      // INVARIANT (conservation): creating the replacement physically cuts a
      // fresh L from shop stock (the wasted L was already cut at order time and
      // is only ANNOTATED, not re-decremented). So shop_stock drops by exactly L.
      expect(Number(stockBefore.shop_stock) - Number(stockAfter.shop_stock)).toBe(L);
      expect(Number(stockBefore.real_stock) - Number(stockAfter.real_stock)).toBe(L);

      // SPEC (Group A plan T1): the redo episode adds exactly one fresh -L
      // consumption (the replacement cut) and one NET-ZERO waste annotation (the
      // scrap). Together with the discarded brova's own original -L cut already
      // booked at order time, the brova lineage's total physical fabric loss is
      // 2L: L wasted + L good — the plan's "-2L" conservation point.
      const consumeAfter = await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop", "consumption");
      const signedAfter = await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop");
      // Incremental consumption from the redo = exactly the replacement cut (-L).
      expect(consumeAfter - consumeBefore).toBe(-L);

      // INVARIANT (conservation): the scrap is a NET-ZERO waste annotation — it
      // adds 0 signed delta (it must not re-decrement the already-cut L), so the
      // whole ledger's signed change over the redo equals only the -L fresh cut
      // (the lineage's first -L was booked at order time, the second -L now, and
      // the scrap's L surfaces via annotated_qty without a second decrement).
      expect(signedAfter - signedBefore).toBe(-L);
      expect(await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(0);
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(1);

      // SPEC (Group A plan): the annotation carries L in annotated_qty, the
      // root_cause attribution, and qty_delta=0.
      const ann = await wasteAnnotation(tx, FABRIC_A_ID, "shop");
      expect(ann).not.toBeNull();
      expect(ann!.annotated_qty).toBe(L);
      expect(ann!.root_cause).toBe("production_error");
      expect(ann!.qty_delta).toBe(0);
      expect(ann!.unit_cost).toBe(FABRIC_A_PRICE);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T2 — reports surface the scrap (regression guard) + by-root-cause breakdown
// ════════════════════════════════════════════════════════════════════════════

describe("T2 redo scrap surfaces in waste reports (CLAUDE.md §4 reports)", () => {
  it("get_movement_aggregates waste total == L and get_waste_by_root_cause shows production_error {qty:L, cost:L×price}", async () => {
    await inRolledBackTx(async (tx) => {
      const { bId } = await brovaDiscardedAtShop(tx);
      await wf.createReplacementResult(tx, bId, { rootCause: "production_error" });

      // Window the report tightly around "now" so only this tx's rows are in
      // range (committed fixtures carry no waste rows in this micro-window).
      const from = tx`now() - interval '1 minute'`;
      const to = tx`now() + interval '1 minute'`;

      const agg = only(
        await tx`SELECT get_movement_aggregates(${from}, ${to}, 'fabric'::stock_item_type, 'shop'::stock_location) AS r`,
        "get_movement_aggregates",
      ) as unknown as { r: { totals: Record<string, string>; count: number } };

      // SPEC (Group A plan T2 — regression guard): the report's waste total now
      // reads SUM(ABS(qty_delta)+COALESCE(annotated_qty,0)), so the net-zero
      // scrap annotation surfaces its full L.
      expect(Number(agg.r.totals.waste)).toBe(L);

      const byCause = only(
        await tx`SELECT get_waste_by_root_cause(${from}, ${to}) AS r`,
        "get_waste_by_root_cause",
      ) as unknown as { r: Record<string, { qty: string; cost: string }> };

      // SPEC (Group A plan T2): by-root-cause card shows the scrap under its
      // attributed cause with qty L and cost L × unit price.
      const pe = byCause.r.production_error;
      expect(pe).toBeDefined();
      expect(Number(pe!.qty)).toBe(L);
      expect(Number(pe!.cost)).toBe(L * FABRIC_A_PRICE);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T-impact — get_redo_impact attributes redo cost by RESPONSIBLE PARTY (Q14)
// ════════════════════════════════════════════════════════════════════════════

describe("get_redo_impact attributes redo material cost by responsible party (CLAUDE.md §6 Q14)", () => {
  it("groups redo scrap by root_cause and derives party per §2.9 (production_error→production, customer_change→customer)", async () => {
    await inRolledBackTx(async (tx) => {
      // Two company-fabric redos with distinct root causes (both write a scrap
      // annotation; company fabric ⇒ a real material cost in both cases).
      const a = await brovaDiscardedAtShop(tx);
      await wf.createReplacementResult(tx, a.bId, { rootCause: "production_error" });
      const b = await brovaDiscardedAtShop(tx);
      await wf.createReplacementResult(tx, b.bId, { rootCause: "customer_change" });

      const from = tx`now() - interval '1 minute'`;
      const to = tx`now() + interval '1 minute'`;
      const res = only(
        await tx`SELECT get_redo_impact(${from}, ${to}) AS r`,
        "get_redo_impact",
      ) as unknown as {
        r: Array<{
          root_cause: string;
          party: string | null;
          redo_count: number;
          waste_qty: number;
          waste_cost: number;
        }>;
      };
      const byCause = new Map(res.r.map((row) => [row.root_cause, row]));

      // SPEC §6 Q14 + §2.9 (the value→party mapping is the ORACLE, not the RPC):
      // a cutting/sewing execution fault is the production team's redo.
      const pe = byCause.get("production_error");
      expect(pe).toBeDefined();
      expect(pe!.party).toBe("production");
      expect(pe!.redo_count).toBe(1);
      expect(Number(pe!.waste_qty)).toBe(L);
      expect(Number(pe!.waste_cost)).toBe(L * FABRIC_A_PRICE);

      // SPEC §6 Q14 + §2.9: a customer change of mind is the CUSTOMER's — the
      // factory is NOT penalized (no blanket penalty), yet the material cost is
      // still attributed and recorded.
      const cc = byCause.get("customer_change");
      expect(cc).toBeDefined();
      expect(cc!.party).toBe("customer");
      expect(cc!.redo_count).toBe(1);
      expect(Number(cc!.waste_qty)).toBe(L);
      expect(Number(cc!.waste_cost)).toBe(L * FABRIC_A_PRICE);

      // Only the two redos created in this tx fall in the micro-window.
      expect(res.r.length).toBe(2);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T3 — material unavailable → replacement PARKED; annotation still written
// ════════════════════════════════════════════════════════════════════════════

describe("T3 material unavailable parks the replacement (CLAUDE.md §2.5/§6)", () => {
  it("when shop stock < L the replacement is parked waiting_material, no replacement cut, but the scrap annotation is still recorded", async () => {
    await inRolledBackTx(async (tx) => {
      const { bId } = await brovaDiscardedAtShop(tx);

      // Drive shop stock below L so the replacement cut cannot proceed. Set it
      // to L-1 via a direct UPDATE (the audit trigger logs an adjustment; not
      // asserted here — we scope ledger checks to the waste/consumption types).
      await tx`UPDATE fabrics SET shop_stock = ${L - 1}, real_stock = ${L - 1} WHERE id = ${FABRIC_A_ID}`;
      const stockBefore = await fabricStock(tx, FABRIC_A_ID);

      const res = await wf.createReplacementResult(tx, bId, { rootCause: "production_error" });

      // SPEC §2.5 / Group A plan T3: short material → PARKED, not consumed.
      expect(res.parked).toBe(true);
      expect(res.parked_reason).toBe("waiting_material");
      const repl = await pick(tx, res.id);
      // §6: the redo-priority queue is dropped — redo_priority is vestigial (null).
      // The dispatch wait is marked by redo_parked_reason. Shop-initiated → the
      // replacement lands in the SHOP dispatch queue (location shop, trip 0).
      expect(repl.redo_priority).toBeNull();
      expect(repl.redo_parked_reason).toBe("waiting_material");
      expect(repl.in_production).toBe(false);
      expect(repl.location).toBe("shop");
      expect(repl.trip_number).toBe(0);
      expect(repl.piece_stage).toBe("waiting_cut");

      // INVARIANT (conservation): no replacement cut while parked — shop stock
      // is untouched by the create call.
      const stockAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockAfter.shop_stock)).toBe(Number(stockBefore.shop_stock));

      // SPEC (Group A plan T3): the scrap is a fact at discard, so the net-zero
      // annotation is STILL written even though the replacement is parked.
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(1);
      const ann = await wasteAnnotation(tx, FABRIC_A_ID, "shop");
      expect(ann!.annotated_qty).toBe(L);
      expect(ann!.qty_delta).toBe(0);
      expect(ann!.root_cause).toBe("production_error");
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T4 — resume_parked_redo un-parks, adds exactly one -L consumption (no 2nd ann)
// ════════════════════════════════════════════════════════════════════════════

describe("T4 resume_parked_redo lands the deferred cut (CLAUDE.md §6 resume-parked)", () => {
  it("resuming a parked redo after restock adds exactly one -L consumption and writes NO second annotation; episode now -2L", async () => {
    await inRolledBackTx(async (tx) => {
      const { bId } = await brovaDiscardedAtShop(tx);

      // Park: drop shop fabric below L, create (parks), then restock so the
      // resume can cut. The bare UPDATEs explicitly stamp movement_type so the
      // audit trigger logs an `adjustment` (set_config(...,true) is
      // transaction-local and would otherwise inherit a stale `consumption`
      // stamp left by complete_work_order earlier in this tx).
      await tx`SELECT set_config('app.movement_type','adjustment',true)`;
      await tx`UPDATE fabrics SET shop_stock = ${L - 1}, real_stock = ${L - 1} WHERE id = ${FABRIC_A_ID}`;
      const res = await wf.createReplacementResult(tx, bId, { rootCause: "production_error" });
      expect(res.parked).toBe(true);

      // Manager restocks enough fabric (adjustment, properly stamped).
      await tx`SELECT set_config('app.movement_type','adjustment',true)`;
      await tx`UPDATE fabrics SET shop_stock = ${L + 5}, real_stock = ${L + 5} WHERE id = ${FABRIC_A_ID}`;
      const wasteCountBefore = await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste");
      const consumeBefore = await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop", "consumption");
      const stockBefore = await fabricStock(tx, FABRIC_A_ID);

      const resume = await wf.resumeParkedRedo(tx, res.id);
      // SPEC (Group A plan T4): resume consumes the deferred L.
      expect(resume.resumed).toBe(true);
      expect(Number(resume.consumed)).toBe(L);

      // INVARIANT (conservation): exactly one -L cut now lands.
      const stockAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockBefore.shop_stock) - Number(stockAfter.shop_stock)).toBe(L);

      // SPEC (Group A plan T4): resume adds exactly one -L consumption …
      const consumeAfter = await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop", "consumption");
      expect(consumeAfter - consumeBefore).toBe(-L);

      // … and writes NO second annotation (it was written eagerly at creation).
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(wasteCountBefore);
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(1);
      // The net-zero annotation still contributes 0 signed delta.
      expect(await ledgerDelta(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(0);

      // Resumed → dispatchable from the SHOP: the wait mark is cleared, the
      // replacement stays at the shop (trip 0, in_production false; the workshop
      // starts it after dispatch + receive).
      const repl = await pick(tx, res.id);
      expect(repl.redo_priority).toBeNull();
      expect(repl.redo_parked_reason).toBeNull();
      expect(repl.in_production).toBe(false);
      expect(repl.location).toBe("shop");
      expect(repl.trip_number).toBe(0);
    });
  });

  it("resume on an already-active (non-parked) redo is a no-op replay (consumed 0)", async () => {
    await inRolledBackTx(async (tx) => {
      const { bId } = await brovaDiscardedAtShop(tx);
      const res = await wf.createReplacementResult(tx, bId, { rootCause: "production_error" });
      expect(res.parked).toBe(false);
      const stockBefore = await fabricStock(tx, FABRIC_A_ID);

      const resume = await wf.resumeParkedRedo(tx, res.id);
      // Not parked ⇒ nothing to resume, nothing consumed, stock unchanged.
      expect(resume.resumed).toBe(false);
      expect(Number(resume.consumed)).toBe(0);
      const stockAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockAfter.shop_stock)).toBe(Number(stockBefore.shop_stock));
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T5 — customer-brought (OUT) fabric → never consumed / never wasted
// ════════════════════════════════════════════════════════════════════════════

describe("T5 OUT-fabric redo never touches our stock (CLAUDE.md §4 customer fabric)", () => {
  it("OUT fabric → no consume, no annotation, parked customer_decision; resume clears with consumed 0", async () => {
    await inRolledBackTx(async (tx) => {
      const { bId } = await brovaDiscardedAtShop(tx);
      // Mark the discarded brova as customer-brought cloth.
      await tx`UPDATE garments SET fabric_source = 'OUT' WHERE id = ${bId}`;
      const stockBefore = await fabricStock(tx, FABRIC_A_ID);
      // Baselines captured at discard (the order's own consumption rows are
      // already on the ledger; we assert the redo adds NOTHING for OUT cloth).
      const wasteBefore = await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste");
      const consumeBefore = await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "consumption");

      const res = await wf.createReplacementResult(tx, bId, { rootCause: "production_error" });

      // SPEC §4: customer (OUT) cloth is never decremented; the replacement is
      // parked pending the customer providing replacement fabric.
      expect(res.parked).toBe(true);
      expect(res.parked_reason).toBe("customer_decision");
      const repl = await pick(tx, res.id);
      expect(repl.redo_customer_must_provide_fabric).toBe(true);
      expect(repl.redo_priority).toBeNull();
      expect(repl.redo_parked_reason).toBe("customer_decision");
      expect(repl.location).toBe("shop");
      expect(repl.trip_number).toBe(0);

      // INVARIANT (conservation): OUT cloth never entered our stock — no consume,
      // and no waste annotation (we never held it to scrap). The ledger gains no
      // waste/consumption rows from the redo.
      const stockAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockAfter.shop_stock)).toBe(Number(stockBefore.shop_stock));
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(wasteBefore);
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "consumption")).toBe(consumeBefore);

      // Resume (customer decision made): clears the park, consumes nothing.
      const resume = await wf.resumeParkedRedo(tx, res.id);
      expect(resume.resumed).toBe(true);
      expect(Number(resume.consumed)).toBe(0);
      const after = await pick(tx, res.id);
      expect(after.redo_priority).toBeNull();
      expect(after.redo_parked_reason).toBeNull();
      // Dispatchable from the shop (the customer's cloth never touches our stock).
      expect(after.in_production).toBe(false);
      expect(after.location).toBe("shop");
      expect(after.trip_number).toBe(0);
      // Still nothing wasted/consumed from our stock.
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(wasteBefore);
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "consumption")).toBe(consumeBefore);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T6 — redo outcome 3: promote a parked final to brova (no replacement) (§2.5)
// ════════════════════════════════════════════════════════════════════════════

describe("T6 redo promote-a-final (SPEC §2.5 outcome 3)", () => {
  it("discards the brova, promotes one parked final to brova (released to production), keeps the other parked, links replaced_by, and net-zero-annotates the brova's scrap — no fresh fabric consumed", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      const bId = oneId(garments, "brova");
      const finals = idsOf(garments, "final");
      const promoteId = finals[0]!;
      const otherId = finals[1]!;

      // Drive the brova to the shop trial; finals dispatched alongside, stay parked.
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [bId, ...finals], { start: true });
      await wf.runProduction(tx, [bId]);
      await wf.submitQc(tx, bId, { pass: true });
      await wf.workshopDispatch(tx, [bId]);
      await wf.shopReceive(tx, [bId]);

      const wasteBefore = await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste");
      const stockBefore = await fabricStock(tx, FABRIC_A_ID);

      const res = await wf.promoteFinalToBrova(tx, bId, promoteId);
      expect(res.promoted_final_id).toBe(promoteId);

      // Brova discarded (terminal) and FK-linked to the promoted final (§2.8 label).
      const brova = await pick(tx, bId);
      expect(brova.piece_stage).toBe("discarded");
      expect(brova.replaced_by_garment_id).toBe(promoteId);
      expect(brova.in_production).toBe(false);

      // The promoted final is now a brova, released to production, stamped for audit.
      const promoted = await pick(tx, promoteId);
      expect(promoted.garment_type).toBe("brova");
      expect(promoted.piece_stage).toBe("waiting_cut");
      expect(promoted.in_production).toBe(false);
      expect(promoted.promoted_to_brova_at).not.toBeNull();

      // The other final stays parked, untouched.
      const other = await pick(tx, otherId);
      expect(other.garment_type).toBe("final");
      expect(other.piece_stage).toBe("waiting_for_acceptance");

      // INVARIANT: no fresh fabric consumed (the final's cut was booked at confirmation).
      const stockAfter = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockAfter.shop_stock)).toBe(Number(stockBefore.shop_stock));

      // The discarded brova's own company (IN) cut is scrap-annotated net-zero (§4).
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(wasteBefore + 1);
      const ann = await wasteAnnotation(tx, FABRIC_A_ID, "shop");
      expect(ann!.annotated_qty).toBe(L);
      expect(ann!.qty_delta).toBe(0);
    });
  });

  it("discard-only (no parked final to promote) discards the brova + annotates scrap, promotes nothing, leaves no replacement link", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [{ garment_type: "brova" }]);
      const bId = oneId(garments, "brova");
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [bId], { start: true });
      await wf.runProduction(tx, [bId]);
      await wf.submitQc(tx, bId, { pass: true });
      await wf.workshopDispatch(tx, [bId]);
      await wf.shopReceive(tx, [bId]);

      const wasteBefore = await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste");

      const res = await wf.promoteFinalToBrova(tx, bId, null);
      expect(res.promoted_final_id).toBeNull();

      const brova = await pick(tx, bId);
      expect(brova.piece_stage).toBe("discarded");
      expect(brova.replaced_by_garment_id).toBeNull();

      // The scrap is still annotated (the discard is a fact at redo).
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(wasteBefore + 1);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T6 — idempotent replay (same key) → exactly one of everything
// ════════════════════════════════════════════════════════════════════════════

describe("T6 create_replacement_garment idempotency (CLAUDE.md §7.3 retryable mutations)", () => {
  it("a lost-response replay with the SAME key produces exactly one replacement, one consume, one annotation", async () => {
    await inRolledBackTx(async (tx) => {
      const { bId } = await brovaDiscardedAtShop(tx);
      const stockBefore = await fabricStock(tx, FABRIC_A_ID);
      const consumeBefore = await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "consumption");
      const KEY = randomUUID();

      const first = await wf.createReplacementResult(tx, bId, {
        rootCause: "production_error",
        idempotencyKey: KEY,
      });
      const replId = first.id;
      const stockAfterFirst = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockBefore.shop_stock) - Number(stockAfterFirst.shop_stock)).toBe(L);

      const replay = await wf.createReplacementResult(tx, bId, {
        rootCause: "production_error",
        idempotencyKey: KEY,
      });

      // SPEC §7.3 idempotency: the replay returns the original result (same id).
      expect(replay.id).toBe(replId);

      // INVARIANT (exactly-once): exactly one fresh cut, one annotation, one
      // replacement — stock unchanged by the replay. The redo adds precisely one
      // consumption row (over the order's pre-existing ones) and one waste row.
      const stockAfterReplay = await fabricStock(tx, FABRIC_A_ID);
      expect(Number(stockAfterReplay.shop_stock)).toBe(Number(stockAfterFirst.shop_stock));
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "consumption")).toBe(consumeBefore + 1);
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(1);
      const nRepl = only(
        await tx`SELECT COUNT(*)::int AS n FROM garments WHERE replaced_by_garment_id = ${replId}`,
        "replacement-count",
      ) as unknown as { n: number };
      // exactly one original points at this replacement.
      expect(nRepl.n).toBe(1);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T7 — double-replacement guard preserved
// ════════════════════════════════════════════════════════════════════════════

describe("T7 double-replacement guard (CLAUDE.md §2.5 one replacement per discarded original)", () => {
  it("a fresh-key create on an already-replaced original raises", async () => {
    await inRolledBackTx(async (tx) => {
      const { bId } = await brovaDiscardedAtShop(tx);
      await wf.createReplacementResult(tx, bId, { rootCause: "production_error" });

      // SPEC §2.5: a discarded original can be replaced AT MOST ONCE. A second
      // create (fresh key) must be rejected.
      expect(
        await tryInSavepoint(tx, (sp) =>
          wf.createReplacementResult(sp, bId, { rootCause: "production_error" }),
        ),
      ).not.toBeNull();
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T8 — finals_waiting_on_replacement_brova flag
// ════════════════════════════════════════════════════════════════════════════

describe("T8 finals waiting on replacement brova (CLAUDE.md §2.8 workshop label)", () => {
  it("returns 1 while the replacement brova is in flight and finals are parked; 0 once the replacement is accepted & finals released", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, bId } = await brovaDiscardedAtShop(tx);
      // Finals stay parked (Reject-Redo does not release them).
      const replId = await wf.createReplacement(tx, bId, { rootCause: "production_error" });

      const before = only(
        await tx`SELECT finals_waiting_on_replacement_brova(${orderId}) AS r`,
        "finals_waiting (before)",
      ) as unknown as { r: { order_id: number; finals_waiting: number }[] };
      // SPEC §2.8 (Group A plan T8): one final parked while the replacement brova
      // is still in flight.
      expect(before.r).toHaveLength(1);
      expect(Number(before.r[0]!.finals_waiting)).toBe(1);

      // Drive the replacement brova through to shop, accept it, release finals.
      await wf.workshopReceive(tx, [replId], { start: true });
      await wf.runProduction(tx, [replId]);
      await wf.submitQc(tx, replId, { pass: true });
      await wf.workshopDispatch(tx, [replId]);
      await wf.shopReceive(tx, [replId]);
      const r2 = await wf.brovaFeedback(tx, orderId, replId, "accepted");
      expect(r2.releaseFinals).toBe(true);
      await wf.releaseFinals(tx, orderId);

      const after = only(
        await tx`SELECT finals_waiting_on_replacement_brova(${orderId}) AS r`,
        "finals_waiting (after)",
      ) as unknown as { r: { order_id: number; finals_waiting: number }[] };
      // SPEC §2.8: once the replacement is accepted and finals released, no final
      // remains waiting on a replacement brova.
      expect(after.r).toHaveLength(0);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T9 — the non-redo needs_repair path creates no annotation / no consume
// ════════════════════════════════════════════════════════════════════════════

describe("T9 needs_repair (alteration cycle) is not a redo (CLAUDE.md §2.5)", () => {
  it("a brova returned for repair (not redo) writes no scrap annotation and consumes no fresh fabric", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "brova" },
        { garment_type: "final" },
      ]);
      const bId = oneId(garments, "brova");
      await wf.dispatchOrder(tx, orderId);
      await wf.workshopReceive(tx, [bId, oneId(garments, "final")], { start: true });
      await wf.runProduction(tx, [bId]);
      await wf.submitQc(tx, bId, { pass: true });
      await wf.workshopDispatch(tx, [bId]);
      await wf.shopReceive(tx, [bId]);

      const consumeBefore = await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "consumption");
      const wasteBefore = await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste");

      // Accept-with-Fix (needs_repair, accepted) → alteration cycle, NOT a redo.
      await wf.brovaFeedback(tx, orderId, bId, "needs_repair_accepted");
      await wf.sendBackToWorkshop(tx, bId);

      // SPEC §2.5: an alteration/repair cycle reuses the same garment — it neither
      // discards+replaces (no fresh cut) nor scraps fabric (no annotation).
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "consumption")).toBe(consumeBefore);
      expect(await ledgerCount(tx, "fabric", FABRIC_A_ID, "shop", "waste")).toBe(wasteBefore);
    });
  });
});
