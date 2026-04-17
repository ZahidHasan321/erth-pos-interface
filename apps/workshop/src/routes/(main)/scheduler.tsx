import React, { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSchedulerGarments, useBrovaPlans, useWorkshopWorkload } from "@/hooks/useWorkshopGarments";
import { useScheduleGarments } from "@/hooks/useGarmentMutations";
import { useResources } from "@/hooks/useResources";
import { PlanDialog } from "@/components/shared/PlanDialog";
import { ReturnPlanDialog } from "@/components/shared/ReturnPlanDialog";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { StatusPill, type PillColor } from "@/components/shared/StatusPill";
import {
  PageHeader, EmptyState, LoadingSkeleton, GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Checkbox } from "@repo/ui/checkbox";
import { Input } from "@repo/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableContainer } from "@repo/ui/table";
import { PRODUCTION_STAGES } from "@/lib/constants";
import { cn, formatDate, getLocalDateStr, toLocalDateStr, getDeliveryUrgency, TIMEZONE } from "@/lib/utils";
import {
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Package, Home, User, RotateCcw,
  Calendar, BarChart3, Droplets, Zap, Search, Loader2, X,
} from "lucide-react";
import { getAlterationNumber } from "@repo/database";
import type { WorkshopGarment, TripHistoryEntry } from "@repo/database";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/(main)/scheduler")({
  component: SchedulerPage,
  head: () => ({ meta: [{ title: "Scheduler" }] }),
});

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function feedbackInfo(g: WorkshopGarment): { label: string; color: PillColor } | null {
  if (g.acceptance_status && g.feedback_status === "needs_repair")
    return { label: "Fix Needed", color: "amber" };
  if (g.feedback_status === "needs_repair")
    return { label: "Repair", color: "orange" };
  if (g.feedback_status === "needs_redo")
    return { label: "Redo", color: "red" };
  if (g.feedback_status === "accepted" || g.acceptance_status)
    return { label: "Accepted", color: "emerald" };
  return null;
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  count,
  accent,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-base text-foreground">{title}</h2>
        <Badge variant="secondary" className={cn("text-xs", accent)}>
          {count}
        </Badge>
      </div>
      {children}
    </div>
  );
}

// ── Garment-level section table (Express / Brova) ─────────────────────────────

function SchedulerSectionTable({
  garments,
  selectedIds,
  onToggle,
  showType,
  showAlt,
  showFeedback,
  hideExpress,
  disabled,
  lockToOrder,
}: {
  garments: WorkshopGarment[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  showType?: boolean;
  showAlt?: boolean;
  showFeedback?: boolean;
  hideExpress?: boolean;
  disabled?: boolean;
  /** When true, only garments from the same order as any currently selected garment can be selected */
  lockToOrder?: boolean;
}) {
  const allSelected = garments.length > 0 && garments.every((g) => selectedIds.has(g.id));

  // The order that's currently "locked in" (first selected garment's order)
  const lockedOrderId = lockToOrder && selectedIds.size > 0
    ? garments.find((g) => selectedIds.has(g.id))?.order_id ?? null
    : null;

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
            <TableHead className="w-10 px-3">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(c) => { for (const g of garments) onToggle(g.id, !!c); }}
                aria-label="Select all"
                className="size-4"
                disabled={disabled}
              />
            </TableHead>
            <TableHead className="w-[100px]">Garment</TableHead>
            {showType && <TableHead className="w-[80px]">Type</TableHead>}
            {showAlt && <TableHead className="w-[90px]">Alt</TableHead>}
            <TableHead className="w-[170px]">Customer</TableHead>
            <TableHead className="w-[100px]">Order / Invoice</TableHead>
            {showFeedback && <TableHead className="w-[110px]">Feedback</TableHead>}
            <TableHead className="w-[80px]">Brand</TableHead>
            <TableHead className="w-[130px] text-center">Delivery</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {garments.map((g) => {
            const selected = selectedIds.has(g.id);
            const urgency = getDeliveryUrgency(g.delivery_date_order);
            const altNum = showAlt ? getAlterationNumber(g.trip_number ?? 1, g.garment_type) : null;
            const fb = showFeedback ? feedbackInfo(g) : null;
            const rowDisabled = disabled || (lockedOrderId !== null && g.order_id !== lockedOrderId);

            return (
              <TableRow
                key={g.id}
                className={cn(
                  "transition-colors",
                  rowDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-muted/30",
                  selected && "bg-primary/5",
                )}
                onClick={rowDisabled ? undefined : () => onToggle(g.id, !selected)}
              >
                <TableCell className="px-3 py-3">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(c) => onToggle(g.id, !!c)}
                    onClick={(e) => e.stopPropagation()}
                    className="size-4"
                    disabled={rowDisabled}
                  />
                </TableCell>
                <TableCell className="px-3 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-sm font-bold">{g.garment_id ?? g.id.slice(0, 8)}</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {!hideExpress && g.express && <ExpressBadge />}
                      {g.soaking && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full">
                          <Droplets className="w-3 h-3" /> Soak
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                {showType && (
                  <TableCell className="px-3 py-3">
                    <GarmentTypeBadge type={g.garment_type ?? "final"} />
                  </TableCell>
                )}
                {showAlt && (
                  <TableCell className="px-3 py-3">
                    {altNum !== null ? (
                      <Badge className="bg-orange-500 text-white font-semibold text-xs uppercase tracking-wide border-0">
                        Alt {altNum}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="px-3 py-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold">{g.customer_name ?? "—"}</span>
                    {g.customer_mobile && (
                      <span className="text-xs font-mono text-muted-foreground">{g.customer_mobile}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-3 py-3 font-mono">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold">#{g.order_id}</span>
                    {g.invoice_number && (
                      <span className="text-xs text-muted-foreground">INV-{g.invoice_number}</span>
                    )}
                  </div>
                </TableCell>
                {showFeedback && (
                  <TableCell className="px-3 py-3">
                    {fb ? <StatusPill color={fb.color}>{fb.label}</StatusPill> : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                )}
                <TableCell className="px-3 py-3">
                  <BrandBadge brand={g.order_brand} />
                </TableCell>
                <TableCell className="px-3 py-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    {g.delivery_date_order ? (
                      <span className={cn("text-xs font-bold tabular-nums inline-flex items-center gap-1", urgency.text)}>
                        <Clock className="w-3 h-3" />
                        {formatDate(g.delivery_date_order)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {g.home_delivery && (
                      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-violet-600 px-2 py-0.5 rounded-full">
                        <Home className="w-3 h-3" /> Home
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ── Heat-Map Calendar ─────────────────────────────────────────────────────────

function HeatCalendar({
  selected,
  onSelect,
  scheduledDates,
  maxPerDay,
}: {
  selected: string;
  onSelect: (date: string) => void;
  scheduledDates: Record<string, number>;
  maxPerDay: number;
}) {
  const todayStr = getLocalDateStr();
  const [todayY, todayM] = todayStr.split("-").map(Number) as [number, number, number];
  const [viewYM, setViewYM] = useState<{ year: number; month: number }>({ year: todayY, month: todayM - 1 });
  const { year, month } = viewYM;

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = new Date(Date.UTC(year, month, 1, 12)).toLocaleString("default", { timeZone: TIMEZONE, month: "long", year: "numeric" });

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setViewYM({ year: d.getFullYear(), month: d.getMonth() });
  };

  const handleDay = (day: number) => {
    const dateStr = toIsoDate(year, month, day);
    if (dateStr < todayStr) return;
    onSelect(dateStr);
  };

  const heatLevel = (count: number) => {
    if (count === 0 || maxPerDay === 0) return 0;
    const ratio = count / maxPerDay;
    if (ratio >= 1) return 4;
    if (ratio >= 0.7) return 3;
    if (ratio >= 0.4) return 2;
    return 1;
  };

  const HEAT_BG = ["", "bg-emerald-100/70", "bg-amber-100/80", "bg-orange-100/80", "bg-red-100/80"];

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="p-2.5 -m-1 rounded-lg hover:bg-muted active:bg-muted/60 transition-colors touch-manipulation">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-bold text-sm tracking-tight">{monthLabel}</span>
        <button onClick={() => shiftMonth(1)} aria-label="Next month" className="p-2.5 -m-1 rounded-lg hover:bg-muted active:bg-muted/60 transition-colors touch-manipulation">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center mb-0.5">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-[10px] font-bold text-muted-foreground/40 uppercase py-0.5">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const dateStr = toIsoDate(year, month, day);
          const isPast = dateStr < todayStr;
          const isToday = dateStr === todayStr;
          const isSelected = selected === dateStr;
          const count = scheduledDates[dateStr] ?? 0;
          const heat = heatLevel(count);

          return (
            <button
              key={day}
              onClick={() => handleDay(day)}
              disabled={isPast}
              className={cn(
                "relative h-10 rounded-md text-xs font-semibold transition-[color,background-color,border-color,box-shadow] touch-manipulation flex flex-col items-center justify-center",
                isPast && "text-muted-foreground/20 cursor-not-allowed",
                !isPast && !isSelected && "hover:bg-primary/10 pointer-coarse:active:scale-95 cursor-pointer",
                !isPast && !isSelected && HEAT_BG[heat],
                isToday && !isSelected && "ring-2 ring-primary/50 font-black text-primary",
                isSelected && "bg-primary text-primary-foreground shadow-md",
              )}
            >
              <span>{day}</span>
              {count > 0 && !isPast && (
                <span className={cn(
                  "text-[9px] font-bold leading-none tabular-nums",
                  isSelected ? "text-primary-foreground/70"
                    : heat >= 4 ? "text-red-600" : heat >= 3 ? "text-orange-600" : heat >= 2 ? "text-amber-600" : "text-emerald-600",
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2 mt-3 text-[10px] text-muted-foreground/50">
        <span>Light</span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4].map((h) => <div key={h} className={cn("w-3 h-3 rounded-sm", HEAT_BG[h])} />)}
        </div>
        <span>Full</span>
      </div>
    </div>
  );
}

// ── Workload Summary ──────────────────────────────────────────────────────────

const STAGE_ICONS: Record<string, string> = {
  soaking: "💧", cutting: "✂️", post_cutting: "📐",
  sewing: "🧵", finishing: "✨", ironing: "♨️", quality_check: "✅",
};

function WorkloadSummary({
  workload,
  totalForDate,
  multiUnitStages,
}: {
  workload: Record<string, Record<string, { name: string; assigned: number; target: number | null }[]>>;
  totalForDate: number;
  multiUnitStages: Set<string>;
}) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  if (totalForDate === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <BarChart3 className="w-8 h-8 text-muted-foreground/15 mb-2" />
        <p className="text-sm text-muted-foreground/50 font-medium">No garments scheduled</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {PRODUCTION_STAGES.map((stage) => {
        const units = workload[stage];
        if (!units || Object.keys(units).length === 0) return null;

        const allWorkers = Object.entries(units).flatMap(([unit, workers]) => workers.map((w) => ({ ...w, unit })));
        const totalAssigned = allWorkers.reduce((s, w) => s + w.assigned, 0);
        const totalTarget = allWorkers.reduce((s, w) => s + (w.target ?? 0), 0);
        const isOver = totalTarget > 0 && totalAssigned > totalTarget;
        const isExpanded = expandedStage === stage;
        const showUnits = multiUnitStages.has(stage);

        return (
          <div key={stage}>
            <button
              onClick={() => setExpandedStage(isExpanded ? null : stage)}
              className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors", isExpanded ? "bg-muted/60" : "hover:bg-muted/30")}
            >
              <span className="text-sm shrink-0">{STAGE_ICONS[stage] ?? "⚙️"}</span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex-1 truncate">{stage.replace(/_/g, " ")}</span>
              <span className={cn("text-xs font-bold tabular-nums shrink-0", isOver ? "text-red-600" : "text-muted-foreground")}>
                {totalAssigned}/{totalTarget || "—"}
              </span>
              <ChevronDown className={cn("w-3 h-3 text-muted-foreground/30 transition-transform shrink-0", isExpanded && "rotate-180")} />
            </button>

            {isExpanded && (
              <div className="pl-9 pr-3 py-2 space-y-1.5 animate-fade-in">
                {allWorkers.map((w) => {
                  const wOver = w.target ? w.assigned > w.target : false;
                  return (
                    <div key={`${w.unit}::${w.name}`} className="flex items-center gap-2">
                      <User className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                      <span className="text-sm font-medium truncate flex-1">{w.name}</span>
                      {showUnits && (
                        <span className="text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{w.unit}</span>
                      )}
                      <span className={cn("text-sm font-bold tabular-nums", wOver ? "text-red-600" : "text-muted-foreground")}>
                        {w.assigned}{w.target ? `/${w.target}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function SchedulerPage() {
  const { data: schedulable = [], isLoading } = useSchedulerGarments();
  // Workload payload: only rows with assigned_date / production_plan / today's
  // completion. Replaces the old useWorkshopGarments() pull which dragged
  // the entire workshop list (joins, measurements, etc.) just to count plans.
  const { data: allGarments = [] } = useWorkshopWorkload();
  const scheduleMut = useScheduleGarments();

  // ── Data slices ───────────────────────────────────────────────────────────
  // Server guarantees every row is piece_stage=waiting_cut, location=workshop,
  // in_production=true, production_plan=null. So here we only split by trip /
  // garment_type / express / whether the order had a brova.
  const trip1 = useMemo(
    () => schedulable.filter((g) => (g.trip_number ?? 1) === 1),
    [schedulable],
  );
  const returnsGarments = useMemo(
    () => schedulable.filter((g) => (g.trip_number ?? 1) >= 2),
    [schedulable],
  );
  const brovaGarments = useMemo(
    () => trip1.filter((g) => !g.express && g.garment_type === "brova"),
    [trip1],
  );
  const allReleasedFinals = useMemo(
    () => trip1.filter((g) => g.garment_type === "final"),
    [trip1],
  );

  // Any brova currently in the scheduler (express or not) proves the order had a brova.
  const brovaOrderIdSet = useMemo(
    () => new Set(trip1.filter((g) => g.garment_type === "brova").map((g) => g.order_id)),
    [trip1],
  );

  // Brova plan lookup: released finals whose order has no brova currently in the
  // scheduler (either already produced, or the order never had a brova).
  const finalOrderIdsNeedingLookup = useMemo(
    () => [...new Set(allReleasedFinals.map((g) => g.order_id))].filter((id) => !brovaOrderIdSet.has(id)),
    [allReleasedFinals, brovaOrderIdSet],
  );
  const { data: brovaPlansMap = {} } = useBrovaPlans(finalOrderIdsNeedingLookup);

  // Order had a brova if one is in the scheduler now OR a stored brova plan exists.
  const hadBrova = useMemo(
    () => (orderId: number) => brovaOrderIdSet.has(orderId) || !!brovaPlansMap[orderId],
    [brovaOrderIdSet, brovaPlansMap],
  );

  // Express: express brovas + express finals in orders with NO brova (no plan to inherit).
  const expressGarments = useMemo(
    () => trip1.filter((g) => g.express && (g.garment_type === "brova" || !hadBrova(g.order_id))),
    [trip1, hadBrova],
  );
  // Approved Finals: any released final in an order that had brova (express or not).
  const finalsGarments = useMemo(
    () => allReleasedFinals.filter((g) => hadBrova(g.order_id)),
    [allReleasedFinals, hadBrova],
  );
  // Finals: non-express released finals in orders with no brova — manual plan, cross-order OK.
  const directFinalsGarments = useMemo(
    () => allReleasedFinals.filter((g) => !g.express && !hadBrova(g.order_id)),
    [allReleasedFinals, hadBrova],
  );

  // Sort by delivery date, brovas before finals within order
  const groupByOrderSorted = (arr: WorkshopGarment[]): WorkshopGarment[] => {
    const groups = new Map<number, WorkshopGarment[]>();
    for (const g of arr) {
      if (!groups.has(g.order_id)) groups.set(g.order_id, []);
      groups.get(g.order_id)!.push(g);
    }
    return [...groups.values()]
      .sort((a, b) => {
        const da = a[0]?.delivery_date_order, db = b[0]?.delivery_date_order;
        if (da && db) return da.localeCompare(db);
        return da ? -1 : db ? 1 : 0;
      })
      .map((group) =>
        group.sort((a, b) => {
          if (a.garment_type === "brova" && b.garment_type !== "brova") return -1;
          if (a.garment_type !== "brova" && b.garment_type === "brova") return 1;
          return 0;
        }),
      )
      .flat();
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const searchFilter = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return (g: WorkshopGarment) =>
      (g.customer_name ?? "").toLowerCase().includes(q) ||
      String(g.order_id).includes(q) ||
      (g.invoice_number != null && String(g.invoice_number).includes(q)) ||
      (g.customer_mobile ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ||
      (g.garment_id ?? "").toLowerCase().includes(q);
  }, [search]);
  const applySearch = <T extends WorkshopGarment>(arr: T[]) => searchFilter ? arr.filter(searchFilter) : arr;

  const sortedExpress = applySearch(groupByOrderSorted(expressGarments));
  const sortedBrova = applySearch(groupByOrderSorted(brovaGarments));
  const sortedFinals = applySearch(groupByOrderSorted(finalsGarments));
  const sortedDirectFinals = applySearch(groupByOrderSorted(directFinalsGarments));
  const sortedReturns = applySearch(groupByOrderSorted(returnsGarments));

  // ── Selection state ───────────────────────────────────────────────────────
  // New garments (Express + Brova + Direct Finals): no prior plan, cross-order, one shared pool
  // Approved Finals: garment-level, locked to a single order (shares brova plan)
  // Returns: garment-level, independent
  const [selNew, setSelNew] = useState<Set<string>>(new Set());
  const [selFinals, setSelFinals] = useState<Set<string>>(new Set());
  const [selReturns, setSelReturns] = useState<Set<string>>(new Set());

  const toggleGarment =
    (setFn: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (id: string, checked: boolean) =>
      setFn((prev) => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n; });

  // Sections are disabled when another group has an active selection
  const newActive = selNew.size > 0;
  const finalsActive = selFinals.size > 0;
  const returnsActive = selReturns.size > 0;

  const newDisabled = finalsActive || returnsActive;
  const finalsDisabled = newActive || returnsActive;
  const returnsDisabled = newActive || finalsActive;

  const clearAll = () => {
    setSelNew(new Set());
    setSelFinals(new Set());
    setSelReturns(new Set());
  };

  const totalSelected = selNew.size + selFinals.size + selReturns.size;

  const getSelectedGarments = (): WorkshopGarment[] => {
    const ids = new Set([...selNew, ...selFinals, ...selReturns]);
    return schedulable.filter((g) => ids.has(g.id));
  };

  const getSelectedGarmentIds = () => getSelectedGarments().map((g) => g.id);
  const selectedHasSoaking = getSelectedGarments().some((g) => g.soaking);

  const isSchedulingReturns = selReturns.size > 0;

  const getDefaultPlanForSelection = (): Record<string, string> | null => {
    for (const id of selFinals) {
      const g = finalsGarments.find((g) => g.id === id);
      if (g && brovaPlansMap[g.order_id]) return brovaPlansMap[g.order_id];
    }
    for (const g of getSelectedGarments()) {
      if (g.worker_history) return { ...g.worker_history } as Record<string, string>;
    }
    return null;
  };

  const getReturnWorkerHistory = (): Record<string, string> | null => {
    for (const id of selReturns) {
      const g = returnsGarments.find((g) => g.id === id);
      if (g?.worker_history) return g.worker_history as Record<string, string>;
    }
    return null;
  };

  const returnContext = useMemo(() => {
    for (const id of selReturns) {
      const g = returnsGarments.find((g) => g.id === id);
      if (!g) continue;
      return {
        feedbackStatus: g.feedback_status as string | null,
        tripNumber: g.trip_number as number | null,
        notes: g.notes as string | null,
        garmentId: g.id as string,
        tripHistory: g.trip_history as unknown,
      };
    }
    return { feedbackStatus: null, tripNumber: null, notes: null, garmentId: null, tripHistory: null };
  }, [selReturns, returnsGarments]);

  // ── Calendar / workload ───────────────────────────────────────────────────
  const scheduledDates = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of allGarments) {
      if (!g.assigned_date || !g.in_production) continue;
      const dateStr = toLocalDateStr(g.assigned_date);
      if (dateStr) map[dateStr] = (map[dateStr] ?? 0) + 1;
    }
    return map;
  }, [allGarments]);

  const maxPerDay = useMemo(() => {
    const vals = Object.values(scheduledDates);
    return vals.length > 0 ? Math.max(...vals) : 0;
  }, [scheduledDates]);

  const todayStr = getLocalDateStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [planOpen, setPlanOpen] = useState(false);
  const [returnPlanOpen, setReturnPlanOpen] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);

  const { data: resources = [] } = useResources();

  const workload = useMemo(() => {
    const roleToStage: Record<string, string> = {
      cutter: "cutting", post_cutter: "post_cutting", sewer: "sewing",
      finisher: "finishing", ironer: "ironing", quality_checker: "quality_check",
    };

    const workerCounts: Record<string, { assigned: number; target: number | null; stage: string; unit: string }> = {};
    for (const g of allGarments) {
      if (!g.assigned_date || !g.in_production || !g.production_plan) continue;
      const dateStr = toLocalDateStr(g.assigned_date);
      if (dateStr !== selectedDate) continue;
      const plan = g.production_plan as Record<string, string>;
      for (const [role, workerName] of Object.entries(plan)) {
        if (!workerName) continue;
        const stage = roleToStage[role] || role;
        const key = `${stage}::${workerName}`;
        if (!workerCounts[key]) {
          const res = resources.find(r => r.resource_name === workerName && r.responsibility === stage);
          workerCounts[key] = { assigned: 0, target: res?.daily_target ?? null, stage, unit: res?.unit ?? "Unassigned" };
        }
        workerCounts[key].assigned++;
      }
    }

    const byStage: Record<string, Record<string, { name: string; assigned: number; target: number | null }[]>> = {};
    for (const [key, data] of Object.entries(workerCounts)) {
      const [stage, name] = key.split("::");
      if (!byStage[stage]) byStage[stage] = {};
      if (!byStage[stage][data.unit]) byStage[stage][data.unit] = [];
      byStage[stage][data.unit].push({ name, assigned: data.assigned, target: data.target });
    }
    for (const stage of Object.keys(byStage))
      for (const unit of Object.keys(byStage[stage]))
        byStage[stage][unit].sort((a, b) => b.assigned - a.assigned);

    return byStage;
  }, [allGarments, selectedDate, resources]);

  const totalForDate = scheduledDates[selectedDate] ?? 0;

  const multiUnitStages = useMemo(() => {
    const unitsByStage = new Map<string, Set<string>>();
    for (const r of resources) {
      if (!r.responsibility || !r.unit) continue;
      if (!unitsByStage.has(r.responsibility)) unitsByStage.set(r.responsibility, new Set());
      unitsByStage.get(r.responsibility)!.add(r.unit);
    }
    const result = new Set<string>();
    for (const [stage, units] of unitsByStage)
      if (units.size > 1) result.add(stage);
    return result;
  }, [resources]);

  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + "T12:00:00+03:00").toLocaleDateString("default", { timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric" })
    : "—";

  const handleSchedule = async (plan: Record<string, string>, date: string, _unit?: string, reentryStage?: string) => {
    const selected = getSelectedGarments();
    const soakingIds = selected.filter((g) => g.soaking).map((g) => g.id);
    const nonSoakingIds = selected.filter((g) => !g.soaking).map((g) => g.id);
    await scheduleMut.mutateAsync({ ids: selected.map((g) => g.id), soakingIds, nonSoakingIds, plan, date, reentryStage: reentryStage as any });
    clearAll();
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-24 lg:pb-10">
      <PageHeader
        icon={CalendarDays}
        title="Scheduler"
        subtitle={`${schedulable.length} garment${schedulable.length !== 1 ? "s" : ""} awaiting production plans`}
      />

      {/* ── Tablet/phone: calendar + workload on top ── */}
      <div className="lg:hidden mb-3">
        <div className="bg-card border rounded-xl shadow-sm p-3">
          <div className="flex gap-3">
            <div className="w-[280px] shrink-0">
              <HeatCalendar selected={selectedDate} onSelect={setSelectedDate} scheduledDates={scheduledDates} maxPerDay={maxPerDay} />
            </div>
            <div className="hidden sm:block flex-1 min-w-0 border-l pl-3">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold">{selectedDateLabel}</span>
                {totalForDate > 0 && <span className="text-xs text-muted-foreground tabular-nums ml-auto">{totalForDate}</span>}
              </div>
              <div className="max-h-[220px] overflow-y-auto">
                <WorkloadSummary workload={workload} totalForDate={totalForDate} multiUnitStages={multiUnitStages} />
              </div>
            </div>
          </div>
          <div className="sm:hidden border-t mt-2 pt-2">
            <button onClick={() => setShowMobilePanel(!showMobilePanel)} className="w-full flex items-center justify-between text-left touch-manipulation">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold">{selectedDateLabel}</span>
                {totalForDate > 0 && <span className="text-xs text-muted-foreground tabular-nums">· {totalForDate} scheduled</span>}
              </div>
              <ChevronDown className={cn("w-3 h-3 text-muted-foreground/50 transition-transform", showMobilePanel && "rotate-180")} />
            </button>
            {showMobilePanel && (
              <div className="mt-2 animate-fade-in">
                <WorkloadSummary workload={workload} totalForDate={totalForDate} multiUnitStages={multiUnitStages} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Layout: single col (tablet/phone) | 2col desktop ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_560px] gap-4 items-start">

        {/* ── Col 1: Sections ── */}
        <div className="space-y-8 min-w-0">

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Customer, order #, invoice, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {/* ── EXPRESS ── */}
              <Section title="Express" icon={Zap} count={sortedExpress.length} accent="bg-orange-100 text-orange-700">
                {sortedExpress.length === 0 ? (
                  <EmptyState icon={Zap} message="No express garments to schedule" />
                ) : (
                  <SchedulerSectionTable
                    garments={sortedExpress}
                    selectedIds={selNew}
                    onToggle={toggleGarment(setSelNew)}
                    showType
                    hideExpress
                    disabled={newDisabled}
                  />
                )}
              </Section>

              {/* ── BROVA ── */}
              <Section title="Brova" icon={Package} count={sortedBrova.length} accent="bg-amber-100 text-amber-700">
                {sortedBrova.length === 0 ? (
                  <EmptyState icon={Package} message="No brova garments to schedule" />
                ) : (
                  <SchedulerSectionTable
                    garments={sortedBrova}
                    selectedIds={selNew}
                    onToggle={toggleGarment(setSelNew)}
                    disabled={newDisabled}
                  />
                )}
              </Section>

              {/* ── FINALS (no brova — manual plan, cross-order OK) ── */}
              {sortedDirectFinals.length > 0 && (
                <Section title="Finals" icon={Package} count={sortedDirectFinals.length} accent="bg-blue-100 text-blue-700">
                  <SchedulerSectionTable
                    garments={sortedDirectFinals}
                    selectedIds={selNew}
                    onToggle={toggleGarment(setSelNew)}
                    disabled={newDisabled}
                  />
                </Section>
              )}

              {/* ── APPROVED FINALS (garment-level, locked to single order — shares brova plan) ── */}
              <Section title="Approved Finals" icon={Package} count={sortedFinals.length} accent="bg-emerald-100 text-emerald-700">
                {sortedFinals.length === 0 ? (
                  <EmptyState icon={Package} message="No approved finals to schedule" />
                ) : (
                  <SchedulerSectionTable
                    garments={sortedFinals}
                    selectedIds={selFinals}
                    onToggle={toggleGarment(setSelFinals)}
                    disabled={finalsDisabled}
                    lockToOrder
                  />
                )}
              </Section>

              {/* ── RETURNS (garment-level) ── */}
              <Section title="Returns" icon={RotateCcw} count={sortedReturns.length} accent="bg-purple-100 text-purple-700">
                {sortedReturns.length === 0 ? (
                  <EmptyState icon={RotateCcw} message="No returns to schedule" />
                ) : (
                  <SchedulerSectionTable
                    garments={sortedReturns}
                    selectedIds={selReturns}
                    onToggle={toggleGarment(setSelReturns)}
                    showType
                    showAlt
                    showFeedback
                    disabled={returnsDisabled}
                    lockToOrder
                  />
                )}
              </Section>
            </>
          )}
        </div>

        {/* ── Col 2: Calendar + workload (desktop only) ── */}
        <div className="hidden lg:block lg:sticky lg:top-4">
          <div className="bg-card border rounded-xl shadow-sm p-3 xl:p-4">
            <div className="flex flex-col xl:flex-row xl:gap-4">
              <div className="xl:w-[300px] xl:shrink-0 max-w-[320px]">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Schedule Date</span>
                </div>
                <HeatCalendar selected={selectedDate} onSelect={setSelectedDate} scheduledDates={scheduledDates} maxPerDay={maxPerDay} />
              </div>
              <div className="border-t xl:border-t-0 xl:border-l mt-3 pt-3 xl:mt-0 xl:pt-0 xl:pl-4 xl:flex-1 xl:min-w-[180px]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-bold">{selectedDateLabel}</span>
                  </div>
                  {totalForDate > 0 && <span className="text-xs font-bold text-muted-foreground tabular-nums">{totalForDate}</span>}
                </div>
                <div className="max-h-[260px] overflow-y-auto">
                  <WorkloadSummary workload={workload} totalForDate={totalForDate} multiUnitStages={multiUnitStages} />
                </div>
              </div>
            </div>

            <div className="border-t mt-3 pt-3">
              {totalSelected > 0 ? (
                <p className="text-sm font-semibold mb-2">
                  {getSelectedGarmentIds().length} garment{getSelectedGarmentIds().length !== 1 ? "s" : ""}
                  <span className="text-muted-foreground font-normal text-xs"> selected</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mb-2">Select garments to schedule</p>
              )}
              <Button
                className="w-full h-9 font-bold text-sm"
                disabled={totalSelected === 0 || !selectedDate || scheduleMut.isPending}
                onClick={() => isSchedulingReturns ? setReturnPlanOpen(true) : setPlanOpen(true)}
              >
                {scheduleMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                {scheduleMut.isPending ? "Scheduling…" : "Create Plan"}
              </Button>
            </div>
          </div>
        </div>

      </div>

      {/* Mobile batch action bar */}
      <BatchActionBar count={totalSelected} onClear={clearAll}>
        <span className="text-xs opacity-70 hidden sm:inline">{selectedDateLabel}</span>
        <Button
          size="sm"
          disabled={!selectedDate || scheduleMut.isPending}
          onClick={() => isSchedulingReturns ? setReturnPlanOpen(true) : setPlanOpen(true)}
        >
          {scheduleMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
          Create Plan ({getSelectedGarmentIds().length})
        </Button>
      </BatchActionBar>

      <PlanDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        onConfirm={handleSchedule}
        garmentCount={getSelectedGarmentIds().length}
        defaultDate={selectedDate}
        isAlteration={false}
        defaultPlan={getDefaultPlanForSelection()}
        hasSoaking={selectedHasSoaking}
        isPending={scheduleMut.isPending}
      />

      <ReturnPlanDialog
        open={returnPlanOpen}
        onOpenChange={setReturnPlanOpen}
        onConfirm={handleSchedule}
        garmentCount={getSelectedGarmentIds().length}
        defaultDate={selectedDate}
        workerHistory={getReturnWorkerHistory()}
        feedbackStatus={returnContext.feedbackStatus}
        tripNumber={returnContext.tripNumber}
        feedbackNotes={returnContext.notes}
        garmentId={selReturns.size === 1 ? returnContext.garmentId : null}
        tripHistory={selReturns.size === 1 ? (returnContext.tripHistory as TripHistoryEntry[] | string | null) : null}
        isPending={scheduleMut.isPending}
      />
    </div>
  );
}
