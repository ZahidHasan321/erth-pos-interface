import { db } from "@/lib/db";
import type { StageTimings, QcAttempt } from "@repo/database";

export interface GarmentPerformanceRow {
  id: number;
  worker_history: Record<string, string> | null;
  completion_time: string | null;
  start_time: string | null;
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

export const getCompletedGarmentsInRange = async (
  from: string,
  to: string
): Promise<GarmentPerformanceRow[]> => {
  const { data, error } = await db
    .from("garments")
    .select(
      "id, worker_history, completion_time, start_time, piece_stage, trip_number, trip_history, stage_timings, delivery_date, feedback_status, express"
    )
    .gte("completion_time", from)
    .lte("completion_time", to)
    .order("completion_time", { ascending: false });
  if (error) throw new Error(`getCompletedGarmentsInRange: failed to fetch completed garments between ${from} and ${to}: ${error.message}`);
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
