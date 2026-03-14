import { useQuery } from '@tanstack/react-query';
import { getWorkshopGarments, getBrovaStatusForOrders, getBrovaPlansForOrders } from '@/api/garments';
import type { WorkshopGarment } from '@repo/database';

export const WORKSHOP_GARMENTS_KEY = ['workshop-garments'] as const;

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

export function useDispatchGarments() {
  return useQuery({
    queryKey: WORKSHOP_GARMENTS_KEY,
    queryFn: getWorkshopGarments,
    staleTime: 30_000,
    refetchInterval: 60_000,
    select: (data: WorkshopGarment[]) =>
      data.filter((g) => g.piece_stage === 'ready_for_dispatch' && g.location === 'workshop'),
  });
}
