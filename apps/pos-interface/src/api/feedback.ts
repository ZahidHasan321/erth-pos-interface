import type { ApiResponse } from "../types/api";
import type { GarmentFeedback } from "@repo/database";
import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";

const TABLE_NAME = "garment_feedback";

const WRITE_RETRY_ATTEMPTS = 3;
const WRITE_RETRY_BASE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const createFeedback = async (
  feedback: Partial<GarmentFeedback>
): Promise<ApiResponse<GarmentFeedback>> => {
  const payload: any = { ...feedback };
  const idempotencyKey: string =
    (payload.idempotency_key as string | undefined) ?? crypto.randomUUID();
  payload.idempotency_key = idempotencyKey;

  let data: any = null;
  for (let attempt = 1; ; attempt++) {
    const res = await db
      .from(TABLE_NAME)
      .insert(payload)
      .select()
      .single();

    if (!res.error) {
      data = res.data;
      break;
    }

    if (res.error.code === '23505') {
      const recovered = await db
        .from(TABLE_NAME)
        .select()
        .eq('idempotency_key', idempotencyKey)
        .single();
      if (!recovered.error && recovered.data) {
        data = recovered.data;
        break;
      }
    }

    if (isTransientNetworkError(res.error) && attempt < WRITE_RETRY_ATTEMPTS) {
      await sleep(WRITE_RETRY_BASE_MS * attempt);
      continue;
    }

    console.error("Error creating feedback:", res.error);
    return { status: "error", message: res.error.message };
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
  const { data: updated, error } = await withWriteRetry(
    () => db
      .from(TABLE_NAME)
      .update(data)
      .eq("id", feedbackId)
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );

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
