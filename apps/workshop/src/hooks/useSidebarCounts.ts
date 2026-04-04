import { useQuery } from '@tanstack/react-query';
import { getWorkshopGarments, getAssignedViewGarments } from '@/api/garments';
import { WORKSHOP_GARMENTS_KEY, ASSIGNED_VIEW_KEY } from './useWorkshopGarments';
import { groupByOrder, parseUtcTimestamp } from '@/lib/utils';
import type { WorkshopGarment } from '@repo/database';

export interface SidebarCounts {
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

function computeCounts(data: WorkshopGarment[]): SidebarCounts {
  return {
    receiving:     data.filter((g) => g.location === 'transit_to_workshop' || g.location === 'lost_in_transit').length,
    parking:       data.filter((g) => g.location === 'workshop' && !g.in_production).length,
    scheduler:     data.filter((g) => g.location === 'workshop' && g.in_production && !g.production_plan && g.piece_stage === 'waiting_cut').length,
    soaking:       data.filter((g) => g.piece_stage === 'soaking').length,
    cutting:       data.filter((g) => g.piece_stage === 'cutting').length,
    post_cutting:  data.filter((g) => g.piece_stage === 'post_cutting').length,
    sewing:        data.filter((g) => g.piece_stage === 'sewing').length,
    finishing:     data.filter((g) => g.piece_stage === 'finishing').length,
    ironing:       data.filter((g) => g.piece_stage === 'ironing').length,
    quality_check: data.filter((g) => g.piece_stage === 'quality_check').length,
    dispatch:      data.filter((g) => g.location === 'workshop' && ['ready_for_dispatch', 'brova_trialed'].includes(g.piece_stage ?? '')).length,
  };
}

/**
 * Derives sidebar badge counts from the shared workshop-garments cache.
 * No separate query — counts update automatically when garments are
 * optimistically patched by mutations.
 */
export function useSidebarCounts() {
  return useQuery({
    queryKey: WORKSHOP_GARMENTS_KEY,
    queryFn: getWorkshopGarments,
    staleTime: 30_000,
    select: computeCounts,
  });
}

/** Count of orders that are overdue or due within 2 days — used for the Production Tracker badge */
export function useAttentionCount() {
  return useQuery({
    queryKey: ASSIGNED_VIEW_KEY,
    queryFn: getAssignedViewGarments,
    staleTime: 30_000,
    select: (data) => {
      const groups = groupByOrder(data);
      const now = Date.now();
      let count = 0;
      for (const og of groups) {
        if (!og.delivery_date) continue;
        const diff = Math.ceil((parseUtcTimestamp(og.delivery_date).getTime() - now) / (1000 * 60 * 60 * 24));
        if (diff <= 2) count++;
      }
      return count;
    },
  });
}
