import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  getWorkshopGarments,
  getSchedulerGarments,
  getTerminalStageGarments,
  getCompletedTodayGarments,
  getGarmentById,
  getOrderGarments,
  getAssignedOverview,
  getAssignedOrdersPage,
  getCompletedOrdersPage,
  getWorkshopWorkload,
  getBrovaStatusForOrders,
  getBrovaPlansForOrders,
  type AssignedTab,
  type AssignedChip,
} from '@/api/garments';

// Query keys. After the scoped-fetch refactor, each page has its own cache
// slice so mutations can invalidate selectively instead of blasting the
// entire workshop garment list on every change.
export const SCHEDULER_KEY = ['scheduler-garments'] as const;
export const TERMINAL_KEY = ['terminal-garments'] as const;
export const WORKLOAD_KEY = ['workshop-workload'] as const;
export const COMPLETED_TODAY_KEY = ['completed-today-garments'] as const;
export const ASSIGNED_OVERVIEW_KEY = ['assigned-overview'] as const;
export const ASSIGNED_PAGE_KEY = ['assigned-page'] as const;
export const COMPLETED_VIEW_KEY = ['completed-view-garments'] as const;

// Legacy shared cache key. Still used by pages that have not been
// scope-converted (parking, receiving, dispatch, dashboard, quality-check,
// ReturnPlanDialog) via useWorkshopGarments(). New code should prefer the
// scoped keys above.
export const WORKSHOP_GARMENTS_KEY = ['workshop-garments'] as const;

// Long staleTime is safe because Realtime + mutations invalidate relevant
// caches on every garments/work_orders change (see useRealtimeInvalidation
// and useGarmentMutations).
const LIST_STALE_TIME = 5 * 60 * 1000;

/**
 * Legacy all-workshop-garments fetcher. Still used by pages that filter
 * client-side (parking, receiving, dispatch, dashboard, quality-check,
 * ReturnPlanDialog). New code should prefer the scoped hooks below.
 */
export function useWorkshopGarments() {
  return useQuery({
    queryKey: WORKSHOP_GARMENTS_KEY,
    queryFn: getWorkshopGarments,
    staleTime: LIST_STALE_TIME,
  });
}

/**
 * Schedulable garments — narrowed server-side to location=workshop,
 * in_production, no production_plan, piece_stage=waiting_cut.
 */
export function useSchedulerGarments() {
  return useQuery({
    queryKey: SCHEDULER_KEY,
    queryFn: getSchedulerGarments,
    staleTime: LIST_STALE_TIME,
  });
}

/**
 * Overview tab data for Assigned Orders — stats, quick lists, pipeline
 * garments. Replaces fetching every in_progress garment client-side.
 */
export function useAssignedOverview() {
  return useQuery({
    queryKey: ASSIGNED_OVERVIEW_KEY,
    queryFn: getAssignedOverview,
    staleTime: LIST_STALE_TIME,
  });
}

/**
 * Paginated list for Assigned Orders list tabs (production/ready/attention/all).
 * Each page re-fetches when tab/chips/page change; keepPreviousData avoids
 * skeleton flash between pages.
 */
export function useAssignedOrdersPage(args: {
  tab: AssignedTab;
  chips: AssignedChip[];
  page: number;
  pageSize: number;
}) {
  const chipsKey = [...args.chips].sort().join(',');
  return useQuery({
    queryKey: [...ASSIGNED_PAGE_KEY, args.tab, chipsKey, args.page, args.pageSize],
    queryFn: () => getAssignedOrdersPage(args),
    staleTime: LIST_STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

/**
 * Completed orders — server-paginated.
 * Replaces the old pattern that fetched every completed order's full garment
 * WORKSHOP_QUERY (measurement/style/fabric joins) and paginated client-side.
 * Now hits get_completed_orders_page which returns pre-grouped, slimmed rows.
 */
export function useCompletedOrders(page: number, pageSize: number) {
  return useQuery({
    queryKey: [...COMPLETED_VIEW_KEY, page, pageSize],
    queryFn: () => getCompletedOrdersPage(page, pageSize),
    staleTime: LIST_STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useOrderGarments(orderId: number) {
  return useQuery({
    queryKey: ['order-garments', orderId],
    queryFn: () => getOrderGarments(orderId),
    staleTime: LIST_STALE_TIME,
  });
}

export function useGarment(id: string) {
  return useQuery({
    queryKey: ['garment', id],
    queryFn: () => getGarmentById(id),
    staleTime: LIST_STALE_TIME,
  });
}

/**
 * Garments at a specific workshop stage. Server filters by
 * location=workshop AND piece_stage=stage, so the client only receives
 * rows for the one terminal it's rendering.
 */
export function useTerminalGarments(stage: string) {
  return useQuery({
    queryKey: [...TERMINAL_KEY, stage],
    queryFn: () => getTerminalStageGarments(stage),
    staleTime: LIST_STALE_TIME,
  });
}

export function useCompletedTodayGarments() {
  return useQuery({
    queryKey: COMPLETED_TODAY_KEY,
    queryFn: getCompletedTodayGarments,
    staleTime: LIST_STALE_TIME,
  });
}

/**
 * Workload dataset for PlanDialog and team dashboard. Returns only
 * production_plan / worker_history / in_production / completion_time per
 * garment — no joins, no large jsonb aggregation. Replaces the pattern of
 * pulling the full workshop garment list just to count worker assignments.
 */
export function useWorkshopWorkload() {
  return useQuery({
    queryKey: WORKLOAD_KEY,
    queryFn: getWorkshopWorkload,
    staleTime: LIST_STALE_TIME,
  });
}

export function useBrovaPlans(orderIds: number[]) {
  return useQuery({
    queryKey: ['brova-plans', ...[...orderIds].sort()],
    queryFn: () => getBrovaPlansForOrders(orderIds),
    enabled: orderIds.length > 0,
    staleTime: LIST_STALE_TIME,
  });
}

export function useBrovaStatus(orderIds: number[]) {
  return useQuery({
    queryKey: ['brova-status', ...[...orderIds].sort()],
    queryFn: () => getBrovaStatusForOrders(orderIds),
    enabled: orderIds.length > 0,
    staleTime: LIST_STALE_TIME,
  });
}
