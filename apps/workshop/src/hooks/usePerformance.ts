import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getCompletedGarmentsInRange, type GarmentPerformanceRow } from "@/api/performance";
import { useResources } from "@/hooks/useResources";
import type { Resource } from "@repo/database";

export interface WorkerKpi {
  resourceId: string;
  name: string;
  stage: string;
  unit: string | null;
  type: string | null;
  dailyTarget: number;
  actual: number;
  efficiency: number;
  rating: number | null;
  reworkCount: number;
}

export interface StageKpi {
  stage: string;
  totalTarget: number;
  totalActual: number;
  efficiency: number;
  workerCount: number;
}

export interface DailyTrend {
  date: string;
  completed: number;
}

export interface PerformanceSummary {
  totalCompleted: number;
  avgEfficiency: number;
  bestPerformer: { name: string; efficiency: number } | null;
  firstPassRate: number;
  reworkCount: number;
  dailyTarget: number;
}

const HISTORY_KEY_TO_STAGE: Record<string, string> = {
  soaker: "soaking",
  cutter: "cutting",
  post_cutter: "post_cutting",
  sewer: "sewing",
  finisher: "finishing",
  ironer: "ironing",
  quality_checker: "quality_check",
};

function countDaysInRange(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 1);
}

function computeKpis(
  garments: GarmentPerformanceRow[],
  resources: Resource[],
  days: number,
): {
  workers: WorkerKpi[];
  stages: StageKpi[];
  daily: DailyTrend[];
  summary: PerformanceSummary;
} {
  // Count completions per worker name per stage, plus rework tracking
  const workerCounts = new Map<string, Map<string, number>>();
  const workerRework = new Map<string, number>();
  let reworkCount = 0;
  let firstPassCount = 0;

  for (const g of garments) {
    const history = g.worker_history;
    if (!history) continue;

    // Track first-pass vs rework
    const tripNum = g.trip_number ?? 1;
    if (tripNum === 1) firstPassCount++;
    else reworkCount++;

    for (const [historyKey, workerName] of Object.entries(history)) {
      const stage = HISTORY_KEY_TO_STAGE[historyKey];
      if (!stage || !workerName) continue;
      const key = `${workerName}::${stage}`;
      if (!workerCounts.has(key)) workerCounts.set(key, new Map());
      const m = workerCounts.get(key)!;
      m.set(stage, (m.get(stage) ?? 0) + 1);

      // Track rework per worker
      if (tripNum > 1) {
        workerRework.set(key, (workerRework.get(key) ?? 0) + 1);
      }
    }
  }

  // Match to resources
  const resourceByNameStage = new Map<string, Resource>();
  for (const r of resources) {
    if (r.resource_name && r.responsibility) {
      resourceByNameStage.set(`${r.resource_name}::${r.responsibility}`, r);
    }
  }

  const workers: WorkerKpi[] = [];
  const stageAgg = new Map<string, { target: number; actual: number; count: number }>();

  for (const [key, stageCounts] of workerCounts) {
    const resource = resourceByNameStage.get(key);
    const [name, stage] = key.split("::");
    const actual = Array.from(stageCounts.values()).reduce((a, b) => a + b, 0);
    const dailyTarget = resource?.daily_target ?? 0;
    const totalTarget = dailyTarget * days;
    const efficiency = totalTarget > 0 ? Math.round((actual / totalTarget) * 100) : 0;

    workers.push({
      resourceId: resource?.id ?? "",
      name,
      stage,
      unit: resource?.unit ?? null,
      type: resource?.resource_type ?? null,
      dailyTarget,
      actual,
      efficiency,
      rating: resource?.rating ?? null,
      reworkCount: workerRework.get(key) ?? 0,
    });

    const sa = stageAgg.get(stage) ?? { target: 0, actual: 0, count: 0 };
    sa.target += totalTarget;
    sa.actual += actual;
    sa.count += 1;
    stageAgg.set(stage, sa);
  }

  // Also add resources with no completions
  for (const r of resources) {
    const key = `${r.resource_name}::${r.responsibility}`;
    if (!workerCounts.has(key) && r.responsibility) {
      workers.push({
        resourceId: r.id,
        name: r.resource_name,
        stage: r.responsibility,
        unit: r.unit ?? null,
        type: r.resource_type ?? null,
        dailyTarget: r.daily_target ?? 0,
        actual: 0,
        efficiency: 0,
        rating: r.rating ?? null,
        reworkCount: 0,
      });

      const sa = stageAgg.get(r.responsibility) ?? { target: 0, actual: 0, count: 0 };
      sa.target += (r.daily_target ?? 0) * days;
      sa.count += 1;
      stageAgg.set(r.responsibility, sa);
    }
  }

  workers.sort((a, b) => b.efficiency - a.efficiency);

  const stages: StageKpi[] = Array.from(stageAgg.entries()).map(([stage, agg]) => ({
    stage,
    totalTarget: agg.target,
    totalActual: agg.actual,
    efficiency: agg.target > 0 ? Math.round((agg.actual / agg.target) * 100) : 0,
    workerCount: agg.count,
  }));

  // Daily trends
  const dailyMap = new Map<string, number>();
  for (const g of garments) {
    if (!g.completion_time) continue;
    const day = g.completion_time.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const daily: DailyTrend[] = Array.from(dailyMap.entries())
    .map(([date, completed]) => ({ date, completed }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Summary
  const totalCompleted = garments.length;
  const workersWithTarget = workers.filter((w) => w.dailyTarget > 0);
  const avgEfficiency = workersWithTarget.length > 0
    ? Math.round(workersWithTarget.reduce((s, w) => s + w.efficiency, 0) / workersWithTarget.length)
    : 0;

  const bestPerformer = workers.length > 0
    ? { name: workers[0].name, efficiency: workers[0].efficiency }
    : null;

  // First-pass rate — garments completed on trip 1 (no rework needed)
  const firstPassRate = totalCompleted > 0
    ? Math.round((firstPassCount / totalCompleted) * 100)
    : 100;

  // Aggregate daily target across all unique workers
  const dailyTarget = workers.reduce((sum, w) => sum + w.dailyTarget, 0);

  return {
    workers,
    stages,
    daily,
    summary: { totalCompleted, avgEfficiency, bestPerformer, firstPassRate, reworkCount, dailyTarget },
  };
}

export function getWorkerDailyBreakdown(
  garments: GarmentPerformanceRow[],
  workerName: string,
  stage: string,
): DailyTrend[] {
  const historyKey = Object.entries(HISTORY_KEY_TO_STAGE).find(([, v]) => v === stage)?.[0];
  if (!historyKey) return [];

  const dailyMap = new Map<string, number>();
  for (const g of garments) {
    if (!g.completion_time || !g.worker_history) continue;
    const wh = g.worker_history as Record<string, string>;
    if (wh[historyKey] !== workerName) continue;
    const day = g.completion_time.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }

  return Array.from(dailyMap.entries())
    .map(([date, completed]) => ({ date, completed }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function usePerformanceData(dateRange: { from: string; to: string }) {
  const { data: resources = [] } = useResources();
  const {
    data: garments = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["performance", dateRange.from, dateRange.to],
    queryFn: () => getCompletedGarmentsInRange(dateRange.from, dateRange.to),
    staleTime: 30_000,
    enabled: !!dateRange.from && !!dateRange.to,
  });

  const days = countDaysInRange(dateRange.from, dateRange.to);
  const result = useMemo(
    () => computeKpis(garments, resources, days),
    [garments, resources, days],
  );

  return { ...result, garments, isLoading, error };
}
