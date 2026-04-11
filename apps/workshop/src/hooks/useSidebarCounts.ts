import { useQuery } from '@tanstack/react-query';
import { getWorkshopSidebarCounts, type WorkshopSidebarCounts } from '@/api/garments';
import { useAssignedOverview } from './useWorkshopGarments';

export type SidebarCounts = WorkshopSidebarCounts;
export const SIDEBAR_COUNTS_KEY = ['workshop-sidebar-counts'] as const;

const LIST_STALE_TIME = 5 * 60 * 1000;

/**
 * Workshop sidebar badge counts. Hits get_workshop_sidebar_counts RPC
 * which returns 11 integers — no per-row data. Replaces the old pattern
 * of fetching every garment just to run .filter().length 11 times.
 */
export function useSidebarCounts() {
  return useQuery({
    queryKey: SIDEBAR_COUNTS_KEY,
    queryFn: getWorkshopSidebarCounts,
    staleTime: LIST_STALE_TIME,
  });
}

/** Count of orders that are overdue or due within 2 days — used for the
 *  Production Tracker badge. Reuses the assigned-overview stats so we don't
 *  pay for a second global fetch. */
export function useAttentionCount() {
  const q = useAssignedOverview();
  const stats = q.data?.stats;
  return {
    ...q,
    data: stats ? stats.overdue + stats.due_soon : undefined,
  };
}
