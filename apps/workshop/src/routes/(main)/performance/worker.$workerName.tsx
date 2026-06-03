import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  usePerformanceData,
  getWorkerDailyBreakdown,
  getWorkerDurations,
  getWorkerDaysPresent,
  getWorkerQuality,
  MIN_QUALITY_SAMPLE,
} from "@/hooks/usePerformance";
import { PageHeader, SectionCard, StatusBanner } from "@/components/shared/PageShell";
import { Button } from "@repo/ui/button";
import { cn, getLocalDateStr, getKuwaitDayRange, TIMEZONE } from "@/lib/utils";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine,
} from "recharts";
import {
  ArrowLeft, Target, Zap, RotateCcw, Star,
  CalendarDays, TrendingUp, Package2, Clock, CalendarCheck, Info,
  ShieldCheck,
} from "lucide-react";

// TEMP DISABLED: post_cutting hidden from production flow
const STAGE_LABELS: Record<string, string> = {
  soaking: "Soaking", cutting: "Cutting",
  sewing: "Sewing", finishing: "Finishing", ironing: "Ironing", quality_check: "QC",
};

const STAGE_DOT: Record<string, string> = {
  soaking: "var(--status-info)",
  cutting: "var(--status-warn)",
  // post_cutting: "var(--status-warn)", // TEMP DISABLED
  sewing: "var(--foreground)",
  finishing: "var(--status-ok)",
  ironing: "var(--status-bad)",
  quality_check: "var(--status-info)",
};

type WorkerSearch = { stage: string; preset?: string };

export const Route = createFileRoute("/(main)/performance/worker/$workerName")({
  component: WorkerDetailPage,
  validateSearch: (search: Record<string, unknown>): WorkerSearch => ({
    stage: (search.stage as string) ?? "",
    preset: (search.preset as string) ?? "week",
  }),
  head: ({ params }) => ({
    meta: [{ title: `${decodeURIComponent(params.workerName)} — Performance` }],
  }),
});

function getDateRange(preset: string): { from: string; to: string } {
  const today = new Date();
  const todayStr = getLocalDateStr(today);
  const end = getKuwaitDayRange(todayStr).end;

  const rangeFrom = (daysBack: number) => {
    const start = new Date(today);
    start.setDate(start.getDate() - daysBack);
    return getKuwaitDayRange(getLocalDateStr(start)).start;
  };

  switch (preset) {
    case "today":   return { from: getKuwaitDayRange(todayStr).start, to: end };
    case "week":    return { from: rangeFrom(6),  to: end };
    case "month":   return { from: rangeFrom(29), to: end };
    case "quarter": return { from: rangeFrom(89), to: end };
    default:        return { from: getKuwaitDayRange(todayStr).start, to: end };
  }
}

function efficiencyTone(eff: number): "ok" | "warn" | "bad" {
  if (eff >= 90) return "ok";
  if (eff >= 70) return "warn";
  return "bad";
}

const TONE_TEXT: Record<"ok" | "warn" | "bad" | "info", string> = {
  ok:   "text-[var(--status-ok)]",
  warn: "text-[var(--status-warn)]",
  bad:  "text-[var(--status-bad)]",
  info: "text-[var(--status-info)]",
};

// ── KPI Card ────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <p className="text-xs">{label}</p>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// ── Inline stat (no card chrome) ────────────────────────────────────

function InlineStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "ok" | "warn" | "bad" | "info";
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2 border-r last:border-r-0 border-border first:pl-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-base font-medium tabular-nums", tone ? TONE_TEXT[tone] : "")}>{value}</span>
        {hint && <span className="text-xs text-muted-foreground truncate">{hint}</span>}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function WorkerDetailPage() {
  const { workerName } = Route.useParams();
  const { stage, preset = "week" } = Route.useSearch();
  const name = decodeURIComponent(workerName);

  const dateRange = useMemo(() => getDateRange(preset), [preset]);
  const { workers, garments, isLoading } = usePerformanceData(dateRange);

  const worker = useMemo(
    () => workers.find((w) => w.name === name && w.stage === stage) ?? null,
    [workers, name, stage],
  );

  const dailyData = useMemo(
    () => getWorkerDailyBreakdown(garments, name, stage),
    [garments, name, stage],
  );

  const durations = useMemo(
    () => getWorkerDurations(garments, name),
    [garments, name],
  );
  const daysPresent = useMemo(
    () => getWorkerDaysPresent(garments, name),
    [garments, name],
  );

  const quality = useMemo(
    () => getWorkerQuality(garments, name, stage),
    [garments, name, stage],
  );

  const timing = useMemo(() => {
    if (durations.length === 0) return null;
    const sorted = [...durations].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    return {
      avg: Math.round(avg),
      median: Math.round(median),
      p90: Math.round(p90),
      sampleCount: sorted.length,
    };
  }, [durations]);

  const stageDot = STAGE_DOT[stage] ?? "var(--muted-foreground)";
  const presetLabel = preset === "today" ? "Today" : preset === "week" ? "Last 7 days" : preset === "month" ? "Last 30 days" : "Last 90 days";

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted rounded-md animate-pulse" />)}
        </div>
        <div className="h-72 bg-muted rounded-md animate-pulse" />
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <Button variant="ghost" size="sm" asChild className="mb-4 gap-2 text-muted-foreground">
          <Link to="/performance">
            <ArrowLeft className="w-4 h-4" />
            Back to Performance
          </Link>
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-base font-medium mb-1">Worker not found</p>
          <p className="text-sm text-muted-foreground">No data for "{name}" in {STAGE_LABELS[stage] ?? stage} {presetLabel.toLowerCase()}.</p>
        </div>
      </div>
    );
  }

  const effTone = efficiencyTone(worker.efficiency);

  // Compute best/worst day
  const bestDay = dailyData.length > 0 ? dailyData.reduce((a, b) => b.completed > a.completed ? b : a) : null;

  const avgPerDay = dailyData.length > 0 ? Math.round(dailyData.reduce((s, d) => s + d.completed, 0) / dailyData.length * 10) / 10 : 0;

  // Days on/above target
  const daysOnTarget = worker.dailyTarget > 0
    ? dailyData.filter((d) => d.completed >= worker.dailyTarget).length
    : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Back + Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 gap-2 text-muted-foreground -ml-2">
          <Link to="/performance">
            <ArrowLeft className="w-4 h-4" />
            Performance
          </Link>
        </Button>
        <PageHeader
          icon={TrendingUp}
          title={name}
          subtitle={`${STAGE_LABELS[stage] ?? stage}${worker.unit ? ` · ${worker.unit}` : ""}${worker.type ? ` · ${worker.type}` : ""}`}
        >
          <span className="text-sm text-muted-foreground">{presetLabel}</span>
        </PageHeader>
      </div>

      {/* Unit-only worker notice */}
      {worker.unitOnly && (
        <StatusBanner tone="info" icon={Info}>
          {STAGE_LABELS[stage] ?? stage} performance is tracked at the unit level
          {worker.unit ? <> ({worker.unit})</> : null}. Individual output is not scored — this page shows attendance and per-garment time only.
        </StatusBanner>
      )}

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {worker.unitOnly ? (
          <>
            <KpiCard icon={CalendarCheck} label="Days present">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight">{daysPresent.length}</span>
                <span className="text-sm text-muted-foreground">day{daysPresent.length === 1 ? "" : "s"}</span>
              </div>
            </KpiCard>

            <KpiCard icon={Clock} label="Avg / garment">
              {timing ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold tabular-nums tracking-tight">{timing.avg}</span>
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No timing data</span>
              )}
            </KpiCard>

            <KpiCard icon={Package2} label="Garments touched">
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{timing?.sampleCount ?? 0}</span>
            </KpiCard>

            <KpiCard icon={Star} label="Rating">
              {worker.rating ? (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "w-4 h-4",
                        i < worker.rating!
                          ? "fill-[var(--status-warn)] text-[var(--status-warn)]"
                          : "fill-muted text-muted",
                      )}
                    />
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </KpiCard>
          </>
        ) : (
          <>
            <KpiCard icon={Package2} label="Total output">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight">{worker.actual}</span>
                {worker.dailyTarget > 0 && (
                  <span className="text-sm text-muted-foreground">pieces</span>
                )}
              </div>
            </KpiCard>

            <KpiCard icon={Zap} label="Efficiency">
              {worker.dailyTarget > 0 ? (
                <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", TONE_TEXT[effTone])}>
                  {worker.efficiency}%
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">No target set</span>
              )}
            </KpiCard>

            <KpiCard icon={Target} label="Daily target">
              {worker.dailyTarget > 0 ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tabular-nums tracking-tight">{worker.dailyTarget}</span>
                  <span className="text-sm text-muted-foreground">/day</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Not set</span>
              )}
            </KpiCard>

            <KpiCard icon={RotateCcw} label="Rework">
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{worker.reworkCount}</span>
            </KpiCard>
          </>
        )}
      </div>

      {/* Timing + secondary metrics — one inline strip (only for individual stages) */}
      {!worker.unitOnly && (timing || dailyData.length > 0) && (
        <div className="bg-card border border-border rounded-md flex flex-wrap">
          {timing && (
            <>
              <InlineStat label="Avg min/piece" value={timing.avg} />
              <InlineStat label="Median" value={timing.median} />
              <InlineStat label="p90" value={timing.p90} />
              <InlineStat label="Sessions" value={timing.sampleCount} />
            </>
          )}
          <InlineStat label="Avg / day" value={avgPerDay} />
          {worker.dailyTarget > 0 && (
            <InlineStat
              label="Days on target"
              value={`${daysOnTarget} / ${dailyData.length}`}
            />
          )}
          {bestDay && (
            <InlineStat
              label="Best day"
              value={bestDay.completed}
              hint={new Date(bestDay.date + "T12:00:00+03:00").toLocaleDateString("en-GB", { timeZone: TIMEZONE, month: "short", day: "numeric" })}
            />
          )}
        </div>
      )}

      {/* Quality — defect rate + QC pass rate. Only individual stages. */}
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
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <ShieldCheck className="w-3 h-3" />
                  <span className="text-xs">First-pass yield</span>
                </div>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums tracking-tight",
                    quality.qcPassRate === null
                      ? "text-muted-foreground"
                      : quality.qcPassRate >= 90
                      ? TONE_TEXT.ok
                      : quality.qcPassRate >= 75
                      ? TONE_TEXT.warn
                      : TONE_TEXT.bad,
                  )}
                >
                  {quality.qcPassRate === null ? "—" : `${quality.qcPassRate}%`}
                </p>
                <p className="text-xs text-muted-foreground">no QC fails across all trips</p>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <RotateCcw className="w-3 h-3" />
                  <span className="text-xs">Defect rate</span>
                </div>
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums tracking-tight",
                    quality.defectRate === null
                      ? "text-muted-foreground"
                      : quality.defectRate <= 5
                      ? TONE_TEXT.ok
                      : quality.defectRate <= 15
                      ? TONE_TEXT.warn
                      : TONE_TEXT.bad,
                  )}
                >
                  {quality.defectRate === null ? "—" : `${quality.defectRate}%`}
                </p>
                <p className="text-xs text-muted-foreground">QC flagged this stage for rework</p>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Days present (unit-only stages) */}
      {worker.unitOnly && daysPresent.length > 0 && (
        <SectionCard title="Days present">
          <div className="flex flex-wrap gap-1.5">
            {daysPresent.map((d) => (
              <span key={d} className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md tabular-nums">
                {new Date(d + "T12:00:00+03:00").toLocaleDateString("en-GB", { timeZone: TIMEZONE, month: "short", day: "numeric" })}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Daily Output + Log — side by side */}
      {!worker.unitOnly && dailyData.length > 0 && (
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
          <SectionCard
            title="Daily output"
            action={
              worker.dailyTarget > 0 ? (
                <span className="text-xs text-muted-foreground">Target {worker.dailyTarget}/day</span>
              ) : null
            }
          >
            {dailyData.length > 1 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v) => {
                      const d = new Date(v + "T12:00:00+03:00");
                      return d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, month: "short", day: "numeric" });
                    }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={32} />
                  <RechartsTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--border)" }}
                    labelFormatter={(v) => {
                      const d = new Date(v + "T12:00:00+03:00");
                      return d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric" });
                    }}
                  />
                  {worker.dailyTarget > 0 && (
                    <ReferenceLine
                      y={worker.dailyTarget}
                      stroke="var(--status-warn)"
                      strokeDasharray="4 3"
                      strokeWidth={1}
                      label={{
                        value: "Target",
                        position: "insideTopRight",
                        fontSize: 10,
                        fill: "var(--status-warn)",
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="completed"
                    stroke={stageDot}
                    strokeWidth={2}
                    dot={{ r: 3, fill: stageDot }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-10">
                <p className="text-2xl font-semibold tabular-nums tracking-tight">{dailyData[0].completed}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(dailyData[0].date + "T12:00:00+03:00").toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "long", month: "long", day: "numeric" })}
                </p>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Day-by-day"
            action={<CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />}
            bodyClassName="p-0"
          >
            <div className="divide-y divide-border max-h-[260px] overflow-y-auto">
              {[...dailyData].reverse().map((d) => {
                const dayEff = worker.dailyTarget > 0 ? Math.round((d.completed / worker.dailyTarget) * 100) : 0;
                const met = d.completed >= worker.dailyTarget;
                return (
                  <div key={d.date} className="flex items-center justify-between px-4 py-2 hover:bg-muted/20 transition-colors">
                    <span className="text-sm text-muted-foreground">
                      {new Date(d.date + "T12:00:00+03:00").toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums">{d.completed}</span>
                      {worker.dailyTarget > 0 && (
                        <span className={cn(
                          "text-xs tabular-nums w-10 text-right",
                          met ? TONE_TEXT.ok : dayEff >= 70 ? TONE_TEXT.warn : TONE_TEXT.bad,
                        )}>
                          {dayEff}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
