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
  soaking: boolean | null;
  soaking_started_at: string | null;
  soaking_completed_at: string | null;
  soaking_hours: number | null;
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
      "id, worker_history, completion_time, start_time, piece_stage, trip_number, trip_history, stage_timings, soaking, soaking_started_at, soaking_completed_at, soaking_hours, delivery_date, feedback_status, express"
    )
    .gte("completion_time", from)
    .lte("completion_time", to)
    .order("completion_time", { ascending: false });
  if (error) throw new Error(`getCompletedGarmentsInRange: failed to fetch completed garments between ${from} and ${to}: ${error.message}`);
  return (data ?? []) as GarmentPerformanceRow[];
};
