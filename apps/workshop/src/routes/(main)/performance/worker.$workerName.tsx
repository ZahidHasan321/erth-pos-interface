import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePerformanceData, getWorkerDailyBreakdown } from "@/hooks/usePerformance";
import { PageHeader } from "@/components/shared/PageShell";
import { Button } from "@repo/ui/button";
import { cn, getLocalDateStr, getKuwaitDayRange, TIMEZONE } from "@/lib/utils";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine,
  BarChart, Bar,
} from "recharts";
import {
  ArrowLeft, Target, Zap, RotateCcw, Star,
  CalendarDays, TrendingUp, Package2,
} from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  soaking: "Soaking", cutting: "Cutting", post_cutting: "Post-Cut",
  sewing: "Sewing", finishing: "Finishing", ironing: "Ironing", quality_check: "QC",
};

const STAGE_COLORS: Record<string, string> = {
  soaking: "#0ea5e9", cutting: "#f59e0b", post_cutting: "#f97316",
  sewing: "#8b5cf6", finishing: "#10b981", ironing: "#f43f5e", quality_check: "#6366f1",
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
    <div className="rounded-md border bg-card p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      </div>
      {children}
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

  const stageColor = STAGE_COLORS[stage] ?? "#94a3b8";
  const presetLabel = preset === "today" ? "Today" : preset === "week" ? "Last 7 Days" : preset === "month" ? "Last 30 Days" : "Last 90 Days";

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-muted rounded-md animate-pulse" />)}
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
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-semibold mb-1">Worker not found</p>
          <p className="text-sm text-muted-foreground">No data for "{name}" in {STAGE_LABELS[stage] ?? stage} {presetLabel.toLowerCase()}.</p>
        </div>
      </div>
    );
  }

  const effColor = worker.efficiency >= 90 ? "#10b981" : worker.efficiency >= 70 ? "#f59e0b" : "#ef4444";

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={Package2} label="Total Output">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black tabular-nums">{worker.actual}</span>
            {worker.dailyTarget > 0 && (
              <span className="text-sm text-muted-foreground">pieces</span>
            )}
          </div>
        </KpiCard>

        <KpiCard icon={Zap} label="Efficiency">
          {worker.dailyTarget > 0 ? (
            <span className="text-2xl font-black tabular-nums" style={{ color: effColor }}>
              {worker.efficiency}%
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">No target set</span>
          )}
        </KpiCard>

        <KpiCard icon={Target} label="Daily Target">
          {worker.dailyTarget > 0 ? (
            <div>
              <span className="text-2xl font-black tabular-nums">{worker.dailyTarget}</span>
              <span className="text-sm text-muted-foreground ml-1">/day</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Not set</span>
          )}
        </KpiCard>

        <KpiCard icon={RotateCcw} label="Rework">
          <span className="text-2xl font-black tabular-nums">{worker.reworkCount}</span>
        </KpiCard>
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-md border bg-card px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Avg / Day</p>
          <p className="text-lg font-black tabular-nums">{avgPerDay}</p>
        </div>
        {worker.dailyTarget > 0 && (
          <div className="rounded-md border bg-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Days on Target</p>
            <p className="text-lg font-black tabular-nums">
              {daysOnTarget}<span className="text-sm text-muted-foreground font-normal"> / {dailyData.length}</span>
            </p>
          </div>
        )}
        {bestDay && (
          <div className="rounded-md border bg-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Best Day</p>
            <p className="text-lg font-black tabular-nums">{bestDay.completed}</p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(bestDay.date + "T12:00:00+03:00").toLocaleDateString("en-GB", { timeZone: TIMEZONE, month: "short", day: "numeric" })}
            </p>
          </div>
        )}
        {worker.rating && (
          <div className="rounded-md border bg-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Rating</p>
            <div className="flex items-center gap-0.5 mt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "w-4 h-4",
                    i < worker.rating! ? "fill-amber-400 text-amber-400" : "fill-muted text-muted",
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Daily Trend Chart — full width */}
      <div className="rounded-md border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground">Daily Output Trend</p>
          </div>
          {worker.dailyTarget > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Target: {worker.dailyTarget}/day
            </span>
          )}
        </div>
        {dailyData.length > 1 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => {
                  const d = new Date(v + "T12:00:00+03:00");
                  return d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, month: "short", day: "numeric" });
                }}
              />
              <YAxis tick={{ fontSize: 10 }} width={35} />
              <RechartsTooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                labelFormatter={(v) => {
                  const d = new Date(v + "T12:00:00+03:00");
                  return d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric" });
                }}
              />
              {worker.dailyTarget > 0 && (
                <ReferenceLine
                  y={worker.dailyTarget}
                  stroke="#f59e0b"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{
                    value: "Target",
                    position: "insideTopRight",
                    fontSize: 10,
                    fontWeight: 700,
                    fill: "#f59e0b",
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="completed"
                stroke={stageColor}
                strokeWidth={2.5}
                dot={{ r: 4, fill: stageColor }}
                activeDot={{ r: 6 }}
                animationDuration={800}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : dailyData.length === 1 ? (
          <div className="text-center py-12">
            <p className="text-3xl font-black tabular-nums">{dailyData[0].completed}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(dailyData[0].date + "T12:00:00+03:00").toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
        ) : (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground italic">
            No output data for this period
          </div>
        )}
      </div>

      {/* Day-by-Day Breakdown */}
      {dailyData.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Bar chart view */}
          <div className="rounded-md border bg-card p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-4">Daily Breakdown</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9 }}
                  tickFormatter={(v) => {
                    const d = new Date(v + "T12:00:00+03:00");
                    return d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, day: "numeric" });
                  }}
                />
                <YAxis tick={{ fontSize: 10 }} width={30} />
                <RechartsTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                  labelFormatter={(v) => {
                    const d = new Date(v + "T12:00:00+03:00");
                    return d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric" });
                  }}
                />
                {worker.dailyTarget > 0 && (
                  <ReferenceLine y={worker.dailyTarget} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} />
                )}
                <Bar dataKey="completed" radius={[4, 4, 0, 0]} animationDuration={800} fill={stageColor} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table view */}
          <div className="rounded-md border overflow-hidden bg-card">
            <div className="px-5 py-3 border-b bg-muted/30">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground">Day-by-Day Log</p>
            </div>
            <div className="divide-y max-h-[260px] overflow-y-auto">
              {[...dailyData].reverse().map((d) => {
                const dayEff = worker.dailyTarget > 0 ? Math.round((d.completed / worker.dailyTarget) * 100) : 0;
                const met = d.completed >= worker.dailyTarget;
                return (
                  <div key={d.date} className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/5">
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.date + "T12:00:00+03:00").toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold tabular-nums">{d.completed}</span>
                      {worker.dailyTarget > 0 && (
                        <span className={cn(
                          "text-[10px] font-bold tabular-nums w-10 text-right",
                          met ? "text-emerald-600" : dayEff >= 70 ? "text-amber-600" : "text-red-600",
                        )}>
                          {dayEff}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
