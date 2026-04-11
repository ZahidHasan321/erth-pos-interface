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

// Same shape as WORKSHOP_QUERY but without the measurements join. Most
// list views never read measurement fields, so pulling 30+ dimension
// columns per row is pure waste. Keep WORKSHOP_QUERY for anywhere that
// still needs full measurement records (garment detail pages).
const WORKSHOP_QUERY_LIGHT = `
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

/** Flatten helper for WORKSHOP_QUERY_LIGHT rows. Same as flattenGarment but
 *  with no measurement field (the RPC shape never includes it). */
function flattenLightGarment(raw: any): WorkshopGarment {
  const { order, customer, style_ref, fabric_ref, ...garment } = raw;
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
    measurement: null,
    production_plan: garment.production_plan ?? null,
    worker_history: garment.worker_history ?? null,
    quality_check_ratings: garment.quality_check_ratings ?? null,
    style_name: style_ref?.name ?? garment.style ?? undefined,
    style_image_url: style_ref?.image_url ?? undefined,
    fabric_name: fabric_ref?.name ?? undefined,
    fabric_color: fabric_ref?.color ?? garment.color ?? undefined,
  };
}

/**
 * Legacy kitchen-sink fetch: every workshop-side garment with the full
 * WORKSHOP_QUERY (joins + measurements). Still used by parking, receiving,
 * dispatch, dashboard, quality-check, ReturnPlanDialog — pages that haven't
 * been scope-converted yet. Newer code should prefer the narrower fetchers
 * below (getSchedulerGarments / getTerminalStageGarments /
 * getWorkshopWorkload) which hit smaller server-filtered payloads.
 */
export const getWorkshopGarments = async (): Promise<WorkshopGarment[]> => {
  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY)
    .in('location', ['workshop', 'transit_to_workshop', 'transit_to_shop', 'lost_in_transit'])
    .eq('order.checkout_status', 'confirmed');

  if (error) {
    throw new Error(`getWorkshopGarments: failed to fetch workshop garments: ${error.message}`);
  }
  return (data ?? []).filter((g: any) => g.order !== null).map(flattenGarment);
};

/**
 * Scheduler-specific fetch: only garments that can be scheduled.
 * Narrowed at the server to location=workshop, in_production, no plan,
 * piece_stage=waiting_cut — which is exactly the Scheduler's set. Uses the
 * light query (no measurements) because Scheduler cards don't render any
 * measurement fields.
 */
export const getSchedulerGarments = async (): Promise<WorkshopGarment[]> => {
  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY_LIGHT)
    .eq('location', 'workshop')
    .eq('in_production', true)
    .eq('piece_stage', 'waiting_cut')
    .is('production_plan', null)
    .eq('order.checkout_status', 'confirmed');

  if (error) {
    throw new Error(`getSchedulerGarments: failed to fetch schedulable garments: ${error.message}`);
  }
  return (data ?? []).filter((g: any) => g.order !== null).map(flattenLightGarment);
};

/**
 * Terminal stage fetch: only garments at workshop in the given stage.
 * Replaces the pattern of fetching every workshop garment and filtering
 * client-side. GarmentCard uses rich fields (fabric, style, order) so the
 * joins stay, but measurement is dropped.
 */
export const getTerminalStageGarments = async (stage: string): Promise<WorkshopGarment[]> => {
  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY_LIGHT)
    .eq('location', 'workshop')
    .eq('piece_stage', stage)
    .eq('order.checkout_status', 'confirmed');

  if (error) {
    throw new Error(`getTerminalStageGarments: failed to fetch stage '${stage}': ${error.message}`);
  }
  return (data ?? []).filter((g: any) => g.order !== null).map(flattenLightGarment);
};

/** Shape returned by getWorkshopWorkload. Only the fields PlanDialog (for
 *  worker workload) and team.tsx (for daily completion counts) read. */
export interface WorkshopWorkloadRow {
  id: string;
  production_plan: Record<string, string> | null;
  worker_history: Record<string, string> | null;
  in_production: boolean;
  completion_time: string | null;
}

/**
 * Super-lean workload fetch for PlanDialog + team dashboard. Returns just
 * five columns — no joins, no jsonb aggregation. Replaces the pattern of
 * pulling the entire workshop garment list (measurement + style + fabric +
 * order + customer) just to count worker assignments.
 */
export const getWorkshopWorkload = async (): Promise<WorkshopWorkloadRow[]> => {
  const { data, error } = await db
    .from('garments')
    .select('id, production_plan, worker_history, in_production, completion_time');

  if (error) {
    throw new Error(`getWorkshopWorkload: failed to fetch workload rows: ${error.message}`);
  }
  return (data ?? []) as WorkshopWorkloadRow[];
};

/** Counts returned by get_workshop_sidebar_counts — one key per badge. */
export interface WorkshopSidebarCounts {
  receiving: number;
  parking: number;
  scheduler: number;
  soaking: number;
  cutting: number;
  post_cutting: number;
  sewing: number;
  finishing: number;
  ironing: number;
  quality_check: number;
  dispatch: number;
}

/**
 * Sidebar badge counts. Replaces the old pattern of fetching every workshop
 * garment just to call .filter().length 11 times. Now the server returns
 * the 11 integers in one small jsonb object.
 */
export const getWorkshopSidebarCounts = async (): Promise<WorkshopSidebarCounts> => {
  const { data, error } = await db.rpc('get_workshop_sidebar_counts');
  if (error) {
    throw new Error(`getWorkshopSidebarCounts: failed to fetch counts: ${error.message}`);
  }
  return (data ?? {
    receiving: 0, parking: 0, scheduler: 0, soaking: 0, cutting: 0,
    post_cutting: 0, sewing: 0, finishing: 0, ironing: 0,
    quality_check: 0, dispatch: 0,
  }) as WorkshopSidebarCounts;
};

/** Fetch garments completed today (any location) for terminal "Done" counts */
export const getCompletedTodayGarments = async (): Promise<WorkshopGarment[]> => {
  const { data, error } = await db
    .from('garments')
    .select(WORKSHOP_QUERY_LIGHT)
    .gte('completion_time', getLocalMidnightUtc())
    .eq('order.checkout_status', 'confirmed');

  if (error) {
    throw new Error(`getCompletedTodayGarments: failed to fetch completed today: ${error.message}`);
  }
  return (data ?? []).filter((g: any) => g.order !== null).map(flattenLightGarment);
};

// ── Assigned view RPCs ────────────────────────────────────────────────
// See get_assigned_overview + get_assigned_orders_page in triggers.sql.
// The old getAssignedViewGarments fetched every in_progress garment with
// the full WORKSHOP_QUERY and did all filter/sort/label/pagination on the
// client. Now the server owns those and returns only what the current tab
// renders.

export type AssignedTab = 'all' | 'production' | 'ready' | 'attention';
export type AssignedChip = 'express' | 'delivery' | 'soaking';

export interface AssignedOverviewStats {
  overdue: number;
  due_soon: number;
  active: number;
  ready: number;
  returns: number;
  total: number;
  at_shop: number;
  in_transit: number;
}

/** Slim order preview shown in OverviewDashboard's QuickOrderList sections. */
export interface AssignedQuickOrder {
  order_id: number;
  customer_name: string | null;
  brand: string | null;
  express: boolean;
  delivery_date: string | null;
  days_to_delivery: number | null;
  garments_count: number;
  max_trip: number | null;
  brova_count: number;
  final_count: number;
}

/** Slim garment shape used by the StagePipelineChart expandable cards. */
export interface AssignedPipelineGarment {
  id: string;
  order_id: number;
  garment_id: string | null;
  garment_type: string | null;
  piece_stage: string | null;
  location: string | null;
  trip_number: number | null;
  express: boolean | null;
  customer_name: string | null;
  style_name: string | null;
  production_plan: Record<string, string> | null;
  worker_history: Record<string, string> | null;
}

export interface AssignedOverview {
  stats: AssignedOverviewStats;
  quick_lists: {
    overdue: AssignedQuickOrder[];
    due_soon: AssignedQuickOrder[];
    ready: AssignedQuickOrder[];
    returns: AssignedQuickOrder[];
  };
  pipeline_garments: AssignedPipelineGarment[];
}

/**
 * Slimmed garment shape returned by get_assigned_orders_page. Only fields
 * the GarmentMiniCards / StageBadge / worker-name helper read.
 */
export interface AssignedPageGarment {
  id: string;
  order_id: number;
  garment_id: string | null;
  garment_type: string | null;
  piece_stage: string | null;
  location: string | null;
  trip_number: number | null;
  express: boolean | null;
  soaking: boolean | null;
  acceptance_status: boolean | null;
  feedback_status: string | null;
  start_time: string | null;
  in_production: boolean | null;
  production_plan: Record<string, string> | null;
  worker_history: Record<string, string> | null;
  style_name: string | null;
  style_image_url: string | null;
}

/**
 * Row returned by get_assigned_orders_page. Status label is pre-computed
 * server-side (see assigned_order_status_label in triggers.sql).
 */
export interface AssignedOrderRow {
  order_id: number;
  invoice_number: number | null;
  customer_name: string | null;
  customer_mobile: string | null;
  brands: string[];
  express: boolean;
  soaking: boolean;
  has_returns: boolean;
  home_delivery: boolean | null;
  delivery_date: string | null;
  max_trip: number | null;
  status_label: string;
  garments: AssignedPageGarment[];
}

export interface AssignedPage {
  rows: AssignedOrderRow[];
  totalCount: number;
  chipCounts: {
    express: number;
    delivery: number;
    soaking: number;
  };
}

/** Fetch the overview tab data — stats + quick lists + pipeline garments. */
export const getAssignedOverview = async (): Promise<AssignedOverview> => {
  const { data, error } = await db.rpc('get_assigned_overview');

  if (error) {
    throw new Error(`getAssignedOverview: failed to fetch overview: ${error.message}`);
  }

  const payload = (data ?? {}) as Partial<AssignedOverview>;
  return {
    stats: payload.stats ?? {
      overdue: 0, due_soon: 0, active: 0, ready: 0,
      returns: 0, total: 0, at_shop: 0, in_transit: 0,
    },
    quick_lists: payload.quick_lists ?? {
      overdue: [], due_soon: [], ready: [], returns: [],
    },
    pipeline_garments: payload.pipeline_garments ?? [],
  };
};

/** Fetch a paginated + filtered order page for one of the list tabs. */
export const getAssignedOrdersPage = async (args: {
  tab: AssignedTab;
  chips: AssignedChip[];
  page: number;
  pageSize: number;
}): Promise<AssignedPage> => {
  const { data, error } = await db.rpc('get_assigned_orders_page', {
    p_tab: args.tab,
    p_chips: args.chips.length > 0 ? args.chips : null,
    p_page: args.page,
    p_page_size: args.pageSize,
  });

  if (error) {
    throw new Error(`getAssignedOrdersPage: failed to fetch page: ${error.message}`);
  }

  const payload = (data ?? {}) as {
    data?: AssignedOrderRow[];
    total_count?: number;
    chip_counts?: { express?: number; delivery?: number; soaking?: number };
  };

  return {
    rows: payload.data ?? [],
    totalCount: payload.total_count ?? 0,
    chipCounts: {
      express: payload.chip_counts?.express ?? 0,
      delivery: payload.chip_counts?.delivery ?? 0,
      soaking: payload.chip_counts?.soaking ?? 0,
    },
  };
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
 * Slim garment shape returned by get_completed_orders_page. The completed
 * orders page only renders type counts and basic summary — no production
 * metadata — so the RPC trims every heavy field (measurement/style/fabric
 * joins, worker_history, plan, etc.) to keep the payload tiny.
 */
export interface CompletedGarmentLite {
  id: string;
  garment_id: string | null;
  garment_type: string | null;
  piece_stage: string | null;
  location: string | null;
}

/**
 * Order-group shape returned by get_completed_orders_page. Mirrors
 * lib/utils.ts OrderGroup but with CompletedGarmentLite instead of
 * WorkshopGarment so the page doesn't ship unused data.
 */
export interface CompletedOrderGroup {
  order_id: number;
  invoice_number: number | null;
  customer_name: string | null;
  customer_mobile: string | null;
  brands: string[];
  express: boolean;
  soaking: boolean;
  home_delivery: boolean | null;
  delivery_date: string | null;
  garments: CompletedGarmentLite[];
}

export interface CompletedOrdersPage {
  rows: CompletedOrderGroup[];
  totalCount: number;
}

/**
 * Paginated completed orders. Calls get_completed_orders_page RPC which
 * returns order groups with garments pre-aggregated — no client-side
 * grouping needed.
 */
export const getCompletedOrdersPage = async (
  page: number,
  pageSize: number,
): Promise<CompletedOrdersPage> => {
  const { data, error } = await db.rpc('get_completed_orders_page', {
    p_page: page,
    p_page_size: pageSize,
    p_days_back: null,
  });

  if (error) {
    throw new Error(`getCompletedOrdersPage: failed to fetch completed orders: ${error.message}`);
  }

  const payload = (data ?? {}) as {
    data?: CompletedOrderGroup[];
    total_count?: number;
  };

  return {
    rows: payload.data ?? [],
    totalCount: payload.total_count ?? 0,
  };
};

export const receiveGarments = async (ids: string[]): Promise<void> => {
  // Only update location & in_production — preserve existing piece_stage
  // (finals with brovas arrive as waiting_for_acceptance and must stay that way)
  const { error } = await db
    .from('garments')
    .update({ location: 'workshop' as any, in_production: false })
    .in('id', ids);
  if (error) throw new Error(`receiveGarments: failed to mark garments as received at workshop: ${error.message}`);

  // Accepted brovas go straight to ready_for_dispatch — no production needed,
  // they're just waiting to be dispatched back with the rest of the order
  const { error: eAccepted } = await db
    .from('garments')
    .update({ piece_stage: 'ready_for_dispatch' as PieceStage })
    .in('id', ids)
    .eq('feedback_status', 'accepted');
  if (eAccepted) throw new Error(`receiveGarments: failed to advance accepted brovas to ready_for_dispatch: ${eAccepted.message}`);

  // For return garments with non-accepted feedback, set piece_stage to waiting_cut
  const { error: e2 } = await db
    .from('garments')
    .update({ piece_stage: 'waiting_cut' as PieceStage })
    .in('id', ids)
    .not('feedback_status', 'is', null)
    .neq('feedback_status', 'accepted')
    .eq('piece_stage', 'brova_trialed');
  if (e2) throw new Error(`receiveGarments: failed to reset returning garments to waiting_cut: ${e2.message}`);

  // Clear stale production fields for returning garments (trip > 1)
  // so they appear fresh in the scheduler and don't ghost in terminal "Done" lists.
  // Keep worker_history — needed by ReturnPlanDialog to auto-populate the same team.
  const { error: e3 } = await db
    .from('garments')
    .update({ production_plan: null, completion_time: null, start_time: null })
    .in('id', ids)
    .gt('trip_number', 1);
  if (e3) throw new Error(`receiveGarments: failed to clear stale production fields on returning garments: ${e3.message}`);
};

export const receiveAndStartGarments = async (ids: string[]): Promise<void> => {
  // Receive all into workshop first
  const { error: e1 } = await db
    .from('garments')
    .update({ location: 'workshop' as any })
    .in('id', ids);
  if (e1) throw new Error(`receiveAndStartGarments: failed to mark garments as received at workshop: ${e1.message}`);

  // Accepted brovas go straight to ready_for_dispatch — no production needed
  const { error: eAccepted } = await db
    .from('garments')
    .update({ piece_stage: 'ready_for_dispatch' as PieceStage, in_production: false })
    .in('id', ids)
    .eq('feedback_status', 'accepted');
  if (eAccepted) throw new Error(`receiveAndStartGarments: failed to advance accepted brovas to ready_for_dispatch: ${eAccepted.message}`);

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
  if (e2) throw new Error(`receiveAndStartGarments: failed to start production on garments: ${e2.message}`);

  // For return brovas with non-accepted feedback, reset piece_stage to waiting_cut
  // so they appear in the scheduler
  const { error: e3 } = await db
    .from('garments')
    .update({ piece_stage: 'waiting_cut' as PieceStage })
    .in('id', ids)
    .not('feedback_status', 'is', null)
    .neq('feedback_status', 'accepted')
    .eq('piece_stage', 'brova_trialed');
  if (e3) throw new Error(`receiveAndStartGarments: failed to reset returning brovas to waiting_cut: ${e3.message}`);

  // Clear stale production fields for returning garments (trip > 1)
  // so they appear fresh in the scheduler and don't ghost in terminal "Done" lists.
  // Keep worker_history — needed by ReturnPlanDialog to auto-populate the same team.
  const { error: e4 } = await db
    .from('garments')
    .update({ production_plan: null, completion_time: null, start_time: null })
    .in('id', ids)
    .gt('trip_number', 1);
  if (e4) throw new Error(`receiveAndStartGarments: failed to clear stale production fields on returning garments: ${e4.message}`);
};

export const sendToScheduler = async (ids: string[]): Promise<void> => {
  const { error } = await db
    .from('garments')
    .update({ in_production: true })
    .in('id', ids);
  if (error) throw new Error(`sendToScheduler: failed to mark garments as in_production: ${error.message}`);
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
  if (error) throw new Error(`sendReturnToProduction: failed to send garment back to production: ${error.message}`);
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
    if (error) throw new Error(`scheduleGarments: failed to schedule garments with reentry stage: ${error.message}`);
  } else if (soakingIds?.length && nonSoakingIds?.length) {
    const [r1, r2] = await Promise.all([
      db.from('garments').update({ ...baseUpdate, piece_stage: 'soaking' as PieceStage }).in('id', soakingIds),
      db.from('garments').update({ ...baseUpdate, piece_stage: 'cutting' as PieceStage }).in('id', nonSoakingIds),
    ]);
    if (r1.error) throw new Error(`scheduleGarments: failed to schedule soaking garments: ${r1.error.message}`);
    if (r2.error) throw new Error(`scheduleGarments: failed to schedule cutting garments: ${r2.error.message}`);
  } else {
    const firstStage: PieceStage = (soakingIds?.length && plan.soaker) ? 'soaking' : 'cutting';
    const { error } = await db
      .from('garments')
      .update({ ...baseUpdate, piece_stage: firstStage })
      .in('id', ids);
    if (error) throw new Error(`scheduleGarments: failed to schedule garments: ${error.message}`);
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
  if (error) throw new Error(`startGarment: failed to record garment start time: ${error.message}`);
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

  if (fetchErr) throw new Error(`completeAndAdvance: failed to fetch garment for stage advance: ${fetchErr.message}`);

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
  if (error) throw new Error(`completeAndAdvance: failed to advance garment to next stage: ${error.message}`);
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

  if (fetchErr) throw new Error(`qcPass: failed to fetch garment for QC pass: ${fetchErr.message}`);

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
  if (error) throw new Error(`qcPass: failed to record QC pass: ${error.message}`);
};

export const qcFail = async (id: string, returnStage: PieceStage, reason: string): Promise<void> => {
  const { data: existing, error: fetchErr } = await db
    .from('garments')
    .select('notes, trip_history, trip_number, worker_history')
    .eq('id', id)
    .single();

  if (fetchErr) throw new Error(`qcFail: failed to fetch garment for QC fail: ${fetchErr.message}`);

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
  if (error) throw new Error(`qcFail: failed to record QC failure: ${error.message}`);
};

export const dispatchGarments = async (ids: string[]): Promise<void> => {
  const { error } = await db
    .from('garments')
    .update({ location: 'transit_to_shop', in_production: false, feedback_status: null })
    .in('id', ids);
  if (error) throw new Error(`dispatchGarments: failed to dispatch garments to shop: ${error.message}`);

  // Append dispatch log entries (best-effort; don't block on failure).
  try {
    const { data: rows } = await db
      .from('garments')
      .select('id, order_id, trip_number')
      .in('id', ids);
    if (rows && rows.length > 0) {
      await db.from('dispatch_log').insert(
        rows.map((g: any) => ({
          garment_id: g.id,
          order_id: g.order_id,
          direction: 'to_shop',
          trip_number: g.trip_number ?? null,
        }))
      );
    }
  } catch (logErr) {
    console.error('Failed to write dispatch_log (non-blocking):', logErr);
  }
};

// ── Dispatch History ──────────────────────────────────────────────────────
// Rows from dispatch_log joined with order/customer/garment context for the
// workshop's "Dispatch History" tab. Workshop view is always outbound:
// workshop → shop (direction = 'to_shop'). Not brand-scoped — workshop sees
// all brands.
export interface DispatchHistoryRow {
  id: number;
  dispatched_at: string;
  trip_number: number | null;
  garment_id: string;
  order_id: number;
  garment_code: string | null;
  garment_type: string | null;
  invoice_number: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  brand: string | null;
}

export const getDispatchHistory = async (
  fromIso: string,
  toIso: string,
): Promise<DispatchHistoryRow[]> => {
  const { data, error } = await db
    .from('dispatch_log')
    .select(`
      id,
      dispatched_at,
      trip_number,
      garment_id,
      order_id,
      garments!inner(garment_id, garment_type),
      orders!inner(
        brand,
        work_orders(invoice_number),
        customers(name, phone)
      )
    `)
    .eq('direction', 'to_shop')
    .gte('dispatched_at', fromIso)
    .lt('dispatched_at', toIso)
    .order('dispatched_at', { ascending: false })
    .limit(2000);

  if (error) {
    console.error('Error fetching dispatch history:', error);
    return [];
  }

  return (data ?? []).map((r: any) => {
    const g = Array.isArray(r.garments) ? r.garments[0] : r.garments;
    const o = Array.isArray(r.orders) ? r.orders[0] : r.orders;
    const wo = o ? (Array.isArray(o.work_orders) ? o.work_orders[0] : o.work_orders) : null;
    const cust = o ? (Array.isArray(o.customers) ? o.customers[0] : o.customers) : null;
    return {
      id: r.id,
      dispatched_at: r.dispatched_at,
      trip_number: r.trip_number,
      garment_id: r.garment_id,
      order_id: r.order_id,
      garment_code: g?.garment_id ?? null,
      garment_type: g?.garment_type ?? null,
      invoice_number: wo?.invoice_number ?? null,
      customer_name: cust?.name ?? null,
      customer_phone: cust?.phone ?? null,
      brand: o?.brand ?? null,
    };
  });
};

/** Release finals from waiting_for_acceptance → waiting_cut so they can enter production */
export const releaseFinals = async (ids: string[]): Promise<void> => {
  const { error } = await db
    .from('garments')
    .update({ piece_stage: 'waiting_cut' as PieceStage, in_production: false })
    .in('id', ids)
    .eq('piece_stage', 'waiting_for_acceptance');
  if (error) throw new Error(`releaseFinals: failed to release finals from waiting_for_acceptance: ${error.message}`);
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
  if (error) throw new Error(`releaseFinalsWithPlan: failed to release finals with production plan: ${error.message}`);
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

  if (fetchErr) throw new Error(`updateGarmentDetails: failed to fetch garment for update: ${fetchErr.message}`);
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
  if (error) throw new Error(`updateGarmentDetails: failed to update garment details: ${error.message}`);
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
    if (error) throw new Error(`updateOrderDeliveryDate: failed to update order delivery date: ${error.message}`);
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
  if (error) throw new Error(`markLostInTransit: failed to mark garments as lost in transit: ${error.message}`);
};

/** Bulk update assigned_date for all garments in an order */
export const updateOrderAssignedDate = async (orderId: number, date: string): Promise<void> => {
  const { error } = await db
    .from('garments')
    .update({ assigned_date: date })
    .eq('order_id', orderId)
    .or('piece_stage.neq.waiting_for_acceptance,piece_stage.is.null');
  if (error) throw new Error(`updateOrderAssignedDate: failed to update order assigned date: ${error.message}`);
};
