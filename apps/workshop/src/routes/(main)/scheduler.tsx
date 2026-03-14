import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSchedulerGarments, useBrovaPlans, useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useScheduleGarments } from "@/hooks/useGarmentMutations";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { PlanDialog } from "@/components/shared/PlanDialog";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  CalendarDays, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Clock, Package, CheckSquare, Home,
} from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/scheduler")({
  component: SchedulerPage,
  head: () => ({ meta: [{ title: "Scheduler" }] }),
});

// ── helpers ──────────────────────────────────────────────────────────────────

interface OrderGroup {
  order_id: number;
  invoice_number?: number;
  customer_name?: string;
  customer_mobile?: string;
  brands: string[];
  express: boolean;
  home_delivery?: boolean;
  garments: WorkshopGarment[];
}

function groupByOrder(garments: WorkshopGarment[]): OrderGroup[] {
  const map = new Map<number, OrderGroup>();
  for (const g of garments) {
    if (!map.has(g.order_id)) {
      map.set(g.order_id, {
        order_id: g.order_id,
        invoice_number: g.invoice_number,
        customer_name: g.customer_name,
        customer_mobile: g.customer_mobile,
        brands: [],
        express: false,
        home_delivery: g.home_delivery_order,
        garments: [],
      });
    }
    const entry = map.get(g.order_id)!;
    entry.garments.push(g);
    if (g.express) entry.express = true;
    if (g.order_brand && !entry.brands.includes(g.order_brand)) entry.brands.push(g.order_brand);
  }
  return Array.from(map.values());
}

function garmentSummary(garments: WorkshopGarment[]): string {
  const b = garments.filter((g) => g.garment_type === "brova").length;
  const f = garments.filter((g) => g.garment_type === "final").length;
  const parts: string[] = [];
  if (b) parts.push(`${b} Brova`);
  if (f) parts.push(`${f} Final${f > 1 ? "s" : ""}`);
  return parts.join(" + ") || `${garments.length} garment${garments.length !== 1 ? "s" : ""}`;
}

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
  const deliveryDate = group.garments[0]?.delivery_date_order;
  const hasBrova = group.garments.some((g) => g.garment_type === "brova");

  return (
    <div
      className={cn(
        "bg-white border rounded-xl transition-all shadow-sm border-l-4",
        group.express ? "border-l-orange-400 ring-1 ring-orange-200" : "border-l-border",
        selected && "border-primary ring-2 ring-primary/30 bg-primary/5",
      )}
    >
      <div
        className="px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-xl"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => { e.stopPropagation(); onToggle(e.target.checked); }}
            className="w-4.5 h-4.5 accent-primary cursor-pointer shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
              <span className="font-mono font-bold text-sm shrink-0">#{group.order_id}</span>
              <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
              <Badge
                variant="outline"
                className={cn(
                  "border-0 font-bold text-[10px] uppercase",
                  hasBrova
                    ? "bg-purple-200 text-purple-900"
                    : "bg-blue-200 text-blue-900",
                )}
              >
                {hasBrova ? "Brova" : "Finals"}
              </Badge>
              {group.brands.map((b) => (
                <BrandBadge key={b} brand={b} />
              ))}
              {group.express && <ExpressBadge />}
              {group.home_delivery && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 border border-indigo-200">
                  <Home className="w-3 h-3" />
                  Delivery
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {group.invoice_number && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-mono">INV-{group.invoice_number}</span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                <Package className="w-3 h-3" />{garmentSummary(group.garments)}
              </span>
              {deliveryDate && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                  <Clock className="w-3 h-3" />{formatDate(deliveryDate)}
                </span>
              )}
            </div>
          </div>
          <div
            className={cn(
              "p-1.5 rounded-md shrink-0 transition-colors",
              expanded && "bg-muted",
            )}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t px-4 py-2.5 space-y-1.5 bg-muted/20">
          {group.garments.map((g) => (
            <div key={g.id} className="flex items-center gap-2 flex-wrap bg-white rounded-lg border p-2">
              <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">
                {g.garment_id ?? g.id.slice(0, 8)}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "border-0 font-semibold text-[10px] uppercase",
                  g.garment_type === "brova"
                    ? "bg-purple-200 text-purple-900"
                    : "bg-blue-200 text-blue-900",
                )}
              >
                {g.garment_type}
              </Badge>
              {g.express && <ExpressBadge />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MiniCalendar with workload dots ─────────────────────────────────────────

function MiniCalendar({
  selected,
  onSelect,
  scheduledDates,
}: {
  selected: string;
  onSelect: (date: string) => void;
  scheduledDates: Record<string, number>;
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

  return (
    <div className="bg-white border rounded-xl p-4 select-none shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-bold text-sm">{monthLabel}</span>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-[10px] font-bold text-muted-foreground py-1 uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const d = new Date(year, month, day);
          const dateStr = toIsoDate(year, month, day);
          const isPast = d < todayObj;
          const isToday = d.getTime() === todayObj.getTime();
          const isSelected = selectedObj && d.getTime() === selectedObj.getTime();
          const count = scheduledDates[dateStr] ?? 0;
          return (
            <button
              key={day}
              onClick={() => handleDay(day)}
              disabled={isPast}
              className={cn(
                "w-full aspect-square rounded-lg text-sm font-medium transition-colors flex flex-col items-center justify-center gap-0.5 relative",
                isPast && "text-muted-foreground/30 cursor-not-allowed",
                !isPast && !isSelected && "hover:bg-muted",
                isToday && !isSelected && "ring-2 ring-primary/40 text-primary font-bold",
                isSelected && "bg-primary text-primary-foreground shadow-md",
              )}
            >
              {day}
              {count > 0 && !isPast && (
                <span className={cn(
                  "absolute bottom-0.5 text-[7px] font-bold leading-none",
                  isSelected ? "text-primary-foreground/70" : "text-primary/60",
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── EmptyState / LoadingSkeleton ─────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-2xl bg-muted/10">
      <CalendarDays className="w-10 h-10 text-muted-foreground/30 mb-3" />
      <p className="font-semibold text-muted-foreground">{message}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function SchedulerPage() {
  const { data: schedulable = [], isLoading } = useSchedulerGarments();
  const { data: allGarments = [] } = useWorkshopGarments();
  const scheduleMut = useScheduleGarments();

  // Split by tab logic
  // Orders tab: first-trip garments (trip_number=1 or null), grouped by order
  const firstTrip = schedulable.filter(
    (g) => !g.trip_number || g.trip_number === 1,
  );
  const orders = groupByOrder(firstTrip);

  // Brova tab: 2nd-trip returns (garment-level)
  const brovaReturns = schedulable.filter(
    (g) =>
      g.trip_number === 2 &&
      (g.piece_stage === "needs_repair" || g.piece_stage === "needs_redo"),
  );

  // Alteration (In) tab: 3rd+ trip returns (garment-level)
  const alterationIn = schedulable.filter(
    (g) =>
      (g.trip_number ?? 0) >= 3 &&
      (g.piece_stage === "needs_repair" || g.piece_stage === "needs_redo"),
  );

  // Fetch brova production plans for orders that have finals (to pre-populate same personnel)
  const finalOnlyOrderIds = orders
    .filter((o) => o.garments.every((g) => g.garment_type === "final"))
    .map((o) => o.order_id);
  const { data: brovaPlansMap = {} } = useBrovaPlans(finalOnlyOrderIds);

  // Compute scheduled garments per date (for calendar dots)
  const scheduledDates = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of allGarments) {
      if (!g.assigned_date || !g.in_production) continue;
      const dateStr = typeof g.assigned_date === "string"
        ? g.assigned_date.slice(0, 10)
        : new Date(g.assigned_date).toISOString().slice(0, 10);
      map[dateStr] = (map[dateStr] ?? 0) + 1;
    }
    return map;
  }, [allGarments]);

  // Selection state
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [selectedBrovaReturnIds, setSelectedBrovaReturnIds] = useState<Set<string>>(new Set());
  const [selectedAltInIds, setSelectedAltInIds] = useState<Set<string>>(new Set());

  // Shared date
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [planOpen, setPlanOpen] = useState(false);

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

  // Select all helpers
  const selectAllOrders = () => setSelectedOrderIds(new Set(orders.map((o) => o.order_id)));
  const selectAllBrovaReturns = () => setSelectedBrovaReturnIds(new Set(brovaReturns.map((g) => g.id)));
  const selectAllAltIn = () => setSelectedAltInIds(new Set(alterationIn.map((g) => g.id)));

  // Collect garment IDs to schedule from all active selections
  const getSelectedGarmentIds = (): string[] => {
    const ids: string[] = [];
    for (const og of orders) {
      if (selectedOrderIds.has(og.order_id)) ids.push(...og.garments.map((g) => g.id));
    }
    for (const id of selectedBrovaReturnIds) ids.push(id);
    for (const id of selectedAltInIds) ids.push(id);
    return ids;
  };

  const totalSelected =
    selectedOrderIds.size + selectedBrovaReturnIds.size + selectedAltInIds.size;

  // Determine if we're scheduling returns (brova returns or alterations) for re-entry stage picker
  const isSchedulingReturns =
    (selectedBrovaReturnIds.size > 0 || selectedAltInIds.size > 0) &&
    selectedOrderIds.size === 0;

  // Get default plan: for final-only orders use brova plans, for returns use worker_history
  const getDefaultPlanForSelection = (): Record<string, string> | null => {
    // For orders tab: pre-populate finals with brova plans
    if (selectedOrderIds.size > 0) {
      for (const orderId of selectedOrderIds) {
        if (brovaPlansMap[orderId]) return brovaPlansMap[orderId];
      }
    }
    // For brova returns: use worker_history from first selected garment
    if (selectedBrovaReturnIds.size > 0) {
      for (const id of selectedBrovaReturnIds) {
        const g = brovaReturns.find((g) => g.id === id);
        if (g?.worker_history) return { ...g.worker_history } as Record<string, string>;
      }
    }
    // For alteration in: use worker_history from first selected garment
    if (selectedAltInIds.size > 0) {
      for (const id of selectedAltInIds) {
        const g = alterationIn.find((g) => g.id === id);
        if (g?.worker_history) return { ...g.worker_history } as Record<string, string>;
      }
    }
    return null;
  };

  const handleSchedule = async (plan: Record<string, string>, date: string, unit: string, reentryStage?: string) => {
    const ids = getSelectedGarmentIds();
    await scheduleMut.mutateAsync({ ids, plan, date, unit, reentryStage: reentryStage as any });
    toast.success(`${ids.length} garment(s) scheduled`);
    setSelectedOrderIds(new Set());
    setSelectedBrovaReturnIds(new Set());
    setSelectedAltInIds(new Set());
  };

  // Count express orders
  const expressCount = orders.filter((o) => o.express).length;

  // Track current tab for select all
  const [activeTab, setActiveTab] = useState("orders");

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          <CalendarDays className="w-6 h-6" /> Scheduler
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {schedulable.length} garment{schedulable.length !== 1 ? "s" : ""} awaiting production plans
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-blue-700">{orders.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 opacity-70">Orders</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-purple-700">{brovaReturns.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 opacity-70">Brova Returns</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-orange-700">{alterationIn.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600 opacity-70">Alteration (In)</p>
        </div>
        <div className={cn(
          "rounded-xl p-2.5 text-center border",
          expressCount > 0 ? "bg-red-50 border-red-200" : "bg-zinc-50 border-zinc-200",
        )}>
          <p className={cn("text-xl font-black", expressCount > 0 ? "text-red-700" : "text-zinc-400")}>{expressCount}</p>
          <p className={cn("text-[10px] font-bold uppercase tracking-wider", expressCount > 0 ? "text-red-600 opacity-70" : "text-zinc-400")}>Express</p>
        </div>
      </div>

      {/* Split layout: list on left, calendar on right */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
        {/* ── Left: Tabs + list ── */}
        <div>
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

              {/* Select all button */}
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

            {/* Orders — order level with brova/finals badge */}
            <TabsContent value="orders">
              {isLoading ? (
                <LoadingSkeleton />
              ) : orders.length === 0 ? (
                <EmptyState message="No orders to schedule" />
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

            {/* Brova — garment level (2nd trip returns) */}
            <TabsContent value="brova">
              {isLoading ? (
                <LoadingSkeleton />
              ) : brovaReturns.length === 0 ? (
                <EmptyState message="No brova returns to schedule" />
              ) : (
                <div className="space-y-2">
                  {brovaReturns.map((g, i) => (
                    <GarmentCard
                      key={g.id}
                      garment={g}
                      selected={selectedBrovaReturnIds.has(g.id)}
                      onSelect={(id, checked) => toggleGarmentInSet(setSelectedBrovaReturnIds, id, checked)}
                      showPipeline={false}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Alteration In — garment level (3rd+ trip) */}
            <TabsContent value="alteration-in">
              {isLoading ? (
                <LoadingSkeleton />
              ) : alterationIn.length === 0 ? (
                <EmptyState message="No alterations to schedule" />
              ) : (
                <div className="space-y-2">
                  {alterationIn.map((g, i) => (
                    <GarmentCard
                      key={g.id}
                      garment={g}
                      selected={selectedAltInIds.has(g.id)}
                      onSelect={(id, checked) => toggleGarmentInSet(setSelectedAltInIds, id, checked)}
                      showPipeline={false}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Alteration Out — placeholder */}
            <TabsContent value="alteration-out">
              <EmptyState message="Coming soon — externally-made dishdashas" />
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Right: Calendar + action panel ── */}
        <div className="space-y-4 lg:sticky lg:top-6">
          <MiniCalendar
            selected={selectedDate}
            onSelect={setSelectedDate}
            scheduledDates={scheduledDates}
          />

          <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
                  Date
                </p>
                <p className="font-bold text-sm">
                  {selectedDate
                    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("default", { weekday: "short", month: "short", day: "numeric" })
                    : "—"}
                </p>
              </div>
              {scheduledDates[selectedDate] && (
                <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                  {scheduledDates[selectedDate]} scheduled
                </span>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Selection
              </p>
              {totalSelected > 0 ? (
                <div className="space-y-1">
                  {selectedOrderIds.size > 0 && (
                    <p className="text-xs"><span className="font-bold">{selectedOrderIds.size}</span> order{selectedOrderIds.size !== 1 ? "s" : ""}</p>
                  )}
                  {selectedBrovaReturnIds.size > 0 && (
                    <p className="text-xs"><span className="font-bold">{selectedBrovaReturnIds.size}</span> brova return{selectedBrovaReturnIds.size !== 1 ? "s" : ""}</p>
                  )}
                  {selectedAltInIds.size > 0 && (
                    <p className="text-xs"><span className="font-bold">{selectedAltInIds.size}</span> alteration{selectedAltInIds.size !== 1 ? "s" : ""}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {getSelectedGarmentIds().length} garment{getSelectedGarmentIds().length !== 1 ? "s" : ""} total
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nothing selected</p>
              )}
            </div>

            <Button
              className="w-full h-10 font-bold"
              disabled={totalSelected === 0 || !selectedDate || scheduleMut.isPending}
              onClick={() => setPlanOpen(true)}
            >
              Create Plan
            </Button>
          </div>
        </div>
      </div>

      {/* Batch action bar for mobile (when scrolled away from panel) */}
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
          onClick={() => setPlanOpen(true)}
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
        isAlteration={isSchedulingReturns}
        defaultPlan={getDefaultPlanForSelection()}
      />
    </div>
  );
}
