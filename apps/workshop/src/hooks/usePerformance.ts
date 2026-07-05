import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { computeKpis, type Range } from "@repo/database";
import {
  getPerformanceGarmentsInRange,
  getRedoImpact,
  type RedoImpactRow,
} from "@/api/performance";
import { useResources } from "@/hooks/useResources";

// The KPI compute + per-worker helpers + types/constants moved to @repo/database
// (shared with apps/admin-dashboard, so both apps show identical numbers).
// Re-exported here so existing `@/hooks/usePerformance` imports keep working.
export {
  computeKpis,
  getWorkerDailyBreakdown,
  getWorkerDurations,
  getWorkerQuality,
  getWorkerDaysPresent,
  UNIT_ONLY_STAGES,
  MIN_QUALITY_SAMPLE,
} from "@repo/database";
export type {
  WorkerKpi,
  UnitKpi,
  DailyTrend,
  PerformanceSummary,
  StageCycleTime,
  GarmentPerformanceRow,
  Range,
} from "@repo/database";
export type { RedoImpactRow };

export function usePerformanceData(dateRange: Range) {
  const { data: resources = [] } = useResources();
  const {
    data: garments = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["performance", dateRange.from, dateRange.to],
    queryFn: () => getPerformanceGarmentsInRange(dateRange.from),
    staleTime: 30_000,
    enabled: !!dateRange.from && !!dateRange.to,
  });

  const result = useMemo(
    () => computeKpis(garments, resources, dateRange),
    [garments, resources, dateRange],
  );

  return { ...result, garments, isLoading, error };
}

/** Redo performance impact by responsible party (CLAUDE.md §6 Q14). Separate
 *  query — its population (redos in range, by waste-annotation time) differs from
 *  the completed-garments set, and it has no dependency on the KPI computation. */
export function useRedoImpact(dateRange: Range) {
  return useQuery({
    queryKey: ["redo-impact", dateRange.from, dateRange.to],
    queryFn: () => getRedoImpact(dateRange.from, dateRange.to),
    staleTime: 30_000,
    enabled: !!dateRange.from && !!dateRange.to,
  });
}
