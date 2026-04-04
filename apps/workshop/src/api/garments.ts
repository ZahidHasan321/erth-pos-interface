import { db } from "@/lib/db";
import { getLocalMidnightUtc, getLocalDateStr } from '@/lib/utils';
import type { WorkshopGarment, TripHistoryEntry } from '@repo/database';
import type { PieceStage } from '@repo/database';

/** Map piece_stage → worker_history key (role-based) */
const HISTORY_KEY_MAP: Record<string, string> = {
  soaking: "soaker", cutting: "cutter", post_cutting: "post_cutter",
  sewing: "sewer", finishing: "finisher", ironing: "ironer",
  quality_check: "quality_checker",
};

/** Safely parse trip_history — handles string, array, or null from Supabase */
function parseTripHistory(raw: unknown): TripHistoryEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

const WORKSHOP_QUERY = `
  *,
  order:orders!order_id(
    id,
    brand,
    checkout_status,
    workOrder:work_orders!order_id(invoice_number, delivery_date, order_phase, home_delivery)
  ),
  customer:orders!order_id(
    customer:customers!customer_id(name, phone, country_code)
  ),
  measurement:measurements!measurement_id(*),
  style_ref:styles!style_id(name, image_url),
  fabric_ref:fabrics!fabric_id(name, color)
`;

function flattenGarment(raw: any): WorkshopGarment {
  const { order, customer, measurement, style_ref, fabric_ref, ...garment } = raw;
  const wo = Array.isArray(order?.workOrder) ? order.workOrder[0] : order?.workOrder;
  const cust = Array.isArray(customer?.customer) ? customer.customer[0] : customer?.customer;

  return {
    ...garment,
    order_brand: order?.brand,
    invoice_number: wo?.invoice_number ?? undefined,
    delivery_date_order: wo?.delivery_date ?? undefined,
    home_delivery_order: wo?.home_delivery ?? false,
    order_phase: wo?.order_phase ?? undefined,
    customer_name: cust?.name ?? undefined,
    customer_mobile: [cust?.country_code, cust?.phone].filter(Boolean).join(' ') || undefined,
    measurement: measurement ?? null,
    production_plan: garment.production_plan ?? null,
    worker_history: garment.worker_history ?? null,
    quality_check_ratings: garment.quality_check_ratings ?? null,
    style_name: style_ref?.name ?? garment.style ?? undefined,
    style_image_url: style_ref?.image_url ?? undefined,
    fabric_name: fabric_ref?.name ?? undefined,
    fabric_color: fabric_ref?.color ?? garment.color ?? undefined,
  };
}

export const getWorkshopGarments = async (): Promise<WorkshopGarment[]> => {
  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY)
    .in('location', ['workshop', 'transit_to_workshop', 'transit_to_shop', 'lost_in_transit'])
    .eq('order.checkout_status', 'confirmed');

  if (error) {
    console.error('getWorkshopGarments error:', error);
    return [];
  }
  // Filter out any rows where the order join returned nothing (mismatched RLS etc.)
  return (data ?? []).filter((g: any) => g.order !== null).map(flattenGarment);
};

/** Fetch garments completed today (any location) for terminal "Done" counts */
export const getCompletedTodayGarments = async (): Promise<WorkshopGarment[]> => {
  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY)
    .gte('completion_time', getLocalMidnightUtc())
    .eq('order.checkout_status', 'confirmed');

  if (error) {
    console.error('getCompletedTodayGarments error:', error);
    return [];
  }
  return (data ?? []).filter((g: any) => g.order !== null).map(flattenGarment);
};

/**
 * Fetch ALL garments from orders that have any production activity.
 * Used by Assigned Orders — the "holy grail" view that shows every garment
 * regardless of location (shop, workshop, transit) or stage.
 */
export const getAssignedViewGarments = async (): Promise<WorkshopGarment[]> => {
  // Step 1: find order_ids with at least one garment that has a production_plan
  const { data: planned, error: e1 } = await db
    .from('garments')
    .select('order_id')
    .not('production_plan', 'is', null);

  if (e1 || !planned?.length) return [];

  const orderIds = [...new Set(planned.map((g: any) => g.order_id))];

  // Step 2: fetch ALL garments from those orders (no location filter)
  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY)
    .in('order_id', orderIds)
    .eq('order.checkout_status', 'confirmed');

  if (error) {
    console.error('getAssignedViewGarments error:', error);
    return [];
  }
  return (data ?? [])
    .filter((g: any) => g.order !== null)
    .filter((g: any) => {
      // Exclude completed orders — they belong in the completed view
      const wo = Array.isArray(g.order?.workOrder) ? g.order.workOrder[0] : g.order?.workOrder;
      return wo?.order_phase !== 'completed';
    })
    .map(flattenGarment);
};

/**
 * Fetch ALL garments for a specific order — no location or plan filter.
 * Used by the order detail page to show full order regardless of production status.
 */
export const getOrderGarments = async (orderId: number): Promise<WorkshopGarment[]> => {
  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY)
    .eq('order_id', orderId)
    .eq('order.checkout_status', 'confirmed');

  if (error) {
    console.error('getOrderGarments error:', error);
    return [];
  }
  return (data ?? []).filter((g: any) => g.order !== null).map(flattenGarment);
};

/**
 * Fetch a single garment by ID — no location filter.
 */
export const getGarmentById = async (id: string): Promise<WorkshopGarment | null> => {
  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY)
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('getGarmentById error:', error);
    return null;
  }
  return flattenGarment(data);
};

/**
 * Fetch garments from orders where ALL garments are completed (back at shop or piece_stage=completed).
 */
export const getCompletedOrderGarments = async (): Promise<WorkshopGarment[]> => {
  // Step 1: find order_ids with at least one garment that has a production_plan
  const { data: planned, error: e1 } = await db
    .from('garments')
    .select('order_id')
    .not('production_plan', 'is', null);

  if (e1 || !planned?.length) return [];

  const orderIds = [...new Set(planned.map((g: any) => g.order_id))];

  // Step 2: fetch ALL garments from those orders
  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY)
    .in('order_id', orderIds)
    .eq('order.checkout_status', 'confirmed');

  if (error) {
    console.error('getCompletedOrderGarments error:', error);
    return [];
  }

  const all = (data ?? []).filter((g: any) => g.order !== null).map(flattenGarment);

  // Step 3: group by order and keep only orders where ALL garments are completed/at shop
  const byOrder = new Map<number, WorkshopGarment[]>();
  for (const g of all) {
    if (!byOrder.has(g.order_id)) byOrder.set(g.order_id, []);
    byOrder.get(g.order_id)!.push(g);
  }

  // A garment is "done" from the workshop's perspective if it's completed,
  // or it's back at shop in a post-production stage (not awaiting_trial or needing action)
  const SHOP_DONE_STAGES = new Set(['completed', 'ready_for_pickup', 'brova_trialed']);
  const isGarmentDone = (g: WorkshopGarment) =>
    g.piece_stage === 'completed' ||
    (g.location === 'shop' && SHOP_DONE_STAGES.has(g.piece_stage ?? ''));

  const result: WorkshopGarment[] = [];
  for (const garments of byOrder.values()) {
    if (garments.every(isGarmentDone)) result.push(...garments);
  }
  return result;
};

export const receiveGarments = async (ids: string[]): Promise<void> => {
  // Only update location & in_production — preserve existing piece_stage
  // (finals with brovas arrive as waiting_for_acceptance and must stay that way)
  const { error } = await db
    .from('garments')
    .update({ location: 'workshop' as any, in_production: false })
    .in('id', ids);
  if (error) throw new Error(error.message);

  // Accepted brovas go straight to ready_for_dispatch — no production needed,
  // they're just waiting to be dispatched back with the rest of the order
  const { error: eAccepted } = await db
    .from('garments')
    .update({ piece_stage: 'ready_for_dispatch' as PieceStage })
    .in('id', ids)
    .eq('feedback_status', 'accepted');
  if (eAccepted) throw new Error(eAccepted.message);

  // For return garments with non-accepted feedback, set piece_stage to waiting_cut
  const { error: e2 } = await db
    .from('garments')
    .update({ piece_stage: 'waiting_cut' as PieceStage })
    .in('id', ids)
    .not('feedback_status', 'is', null)
    .neq('feedback_status', 'accepted')
    .eq('piece_stage', 'brova_trialed');
  if (e2) throw new Error(e2.message);

  // Clear stale production fields for returning garments (trip > 1)
  // so they appear fresh in the scheduler and don't ghost in terminal "Done" lists.
  // Keep worker_history — needed by ReturnPlanDialog to auto-populate the same team.
  const { error: e3 } = await db
    .from('garments')
    .update({ production_plan: null, completion_time: null, start_time: null })
    .in('id', ids)
    .gt('trip_number', 1);
  if (e3) throw new Error(e3.message);
};

export const receiveAndStartGarments = async (ids: string[]): Promise<void> => {
  // Receive all into workshop first
  const { error: e1 } = await db
    .from('garments')
    .update({ location: 'workshop' as any })
    .in('id', ids);
  if (e1) throw new Error(e1.message);

  // Accepted brovas go straight to ready_for_dispatch — no production needed
  const { error: eAccepted } = await db
    .from('garments')
    .update({ piece_stage: 'ready_for_dispatch' as PieceStage, in_production: false })
    .in('id', ids)
    .eq('feedback_status', 'accepted');
  if (eAccepted) throw new Error(eAccepted.message);

  // Only set in_production=true for garments NOT waiting_for_acceptance and NOT accepted
  // (finals parked for brova trial must stay out of production)
  // Note: .neq() excludes NULLs in PostgREST, so we use .or() to include
  // garments where feedback_status is null (first-trip) or non-accepted (returns)
  const { error: e2 } = await db
    .from('garments')
    .update({ in_production: true })
    .in('id', ids)
    .or('piece_stage.neq.waiting_for_acceptance,piece_stage.is.null')
    .or('feedback_status.neq.accepted,feedback_status.is.null');
  if (e2) throw new Error(e2.message);

  // For return brovas with non-accepted feedback, reset piece_stage to waiting_cut
  // so they appear in the scheduler
  const { error: e3 } = await db
    .from('garments')
    .update({ piece_stage: 'waiting_cut' as PieceStage })
    .in('id', ids)
    .not('feedback_status', 'is', null)
    .neq('feedback_status', 'accepted')
    .eq('piece_stage', 'brova_trialed');
  if (e3) throw new Error(e3.message);

  // Clear stale production fields for returning garments (trip > 1)
  // so they appear fresh in the scheduler and don't ghost in terminal "Done" lists.
  // Keep worker_history — needed by ReturnPlanDialog to auto-populate the same team.
  const { error: e4 } = await db
    .from('garments')
    .update({ production_plan: null, completion_time: null, start_time: null })
    .in('id', ids)
    .gt('trip_number', 1);
  if (e4) throw new Error(e4.message);
};

export const sendToScheduler = async (ids: string[]): Promise<void> => {
  const { error } = await db
    .from('garments')
    .update({ in_production: true })
    .in('id', ids);
  if (error) throw new Error(error.message);
};

export const sendReturnToProduction = async (id: string, _reentryStage: PieceStage): Promise<void> => {
  // Set in_production so it appears in Scheduler's alteration tab.
  // Set piece_stage to waiting_cut (feedback_status already has the context).
  // Clear old production_plan so Scheduler knows it needs a new plan.
  const { error } = await db
    .from('garments')
    .update({
      in_production: true,
      location: 'workshop' as any,
      production_plan: null,
      piece_stage: 'waiting_cut' as PieceStage,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
};

export const scheduleGarments = async (
  ids: string[],
  plan: Record<string, string>,
  assignedDate: string,
  _assignedUnit?: string,
  reentryStage?: PieceStage,
  soakingIds?: string[],
  nonSoakingIds?: string[],
): Promise<void> => {
  const baseUpdate = {
    production_plan: plan,
    assigned_date: assignedDate,
    in_production: true,
  };

  if (reentryStage) {
    const { error } = await db
      .from('garments')
      .update({ ...baseUpdate, piece_stage: reentryStage })
      .in('id', ids);
    if (error) throw new Error(error.message);
  } else if (soakingIds?.length && nonSoakingIds?.length) {
    const [r1, r2] = await Promise.all([
      db.from('garments').update({ ...baseUpdate, piece_stage: 'soaking' as PieceStage }).in('id', soakingIds),
      db.from('garments').update({ ...baseUpdate, piece_stage: 'cutting' as PieceStage }).in('id', nonSoakingIds),
    ]);
    if (r1.error) throw new Error(r1.error.message);
    if (r2.error) throw new Error(r2.error.message);
  } else {
    const firstStage: PieceStage = (soakingIds?.length && plan.soaker) ? 'soaking' : 'cutting';
    const { error } = await db
      .from('garments')
      .update({ ...baseUpdate, piece_stage: firstStage })
      .in('id', ids);
    if (error) throw new Error(error.message);
  }

  // Append trip_history entry for each garment
  const { data: garments } = await db
    .from('garments')
    .select('id, trip_number, trip_history')
    .in('id', ids);

  if (garments?.length) {
    await Promise.all(garments.map((g: any) => {
      const history = parseTripHistory(g.trip_history);
      history.push({
        trip: g.trip_number ?? 1,
        reentry_stage: reentryStage ?? null,
        production_plan: plan,
        worker_history: null,
        assigned_date: assignedDate,
        completed_date: null,
        qc_attempts: [],
      });
      return db.from('garments').update({ trip_history: history }).eq('id', g.id);
    }));
  }

  // Also save production_plan to waiting_for_acceptance finals in the same orders
  if (!reentryStage) {
    const { data: scheduled } = await db
      .from('garments')
      .select('order_id')
      .in('id', ids);
    if (scheduled?.length) {
      const orderIds = [...new Set(scheduled.map((g: any) => g.order_id))];
      await db
        .from('garments')
        .update({ production_plan: plan })
        .in('order_id', orderIds)
        .eq('piece_stage', 'waiting_for_acceptance');
    }
  }
};

export const startGarment = async (id: string): Promise<void> => {
  // Idempotency: don't overwrite if already started
  const { data: existing } = await db
    .from('garments')
    .select('start_time')
    .eq('id', id)
    .single();
  if (existing?.start_time) return;

  const { error } = await db
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
  // Fetch current state and validate stage matches before advancing
  const { data: existing, error: fetchErr } = await db
    .from('garments')
    .select('worker_history, piece_stage')
    .eq('id', id)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  // Stage validation: reject if garment is not at the claimed stage
  if (existing?.piece_stage !== stage) {
    throw new Error(`Cannot advance: garment is at "${existing?.piece_stage}", not "${stage}"`);
  }

  const history = (existing?.worker_history as Record<string, string>) ?? {};
  const historyKey = HISTORY_KEY_MAP[stage] ?? stage;
  history[historyKey] = workerName;

  const { error } = await db
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
  const { data: existing, error: fetchErr } = await db
    .from('garments')
    .select('worker_history, trip_history, trip_number')
    .eq('id', id)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const history = (existing?.worker_history as Record<string, string>) ?? {};
  history['quality_checker'] = worker;

  const now = new Date().toISOString();
  const tripHistory = parseTripHistory(existing?.trip_history);
  const currentTrip = existing?.trip_number ?? 1;
  const tripEntry = tripHistory.find((t) => t.trip === currentTrip);
  if (tripEntry) {
    tripEntry.worker_history = history;
    tripEntry.completed_date = getLocalDateStr();
    tripEntry.qc_attempts.push({
      inspector: worker,
      ratings,
      result: "pass",
      fail_reason: null,
      return_stage: null,
      date: getLocalDateStr(),
    });
  }

  const { error } = await db
    .from('garments')
    .update({
      piece_stage: 'ready_for_dispatch' as PieceStage,
      quality_check_ratings: ratings,
      worker_history: history,
      completion_time: now,
      start_time: null,
      trip_history: tripHistory,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
};

export const qcFail = async (id: string, returnStage: PieceStage, reason: string): Promise<void> => {
  const { data: existing, error: fetchErr } = await db
    .from('garments')
    .select('notes, trip_history, trip_number, worker_history')
    .eq('id', id)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const notes = existing?.notes ? `${existing.notes}\nQC Fail: ${reason}` : `QC Fail: ${reason}`;

  const tripHistory = parseTripHistory(existing?.trip_history);
  const currentTrip = existing?.trip_number ?? 1;
  const tripEntry = tripHistory.find((t) => t.trip === currentTrip);
  if (tripEntry) {
    tripEntry.worker_history = (existing?.worker_history as Record<string, string>) ?? null;
    tripEntry.qc_attempts.push({
      inspector: "",
      ratings: null,
      result: "fail",
      fail_reason: reason,
      return_stage: returnStage,
      date: getLocalDateStr(),
    });
  }

  const { error } = await db
    .from('garments')
    .update({ piece_stage: returnStage, notes, start_time: null, trip_history: tripHistory })
    .eq('id', id);
  if (error) throw new Error(error.message);
};

export const dispatchGarments = async (ids: string[]): Promise<void> => {
  const { error } = await db
    .from('garments')
    .update({ location: 'transit_to_shop', in_production: false, feedback_status: null })
    .in('id', ids);
  if (error) throw new Error(error.message);
};

/** Release finals from waiting_for_acceptance → waiting_cut so they can enter production */
export const releaseFinals = async (ids: string[]): Promise<void> => {
  const { error } = await db
    .from('garments')
    .update({ piece_stage: 'waiting_cut' as PieceStage, in_production: false })
    .in('id', ids)
    .eq('piece_stage', 'waiting_for_acceptance');
  if (error) throw new Error(error.message);
};

/** Release finals with a production plan + assigned date — skips scheduler step.
 *  Handles finals at waiting_for_acceptance (not yet POS-released) or waiting_cut (POS-released, no plan). */
export const releaseFinalsWithPlan = async (
  ids: string[],
  plan: Record<string, string>,
  assignedDate: string,
  _assignedUnit?: string,
): Promise<void> => {
  const firstStage: PieceStage = plan.soaker ? 'soaking' : 'cutting';
  const { error } = await db
    .from('garments')
    .update({
      piece_stage: firstStage,
      in_production: true,
      production_plan: plan,
      assigned_date: assignedDate,
    })
    .in('id', ids);
  if (error) throw new Error(error.message);
};

/** Update garment details (dates, production plan) — used by Assigned Orders editing.
 *  Enforces editability rules: rejects plan/date changes on locked garments. */
export const updateGarmentDetails = async (
  id: string,
  updates: {
    assigned_date?: string | null;
    delivery_date?: string | null;
    production_plan?: Record<string, string> | null;
    piece_stage?: string | null;
  },
): Promise<void> => {
  // Fetch current garment state for validation
  const { data: current, error: fetchErr } = await db
    .from('garments')
    .select('location, piece_stage, start_time')
    .eq('id', id)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!current) throw new Error('Garment not found');

  const location = current.location ?? '';
  const stage = current.piece_stage ?? '';
  const hasStarted = !!current.start_time;

  const DONE_STAGES = ['completed', 'ready_for_pickup'];
  const NO_PLAN_STAGES = ['completed', 'ready_for_pickup', 'ready_for_dispatch', 'waiting_for_acceptance'];

  // Determine what's allowed
  const isAtWorkshop = location === 'workshop';
  const canEditPlan = isAtWorkshop && !hasStarted && !NO_PLAN_STAGES.includes(stage);
  const canEditDeliveryDate = isAtWorkshop && !DONE_STAGES.includes(stage)
    || location === 'transit_to_workshop';

  // Strip disallowed fields
  const filtered = { ...updates };
  if (!canEditPlan) {
    delete filtered.production_plan;
    delete filtered.assigned_date;
    delete filtered.piece_stage;
  }
  if (!canEditDeliveryDate) {
    delete filtered.delivery_date;
  }

  // If nothing left to update, skip
  if (Object.keys(filtered).length === 0) return;

  const { error } = await db
    .from('garments')
    .update(filtered)
    .eq('id', id);
  if (error) throw new Error(error.message);
};

/** Bulk update delivery_date for all garments in an order */
export const updateOrderDeliveryDate = async (orderId: number, date: string): Promise<void> => {
  // Update delivery_date on the work_orders table
  const { data: wo } = await db
    .from('work_orders')
    .select('id')
    .eq('order_id', orderId)
    .single();
  if (wo) {
    const { error } = await db
      .from('work_orders')
      .update({ delivery_date: date })
      .eq('id', wo.id);
    if (error) throw new Error(error.message);
  }
};

/** Fetch brova production plans for given order IDs (to pre-populate finals scheduling).
 *  Uses worker_history (actual workers per stage) merged with production_plan as fallback,
 *  since worker_history has the complete picture after production. */
export const getBrovaPlansForOrders = async (
  orderIds: number[],
): Promise<Record<number, Record<string, string>>> => {
  if (!orderIds.length) return {};
  // Fetch all brovas for these orders — filter for plan/history in JS to avoid PostgREST OR issues
  const { data, error } = await db
    .from('garments')
    .select('order_id, production_plan, worker_history')
    .in('order_id', orderIds)
    .eq('garment_type', 'brova');
  if (error) {
    console.error('getBrovaPlansForOrders error:', error);
    return {};
  }
  // Return merged plan: worker_history (complete) takes precedence, production_plan fills gaps
  // Remap worker_history keys (stage names) to plan keys (role names)
  const HISTORY_TO_PLAN: Record<string, string> = {
    soaking: 'soaker', cutting: 'cutter', post_cutting: 'post_cutter',
    sewing: 'sewer', finishing: 'finisher', ironing: 'ironer', quality_checker: 'quality_checker',
  };
  const result: Record<number, Record<string, string>> = {};
  for (const g of data ?? []) {
    if (result[g.order_id]) continue;
    const plan = (g.production_plan ?? {}) as Record<string, string>;
    const history = (g.worker_history ?? {}) as Record<string, string>;
    // Build merged plan: start with production_plan, overlay with worker_history
    const merged: Record<string, string> = { ...plan };
    for (const [historyKey, worker] of Object.entries(history)) {
      const planKey = HISTORY_TO_PLAN[historyKey] ?? historyKey;
      if (worker) merged[planKey] = worker;
    }
    if (Object.keys(merged).length > 0) {
      result[g.order_id] = merged;
    }
  }
  return result;
};

/** Fetch brova acceptance status for given order IDs */
export const getBrovaStatusForOrders = async (
  orderIds: number[],
): Promise<Record<number, { total: number; trialed: number; accepted: number }>> => {
  if (!orderIds.length) return {};
  const { data, error } = await db
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
    const trialedStages = ['brova_trialed', 'completed'];
    if (trialedStages.includes(g.piece_stage ?? '')) entry.trialed++;
    if (g.acceptance_status === true) entry.accepted++;
  }
  return result;
};

/** Mark garments as lost in transit — they were dispatched but never arrived */
export const markLostInTransit = async (ids: string[]): Promise<void> => {
  const { error } = await db
    .from('garments')
    .update({ location: 'lost_in_transit' as any, in_production: false })
    .in('id', ids);
  if (error) throw new Error(error.message);
};

/** Bulk update assigned_date for all garments in an order */
export const updateOrderAssignedDate = async (orderId: number, date: string): Promise<void> => {
  const { error } = await db
    .from('garments')
    .update({ assigned_date: date })
    .eq('order_id', orderId)
    .or('piece_stage.neq.waiting_for_acceptance,piece_stage.is.null');
  if (error) throw new Error(error.message);
};
