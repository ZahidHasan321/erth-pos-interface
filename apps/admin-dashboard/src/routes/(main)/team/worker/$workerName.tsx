import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, TrendingUp, Package2, Zap, Target, RotateCcw,
  Clock, CalendarCheck, Star, ShieldCheck, Info, AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine,
} from "recharts";
import {
  PageHeader, SectionCard, KpiCard, EmptyState, LoadingSkeleton,
} from "@/components/shared/PageShell";
import { FilterField, Segmented } from "@/components/shared/FilterBar";
import { RangeFilter } from "@/components/Filters";
import { useWorkerPerformance } from "@/hooks/useAdmin";
import { getRangeBounds, type RangePreset, type RangeBounds } from "@/lib/date-range";
import { cn, TIMEZONE } from "@/lib/utils";
import {
  getWorkerDailyBreakdown, getWorkerDurations, getWorkerDaysPresent,
  getWorkerQuality, MIN_QUALITY_SAMPLE,
} from "@repo/database";

const STAGE_LABEL: Record<string, string> = {
  soaking: "Soaking", cutting: "Cutting", post_cutting: "Post-cutting",
  sewing: "Sewing", finishing: "Finishing", ironing: "Ironing", quality_check: "QC",
};
const stageLabel = (s: string) => STAGE_LABEL[s] ?? s;

const STAGE_DOT: Record<string, string> = {
  soaking: "var(--status-info)", cutting: "var(--status-warn)",
  sewing: "var(--foreground)", finishing: "var(--status-ok)",
  ironing: "var(--status-bad)", quality_check: "var(--status-info)",
};

const PRESETS: RangePreset[] = ["today", "week", "month", "quarter", "all"];

interface WorkerSearch { stage: string; preset: RangePreset }

export const Route = createFileRoute("/(main)/team/worker/$workerName")({
  validateSearch: (s: Record<string, unknown>): WorkerSearch => ({
    stage: typeof s.stage === "string" ? s.stage : "",
    preset: PRESETS.includes(s.preset as RangePreset) ? (s.preset as RangePreset) : "week",
  }),
  component: WorkerDetailPage,
});

function efficiencyTone(eff: number): "ok" | "warn" | "bad" {
  if (eff >= 90) return "ok";
  if (eff >= 70) return "warn";
  return "bad";
}

const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(d + "T12:00:00+03:00").toLocaleDateString("en-GB", { timeZone: TIMEZONE, ...opts });

function WorkerDetailPage() {
  const { workerName } = Route.useParams();
  const { stage, preset } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const name = decodeURIComponent(workerName);

  const range: RangeBounds = useMemo(() => getRangeBounds(preset), [preset]);
  const { workers, garments, isLoading, isError, error } = useWorkerPerformance(name, range);

  // The person's stages, and the one in view (default: first).
  const stages = useMemo(() => workers.map((w) => w.stage), [workers]);
  const activeStage = stage && stages.includes(stage) ? stage : (stages[0] ?? "");
  const worker = useMemo(
    () => workers.find((w) => w.stage === activeStage) ?? null,
    [workers, activeStage],
  );

  const dailyData = useMemo(
    () => getWorkerDailyBreakdown(garments, name, activeStage, range),
    [garments, name, activeStage, range],
  );
  const durations = useMemo(() => getWorkerDurations(garments, name, range), [garments, name, range]);
  const daysPresent = useMemo(() => getWorkerDaysPresent(garments, name, range), [garments, name, range]);
  const quality = useMemo(
    () => getWorkerQuality(garments, name, activeStage, range),
    [garments, name, activeStage, range],
  );

  const timing = useMemo(() => {
    if (durations.length === 0) return null;
    const sorted = [...durations].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    return {
      avg: Math.round(avg),
      median: Math.round(sorted[Math.floor(sorted.length / 2)]!),
      p90: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]!),
      sampleCount: sorted.length,
    };
  }, [durations]);

  const setStage = (s: string) => navigate({ search: (p) => ({ ...p, stage: s }), replace: true });
  const setPreset = (p: RangePreset) => navigate({ search: (prev) => ({ ...prev, preset: p }), replace: true });

  return (
    <div>
      <Link to="/team" search={{ location: "", role: "" }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="w-4 h-4" /> Back to team
      </Link>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load performance"} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} />
      ) : !worker ? (
        <EmptyState icon={TrendingUp} message={`No workshop activity for "${name}" in this period.`} />
      ) : (
        <div className="space-y-6">
          <PageHeader
            icon={TrendingUp}
            title={name}
            subtitle={`${stageLabel(worker.stage)}${worker.unit ? ` · ${worker.unit}` : ""}${worker.type ? ` · ${worker.type}` : ""}`}
          >
            <FilterField label="Period">
              <RangeFilter value={preset} onChange={setPreset} />
            </FilterField>
          </PageHeader>

          {stages.length > 1 && (
            <FilterField label="Stage">
              <Segmented
                value={activeStage}
                onChange={setStage}
                options={stages.map((s) => ({ value: s, label: stageLabel(s) }))}
              />
            </FilterField>
          )}

          {worker.unitOnly && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-[var(--status-info-bg)] px-3 py-2.5 text-sm">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-[var(--status-info)]" />
              <p className="text-muted-foreground">
                {stageLabel(worker.stage)} performance is tracked at the unit level
                {worker.unit ? ` (${worker.unit})` : ""}. Individual output is not scored. This shows attendance and per-garment time only.
              </p>
            </div>
          )}

          {/* Primary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {worker.unitOnly ? (
              <>
                <KpiCard icon={CalendarCheck} label="Days present" value={daysPresent.length} subtitle={daysPresent.length === 1 ? "day" : "days"} />
                <KpiCard icon={Clock} label="Avg / garment" value={timing ? `${timing.avg} min` : "-"} />
                <KpiCard icon={Package2} label="Garments touched" value={timing?.sampleCount ?? 0} />
                <KpiCard icon={Star} label="Rating" value={worker.rating ? `${worker.rating} / 5` : "-"} />
              </>
            ) : (
              <>
                <KpiCard icon={Package2} label="Total output" value={worker.actual} subtitle={worker.dailyTarget > 0 ? "pieces" : undefined} />
                <KpiCard
                  icon={Zap}
                  label="Efficiency"
                  value={worker.dailyTarget > 0 ? `${worker.efficiency}%` : "-"}
                  tone={worker.dailyTarget > 0 ? efficiencyTone(worker.efficiency) : null}
                  subtitle={worker.dailyTarget > 0 ? undefined : "No target set"}
                />
                <KpiCard icon={Target} label="Daily target" value={worker.dailyTarget > 0 ? `${worker.dailyTarget}/day` : "-"} />
                <KpiCard icon={RotateCcw} label="Rework" value={worker.reworkCount} />
              </>
            )}
          </div>

          {/* Timing strip (individual stages) */}
          {!worker.unitOnly && timing && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard icon={Clock} label="Avg min/piece" value={timing.avg} />
              <KpiCard icon={Clock} label="Median" value={timing.median} />
              <KpiCard icon={Clock} label="p90" value={timing.p90} />
              <KpiCard icon={Package2} label="Sessions" value={timing.sampleCount} />
            </div>
          )}

          {/* Quality (individual stages) */}
          {!worker.unitOnly && (
            <SectionCard
              title="Quality"
              action={<span className="text-xs text-muted-foreground">{quality.sampleSize} piece{quality.sampleSize === 1 ? "" : "s"} handled</span>}
            >
              {quality.sampleSize < MIN_QUALITY_SAMPLE ? (
                <p className="text-sm text-muted-foreground">
                  Need at least {MIN_QUALITY_SAMPLE} pieces in range to compute reliable quality stats.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <QualityStat
                    icon={ShieldCheck}
                    label="First-pass yield"
                    value={quality.qcPassRate === null ? "-" : `${quality.qcPassRate}%`}
                    tone={quality.qcPassRate === null ? null : quality.qcPassRate >= 90 ? "ok" : quality.qcPassRate >= 75 ? "warn" : "bad"}
                    hint="no QC fails across all trips"
                  />
                  <QualityStat
                    icon={RotateCcw}
                    label="Defect rate"
                    value={quality.defectRate === null ? "-" : `${quality.defectRate}%`}
                    tone={quality.defectRate === null ? null : quality.defectRate <= 5 ? "ok" : quality.defectRate <= 15 ? "warn" : "bad"}
                    hint="QC flagged this stage for rework"
                  />
                </div>
              )}
            </SectionCard>
          )}

          {/* Days present (unit-only) */}
          {worker.unitOnly && daysPresent.length > 0 && (
            <SectionCard title="Days present">
              <div className="flex flex-wrap gap-1.5">
                {daysPresent.map((d) => (
                  <span key={d} className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md tabular-nums">
                    {fmtDay(d, { month: "short", day: "numeric" })}
                  </span>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Daily output */}
          {!worker.unitOnly && dailyData.length > 0 && (
            <SectionCard
              title="Daily output"
              action={worker.dailyTarget > 0 ? <span className="text-xs text-muted-foreground">Target {worker.dailyTarget}/day</span> : null}
            >
              {dailyData.length > 1 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickFormatter={(v) => fmtDay(v, { month: "short", day: "numeric" })}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={32} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--border)" }}
                      labelFormatter={(v) => fmtDay(v, { weekday: "short", month: "short", day: "numeric" })}
                    />
                    {worker.dailyTarget > 0 && (
                      <ReferenceLine y={worker.dailyTarget} stroke="var(--status-warn)" strokeDasharray="4 3" strokeWidth={1}
                        label={{ value: "Target", position: "insideTopRight", fontSize: 10, fill: "var(--status-warn)" }} />
                    )}
                    <Line type="monotone" dataKey="completed" stroke={STAGE_DOT[activeStage] ?? "var(--muted-foreground)"}
                      strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-10">
                  <p className="text-2xl font-semibold tabular-nums tracking-tight">{dailyData[0]!.completed}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {fmtDay(dailyData[0]!.date, { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                </div>
              )}
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

function QualityStat({
  icon: Icon, label, value, tone, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | null;
  hint: string;
}) {
  const toneClass = tone === "ok" ? "text-[var(--status-ok)]" : tone === "warn" ? "text-[var(--status-warn)]" : tone === "bad" ? "text-[var(--status-bad)]" : "text-muted-foreground";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3 h-3" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={cn("text-2xl font-semibold tabular-nums tracking-tight", toneClass)}>{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
