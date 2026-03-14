import type { ApiResponse } from "../types/api";
import type { GarmentFeedback } from "@repo/database";
import { supabase } from "../lib/supabase";

const TABLE_NAME = "garment_feedback";

export const createFeedback = async (
  feedback: Partial<GarmentFeedback>
): Promise<ApiResponse<GarmentFeedback>> => {
  const { data, error } = await supabase
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
  const { data, error } = await supabase
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
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    return { status: "error", message: error.message, data: [], count: 0 };
  }
  return { status: "success", data: data as any, count: data?.length || 0 };
};
