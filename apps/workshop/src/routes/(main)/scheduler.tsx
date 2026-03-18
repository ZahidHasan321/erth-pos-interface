import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSchedulerGarments, useBrovaPlans, useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useScheduleGarments } from "@/hooks/useGarmentMutations";
import { useResources } from "@/hooks/useResources";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { PlanDialog } from "@/components/shared/PlanDialog";
import { ReturnPlanDialog } from "@/components/shared/ReturnPlanDialog";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import {
  PageHeader, StatsCard, EmptyState, LoadingSkeleton,
  GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PRODUCTION_STAGES } from "@/lib/constants";
import { cn, clickableProps, formatDate, getLocalDateStr, toLocalDateStr, groupByOrder, garmentSummary, type OrderGroup } from "@/lib/utils";
import { toast } from "sonner";
import {
  CalendarDays, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Clock, Package, CheckSquare, Home, User, Zap, AlertTriangle, Eye,
  Calendar, BarChart3,
} from "lucide-react";
import { OrderPeekSheet } from "@/components/shared/PeekSheets";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/scheduler")({
  component: SchedulerPage,
  head: () => ({ meta: [{ title: "Scheduler" }] }),
});

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── OrderCard (order-level selection) ────────────────────────────────────────

function SchedulerOrderCard({
  group,
  selected,
  onToggle,
}: {
  group: OrderGroup;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const deliveryDate = group.garments[0]?.delivery_date_order;
  const hasBrova = group.garments.some((g) => g.garment_type === "brova");
  const daysLeft = deliveryDate
    ? Math.ceil((new Date(deliveryDate).getTime() - Date.now()) / 86400000)
    : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isUrgent = daysLeft !== null && daysLeft <= 2 && !isOverdue;

  return (
    <>
    <div
      className={cn(
        "bg-white border rounded-xl transition-[color,background-color,border-color,box-shadow] shadow-sm border-l-4",
        group.express ? "border-l-orange-400 ring-1 ring-orange-200" : "border-l-border",
        selected && "border-primary ring-2 ring-primary/20 bg-primary/5",
      )}
    >
      <div
        className="px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-xl"
        onClick={() => onToggle(!selected)}
        {...clickableProps(() => onToggle(!selected))}
      >
        {/* Row 1: Identity + actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => { e.stopPropagation(); onToggle(e.target.checked); }}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select order #${group.order_id}`}
              className="w-4 h-4 accent-primary cursor-pointer shrink-0"
            />
            <span className="font-mono font-bold text-lg shrink-0">#{group.order_id}</span>
            {group.invoice_number && (
              <span className="text-sm text-muted-foreground/50 font-mono shrink-0">· #{group.invoice_number}</span>
            )}
            <GarmentTypeBadge type={hasBrova ? "brova" : "final"} />
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
            <span className="text-base text-muted-foreground truncate">{group.customer_name ?? "—"}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); setPeekOpen(true); }} aria-label="View order details" className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground/50 hover:text-foreground">
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              className={cn("p-1.5 rounded-md transition-colors", expanded ? "bg-muted" : "text-muted-foreground/50")}
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse garments" : "Expand garments"}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Row 2: Status (left) + Logistics (right) */}
        <div className="flex items-center justify-between gap-3 mt-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-sm text-muted-foreground/60">{garmentSummary(group.garments)}</span>
            {group.express && <ExpressBadge />}
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {group.home_delivery && (
              <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-semibold">
                <Home className="w-3 h-3" /> Delivery
              </span>
            )}
            {deliveryDate && (
              <span className={cn(
                "inline-flex items-center gap-1 text-sm font-bold tabular-nums px-2 py-0.5 rounded-md",
                isOverdue && "bg-red-100 text-red-800",
                isUrgent && "bg-amber-100 text-amber-800",
                !isUrgent && !isOverdue && "text-muted-foreground",
              )}>
                <Clock className="w-3 h-3" /> {formatDate(deliveryDate)}
              </span>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-2.5 space-y-1.5 bg-muted/20">
          {group.garments.map((g) => {
            const isParked = g.piece_stage === "waiting_for_acceptance";
            return (
              <div key={g.id} className={cn(
                "flex items-center gap-2 rounded-lg border p-2",
                isParked ? "bg-zinc-50 opacity-60" : "bg-white",
              )}>
                <GarmentTypeBadge type={g.garment_type ?? "final"} />
                <span className="font-mono text-xs font-bold">{g.garment_id ?? g.id.slice(0, 8)}</span>
                {g.express && <ExpressBadge />}
                {isParked && (
                  <span className="text-xs text-muted-foreground italic">parked — will get same plan</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    <OrderPeekSheet orderId={peekOpen ? group.order_id : null} open={peekOpen} onOpenChange={setPeekOpen} />
    </>
  );
}

// ── Heat-Map Calendar ────────────────────────────────────────────────────────

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
  const todayObj = new Date();
  todayObj.setHours(0, 0, 0, 0);

  const [viewDate, setViewDate] = useState(() => new Date(todayObj));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = viewDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const selectedObj = selected ? new Date(selected + "T00:00:00") : null;

  const handleDay = (day: number) => {
    const d = new Date(year, month, day);
    if (d < todayObj) return;
    onSelect(toIsoDate(year, month, day));
  };

  /** Returns a heat level 0-4 for a count relative to max */
  const heatLevel = (count: number) => {
    if (count === 0 || maxPerDay === 0) return 0;
    const ratio = count / maxPerDay;
    if (ratio >= 1) return 4;
    if (ratio >= 0.7) return 3;
    if (ratio >= 0.4) return 2;
    return 1;
  };

  const HEAT_BG = [
    "", // 0 = none
    "bg-emerald-100/70",
    "bg-amber-100/80",
    "bg-orange-100/80",
    "bg-red-100/80",
  ];

  return (
    <div className="select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <span className="font-bold text-sm tracking-tight">{monthLabel}</span>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1.5 text-center mb-2">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const d = new Date(year, month, day);
          const dateStr = toIsoDate(year, month, day);
          const isPast = d < todayObj;
          const isToday = d.getTime() === todayObj.getTime();
          const isSelected = selectedObj && d.getTime() === selectedObj.getTime();
          const count = scheduledDates[dateStr] ?? 0;
          const heat = heatLevel(count);

          return (
            <button
              key={day}
              onClick={() => handleDay(day)}
              disabled={isPast}
              className={cn(
                "relative aspect-square rounded-lg text-xs font-semibold transition-[color,background-color,border-color,box-shadow]",
                "flex flex-col items-center justify-center gap-0.5",
                isPast && "text-muted-foreground/20 cursor-not-allowed",
                !isPast && !isSelected && "hover:ring-2 hover:ring-primary/30 cursor-pointer",
                !isPast && !isSelected && HEAT_BG[heat],
                isToday && !isSelected && "ring-2 ring-primary/50 font-black text-primary",
                isSelected && "bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/40 scale-105",
              )}
            >
              <span>{day}</span>
              {/* Garment count */}
              {count > 0 && !isPast && (
                <span className={cn(
                  "text-[9px] font-bold leading-none tabular-nums",
                  isSelected
                    ? "text-primary-foreground/70"
                    : heat >= 4 ? "text-red-600" : heat >= 3 ? "text-orange-600" : heat >= 2 ? "text-amber-600" : "text-emerald-600",
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Heat legend */}
      <div className="flex items-center justify-center gap-2 mt-4 text-[10px] text-muted-foreground/50">
        <span>Light</span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4].map((h) => (
            <div key={h} className={cn("w-3 h-3 rounded-sm", HEAT_BG[h])} />
          ))}
        </div>
        <span>Full</span>
      </div>
    </div>
  );
}

// ── Workload Summary ─────────────────────────────────────────────────────────

const STAGE_ICONS: Record<string, string> = {
  soaking: "💧",
  cutting: "✂️",
  post_cutting: "📐",
  sewing: "🧵",
  finishing: "✨",
  ironing: "♨️",
  quality_check: "✅",
};

function WorkloadSummary({
  workload,
  totalForDate,
  multiUnitStages,
}: {
  workload: Record<string, Record<string, { name: string; assigned: number; target: number | null }[]>>;
  totalForDate: number;
  /** Stages where the responsibility has resources across multiple units */
  multiUnitStages: Set<string>;
}) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  if (totalForDate === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <BarChart3 className="w-8 h-8 text-muted-foreground/15 mb-2" />
        <p className="text-sm text-muted-foreground/50 font-medium">
          No garments scheduled
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {PRODUCTION_STAGES.map((stage) => {
        const units = workload[stage];
        if (!units || Object.keys(units).length === 0) return null;

        const allWorkers = Object.entries(units).flatMap(([unit, workers]) =>
          workers.map((w) => ({ ...w, unit })),
        );
        const totalAssigned = allWorkers.reduce((s, w) => s + w.assigned, 0);
        const totalTarget = allWorkers.reduce((s, w) => s + (w.target ?? 0), 0);
        const isOver = totalTarget > 0 && totalAssigned > totalTarget;
        const isExpanded = expandedStage === stage;
        const showUnits = multiUnitStages.has(stage);

        const stageLabel = stage.replace(/_/g, " ");

        return (
          <div key={stage}>
            <button
              onClick={() => setExpandedStage(isExpanded ? null : stage)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors",
                isExpanded ? "bg-muted/60" : "hover:bg-muted/30",
              )}
            >
              <span className="text-sm shrink-0" aria-hidden>{STAGE_ICONS[stage] ?? "⚙️"}</span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex-1 truncate">
                {stageLabel}
              </span>
              <span className={cn(
                "text-xs font-bold tabular-nums shrink-0 text-right",
                isOver ? "text-red-600" : "text-muted-foreground",
              )}>
                {totalAssigned}/{totalTarget || "—"}
              </span>
              <ChevronDown className={cn("w-3 h-3 text-muted-foreground/30 transition-transform shrink-0", isExpanded && "rotate-180")} />
            </button>

            {/* Workers — expanded on click */}
            {isExpanded && (
              <div className="pl-9 pr-3 py-2 space-y-1.5 animate-fade-in">
                {allWorkers.map((w) => {
                  const wOver = w.target ? w.assigned > w.target : false;
                  return (
                    <div key={`${w.unit}::${w.name}`} className="flex items-center gap-2">
                      <User className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                      <span className="text-sm font-medium truncate flex-1">{w.name}</span>
                      {showUnits && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                          {w.unit}
                        </span>
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

// ── Page ─────────────────────────────────────────────────────────────────────

function SchedulerPage() {
  const { data: schedulable = [], isLoading } = useSchedulerGarments();
  const { data: allGarments = [] } = useWorkshopGarments();
  const scheduleMut = useScheduleGarments();

  // Split by tab logic
  const firstTrip = schedulable.filter(
    (g) => !g.trip_number || g.trip_number === 1,
  );

  const schedulableOrderIds = new Set(firstTrip.map((g) => g.order_id));
  const waitingFinals = allGarments.filter(
    (g) =>
      schedulableOrderIds.has(g.order_id) &&
      g.piece_stage === "waiting_for_acceptance" &&
      g.garment_type === "final",
  );
  const orders = groupByOrder([...firstTrip, ...waitingFinals]);

  const brovaReturns = schedulable.filter(
    (g) =>
      g.garment_type === "brova" &&
      (g.trip_number === 2 || g.trip_number === 3),
  );

  const alterationIn = schedulable.filter(
    (g) =>
      ((g.trip_number ?? 0) >= 4 && g.garment_type === "brova") ||
      ((g.trip_number ?? 0) >= 2 && g.garment_type === "final"),
  );

  const finalOnlyOrderIds = orders
    .filter((o) => o.garments.every((g) => g.garment_type === "final"))
    .map((o) => o.order_id);
  const { data: brovaPlansMap = {} } = useBrovaPlans(finalOnlyOrderIds);

  // Compute scheduled garments per date (for calendar heat)
  const scheduledDates = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of allGarments) {
      if (!g.assigned_date || !g.in_production) continue;
      const dateStr = toLocalDateStr(g.assigned_date);
      if (dateStr) map[dateStr] = (map[dateStr] ?? 0) + 1;
    }
    return map;
  }, [allGarments]);

  // Max per day — for heat scaling
  const maxPerDay = useMemo(() => {
    const vals = Object.values(scheduledDates);
    return vals.length > 0 ? Math.max(...vals) : 0;
  }, [scheduledDates]);

  const todayStr = getLocalDateStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [planOpen, setPlanOpen] = useState(false);
  const [returnPlanOpen, setReturnPlanOpen] = useState(false);

  const { data: resources = [] } = useResources();

  // Compute per-worker workload for selected date, grouped by stage → unit
  const workload = useMemo(() => {
    const roleToStage: Record<string, string> = {
      cutter: "cutting",
      post_cutter: "post_cutting",
      sewer: "sewing",
      finisher: "finishing",
      ironer: "ironing",
      quality_checker: "quality_check",
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

    for (const stage of Object.keys(byStage)) {
      for (const unit of Object.keys(byStage[stage])) {
        byStage[stage][unit].sort((a, b) => b.assigned - a.assigned);
      }
    }

    return byStage;
  }, [allGarments, selectedDate, resources]);

  const totalForDate = scheduledDates[selectedDate] ?? 0;

  // Stages where the responsibility has resources in more than one unit
  const multiUnitStages = useMemo(() => {
    const unitsByStage = new Map<string, Set<string>>();
    for (const r of resources) {
      if (!r.responsibility || !r.unit) continue;
      if (!unitsByStage.has(r.responsibility)) unitsByStage.set(r.responsibility, new Set());
      unitsByStage.get(r.responsibility)!.add(r.unit);
    }
    const result = new Set<string>();
    for (const [stage, units] of unitsByStage) {
      if (units.size > 1) result.add(stage);
    }
    return result;
  }, [resources]);

  // Selection state
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [selectedBrovaReturnIds, setSelectedBrovaReturnIds] = useState<Set<string>>(new Set());
  const [selectedAltInIds, setSelectedAltInIds] = useState<Set<string>>(new Set());

  const toggleOrderInSet = (
    setFn: React.Dispatch<React.SetStateAction<Set<number>>>,
    orderId: number,
    checked: boolean,
  ) =>
    setFn((prev) => {
      const n = new Set(prev);
      checked ? n.add(orderId) : n.delete(orderId);
      return n;
    });

  const toggleGarmentInSet = (
    setFn: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
    checked: boolean,
  ) =>
    setFn((prev) => {
      const n = new Set(prev);
      checked ? n.add(id) : n.delete(id);
      return n;
    });

  const selectAllOrders = () => setSelectedOrderIds(new Set(orders.map((o) => o.order_id)));
  const selectAllBrovaReturns = () => setSelectedBrovaReturnIds(new Set(brovaReturns.map((g) => g.id)));
  const selectAllAltIn = () => setSelectedAltInIds(new Set(alterationIn.map((g) => g.id)));

  const getSelectedGarments = (): WorkshopGarment[] => {
    const selected: WorkshopGarment[] = [];
    for (const og of orders) {
      if (selectedOrderIds.has(og.order_id)) {
        selected.push(...og.garments.filter((g) => g.piece_stage !== "waiting_for_acceptance"));
      }
    }
    for (const id of selectedBrovaReturnIds) {
      const g = brovaReturns.find((g) => g.id === id);
      if (g) selected.push(g);
    }
    for (const id of selectedAltInIds) {
      const g = alterationIn.find((g) => g.id === id);
      if (g) selected.push(g);
    }
    return selected;
  };

  const getSelectedGarmentIds = (): string[] => getSelectedGarments().map((g) => g.id);
  const selectedHasSoaking = getSelectedGarments().some((g) => g.soaking);

  const totalSelected =
    selectedOrderIds.size + selectedBrovaReturnIds.size + selectedAltInIds.size;

  const isSchedulingReturns =
    (selectedBrovaReturnIds.size > 0 || selectedAltInIds.size > 0) &&
    selectedOrderIds.size === 0;

  const getDefaultPlanForSelection = (): Record<string, string> | null => {
    if (selectedOrderIds.size > 0) {
      for (const orderId of selectedOrderIds) {
        if (brovaPlansMap[orderId]) return brovaPlansMap[orderId];
      }
    }
    if (selectedBrovaReturnIds.size > 0) {
      for (const id of selectedBrovaReturnIds) {
        const g = brovaReturns.find((g) => g.id === id);
        if (g?.worker_history) return { ...g.worker_history } as Record<string, string>;
      }
    }
    if (selectedAltInIds.size > 0) {
      for (const id of selectedAltInIds) {
        const g = alterationIn.find((g) => g.id === id);
        if (g?.worker_history) return { ...g.worker_history } as Record<string, string>;
      }
    }
    return null;
  };

  const getReturnWorkerHistory = (): Record<string, string> | null => {
    if (selectedBrovaReturnIds.size > 0) {
      for (const id of selectedBrovaReturnIds) {
        const g = brovaReturns.find((g) => g.id === id);
        if (g?.worker_history) return g.worker_history as Record<string, string>;
      }
    }
    if (selectedAltInIds.size > 0) {
      for (const id of selectedAltInIds) {
        const g = alterationIn.find((g) => g.id === id);
        if (g?.worker_history) return g.worker_history as Record<string, string>;
      }
    }
    return null;
  };

  const handleSchedule = async (plan: Record<string, string>, date: string, _unit?: string, reentryStage?: string) => {
    const selected = getSelectedGarments();
    const soakingIds = selected.filter((g) => g.soaking).map((g) => g.id);
    const nonSoakingIds = selected.filter((g) => !g.soaking).map((g) => g.id);
    await scheduleMut.mutateAsync({ ids: selected.map((g) => g.id), soakingIds, nonSoakingIds, plan, date, reentryStage: reentryStage as any });
    toast.success(`${selected.length} garment(s) scheduled`);
    setSelectedOrderIds(new Set());
    setSelectedBrovaReturnIds(new Set());
    setSelectedAltInIds(new Set());
  };

  const expressCount = orders.filter((o) => o.express).length;
  const [activeTab, setActiveTab] = useState("orders");

  // Mobile: toggle control panel visibility
  const [showMobilePanel, setShowMobilePanel] = useState(false);

  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("default", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-24 lg:pb-10">
      <PageHeader
        icon={CalendarDays}
        title="Scheduler"
        subtitle={`${schedulable.length} garment${schedulable.length !== 1 ? "s" : ""} awaiting production plans`}
      />

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
        <StatsCard icon={Package} value={orders.length} label="Orders" color="blue" />
        <StatsCard icon={Package} value={brovaReturns.length} label="Brova Returns" color="purple" dimOnZero />
        <StatsCard icon={AlertTriangle} value={alterationIn.length} label="Alteration (In)" color="orange" dimOnZero />
        <StatsCard icon={Zap} value={expressCount} label="Express" color="red" dimOnZero />
      </div>

      {/* ── Mobile: date & panel toggle ── */}
      <div className="lg:hidden mb-4">
        <button
          onClick={() => setShowMobilePanel(!showMobilePanel)}
          className={cn(
            "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border bg-white shadow-sm transition-colors",
            showMobilePanel && "ring-2 ring-primary/20",
          )}
        >
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">{selectedDateLabel}</span>
            {totalForDate > 0 && (
              <Badge variant="secondary" className="text-xs font-bold">{totalForDate} scheduled</Badge>
            )}
          </div>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showMobilePanel && "rotate-180")} />
        </button>

        {showMobilePanel && (
          <div className="mt-3 bg-white border rounded-xl shadow-sm p-4 animate-fade-in space-y-4">
            <HeatCalendar
              selected={selectedDate}
              onSelect={setSelectedDate}
              scheduledDates={scheduledDates}
              maxPerDay={maxPerDay}
            />
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold">{selectedDateLabel}</span>
                </div>
                {totalForDate > 0 && (
                  <Badge variant="secondary" className="text-xs font-bold">{totalForDate} garments</Badge>
                )}
              </div>
              <WorkloadSummary workload={workload} totalForDate={totalForDate} multiUnitStages={multiUnitStages} />
            </div>
          </div>
        )}
      </div>

      {/* ── 3-column layout: orders | calendar | workload ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px_280px] gap-5 items-start">

        {/* ── Col 1: Tabs + order list ── */}
        <div className="min-w-0">
          <Tabs defaultValue="orders" value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between mb-4">
              <TabsList className="h-auto flex-wrap gap-1">
                <TabsTrigger value="orders">
                  Orders{" "}
                  <Badge variant="secondary" className="ml-1 text-xs bg-blue-100 text-blue-700">
                    {orders.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="brova">
                  Brova{" "}
                  <Badge variant="secondary" className="ml-1 text-xs bg-purple-100 text-purple-700">
                    {brovaReturns.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="alteration-in">
                  Alteration (In){" "}
                  <Badge variant="secondary" className="ml-1 text-xs bg-orange-100 text-orange-700">
                    {alterationIn.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="alteration-out" disabled>
                  Alteration (Out)
                </TabsTrigger>
              </TabsList>

              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 shrink-0"
                onClick={() => {
                  if (activeTab === "orders") selectAllOrders();
                  else if (activeTab === "brova") selectAllBrovaReturns();
                  else if (activeTab === "alteration-in") selectAllAltIn();
                }}
              >
                <CheckSquare className="w-3 h-3 mr-1" />
                Select All
              </Button>
            </div>

            <TabsContent value="orders">
              {isLoading ? (
                <LoadingSkeleton />
              ) : orders.length === 0 ? (
                <EmptyState icon={CalendarDays} message="No orders to schedule" />
              ) : (
                <div className="space-y-2">
                  {orders.map((group) => (
                    <SchedulerOrderCard
                      key={group.order_id}
                      group={group}
                      selected={selectedOrderIds.has(group.order_id)}
                      onToggle={(checked) =>
                        toggleOrderInSet(setSelectedOrderIds, group.order_id, checked)
                      }
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="brova">
              {isLoading ? (
                <LoadingSkeleton />
              ) : brovaReturns.length === 0 ? (
                <EmptyState icon={Package} message="No brova returns to schedule" />
              ) : (
                <div className="space-y-2">
                  {brovaReturns.map((g, i) => (
                    <GarmentCard
                      key={g.id}
                      garment={g}
                      selected={selectedBrovaReturnIds.has(g.id)}
                      onSelect={(id, checked) => toggleGarmentInSet(setSelectedBrovaReturnIds, id, checked)}
                      showPipeline={false}
                      hideStage
                      index={i}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="alteration-in">
              {isLoading ? (
                <LoadingSkeleton />
              ) : alterationIn.length === 0 ? (
                <EmptyState icon={AlertTriangle} message="No alterations to schedule" />
              ) : (
                <div className="space-y-2">
                  {alterationIn.map((g, i) => (
                    <GarmentCard
                      key={g.id}
                      garment={g}
                      selected={selectedAltInIds.has(g.id)}
                      onSelect={(id, checked) => toggleGarmentInSet(setSelectedAltInIds, id, checked)}
                      showPipeline={false}
                      hideStage
                      index={i}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="alteration-out">
              <EmptyState message="Coming soon — externally-made dishdashas" />
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Col 2: Calendar (sticky, compact) ── */}
        <div className="hidden lg:block lg:sticky lg:top-6">
          <div className="bg-white border rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Schedule Date</span>
            </div>
            <HeatCalendar
              selected={selectedDate}
              onSelect={setSelectedDate}
              scheduledDates={scheduledDates}
              maxPerDay={maxPerDay}
            />

            {/* Action — sits below calendar */}
            <div className="border-t mt-4 pt-4">
              {totalSelected > 0 ? (
                <div className="mb-2.5">
                  <p className="text-sm font-semibold">
                    {getSelectedGarmentIds().length} garment{getSelectedGarmentIds().length !== 1 ? "s" : ""}
                    <span className="text-muted-foreground font-normal text-xs">
                      {" "}from{" "}
                      {[
                        selectedOrderIds.size > 0 && `${selectedOrderIds.size} order${selectedOrderIds.size !== 1 ? "s" : ""}`,
                        selectedBrovaReturnIds.size > 0 && `${selectedBrovaReturnIds.size} return${selectedBrovaReturnIds.size !== 1 ? "s" : ""}`,
                        selectedAltInIds.size > 0 && `${selectedAltInIds.size} alt${selectedAltInIds.size !== 1 ? "s" : ""}`,
                      ].filter(Boolean).join(", ")}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mb-2.5">Select orders to schedule</p>
              )}
              <Button
                className="w-full h-9 font-bold text-sm"
                disabled={totalSelected === 0 || !selectedDate || scheduleMut.isPending}
                onClick={() => isSchedulingReturns ? setReturnPlanOpen(true) : setPlanOpen(true)}
              >
                Create Plan
              </Button>
            </div>
          </div>
        </div>

        {/* ── Col 3: Workload for selected date ── */}
        <div className="hidden lg:block lg:sticky lg:top-6 min-w-0">
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold">{selectedDateLabel}</span>
              </div>
              {totalForDate > 0 && (
                <Badge variant="secondary" className="font-bold text-xs">
                  {totalForDate}
                </Badge>
              )}
            </div>
            <div className="px-3 py-3 max-h-[calc(100vh-200px)] overflow-y-auto">
              <WorkloadSummary workload={workload} totalForDate={totalForDate} multiUnitStages={multiUnitStages} />
            </div>
          </div>
        </div>

      </div>

      {/* Mobile batch action bar */}
      <BatchActionBar
        count={totalSelected}
        onClear={() => {
          setSelectedOrderIds(new Set());
          setSelectedBrovaReturnIds(new Set());
          setSelectedAltInIds(new Set());
        }}
      >
        <Button
          size="sm"
          disabled={!selectedDate || scheduleMut.isPending}
          onClick={() => isSchedulingReturns ? setReturnPlanOpen(true) : setPlanOpen(true)}
        >
          Create Plan ({getSelectedGarmentIds().length} garments)
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
      />

      <ReturnPlanDialog
        open={returnPlanOpen}
        onOpenChange={setReturnPlanOpen}
        onConfirm={handleSchedule}
        garmentCount={getSelectedGarmentIds().length}
        defaultDate={selectedDate}
        workerHistory={getReturnWorkerHistory()}
      />
    </div>
  );
}
