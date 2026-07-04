/**
 * Undo window for garment logistics actions (CLAUDE.md §2 / SPEC §2.15).
 *
 * Exercises the DB contract of the snapshot-token undo: record_undo_token +
 * perform_undo, driven against the real RPCs + triggers. The oracle here is the
 * universal invariant of an undo — "after undo, the garment is byte-for-byte
 * back to its pre-action state" — and the safety gate — "undo is refused once
 * the counterpart consumed the result or the window lapsed". Neither expected
 * value is copied from the function body.
 *
 * Runs under `pnpm test:workflow` (Docker postgres via global-setup).
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, tryInSavepoint, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// The exact columns the app's lib/undo.ts captures. to_jsonb of the row carries
// them (plus extras perform_undo ignores) with parseable representations.
const GUARDED = ["location", "piece_stage", "in_production", "start_time", "completion_time"] as const;

async function snapshot(tx: Tx, ids: string[]): Promise<Record<string, Record<string, unknown>>> {
  const rows = (await tx`
    SELECT id, to_jsonb(g) AS row FROM garments g WHERE id = ANY(${tx.array(ids)}::uuid[])
  `) as unknown as { id: string; row: Record<string, unknown> }[];
  const out: Record<string, Record<string, unknown>> = {};
  for (const r of rows) out[r.id] = r.row;
  return out;
}

async function recordToken(
  tx: Tx,
  action: string,
  ids: string[],
  before: Record<string, unknown>,
  windowSeconds = 90,
): Promise<string> {
  const [{ id }] = (await tx`
    SELECT record_undo_token(${action}, ${tx.array(ids)}::uuid[], ${tx.json(before)}::jsonb, ${windowSeconds}) AS id
  `) as unknown as { id: string }[];
  return id;
}

/** A garment's currently-persisted values on the columns undo cares about. */
async function stateOf(tx: Tx, ids: string[]): Promise<Record<string, Record<string, unknown>>> {
  const rows = (await tx`
    SELECT id, location::text, piece_stage::text, in_production, feedback_status,
           acceptance_status, trip_number, start_time, completion_time,
           shop_received_date, production_plan
    FROM garments WHERE id = ANY(${tx.array(ids)}::uuid[])
  `) as unknown as Record<string, unknown>[];
  const out: Record<string, Record<string, unknown>> = {};
  for (const r of rows) out[String(r.id)] = r;
  return out;
}

/** Count of "dispatched" notifications emitted for a garment (both directions). */
async function dispatchNotifCount(tx: Tx, id: string): Promise<number> {
  const [{ n }] = (await tx`
    SELECT COUNT(*)::int AS n FROM notifications
     WHERE type IN ('garment_dispatched_to_shop', 'garment_dispatched_to_workshop')
       AND metadata->>'garment_id' = ${id}
  `) as unknown as { n: number }[];
  return n;
}

/** Count of still-LIVE (unexpired) notifications of a given type for a garment. */
async function liveNotifCount(tx: Tx, id: string, type: string): Promise<number> {
  const [{ n }] = (await tx`
    SELECT COUNT(*)::int AS n FROM notifications
     WHERE type::text = ${type}
       AND metadata->>'garment_id' = ${id}
       AND expires_at > now()
  `) as unknown as { n: number }[];
  return n;
}

async function workOrderPhase(tx: Tx, orderId: number): Promise<string> {
  const [{ order_phase }] = (await tx`
    SELECT order_phase::text AS order_phase FROM work_orders WHERE order_id = ${orderId}
  `) as unknown as { order_phase: string }[];
  return order_phase;
}

/** Drive an order to "garments sitting at the workshop, ready to dispatch". */
async function orderAtWorkshop(tx: Tx): Promise<{ orderId: number; ids: string[] }> {
  const { orderId, garments } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
  const ids = garments.map((g) => g.id);
  await wf.cashierProcess(tx, orderId);
  await wf.dispatchOrder(tx, orderId, undefined, { skipCashierProcess: true });
  await wf.workshopReceive(tx, ids, { start: true });
  await wf.runProduction(tx, ids);
  for (const id of ids) await wf.submitQc(tx, id, { pass: true });
  return { orderId, ids };
}

describe("lifecycle: undo window (SPEC §2.15)", () => {
  it("undo of a workshop→shop dispatch restores the garment exactly", async () => {
    await inRolledBackTx(async (tx) => {
      const { ids } = await orderAtWorkshop(tx);
      const before = await stateOf(tx, ids);

      const snap = await snapshot(tx, ids);
      await wf.workshopDispatch(tx, ids);
      const token = await recordToken(tx, "dispatch_to_shop", ids, snap);

      // The dispatch actually moved things (sanity: guard would be meaningless otherwise).
      const dispatched = await stateOf(tx, ids);
      expect(dispatched[ids[0]].location).toBe("transit_to_shop");

      const res = (await tx`SELECT perform_undo(${token}::uuid) AS r`) as unknown as { r: { undone: boolean } }[];
      expect(res[0].r.undone).toBe(true);

      // Byte-for-byte back to the pre-dispatch state.
      expect(await stateOf(tx, ids)).toEqual(before);

      // The dispatch audit row is voided (append-only preserved), so History hides it.
      const [{ n }] = (await tx`
        SELECT COUNT(*) FILTER (WHERE undone_at IS NULL)::int AS n
        FROM dispatch_log WHERE garment_id = ANY(${tx.array(ids)}::uuid[]) AND direction = 'to_shop'
      `) as unknown as { n: number }[];
      expect(n).toBe(0);
    });
  });

  it("refuses the undo once the shop has received (guard closed)", async () => {
    await inRolledBackTx(async (tx) => {
      const { ids } = await orderAtWorkshop(tx);
      const snap = await snapshot(tx, ids);
      await wf.workshopDispatch(tx, ids);
      const token = await recordToken(tx, "dispatch_to_shop", ids, snap);

      // Counterpart consumes the result: the shop receives the garment.
      await wf.shopReceive(tx, ids);

      const err = await tryInSavepoint(tx, (sp) => sp`SELECT perform_undo(${token}::uuid)`);
      expect(err).not.toBeNull();
      expect(String(err)).toMatch(/moved on|cannot undo/i);

      // And nothing was reverted — the garment stays received at the shop.
      const after = await stateOf(tx, ids);
      expect(after[ids[0]].location).toBe("shop");
    });
  });

  it("refuses the undo after the window has expired", async () => {
    await inRolledBackTx(async (tx) => {
      const { ids } = await orderAtWorkshop(tx);
      const snap = await snapshot(tx, ids);
      await wf.workshopDispatch(tx, ids);
      const token = await recordToken(tx, "dispatch_to_shop", ids, snap);

      await tx`UPDATE undo_tokens SET expires_at = now() - INTERVAL '1 second' WHERE id = ${token}::uuid`;

      const err = await tryInSavepoint(tx, (sp) => sp`SELECT perform_undo(${token}::uuid)`);
      expect(err).not.toBeNull();
      expect(String(err)).toMatch(/expired/i);
      expect((await stateOf(tx, ids))[ids[0]].location).toBe("transit_to_shop");
    });
  });

  it("cannot be undone twice (token consumed)", async () => {
    await inRolledBackTx(async (tx) => {
      const { ids } = await orderAtWorkshop(tx);
      const snap = await snapshot(tx, ids);
      await wf.workshopDispatch(tx, ids);
      const token = await recordToken(tx, "dispatch_to_shop", ids, snap);

      await tx`SELECT perform_undo(${token}::uuid)`;
      const err = await tryInSavepoint(tx, (sp) => sp`SELECT perform_undo(${token}::uuid)`);
      expect(err).not.toBeNull();
      expect(String(err)).toMatch(/already undone/i);
    });
  });

  it("undo of a schedule is blocked once a worker starts the piece", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      const ids = garments.map((g) => g.id);
      await wf.cashierProcess(tx, orderId);
      await wf.dispatchOrder(tx, orderId, undefined, { skipCashierProcess: true });
      // Receive WITHOUT starting so the garment is parked, awaiting a schedule.
      await wf.workshopReceive(tx, ids, { start: false });

      const snap = await snapshot(tx, ids);
      // Schedule = the app's scheduleGarments column write (mirror the essentials).
      await tx`
        UPDATE garments SET production_plan = ${tx.json({ cutting: "unit-1" })}::jsonb,
               in_production = true, piece_stage = 'cutting'
         WHERE id = ANY(${tx.array(ids)}::uuid[])
      `;
      const token = await recordToken(tx, "schedule", ids, snap);

      // A worker starts cutting -> start_time set -> guard closes.
      await tx`UPDATE garments SET start_time = now() WHERE id = ANY(${tx.array(ids)}::uuid[])`;

      const err = await tryInSavepoint(tx, (sp) => sp`SELECT perform_undo(${token}::uuid)`);
      expect(err).not.toBeNull();
      expect(String(err)).toMatch(/moved on|cannot undo/i);
    });
  });

  it("undo of a shop receive reverts to transit, clears shop_received_date, and does NOT re-notify", async () => {
    await inRolledBackTx(async (tx) => {
      const { ids } = await orderAtWorkshop(tx);
      const id = ids[0];
      await wf.workshopDispatch(tx, ids); // → transit_to_shop (fires the one legit "to_shop" notif)
      const before = await stateOf(tx, ids);
      const snap = await snapshot(tx, ids);

      await wf.shopReceive(tx, ids); // → shop, stamps shop_received_date
      const token = await recordToken(tx, "receive_at_shop", ids, snap);
      const received = await stateOf(tx, ids);
      expect(received[id].location).toBe("shop");
      expect(received[id].shop_received_date).not.toBeNull();

      const notifBefore = await dispatchNotifCount(tx, id);
      await tx`SELECT perform_undo(${token}::uuid)`;

      // Full restore: back in transit, shop_received_date wiped.
      expect(await stateOf(tx, ids)).toEqual(before);
      // Suppression held: reverting into transit_to_shop did not emit a new notif.
      expect(await dispatchNotifCount(tx, id)).toBe(notifBefore);
    });
  });

  it("undo of a stage advance reopens the timing session with its original start (no worked time lost)", async () => {
    await inRolledBackTx(async (tx) => {
      const { ids } = await orderAtWorkshop(tx);
      const id = ids[0];
      const startedAt = "2020-01-01T09:00:00.000Z";
      // Put the garment mid-cutting with an OPEN timing session.
      await tx`
        UPDATE garments SET piece_stage = 'cutting', in_production = true,
               start_time = ${startedAt}::timestamptz,
               stage_timings = ${tx.json({ cutting: [{ worker: null, started_at: startedAt, completed_at: null }] })}::jsonb
         WHERE id = ${id}::uuid
      `;
      const snap = await snapshot(tx, [id]);

      // Advance = mirror completeAndAdvance: close the session, next stage, start_time null.
      const doneAt = new Date().toISOString();
      await tx`
        UPDATE garments SET piece_stage = 'sewing', completion_time = now(), start_time = NULL,
               worker_history = ${tx.json({ cutting: "Worker A" })}::jsonb,
               stage_timings = ${tx.json({ cutting: [{ worker: "Worker A", started_at: startedAt, completed_at: doneAt }] })}::jsonb
         WHERE id = ${id}::uuid
      `;
      const token = await recordToken(tx, "advance_stage", [id], snap);

      await tx`SELECT perform_undo(${token}::uuid)`;

      const [row] = (await tx`
        SELECT piece_stage::text AS piece_stage, start_time, worker_history, stage_timings
        FROM garments WHERE id = ${id}::uuid
      `) as unknown as { piece_stage: string; start_time: string; worker_history: unknown; stage_timings: { cutting: { started_at: string; completed_at: string | null }[] } }[];
      expect(row.piece_stage).toBe("cutting");
      expect(new Date(row.start_time).toISOString()).toBe(startedAt); // original start restored
      expect(row.worker_history).toBeNull(); // merged entry rolled back
      const session = row.stage_timings.cutting[0];
      expect(session.completed_at).toBeNull(); // session reopened
      expect(session.started_at).toBe(startedAt); // anchor preserved → elapsed keeps counting from T0
    });
  });

  it("does NOT arm an undo token if the counterpart moved the garment before the token was recorded (arm-time race)", async () => {
    await inRolledBackTx(async (tx) => {
      const { ids } = await orderAtWorkshop(tx);
      const snap = await snapshot(tx, ids);
      await wf.workshopDispatch(tx, ids); // → transit_to_shop
      // Counterpart receives DURING the record gap (before record_undo_token lands).
      await wf.shopReceive(tx, ids); // → shop

      const [{ id }] = (await tx`
        SELECT record_undo_token('dispatch_to_shop', ${tx.array(ids)}::uuid[], ${tx.json(snap)}::jsonb, 90, NULL, 'transit_to_shop') AS id
      `) as unknown as { id: string | null }[];
      expect(id).toBeNull(); // no token armed → no Undo button → no possible corruption
    });
  });

  it("refuses a schedule undo if the plan was edited in place within the window (widened guard)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      const ids = garments.map((g) => g.id);
      await wf.cashierProcess(tx, orderId);
      await wf.dispatchOrder(tx, orderId, undefined, { skipCashierProcess: true });
      await wf.workshopReceive(tx, ids, { start: false });

      const snap = await snapshot(tx, ids);
      await tx`
        UPDATE garments SET production_plan = ${tx.json({ cutting: "unit-1" })}::jsonb,
               in_production = true, piece_stage = 'cutting'
         WHERE id = ANY(${tx.array(ids)}::uuid[])
      `;
      const token = await recordToken(tx, "schedule", ids, snap);

      // In-place plan correction — touches NO movement column (location/stage/start unchanged).
      await tx`UPDATE garments SET production_plan = ${tx.json({ cutting: "unit-2" })}::jsonb WHERE id = ANY(${tx.array(ids)}::uuid[])`;

      const err = await tryInSavepoint(tx, (sp) => sp`SELECT perform_undo(${token}::uuid)`);
      expect(err).not.toBeNull();
      expect(String(err)).toMatch(/moved on|edited/i);
    });
  });

  it("undo of the first dispatch to workshop resets order_phase back to new (audit #2)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      const ids = garments.map((g) => g.id);
      await wf.cashierProcess(tx, orderId);

      const snap = await snapshot(tx, ids);
      await wf.dispatchOrder(tx, orderId, undefined, { skipCashierProcess: true });
      expect(await workOrderPhase(tx, orderId)).toBe("in_progress"); // dispatch flipped it

      const token = await recordToken(tx, "dispatch_to_workshop", ids, snap);
      await tx`SELECT perform_undo(${token}::uuid)`;

      // Order is back to un-dispatched, so its phase must read 'new' again.
      expect(await workOrderPhase(tx, orderId)).toBe("new");
      const st = await stateOf(tx, ids);
      expect(st[ids[0]].trip_number).toBe(0);
      expect(st[ids[0]].location).toBe("shop");
    });
  });

  it("undo of one garment's dispatch keeps order_phase in_progress while a sibling stays dispatched (audit #2)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      const ids = garments.map((g) => g.id);
      await wf.cashierProcess(tx, orderId);

      const snapOne = await snapshot(tx, [ids[0]]); // token covers only the first garment
      await wf.dispatchOrder(tx, orderId, undefined, { skipCashierProcess: true }); // dispatches both
      const token = await recordToken(tx, "dispatch_to_workshop", [ids[0]], snapOne);
      await tx`SELECT perform_undo(${token}::uuid)`;

      // The second garment is still dispatched (trip 1), so the order is genuinely
      // in progress — the reset must NOT fire.
      expect(await workOrderPhase(tx, orderId)).toBe("in_progress");
    });
  });

  it("a dispatch undo retracts the 'dispatched' notification it fired (audit #7)", async () => {
    await inRolledBackTx(async (tx) => {
      const { ids } = await orderAtWorkshop(tx);
      const id = ids[0];
      const snap = await snapshot(tx, ids);
      await wf.workshopDispatch(tx, ids); // fires garment_dispatched_to_shop
      const token = await recordToken(tx, "dispatch_to_shop", ids, snap);
      expect(await liveNotifCount(tx, id, "garment_dispatched_to_shop")).toBe(1);

      await tx`SELECT perform_undo(${token}::uuid)`;
      // The to_shop notification is retracted; the earlier legit to_workshop one stays.
      expect(await liveNotifCount(tx, id, "garment_dispatched_to_shop")).toBe(0);
      expect(await liveNotifCount(tx, id, "garment_dispatched_to_workshop")).toBe(1);
    });
  });

  it("a schedule undo also restores a parked sibling final's plan (audit #4)", async () => {
    await inRolledBackTx(async (tx) => {
      const { garments } = await wf.createWorkOrder(tx, [
        { garment_type: "final" },
        { garment_type: "final" },
      ]);
      const [a, b] = garments.map((g) => g.id);
      // A: schedulable at workshop.  B: a parked sibling final in the same order.
      await tx`UPDATE garments SET location='workshop', piece_stage='waiting_cut', in_production=false, production_plan=NULL WHERE id=${a}::uuid`;
      await tx`UPDATE garments SET location='workshop', piece_stage='waiting_for_acceptance', in_production=false, production_plan=NULL WHERE id=${b}::uuid`;

      // The fixed client snapshots BOTH (scheduled + parked sibling).
      const snap = await snapshot(tx, [a, b]);
      // scheduleGarments: schedule A, and stamp the plan onto the parked sibling B.
      await tx`UPDATE garments SET production_plan=${tx.json({ cutting: "unit-1" })}::jsonb, in_production=true, piece_stage='cutting' WHERE id=${a}::uuid`;
      await tx`UPDATE garments SET production_plan=${tx.json({ cutting: "unit-1" })}::jsonb WHERE id=${b}::uuid`;
      const token = await recordToken(tx, "schedule", [a, b], snap);

      await tx`SELECT perform_undo(${token}::uuid)`;

      const st = await stateOf(tx, [a, b]);
      expect(st[a].production_plan).toBeNull();
      expect(st[a].piece_stage).toBe("waiting_cut");
      expect(st[b].production_plan).toBeNull(); // sibling no longer orphaned
    });
  });
});
