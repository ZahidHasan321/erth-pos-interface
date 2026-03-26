import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { usePerformanceData, type WorkerKpi } from "@/hooks/usePerformance";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getLocalDateStr } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid,
} from "recharts";
import {
  TrendingUp, Award, ShieldCheck, Zap,
  Package2, Star, ChevronDown, ChevronUp,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";

export const Route = createFileRoute("/(main)/performance")({
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

function getDateRange(preset: string): { from: string; to: string } {
  const today = new Date();
  const todayStr = getLocalDateStr(today);

  switch (preset) {
    case "today":
      return { from: todayStr + "T00:00:00", to: todayStr + "T23:59:59" };
    case "week": {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { from: getLocalDateStr(start) + "T00:00:00", to: todayStr + "T23:59:59" };
    }
    case "month": {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { from: getLocalDateStr(start) + "T00:00:00", to: todayStr + "T23:59:59" };
    }
    case "quarter": {
      const start = new Date(today);
      start.setDate(start.getDate() - 89);
      return { from: getLocalDateStr(start) + "T00:00:00", to: todayStr + "T23:59:59" };
    }
    default:
      return { from: todayStr + "T00:00:00", to: todayStr + "T23:59:59" };
  }
}

// ── KPI Card ────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtitle?: string;
  color: string;
}) {
  return (
    <div className="bg-card border rounded-lg p-4 flex items-start gap-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/50">{label}</p>
        <p className="text-2xl font-black tabular-nums tracking-tight mt-0.5">{value}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{subtitle}</p>}
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
}: {
  workers: WorkerKpi[];
  sortBy: string;
  setSortBy: (v: string) => void;
  sortDir: "asc" | "desc";
  setSortDir: (v: "asc" | "desc") => void;
}) {
  const toggleSort = (key: string) => {
    if (sortBy === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <Minus className="w-2.5 h-2.5 text-muted-foreground/20" />;
    return sortDir === "desc"
      ? <ChevronDown className="w-3 h-3 text-foreground" />
      : <ChevronUp className="w-3 h-3 text-foreground" />;
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div className="hidden md:grid grid-cols-[1fr_90px_90px_70px_80px_80px_70px_60px] gap-2 px-4 py-2.5 bg-muted/40 border-b">
        {[
          { key: "name", label: "Worker" },
          { key: "stage", label: "Stage" },
          { key: "unit", label: "Unit" },
          { key: "type", label: "Type" },
          { key: "dailyTarget", label: "Target" },
          { key: "actual", label: "Actual" },
          { key: "efficiency", label: "Eff %" },
          { key: "rating", label: "Rating" },
        ].map((col) => (
          <button
            key={col.key}
            onClick={() => toggleSort(col.key)}
            className={cn(
              "flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-left",
              sortBy === col.key ? "text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground",
              col.key === "dailyTarget" || col.key === "actual" || col.key === "efficiency" || col.key === "rating" ? "justify-end" : "",
            )}
          >
            {col.label}
            <SortIcon col={col.key} />
          </button>
        ))}
      </div>

      {workers.length === 0 ? (
        <div className="px-4 py-10 text-center text-muted-foreground/40 text-xs italic">
          No data for the selected period
        </div>
      ) : (
        workers.map((w, i) => (
          <div key={`${w.name}-${w.stage}-${i}`} className="border-b last:border-b-0 hover:bg-muted/10 transition-colors">
            {/* Desktop */}
            <div className="hidden md:grid grid-cols-[1fr_90px_90px_70px_80px_80px_70px_60px] gap-2 px-4 py-2.5 items-center">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center text-[10px] font-black text-muted-foreground shrink-0">
                  {i + 1}
                </div>
                <span className="text-sm font-semibold truncate">{w.name}</span>
              </div>
              <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded w-fit",
                `bg-[${STAGE_COLORS[w.stage]}]/10 text-[${STAGE_COLORS[w.stage]}]`,
              )} style={{ backgroundColor: `${STAGE_COLORS[w.stage]}15`, color: STAGE_COLORS[w.stage] }}>
                {STAGE_LABELS[w.stage] ?? w.stage}
              </span>
              <span className="text-xs text-muted-foreground font-medium truncate">{w.unit ?? "—"}</span>
              <div>
                {w.type ? (
                  <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                    w.type === "Senior" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600",
                  )}>
                    {w.type}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground/30">—</span>
                )}
              </div>
              <span className="text-sm font-bold tabular-nums text-right text-muted-foreground/60">{w.dailyTarget || "—"}</span>
              <span className="text-sm font-bold tabular-nums text-right">{w.actual}</span>
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
                  <span className="text-xs text-muted-foreground/30">—</span>
                )}
              </div>
              <div className="flex items-center justify-end gap-0.5">
                {w.rating ? (
                  <>
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-bold tabular-nums">{w.rating}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground/30">—</span>
                )}
              </div>
            </div>

            {/* Mobile */}
            <div className="md:hidden px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center text-[10px] font-black text-muted-foreground shrink-0">
                    {i + 1}
                  </div>
                  <span className="text-sm font-semibold truncate">{w.name}</span>
                </div>
                {w.dailyTarget > 0 && (
                  <span className={cn("text-sm font-black tabular-nums",
                    w.efficiency >= 90 ? "text-emerald-600" : w.efficiency >= 70 ? "text-amber-600" : "text-red-600",
                  )}>
                    {w.efficiency}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[10px] font-bold rounded px-1.5 py-0.5"
                  style={{ backgroundColor: `${STAGE_COLORS[w.stage]}15`, color: STAGE_COLORS[w.stage] }}>
                  {STAGE_LABELS[w.stage] ?? w.stage}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{w.actual}/{w.dailyTarget || "?"}</span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function PerformancePage() {
  const [preset, setPreset] = useState("week");
  const [sortBy, setSortBy] = useState("efficiency");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const dateRange = useMemo(() => getDateRange(preset), [preset]);
  const { workers, stages, daily, summary, isLoading } = usePerformanceData(dateRange);

  const sortedWorkers = useMemo(() => {
    const sorted = [...workers].sort((a, b) => {
      const av = (a as any)[sortBy] ?? "";
      const bv = (b as any)[sortBy] ?? "";
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [workers, sortBy, sortDir]);

  const stageChartData = useMemo(() =>
    stages
      .sort((a, b) => {
        const order = ["soaking", "cutting", "post_cutting", "sewing", "finishing", "ironing", "quality_check"];
        return order.indexOf(a.stage) - order.indexOf(b.stage);
      })
      .map((s) => ({
        name: STAGE_LABELS[s.stage] ?? s.stage,
        actual: s.totalActual,
        target: s.totalTarget,
        color: STAGE_COLORS[s.stage] ?? "#94a3b8",
      })),
    [stages],
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-2.5">
            <TrendingUp className="w-5 h-5" />
            Production Performance
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Worker efficiency and output tracking
          </p>
        </div>
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
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard
              icon={Package2}
              label="Completed"
              value={summary.totalCompleted}
              subtitle={`${preset === "today" ? "today" : preset === "week" ? "this week" : preset === "month" ? "this month" : "this quarter"}`}
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
              icon={Award}
              label="Best Performer"
              value={summary.bestPerformer?.name ?? "—"}
              subtitle={summary.bestPerformer ? `${summary.bestPerformer.efficiency}% efficiency` : "No data"}
              color="bg-amber-100 text-amber-700"
            />
            <KpiCard
              icon={ShieldCheck}
              label="QC Pass Rate"
              value={`${summary.qcPassRate}%`}
              subtitle="First-pass quality"
              color="bg-indigo-100 text-indigo-700"
            />
          </div>

          {/* Charts Row */}
          <div className="grid md:grid-cols-2 gap-4 mb-6">
            {/* Daily Trend */}
            <div className="bg-card border rounded-lg p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/50 mb-3">Daily Output</p>
              {daily.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => {
                        const d = new Date(v + "T12:00:00");
                        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      }}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={35} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                      labelFormatter={(v) => {
                        const d = new Date(v + "T12:00:00");
                        return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="completed"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#10b981" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground/40 italic">
                  Not enough data for trend chart
                </div>
              )}
            </div>

            {/* Stage Breakdown */}
            <div className="bg-card border rounded-lg p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/50 mb-3">Stage Throughput</p>
              {stageChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stageChartData} layout="vertical" barCategoryGap={6}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={60} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                      formatter={(value: any, name: any) => [value ?? 0, name === "actual" ? "Completed" : "Target"]}
                    />
                    <Bar dataKey="target" fill="var(--muted)" radius={[0, 4, 4, 0]} barSize={14} opacity={0.4} />
                    <Bar dataKey="actual" radius={[0, 4, 4, 0]} barSize={14}>
                      {stageChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground/40 italic">
                  No stage data available
                </div>
              )}
            </div>
          </div>

          {/* Worker Performance Table */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">Worker Breakdown</p>
            <WorkerTable
              workers={sortedWorkers}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortDir={sortDir}
              setSortDir={setSortDir}
            />
            {sortedWorkers.length > 0 && (
              <p className="text-[10px] text-muted-foreground/40 mt-2 px-1">
                {sortedWorkers.length} worker{sortedWorkers.length !== 1 ? "s" : ""} with activity
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
