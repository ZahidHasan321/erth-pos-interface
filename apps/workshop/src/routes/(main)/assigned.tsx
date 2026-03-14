import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import {
  useUpdateGarmentDetails,
  useUpdateOrderDeliveryDate,
  useUpdateOrderAssignedDate,
} from "@/hooks/useGarmentMutations";
import { WorkerDropdown } from "@/components/shared/WorkerDropdown";
import { ProductionPipeline } from "@/components/shared/ProductionPipeline";
import { StageBadge, BrandBadge, ExpressBadge, AlterationBadge } from "@/components/shared/StageBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Edit3,
  Save,
  X,
  CalendarDays,
  RotateCcw,
  Check,
  Play,
  Circle,
  Clock,
  Zap,
  Package,
  Timer,
  Home,
} from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/assigned")({
  component: AssignedPage,
  head: () => ({ meta: [{ title: "Assigned Orders" }] }),
});

// ── helpers ──────────────────────────────────────────────────────────────────

interface OrderGroup {
  order_id: number;
  invoice_number?: number;
  customer_name?: string;
  customer_mobile?: string;
  brands: string[];
  express: boolean;
  delivery_date?: string;
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
        delivery_date: g.delivery_date_order,
        home_delivery: g.home_delivery_order,
        garments: [],
      });
    }
    const entry = map.get(g.order_id)!;
    entry.garments.push(g);
    if (g.express) entry.express = true;
    if (g.order_brand && !entry.brands.includes(g.order_brand))
      entry.brands.push(g.order_brand);
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

const PLAN_STEPS = [
  { key: "soaker", label: "Soaking", responsibility: "soaking", stageOrder: 1 },
  { key: "cutter", label: "Cutting", responsibility: "cutting", stageOrder: 2 },
  { key: "post_cutter", label: "Post-Cut", responsibility: "post_cutting", stageOrder: 3 },
  { key: "sewer", label: "Sewing", responsibility: "sewing", stageOrder: 4 },
  { key: "finisher", label: "Finishing", responsibility: "finishing", stageOrder: 5 },
  { key: "ironer", label: "Ironing", responsibility: "ironing", stageOrder: 6 },
  { key: "quality_checker", label: "QC", responsibility: "quality_check", stageOrder: 7 },
] as const;

const STAGE_ORDER: Record<string, number> = {
  waiting_cut: 0,
  soaking: 1,
  cutting: 2,
  post_cutting: 3,
  sewing: 4,
  finishing: 5,
  ironing: 6,
  quality_check: 7,
  ready_for_dispatch: 8,
  needs_repair: 2,
  needs_redo: 1,
};

function getDeliveryUrgency(date?: string) {
  if (!date) return { badge: null, border: "", days: null };
  const diff = Math.ceil(
    (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return { badge: "text-red-700 bg-red-100", border: "border-l-red-500", days: diff };
  if (diff <= 2) return { badge: "text-orange-700 bg-orange-100", border: "border-l-orange-400", days: diff };
  if (diff <= 5) return { badge: "text-yellow-800 bg-yellow-100", border: "border-l-yellow-400", days: diff };
  return { badge: "text-green-700 bg-green-100", border: "border-l-green-400", days: diff };
}

// ── GarmentPlanEditor ────────────────────────────────────────────────────────

function GarmentPlanEditor({
  garment,
  onSave,
  onCancel,
  isSaving,
}: {
  garment: WorkshopGarment;
  onSave: (updates: {
    assigned_date?: string | null;
    delivery_date?: string | null;
    assigned_unit?: string | null;
    production_plan?: Record<string, string> | null;
  }) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const plan = garment.production_plan ?? {};
  const history = garment.worker_history ?? {};
  const currentStageOrder = STAGE_ORDER[garment.piece_stage ?? ""] ?? 0;

  const [editPlan, setEditPlan] = useState<Record<string, string>>({ ...plan } as Record<string, string>);
  const [editDate, setEditDate] = useState(garment.assigned_date ?? "");
  const [editDeliveryDate, setEditDeliveryDate] = useState(
    garment.delivery_date ? (garment.delivery_date instanceof Date ? garment.delivery_date.toISOString().slice(0, 10) : String(garment.delivery_date)) : "",
  );
  const [editUnit, setEditUnit] = useState(garment.assigned_unit ?? "");

  return (
    <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
      <div className={cn("grid gap-3", garment.express ? "grid-cols-3" : "grid-cols-2")}>
        <div className="space-y-1">
          <Label className="text-xs">Assigned Date</Label>
          <DatePicker
            value={editDate}
            onChange={(d) => setEditDate(d ? d.toISOString().slice(0, 10) : "")}
            className="h-8 text-xs"
          />
        </div>
        {garment.express && (
          <div className="space-y-1">
            <Label className="text-xs text-orange-600">Delivery Date</Label>
            <DatePicker
              value={editDeliveryDate}
              onChange={(d) => setEditDeliveryDate(d ? d.toISOString().slice(0, 10) : "")}
              className="h-8 text-xs border-orange-200"
            />
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Unit</Label>
          <Input
            value={editUnit}
            onChange={(e) => setEditUnit(e.target.value)}
            placeholder="Unit 1, 2…"
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Production Plan
        </Label>
        {PLAN_STEPS.map((step) => {
          const isDone = currentStageOrder > step.stageOrder;
          const isCurrent = currentStageOrder === step.stageOrder;
          const actualWorker = (history as Record<string, string>)[step.key];

          return (
            <div key={step.key} className="flex items-center gap-2">
              <div className="w-5 flex justify-center">
                {isDone ? (
                  <Check className="w-3.5 h-3.5 text-green-600" />
                ) : isCurrent ? (
                  <Play className="w-3.5 h-3.5 text-blue-600" />
                ) : (
                  <Circle className="w-3 h-3 text-zinc-300" />
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-semibold w-16 shrink-0",
                  isDone && "text-green-700",
                  isCurrent && "text-blue-700",
                  !isDone && !isCurrent && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
              {isDone ? (
                <span className="text-xs text-green-700 font-medium">
                  {actualWorker ?? (editPlan[step.key] || "—")}
                </span>
              ) : (
                <div className="flex-1 max-w-[200px]">
                  <WorkerDropdown
                    responsibility={step.responsibility}
                    value={editPlan[step.key]}
                    onChange={(v) => setEditPlan((p) => ({ ...p, [step.key]: v }))}
                    placeholder="Assign…"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onCancel} className="h-7 text-xs">
          <X className="w-3 h-3 mr-1" /> Cancel
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onSave({
              assigned_date: editDate || null,
              delivery_date: garment.express ? (editDeliveryDate || null) : undefined,
              assigned_unit: editUnit || null,
              production_plan: editPlan,
            })
          }
          disabled={isSaving}
          className="h-7 text-xs"
        >
          <Save className="w-3 h-3 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}

// ── GarmentRow ───────────────────────────────────────────────────────────────

function GarmentRow({
  garment,
  updateMut,
}: {
  garment: WorkshopGarment;
  updateMut: ReturnType<typeof useUpdateGarmentDetails>;
}) {
  const [editing, setEditing] = useState(false);

  const handleSave = async (updates: {
    assigned_date?: string | null;
    delivery_date?: string | null;
    assigned_unit?: string | null;
    production_plan?: Record<string, string> | null;
  }) => {
    await updateMut.mutateAsync({ id: garment.id, updates });
    toast.success(`${garment.garment_id ?? "Garment"} updated`);
    setEditing(false);
  };

  return (
    <div className="space-y-2">
      {/* Garment header - clickable to edit */}
      <div
        className={cn(
          "flex items-center gap-2 flex-wrap cursor-pointer group",
          !editing && "hover:opacity-80",
        )}
        onClick={() => !editing && setEditing(true)}
      >
        {/* Type indicator */}
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md",
            garment.garment_type === "brova"
              ? "bg-purple-100 text-purple-800 border border-purple-200"
              : "bg-blue-100 text-blue-800 border border-blue-200",
          )}
        >
          {garment.garment_type}
        </span>
        <span className="font-mono font-bold text-xs">
          {garment.garment_id ?? garment.id.slice(0, 8)}
        </span>
        <StageBadge stage={garment.piece_stage} />
        {garment.express && <ExpressBadge />}
        <AlterationBadge tripNumber={garment.trip_number} />
        {garment.assigned_unit && (
          <span className="text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
            Unit: <span className="font-semibold text-foreground">{garment.assigned_unit}</span>
          </span>
        )}
        {garment.assigned_date && (
          <span className="text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
            <Timer className="w-3 h-3 inline mr-0.5" />
            {formatDate(garment.assigned_date)}
          </span>
        )}
        {garment.express && garment.delivery_date && (
          <span className="text-[11px] text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded font-semibold">
            <Clock className="w-3 h-3 inline mr-0.5" />
            {formatDate(garment.delivery_date instanceof Date ? garment.delivery_date.toISOString() : garment.delivery_date)}
          </span>
        )}
        <div className="ml-auto">
          {!editing && (
            <Edit3 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </div>

      {/* Mini pipeline */}
      {garment.in_production && !editing && (
        <ProductionPipeline currentStage={garment.piece_stage} compact hasSoaking={!!garment.soaking} />
      )}

      {editing && (
        <GarmentPlanEditor
          garment={garment}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          isSaving={updateMut.isPending}
        />
      )}
    </div>
  );
}

// ── AssignedOrderCard ────────────────────────────────────────────────────────

function AssignedOrderCard({
  group,
  updateMut,
  deliveryDateMut,
  assignedDateMut,
}: {
  group: OrderGroup;
  updateMut: ReturnType<typeof useUpdateGarmentDetails>;
  deliveryDateMut: ReturnType<typeof useUpdateOrderDeliveryDate>;
  assignedDateMut: ReturnType<typeof useUpdateOrderAssignedDate>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingOrder, setEditingOrder] = useState(false);
  const [orderDeliveryDate, setOrderDeliveryDate] = useState(group.delivery_date ?? "");
  const [orderAssignedDate, setOrderAssignedDate] = useState(
    group.garments[0]?.assigned_date ?? "",
  );

  const urgency = getDeliveryUrgency(group.delivery_date);

  // Determine overall order stage (furthest behind)
  const lowestStage = group.garments.reduce((min, g) => {
    const order = STAGE_ORDER[g.piece_stage ?? ""] ?? 0;
    return order < min ? order : min;
  }, 99);
  const overallStage =
    Object.entries(STAGE_ORDER).find(([, v]) => v === lowestStage)?.[0] ?? "unknown";

  const handleSaveOrderDates = async () => {
    if (orderDeliveryDate && orderDeliveryDate !== group.delivery_date) {
      await deliveryDateMut.mutateAsync({
        orderId: group.order_id,
        date: orderDeliveryDate,
      });
    }
    if (orderAssignedDate) {
      await assignedDateMut.mutateAsync({
        orderId: group.order_id,
        date: orderAssignedDate,
      });
    }
    toast.success(`Order #${group.order_id} dates updated`);
    setEditingOrder(false);
  };

  const daysLabel = urgency.days !== null
    ? urgency.days < 0
      ? `${Math.abs(urgency.days)}d overdue`
      : urgency.days === 0
        ? "Due today"
        : `${urgency.days}d left`
    : null;

  return (
    <div
      className={cn(
        "bg-white border rounded-xl transition-all shadow-sm border-l-4",
        urgency.border || "border-l-border",
        group.express && "ring-1 ring-orange-200",
      )}
    >
      {/* Header - clickable to expand */}
      <div
        className="px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-xl"
        onClick={() => !editingOrder && setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3">
          {/* Left: order info */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Top row: ID + customer + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-base">
                #{group.order_id}
              </span>
              <span className="font-semibold text-sm truncate">
                {group.customer_name ?? "—"}
              </span>
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

            {/* Bottom row: metadata chips */}
            <div className="flex items-center flex-wrap gap-1.5">
              {group.invoice_number && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                  INV-{group.invoice_number}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                <Package className="w-3 h-3" />
                {garmentSummary(group.garments)}
              </span>
              <StageBadge stage={overallStage} />
              {group.delivery_date && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md",
                    urgency.badge,
                  )}
                >
                  <Clock className="w-3 h-3" />
                  {formatDate(group.delivery_date)}
                  {daysLabel && (
                    <span className="font-bold">({daysLabel})</span>
                  )}
                </span>
              )}
              {group.garments[0]?.assigned_date && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                  <Timer className="w-3 h-3" />
                  Sched: {formatDate(group.garments[0].assigned_date)}
                </span>
              )}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1 shrink-0 pt-0.5">
            {!editingOrder && (
              <button
                onClick={(e) => { e.stopPropagation(); setEditingOrder(true); }}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
                title="Edit order dates"
              >
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <div className={cn(
              "p-1.5 rounded-md transition-colors",
              expanded ? "bg-muted" : "text-muted-foreground",
            )}>
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </div>
        </div>

        {/* Order-level date editor */}
        {editingOrder && (
          <div className="mt-3 p-3 bg-muted/40 rounded-lg border space-y-2.5" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Delivery Date</Label>
                <DatePicker
                  value={orderDeliveryDate}
                  onChange={(d) => setOrderDeliveryDate(d ? d.toISOString().slice(0, 10) : "")}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Assigned Date (all garments)</Label>
                <DatePicker
                  value={orderAssignedDate}
                  onChange={(d) => setOrderAssignedDate(d ? d.toISOString().slice(0, 10) : "")}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingOrder(false)}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveOrderDates}
                disabled={deliveryDateMut.isPending || assignedDateMut.isPending}
                className="h-7 text-xs"
              >
                <Save className="w-3 h-3 mr-1" /> Save Dates
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Expanded garment list */}
      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-2">
          {group.garments.map((g) => (
            <div
              key={g.id}
              className={cn(
                "bg-white rounded-lg border p-2.5",
                g.express && "border-orange-200 bg-orange-50/30",
              )}
            >
              <GarmentRow garment={g} updateMut={updateMut} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function AssignedPage() {
  const { data: all = [], isLoading } = useWorkshopGarments();
  const updateMut = useUpdateGarmentDetails();
  const deliveryDateMut = useUpdateOrderDeliveryDate();
  const assignedDateMut = useUpdateOrderAssignedDate();

  // All garments in production at the workshop
  const inProduction = all.filter(
    (g) => g.location === "workshop" && g.in_production,
  );

  const regular = inProduction.filter((g) => (g.trip_number ?? 1) === 1);
  const brovaReturns = inProduction.filter((g) => (g.trip_number ?? 1) === 2);
  const alterations = inProduction.filter((g) => (g.trip_number ?? 1) > 2);
  const orderGroups = groupByOrder(regular);

  // Filter categories
  const scheduled = orderGroups.filter((og) =>
    og.garments.every(
      (g) =>
        g.piece_stage === "waiting_cut" ||
        g.piece_stage === "soaking" ||
        (g.piece_stage === "cutting" && !g.start_time),
    ),
  );
  const active = orderGroups.filter((og) =>
    og.garments.some((g) => {
      const so = STAGE_ORDER[g.piece_stage ?? ""] ?? 0;
      return so >= 2 && so <= 7;
    }),
  );
  const readyForDispatch = orderGroups.filter((og) =>
    og.garments.every((g) => g.piece_stage === "ready_for_dispatch"),
  );
  const expressOrders = orderGroups.filter((og) => og.express);

  // Stats
  const stats = {
    total: orderGroups.length,
    scheduled: scheduled.length,
    active: active.length,
    ready: readyForDispatch.length,
    brovaReturns: brovaReturns.length,
    alterations: alterations.length,
    express: expressOrders.length,
  };

  const [filter, setFilter] = useState("all");

  const filteredGroups = (() => {
    switch (filter) {
      case "scheduled":
        return scheduled;
      case "active":
        return active;
      case "ready":
        return readyForDispatch;
      case "express":
        return expressOrders;
      default:
        return orderGroups;
    }
  })();

  return (
    <div className="p-6 max-w-4xl mx-auto pb-10">
      <div className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          <ClipboardList className="w-6 h-6" /> Assigned Orders
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {inProduction.length} garment{inProduction.length !== 1 ? "s" : ""} in
          production across {orderGroups.length} order
          {orderGroups.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mb-6">
        {[
          { label: "Total", value: stats.total, key: "all", color: "bg-zinc-50 text-zinc-700 border-zinc-200", icon: ClipboardList },
          { label: "Scheduled", value: stats.scheduled, key: "scheduled", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock },
          { label: "Active", value: stats.active, key: "active", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Play },
          { label: "Ready", value: stats.ready, key: "ready", color: "bg-green-50 text-green-700 border-green-200", icon: Check },
          { label: "Returns", value: stats.brovaReturns, key: "brova-returns", color: "bg-amber-50 text-amber-700 border-amber-200", icon: RotateCcw },
          { label: "Alterations", value: stats.alterations, key: "alterations", color: "bg-purple-50 text-purple-700 border-purple-200", icon: RotateCcw },
          { label: "Express", value: stats.express, key: "express", color: "bg-orange-50 text-orange-700 border-orange-200", icon: Zap },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              className={cn(
                "border rounded-xl p-2.5 text-center transition-all",
                s.color,
                filter === s.key
                  ? "ring-2 ring-primary/40 shadow-md scale-[1.02]"
                  : "shadow-sm hover:shadow-md",
              )}
            >
              <Icon className="w-4 h-4 mx-auto mb-1 opacity-60" />
              <p className="text-xl font-black leading-none">{s.value}</p>
              <p className="text-[10px] mt-1 uppercase tracking-wider font-bold opacity-70">
                {s.label}
              </p>
            </button>
          );
        })}
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="mb-4">
          <TabsTrigger value="orders">
            Orders{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              {filteredGroups.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="brova-returns">
            Brova Returns{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              {brovaReturns.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="alterations">
            Alterations{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              {alterations.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl">
              <ClipboardList className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">
                No orders match this filter
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroups.map((group) => (
                <AssignedOrderCard
                  key={group.order_id}
                  group={group}
                  updateMut={updateMut}
                  deliveryDateMut={deliveryDateMut}
                  assignedDateMut={assignedDateMut}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="brova-returns">
          {brovaReturns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl">
              <RotateCcw className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">
                No brova returns in production
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {brovaReturns.map((g) => (
                <div
                  key={g.id}
                  className={cn(
                    "bg-white border rounded-xl px-4 py-3 shadow-sm",
                    g.express && "border-orange-200 bg-orange-50/30",
                  )}
                >
                  <GarmentRow garment={g} updateMut={updateMut} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="alterations">
          {alterations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl">
              <RotateCcw className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">
                No alterations in production
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {alterations.map((g) => (
                <div
                  key={g.id}
                  className={cn(
                    "bg-white border rounded-xl px-4 py-3 shadow-sm",
                    g.express && "border-orange-200 bg-orange-50/30",
                  )}
                >
                  <GarmentRow garment={g} updateMut={updateMut} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
