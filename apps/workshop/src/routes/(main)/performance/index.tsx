import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { usePerformanceData, useRedoImpact, type WorkerKpi, type UnitKpi, type RedoImpactRow } from "@/hooks/usePerformance";
import { WORKER_SCOPED_STAGES, UNIT_SCOPED_STAGES } from "@/lib/stage-shape";
import { getRootCauseLabel } from "@/lib/root-causes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import { Skeleton } from "@repo/ui/skeleton";
import { Input } from "@repo/ui/input";
import { FilterChip, FilterChipGroup } from "@/components/shared/FilterChip";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared/PageShell";
import { cn, getLocalDateStr, getKuwaitDayRange, TIMEZONE } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, ReferenceLine,
} from "recharts";
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent";
import type { Payload } from "recharts/types/component/DefaultTooltipContent";
import {
  TrendingUp, ShieldCheck,
  Package2, Star, ChevronDown, ChevronUp,
  ArrowUpRight, ArrowDownRight, Minus,
  Search, RotateCcw, Users, Clock,
  Timer, CalendarClock, ThumbsUp, Recycle, Rocket,
} from "lucide-react";

// URL is the source of truth for the date preset, stage filter, breakdown tab,
// worker search and sort. Defaults (week / all stages / workers tab / efficiency
// desc / empty search) are omitted to keep a bare URL.
type Preset = "today" | "week" | "month" | "quarter";
type PerfTab = "workers" | "units";
type PerformanceSearch = {
  preset?: Preset;
  stage?: string;
  tab?: PerfTab;
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
};

const isPreset = (v: unknown): v is Preset =>
  v === "today" || v === "week" || v === "month" || v === "quarter";

export const Route = createFileRoute("/(main)/performance/")({
  component: PerformancePage,
  head: () => ({ meta: [{ title: "Performance" }] }),
  validateSearch: (raw: Record<string, unknown>): PerformanceSearch => ({
    preset: isPreset(raw.preset) ? raw.preset : undefined,
    stage: typeof raw.stage === "string" && raw.stage ? raw.stage : undefined,
    tab: raw.tab === "units" ? "units" : undefined,
    q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
    sort: typeof raw.sort === "string" && raw.sort && raw.sort !== "efficiency" ? raw.sort : undefined,
    dir: raw.dir === "asc" ? "asc" : undefined,
  }),
});

// TEMP DISABLED: post_cutting hidden from production flow
const STAGE_LABELS: Record<string, string> = {
  soaking: "Soaking", cutting: "Cutting",
  sewing: "Sewing", finishing: "Finishing", ironing: "Ironing", quality_check: "QC",
};

/** Human-readable duration. Uses minutes <60, hours <24h, days otherwise. */
function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`;
}

// Stage dots — neutral muted tones. Color encodes stage identity, not signal.
// Kept distinct enough for at-a-glance identification but no longer screaming.
const STAGE_COLORS: Record<string, string> = {
  soaking: "var(--status-info)",
  cutting: "var(--status-warn)",
  // post_cutting: "var(--status-warn)", // TEMP DISABLED
  sewing: "var(--foreground)",
  finishing: "var(--status-ok)",
  ironing: "var(--status-bad)",
  quality_check: "var(--status-info)",
};

const STAGE_ORDER = ["soaking", "cutting", "sewing", "finishing", "ironing", "quality_check"];

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

// Efficiency tier → semantic token. One source of truth.
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

// Responsible-party display labels. The party value itself is derived server-side
// from root_cause (root_cause_responsible_party, §2.9) — never recomputed here.
const PARTY_LABEL: Record<string, string> = {
  production: "Production team",
  qc: "Quality control",
  showroom: "Showroom",
  customer: "Customer",
  supplier: "Supplier",
};

// CLAUDE.md §6 Q14: only production and QC redos count against the factory's
// performance. Showroom / customer / supplier / unattributed are external — the
// material cost is real, but the factory is NOT penalized for it.
const INTERNAL_PARTIES = new Set(["production", "qc"]);

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
}) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <p className="text-xs">{label}</p>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight mt-2">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>}
    </div>
  );
}

// ── Secondary stat (inline, no card chrome) ─────────────────────────

function SecondaryStat({
  icon: Icon,
  label,
  value,
  hint,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  index: number;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 px-4 py-3 min-w-0",
        // 2-col grid (mobile): left border on right column, top border on bottom row
        index % 2 === 1 && "border-l border-border",
        index >= 2 && "border-t border-border",
        // 4-col grid (md+): override — top border off, left border on every non-first
        "md:border-t-0",
        index > 0 && "md:border-l md:border-border",
        index === 0 && "md:border-l-0",
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3 h-3 shrink-0" />
        <span className="text-xs truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-base font-medium tabular-nums shrink-0">{value}</span>
        {hint && <span className="text-xs text-muted-foreground truncate">{hint}</span>}
      </div>
    </div>
  );
}

// ── Progress Bar ────────────────────────────────────────────────────

function TargetProgressBar({ actual, target, tone }: { actual: number; target: number; tone: "ok" | "warn" | "bad" }) {
  if (target <= 0) return null;
  const pct = Math.min((actual / target) * 100, 150);
  const cappedWidth = Math.min(pct, 100);
  const bg = tone === "ok" ? "var(--status-ok)" : tone === "warn" ? "var(--status-warn)" : "var(--status-bad)";

  return (
    <div className="w-full">
      <div className="h-1 rounded-sm bg-muted overflow-hidden">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${cappedWidth}%`, backgroundColor: bg }}
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
    if (sortBy !== col) return <Minus className="w-2.5 h-2.5 opacity-40" />;
    return sortDir === "desc"
      ? <ChevronDown className="w-3 h-3" />
      : <ChevronUp className="w-3 h-3" />;
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return workers;
    const q = searchQuery.toLowerCase();
    return workers.filter((w) => w.name.toLowerCase().includes(q));
  }, [workers, searchQuery]);

  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      <div className="hidden md:grid grid-cols-[1fr_90px_90px_70px_120px_70px_70px_60px] gap-2 px-5 py-2.5 bg-muted/30 border-b">
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
              "flex items-center gap-1 text-sm font-medium text-left transition-colors",
              sortBy === col.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
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
          const tone = efficiencyTone(w.efficiency);
          return (
            <div
              key={`${w.name}-${w.stage}-${i}`}
              className={cn(
                "border-b last:border-b-0 hover:bg-muted/20 transition-colors",
                onWorkerClick && "cursor-pointer",
              )}
              onClick={() => onWorkerClick?.(w)}
            >
              {/* Desktop */}
              <div className="hidden md:grid grid-cols-[1fr_90px_90px_70px_120px_70px_70px_60px] gap-2 px-5 py-3 items-center">
                <span className="text-base font-medium truncate">{w.name}</span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground w-fit">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[w.stage] }} />
                  {STAGE_LABELS[w.stage] ?? w.stage}
                </span>
                <span className="text-sm text-muted-foreground truncate">{w.unit ?? "—"}</span>
                <div>
                  {w.type ? (
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-md",
                      w.type === "Senior" ? "bg-muted text-foreground" : "bg-muted/50 text-muted-foreground",
                    )}>
                      {w.type}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground tabular-nums">{w.dailyTarget || "—"}</span>
                    <span className="text-base font-medium tabular-nums">{w.actual}</span>
                  </div>
                  <TargetProgressBar
                    actual={w.actual}
                    target={(w.dailyTarget || 0)}
                    tone={tone}
                  />
                </div>
                <div className="flex items-center justify-end gap-1">
                  {w.dailyTarget > 0 ? (
                    <>
                      {tone === "ok" ? <ArrowUpRight className="w-3 h-3 text-[var(--status-ok)]" />
                        : tone === "warn" ? <Minus className="w-3 h-3 text-[var(--status-warn)]" />
                        : <ArrowDownRight className="w-3 h-3 text-[var(--status-bad)]" />}
                      <span className={cn("text-sm font-medium tabular-nums", TONE_TEXT[tone])}>
                        {w.efficiency}%
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-0.5">
                  {w.rating ? (
                    <>
                      <Star className="w-3 h-3 fill-[var(--status-warn)] text-[var(--status-warn)]" />
                      <span className="text-sm font-medium tabular-nums">{w.rating}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex items-center justify-end">
                  {w.reworkCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--status-warn)] bg-[var(--status-warn-bg)] px-1.5 py-0.5 rounded-md">
                      <RotateCcw className="w-2.5 h-2.5" />
                      {w.reworkCount}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </div>

              {/* Mobile */}
              <div className="md:hidden px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-base font-medium truncate block">{w.name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: STAGE_COLORS[w.stage] }} />
                        {STAGE_LABELS[w.stage] ?? w.stage}
                      </span>
                      {w.reworkCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-[var(--status-warn)] bg-[var(--status-warn-bg)] px-1.5 py-0.5 rounded-md">
                          <RotateCcw className="w-2.5 h-2.5" />
                          {w.reworkCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {w.dailyTarget > 0 && (
                      <span className={cn("text-base font-medium tabular-nums", TONE_TEXT[tone])}>
                        {w.efficiency}%
                      </span>
                    )}
                    <div className="text-xs text-muted-foreground tabular-nums">{w.actual}/{w.dailyTarget || "—"}</div>
                  </div>
                </div>
                {w.dailyTarget > 0 && (
                  <div className="mt-2">
                    <TargetProgressBar actual={w.actual} target={w.dailyTarget} tone={tone} />
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

// ── Units Table ─────────────────────────────────────────────────────

function UnitTable({ units, onMemberClick }: { units: UnitKpi[]; onMemberClick?: (name: string, stage: string) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (units.length === 0) {
    return <EmptyState icon={Users} message="No units configured" />;
  }

  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      <div className="hidden md:grid grid-cols-[1.2fr_100px_60px_80px_90px_80px_80px_80px_70px] gap-2 px-5 py-2.5 bg-muted/30 border-b text-sm font-medium text-muted-foreground">
        <span>Unit</span>
        <span>Stage</span>
        <span className="text-right">Members</span>
        <span className="text-right">Completed</span>
        <span className="text-right">Avg min</span>
        <span className="text-right">p90 min</span>
        <span className="text-right">Defect %</span>
        <span className="text-right">Target</span>
        <span className="text-right">Eff %</span>
      </div>
      {units.map((u) => {
        const eff = u.efficiency;
        const effTone = efficiencyTone(eff);
        const defectTone: "ok" | "warn" | "bad" | null =
          u.defectRate === null ? null
            : u.defectRate <= 5 ? "ok"
            : u.defectRate <= 15 ? "warn"
            : "bad";
        const isExpanded = expandedId === u.id;
        return (
          <div key={u.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
            <div
              className={cn(
                "hidden md:grid grid-cols-[1.2fr_100px_60px_80px_90px_80px_80px_80px_70px] gap-2 px-5 py-3 items-center",
                u.members.length > 0 && "cursor-pointer",
              )}
              onClick={() => u.members.length > 0 && setExpandedId(isExpanded ? null : u.id)}
            >
              <div className="flex items-center gap-2 min-w-0">
                {u.members.length > 0 && (
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform",
                      !isExpanded && "-rotate-90",
                    )}
                  />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-base font-medium truncate">{u.name}</span>
                  {u.members.length > 0 && !isExpanded && (
                    <span className="text-xs text-muted-foreground truncate mt-0.5">
                      {u.members.slice(0, 3).join(", ")}
                      {u.members.length > 3 ? `, +${u.members.length - 3}` : ""}
                    </span>
                  )}
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground w-fit">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STAGE_COLORS[u.stage] }} />
                {STAGE_LABELS[u.stage] ?? u.stage}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums text-right inline-flex items-center justify-end gap-1">
                <Users className="w-3 h-3" />
                {u.memberCount}
              </span>
              <span className="text-base font-medium tabular-nums text-right">{u.completed}</span>
              <span className="text-sm text-muted-foreground tabular-nums text-right inline-flex items-center justify-end gap-1">
                {u.avgMinutes !== null ? (
                  <>
                    <Clock className="w-3 h-3" />
                    {u.avgMinutes}
                  </>
                ) : (
                  "—"
                )}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums text-right">
                {u.p90Minutes !== null ? u.p90Minutes : "—"}
              </span>
              <span
                className={cn(
                  "text-sm tabular-nums text-right",
                  defectTone ? TONE_TEXT[defectTone] : "text-muted-foreground",
                )}
              >
                {u.defectRate !== null ? `${u.defectRate}%` : "—"}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums text-right">
                {u.totalDailyTarget > 0 ? u.totalDailyTarget : "—"}
              </span>
              <span
                className={cn(
                  "text-sm font-medium tabular-nums text-right",
                  u.totalDailyTarget > 0 ? TONE_TEXT[effTone] : "text-muted-foreground",
                )}
              >
                {u.totalDailyTarget > 0 ? `${eff}%` : "—"}
              </span>
            </div>

            {/* Expanded roster panel (desktop only) */}
            {isExpanded && u.members.length > 0 && (
              <div className="hidden md:block px-5 pb-3 pt-1 bg-muted/10 border-t border-border/60">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Members ({u.memberCount})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {u.members.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onMemberClick?.(m, u.stage)}
                      className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-card border border-border cursor-pointer transition-[background-color,transform] duration-100 ease-out hover:bg-muted active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="w-4 h-4 rounded-md bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                        {m.charAt(0).toUpperCase()}
                      </span>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile */}
            <div className="md:hidden px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-base font-medium truncate block">{u.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="w-1 h-1 rounded-full" style={{ backgroundColor: STAGE_COLORS[u.stage] }} />
                      {STAGE_LABELS[u.stage] ?? u.stage}
                    </span>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5">
                      <Users className="w-2.5 h-2.5" />
                      {u.memberCount}
                    </span>
                  </div>
                  {u.members.length > 0 && (
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {u.members.slice(0, 4).join(", ")}
                      {u.members.length > 4 ? `, +${u.members.length - 4}` : ""}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-base font-medium tabular-nums">{u.completed}</span>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {u.avgMinutes !== null ? `${u.avgMinutes} min avg` : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Redo impact by responsibility (Q14) ─────────────────────────────

function RedoImpactCard({ rows, isLoading }: { rows: RedoImpactRow[]; isLoading: boolean }) {
  const totalCost = rows.reduce((s, r) => s + (r.waste_cost ?? 0), 0);
  const totalCount = rows.reduce((s, r) => s + (r.redo_count ?? 0), 0);
  return (
    <SectionCard
      title="Redo impact by responsibility"
      action={
        <span className="text-xs text-muted-foreground tabular-nums">
          {totalCount} redo{totalCount === 1 ? "" : "s"}
        </span>
      }
    >
      {isLoading ? (
        <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Recycle} message="No redos recorded in this period" />
      ) : (
        <div className="space-y-1.5">
          {/* CLAUDE.md §6 Q14: redo labor is double-classified — productive
              effort (capacity) AND failed-quality cost — never netted. Both
              halves are shown as distinct figures; neutral so the per-row
              factory/external coloring stays the one signal. */}
          <div className="grid grid-cols-2 -mx-4 -mt-4 mb-2 border-b border-border/60">
            <div className="flex flex-col gap-1 px-4 py-3 min-w-0">
              <span className="text-xs text-muted-foreground">Production effort</span>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-base font-medium tabular-nums shrink-0">
                  {totalCount} piece{totalCount === 1 ? "" : "s"}
                </span>
                <span className="text-xs text-muted-foreground truncate">counted toward capacity</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 px-4 py-3 min-w-0 border-l border-border/60">
              <span className="text-xs text-muted-foreground">Failed-quality cost</span>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-base font-medium tabular-nums shrink-0">{totalCost.toFixed(2)}</span>
                <span className="text-xs text-muted-foreground truncate">material scrapped</span>
              </div>
            </div>
          </div>
          {rows.map((r) => {
            const internal = r.party != null && INTERNAL_PARTIES.has(r.party);
            const pct = totalCost > 0 ? (r.waste_cost / totalCost) * 100 : 0;
            const partyLabel = r.party ? PARTY_LABEL[r.party] ?? r.party : "Unattributed";
            return (
              <div key={r.root_cause ?? "unattributed"} className="flex items-center gap-3 text-sm">
                <div className="w-44 min-w-0">
                  <div className="truncate">{getRootCauseLabel(r.root_cause)}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">{partyLabel}</span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-md shrink-0 bg-muted",
                        internal ? "text-[var(--status-bad)]" : "text-muted-foreground",
                      )}
                    >
                      {internal ? "factory" : "external"}
                    </span>
                  </div>
                </div>
                <div className="flex-1 bg-muted rounded-md h-2 overflow-hidden" aria-hidden="true">
                  <div
                    className={cn("h-full", internal ? "bg-[var(--status-bad)]" : "bg-[var(--muted-foreground)]")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="tabular-nums text-muted-foreground w-16 text-right">{r.redo_count}×</span>
                <span className="tabular-nums text-muted-foreground w-20 text-right">{r.waste_qty.toFixed(1)} m</span>
                <span className="tabular-nums font-medium w-24 text-right">cost {r.waste_cost.toFixed(2)}</span>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground pt-2 mt-2 border-t border-border/60">
            Factory rows (production, QC) count against performance; external rows
            carry the material cost but no blanket factory penalty. Customer-fabric
            redos have no material cost. Redone pieces are double-classified — the
            production labor counts toward capacity, the material is a failed-quality
            cost — and the two are never netted against each other.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function PerformancePage() {
  const navigate = useNavigate();
  // URL is the source of truth for preset / stage / tab / search / sort.
  const sp = Route.useSearch();
  const preset = sp.preset ?? "week";
  const sortBy = sp.sort ?? "efficiency";
  const sortDir: "asc" | "desc" = sp.dir ?? "desc";
  const stageFilter = sp.stage ?? null;
  const searchQuery = sp.q ?? "";
  const tab: PerfTab = sp.tab ?? "workers";
  const navFilters = Route.useNavigate();
  const patch = (p: Partial<PerformanceSearch>) =>
    navFilters({ search: (prev) => ({ ...prev, ...p }), replace: true });
  const setPreset = (v: string) => patch({ preset: isPreset(v) && v !== "week" ? v : undefined });
  const setSortBy = (v: string) => patch({ sort: v === "efficiency" ? undefined : v });
  const setSortDir = (v: "asc" | "desc") => patch({ dir: v === "desc" ? undefined : v });
  const setStageFilter = (v: string | null) => patch({ stage: v ?? undefined });
  const setSearchQuery = (v: string) => patch({ q: v || undefined });
  const setTab = (v: PerfTab) => patch({ tab: v === "workers" ? undefined : v });

  const dateRange = useMemo(() => getDateRange(preset), [preset]);
  const { workers, daily, summary, units, stageCycleTimes, isLoading } = usePerformanceData(dateRange);
  const redoImpact = useRedoImpact(dateRange);
  const redoRows = redoImpact.data ?? [];
  const redoTotalCost = redoRows.reduce((s, r) => s + (r.waste_cost ?? 0), 0);
  const redoTotalCount = redoRows.reduce((s, r) => s + (r.redo_count ?? 0), 0);

  // Stage pills available in the filter depend on the current tab.
  const availableStages = useMemo<string[]>(() => {
    if (tab === "workers") return WORKER_SCOPED_STAGES;
    // Units tab covers sewing units only — soaking is excluded from Performance (§6 Q1).
    return UNIT_SCOPED_STAGES;
  }, [tab]);

  // If the user selected a filter that doesn't apply to the current tab,
  // treat it as null for filtering purposes. Avoids a sync setState in effect.
  const effectiveStageFilter = stageFilter && availableStages.includes(stageFilter)
    ? stageFilter
    : null;

  const filteredUnits = useMemo(() => {
    if (!effectiveStageFilter) return units;
    return units.filter((u) => u.stage === effectiveStageFilter);
  }, [units, effectiveStageFilter]);

  // Workers tab shows only worker-scoped stages. Soakers and sewers are
  // group/unit scoped — their performance lives in the Units tab.
  const filteredWorkers = useMemo(() => {
    const workerScoped = workers.filter((w) => !w.unitOnly);
    if (!effectiveStageFilter) return workerScoped;
    return workerScoped.filter((w) => w.stage === effectiveStageFilter);
  }, [workers, effectiveStageFilter]);

  const sortedWorkers = useMemo(() => {
    const sorted = [...filteredWorkers].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortBy] ?? "";
      const bv = (b as unknown as Record<string, unknown>)[sortBy] ?? "";
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [filteredWorkers, sortBy, sortDir]);

  // Stage cycle time chart — excludes soaking (wall-clock, not labor time).
  const cycleTimeChartData = useMemo(() =>
    stageCycleTimes
      .filter((s) => s.stage !== "soaking")
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage))
      .map((s) => ({
        name: STAGE_LABELS[s.stage] ?? s.stage,
        stage: s.stage,
        avgMinutes: s.avgMinutes,
        sampleCount: s.sampleCount,
        color: STAGE_COLORS[s.stage] ?? "var(--muted-foreground)",
      })),
    [stageCycleTimes],
  );

  const presetLabel = preset === "today" ? "today" : preset === "week" ? "this week" : preset === "month" ? "this month" : "this quarter";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={TrendingUp}
        title="Production Performance"
      >
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
            <SelectItem value="quarter">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-md" />)}
          </div>
          <Skeleton className="h-14 rounded-md" />
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-72 rounded-md" />
            <Skeleton className="h-72 rounded-md" />
          </div>
          <Skeleton className="h-96 rounded-md" />
        </div>
      ) : (
        <>
          {/* Primary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={Package2}
              label="Completed"
              value={summary.totalCompleted}
              subtitle={presetLabel}
            />
            <KpiCard
              icon={Timer}
              label="Avg workshop time"
              value={formatDuration(summary.avgWorkshopMinutes)}
              subtitle={summary.avgWorkshopMinutes === null ? "No timing data" : "start → completion"}
            />
            <KpiCard
              icon={CalendarClock}
              label="On-time delivery"
              value={summary.onTimePct === null ? "—" : `${summary.onTimePct}%`}
              subtitle={
                summary.onTimePct === null
                  ? "No delivery dates"
                  : summary.avgDaysLate !== null
                  ? `late by ${summary.avgDaysLate}d avg`
                  : "all on time"
              }
            />
            <KpiCard
              icon={ShieldCheck}
              label="First-pass yield"
              value={summary.qcPassRate === null ? "—" : `${summary.qcPassRate}%`}
              subtitle={
                summary.qcPassRate === null
                  ? "No QC data"
                  : summary.qcPassRate >= 90
                  ? "No QC fails, all attempts"
                  : summary.qcPassRate >= 75
                  ? "Watch"
                  : "Needs attention"
              }
            />
          </div>

          {/* Secondary metrics — inline strip, no tile chrome */}
          <div className="bg-card border border-border rounded-md grid grid-cols-2 md:grid-cols-4 overflow-hidden">
            <SecondaryStat
              index={0}
              icon={ThumbsUp}
              label="Customer accept"
              value={summary.acceptRate === null ? "—" : `${summary.acceptRate}%`}
              hint={summary.acceptRate === null ? "no trials" : "at trial / collection"}
            />
            <SecondaryStat
              index={1}
              icon={RotateCcw}
              label="Rework rate"
              value={`${summary.reworkRate}%`}
              hint={`${summary.reworkCount} alteration${summary.reworkCount === 1 ? "" : "s"}`}
            />
            <SecondaryStat
              index={2}
              icon={Recycle}
              label="Redo cost"
              value={redoTotalCost > 0 ? redoTotalCost.toFixed(2) : "—"}
              hint={redoTotalCount > 0 ? `${redoTotalCount} redo${redoTotalCount === 1 ? "" : "s"}` : "no redos"}
            />
            <SecondaryStat
              index={3}
              icon={Rocket}
              label="Express vs reg"
              value={formatDuration(summary.avgWorkshopMinutesExpress)}
              hint={`reg ${formatDuration(summary.avgWorkshopMinutesRegular)}`}
            />
          </div>

          {/* Stage filter — flat row, no card wrapper */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Stage</span>
            <FilterChipGroup>
              <FilterChip
                active={stageFilter === null}
                onClick={() => setStageFilter(null)}
              >
                All stages
              </FilterChip>
              {availableStages.map((stage) => (
                <FilterChip
                  key={stage}
                  active={stageFilter === stage}
                  onClick={() => setStageFilter(stageFilter === stage ? null : stage)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: STAGE_COLORS[stage] }}
                    />
                    {STAGE_LABELS[stage]}
                  </span>
                </FilterChip>
              ))}
            </FilterChipGroup>
            <span className="text-xs text-muted-foreground">
              {tab === "workers" ? "Worker-scoped stages" : "Unit / group-scoped stages"}
            </span>
          </div>

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard
              title="Daily output"
              action={
                summary.dailyTarget > 0 ? (
                  <span className="text-xs text-muted-foreground">Target {summary.dailyTarget}/day</span>
                ) : null
              }
            >
              {daily.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={daily}>
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
                    {summary.dailyTarget > 0 && (
                      <ReferenceLine
                        y={summary.dailyTarget}
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
                      stroke="var(--status-ok)"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: "var(--status-ok)" }}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  Not enough data for trend chart
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Stage cycle time"
              action={<span className="text-xs text-muted-foreground">avg min/piece · soaking excl.</span>}
            >
              {cycleTimeChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={cycleTimeChartData} layout="vertical" barCategoryGap={8} margin={{ right: 40 }}>
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={60} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--border)" }}
                      formatter={(value: ValueType | undefined, _name: NameType | undefined, item: Payload<ValueType, NameType>) => [
                        `${value} min (n=${(item.payload as { sampleCount?: number } | undefined)?.sampleCount ?? 0})`,
                        "Avg time",
                      ]}
                    />
                    <Bar
                      dataKey="avgMinutes"
                      radius={[0, 2, 2, 0]}
                      barSize={12}
                      isAnimationActive={false}
                    >
                      {cycleTimeChartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.color}
                          opacity={effectiveStageFilter && effectiveStageFilter !== entry.stage ? 0.2 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  No cycle time data
                </div>
              )}
            </SectionCard>
          </div>

          {/* Redo impact by responsibility (Q14) */}
          <RedoImpactCard rows={redoRows} isLoading={redoImpact.isLoading} />

          {/* Breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <SlidingPillSwitcher
                value={tab}
                onChange={setTab}
                size="sm"
                options={[
                  { value: "workers", label: "Workers" },
                  { value: "units", label: "Units" },
                ]}
              />
              {tab === "workers" && (
                <div className="relative w-full max-w-[240px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search workers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              )}
            </div>

            {tab === "workers" ? (
              <>
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
                  <p className="text-xs text-muted-foreground px-1">
                    {sortedWorkers.length} worker{sortedWorkers.length !== 1 ? "s" : ""} with activity
                    {effectiveStageFilter && ` in ${STAGE_LABELS[effectiveStageFilter]}`}
                  </p>
                )}
              </>
            ) : (
              <>
                <UnitTable
                  units={filteredUnits}
                  onMemberClick={(name, stage) => navigate({
                    to: "/performance/worker/$workerName",
                    params: { workerName: name },
                    search: { stage, preset },
                  })}
                />
                {filteredUnits.length > 0 && (
                  <p className="text-xs text-muted-foreground px-1">
                    {filteredUnits.length} unit{filteredUnits.length !== 1 ? "s" : ""}
                    {effectiveStageFilter && ` in ${STAGE_LABELS[effectiveStageFilter]}`}
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}

    </div>
  );
}
