import type { ApiResponse } from "../types/api";
import type { Garment } from "@repo/database";
import { db } from "@/lib/db";
import { parseUtcTimestamp } from "@/lib/utils";
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
    console.error('updateGarment: failed to update garment:', error);
    throw error;
  }
  return { status: 'success', data: data as any };
};

// Repoint every brova garment in an order that currently points to `oldMeasurementId`
// over to `newMeasurementId`. Used by feedback page when a new measurements row is
// created from customer-requested changes — siblings sharing the same old id inherit it.
export const bulkRepointMeasurement = async (
  orderId: number,
  oldMeasurementId: string,
  newMeasurementId: string,
): Promise<ApiResponse<Garment[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .update({ measurement_id: newMeasurementId })
    .eq('order_id', orderId)
    .eq('measurement_id', oldMeasurementId)
    .eq('garment_type', 'brova')
    .select();

  if (error) {
    console.error('bulkRepointMeasurement: failed to repoint sibling brova garments:', error);
    throw error;
  }
  return { status: 'success', data: data as any };
};

// Overwrite style-related fields on every brova garment in an order that shares the
// same per-order `style_id` group. `style_id` itself stays fixed so grouping holds.
export const bulkUpdateStyleFields = async (
  orderId: number,
  styleId: number,
  fields: Partial<Garment>,
): Promise<ApiResponse<Garment[]>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .update(fields)
    .eq('order_id', orderId)
    .eq('style_id', styleId)
    .eq('garment_type', 'brova')
    .select();

  if (error) {
    console.error('bulkUpdateStyleFields: failed to update sibling style fields:', error);
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
    console.error('getGarmentsForRedispatch: failed to fetch garments for redispatch:', error);
    return { status: 'error', message: error.message, data: [], count: 0 };
  }

  // Filter client-side: only keep garments where the feedback trip_number matches the garment's current trip
  const filtered = (data || []).filter(g => {
    const latestWorkshopFeedback = g.garment_feedback
      ?.filter((f: any) => f.distribution === 'workshop')
      ?.sort((a: any, b: any) => parseUtcTimestamp(b.created_at || 0).getTime() - parseUtcTimestamp(a.created_at || 0).getTime())[0];
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
    console.error('dispatchGarmentToWorkshop: failed to dispatch garment to workshop:', error);
    return { status: 'error', message: error.message };
  }

  // Append dispatch log entry (best-effort; don't block on failure).
  try {
    if (data) {
      await db.from('dispatch_log').insert({
        garment_id: (data as any).id,
        order_id: (data as any).order_id,
        direction: 'to_workshop',
        trip_number: (data as any).trip_number ?? currentTripNumber + 1,
      });
    }
  } catch (logErr) {
    console.error('Failed to write dispatch_log (non-blocking):', logErr);
  }

  return { status: 'success', data: data as any };
};
