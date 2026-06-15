import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  getPerformanceGarmentsInRange,
  getRedoImpact,
  COMPLETED_PIECE_STAGES,
  type GarmentPerformanceRow,
  type RedoImpactRow,
} from "@/api/performance";
import { UNIT_SCOPED_STAGES } from "@/lib/stage-shape";
import { useResources } from "@/hooks/useResources";
import type { Resource, StageTimingEntry } from "@repo/database";

export interface WorkerKpi {
  resourceId: string;
  name: string;
  stage: string;
  unit: string | null;
  type: string | null;
  dailyTarget: number;
  /** Stage operations this worker completed in the window (counted from
   *  stage_timings sessions, so a re-worked piece counts each pass). */
  actual: number;
  /** actual / (dailyTarget × days the worker was actually present). 0 when the
   *  worker has no target or no in-window activity. */
  efficiency: number;
  rating: number | null;
  reworkCount: number;
  /** True when this worker's stage is rolled up to its unit (sewing, soaking).
   *  Output/efficiency are not personally meaningful. */
  unitOnly: boolean;
}

export interface UnitKpi {
  /** Unit row id when available, otherwise a synthetic id like `sewing::Team A`. */
  id: string;
  name: string;
  stage: string;
  memberCount: number;
  members: string[];
  /** Sewing operations the unit completed in the window. */
  completed: number;
  /** Average minutes per sewing session across the unit's members. */
  avgMinutes: number | null;
  /** p90 (90th percentile) minutes per session. */
  p90Minutes: number | null;
  totalDailyTarget: number;
  efficiency: number;
  /** Garments this unit sewed that QC routed back to sewing, divided by garments
   *  it handled. null when sample < MIN_QUALITY_SAMPLE. Defects ARE stage-
   *  attributable (who executed the work), so this stays per-unit (§6 Q1). */
  defectRate: number | null;
}

export interface DailyTrend {
  date: string;
  completed: number;
}

export interface PerformanceSummary {
  totalCompleted: number;
  avgEfficiency: number;
  bestPerformer: { name: string; efficiency: number } | null;
  /** % of garments with no QC fails across all attempts. True FPY. null when no
   *  finished garment had any QC attempt. */
  qcPassRate: number | null;
  /** Finished garments that needed an alteration trip (trip_number > 1). */
  reworkCount: number;
  /** % of finished garments that required at least one alteration trip. */
  reworkRate: number;
  dailyTarget: number;
  /** Avg production lead time (first non-soak start → last completion) across
   *  finished garments that had timing data. null when none. */
  avgWorkshopMinutes: number | null;
  /** % of garments delivered on/before delivery_date. null when no delivery_date set. */
  onTimePct: number | null;
  /** Mean days late among garments that were late. null when none late. */
  avgDaysLate: number | null;
  /** % of garments accepted at customer trial. Denominator = finished garments with
   *  non-null feedback_status (i.e. a trial happened). null when sample = 0. Whole-
   *  shop only — customer acceptance is NOT team-attributable (§6 Q14). */
  acceptRate: number | null;
  /** Avg lead time split by express flag. */
  avgWorkshopMinutesExpress: number | null;
  avgWorkshopMinutesRegular: number | null;
}

/** Avg minutes per stage from stage_timings sessions in the window. */
export interface StageCycleTime {
  stage: string;
  avgMinutes: number;
  sampleCount: number;
}

/** Stages whose individual workers are NOT scored on output. Sewing rolls up to
 *  its unit; soaking is excluded from the Performance page entirely (§6 Q1) — both
 *  are kept out of the Workers tab via this set. */
export const UNIT_ONLY_STAGES = new Set(["sewing", "soaking"]);

/** Minimum garments handled before showing defect/accept rates — avoid noisy 100% from 1 piece. */
export const MIN_QUALITY_SAMPLE = 10;

type Range = { from: string; to: string };

function isoInWindow(iso: string | null | undefined, fromT: number, toT: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= fromT && t <= toT;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function durationMinutes(entry: StageTimingEntry): number | null {
  if (!entry.completed_at) return null;
  const start = new Date(entry.started_at).getTime();
  const end = new Date(entry.completed_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / 60000;
}

/** A completed work session whose completion fell within the queried window. This is
 *  the unit of "work done in the period" — output, durations and present-days all
 *  derive from these, so a worker is measured by when they did the work (not by when
 *  the garment finished downstream). Open sessions (no completed_at) are excluded. */
interface WorkSession {
  stage: string;
  worker: string | null;
  garment: GarmentPerformanceRow;
  durationMin: number | null;
  day: string; // YYYY-MM-DD of completed_at
}

function collectSessions(garments: GarmentPerformanceRow[], fromT: number, toT: number): WorkSession[] {
  const out: WorkSession[] = [];
  for (const g of garments) {
    if (!g.stage_timings) continue;
    for (const [stage, sessions] of Object.entries(g.stage_timings)) {
      if (!sessions) continue;
      for (const s of sessions) {
        if (!s.completed_at || !isoInWindow(s.completed_at, fromT, toT)) continue;
        out.push({
          stage,
          worker: s.worker,
          garment: g,
          durationMin: durationMinutes(s),
          day: s.completed_at.slice(0, 10),
        });
      }
    }
  }
  return out;
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
 *  recorded are excluded (returns "no_data" → caller decides denominator). */
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

/** Production lead time in minutes: earliest non-soak session start → latest session
 *  completion. Soaking is a parallel wall-clock track (a piece can soak for hours)
 *  and is excluded so it can't dwarf actual labour time. null when there is no usable
 *  timing data. */
function leadTimeMinutes(g: GarmentPerformanceRow): number | null {
  if (!g.stage_timings) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const [stage, sessions] of Object.entries(g.stage_timings)) {
    if (stage === "soaking" || !sessions) continue;
    for (const s of sessions) {
      const start = Date.parse(s.started_at);
      if (Number.isFinite(start) && start < min) min = start;
      if (s.completed_at) {
        const end = Date.parse(s.completed_at);
        if (Number.isFinite(end) && end > max) max = end;
      }
    }
  }
  if (min === Infinity || max === -Infinity || max <= min) return null;
  return (max - min) / 60000;
}

function computeKpis(
  garments: GarmentPerformanceRow[],
  resources: Resource[],
  range: Range,
): {
  workers: WorkerKpi[];
  daily: DailyTrend[];
  summary: PerformanceSummary;
  units: UnitKpi[];
  stageCycleTimes: StageCycleTime[];
} {
  const fromT = Date.parse(range.from);
  const toT = Date.parse(range.to);

  const sessions = collectSessions(garments, fromT, toT);

  // Finished garments completed within the window — the set for garment-level KPIs.
  const finished = garments.filter(
    (g) => COMPLETED_PIECE_STAGES.has(g.piece_stage) && isoInWindow(g.completion_time, fromT, toT),
  );

  // Resource lookup by name+stage, plus a sewing name→unit map for unit attribution.
  const resourceByNameStage = new Map<string, Resource>();
  const sewingWorkerUnit = new Map<string, string>();
  for (const r of resources) {
    if (!r.resource_name || !r.responsibility) continue;
    resourceByNameStage.set(`${r.resource_name}::${r.responsibility}`, r);
    if (r.responsibility === "sewing") {
      const u = r.unit?.trim();
      if (u) sewingWorkerUnit.set(r.resource_name, u);
    }
  }

  // ── Per-worker aggregates from in-window sessions ──
  // key = name::stage → { sessions completed, distinct present days, durations,
  //                       distinct garments that were on an alteration trip }
  const wAgg = new Map<
    string,
    { count: number; days: Set<string>; durations: number[]; rework: Set<number> }
  >();
  for (const s of sessions) {
    if (!s.worker) continue;
    const key = `${s.worker}::${s.stage}`;
    let a = wAgg.get(key);
    if (!a) {
      a = { count: 0, days: new Set(), durations: [], rework: new Set() };
      wAgg.set(key, a);
    }
    a.count++;
    a.days.add(s.day);
    if (s.durationMin !== null) a.durations.push(s.durationMin);
    if ((s.garment.trip_number ?? 1) > 1) a.rework.add(s.garment.id);
  }

  const workers: WorkerKpi[] = [];
  const seenKeys = new Set<string>();

  const pushWorker = (
    name: string,
    stage: string,
    resource: Resource | undefined,
    agg: { count: number; days: Set<string>; durations: number[]; rework: Set<number> } | null,
  ) => {
    const unitOnly = UNIT_ONLY_STAGES.has(stage);
    const dailyTarget = resource?.daily_target ?? 0;
    const daysPresent = agg ? agg.days.size : 0;
    const count = agg ? agg.count : 0;
    // Efficiency is measured against capacity on the days the worker actually
    // worked (not raw calendar days, which would penalise closed days / absences).
    const efficiency =
      unitOnly || dailyTarget <= 0 || daysPresent === 0
        ? 0
        : Math.round((count / (dailyTarget * daysPresent)) * 100);

    workers.push({
      resourceId: resource?.id ?? "",
      name,
      stage,
      unit: resource?.unit ?? null,
      type: resource?.resource_type ?? null,
      dailyTarget: unitOnly ? 0 : dailyTarget,
      actual: unitOnly ? 0 : count,
      efficiency,
      rating: resource?.rating ?? null,
      reworkCount: unitOnly ? 0 : agg ? agg.rework.size : 0,
      unitOnly,
    });
  };

  for (const [key, agg] of wAgg) {
    const [name, stage] = key.split("::");
    seenKeys.add(key);
    pushWorker(name, stage, resourceByNameStage.get(key), agg);
  }
  // Roster completeness: resources with no in-window activity show as zero-output.
  for (const r of resources) {
    if (!r.responsibility || !r.resource_name) continue;
    const key = `${r.resource_name}::${r.responsibility}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    pushWorker(r.resource_name, r.responsibility, r, null);
  }

  workers.sort((a, b) => b.efficiency - a.efficiency);

  // ── Stage cycle times (in-window sessions) ──
  const stageDur = new Map<string, number[]>();
  for (const s of sessions) {
    if (s.durationMin === null) continue;
    if (!stageDur.has(s.stage)) stageDur.set(s.stage, []);
    stageDur.get(s.stage)!.push(s.durationMin);
  }
  const stageCycleTimes: StageCycleTime[] = Array.from(stageDur.entries()).map(([stage, arr]) => ({
    stage,
    avgMinutes: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    sampleCount: arr.length,
  }));

  // ── Daily finished-garment trend (page "Daily output") ──
  const dailyMap = new Map<string, number>();
  for (const g of finished) {
    if (!g.completion_time) continue;
    const day = g.completion_time.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const daily: DailyTrend[] = Array.from(dailyMap.entries())
    .map(([date, completed]) => ({ date, completed }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Garment-level summary (finished set) ──
  const totalCompleted = finished.length;

  let reworkCount = 0;
  for (const g of finished) if ((g.trip_number ?? 1) > 1) reworkCount++;
  const reworkRate = totalCompleted > 0 ? Math.round((reworkCount / totalCompleted) * 100) : 0;

  let qcPassCount = 0;
  let qcAttemptedCount = 0;
  for (const g of finished) {
    const r = garmentQcResult(g);
    if (r === "no_data") continue;
    qcAttemptedCount++;
    if (r === "pass") qcPassCount++;
  }
  const qcPassRate = qcAttemptedCount > 0 ? Math.round((qcPassCount / qcAttemptedCount) * 100) : null;

  let acceptNum = 0;
  let acceptDenom = 0;
  for (const g of finished) {
    if (!g.feedback_status) continue;
    acceptDenom++;
    if (g.feedback_status === "accepted") acceptNum++;
  }
  const acceptRate = acceptDenom > 0 ? Math.round((acceptNum / acceptDenom) * 100) : null;

  let onTimeNum = 0;
  let onTimeDenom = 0;
  const daysLate: number[] = [];
  for (const g of finished) {
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

  // Lead time (first non-soak start → last completion) across finished garments.
  const lead: number[] = [];
  const leadExpress: number[] = [];
  const leadRegular: number[] = [];
  for (const g of finished) {
    const m = leadTimeMinutes(g);
    if (m === null) continue;
    lead.push(m);
    if (g.express) leadExpress.push(m);
    else leadRegular.push(m);
  }
  const mean = (arr: number[]): number | null =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const avgWorkshopMinutes = mean(lead);
  const avgWorkshopMinutesExpress = mean(leadExpress);
  const avgWorkshopMinutesRegular = mean(leadRegular);

  const scoredWorkers = workers.filter((w) => !w.unitOnly && w.dailyTarget > 0);
  const avgEfficiency = scoredWorkers.length
    ? Math.round(scoredWorkers.reduce((s, w) => s + w.efficiency, 0) / scoredWorkers.length)
    : 0;
  const bestPerformer = scoredWorkers.length
    ? { name: scoredWorkers[0].name, efficiency: scoredWorkers[0].efficiency }
    : null;
  const dailyTarget = scoredWorkers.reduce((sum, w) => sum + w.dailyTarget, 0);

  const units = computeUnitKpis(garments, resources, sessions, sewingWorkerUnit);

  return {
    workers,
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
  sessions: WorkSession[],
  sewingWorkerUnit: Map<string, string>,
): UnitKpi[] {
  // Units are SCORED only for unit-shaped stages (sewing, §6 Q1). Cutting,
  // finishing, ironing and QC are individual-scored — those workers may be grouped
  // into a unit for queue-sharing, but the Performance page must not surface them as
  // scored units. Soaking is group-scoped and excluded entirely.
  const isUnitScoped = (stage: string) => (UNIT_SCOPED_STAGES as string[]).includes(stage);

  const garmentById = new Map<number, GarmentPerformanceRow>();
  for (const g of garments) garmentById.set(g.id, g);

  // Build the unit roster from resources (members, target), keyed by unit name.
  const buckets = new Map<string, { id: string; name: string; members: Resource[] }>();
  for (const r of resources) {
    if (!r.responsibility || !isUnitScoped(r.responsibility)) continue;
    const unitName = r.unit?.trim();
    if (!unitName) continue;
    const id = r.unit_id ?? `${r.responsibility}::${unitName}`;
    if (!buckets.has(unitName)) buckets.set(unitName, { id, name: unitName, members: [] });
    buckets.get(unitName)!.members.push(r);
  }

  // Tally in-window unit-scoped sessions to their unit. Primary attribution is the
  // unit the session's worker belongs to (ground truth: who actually did it); if the
  // presser isn't a known sewing resource (e.g. a manager), fall back to the garment's
  // assigned unit (production_plan.sewer) so the piece still lands on its unit (§5).
  const tally = new Map<
    string,
    { sessions: number; durations: number[]; days: Set<string>; garments: Set<number> }
  >();
  for (const s of sessions) {
    if (!isUnitScoped(s.stage)) continue;
    let unitName = (s.worker ? sewingWorkerUnit.get(s.worker) : undefined) ?? null;
    if (!unitName) {
      const planSewer = s.garment.production_plan?.sewer;
      unitName = planSewer ?? null;
    }
    if (!unitName || !buckets.has(unitName)) continue;
    let t = tally.get(unitName);
    if (!t) {
      t = { sessions: 0, durations: [], days: new Set(), garments: new Set() };
      tally.set(unitName, t);
    }
    t.sessions++;
    if (s.durationMin !== null) t.durations.push(s.durationMin);
    t.days.add(s.day);
    t.garments.add(s.garment.id);
  }

  const units: UnitKpi[] = [];
  for (const [unitName, bucket] of buckets) {
    const t = tally.get(unitName);
    const completed = t?.sessions ?? 0;
    const durations = t?.durations ?? [];
    const daysPresent = t?.days.size ?? 0;
    const handledIds = t ? Array.from(t.garments) : [];
    const handled = handledIds.length;

    let defects = 0;
    for (const gid of handledIds) {
      const g = garmentById.get(gid);
      if (g && getFailedStagesForGarment(g).has(bucket.members[0]?.responsibility ?? "sewing")) defects++;
    }

    const totalDailyTarget = bucket.members.reduce((sum, m) => sum + (m.daily_target ?? 0), 0);
    const sortedDur = [...durations].sort((a, b) => a - b);
    units.push({
      id: bucket.id,
      name: bucket.name,
      stage: bucket.members[0]?.responsibility ?? "sewing",
      memberCount: bucket.members.length,
      members: bucket.members.map((m) => m.resource_name),
      completed,
      avgMinutes: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
      p90Minutes: durations.length ? Math.round(percentile(sortedDur, 0.9)!) : null,
      totalDailyTarget,
      // Same present-days denominator as individuals: output vs capacity on the days
      // the unit actually worked.
      efficiency:
        totalDailyTarget > 0 && daysPresent > 0
          ? Math.round((completed / (totalDailyTarget * daysPresent)) * 100)
          : 0,
      defectRate: handled >= MIN_QUALITY_SAMPLE ? Math.round((defects / handled) * 100) : null,
    });
  }

  units.sort((a, b) => b.completed - a.completed);
  return units;
}

export function getWorkerDailyBreakdown(
  garments: GarmentPerformanceRow[],
  workerName: string,
  stage: string,
  range: Range,
): DailyTrend[] {
  const fromT = Date.parse(range.from);
  const toT = Date.parse(range.to);
  const dailyMap = new Map<string, number>();
  for (const g of garments) {
    const sessions = g.stage_timings?.[stage];
    if (!sessions) continue;
    for (const s of sessions) {
      if (s.worker !== workerName || !s.completed_at || !isoInWindow(s.completed_at, fromT, toT)) continue;
      const day = s.completed_at.slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }
  }
  return Array.from(dailyMap.entries())
    .map(([date, completed]) => ({ date, completed }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Per-session minutes this worker logged in the window, across all stages.
 *  Caller computes avg / median / p90. */
export function getWorkerDurations(
  garments: GarmentPerformanceRow[],
  workerName: string,
  range: Range,
): number[] {
  const fromT = Date.parse(range.from);
  const toT = Date.parse(range.to);
  const out: number[] = [];
  for (const g of garments) {
    if (!g.stage_timings) continue;
    for (const sessions of Object.values(g.stage_timings)) {
      if (!sessions) continue;
      for (const s of sessions) {
        if (s.worker !== workerName || !s.completed_at || !isoInWindow(s.completed_at, fromT, toT)) continue;
        const m = durationMinutes(s);
        if (m !== null) out.push(m);
      }
    }
  }
  return out;
}

/** Per-worker quality stats for the drilldown page. A garment is "handled" when the
 *  worker completed a session at this stage inside the window.
 *  defectRate: % of handled garments QC routed back to this stage.
 *  qcPassRate: % of handled garments with no QC fails anywhere.
 *  Both suppressed (null) below MIN_QUALITY_SAMPLE. */
export function getWorkerQuality(
  garments: GarmentPerformanceRow[],
  workerName: string,
  stage: string,
  range: Range,
): {
  sampleSize: number;
  defectRate: number | null;
  qcPassRate: number | null;
} {
  const fromT = Date.parse(range.from);
  const toT = Date.parse(range.to);

  let handled = 0;
  let defects = 0;
  let qcPasses = 0;
  let qcAttempted = 0;

  for (const g of garments) {
    const sessions = g.stage_timings?.[stage];
    if (!sessions) continue;
    const touched = sessions.some(
      (s) => s.worker === workerName && isoInWindow(s.completed_at, fromT, toT),
    );
    if (!touched) continue;
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
    defectRate: handled >= MIN_QUALITY_SAMPLE ? Math.round((defects / handled) * 100) : null,
    qcPassRate:
      qcAttempted >= MIN_QUALITY_SAMPLE ? Math.round((qcPasses / qcAttempted) * 100) : null,
  };
}

/** Distinct YYYY-MM-DD days a worker completed a session in the window. */
export function getWorkerDaysPresent(
  garments: GarmentPerformanceRow[],
  workerName: string,
  range: Range,
): string[] {
  const fromT = Date.parse(range.from);
  const toT = Date.parse(range.to);
  const days = new Set<string>();
  for (const g of garments) {
    if (!g.stage_timings) continue;
    for (const sessions of Object.values(g.stage_timings)) {
      if (!sessions) continue;
      for (const s of sessions) {
        if (s.worker !== workerName || !s.completed_at || !isoInWindow(s.completed_at, fromT, toT)) continue;
        days.add(s.completed_at.slice(0, 10));
      }
    }
  }
  return Array.from(days).sort();
}

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
export type { RedoImpactRow };
export function useRedoImpact(dateRange: Range) {
  return useQuery({
    queryKey: ["redo-impact", dateRange.from, dateRange.to],
    queryFn: () => getRedoImpact(dateRange.from, dateRange.to),
    staleTime: 30_000,
    enabled: !!dateRange.from && !!dateRange.to,
  });
}
