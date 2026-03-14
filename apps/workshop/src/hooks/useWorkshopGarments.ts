import { useQuery } from '@tanstack/react-query';
import { getWorkshopGarments, getGarmentById, getAssignedViewGarments, getCompletedOrderGarments, getBrovaStatusForOrders, getBrovaPlansForOrders } from '@/api/garments';
import type { WorkshopGarment } from '@repo/database';

export const WORKSHOP_GARMENTS_KEY = ['workshop-garments'] as const;
export const ASSIGNED_VIEW_KEY = ['assigned-view-garments'] as const;
export const COMPLETED_VIEW_KEY = ['completed-view-garments'] as const;

export function useWorkshopGarments() {
  return useQuery({
    queryKey: WORKSHOP_GARMENTS_KEY,
    queryFn: getWorkshopGarments,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useReceivingGarments() {
  return useQuery({
    queryKey: WORKSHOP_GARMENTS_KEY,
    queryFn: getWorkshopGarments,
    staleTime: 30_000,
    refetchInterval: 60_000,
    select: (data: WorkshopGarment[]) =>
      data.filter((g) => g.location === 'transit_to_workshop'),
  });
}

export function useParkingGarments() {
  return useQuery({
    queryKey: WORKSHOP_GARMENTS_KEY,
    queryFn: getWorkshopGarments,
    staleTime: 30_000,
    refetchInterval: 60_000,
    select: (data: WorkshopGarment[]) =>
      data.filter((g) => g.location === 'workshop' && !g.in_production),
  });
}

export function useSchedulerGarments() {
  return useQuery({
    queryKey: WORKSHOP_GARMENTS_KEY,
    queryFn: getWorkshopGarments,
    staleTime: 30_000,
    refetchInterval: 60_000,
    select: (data: WorkshopGarment[]) =>
      data.filter(
        (g) =>
          g.location === 'workshop' &&
          g.in_production &&
          !g.production_plan &&
          (g.piece_stage === 'waiting_cut' ||
            g.piece_stage === 'needs_repair' ||
            g.piece_stage === 'needs_redo'),
      ),
  });
}

/** All garments from orders with production activity — any location, any stage */
export function useAssignedViewGarments() {
  return useQuery({
    queryKey: ASSIGNED_VIEW_KEY,
    queryFn: getAssignedViewGarments,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Completed orders — all garments done or back at shop */
export function useCompletedOrders() {
  return useQuery({
    queryKey: COMPLETED_VIEW_KEY,
    queryFn: getCompletedOrderGarments,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useGarment(id: string) {
  return useQuery({
    queryKey: ['garment', id],
    queryFn: () => getGarmentById(id),
    staleTime: 30_000,
  });
}

export function useTerminalGarments(stage: string) {
  return useQuery({
    queryKey: WORKSHOP_GARMENTS_KEY,
    queryFn: getWorkshopGarments,
    staleTime: 30_000,
    refetchInterval: 60_000,
    select: (data: WorkshopGarment[]) =>
      data.filter((g) => g.location === 'workshop' && g.piece_stage === stage),
  });
}

export function useBrovaPlans(orderIds: number[]) {
  return useQuery({
    queryKey: ['brova-plans', ...orderIds.sort()],
    queryFn: () => getBrovaPlansForOrders(orderIds),
    enabled: orderIds.length > 0,
    staleTime: 30_000,
  });
}

export function useBrovaStatus(orderIds: number[]) {
  return useQuery({
    queryKey: ['brova-status', ...orderIds.sort()],
    queryFn: () => getBrovaStatusForOrders(orderIds),
    enabled: orderIds.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

const DISPATCH_STAGES = new Set(['ready_for_dispatch', 'accepted', 'completed', 'ready_for_pickup']);

export function useDispatchGarments() {
  return useQuery({
    queryKey: WORKSHOP_GARMENTS_KEY,
    queryFn: getWorkshopGarments,
    staleTime: 30_000,
    refetchInterval: 60_000,
    select: (data: WorkshopGarment[]) =>
      data.filter((g) => g.location === 'workshop' && DISPATCH_STAGES.has(g.piece_stage ?? '')),
  });
}
