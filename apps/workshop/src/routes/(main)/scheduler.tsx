import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSchedulerGarments, useBrovaPlans, useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useScheduleGarments } from "@/hooks/useGarmentMutations";
import { useResources } from "@/hooks/useResources";
import { PlanDialog } from "@/components/shared/PlanDialog";
import { ReturnPlanDialog } from "@/components/shared/ReturnPlanDialog";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { BrandBadge } from "@/components/shared/StageBadge";
import {
  PageHeader, EmptyState, LoadingSkeleton,
} from "@/components/shared/PageShell";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { PRODUCTION_STAGES } from "@/lib/constants";
import { cn, formatDate, getLocalDateStr, toLocalDateStr, groupByOrder, garmentSummary, parseUtcTimestamp, type OrderGroup } from "@/lib/utils";
import {
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
  Clock, Package, CheckSquare, Home, User, AlertTriangle, Eye,
  Calendar, BarChart3,
} from "lucide-react";
import { OrderPeekSheet } from "@/components/shared/PeekSheets";
import { getAlterationNumber, isAlteration } from "@repo/database";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/scheduler")({
  component: SchedulerPage,
  head: () => ({ meta: [{ title: "Scheduler" }] }),
});

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Garment card for brova returns / alterations ─────────────────────────────

function feedbackInfo(g: WorkshopGarment) {
  if (g.acceptance_status && g.feedback_status === "needs_repair")
    return { label: "Fix Needed", cls: "text-amber-700 bg-amber-50 ring-amber-300/40" };
  if (g.feedback_status === "needs_repair")
    return { label: "Repair", cls: "text-orange-700 bg-orange-50 ring-orange-300/40" };
  if (g.feedback_status === "needs_redo")
    return { label: "Redo", cls: "text-red-700 bg-red-50 ring-red-300/40" };
  if (g.feedback_status === "accepted" || g.acceptance_status)
    return { label: "Accepted", cls: "text-emerald-700 bg-emerald-50 ring-emerald-300/40" };
  return null;
}

function SchedulerGarmentRow({
  garment: g,
  selected,
  onSelect,
}: {
  garment: WorkshopGarment;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}) {
  const daysLeft = g.delivery_date_order
    ? Math.ceil((parseUtcTimestamp(g.delivery_date_order).getTime() - Date.now()) / 86400000)
    : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isUrgent = daysLeft !== null && daysLeft <= 2 && !isOverdue;
  const daysLabel = daysLeft !== null
    ? daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Today" : `${daysLeft}d`
    : null;

  const altNum = getAlterationNumber(g.trip_number, g.garment_type);
  const isAlt = isAlteration(g.trip_number, g.garment_type);
  const fb = feedbackInfo(g);

  return (
    <div
      className={cn(
        "bg-card border rounded-xl px-3 py-2.5 transition-[color,background-color,border-color,box-shadow] cursor-pointer",
        "hover:bg-muted/20 active:scale-[0.995]",
        g.express && "border-l-4 border-l-orange-400",
        selected && "border-primary ring-2 ring-primary/20 bg-primary/5",
      )}
      onClick={() => onSelect(g.id, !selected)}
    >
      {/* Row 1 — Identity: type · ID · customer · brand */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onSelect(g.id, e.target.checked); }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 accent-primary cursor-pointer shrink-0"
        />
        <span className={cn(
          "font-bold uppercase text-xs px-1.5 py-0.5 rounded shrink-0",
          g.garment_type === "brova" ? "text-purple-700 bg-purple-100" : "text-blue-700 bg-blue-100",
        )}>
          {g.garment_type === "brova" ? "B" : "F"}
        </span>
        <span className="font-mono font-bold text-sm">{g.garment_id ?? g.id.slice(0, 8)}</span>
        <span className="text-sm text-muted-foreground truncate min-w-0">{g.customer_name ?? "—"}</span>
        <div className="ml-auto shrink-0">
          <BrandBadge brand={g.order_brand} />
        </div>
      </div>

      {/* Row 2 — Context: alteration # · feedback · fabric · delivery */}
      <div className="flex items-center gap-1.5 mt-1.5 ml-6 flex-wrap">
        {isAlt && altNum !== null && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 ring-1 ring-orange-300/40">
            Alt #{altNum}
          </span>
        )}
        {!isAlt && (g.trip_number ?? 1) > 1 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 ring-1 ring-purple-300/40">
            Return #{(g.trip_number ?? 1) - 1}
          </span>
        )}
        {fb && (
          <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded ring-1", fb.cls)}>
            {fb.label}
          </span>
        )}
        {g.soaking && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 ring-1 ring-sky-300/40">
            Soak
          </span>
        )}
        <span className="flex-1" />
        {g.fabric_name && (
          <span className="text-xs text-muted-foreground truncate max-w-[140px]">
            {g.fabric_name}{g.fabric_color ? ` · ${g.fabric_color}` : ""}
          </span>
        )}
        {daysLabel ? (
          <span className={cn(
            "text-xs font-bold tabular-nums px-1.5 py-0.5 rounded",
            isOverdue && "bg-red-100 text-red-700",
            isUrgent && "bg-amber-100 text-amber-700",
            !isUrgent && !isOverdue && "text-muted-foreground",
          )}>
            {daysLabel}
          </span>
        ) : g.delivery_date_order ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDate(g.delivery_date_order)}
          </span>
        ) : null}
      </div>
    </div>
  );
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
  const daysLeft = deliveryDate
    ? Math.ceil((parseUtcTimestamp(deliveryDate).getTime() - Date.now()) / 86400000)
    : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isUrgent = daysLeft !== null && daysLeft <= 2 && !isOverdue;
  const daysLabel = daysLeft !== null
    ? daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `${daysLeft}d`
    : null;

  return (
    <>
    <div
      className={cn(
        "bg-card border rounded-xl transition-[color,background-color,border-color,box-shadow] shadow-sm border-l-4",
        group.express
          ? "border-l-orange-400"
          : isOverdue
            ? "border-l-red-500"
            : isUrgent
              ? "border-l-amber-400"
              : "border-l-transparent",
        selected && "border-primary ring-2 ring-primary/20 bg-primary/5",
      )}
    >
      <div
        className="px-3 py-2.5 transition-colors rounded-t-xl"
      >
        <div className="flex items-center justify-between gap-2">
          {/* Left: checkbox + identity */}
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onToggle(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select order #${group.order_id}`}
              className="w-4 h-4 accent-primary cursor-pointer shrink-0"
            />
            <span className="font-mono font-bold text-sm shrink-0">#{group.order_id}</span>
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
            <span className="text-sm text-muted-foreground truncate">{group.customer_name ?? "—"}</span>
          </div>

          {/* Right: delivery + actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {daysLabel && (
              <span className={cn(
                "text-xs font-bold tabular-nums px-1.5 py-0.5 rounded",
                isOverdue && "bg-red-100 text-red-700",
                isUrgent && "bg-amber-100 text-amber-700",
                !isUrgent && !isOverdue && "text-muted-foreground",
              )}>
                {daysLabel}
              </span>
            )}
            <button onClick={(e) => { e.stopPropagation(); setPeekOpen(true); }} aria-label="View order details" className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground/40 hover:text-foreground cursor-pointer">
              <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              className={cn("p-1.5 rounded-md transition-colors cursor-pointer", expanded ? "bg-muted" : "text-muted-foreground/40 hover:text-foreground")}
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse garments" : "Expand garments"}
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Summary line */}
        <div className="flex items-center gap-1.5 mt-1 ml-6 flex-wrap">
          <span className="text-xs text-muted-foreground">{garmentSummary(group.garments)}</span>
          {group.home_delivery && (
            <span className="text-xs font-semibold text-indigo-600">
              <Home className="w-3 h-3 inline mr-0.5" />Delivery
            </span>
          )}
          {deliveryDate && !daysLabel && (
            <span className="text-xs text-muted-foreground tabular-nums">
              <Clock className="w-2.5 h-2.5 inline mr-0.5" />{formatDate(deliveryDate)}
            </span>
          )}
        </div>
      </div>

      {/* Expanded: garment details — fabric, soaking, style info */}
      {expanded && (
        <div className="border-t px-3 py-2 space-y-1 bg-muted/10">
          {group.garments.map((g) => {
            const isParked = g.piece_stage === "waiting_for_acceptance";
            return (
              <div key={g.id} className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                isParked ? "bg-zinc-50/80 opacity-50" : "bg-card",
              )}>
                <span className={cn(
                  "font-bold uppercase text-xs px-1 py-0.5 rounded shrink-0",
                  g.garment_type === "brova" ? "text-purple-700 bg-purple-50" : "text-blue-700 bg-blue-50",
                )}>
                  {g.garment_type === "brova" ? "B" : "F"}
                </span>
                <span className="font-mono font-bold">{g.garment_id ?? g.id.slice(0, 8)}</span>
                {g.fabric_name ? (
                  <span className="text-muted-foreground truncate">{g.fabric_name}{g.fabric_color ? ` · ${g.fabric_color}` : ""}</span>
                ) : (
                  <span className="text-muted-foreground/50 truncate">Outside fabric</span>
                )}
                <div className="flex items-center gap-1 ml-auto shrink-0">
                  {g.soaking && <span className="font-bold text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded text-xs">Soak</span>}
                  {g.express && <span className="font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded text-xs">Express</span>}
                  {isParked && <span className="text-muted-foreground/60 italic text-xs">parked</span>}
                </div>
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
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="p-2.5 -m-1 rounded-lg hover:bg-muted active:bg-muted/60 transition-colors touch-manipulation"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <span className="font-bold text-sm tracking-tight">{monthLabel}</span>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="p-2.5 -m-1 rounded-lg hover:bg-muted active:bg-muted/60 transition-colors touch-manipulation"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-0.5 text-center mb-0.5">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-[10px] font-bold text-muted-foreground/40 uppercase py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells — tall rectangles for better touch targets in narrow columns */}
      <div className="grid grid-cols-7 gap-0.5">
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
                "relative h-10 rounded-md text-xs font-semibold transition-[color,background-color,border-color,box-shadow] touch-manipulation",
                "flex flex-col items-center justify-center",
                isPast && "text-muted-foreground/20 cursor-not-allowed",
                !isPast && !isSelected && "hover:bg-primary/10 active:scale-95 cursor-pointer",
                !isPast && !isSelected && HEAT_BG[heat],
                isToday && !isSelected && "ring-2 ring-primary/50 font-black text-primary",
                isSelected && "bg-primary text-primary-foreground shadow-md",
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
      <div className="flex items-center justify-center gap-2 mt-3 text-[10px] text-muted-foreground/50">
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
                        <span className="text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
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
  const ordersUnsorted = groupByOrder([...firstTrip, ...waitingFinals]);

  // Sort: express first, then by delivery date (soonest first), then no-date last
  const orders = useMemo(() => {
    return [...ordersUnsorted].sort((a, b) => {
      // Express always first
      if (a.express && !b.express) return -1;
      if (!a.express && b.express) return 1;
      // Then by delivery date (earliest first, no date last)
      if (a.delivery_date && b.delivery_date) return a.delivery_date.localeCompare(b.delivery_date);
      if (a.delivery_date && !b.delivery_date) return -1;
      if (!a.delivery_date && b.delivery_date) return 1;
      return 0;
    });
  }, [ordersUnsorted]);

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
    setSelectedOrderIds(new Set());
    setSelectedBrovaReturnIds(new Set());
    setSelectedAltInIds(new Set());
  };

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

      {/* ── Tablet/phone: calendar + workload on top, full width ── */}
      <div className="lg:hidden mb-3">
        <div className="bg-card border rounded-xl shadow-sm p-3">
          <div className="flex gap-3">
            {/* Calendar — capped width so it doesn't overstretch */}
            <div className="w-[280px] shrink-0">
              <HeatCalendar
                selected={selectedDate}
                onSelect={setSelectedDate}
                scheduledDates={scheduledDates}
                maxPerDay={maxPerDay}
              />
            </div>
            {/* Workload — takes remaining space, only on wider tablets */}
            <div className="hidden sm:block flex-1 min-w-0 border-l pl-3">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-bold">{selectedDateLabel}</span>
                {totalForDate > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums ml-auto">{totalForDate}</span>
                )}
              </div>
              <div className="max-h-[220px] overflow-y-auto">
                <WorkloadSummary workload={workload} totalForDate={totalForDate} multiUnitStages={multiUnitStages} />
              </div>
            </div>
          </div>
          {/* Workload on narrow screens — collapsible below calendar */}
          <div className="sm:hidden border-t mt-2 pt-2">
            <button
              onClick={() => setShowMobilePanel(!showMobilePanel)}
              className="w-full flex items-center justify-between text-left touch-manipulation"
            >
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

        {/* ── Col 1: Tabs + order list ── */}
        <div className="min-w-0">
          <Tabs defaultValue="orders" value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <TabsList className="h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden max-w-full">
                <TabsTrigger value="orders" className="text-xs px-2.5">
                  Orders{" "}
                  <Badge variant="secondary" className="ml-1 text-[10px] bg-blue-100 text-blue-700">
                    {orders.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="brova" className="text-xs px-2.5">
                  Brova{" "}
                  <Badge variant="secondary" className="ml-1 text-[10px] bg-purple-100 text-purple-700">
                    {brovaReturns.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="alteration-in" className="text-xs px-2.5">
                  <span className="hidden min-[480px]:inline">Alteration</span>
                  <span className="min-[480px]:hidden">Alt</span>
                  {" (In) "}
                  <Badge variant="secondary" className="ml-1 text-[10px] bg-orange-100 text-orange-700">
                    {alterationIn.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="alteration-out" className="text-xs px-2.5" disabled>
                  <span className="hidden min-[480px]:inline">Alteration</span>
                  <span className="min-[480px]:hidden">Alt</span>
                  {" (Out)"}
                </TabsTrigger>
              </TabsList>

              <button
                className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1 shrink-0"
                onClick={() => {
                  if (activeTab === "orders") selectAllOrders();
                  else if (activeTab === "brova") selectAllBrovaReturns();
                  else if (activeTab === "alteration-in") selectAllAltIn();
                }}
              >
                <CheckSquare className="w-3 h-3" />
                <span className="hidden sm:inline">Select all</span>
                <span className="sm:hidden">All</span>
              </button>
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
                <div className="space-y-1.5">
                  {brovaReturns.map((g) => (
                    <SchedulerGarmentRow
                      key={g.id}
                      garment={g}
                      selected={selectedBrovaReturnIds.has(g.id)}
                      onSelect={(id, checked) => toggleGarmentInSet(setSelectedBrovaReturnIds, id, checked)}
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
                <div className="space-y-1.5">
                  {alterationIn.map((g) => (
                    <SchedulerGarmentRow
                      key={g.id}
                      garment={g}
                      selected={selectedAltInIds.has(g.id)}
                      onSelect={(id, checked) => toggleGarmentInSet(setSelectedAltInIds, id, checked)}
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

        {/* ── Col 2: Calendar + workload combined (desktop only) ── */}
        <div className="hidden lg:block lg:sticky lg:top-4">
          <div className="bg-card border rounded-xl shadow-sm p-3 xl:p-4">
            {/* xl+: side by side | lg: stacked */}
            <div className="flex flex-col xl:flex-row xl:gap-4">
              {/* Calendar */}
              <div className="xl:w-[300px] xl:shrink-0 max-w-[320px]">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Schedule Date</span>
                </div>
                <HeatCalendar
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  scheduledDates={scheduledDates}
                  maxPerDay={maxPerDay}
                />
              </div>
              {/* Workload — beside calendar on xl, below on lg */}
              <div className="border-t xl:border-t-0 xl:border-l mt-3 pt-3 xl:mt-0 xl:pt-0 xl:pl-4 xl:flex-1 xl:min-w-[180px]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-bold">{selectedDateLabel}</span>
                  </div>
                  {totalForDate > 0 && (
                    <span className="text-xs font-bold text-muted-foreground tabular-nums">{totalForDate}</span>
                  )}
                </div>
                <div className="max-h-[260px] overflow-y-auto">
                  <WorkloadSummary workload={workload} totalForDate={totalForDate} multiUnitStages={multiUnitStages} />
                </div>
              </div>
            </div>

            {/* Action — below calendar + workload */}
            <div className="border-t mt-3 pt-3">
              {totalSelected > 0 ? (
                <div className="mb-2">
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
                <p className="text-xs text-muted-foreground mb-2">Select orders to schedule</p>
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
        <span className="text-xs opacity-70 hidden sm:inline">{selectedDateLabel}</span>
        <Button
          size="sm"
          disabled={!selectedDate || scheduleMut.isPending}
          onClick={() => isSchedulingReturns ? setReturnPlanOpen(true) : setPlanOpen(true)}
        >
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
