import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getCompletedGarmentsInRange, type GarmentPerformanceRow } from "@/api/performance";
import { useResources } from "@/hooks/useResources";
import type { Resource, StageTimingEntry } from "@repo/database";

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
  /** True when this worker's stage is rolled up to its unit (sewing, soaking).
   *  Output/efficiency are not personally meaningful — `daysPresent` is. */
  unitOnly: boolean;
  /** Distinct calendar days this worker had at least one stage_timings session in range. */
  daysPresent: number;
}

export interface UnitKpi {
  /** Unit row id when available, otherwise a synthetic id like `soaking::default`. */
  id: string;
  name: string;
  stage: string;
  memberCount: number;
  members: string[];
  completed: number;
  /** Average minutes per garment across all sessions members worked in this stage. */
  avgMinutes: number | null;
  /** p90 (90th percentile) minutes per garment. */
  p90Minutes: number | null;
  totalDailyTarget: number;
  efficiency: number;
  /** Garments this unit's stage caused to fail QC, divided by garments handled.
   *  null when sample < MIN_QUALITY_SAMPLE. */
  defectRate: number | null;
  /** Garments accepted at customer trial / garments handled that had a trial outcome.
   *  null when sample < MIN_QUALITY_SAMPLE. */
  acceptRate: number | null;
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
  /** % of garments with no QC fails across all attempts. True FPY (replaces the
   *  old trip-number proxy). null when no garments had any QC attempts. */
  qcPassRate: number | null;
  /** Garments that needed an alteration trip (trip_number > 1). */
  reworkCount: number;
  /** % of completed garments that required at least one alteration trip. */
  reworkRate: number;
  dailyTarget: number;
  /** Avg minutes from start_time to completion_time across garments that had both. */
  avgWorkshopMinutes: number | null;
  /** % of garments delivered on/before delivery_date. null when no delivery_date set. */
  onTimePct: number | null;
  /** Mean days late among garments that were late. null when none late. */
  avgDaysLate: number | null;
  /** % of garments accepted at customer trial. Denominator = garments with non-null
   *  feedback_status (i.e. trial happened). null when sample = 0. */
  acceptRate: number | null;
  /** Avg minutes of actual soak (soaking_started_at → soaking_completed_at), and avg target
   *  (soaking_hours × 60). null when no soak data. */
  avgSoakActualMinutes: number | null;
  avgSoakTargetMinutes: number | null;
  /** Avg workshop minutes split by express flag. */
  avgWorkshopMinutesExpress: number | null;
  avgWorkshopMinutesRegular: number | null;
}

/** Avg minutes per stage from stage_timings, across all garments. */
export interface StageCycleTime {
  stage: string;
  avgMinutes: number;
  sampleCount: number;
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

/** Stages where individual workers should NOT be scored on output — roll up to unit instead. */
export const UNIT_ONLY_STAGES = new Set(["sewing", "soaking"]);

/** Synthetic id for the single virtual soaking unit (no DB row). */
const SOAKING_UNIT_ID = "soaking::default";
const SOAKING_UNIT_NAME = "Soaking";

/** Minimum garments handled before showing defect/accept rates — avoid noisy 100% from 1 piece. */
export const MIN_QUALITY_SAMPLE = 10;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

/** Returns the set of stages a garment QC-failed during, from trip_history.qc_attempts.
 *  These are the stages each fail required rework on — used to attribute defects. */
function getFailedStagesForGarment(g: GarmentPerformanceRow): Set<string> {
  const out = new Set<string>();
  if (!g.trip_history) return out;
  for (const trip of g.trip_history) {
    if (!trip.qc_attempts) continue;
    for (const att of trip.qc_attempts) {
      if (att.result !== "fail") continue;
      const stages = att.return_stages ?? (att.return_stage ? [att.return_stage] : []);
      for (const s of stages) out.add(s);
    }
  }
  return out;
}

/** True if garment had no QC fails across all trips. Garments with no QC attempts
 *  recorded are excluded (returns null → caller decides denominator). */
function garmentQcResult(g: GarmentPerformanceRow): "pass" | "fail" | "no_data" {
  if (!g.trip_history || g.trip_history.length === 0) return "no_data";
  let anyAttempt = false;
  for (const trip of g.trip_history) {
    if (!trip.qc_attempts) continue;
    for (const att of trip.qc_attempts) {
      anyAttempt = true;
      if (att.result === "fail") return "fail";
    }
  }
  return anyAttempt ? "pass" : "no_data";
}

function countDaysInRange(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 1);
}

function durationMinutes(entry: StageTimingEntry): number | null {
  if (!entry.completed_at) return null;
  const start = new Date(entry.started_at).getTime();
  const end = new Date(entry.completed_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / 60000;
}

/** Worker → set of YYYY-MM-DD they had a session, across all stages. */
function buildAttendance(garments: GarmentPerformanceRow[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const g of garments) {
    if (!g.stage_timings) continue;
    for (const sessions of Object.values(g.stage_timings)) {
      if (!sessions) continue;
      for (const s of sessions) {
        if (!s.worker || !s.started_at) continue;
        const day = s.started_at.slice(0, 10);
        if (!out.has(s.worker)) out.set(s.worker, new Set());
        out.get(s.worker)!.add(day);
      }
    }
  }
  return out;
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
  units: UnitKpi[];
  stageCycleTimes: StageCycleTime[];
} {
  const workerCounts = new Map<string, Map<string, number>>();
  const workerRework = new Map<string, number>();
  let reworkCount = 0;
  let firstPassCount = 0;

  for (const g of garments) {
    const tripNum = g.trip_number ?? 1;
    if (tripNum === 1) firstPassCount++;
    else reworkCount++;

    const history = g.worker_history;
    if (!history) continue;

    for (const [historyKey, workerName] of Object.entries(history)) {
      const stage = HISTORY_KEY_TO_STAGE[historyKey];
      if (!stage || !workerName) continue;
      const key = `${workerName}::${stage}`;
      if (!workerCounts.has(key)) workerCounts.set(key, new Map());
      const m = workerCounts.get(key)!;
      m.set(stage, (m.get(stage) ?? 0) + 1);

      if (tripNum > 1) {
        workerRework.set(key, (workerRework.get(key) ?? 0) + 1);
      }
    }
  }

  const resourceByNameStage = new Map<string, Resource>();
  for (const r of resources) {
    if (r.resource_name && r.responsibility) {
      resourceByNameStage.set(`${r.resource_name}::${r.responsibility}`, r);
    }
  }

  const attendance = buildAttendance(garments);

  const workers: WorkerKpi[] = [];
  const stageAgg = new Map<string, { target: number; actual: number; count: number }>();

  const pushWorker = (
    _key: string,
    name: string,
    stage: string,
    resource: Resource | undefined,
    actualCount: number,
    rework: number,
  ) => {
    const unitOnly = UNIT_ONLY_STAGES.has(stage);
    const dailyTarget = resource?.daily_target ?? 0;
    const totalTarget = dailyTarget * days;
    const efficiency = unitOnly
      ? 0
      : totalTarget > 0
      ? Math.round((actualCount / totalTarget) * 100)
      : 0;

    workers.push({
      resourceId: resource?.id ?? "",
      name,
      stage,
      unit: resource?.unit ?? null,
      type: resource?.resource_type ?? null,
      dailyTarget: unitOnly ? 0 : dailyTarget,
      actual: unitOnly ? 0 : actualCount,
      efficiency,
      rating: resource?.rating ?? null,
      reworkCount: unitOnly ? 0 : rework,
      unitOnly,
      daysPresent: attendance.get(name)?.size ?? 0,
    });

    if (!unitOnly) {
      const sa = stageAgg.get(stage) ?? { target: 0, actual: 0, count: 0 };
      sa.target += totalTarget;
      sa.actual += actualCount;
      sa.count += 1;
      stageAgg.set(stage, sa);
    }
  };

  for (const [key, stageCounts] of workerCounts) {
    const resource = resourceByNameStage.get(key);
    const [name, stage] = key.split("::");
    const actual = Array.from(stageCounts.values()).reduce((a, b) => a + b, 0);
    pushWorker(key, name, stage, resource, actual, workerRework.get(key) ?? 0);
  }

  for (const r of resources) {
    const key = `${r.resource_name}::${r.responsibility}`;
    if (!workerCounts.has(key) && r.responsibility) {
      pushWorker(key, r.resource_name, r.responsibility, r, 0, 0);
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

  // Daily trends (all completed garments)
  const dailyMap = new Map<string, number>();
  for (const g of garments) {
    if (!g.completion_time) continue;
    const day = g.completion_time.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const daily: DailyTrend[] = Array.from(dailyMap.entries())
    .map(([date, completed]) => ({ date, completed }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Summary — only count workers whose stage produces output (exclude unit-only)
  const totalCompleted = garments.length;
  const scoredWorkers = workers.filter((w) => !w.unitOnly && w.dailyTarget > 0);
  const avgEfficiency = scoredWorkers.length > 0
    ? Math.round(scoredWorkers.reduce((s, w) => s + w.efficiency, 0) / scoredWorkers.length)
    : 0;

  const bestPerformer = scoredWorkers.length > 0
    ? { name: scoredWorkers[0].name, efficiency: scoredWorkers[0].efficiency }
    : null;

  // True QC pass rate from qc_attempts (replaces the trip-number proxy)
  let qcPassCount = 0;
  let qcAttemptedCount = 0;
  for (const g of garments) {
    const r = garmentQcResult(g);
    if (r === "no_data") continue;
    qcAttemptedCount++;
    if (r === "pass") qcPassCount++;
  }
  const qcPassRate = qcAttemptedCount > 0
    ? Math.round((qcPassCount / qcAttemptedCount) * 100)
    : null;

  const reworkRate = totalCompleted > 0
    ? Math.round((reworkCount / totalCompleted) * 100)
    : 0;
  // firstPassCount kept locally for backwards-compatible alternatives; not exported.
  void firstPassCount;

  // Workshop time (start_time → completion_time) — actual production duration per piece.
  const workshopDurations: number[] = [];
  const workshopDurationsExpress: number[] = [];
  const workshopDurationsRegular: number[] = [];
  for (const g of garments) {
    if (!g.start_time || !g.completion_time) continue;
    const start = new Date(g.start_time).getTime();
    const end = new Date(g.completion_time).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const mins = (end - start) / 60000;
    workshopDurations.push(mins);
    if (g.express) workshopDurationsExpress.push(mins);
    else workshopDurationsRegular.push(mins);
  }
  const mean = (arr: number[]): number | null =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const avgWorkshopMinutes = mean(workshopDurations);
  const avgWorkshopMinutesExpress = mean(workshopDurationsExpress);
  const avgWorkshopMinutesRegular = mean(workshopDurationsRegular);

  // On-time delivery
  let onTimeNum = 0;
  let onTimeDenom = 0;
  const daysLate: number[] = [];
  for (const g of garments) {
    if (!g.delivery_date || !g.completion_time) continue;
    onTimeDenom++;
    const promised = new Date(g.delivery_date).getTime();
    const actual = new Date(g.completion_time).getTime();
    if (actual <= promised) onTimeNum++;
    else daysLate.push((actual - promised) / (1000 * 60 * 60 * 24));
  }
  const onTimePct = onTimeDenom > 0 ? Math.round((onTimeNum / onTimeDenom) * 100) : null;
  const avgDaysLate = daysLate.length
    ? Math.round((daysLate.reduce((a, b) => a + b, 0) / daysLate.length) * 10) / 10
    : null;

  // Customer accept rate — only garments that have a feedback outcome
  let acceptNum = 0;
  let acceptDenom = 0;
  for (const g of garments) {
    if (!g.feedback_status) continue;
    acceptDenom++;
    if (g.feedback_status === "accepted") acceptNum++;
  }
  const acceptRate = acceptDenom > 0 ? Math.round((acceptNum / acceptDenom) * 100) : null;

  // Soak duration (avg actual vs target)
  const soakActualMinutes: number[] = [];
  const soakTargetMinutes: number[] = [];
  for (const g of garments) {
    if (!g.soaking) continue;
    if (g.soaking_started_at && g.soaking_completed_at) {
      const start = new Date(g.soaking_started_at).getTime();
      const end = new Date(g.soaking_completed_at).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        soakActualMinutes.push((end - start) / 60000);
      }
    }
    if (g.soaking_hours && g.soaking_hours > 0) {
      soakTargetMinutes.push(g.soaking_hours * 60);
    }
  }
  const avgSoakActualMinutes = mean(soakActualMinutes);
  const avgSoakTargetMinutes = mean(soakTargetMinutes);

  // Stage cycle times — avg minutes per stage from stage_timings
  const stageDurations = new Map<string, number[]>();
  for (const g of garments) {
    if (!g.stage_timings) continue;
    for (const [stage, sessions] of Object.entries(g.stage_timings)) {
      if (!sessions) continue;
      for (const s of sessions) {
        const m = durationMinutes(s);
        if (m !== null) {
          if (!stageDurations.has(stage)) stageDurations.set(stage, []);
          stageDurations.get(stage)!.push(m);
        }
      }
    }
  }
  const stageCycleTimes: StageCycleTime[] = Array.from(stageDurations.entries()).map(
    ([stage, arr]) => ({
      stage,
      avgMinutes: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
      sampleCount: arr.length,
    }),
  );

  const dailyTarget = scoredWorkers.reduce((sum, w) => sum + w.dailyTarget, 0);

  const units = computeUnitKpis(garments, resources, workerCounts, days);

  return {
    workers,
    stages,
    daily,
    summary: {
      totalCompleted,
      avgEfficiency,
      bestPerformer,
      qcPassRate,
      reworkCount,
      reworkRate,
      dailyTarget,
      avgWorkshopMinutes,
      onTimePct,
      avgDaysLate,
      acceptRate,
      avgSoakActualMinutes,
      avgSoakTargetMinutes,
      avgWorkshopMinutesExpress,
      avgWorkshopMinutesRegular,
    },
    units,
    stageCycleTimes,
  };
}

function computeUnitKpis(
  garments: GarmentPerformanceRow[],
  resources: Resource[],
  workerCounts: Map<string, Map<string, number>>,
  days: number,
): UnitKpi[] {
  // Group resources by (stage, unit name). unit_id is source of truth, but `unit` text
  // is auto-mirrored — using it covers resources where the FK isn't set.
  const unitBuckets = new Map<
    string,
    { id: string; name: string; stage: string; members: Resource[] }
  >();

  for (const r of resources) {
    if (!r.responsibility) continue;
    const stage = r.responsibility;
    // Soaking handled separately below.
    if (stage === "soaking") continue;
    const unitName = r.unit?.trim();
    if (!unitName) continue;
    const id = r.unit_id ?? `${stage}::${unitName}`;
    const key = `${stage}::${unitName}`;
    if (!unitBuckets.has(key)) {
      unitBuckets.set(key, { id, name: unitName, stage, members: [] });
    }
    unitBuckets.get(key)!.members.push(r);
  }

  const units: UnitKpi[] = [];

  // Per-garment timing — sum minutes & count sessions a member worked, per stage.
  for (const bucket of unitBuckets.values()) {
    const memberNames = new Set(bucket.members.map((m) => m.resource_name));
    let completed = 0;
    const durations: number[] = [];
    let defects = 0;
    let acceptNum = 0;
    let acceptDenom = 0;

    const historyKey = Object.entries(HISTORY_KEY_TO_STAGE).find(
      ([, v]) => v === bucket.stage,
    )?.[0];

    for (const g of garments) {
      const wh = g.worker_history;
      if (!wh || !historyKey) continue;
      const worker = wh[historyKey];
      if (!worker || !memberNames.has(worker)) continue;
      completed++;

      const sessions = g.stage_timings?.[bucket.stage];
      if (sessions) {
        for (const s of sessions) {
          if (s.worker && memberNames.has(s.worker)) {
            const m = durationMinutes(s);
            if (m !== null) durations.push(m);
          }
        }
      }

      // Defect attribution: this stage is in any QC fail's return_stages
      if (getFailedStagesForGarment(g).has(bucket.stage)) defects++;

      // Accept rate: garments with feedback_status set, attributed to this stage's worker
      if (g.feedback_status) {
        acceptDenom++;
        if (g.feedback_status === "accepted") acceptNum++;
      }
    }

    const totalDailyTarget = bucket.members.reduce(
      (sum, m) => sum + (m.daily_target ?? 0),
      0,
    );
    const totalTarget = totalDailyTarget * days;
    const sortedDur = [...durations].sort((a, b) => a - b);
    units.push({
      id: bucket.id,
      name: bucket.name,
      stage: bucket.stage,
      memberCount: bucket.members.length,
      members: bucket.members.map((m) => m.resource_name),
      completed,
      avgMinutes: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
      p90Minutes: durations.length ? Math.round(percentile(sortedDur, 0.9)!) : null,
      totalDailyTarget,
      efficiency: totalTarget > 0 ? Math.round((completed / totalTarget) * 100) : 0,
      defectRate:
        completed >= MIN_QUALITY_SAMPLE ? Math.round((defects / completed) * 100) : null,
      acceptRate:
        acceptDenom >= MIN_QUALITY_SAMPLE
          ? Math.round((acceptNum / acceptDenom) * 100)
          : null,
    });
  }

  // Soaking — single synthetic unit. Counts garments where soaking_completed_at falls
  // in the same window as completion_time (we only loaded completed garments).
  // Members = all resources with responsibility=soaking.
  const soakers = resources.filter((r) => r.responsibility === "soaking");
  let soakCompleted = 0;
  const soakDurations: number[] = [];
  let soakDefects = 0;
  let soakAcceptNum = 0;
  let soakAcceptDenom = 0;
  for (const g of garments) {
    if (!g.soaking) continue;
    soakCompleted++;
    const sessions = g.stage_timings?.soaking;
    if (sessions) {
      for (const s of sessions) {
        const m = durationMinutes(s);
        if (m !== null) soakDurations.push(m);
      }
    }
    if (getFailedStagesForGarment(g).has("soaking")) soakDefects++;
    if (g.feedback_status) {
      soakAcceptDenom++;
      if (g.feedback_status === "accepted") soakAcceptNum++;
    }
  }
  const soakDailyTarget = soakers.reduce((sum, m) => sum + (m.daily_target ?? 0), 0);
  const soakTotalTarget = soakDailyTarget * days;
  const sortedSoak = [...soakDurations].sort((a, b) => a - b);
  units.push({
    id: SOAKING_UNIT_ID,
    name: SOAKING_UNIT_NAME,
    stage: "soaking",
    memberCount: soakers.length,
    members: soakers.map((m) => m.resource_name),
    completed: soakCompleted,
    avgMinutes: soakDurations.length
      ? Math.round(soakDurations.reduce((a, b) => a + b, 0) / soakDurations.length)
      : null,
    p90Minutes: soakDurations.length ? Math.round(percentile(sortedSoak, 0.9)!) : null,
    totalDailyTarget: soakDailyTarget,
    efficiency: soakTotalTarget > 0 ? Math.round((soakCompleted / soakTotalTarget) * 100) : 0,
    defectRate:
      soakCompleted >= MIN_QUALITY_SAMPLE
        ? Math.round((soakDefects / soakCompleted) * 100)
        : null,
    acceptRate:
      soakAcceptDenom >= MIN_QUALITY_SAMPLE
        ? Math.round((soakAcceptNum / soakAcceptDenom) * 100)
        : null,
  });

  units.sort((a, b) => b.completed - a.completed);
  // workerCounts param kept for future cross-checks; not used in current aggregation.
  void workerCounts;
  return units;
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

/** Per-garment minutes across all stages this worker touched in range.
 *  Returns the array of durations so the caller can compute avg / median / p90. */
export function getWorkerDurations(
  garments: GarmentPerformanceRow[],
  workerName: string,
): number[] {
  const out: number[] = [];
  for (const g of garments) {
    if (!g.stage_timings) continue;
    for (const sessions of Object.values(g.stage_timings)) {
      if (!sessions) continue;
      for (const s of sessions) {
        if (s.worker !== workerName) continue;
        const m = durationMinutes(s);
        if (m !== null) out.push(m);
      }
    }
  }
  return out;
}

/** Per-worker quality stats for the drilldown page.
 *  defectRate: % of pieces this worker handled (at their stage) that QC flagged that stage for rework.
 *  qcPassRate: % of pieces this worker handled that had no QC fails anywhere.
 *  Both suppressed (null) below MIN_QUALITY_SAMPLE. */
export function getWorkerQuality(
  garments: GarmentPerformanceRow[],
  workerName: string,
  stage: string,
): {
  sampleSize: number;
  defectRate: number | null;
  qcPassRate: number | null;
} {
  const historyKey = Object.entries(HISTORY_KEY_TO_STAGE).find(([, v]) => v === stage)?.[0];
  if (!historyKey) return { sampleSize: 0, defectRate: null, qcPassRate: null };

  let handled = 0;
  let defects = 0;
  let qcPasses = 0;
  let qcAttempted = 0;

  for (const g of garments) {
    const wh = g.worker_history;
    if (!wh) continue;
    if (wh[historyKey] !== workerName) continue;
    handled++;
    if (getFailedStagesForGarment(g).has(stage)) defects++;
    const qc = garmentQcResult(g);
    if (qc !== "no_data") {
      qcAttempted++;
      if (qc === "pass") qcPasses++;
    }
  }

  return {
    sampleSize: handled,
    defectRate:
      handled >= MIN_QUALITY_SAMPLE ? Math.round((defects / handled) * 100) : null,
    qcPassRate:
      qcAttempted >= MIN_QUALITY_SAMPLE
        ? Math.round((qcPasses / qcAttempted) * 100)
        : null,
  };
}

/** Distinct YYYY-MM-DD days a worker had a session. */
export function getWorkerDaysPresent(
  garments: GarmentPerformanceRow[],
  workerName: string,
): string[] {
  const days = new Set<string>();
  for (const g of garments) {
    if (!g.stage_timings) continue;
    for (const sessions of Object.values(g.stage_timings)) {
      if (!sessions) continue;
      for (const s of sessions) {
        if (s.worker !== workerName || !s.started_at) continue;
        days.add(s.started_at.slice(0, 10));
      }
    }
  }
  return Array.from(days).sort();
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
