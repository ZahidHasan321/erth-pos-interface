import { db } from "@/lib/db";

export interface GarmentPerformanceRow {
  id: number;
  worker_history: Record<string, string> | null;
  completion_time: string | null;
  piece_stage: string;
  trip_number: number | null;
  trip_history: Array<{
    trip: number;
    worker_history: Record<string, string> | null;
    completed_date: string | null;
  }> | null;
}

export const getCompletedGarmentsInRange = async (
  from: string,
  to: string
): Promise<GarmentPerformanceRow[]> => {
  const { data, error } = await db
    .from("garments")
    .select("id, worker_history, completion_time, piece_stage, trip_number, trip_history")
    .gte("completion_time", from)
    .lte("completion_time", to)
    .order("completion_time", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GarmentPerformanceRow[];
};
