/**
 * Repeated-returns investigation suite — CLAUDE.md §2.10 AS THE SINGLE SOURCE OF
 * TRUTH. Pins the auto-hold: a garment crossing ≥2 quality returns (QC fails) OR
 * ≥3 total returns (quality + alteration, where alteration = trip_number-1) is
 * flagged needs_investigation and dropped out of production; while flagged it
 * cannot be (re)started; a manager resolves via record_investigation, and a
 * `continue` decision RESUMES production. The hold is per-garment — siblings are
 * never affected.
 *
 * TEST DISCIPLINE (CLAUDE.md §0.2 / §7 — tests are oracles, not mirrors): every
 * threshold / hold / resume expectation comes from §2.10, never from the trigger
 * or RPC body. Idempotency = exactly-once is a universal invariant.
 *
 * Every test runs in a rolled-back transaction; committed reference data is
 * untouched.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, tryInSavepoint, actAs, only, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";
import { MANAGER, ORDER_TAKER } from "../../scripts/lifecycle/fixtures";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

async function pick(tx: Tx, id: string) {
  return only(
    await tx`SELECT needs_investigation, in_production, trip_number FROM garments WHERE id = ${id}`,
    `garment ${id}`,
  ) as unknown as { needs_investigation: boolean; in_production: boolean; trip_number: number };
}

/** A work order with two finals, dispatched (trip 1) and received & started
 *  (in_production). No brova ⇒ finals proceed normally. Returns both garment ids. */
async function twoStarted(tx: Tx): Promise<{ orderId: number; a: string; b: string }> {
  const { orderId, garments } = await wf.createWorkOrder(tx, [
    { garment_type: "final" },
    { garment_type: "final" },
  ]);
  const a = garments[0]!.id;
  const b = garments[1]!.id;
  await wf.dispatchOrder(tx, orderId);
  await wf.workshopReceive(tx, [a, b], { start: true });
  return { orderId, a, b };
}

const failQc = (tx: Tx, id: string) =>
  wf.submitQc(tx, id, { pass: false, returnStages: ["sewing"] });

// ════════════════════════════════════════════════════════════════════════════
// T1 — 2 quality returns flags + holds the garment; sibling untouched
// ════════════════════════════════════════════════════════════════════════════

describe("§2.10 detection — quality-return threshold", () => {
  it("flags + drops out of production on the 2nd QC fail; an order-sibling is unaffected", async () => {
    await inRolledBackTx(async (tx) => {
      const { a, b } = await twoStarted(tx);

      await failQc(tx, a);
      // SPEC §2.10: 1 quality return < 2 ⇒ not yet flagged.
      expect((await pick(tx, a)).needs_investigation).toBe(false);

      await failQc(tx, a);
      const ga = await pick(tx, a);
      // SPEC §2.10: 2 quality returns ⇒ flag + held (out of production).
      expect(ga.needs_investigation).toBe(true);
      expect(ga.in_production).toBe(false);

      // SPEC §2.10: the hold is PER GARMENT — the sibling keeps producing.
      const gb = await pick(tx, b);
      expect(gb.needs_investigation).toBe(false);
      expect(gb.in_production).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T2 — 3 total returns (1 quality + 2 alteration) flags
// ════════════════════════════════════════════════════════════════════════════

describe("§2.10 detection — total-return threshold", () => {
  it("flags on 1 quality + 2 alteration returns (trip 3) = 3 total", async () => {
    await inRolledBackTx(async (tx) => {
      const { garments } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
      const g = garments[0]!.id;
      // trip 3 ⇒ alteration returns = 3-1 = 2; one QC fail ⇒ quality = 1; total = 3.
      await tx`
        UPDATE garments
           SET trip_number = 3,
               trip_history = jsonb_build_array(jsonb_build_object(
                 'trip', 1,
                 'qc_attempts', jsonb_build_array(jsonb_build_object('result', 'fail'))
               ))
         WHERE id = ${g}`;
      // SPEC §2.10: quality(1) < 2 but total(3) ≥ 3 ⇒ flagged.
      expect((await pick(tx, g)).needs_investigation).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T3 — hold guard: a flagged garment cannot be (re)started
// ════════════════════════════════════════════════════════════════════════════

describe("§2.10 hold guard", () => {
  it("rejects the in_production false→true 'start' transition while flagged", async () => {
    await inRolledBackTx(async (tx) => {
      const { a } = await twoStarted(tx);
      await failQc(tx, a);
      await failQc(tx, a);
      expect((await pick(tx, a)).needs_investigation).toBe(true);
      expect((await pick(tx, a)).in_production).toBe(false);

      const rej = await tryInSavepoint(tx, (sp) => sp`UPDATE garments SET in_production = true WHERE id = ${a}`);
      // SPEC §2.10: the garment cannot be put back into production until resolved.
      expect(rej).not.toBeNull();
      expect(String((rej as Error).message)).toMatch(/investigation/i);

      // Nothing moved.
      expect((await pick(tx, a)).in_production).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T4 — record_investigation: manager-gated, 'continue' resumes, idempotent
// ════════════════════════════════════════════════════════════════════════════

describe("§2.10 record_investigation", () => {
  it("non-manager rejected; manager 'continue' clears the hold AND resumes; idempotent replay writes one record", async () => {
    await inRolledBackTx(async (tx) => {
      const { a } = await twoStarted(tx);
      await failQc(tx, a);
      await failQc(tx, a);
      expect((await pick(tx, a)).needs_investigation).toBe(true);

      // SPEC §2.10: manager-only.
      await actAs(tx, ORDER_TAKER.id); // role 'staff'
      const rej = await tryInSavepoint(tx, (sp) =>
        sp`SELECT record_investigation(${a}::uuid, 'production_error'::root_cause, 'continue', NULL, NULL, NULL, ${ORDER_TAKER.id}::uuid, ${randomUUID()}::uuid)`,
      );
      expect(rej).not.toBeNull();
      expect(String((rej as Error).message)).toMatch(/manager/i);
      expect((await pick(tx, a)).needs_investigation).toBe(true); // still held

      // SPEC §2.10: a manager 'continue' clears the hold AND resumes production.
      await actAs(tx, MANAGER.id);
      const key = randomUUID();
      const r1 = only(
        await tx`SELECT record_investigation(${a}::uuid, 'production_error'::root_cause, 'continue', 'note', 'short', 'long', ${MANAGER.id}::uuid, ${key}::uuid) AS r`,
        "record_investigation",
      ) as unknown as { r: { investigation_id: string; resumed: boolean } };
      expect(r1.r.resumed).toBe(true);
      const ga = await pick(tx, a);
      expect(ga.needs_investigation).toBe(false);
      expect(ga.in_production).toBe(true); // RESUMED (CLAUDE.md §2.10)

      // INVARIANT (idempotency = exactly-once): replay returns the same record,
      // writes no second investigation row.
      const r2 = only(
        await tx`SELECT record_investigation(${a}::uuid, 'production_error'::root_cause, 'continue', 'note', 'short', 'long', ${MANAGER.id}::uuid, ${key}::uuid) AS r`,
        "record_investigation",
      ) as unknown as { r: { investigation_id: string } };
      expect(r2.r.investigation_id).toBe(r1.r.investigation_id);
      const cnt = only(
        await tx`SELECT COUNT(*)::int AS n FROM garment_investigations WHERE garment_id = ${a}`,
        "count",
      ) as unknown as { n: number };
      expect(cnt.n).toBe(1);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T5 — re-arms on a NEW return after resolution
// ════════════════════════════════════════════════════════════════════════════

describe("§2.10 re-arming", () => {
  it("does not re-flag on resolution, but re-flags on the next new return", async () => {
    await inRolledBackTx(async (tx) => {
      const { a } = await twoStarted(tx);
      await failQc(tx, a);
      await failQc(tx, a);
      await actAs(tx, MANAGER.id);
      await tx`SELECT record_investigation(${a}::uuid, 'production_error'::root_cause, 'continue', NULL, NULL, NULL, ${MANAGER.id}::uuid, ${randomUUID()}::uuid)`;
      // Resolved ⇒ not re-flagged by the resolution write itself.
      expect((await pick(tx, a)).needs_investigation).toBe(false);

      // SPEC §2.10: a NEW return (3rd QC fail) re-arms the hold.
      await failQc(tx, a);
      expect((await pick(tx, a)).needs_investigation).toBe(true);
    });
  });
});
