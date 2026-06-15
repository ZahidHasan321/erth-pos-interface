import { db } from "@/lib/db";
import type { StageTimings, QcAttempt } from "@repo/database";

export interface GarmentPerformanceRow {
  id: number;
  /** Assigned plan for the current trip (role → worker/unit name). Used as the
   *  fallback unit for a sewing session whose presser isn't a known sewing
   *  resource (e.g. a manager pressed Done), so the piece still lands on its unit. */
  production_plan: Record<string, string> | null;
  completion_time: string | null;
  piece_stage: string;
  trip_number: number | null;
  trip_history: Array<{
    trip: number;
    worker_history: Record<string, string> | null;
    completed_date: string | null;
    qc_attempts: QcAttempt[] | null;
  }> | null;
  stage_timings: StageTimings | null;
  delivery_date: string | null;
  feedback_status: string | null;
  express: boolean | null;
}

// "Production finished" = the garment has passed QC and left the workshop floor:
// `ready_for_dispatch` (the post-QC dispatch queue) or any downstream shop/terminal
// stage. The pre-dispatch production stages (cutting…quality_check, soaking,
// waiting_*) are still IN PROGRESS; `discarded` is a redo outcome (the piece never
// finished — its labor is surfaced as capacity in the redo-impact card, §6 Q14).
// computeKpis uses this set for the garment-level KPIs (Completed / FPY / accept /
// on-time / lead time). It is NOT used for per-worker output — that reads
// stage_timings sessions, so a cutter is credited when they cut, not when the
// garment finishes downstream.
export const COMPLETED_PIECE_STAGES: ReadonlySet<string> = new Set([
  "ready_for_dispatch",
  "awaiting_trial",
  "ready_for_pickup",
  "brova_trialed",
  "completed",
]);

// Every garment with production activity since `from`. `completion_time` is the
// timestamp of the most recent stage advance (garments.ts overwrites it on every
// advance), so any garment with an in-range stage session necessarily has
// completion_time >= from — that lower bound is the cheapest server-side filter that
// can't drop a relevant garment. There is deliberately NO upper bound or piece_stage
// gate: a garment cut inside the window but finished after it must still be fetched so
// its in-range session counts. computeKpis then splits the set in JS — finished
// garments (COMPLETED_PIECE_STAGES, completion within [from,to]) for garment-level
// KPIs, and stage_timings sessions windowed by each session's own completed_at for
// per-worker / per-unit performance.
export const getPerformanceGarmentsInRange = async (
  from: string
): Promise<GarmentPerformanceRow[]> => {
  const { data, error } = await db
    .from("garments")
    .select(
      "id, production_plan, completion_time, piece_stage, trip_number, trip_history, stage_timings, delivery_date, feedback_status, express"
    )
    .gte("completion_time", from)
    .order("completion_time", { ascending: false });
  if (error) throw new Error(`getPerformanceGarmentsInRange: failed to fetch garments active since ${from}: ${error.message}`);
  return (data ?? []) as GarmentPerformanceRow[];
};

/** One row per `root_cause` of a redo material-waste annotation in range (Q14).
 *  `party` is the responsible party derived server-side from root_cause (§2.9) —
 *  the frontend never re-derives it. `waste_cost` = wasted length × unit cost. */
export interface RedoImpactRow {
  root_cause: string | null;
  party: string | null;
  redo_count: number;
  waste_qty: number;
  waste_cost: number;
}

/** Redo performance impact grouped by responsible party (CLAUDE.md §6 Q14).
 *  Reads redo scrap annotations (reason='redo') in [from, to). Company-fabric
 *  redos only — customer (OUT) redos carry no material cost, by design. */
export const getRedoImpact = async (
  from: string,
  to: string
): Promise<RedoImpactRow[]> => {
  const { data, error } = await db.rpc("get_redo_impact", { p_from: from, p_to: to });
  if (error) throw new Error(`getRedoImpact: failed to fetch redo impact between ${from} and ${to}: ${error.message}`);
  return (data ?? []) as RedoImpactRow[];
};
