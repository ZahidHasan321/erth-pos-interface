import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { usePerformanceData, type WorkerKpi } from "@/hooks/usePerformance";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Skeleton } from "@repo/ui/skeleton";
import { Input } from "@repo/ui/input";
import { PageHeader } from "@/components/shared/PageShell";
import { cn, getLocalDateStr, getKuwaitDayRange, TIMEZONE } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  TrendingUp, Award, ShieldCheck, Zap,
  Package2, Star, ChevronDown, ChevronUp,
  ArrowUpRight, ArrowDownRight, Minus,
  Search, RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/(main)/performance/")({
  component: PerformancePage,
  head: () => ({ meta: [{ title: "Performance" }] }),
});

const STAGE_LABELS: Record<string, string> = {
  soaking: "Soaking", cutting: "Cutting", post_cutting: "Post-Cut",
  sewing: "Sewing", finishing: "Finishing", ironing: "Ironing", quality_check: "QC",
};

const STAGE_COLORS: Record<string, string> = {
  soaking: "#0ea5e9", cutting: "#f59e0b", post_cutting: "#f97316",
  sewing: "#8b5cf6", finishing: "#10b981", ironing: "#f43f5e", quality_check: "#6366f1",
};

const STAGE_ORDER = ["soaking", "cutting", "post_cutting", "sewing", "finishing", "ironing", "quality_check"];

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
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-black tabular-nums tracking-tight">{value}</p>
      {subtitle && <p className="text-[11px] text-muted-foreground mt-1 truncate">{subtitle}</p>}
    </div>
  );
}

// ── Stage Filter Pills ──────────────────────────────────────────────

function StageFilter({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (stage: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "px-3 py-1.5 rounded-full text-xs font-bold transition-all",
          selected === null
            ? "bg-foreground text-background shadow-sm"
            : "bg-muted/60 text-muted-foreground hover:bg-muted",
        )}
      >
        All Stages
      </button>
      {STAGE_ORDER.map((stage) => (
        <button
          key={stage}
          onClick={() => onSelect(selected === stage ? null : stage)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
            selected === stage
              ? "shadow-sm border-transparent"
              : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted",
          )}
          style={
            selected === stage
              ? { backgroundColor: `${STAGE_COLORS[stage]}20`, color: STAGE_COLORS[stage], borderColor: `${STAGE_COLORS[stage]}40` }
              : undefined
          }
        >
          {STAGE_LABELS[stage]}
        </button>
      ))}
    </div>
  );
}

// ── Progress Bar ────────────────────────────────────────────────────

function TargetProgressBar({ actual, target, color }: { actual: number; target: number; color: string }) {
  if (target <= 0) return null;
  const pct = Math.min((actual / target) * 100, 150);
  const cappedWidth = Math.min(pct, 100);

  return (
    <div className="w-full">
      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${cappedWidth}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Worker Table ────────────────────────────────────────────────────

function WorkerTable({
  workers,
  sortBy,
  setSortBy,
  sortDir,
  setSortDir,
  searchQuery,
  onWorkerClick,
}: {
  workers: WorkerKpi[];
  sortBy: string;
  setSortBy: (v: string) => void;
  sortDir: "asc" | "desc";
  setSortDir: (v: "asc" | "desc") => void;
  searchQuery: string;
  onWorkerClick?: (w: WorkerKpi) => void;
}) {
  const toggleSort = (key: string) => {
    if (sortBy === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <Minus className="w-2.5 h-2.5 text-muted-foreground" />;
    return sortDir === "desc"
      ? <ChevronDown className="w-3 h-3 text-foreground" />
      : <ChevronUp className="w-3 h-3 text-foreground" />;
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return workers;
    const q = searchQuery.toLowerCase();
    return workers.filter((w) => w.name.toLowerCase().includes(q));
  }, [workers, searchQuery]);

  return (
    <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
      <div className="hidden md:grid grid-cols-[1fr_90px_90px_70px_120px_70px_70px_60px] gap-2 px-5 py-3 bg-muted/30 border-b">
        {[
          { key: "name", label: "Worker" },
          { key: "stage", label: "Stage" },
          { key: "unit", label: "Unit" },
          { key: "type", label: "Type" },
          { key: "actual", label: "Output" },
          { key: "efficiency", label: "Eff %" },
          { key: "rating", label: "Rating" },
          { key: "reworkCount", label: "Rework" },
        ].map((col) => (
          <button
            key={col.key}
            onClick={() => toggleSort(col.key)}
            className={cn(
              "flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-left",
              sortBy === col.key ? "text-foreground" : "text-muted-foreground hover:text-muted-foreground",
              ["actual", "efficiency", "rating", "reworkCount"].includes(col.key) ? "justify-end" : "",
            )}
          >
            {col.label}
            <SortIcon col={col.key} />
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-12 text-center text-muted-foreground text-sm">
          {searchQuery ? "No workers match your search" : "No data for the selected period"}
        </div>
      ) : (
        filtered.map((w, i) => {
          const effColor = w.efficiency >= 90 ? "#10b981" : w.efficiency >= 70 ? "#f59e0b" : "#ef4444";
          return (
            <div
              key={`${w.name}-${w.stage}-${i}`}
              className={cn("border-b last:border-b-0 hover:bg-muted/5 transition-colors", onWorkerClick && "cursor-pointer")}
              onClick={() => onWorkerClick?.(w)}
            >
              {/* Desktop */}
              <div className="hidden md:grid grid-cols-[1fr_90px_90px_70px_120px_70px_70px_60px] gap-2 px-5 py-3 items-center">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center text-[10px] font-black text-muted-foreground shrink-0">
                      {i + 1}
                    </div>
                    <span className="text-sm font-bold truncate">{w.name}</span>
                  </div>
                </div>
                <span
                  className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded w-fit"
                  style={{ backgroundColor: `${STAGE_COLORS[w.stage]}15`, color: STAGE_COLORS[w.stage] }}
                >
                  {STAGE_LABELS[w.stage] ?? w.stage}
                </span>
                <span className="text-xs text-muted-foreground font-medium truncate">{w.unit ?? "\u2014"}</span>
                <div>
                  {w.type ? (
                    <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                      w.type === "Senior" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600",
                    )}>
                      {w.type}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">\u2014</span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground tabular-nums">{w.dailyTarget || "\u2014"}</span>
                    <span className="text-sm font-bold tabular-nums">{w.actual}</span>
                  </div>
                  <TargetProgressBar
                    actual={w.actual}
                    target={(w.dailyTarget || 0)}
                    color={effColor}
                  />
                </div>
                <div className="flex items-center justify-end gap-1">
                  {w.dailyTarget > 0 ? (
                    <>
                      {w.efficiency >= 90 ? <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                        : w.efficiency >= 70 ? <Minus className="w-3 h-3 text-amber-500" />
                        : <ArrowDownRight className="w-3 h-3 text-red-500" />}
                      <span className={cn("text-sm font-black tabular-nums",
                        w.efficiency >= 90 ? "text-emerald-600" : w.efficiency >= 70 ? "text-amber-600" : "text-red-600",
                      )}>
                        {w.efficiency}%
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">\u2014</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-0.5">
                  {w.rating ? (
                    <>
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-bold tabular-nums">{w.rating}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">\u2014</span>
                  )}
                </div>
                <div className="flex items-center justify-end">
                  {w.reworkCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                      <RotateCcw className="w-2.5 h-2.5" />
                      {w.reworkCount}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">\u2014</span>
                  )}
                </div>
              </div>

              {/* Mobile */}
              <div className="md:hidden px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center text-[10px] font-black text-muted-foreground shrink-0">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-bold truncate block">{w.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className="text-[9px] font-bold rounded px-1.5 py-0.5"
                          style={{ backgroundColor: `${STAGE_COLORS[w.stage]}15`, color: STAGE_COLORS[w.stage] }}
                        >
                          {STAGE_LABELS[w.stage] ?? w.stage}
                        </span>
                        {w.reworkCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-orange-600 bg-orange-100 px-1 py-0.5 rounded">
                            <RotateCcw className="w-2 h-2" />
                            {w.reworkCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {w.dailyTarget > 0 && (
                      <span className={cn("text-sm font-black tabular-nums",
                        w.efficiency >= 90 ? "text-emerald-600" : w.efficiency >= 70 ? "text-amber-600" : "text-red-600",
                      )}>
                        {w.efficiency}%
                      </span>
                    )}
                    <div className="text-[10px] text-muted-foreground tabular-nums">{w.actual}/{w.dailyTarget || "?"}</div>
                  </div>
                </div>
                {w.dailyTarget > 0 && (
                  <div className="mt-2">
                    <TargetProgressBar actual={w.actual} target={w.dailyTarget} color={effColor} />
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Custom Bar Label ────────────────────────────────────────────────

function BarEfficiencyLabel(props: any) {
  const { x, y, width, height, index, data } = props;
  if (!data || !data[index]) return null;
  const entry = data[index];
  const eff = entry.target > 0 ? Math.round((entry.actual / entry.target) * 100) : 0;
  if (eff === 0) return null;

  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      textAnchor="start"
      dominantBaseline="central"
      fontSize={10}
      fontWeight={700}
      fill={entry.color}
    >
      {eff}%
    </text>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function PerformancePage() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState("week");
  const [sortBy, setSortBy] = useState("efficiency");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const dateRange = useMemo(() => getDateRange(preset), [preset]);
  const { workers, stages, daily, summary, isLoading } = usePerformanceData(dateRange);

  const filteredWorkers = useMemo(() => {
    if (!stageFilter) return workers;
    return workers.filter((w) => w.stage === stageFilter);
  }, [workers, stageFilter]);

  const sortedWorkers = useMemo(() => {
    const sorted = [...filteredWorkers].sort((a, b) => {
      const av = (a as any)[sortBy] ?? "";
      const bv = (b as any)[sortBy] ?? "";
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [filteredWorkers, sortBy, sortDir]);

  const stageChartData = useMemo(() =>
    stages
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
      .map((s) => ({
        name: STAGE_LABELS[s.stage] ?? s.stage,
        stage: s.stage,
        actual: s.totalActual,
        target: s.totalTarget,
        efficiency: s.efficiency,
        color: STAGE_COLORS[s.stage] ?? "#94a3b8",
      })),
    [stages],
  );

  const presetLabel = preset === "today" ? "today" : preset === "week" ? "this week" : preset === "month" ? "this month" : "this quarter";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={TrendingUp}
        title="Production Performance"
        subtitle="Worker efficiency and output tracking"
      >
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="month">Last 30 Days</SelectItem>
            <SelectItem value="quarter">Last 90 Days</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="h-12 rounded-xl" />
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={Package2}
              label="Completed"
              value={summary.totalCompleted}
              subtitle={presetLabel}
              color="bg-emerald-100 text-emerald-700"
            />
            <KpiCard
              icon={Zap}
              label="Avg Efficiency"
              value={`${summary.avgEfficiency}%`}
              subtitle={summary.avgEfficiency >= 90 ? "On target" : summary.avgEfficiency >= 70 ? "Below target" : "Needs attention"}
              color={summary.avgEfficiency >= 90 ? "bg-emerald-100 text-emerald-700" : summary.avgEfficiency >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}
            />
            <KpiCard
              icon={ShieldCheck}
              label="First-Pass Rate"
              value={`${summary.firstPassRate}%`}
              subtitle={summary.reworkCount > 0 ? `${summary.reworkCount} rework item${summary.reworkCount !== 1 ? "s" : ""}` : "No rework"}
              color={summary.firstPassRate >= 90 ? "bg-indigo-100 text-indigo-700" : summary.firstPassRate >= 75 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}
            />
            <KpiCard
              icon={Award}
              label="Best Performer"
              value={summary.bestPerformer?.name ?? "\u2014"}
              subtitle={summary.bestPerformer ? `${summary.bestPerformer.efficiency}% efficiency` : "No data"}
              color="bg-amber-100 text-amber-700"
            />
          </div>

          {/* Stage Filter */}
          <div className="bg-card border rounded-xl p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-3">Filter by Stage</p>
            <StageFilter selected={stageFilter} onSelect={setStageFilter} />
          </div>

          {/* Charts Row */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Daily Trend */}
            <div className="bg-card border rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground">Daily Output</p>
                {summary.dailyTarget > 0 && (
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Target: {summary.dailyTarget}/day
                  </span>
                )}
              </div>
              {daily.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={daily}>
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
                    {summary.dailyTarget > 0 && (
                      <ReferenceLine
                        y={summary.dailyTarget}
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
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#10b981" }}
                      activeDot={{ r: 5 }}
                      animationDuration={800}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground italic">
                  Not enough data for trend chart
                </div>
              )}
            </div>

            {/* Stage Breakdown */}
            <div className="bg-card border rounded-xl p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-4">Stage Throughput</p>
              {stageChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stageChartData} layout="vertical" barCategoryGap={8} margin={{ right: 50 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fontWeight: 600 }} width={60} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                      formatter={(value: any, name: any) => {
                        if (name === "actual") return [value ?? 0, "Completed"];
                        return [value ?? 0, "Target"];
                      }}
                    />
                    <Bar dataKey="target" fill="var(--muted)" radius={[0, 4, 4, 0]} barSize={14} opacity={0.3} animationDuration={800} />
                    <Bar
                      dataKey="actual"
                      radius={[0, 4, 4, 0]}
                      barSize={14}
                      animationDuration={800}
                      label={<BarEfficiencyLabel data={stageChartData} />}
                    >
                      {stageChartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.color}
                          opacity={stageFilter && stageFilter !== entry.stage ? 0.2 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground italic">
                  No stage data available
                </div>
              )}
            </div>
          </div>

          {/* Worker Performance Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground">
                Worker Breakdown
                {stageFilter && (
                  <span style={{ color: STAGE_COLORS[stageFilter] }}> \u2014 {STAGE_LABELS[stageFilter]}</span>
                )}
              </p>
              <div className="relative w-full max-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search workers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            <WorkerTable
              workers={sortedWorkers}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortDir={sortDir}
              setSortDir={setSortDir}
              searchQuery={searchQuery}
              onWorkerClick={(w) => navigate({
                to: "/performance/worker/$workerName",
                params: { workerName: w.name },
                search: { stage: w.stage, preset },
              })}
            />
            {sortedWorkers.length > 0 && (
              <p className="text-[10px] text-muted-foreground px-1">
                {sortedWorkers.length} worker{sortedWorkers.length !== 1 ? "s" : ""} with activity
                {stageFilter && ` in ${STAGE_LABELS[stageFilter]}`}
              </p>
            )}
          </div>
        </>
      )}

    </div>
  );
}
