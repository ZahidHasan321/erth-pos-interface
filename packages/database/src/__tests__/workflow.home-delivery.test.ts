/**
 * Home-based brand delivery + brand-attributed consumption (SPEC §1/§4/§5).
 *
 * Home-based brands (SAKKBA/QASS) have no cashier; a whole order is handed over
 * on the Delivery page via deliver_order. These tests drive real lifecycles to a
 * deliverable state (a no-brova final spine, and a brova order tried + accepted
 * at the shop) and assert deliver_order's contract: whole-order, all-or-nothing,
 * idempotent, an accepted brova (brova_trialed) is deliverable while an untried
 * one is not, and fabric consumption is stamped with the consuming brand.
 *
 * Runs under `pnpm test:workflow` (Docker postgres via global-setup).
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, tryInSavepoint, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

/** Drive a no-brova final order all the way to ready_for_pickup at the shop. */
async function toReadyForPickup(tx: Tx, count = 1) {
  const { orderId, garments } = await wf.createWorkOrder(
    tx,
    Array.from({ length: count }, () => ({ garment_type: "final" as const })),
  );
  const ids = garments.map((g) => g.id);
  await wf.dispatchOrder(tx, orderId);
  await wf.workshopReceive(tx, ids, { start: true });
  await wf.runProduction(tx, ids);
  for (const id of ids) await wf.submitQc(tx, id, { pass: true });
  await wf.workshopDispatch(tx, ids);
  await wf.shopReceive(tx, ids);
  return { orderId, ids };
}

describe("home-based brand delivery (SPEC §1/§5)", () => {
  it("deliver_order hands over the whole order: every garment delivered + completed, order_phase completed", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await toReadyForPickup(tx, 2);
      // Home brands force home delivery -> fulfillment must resolve to 'delivered'.
      await tx`UPDATE garments SET home_delivery = true WHERE order_id = ${orderId}`;
      let gs = await wf.getGarments(tx, orderId);
      expect(gs.every((g) => g.piece_stage === "ready_for_pickup")).toBe(true);

      await tx`SELECT deliver_order(${orderId})`;

      gs = await wf.getGarments(tx, orderId);
      expect(gs.every((g) => g.piece_stage === "completed")).toBe(true);
      expect(gs.every((g) => g.fulfillment_type === "delivered")).toBe(true);
      const order = await wf.getOrder(tx, orderId);
      expect(order.order_phase).toBe("completed");
    });
  });

  it("deliver_order is all-or-nothing: refuses while any garment is not back at the shop", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, ids } = await toReadyForPickup(tx, 2);
      // Push one garment back into the workshop -> the order is no longer fully ready.
      await tx`UPDATE garments SET location='workshop', piece_stage='sewing' WHERE id = ${ids[0]}`;
      // tryInSavepoint scopes the RAISE so the outer tx survives for the post-check.
      const err = await tryInSavepoint(tx, (sp) => sp`SELECT deliver_order(${orderId})`);
      expect(err).not.toBeNull();
      expect(String((err as { message?: string }).message ?? err)).toMatch(/not yet back at the shop/i);
      // Nothing was handed over.
      const gs = await wf.getGarments(tx, orderId);
      expect(gs.some((g) => g.piece_stage === "completed")).toBe(false);
    });
  });

  it("deliver_order is idempotent: re-running on a delivered order is a no-op", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await toReadyForPickup(tx, 1);
      await tx`SELECT deliver_order(${orderId})`;
      const [row] = (await tx`SELECT deliver_order(${orderId}) AS r`) as unknown as {
        r: { status: string };
      }[];
      expect(row.r.status).toBe("noop");
      const gs = await wf.getGarments(tx, orderId);
      expect(gs.every((g) => g.piece_stage === "completed")).toBe(true);
    });
  });
});

/**
 * Drive a home-brand-style order [brova, final] to the point where the brova is
 * back at the shop awaiting its trial (finals still parked). home_delivery is
 * forced, as an actual home brand does.
 */
async function toBrovaAwaitingTrial(tx: Tx) {
  const { orderId } = await wf.createWorkOrder(tx, [
    { garment_type: "brova" as const },
    { garment_type: "final" as const },
  ]);
  await tx`UPDATE garments SET home_delivery = true WHERE order_id = ${orderId}`;
  const gs = await wf.getGarments(tx, orderId);
  const brovaId = gs.find((g) => g.garment_type === "brova")!.id;
  const finalIds = gs.filter((g) => g.garment_type === "final").map((g) => g.id);

  await wf.dispatchOrder(tx, orderId, [brovaId]);
  await wf.workshopReceive(tx, [brovaId], { start: true });
  await wf.runProduction(tx, [brovaId]);
  await wf.submitQc(tx, brovaId, { pass: true });
  await wf.workshopDispatch(tx, [brovaId]);
  await wf.shopReceive(tx, [brovaId]); // brova -> awaiting_trial
  return { orderId, brovaId, finalIds };
}

/** Continue from an awaiting-trial brova: accept it at the shop, then produce
 *  the released finals through to ready_for_pickup. */
async function acceptAndFinishFinals(tx: Tx, orderId: number, finalIds: string[]) {
  const brovaId = (await wf.getGarments(tx, orderId)).find(
    (g) => g.garment_type === "brova",
  )!.id;
  await wf.brovaFeedback(tx, orderId, brovaId, "accepted"); // -> brova_trialed, acceptance=true
  await wf.releaseFinals(tx, orderId); // finals -> waiting_cut
  await wf.dispatchOrder(tx, orderId, finalIds, { skipCashierProcess: true });
  await wf.workshopReceive(tx, finalIds, { start: true });
  await wf.runProduction(tx, finalIds);
  for (const id of finalIds) await wf.submitQc(tx, id, { pass: true });
  await wf.workshopDispatch(tx, finalIds);
  await wf.shopReceive(tx, finalIds); // finals -> ready_for_pickup
}

describe("home-based brand brova delivery (SPEC §1/§2.5/§5)", () => {
  it("deliver_order hands over an accepted brova (brova_trialed) together with its finals", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, finalIds } = await toBrovaAwaitingTrial(tx);
      await acceptAndFinishFinals(tx, orderId, finalIds);

      const before = await wf.getGarments(tx, orderId);
      expect(before.find((g) => g.garment_type === "brova")!.piece_stage).toBe("brova_trialed");
      expect(
        before.filter((g) => g.garment_type === "final").every((g) => g.piece_stage === "ready_for_pickup"),
      ).toBe(true);

      await tx`SELECT deliver_order(${orderId})`;

      const gs = await wf.getGarments(tx, orderId);
      expect(gs.every((g) => g.piece_stage === "completed")).toBe(true);
      expect(gs.every((g) => g.fulfillment_type === "delivered")).toBe(true);
      expect((await wf.getOrder(tx, orderId)).order_phase).toBe("completed");
    });
  });

  it("deliver_order refuses while the brova is only awaiting_trial: it must be tried at the shop first", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, brovaId, finalIds } = await toBrovaAwaitingTrial(tx);
      // Force the finals ready but leave the brova untried -> still not deliverable.
      await tx`UPDATE garments SET piece_stage='ready_for_pickup', location='shop'
               WHERE id = ANY(${tx.array(finalIds)}::uuid[])`;
      expect(
        (await wf.getGarments(tx, orderId)).find((g) => g.id === brovaId)!.piece_stage,
      ).toBe("awaiting_trial");

      const err = await tryInSavepoint(tx, (sp) => sp`SELECT deliver_order(${orderId})`);
      expect(err).not.toBeNull();
      expect(String((err as { message?: string }).message ?? err)).toMatch(/not yet back at the shop/i);
      // Nothing handed over.
      const gs = await wf.getGarments(tx, orderId);
      expect(gs.some((g) => g.piece_stage === "completed")).toBe(false);
    });
  });
});

describe("brand-attributed fabric consumption (SPEC §1/§4)", () => {
  it("a WORK order's fabric consumption is stamped with the consuming brand", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      const [o] = (await tx`SELECT brand FROM orders WHERE id = ${orderId}`) as unknown as {
        brand: string;
      }[];

      const rows = (await tx`
        SELECT brand, qty_delta FROM stock_movements
        WHERE ref_type = 'order' AND ref_id = ${orderId} AND movement_type = 'consumption'
      `) as unknown as { brand: string | null; qty_delta: string }[];
      expect(rows.length).toBeGreaterThan(0);
      // Every consumption row carries the order's brand (never NULL).
      expect(rows.every((r) => r.brand === o.brand)).toBe(true);

      // get_consumption_by_brand surfaces the order's brand with a positive total.
      const [agg] = (await tx`
        SELECT get_consumption_by_brand(now() - interval '1 day', now() + interval '1 day') AS r
      `) as unknown as { r: { brand: string; total: number; count: number }[] }[];
      const entry = agg.r.find((b) => b.brand === o.brand);
      expect(entry).toBeTruthy();
      expect(Number(entry!.total)).toBeGreaterThan(0);
    });
  });
});
