import type { ApiResponse } from "../types/api";
import type { Garment } from "@repo/database";
import { db } from "@/lib/db";
import { getBrand } from "./orders";

const TABLE_NAME = "garments";

export const updateGarment = async (
  id: string,
  garment: Partial<Garment>
): Promise<ApiResponse<Garment>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .update(garment)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating garment:', error);
    throw error;
  }
  return { status: 'success', data: data as any };
};

export const getGarmentsForRedispatch = async (): Promise<ApiResponse<any[]>> => {
  // Find garments at shop that have a feedback record requesting "workshop" distribution
  // for the garment's current trip number
  const { data, error } = await db
    .from(TABLE_NAME)
    .select(`
      *,
      orders!inner (
        id,
        customer_id,
        customers ( id, name, phone ),
        work_orders!work_orders_order_id_orders_id_fk ( invoice_number )
      ),
      garment_feedback!inner (
        id, action, distribution, satisfaction_level, notes, measurement_diffs, trip_number, created_at
      )
    `)
    .eq('location', 'shop')
    .eq('orders.brand', getBrand())
    .eq('garment_feedback.distribution', 'workshop');

  if (error) {
    console.error('Error fetching garments for redispatch:', error);
    return { status: 'error', message: error.message, data: [], count: 0 };
  }

  // Filter client-side: only keep garments where the feedback trip_number matches the garment's current trip
  const filtered = (data || []).filter(g => {
    const latestWorkshopFeedback = g.garment_feedback
      ?.filter((f: any) => f.distribution === 'workshop')
      ?.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
    return latestWorkshopFeedback && latestWorkshopFeedback.trip_number === (g.trip_number || 1);
  });

  return { status: 'success', data: filtered as any, count: filtered.length };
};

export const dispatchGarmentToWorkshop = async (
  garmentId: string,
  currentTripNumber: number
): Promise<ApiResponse<Garment>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .update({
      location: 'transit_to_workshop',
      piece_stage: 'waiting_cut',
      in_production: false,
      trip_number: currentTripNumber + 1,
      production_plan: null,
      completion_time: null,
      start_time: null,
    })
    .eq('id', garmentId)
    .select()
    .single();

  if (error) {
    console.error('Error dispatching garment to workshop:', error);
    return { status: 'error', message: error.message };
  }
  return { status: 'success', data: data as any };
};
