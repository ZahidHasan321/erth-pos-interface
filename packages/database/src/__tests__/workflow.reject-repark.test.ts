/**
 * Reversing a brova acceptance re-parks — or blocks on — the released finals
 * (SPEC §2.5 "Reversing an acceptance re-parks — or blocks on — the released
 * finals").
 *
 * Drives the REAL deployed functions reject_brova_repark_finals /
 * repark_finals_for_rejected_brova against the real order-creation + release_finals
 * path. The oracle is the §2.5 contract, not the function body:
 *   - a released-but-un-scheduled final returns to waiting_for_acceptance when its
 *     backing brova is rejected and no other brova still accepts;
 *   - a released final that has been scheduled (production_plan set) blocks the
 *     whole reversal, leaving every row untouched (atomic);
 *   - a still-accepting sibling brova keeps the finals released (no-op).
 *
 * Runs under `pnpm test:workflow` (Docker postgres via global-setup).
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, tryInSavepoint, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

type GRow = { id: string; garment_type: string; piece_stage: string; acceptance_status: boolean | null; feedback_status: string | null; in_production: boolean | null; production_plan: unknown };

async function rows(tx: Tx, orderId: number): Promise<GRow[]> {
  return (await tx`
    SELECT id, garment_type::text, piece_stage::text, acceptance_status,
           feedback_status, in_production, production_plan
    FROM garments WHERE order_id = ${orderId} ORDER BY garment_id
  `) as unknown as GRow[];
}

/** Create a brova + N finals order; finals auto-park at waiting_for_acceptance. */
async function brovaOrder(tx: Tx, finals = 2, brovas = 1) {
  const specs = [
    ...Array.from({ length: brovas }, () => ({ garment_type: "brova" as const })),
    ...Array.from({ length: finals }, () => ({ garment_type: "final" as const })),
  ];
  const { orderId } = await wf.createWorkOrder(tx, specs);
  const all = await rows(tx, orderId);
  return {
    orderId,
    brovaIds: all.filter((g) => g.garment_type === "brova").map((g) => g.id),
    finalIds: all.filter((g) => g.garment_type === "final").map((g) => g.id),
  };
}

async function repark(tx: Tx, brovaId: string, applyBrova = true, feedbackStatus = "needs_repair") {
  const [{ r }] = (await tx`
    SELECT reject_brova_repark_finals(${brovaId}::uuid, ${applyBrova}, ${feedbackStatus}) AS r
  `) as unknown as { r: { reparked_ids: string[] } }[];
  return r;
}

describe("lifecycle: reversing a brova acceptance re-parks/blocks finals (SPEC §2.5)", () => {
  it("Accept-with-Fix → release finals → Reject-Repair re-parks them and flips the brova", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, brovaIds, finalIds } = await brovaOrder(tx, 2);
      const brovaId = brovaIds[0];

      // Accept-with-Fix, then the workshop releases the parked finals.
      await wf.brovaFeedback(tx, orderId, brovaId, "needs_repair_accepted");
      await wf.releaseFinals(tx, orderId);

      // Sanity: finals were actually released off the parked stage.
      let after = await rows(tx, orderId);
      for (const f of after.filter((g) => g.garment_type === "final")) {
        expect(f.piece_stage).toBe("waiting_cut");
      }

      // Reverse to Reject-Repair.
      const res = await repark(tx, brovaId, true, "needs_repair");
      expect(new Set(res.reparked_ids)).toEqual(new Set(finalIds));

      after = await rows(tx, orderId);
      // Every final is back to parked, production flags cleared.
      for (const f of after.filter((g) => g.garment_type === "final")) {
        expect(f.piece_stage).toBe("waiting_for_acceptance");
        expect(f.in_production).toBe(false);
        expect(f.production_plan).toBeNull();
      }
      // The brova is flipped to a rejected trial.
      const brova = after.find((g) => g.id === brovaId)!;
      expect(brova.piece_stage).toBe("brova_trialed");
      expect(brova.acceptance_status).toBe(false);
      expect(brova.feedback_status).toBe("needs_repair");
    });
  });

  it("re-parks an un-scheduled final even when in_production (live release sets it before a slot)", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, brovaIds, finalIds } = await brovaOrder(tx, 1);
      await wf.brovaFeedback(tx, orderId, brovaIds[0], "accepted");
      await wf.releaseFinals(tx, orderId);
      // Model sendToScheduler: released, in_production true, still no slot.
      await tx`UPDATE garments SET in_production = true WHERE id = ${finalIds[0]}`;

      const res = await repark(tx, brovaIds[0]);
      expect(res.reparked_ids).toEqual([finalIds[0]]);

      const f = (await rows(tx, orderId)).find((g) => g.id === finalIds[0])!;
      expect(f.piece_stage).toBe("waiting_for_acceptance");
      expect(f.in_production).toBe(false);
    });
  });

  it("BLOCKS the reversal (atomically) when a released final is already scheduled", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, brovaIds, finalIds } = await brovaOrder(tx, 2);
      const brovaId = brovaIds[0];
      await wf.brovaFeedback(tx, orderId, brovaId, "needs_repair_accepted");
      await wf.releaseFinals(tx, orderId);
      // The workshop gave one final a production slot (scheduled).
      await tx`UPDATE garments SET production_plan = ${tx.json({ day: "mon" })}::jsonb WHERE id = ${finalIds[0]}`;

      const before = await rows(tx, orderId);
      const err = await tryInSavepoint(tx, (sp) =>
        sp`SELECT reject_brova_repark_finals(${brovaId}::uuid, true, 'needs_repair')`,
      );
      expect(err).not.toBeNull();
      expect(String(err)).toMatch(/scheduled or in production/i);

      // Nothing moved — the brova is still accepted and both finals unchanged.
      expect(await rows(tx, orderId)).toEqual(before);
    });
  });

  it("no-op when another brova still accepts — finals stay released", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, brovaIds, finalIds } = await brovaOrder(tx, 1, 2);
      // Both brovas accepted, final released.
      await wf.brovaFeedback(tx, orderId, brovaIds[0], "accepted");
      await wf.brovaFeedback(tx, orderId, brovaIds[1], "accepted");
      await wf.releaseFinals(tx, orderId);

      // Reject brova #1 — brova #2 still backs the release.
      const res = await repark(tx, brovaIds[0]);
      expect(res.reparked_ids).toEqual([]);

      const after = await rows(tx, orderId);
      // The final stays released (belongs to brova #2's acceptance).
      const f = after.find((g) => g.id === finalIds[0])!;
      expect(f.piece_stage).toBe("waiting_cut");
      // Brova #1 was still flipped to rejected.
      const b1 = after.find((g) => g.id === brovaIds[0])!;
      expect(b1.acceptance_status).toBe(false);
      expect(b1.piece_stage).toBe("brova_trialed");
    });
  });

  it("still-parked finals (never released) → no-op re-park, brova flips", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, brovaIds, finalIds } = await brovaOrder(tx, 1);
      await wf.brovaFeedback(tx, orderId, brovaIds[0], "accepted");
      // No releaseFinals — the workshop never acted.

      const res = await repark(tx, brovaIds[0]);
      expect(res.reparked_ids).toEqual([]);

      const after = await rows(tx, orderId);
      expect(after.find((g) => g.id === finalIds[0])!.piece_stage).toBe("waiting_for_acceptance");
      expect(after.find((g) => g.id === brovaIds[0])!.acceptance_status).toBe(false);
    });
  });

  it("reconcile-only (apply_brova=false, the Reject-Redo entry) re-parks finals but leaves the brova untouched", async () => {
    await inRolledBackTx(async (tx) => {
      const { orderId, brovaIds, finalIds } = await brovaOrder(tx, 1);
      await wf.brovaFeedback(tx, orderId, brovaIds[0], "needs_repair_accepted");
      await wf.releaseFinals(tx, orderId);

      const res = await repark(tx, brovaIds[0], false);
      expect(res.reparked_ids).toEqual([finalIds[0]]);

      const after = await rows(tx, orderId);
      // Final re-parked...
      expect(after.find((g) => g.id === finalIds[0])!.piece_stage).toBe("waiting_for_acceptance");
      // ...but the brova is left exactly as the caller (redo teardown) will handle it.
      const b = after.find((g) => g.id === brovaIds[0])!;
      expect(b.acceptance_status).toBe(true);
      expect(b.piece_stage).toBe("brova_trialed");
    });
  });
});
