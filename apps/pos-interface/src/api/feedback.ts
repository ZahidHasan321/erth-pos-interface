import type { ApiResponse } from "../types/api";
import type { GarmentFeedback } from "@repo/database";
import { db } from "@/lib/db";

const TABLE_NAME = "garment_feedback";

export const createFeedback = async (
  feedback: Partial<GarmentFeedback>
): Promise<ApiResponse<GarmentFeedback>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .insert(feedback)
    .select()
    .single();

  if (error) {
    console.error("Error creating feedback:", error);
    return { status: "error", message: error.message };
  }
  return { status: "success", data: data as any };
};

export const getFeedbackByGarmentId = async (
  garmentId: string
): Promise<ApiResponse<GarmentFeedback[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select("*")
    .eq("garment_id", garmentId)
    .order("created_at", { ascending: false });

  if (error) {
    return { status: "error", message: error.message, data: [], count: 0 };
  }
  return { status: "success", data: data as any, count: data?.length || 0 };
};

export const getFeedbackByOrderId = async (
  orderId: number
): Promise<ApiResponse<GarmentFeedback[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    return { status: "error", message: error.message, data: [], count: 0 };
  }
  return { status: "success", data: data as any, count: data?.length || 0 };
};

export const updateFeedback = async (
  feedbackId: string,
  data: Partial<GarmentFeedback>
): Promise<ApiResponse<GarmentFeedback>> => {
  const { data: updated, error } = await db
    .from(TABLE_NAME)
    .update(data)
    .eq("id", feedbackId)
    .select()
    .single();

  if (error) {
    console.error("Error updating feedback:", error);
    return { status: "error", message: error.message };
  }
  return { status: "success", data: updated as any };
};

export const getFeedbackByGarmentAndTrip = async (
  garmentId: string,
  tripNumber: number
): Promise<ApiResponse<GarmentFeedback | null>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select("*")
    .eq("garment_id", garmentId)
    .eq("trip_number", tripNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { status: "error", message: error.message };
  }
  return { status: "success", data: data as any };
};
