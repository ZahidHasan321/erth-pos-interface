import { db } from "@/lib/db";
import type { GarmentFeedback } from "@repo/database";

const TABLE_NAME = "garment_feedback";

export const getFeedbackByGarmentAndTrip = async (
  garmentId: string,
  tripNumber: number,
): Promise<GarmentFeedback | null> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select("*")
    .eq("garment_id", garmentId)
    .eq("trip_number", tripNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getFeedbackByGarmentAndTrip error:", error);
    return null;
  }
  return (data as GarmentFeedback | null) ?? null;
};

/**
 * All feedback rows for a garment, newest first. Used by the manager-facing
 * garment detail page to bundle each trip with the customer feedback it produced.
 */
export const getAllFeedbackForGarment = async (
  garmentId: string,
): Promise<GarmentFeedback[]> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select("*")
    .eq("garment_id", garmentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`getAllFeedbackForGarment(${garmentId}) failed:`, error);
    return [];
  }
  return (data as GarmentFeedback[] | null) ?? [];
};
