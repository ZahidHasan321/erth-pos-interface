import { supabase } from '@/lib/supabase';
import type { WorkshopGarment } from '@repo/database';
import type { PieceStage } from '@repo/database';

const WORKSHOP_QUERY = `
  *,
  order:orders!order_id(
    id,
    brand,
    checkout_status,
    workOrder:work_orders!order_id(invoice_number, delivery_date, order_phase, home_delivery)
  ),
  customer:orders!order_id(
    customer:customers!customer_id(name, phone)
  ),
  measurement:measurements!measurement_id(*)
`;

function flattenGarment(raw: any): WorkshopGarment {
  const { order, customer, measurement, ...garment } = raw;
  const wo = Array.isArray(order?.workOrder) ? order.workOrder[0] : order?.workOrder;
  const cust = Array.isArray(customer?.customer) ? customer.customer[0] : customer?.customer;

  return {
    ...garment,
    order_brand: order?.brand,
    invoice_number: wo?.invoice_number ?? undefined,
    delivery_date_order: wo?.delivery_date ?? undefined,
    home_delivery_order: wo?.home_delivery ?? false,
    customer_name: cust?.name ?? undefined,
    customer_mobile: cust?.phone ?? undefined,
    measurement: measurement ?? null,
    production_plan: garment.production_plan ?? null,
    worker_history: garment.worker_history ?? null,
    quality_check_ratings: garment.quality_check_ratings ?? null,
  };
}

export const getWorkshopGarments = async (): Promise<WorkshopGarment[]> => {
  const { data, error } = await supabase
    .from('garments')
    .select(WORKSHOP_QUERY)
    .in('location', ['workshop', 'transit_to_workshop', 'transit_to_shop'])
    .eq('order.checkout_status', 'confirmed');

  if (error) {
    console.error('getWorkshopGarments error:', error);
    return [];
  }
  // Filter out any rows where the order join returned nothing (mismatched RLS etc.)
  return (data ?? []).filter((g: any) => g.order !== null).map(flattenGarment);
};

export const receiveGarments = async (ids: string[]): Promise<void> => {
  // Only update location & in_production — preserve existing piece_stage
  // (finals with brovas arrive as waiting_for_acceptance and must stay that way)
  const { error } = await supabase
    .from('garments')
    .update({ location: 'workshop' as any, in_production: false })
    .in('id', ids);
  if (error) throw new Error(error.message);
};

export const receiveAndStartGarments = async (ids: string[]): Promise<void> => {
  // Receive all into workshop first
  const { error: e1 } = await supabase
    .from('garments')
    .update({ location: 'workshop' as any })
    .in('id', ids);
  if (e1) throw new Error(e1.message);

  // Only set in_production=true for garments NOT waiting_for_acceptance
  // (finals parked for brova trial must stay out of production)
  const { error: e2 } = await supabase
    .from('garments')
    .update({ in_production: true })
    .in('id', ids)
    .neq('piece_stage', 'waiting_for_acceptance');
  if (e2) throw new Error(e2.message);
};

export const sendToScheduler = async (ids: string[]): Promise<void> => {
  const { error } = await supabase
    .from('garments')
    .update({ in_production: true })
    .in('id', ids);
  if (error) throw new Error(error.message);
};

export const sendReturnToProduction = async (id: string, _reentryStage: PieceStage): Promise<void> => {
  // Set in_production so it appears in Scheduler's alteration tab.
  // Keep piece_stage as needs_repair/needs_redo so Scheduler filter picks it up.
  // Clear old production_plan so Scheduler knows it needs a new plan.
  // Store the intended re-entry stage in the notes for the Scheduler to use.
  const { error } = await supabase
    .from('garments')
    .update({
      in_production: true,
      location: 'workshop' as any,
      production_plan: null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
};

export const scheduleGarments = async (
  ids: string[],
  plan: Record<string, string>,
  assignedDate: string,
  assignedUnit?: string,
  reentryStage?: PieceStage,
): Promise<void> => {
  // For alterations, use the specified re-entry stage
  // For regular orders, determine based on whether a soaker is assigned
  let firstStage: PieceStage;
  if (reentryStage) {
    firstStage = reentryStage;
  } else {
    firstStage = plan.soaker ? 'soaking' : 'cutting';
  }

  const { error } = await supabase
    .from('garments')
    .update({
      production_plan: plan,
      assigned_date: assignedDate,
      assigned_unit: assignedUnit ?? null,
      piece_stage: firstStage,
      in_production: true,
    })
    .in('id', ids);
  if (error) throw new Error(error.message);
};

export const startGarment = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('garments')
    .update({ start_time: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
};

export const completeAndAdvance = async (
  id: string,
  workerName: string,
  stage: string,
  nextStage: string,
): Promise<void> => {
  // Build worker_history patch via RPC-style update — fetch first then patch
  const { data: existing, error: fetchErr } = await supabase
    .from('garments')
    .select('worker_history')
    .eq('id', id)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const history = (existing?.worker_history as Record<string, string>) ?? {};
  history[stage] = workerName;

  const { error } = await supabase
    .from('garments')
    .update({
      piece_stage: nextStage as PieceStage,
      completion_time: new Date().toISOString(),
      start_time: null,
      worker_history: history,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
};

export const qcPass = async (
  id: string,
  worker: string,
  ratings: Record<string, number>,
): Promise<void> => {
  const { data: existing, error: fetchErr } = await supabase
    .from('garments')
    .select('worker_history')
    .eq('id', id)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const history = (existing?.worker_history as Record<string, string>) ?? {};
  history['quality_checker'] = worker;

  const { error } = await supabase
    .from('garments')
    .update({
      piece_stage: 'ready_for_dispatch' as PieceStage,
      quality_check_ratings: ratings,
      worker_history: history,
      completion_time: new Date().toISOString(),
      start_time: null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
};

export const qcFail = async (id: string, returnStage: PieceStage, reason: string): Promise<void> => {
  const { data: existing, error: fetchErr } = await supabase
    .from('garments')
    .select('notes')
    .eq('id', id)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const notes = existing?.notes ? `${existing.notes}\nQC Fail: ${reason}` : `QC Fail: ${reason}`;

  const { error } = await supabase
    .from('garments')
    .update({ piece_stage: returnStage, notes, start_time: null })
    .eq('id', id);
  if (error) throw new Error(error.message);
};

export const dispatchGarments = async (ids: string[]): Promise<void> => {
  const { error } = await supabase
    .from('garments')
    .update({ location: 'transit_to_shop', in_production: false })
    .in('id', ids);
  if (error) throw new Error(error.message);
};

/** Release finals from waiting_for_acceptance → waiting_cut so they can enter production */
export const releaseFinals = async (ids: string[]): Promise<void> => {
  const { error } = await supabase
    .from('garments')
    .update({ piece_stage: 'waiting_cut' as PieceStage, in_production: false })
    .in('id', ids)
    .eq('piece_stage', 'waiting_for_acceptance');
  if (error) throw new Error(error.message);
};

/** Release finals with a production plan + assigned date — skips scheduler step */
export const releaseFinalsWithPlan = async (
  ids: string[],
  plan: Record<string, string>,
  assignedDate: string,
  assignedUnit?: string,
): Promise<void> => {
  const firstStage: PieceStage = plan.soaker ? 'soaking' : 'cutting';
  const { error } = await supabase
    .from('garments')
    .update({
      piece_stage: firstStage,
      in_production: true,
      production_plan: plan,
      assigned_date: assignedDate,
      assigned_unit: assignedUnit ?? null,
    })
    .in('id', ids)
    .eq('piece_stage', 'waiting_for_acceptance');
  if (error) throw new Error(error.message);
};

/** Update garment details (dates, unit, production plan) — used by Assigned Orders inline editing */
export const updateGarmentDetails = async (
  id: string,
  updates: {
    assigned_date?: string | null;
    delivery_date?: string | null;
    assigned_unit?: string | null;
    production_plan?: Record<string, string> | null;
  },
): Promise<void> => {
  const { error } = await supabase
    .from('garments')
    .update(updates)
    .eq('id', id);
  if (error) throw new Error(error.message);
};

/** Bulk update delivery_date for all garments in an order */
export const updateOrderDeliveryDate = async (orderId: number, date: string): Promise<void> => {
  // Update delivery_date on the work_orders table
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id')
    .eq('order_id', orderId)
    .single();
  if (wo) {
    const { error } = await supabase
      .from('work_orders')
      .update({ delivery_date: date })
      .eq('id', wo.id);
    if (error) throw new Error(error.message);
  }
};

/** Fetch brova production plans for given order IDs (to pre-populate finals scheduling) */
export const getBrovaPlansForOrders = async (
  orderIds: number[],
): Promise<Record<number, Record<string, string>>> => {
  if (!orderIds.length) return {};
  const { data, error } = await supabase
    .from('garments')
    .select('order_id, production_plan')
    .in('order_id', orderIds)
    .eq('garment_type', 'brova')
    .not('production_plan', 'is', null);
  if (error) {
    console.error('getBrovaPlansForOrders error:', error);
    return {};
  }
  // Return the first brova's plan for each order
  const result: Record<number, Record<string, string>> = {};
  for (const g of data ?? []) {
    if (!result[g.order_id] && g.production_plan) {
      result[g.order_id] = g.production_plan as Record<string, string>;
    }
  }
  return result;
};

/** Fetch brova acceptance status for given order IDs */
export const getBrovaStatusForOrders = async (
  orderIds: number[],
): Promise<Record<number, { total: number; trialed: number; accepted: number }>> => {
  if (!orderIds.length) return {};
  const { data, error } = await supabase
    .from('garments')
    .select('order_id, piece_stage, acceptance_status')
    .in('order_id', orderIds)
    .eq('garment_type', 'brova');
  if (error) {
    console.error('getBrovaStatusForOrders error:', error);
    return {};
  }
  const result: Record<number, { total: number; trialed: number; accepted: number }> = {};
  for (const g of data ?? []) {
    if (!result[g.order_id]) result[g.order_id] = { total: 0, trialed: 0, accepted: 0 };
    const entry = result[g.order_id];
    entry.total++;
    const trialedStages = ['accepted', 'needs_repair', 'needs_redo', 'completed'];
    if (trialedStages.includes(g.piece_stage ?? '')) entry.trialed++;
    if (g.acceptance_status === true) entry.accepted++;
  }
  return result;
};

/** Bulk update assigned_date for all garments in an order */
export const updateOrderAssignedDate = async (orderId: number, date: string): Promise<void> => {
  const { error } = await supabase
    .from('garments')
    .update({ assigned_date: date })
    .eq('order_id', orderId)
    .neq('piece_stage', 'waiting_for_acceptance');
  if (error) throw new Error(error.message);
};
