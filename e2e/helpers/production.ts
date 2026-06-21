/**
 * Seed-advance the INTERNAL production chain + QC pass for a garment, against the
 * COMMITTED local DB.
 *
 * WHY SEEDED, NOT UI (this pass): the per-stage terminal flow (navigate → Start →
 * pick worker → Done → confirm, ×5 stages) and especially the QC form (every
 * measurement keyed to the customer's measurement snapshot + every style option +
 * every quality rating, all matched to spec) are too brittle for the FIRST
 * cross-app pass. The handoff surfaces around production — which are what the
 * no-leak invariant actually exercises (receiving / parking / scheduler / dispatch
 * / shop-receive / collect) — are driven through the real UI in the spec. The
 * no-leak oracle is still asserted around each seeded step.
 *
 * These two ops mirror the shared lifecycle driver EXACTLY (cited per line), so
 * they exercise the same column mutations the app issues:
 *   - advanceProduction  ← driver.ts runProduction (cutting→sewing→…→quality_check)
 *   - passQc             ← driver.ts submitQc({pass:true}) persistence shape
 *     (apps/workshop/src/api/garments.ts submitQc): pass → ready_for_dispatch,
 *     append a pass qc_attempt to trip_history for the current trip.
 *
 * Both run plain SQL on the shared postgres.js connection (getDb()).
 */
import { getDb } from "./db";

// Production chain (post_cutting disabled, soaking is a parallel track) — same
// order as driver.ts PROD_STAGES.
const PROD_STAGES = ["cutting", "sewing", "finishing", "ironing", "quality_check"] as const;

/**
 * Advance the garment from its scheduled `cutting` stage through to
 * `quality_check` (QC is a separate explicit step). Mirrors driver.ts
 * runProduction: the waiting_cut→cutting bump is a no-op here (the scheduler UI
 * already set cutting), then each subsequent stage is stamped in order.
 */
export async function advanceProductionToQc(garmentUuid: string): Promise<void> {
  const sql = getDb();
  // waiting_cut → cutting (no-op after scheduling, but kept faithful to the driver).
  await sql`
    UPDATE garments
       SET piece_stage = 'cutting', in_production = true, qc_rework_stages = NULL
     WHERE id = ${garmentUuid} AND piece_stage = 'waiting_cut'
  `;
  for (let i = 1; i < PROD_STAGES.length; i++) {
    const next = PROD_STAGES[i]!;
    const prev = PROD_STAGES[i - 1]!;
    await sql`
      UPDATE garments
         SET piece_stage = ${next}, completion_time = NOW(), start_time = NULL
       WHERE id = ${garmentUuid} AND piece_stage = ${prev}
    `;
  }
}

/**
 * Pass QC: quality_check → ready_for_dispatch, recording a passing qc_attempt on
 * the current trip's trip_history entry. Mirrors driver.ts submitQc({pass:true})
 * + the app's submitQc persistence (no trip increment).
 */
export async function passQc(garmentUuid: string): Promise<void> {
  const sql = getDb();
  const [g] = await sql<{ trip_number: number | null; trip_history: unknown }[]>`
    SELECT trip_number, trip_history FROM garments WHERE id = ${garmentUuid}
  `;
  if (!g) throw new Error(`passQc: garment ${garmentUuid} not found`);
  const trip = g.trip_number ?? 1;
  type Entry = { trip: number; qc_attempts?: { result: string; trip?: number; attempt_number?: number; return_stages?: string[] | null }[] };
  const history: Entry[] = Array.isArray(g.trip_history) ? (g.trip_history as Entry[]) : [];
  let entry = history.find((h) => h.trip === trip);
  if (!entry) {
    entry = { trip, qc_attempts: [] };
    history.push(entry);
  }
  entry.qc_attempts = entry.qc_attempts ?? [];
  entry.qc_attempts.push({
    result: "pass",
    trip,
    attempt_number: entry.qc_attempts.length + 1,
    return_stages: null,
  });

  await sql`
    UPDATE garments
       SET piece_stage = 'ready_for_dispatch', completion_time = NOW(),
           start_time = NULL, qc_rework_stages = NULL,
           trip_history = ${sql.json(history)}::jsonb
     WHERE id = ${garmentUuid}
  `;
}
