import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments, useBrovaStatus, useBrovaPlans } from "@/hooks/useWorkshopGarments";
import { getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import {
  useSendToScheduler,
  useSendReturnToProduction,
  useReleaseFinalsWithPlan,
} from "@/hooks/useGarmentMutations";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import {
  MetadataChip, GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandBadge, ExpressBadge, StageBadge } from "@/components/shared/StageBadge";
import { cn, formatDate, groupByOrder, garmentSummary, type OrderGroup } from "@/lib/utils";
import { useResources } from "@/hooks/useResources";
import { toast } from "sonner";
import {
  ParkingSquare, Clock, RotateCcw, Zap, Unlock, ChevronDown, ChevronUp,
  Package, Home, AlertTriangle, ClipboardList, Check, Eye,
  CalendarDays, Pencil, Scissors, Shirt, Sparkles, Flame, ShieldCheck, Droplets,
  type LucideIcon,
} from "lucide-react";
import { OrderPeekSheet } from "@/components/shared/PeekSheets";
import type { WorkshopGarment } from "@repo/database";
import type { PieceStage } from "@repo/database";

export const Route = createFileRoute("/(main)/parking")({
  component: ParkingPage,
  head: () => ({ meta: [{ title: "Parking" }] }),
});

// helpers imported from @/lib/utils: groupByOrder, garmentSummary, OrderGroup

const isAllWaitingAcceptance = (garments: WorkshopGarment[]) =>
  garments.every((g) => g.piece_stage === "waiting_for_acceptance");

/** Finals needing release: either still at waiting_for_acceptance, or at waiting_cut but not yet in production */
const hasReleasableFinals = (garments: WorkshopGarment[]) =>
  garments.some((g) =>
    g.garment_type === "final" && (
      g.piece_stage === "waiting_for_acceptance" ||
      (g.piece_stage === "waiting_cut" && !g.in_production)
    ),
  );

/** Stages that mean "still being produced" (not yet dispatched/trialed) */
const PRODUCTION_STAGES: PieceStage[] = [
  "waiting_for_acceptance", "waiting_cut", "soaking", "cutting", "post_cutting",
  "sewing", "finishing", "ironing", "quality_check", "ready_for_dispatch",
];

/** Determine what's really happening with the brovas in an order.
 *  Pass ALL garments for the order (not just parked ones) since brovas may be in_production. */
function getBrovaBlockReason(allOrderGarments: WorkshopGarment[]): "in_production" | "awaiting_trial" | null {
  const brovas = allOrderGarments.filter((g) => g.garment_type === "brova");
  if (brovas.length === 0) return null;

  // If any brova is still in production stages at the workshop, it's "in production"
  const brovasInProduction = brovas.some(
    (g) => PRODUCTION_STAGES.includes(g.piece_stage as PieceStage),
  );
  if (brovasInProduction) return "in_production";

  // Otherwise brovas have been dispatched/at shop — waiting for customer trial
  return "awaiting_trial";
}

// ── OrderCard (order-level for Orders tab) ───────────────────────────────────

function ParkingOrderCard({
  group,
  allOrderGarments,
  selected,
  onToggle,
  onSendToScheduler,
  isSending,
}: {
  group: OrderGroup;
  allOrderGarments: WorkshopGarment[];
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onSendToScheduler: () => void;
  isSending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const allParked = isAllWaitingAcceptance(group.garments);
  const brovaBlock = getBrovaBlockReason(allOrderGarments);
  const deliveryDate = group.garments[0]?.delivery_date_order;
  const daysLeft = deliveryDate
    ? Math.ceil((new Date(deliveryDate).getTime() - Date.now()) / 86400000)
    : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isUrgent = daysLeft !== null && daysLeft <= 2 && !isOverdue;

  return (
    <>
    <div
      className={cn(
        "bg-white border rounded-xl transition-all shadow-sm border-l-4",
        group.express
          ? "border-l-orange-400 ring-1 ring-orange-200"
          : allParked
            ? "border-l-amber-400"
            : "border-l-border",
        selected && "border-primary ring-2 ring-primary/20 bg-primary/5",
      )}
    >
      <div
        className="px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-xl"
        onClick={() => !allParked && onToggle(!selected)}
      >
        {/* Row 1: Identity + actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => { e.stopPropagation(); onToggle(e.target.checked); }}
              onClick={(e) => e.stopPropagation()}
              disabled={allParked}
              className="w-4 h-4 accent-primary cursor-pointer shrink-0 disabled:cursor-not-allowed"
            />
            <span className="font-mono font-bold text-lg shrink-0">#{group.order_id}</span>
            {group.invoice_number && (
              <span className="text-sm text-muted-foreground/50 font-mono shrink-0">· #{group.invoice_number}</span>
            )}
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
            <span className="text-base text-muted-foreground truncate">{group.customer_name ?? "—"}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!allParked && (
              <Button size="sm" onClick={(e) => { e.stopPropagation(); onSendToScheduler(); }} disabled={isSending} className="text-xs h-7">
                → Scheduler
              </Button>
            )}
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
            {allParked && brovaBlock === "in_production" && (
              <Badge variant="outline" className="border-0 bg-purple-500 text-white text-xs font-semibold uppercase">
                Brova in production
              </Badge>
            )}
            {allParked && brovaBlock === "awaiting_trial" && (
              <Badge variant="outline" className="border-0 bg-amber-500 text-white text-xs font-semibold uppercase">
                Waiting for brova trial
              </Badge>
            )}
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
        <div className="border-t bg-muted/20 px-4 py-2.5 space-y-1.5">
          {group.garments.map((g) => (
            <div key={g.id} className="bg-white rounded-lg border p-2 flex items-center gap-2">
              <GarmentTypeBadge type={g.garment_type ?? "final"} />
              <span className="font-mono text-xs font-bold">{g.garment_id ?? g.id.slice(0, 8)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
    <OrderPeekSheet orderId={peekOpen ? group.order_id : null} open={peekOpen} onOpenChange={setPeekOpen} />
    </>
  );
}

// ── WaitingFinalsCard ────────────────────────────────────────────────────────

function WaitingFinalsCard({
  group,
  selected,
  onToggle,
  onRelease,
  isReleasing,
  brovaStatus,
}: {
  group: OrderGroup;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onRelease: () => void;
  isReleasing: boolean;
  brovaStatus?: { total: number; trialed: number; accepted: number };
}) {
  const [expanded, setExpanded] = useState(false);
  const releasableGarments = group.garments.filter(
    (g) => g.garment_type === "final" && (
      g.piece_stage === "waiting_for_acceptance" ||
      (g.piece_stage === "waiting_cut" && !g.in_production)
    ),
  );
  const deliveryDate = group.garments[0]?.delivery_date_order;
  const posReleased = releasableGarments.some((g) => g.piece_stage === "waiting_cut");

  // Brova's old assigned date — PM needs to set a new one for finals
  const brovaAssignedDate = group.garments
    .filter((g) => g.garment_type === "brova" && g.assigned_date)
    .map((g) => g.assigned_date!)[0];

  // Determine readiness from brova status
  const noBrovas = !brovaStatus || brovaStatus.total === 0;
  const isReady = noBrovas || brovaStatus.accepted > 0;
  const allRejected = !!(brovaStatus && brovaStatus.total > 0 && brovaStatus.trialed === brovaStatus.total && brovaStatus.accepted === 0);

  return (
    <div
      className={cn(
        "bg-white border rounded-xl transition-all shadow-sm border-l-4",
        group.express
          ? "border-l-orange-400 ring-1 ring-orange-200"
          : "border-l-amber-400",
        isReady ? "border-green-300 bg-green-50/40" : "border-amber-200 bg-amber-50/30",
        selected && "border-primary ring-2 ring-primary/20 bg-primary/5",
      )}
    >
      <div
        className="px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-xl"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggle(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 accent-primary cursor-pointer shrink-0 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            {/* Row 1: Identity + status (left) + Delivery & actions (right) */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                  <span className="font-mono font-bold text-lg shrink-0">#{group.order_id}</span>
                  <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
                  {group.brands.map((b) => (
                    <BrandBadge key={b} brand={b} />
                  ))}
                </div>
                {/* Status badges row */}
                <div className="flex items-center flex-wrap gap-1.5 mt-1">
                  {allRejected ? (
                    <Badge variant="outline" className="border-0 bg-red-100 text-red-800 text-xs font-semibold uppercase">
                      All brovas rejected
                    </Badge>
                  ) : isReady ? (
                    <Badge variant="outline" className="border-0 bg-green-600 text-white text-xs font-semibold uppercase">
                      {noBrovas ? "No brovas — ready" : "Ready for finals"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-0 bg-amber-100 text-amber-800 text-xs font-semibold uppercase">
                      Awaiting trial ({brovaStatus!.trialed}/{brovaStatus!.total} trialed)
                    </Badge>
                  )}
                  {isReady && !noBrovas && brovaStatus!.trialed < brovaStatus!.total && (
                    <Badge variant="outline" className="border-0 bg-amber-100 text-amber-800 text-xs font-semibold uppercase">
                      {brovaStatus!.trialed}/{brovaStatus!.total} trialed
                    </Badge>
                  )}
                  {posReleased && (
                    <Badge variant="outline" className="border-0 bg-blue-100 text-blue-800 text-xs font-semibold uppercase">
                      Shop approved
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2 shrink-0">
                {deliveryDate && (
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Due</p>
                    <p className="text-sm font-bold text-amber-700">{formatDate(deliveryDate)}</p>
                  </div>
                )}
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onRelease(); }}
                  disabled={isReleasing}
                  className={cn(
                    "text-xs h-7",
                    isReady
                      ? "bg-green-600 hover:bg-green-700"
                      : allRejected
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-amber-600 hover:bg-amber-700",
                  )}
                >
              {isReady ? (
                <Unlock className="w-3 h-3 mr-1" />
              ) : (
                <AlertTriangle className="w-3 h-3 mr-1" />
              )}
              Release Finals
            </Button>
            <div className={cn(
              "p-1.5 rounded-md transition-colors",
              expanded ? "bg-muted" : "text-muted-foreground",
            )}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </div>
            {/* Row 2: Metadata */}
            <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
              {group.invoice_number && (
                <MetadataChip>INV-{group.invoice_number}</MetadataChip>
              )}
              <MetadataChip icon={Package}>{garmentSummary(group.garments)}</MetadataChip>
              {deliveryDate && (
                <span className="sm:hidden">
                  <MetadataChip icon={Clock} variant="amber">Due {formatDate(deliveryDate)}</MetadataChip>
                </span>
              )}
            </div>
            {brovaAssignedDate && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md line-through">
                  <CalendarDays className="w-3 h-3" />
                  Brova: {formatDate(brovaAssignedDate)}
                </span>
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-200">
                  Set new date on release
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-2">
          {group.garments.map((g) => (
            <div key={g.id} className="bg-white rounded-lg border p-2 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">
                {g.garment_id ?? g.id.slice(0, 8)}
              </span>
              <GarmentTypeBadge type={g.garment_type ?? "final"} />
              <StageBadge stage={g.piece_stage} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ReturnGarmentCard (garment-level for Returns tab) ────────────────────────

function ReturnGarmentCard({
  garment,
  onSendSingle,
  selected,
  onSelect,
  isPending,
  index,
}: {
  garment: WorkshopGarment;
  onSendSingle: () => void;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  isPending: boolean;
  index: number;
}) {
  return (
    <GarmentCard
      garment={garment}
      selected={selected}
      onSelect={onSelect}
      showPipeline={false}
      hideStage
      index={index}
      actions={
        <Button size="sm" variant="outline" onClick={onSendSingle} disabled={isPending}>
          → Scheduler
        </Button>
      }
    />
  );
}

// ── Release Finals Dialog ────────────────────────────────────────────────────

const RELEASE_PLAN_STEPS = [
  { key: "soaker",          label: "Soaking",      responsibility: "soaking",       icon: Droplets,    color: "text-sky-600",    accent: "bg-sky-100" },
  { key: "cutter",          label: "Cutting",      responsibility: "cutting",       icon: Scissors,    color: "text-amber-600",  accent: "bg-amber-100" },
  { key: "post_cutter",     label: "Post-Cutting", responsibility: "post_cutting",  icon: Package,     color: "text-orange-600", accent: "bg-orange-100" },
  { key: "sewer",           label: "Sewing",       responsibility: "sewing",        icon: Shirt,       color: "text-purple-600", accent: "bg-purple-100" },
  { key: "finisher",        label: "Finishing",     responsibility: "finishing",     icon: Sparkles,    color: "text-emerald-600",accent: "bg-emerald-100" },
  { key: "ironer",          label: "Ironing",       responsibility: "ironing",      icon: Flame,       color: "text-red-600",    accent: "bg-red-100" },
  { key: "quality_checker", label: "Quality Check", responsibility: "quality_check", icon: ShieldCheck, color: "text-indigo-600", accent: "bg-indigo-100" },
];

function ReleaseFinalsDialog({
  open,
  onOpenChange,
  onConfirm,
  garmentCount,
  defaultPlan,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (plan: Record<string, string>, date: string) => void;
  garmentCount: number;
  defaultPlan: Record<string, string> | null;
  isPending: boolean;
}) {
  const { data: resources = [] } = useResources();
  const { data: allGarmentsForWorkload = [] } = useWorkshopGarments();
  const [plan, setPlan] = useState<Record<string, string>>({});
  const [unitSelections, setUnitSelections] = useState<Record<string, string>>({});
  const [date, setDate] = useState(getLocalDateStr());
  const [editingStep, setEditingStep] = useState<string | null>(null);

  // Compute workload: per plan-key → worker name → garment count
  const workload: Record<string, Record<string, number>> = {};
  for (const step of RELEASE_PLAN_STEPS) {
    workload[step.key] = {};
  }
  for (const g of allGarmentsForWorkload) {
    if (!g.production_plan || !g.in_production) continue;
    const pp = g.production_plan as Record<string, string>;
    for (const step of RELEASE_PLAN_STEPS) {
      const workerName = pp[step.key];
      if (workerName) {
        workload[step.key][workerName] = (workload[step.key][workerName] ?? 0) + 1;
      }
    }
  }

  // Per-step: unique units
  const stageUnits: Record<string, string[]> = {};
  for (const step of RELEASE_PLAN_STEPS) {
    const set = new Set<string>();
    for (const r of resources) {
      if (r.responsibility === step.responsibility && r.unit) set.add(r.unit);
    }
    stageUnits[step.key] = Array.from(set).sort();
  }

  // Reset when dialog opens or defaultPlan changes
  useEffect(() => {
    if (open) {
      setPlan(defaultPlan ? { ...defaultPlan } : {});
      setDate(getLocalDateStr());
      setEditingStep(null);
      // Auto-detect units from default plan workers
      const units: Record<string, string> = {};
      for (const step of RELEASE_PLAN_STEPS) {
        const stepUnits = stageUnits[step.key] ?? [];
        if (stepUnits.length === 1) {
          units[step.key] = stepUnits[0];
        } else if (defaultPlan?.[step.key]) {
          const match = resources.find(
            (r) => r.resource_name === defaultPlan[step.key] && r.responsibility === step.responsibility,
          );
          if (match?.unit) units[step.key] = match.unit;
        }
      }
      setUnitSelections(units);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultPlan]);

  // Filter steps (hide soaking if not in plan)
  const visibleSteps = RELEASE_PLAN_STEPS.filter(
    (s) => s.key !== "soaker" || plan.soaker || defaultPlan?.soaker,
  );

  // Get workers for a responsibility, filtered by selected unit
  const getWorkers = (stepKey: string, responsibility: string) => {
    let filtered = resources.filter((r) => r.responsibility === responsibility);
    if (unitSelections[stepKey]) {
      filtered = filtered.filter((r) => r.unit === unitSelections[stepKey]);
    }
    return filtered;
  };

  const handleUnitChange = (stepKey: string, unit: string) => {
    setUnitSelections((prev) => ({ ...prev, [stepKey]: unit }));
    // Clear worker if not in new unit
    const step = RELEASE_PLAN_STEPS.find((s) => s.key === stepKey)!;
    const workers = resources.filter((r) => r.responsibility === step.responsibility && r.unit === unit);
    if (plan[stepKey] && !workers.some((w) => w.resource_name === plan[stepKey])) {
      setPlan((prev) => ({ ...prev, [stepKey]: "" }));
    }
  };

  const allRequiredFilled = visibleSteps
    .filter((s) => s.key !== "soaker")
    .every((s) => !!plan[s.key]);

  const canSubmit = !!date && allRequiredFilled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Unlock className="w-5 h-5 text-green-600" />
              Release Finals
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-0.5">
            {garmentCount} final{garmentCount !== 1 ? "s" : ""} will enter production
          </p>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Assigned Date — prominent */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Assigned Date <span className="text-red-500">*</span>
            </Label>
            <DatePicker
              value={date}
              onChange={(d) => setDate(d ? toLocalDateStr(d) ?? "" : "")}
              className="h-9 text-sm font-semibold bg-white"
            />
          </div>

          {/* Production Plan — step rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Production Plan
              </Label>
              {defaultPlan && (
                <span className="text-xs text-muted-foreground">from brova</span>
              )}
            </div>

            <div className="space-y-1">
              {visibleSteps.map((step) => {
                const Icon = step.icon;
                const worker = plan[step.key] ?? "";
                const isEditing = editingStep === step.key;
                const units = stageUnits[step.key] ?? [];
                const stepWorkload = workload[step.key] ?? {};
                const hasMultipleUnits = units.length > 1;
                const selectedUnit = unitSelections[step.key] ?? "";
                const workers = getWorkers(step.key, step.responsibility);
                const workerUnit = worker
                  ? resources.find((r) => r.resource_name === worker && r.responsibility === step.responsibility)?.unit
                  : null;

                return (
                  <div key={step.key} className={cn(
                    "border rounded-lg transition-all",
                    isEditing ? "border-primary bg-primary/5" : "border-zinc-200 bg-white",
                  )}>
                    {/* Row: icon + label + unit + worker + edit button */}
                    <div
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors rounded-lg",
                        isEditing
                          ? "bg-primary/5"
                          : "hover:bg-muted/40 active:bg-muted/60",
                      )}
                      onClick={() => setEditingStep(isEditing ? null : step.key)}
                    >
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm", step.accent)}>
                        <Icon className={cn("w-4 h-4", step.color)} />
                      </div>
                      <span className="text-sm font-medium flex-1">{step.label}</span>
                      {worker ? (() => {
                        const wLoad = stepWorkload[worker] ?? 0;
                        const wRes = resources.find((r) => r.resource_name === worker && r.responsibility === step.responsibility);
                        const wCap = wRes?.daily_target ?? 0;
                        const wOver = wCap > 0 && wLoad >= wCap;
                        return (
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            {hasMultipleUnits && workerUnit && (
                              <span className="text-xs text-muted-foreground font-normal">{workerUnit} ·</span>
                            )}
                            {worker}
                            <span className={cn(
                              "text-xs font-bold tabular-nums",
                              wOver ? "text-red-500" : wLoad > 0 ? "text-orange-500" : "text-emerald-500",
                            )}>
                              {wCap > 0 ? `${wLoad}/${wCap}` : wLoad > 0 ? String(wLoad) : "0"}
                            </span>
                          </span>
                        );
                      })() : (
                        <span className="text-xs text-red-400 italic">not set</span>
                      )}
                      <div className={cn(
                        "w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors",
                        isEditing ? "bg-primary/10 text-primary" : "text-muted-foreground/30 hover:text-muted-foreground/60",
                      )}>
                        <Pencil className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Expanded: unit picker + worker select */}
                    {isEditing && (
                      <div className="px-3 pb-2.5 pt-0.5 space-y-2">
                        {/* Unit picker — only when multiple units */}
                        {hasMultipleUnits && (
                          <div>
                            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-1.5 block">
                              Unit
                            </Label>
                            <div className="flex gap-2">
                              {units.map((u) => (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleUnitChange(step.key, u); }}
                                  className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-all shadow-sm",
                                    "active:scale-95",
                                    selectedUnit === u
                                      ? "border-primary bg-primary text-white shadow-md"
                                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:shadow-md",
                                  )}
                                >
                                  {u}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Worker chips */}
                        {hasMultipleUnits && !selectedUnit ? (
                          <p className="text-xs text-muted-foreground italic py-1">Select a unit first</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {workers.map((r) => {
                              const load = stepWorkload[r.resource_name] ?? 0;
                              const cap = r.daily_target ?? 0;
                              const isOver = cap > 0 && load >= cap;
                              const isSelected = r.resource_name === worker;
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPlan((prev) => ({
                                      ...prev,
                                      [step.key]: isSelected ? "" : r.resource_name,
                                    }));
                                    if (!isSelected) setEditingStep(null);
                                  }}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 border-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all shadow-sm",
                                    "active:scale-95",
                                    isSelected
                                      ? "border-primary bg-primary text-white shadow-md"
                                      : isOver
                                        ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:shadow-md"
                                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:shadow-md",
                                  )}
                                >
                                  {r.resource_name}
                                  {r.resource_type === "Senior" && (
                                    <span className={cn(
                                      "text-xs font-bold uppercase",
                                      isSelected ? "text-white/80" : "text-amber-500",
                                    )}>Sr</span>
                                  )}
                                  <span className={cn(
                                    "text-xs font-bold tabular-nums",
                                    isSelected
                                      ? "text-white/70"
                                      : isOver
                                        ? "text-red-500"
                                        : load > 0
                                          ? "text-orange-500"
                                          : "text-emerald-500",
                                  )}>
                                    {cap > 0 ? `${load}/${cap}` : load > 0 ? String(load) : "0"}
                                  </span>
                                </button>
                              );
                            })}
                            {workers.length === 0 && (
                              <p className="text-xs text-muted-foreground italic">No workers for this stage</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t bg-white px-5 py-3 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-green-600 hover:bg-green-700 flex-1 max-w-[200px]"
            disabled={!canSubmit || isPending}
            onClick={() => {
              const finalPlan: Record<string, string> = {};
              for (const step of visibleSteps) {
                if (plan[step.key]) finalPlan[step.key] = plan[step.key];
              }
              onConfirm(finalPlan, date);
              onOpenChange(false);
            }}
          >
            <Unlock className="w-4 h-4 mr-1" />
            Release Finals
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── EmptyState / LoadingSkeleton ─────────────────────────────────────────────

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-2xl">
      <div className="text-muted-foreground/30 mb-3">{icon}</div>
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

function ParkingPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();
  const sendMut = useSendToScheduler();
  const sendReturnMut = useSendReturnToProduction();
  const releaseWithPlanMut = useReleaseFinalsWithPlan();

  // Split data
  const parked = allGarments.filter((g) => g.location === "workshop" && !g.in_production);
  const ordersGarments = parked.filter((g) => (g.trip_number ?? 1) === 1);
  const returnsGarments = parked.filter((g) => (g.trip_number ?? 1) > 1 && g.feedback_status !== "accepted");
  const orderGroups = groupByOrder(ordersGarments);

  // Build lookup of ALL garments per order (including in_production ones) for brova status
  const allGarmentsByOrder = new Map<number, WorkshopGarment[]>();
  for (const g of allGarments) {
    const list = allGarmentsByOrder.get(g.order_id) ?? [];
    list.push(g);
    allGarmentsByOrder.set(g.order_id, list);
  }

  // Separate: orders with waiting finals (for Release Finals tab)
  const waitingFinalsGroups = orderGroups.filter((og) => hasReleasableFinals(og.garments));

  // Fetch brova acceptance status and production plans for orders with waiting finals
  const waitingOrderIds = waitingFinalsGroups.map((og) => og.order_id);
  const { data: brovaStatusMap = {} } = useBrovaStatus(waitingOrderIds);
  const { data: brovaPlansMap = {} } = useBrovaPlans(waitingOrderIds);

  // Sort: ready orders first, then awaiting trial
  const sortedWaitingGroups = [...waitingFinalsGroups].sort((a, b) => {
    const aStatus = brovaStatusMap[a.order_id];
    const bStatus = brovaStatusMap[b.order_id];
    const aReady = !aStatus || aStatus.total === 0 || aStatus.accepted > 0;
    const bReady = !bStatus || bStatus.total === 0 || bStatus.accepted > 0;
    if (aReady && !bReady) return -1;
    if (!aReady && bReady) return 1;
    return 0;
  });
  const readyCount = sortedWaitingGroups.filter((og) => {
    const s = brovaStatusMap[og.order_id];
    return !s || s.total === 0 || s.accepted > 0;
  }).length;
  // Orders tab: only show orders that have schedulable garments (not fully waiting_for_acceptance)
  // Fully-blocked orders belong exclusively in the Release Finals tab
  const ordersTabGroups = orderGroups.filter((og) =>
    og.garments.some((g) => g.piece_stage !== "waiting_for_acceptance"),
  );

  // KPIs & classifications
  const waitingForBrova = waitingFinalsGroups.length;
  const returnCount = returnsGarments.length;
  const expressOrderGroups = ordersTabGroups.filter((og) => og.express);

  // Orders tab: overdue (past delivery date)
  const overdueOrderGroups = ordersTabGroups.filter((og) => {
    const dd = og.garments[0]?.delivery_date_order;
    if (!dd) return false;
    return new Date(dd).getTime() < Date.now();
  });

  // Orders with mixed garments (some schedulable, some waiting_for_acceptance)
  const mixedOrders = ordersTabGroups.filter((og) =>
    og.garments.some((g) => g.piece_stage === "waiting_for_acceptance"),
  );

  // Release finals: not-ready count
  const notReadyCount = sortedWaitingGroups.length - readyCount;

  // Filter state
  const [activeTab, setActiveTab] = useState("orders");
  const [orderFilter, setOrderFilter] = useState("all");
  const [finalsFilter, setFinalsFilter] = useState("all");
  const [returnFilter, setReturnFilter] = useState("all");

  // Stats per tab
  const orderStats: StatCard[] = [
    { label: "Total", value: ordersTabGroups.length, key: "all", color: "bg-zinc-50 text-zinc-700 border-zinc-200", icon: ClipboardList },
    { label: "Overdue", value: overdueOrderGroups.length, key: "overdue", color: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle },
    { label: "Has Finals", value: mixedOrders.length, key: "has-finals", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Clock },
    { label: "Express", value: expressOrderGroups.length, key: "express", color: "bg-orange-50 text-orange-700 border-orange-200", icon: Zap },
  ];

  const finalsStats: StatCard[] = [
    { label: "Total", value: sortedWaitingGroups.length, key: "all", color: "bg-zinc-50 text-zinc-700 border-zinc-200", icon: ClipboardList },
    { label: "Ready", value: readyCount, key: "ready", color: "bg-green-50 text-green-700 border-green-200", icon: Check },
    { label: "Awaiting Trial", value: notReadyCount, key: "awaiting", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  ];

  const returnStats: StatCard[] = [
    { label: "Total", value: returnCount, key: "all", color: "bg-zinc-50 text-zinc-700 border-zinc-200", icon: RotateCcw },
    { label: "Express", value: returnsGarments.filter((g) => g.express).length, key: "express", color: "bg-orange-50 text-orange-700 border-orange-200", icon: Zap },
  ];

  // Filtered data
  const filteredOrders = (() => {
    switch (orderFilter) {
      case "overdue": return overdueOrderGroups;
      case "has-finals": return mixedOrders;
      case "express": return expressOrderGroups;
      default: return ordersTabGroups;
    }
  })();

  const filteredWaitingGroups = (() => {
    switch (finalsFilter) {
      case "ready": return sortedWaitingGroups.filter((og) => {
        const s = brovaStatusMap[og.order_id];
        return !s || s.total === 0 || s.accepted > 0;
      });
      case "awaiting": return sortedWaitingGroups.filter((og) => {
        const s = brovaStatusMap[og.order_id];
        return s && s.total > 0 && s.accepted === 0;
      });
      default: return sortedWaitingGroups;
    }
  })();

  const filteredReturns = (() => {
    switch (returnFilter) {
      case "express": return returnsGarments.filter((g) => g.express);
      default: return returnsGarments;
    }
  })();

  // Reset filter when switching tabs
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setOrderFilter("all");
    setFinalsFilter("all");
    setReturnFilter("all");
  };

  // Orders tab selection (by order_id)
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  // Waiting finals selection
  const [selectedWaitingIds, setSelectedWaitingIds] = useState<Set<number>>(new Set());

  const toggleOrder = (orderId: number, checked: boolean) =>
    setSelectedOrderIds((prev) => {
      const n = new Set(prev);
      checked ? n.add(orderId) : n.delete(orderId);
      return n;
    });

  const toggleWaiting = (orderId: number, checked: boolean) =>
    setSelectedWaitingIds((prev) => {
      const n = new Set(prev);
      checked ? n.add(orderId) : n.delete(orderId);
      return n;
    });

  // Release finals plan dialog state
  const [releasePlanOpen, setReleasePlanOpen] = useState(false);
  const [releaseTargetIds, setReleaseTargetIds] = useState<string[]>([]);
  const [releaseDefaultPlan, setReleaseDefaultPlan] = useState<Record<string, string> | null>(null);

  // Warning confirmation dialog state (for releasing finals with un-accepted brovas)
  const [warningOpen, setWarningOpen] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");
  const [pendingReleaseAction, setPendingReleaseAction] = useState<(() => void) | null>(null);

  // Returns tab selection (by garment id)
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());

  const toggleReturn = (id: string, checked: boolean) =>
    setSelectedReturnIds((prev) => {
      const n = new Set(prev);
      checked ? n.add(id) : n.delete(id);
      return n;
    });

  // Get garment IDs from selected orders, excluding waiting_for_acceptance
  const getSelectedOrderGarmentIds = () =>
    orderGroups
      .filter((og) => selectedOrderIds.has(og.order_id))
      .flatMap((og) =>
        og.garments
          .filter((g) => g.piece_stage !== "waiting_for_acceptance")
          .map((g) => g.id),
      );

  // Per-card send to scheduler
  const handleSendSingleOrder = async (group: OrderGroup) => {
    const ids = group.garments
      .filter((g) => g.piece_stage !== "waiting_for_acceptance")
      .map((g) => g.id);
    if (!ids.length) {
      toast.error("No eligible garments (all waiting for brova trial)");
      return;
    }
    await sendMut.mutateAsync(ids);
    toast.success(`Order #${group.order_id} sent to Scheduler`);
  };

  const handleSendToScheduler = async () => {
    const ids = getSelectedOrderGarmentIds();
    if (!ids.length) {
      toast.error("No eligible garments to send (all may be waiting for brova trial)");
      return;
    }
    await sendMut.mutateAsync(ids);
    toast.success(`${selectedOrderIds.size} order(s) sent to Scheduler`);
    setSelectedOrderIds(new Set());
  };

  // Helper: check if an order is ready for finals release
  const isOrderReady = (orderId: number) => {
    const s = brovaStatusMap[orderId];
    if (!s || s.total === 0) return true; // no brovas = ready
    return s.accepted > 0;
  };

  // Build a warning message for non-ready orders
  const getBrovaWarning = (orderIds: number[]): string | null => {
    const warnings: string[] = [];
    for (const orderId of orderIds) {
      const s = brovaStatusMap[orderId];
      if (!s || s.total === 0) continue;
      if (s.trialed < s.total) {
        warnings.push(`Order #${orderId}: only ${s.trialed}/${s.total} brovas trialed`);
      } else if (s.accepted === 0) {
        warnings.push(`Order #${orderId}: all ${s.total} brovas were rejected`);
      }
    }
    return warnings.length > 0 ? warnings.join("\n") : null;
  };

  // Helper: get releasable final IDs from a group
  const getReleasableFinalIds = (group: OrderGroup) =>
    group.garments
      .filter((g) =>
        g.garment_type === "final" && (
          g.piece_stage === "waiting_for_acceptance" ||
          (g.piece_stage === "waiting_cut" && !g.in_production)
        ),
      )
      .map((g) => g.id);

  // Proceed to open the release dialog — pre-fill plan from brova's worker_history
  const openReleaseDialog = (ids: string[], orderId?: number) => {
    setReleaseTargetIds(ids);
    // Pre-fill from brova plans lookup (which now merges worker_history + production_plan)
    setReleaseDefaultPlan(orderId ? (brovaPlansMap[orderId] ?? null) : null);
    setReleasePlanOpen(true);
  };

  // Release finals — opens release dialog, or warning first if brovas not accepted
  const handleReleaseFinals = (group: OrderGroup) => {
    const ids = getReleasableFinalIds(group);
    if (!ids.length) return;

    if (!isOrderReady(group.order_id)) {
      const warning = getBrovaWarning([group.order_id]);
      setWarningMessage(warning ?? "Brovas have not been accepted for this order.");
      setPendingReleaseAction(() => () => openReleaseDialog(ids, group.order_id));
      setWarningOpen(true);
    } else {
      openReleaseDialog(ids, group.order_id);
    }
  };

  const handleReleaseFinalsBatch = () => {
    const selectedGroups = waitingFinalsGroups.filter((og) => selectedWaitingIds.has(og.order_id));
    const ids = selectedGroups.flatMap((og) => getReleasableFinalIds(og));
    if (!ids.length) return;

    const notReadyIds = selectedGroups.filter((og) => !isOrderReady(og.order_id)).map((og) => og.order_id);
    const firstOrderId = [...selectedWaitingIds][0];

    if (notReadyIds.length > 0) {
      const warning = getBrovaWarning(notReadyIds);
      setWarningMessage(warning ?? "Some orders have brovas that haven't been accepted.");
      setPendingReleaseAction(() => () => openReleaseDialog(ids, firstOrderId));
      setWarningOpen(true);
    } else {
      openReleaseDialog(ids, firstOrderId);
    }
  };

  const handleReleaseConfirm = async (plan: Record<string, string>, date: string) => {
    await releaseWithPlanMut.mutateAsync({ ids: releaseTargetIds, plan, date });
    toast.success(`${releaseTargetIds.length} final(s) released with plan`);
    setSelectedWaitingIds(new Set());
    setReleaseTargetIds([]);
  };

  const handleSendReturnSingle = async (id: string) => {
    await sendReturnMut.mutateAsync({ id, stage: "waiting_cut" as PieceStage });
    toast.success("Return sent to Scheduler");
  };

  const handleSendReturnBatch = async () => {
    await Promise.all(
      [...selectedReturnIds].map((id) =>
        sendReturnMut.mutateAsync({ id, stage: "waiting_cut" as PieceStage }),
      ),
    );
    toast.success(`${selectedReturnIds.size} return(s) sent to Scheduler`);
    setSelectedReturnIds(new Set());
  };

  return (
    <div className="p-6 max-w-4xl mx-auto pb-28">
      <div className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          <ParkingSquare className="w-6 h-6" /> Order Parking
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Received orders awaiting scheduling
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4 h-auto flex-wrap gap-1">
          <TabsTrigger value="orders">
            Orders{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              {ordersTabGroups.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="waiting-finals">
            Release Finals{" "}
            {readyCount > 0 ? (
              <Badge variant="secondary" className="ml-1 text-xs bg-green-100 text-green-800">
                {readyCount} ready
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-1 text-xs bg-amber-100 text-amber-800">
                {waitingForBrova}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="returns">
            Returns{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              {returnCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab-aware KPIs */}
        {activeTab === "orders" && (
          <StatsBar stats={orderStats} filter={orderFilter} onFilter={setOrderFilter} />
        )}
        {activeTab === "waiting-finals" && (
          <StatsBar stats={finalsStats} filter={finalsFilter} onFilter={setFinalsFilter} />
        )}
        {activeTab === "returns" && (
          <StatsBar stats={returnStats} filter={returnFilter} onFilter={setReturnFilter} />
        )}

        {/* ── ORDERS tab — order level ── */}
        <TabsContent value="orders">
          {isLoading ? (
            <LoadingSkeleton />
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              icon={<ParkingSquare className="w-10 h-10" />}
              message={orderFilter === "all" ? "Parking bay empty" : "No orders match this filter"}
            />
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((group) => (
                <ParkingOrderCard
                  key={group.order_id}
                  group={group}
                  allOrderGarments={allGarmentsByOrder.get(group.order_id) ?? group.garments}
                  selected={selectedOrderIds.has(group.order_id)}
                  onToggle={(checked) => toggleOrder(group.order_id, checked)}
                  onSendToScheduler={() => handleSendSingleOrder(group)}
                  isSending={sendMut.isPending}
                />
              ))}
            </div>
          )}
          <BatchActionBar
            count={selectedOrderIds.size}
            onClear={() => setSelectedOrderIds(new Set())}
          >
            <Button size="sm" onClick={handleSendToScheduler} disabled={sendMut.isPending}>
              Send to Scheduler
            </Button>
          </BatchActionBar>
        </TabsContent>

        {/* ── RELEASE FINALS tab ── */}
        <TabsContent value="waiting-finals">
          {isLoading ? (
            <LoadingSkeleton />
          ) : filteredWaitingGroups.length === 0 ? (
            <EmptyState
              icon={<Unlock className="w-10 h-10" />}
              message={finalsFilter === "all" ? "No finals waiting for release" : "No finals match this filter"}
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Orders with finals awaiting release. Green = brovas trialed &amp; accepted, ready to release.
              </p>
              <div className="space-y-3">
                {filteredWaitingGroups.map((group) => (
                  <WaitingFinalsCard
                    key={group.order_id}
                    group={group}
                    selected={selectedWaitingIds.has(group.order_id)}
                    onToggle={(checked) => toggleWaiting(group.order_id, checked)}
                    onRelease={() => handleReleaseFinals(group)}
                    isReleasing={releaseWithPlanMut.isPending}
                    brovaStatus={brovaStatusMap[group.order_id]}
                  />
                ))}
              </div>
            </>
          )}
          <BatchActionBar
            count={selectedWaitingIds.size}
            onClear={() => setSelectedWaitingIds(new Set())}
          >
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleReleaseFinalsBatch}
              disabled={releaseWithPlanMut.isPending}
            >
              <Unlock className="w-3.5 h-3.5 mr-1" />
              Release Selected Finals
            </Button>
          </BatchActionBar>
        </TabsContent>

        {/* ── RETURNS tab — garment level ── */}
        <TabsContent value="returns">
          {isLoading ? (
            <LoadingSkeleton />
          ) : filteredReturns.length === 0 ? (
            <EmptyState
              icon={<RotateCcw className="w-10 h-10" />}
              message={returnFilter === "all" ? "No returns in parking" : "No returns match this filter"}
            />
          ) : (
            <div className="space-y-3">
              {filteredReturns.map((g, i) => (
                <ReturnGarmentCard
                  key={g.id}
                  garment={g}
                  onSendSingle={() => handleSendReturnSingle(g.id)}
                  selected={selectedReturnIds.has(g.id)}
                  onSelect={toggleReturn}
                  isPending={sendReturnMut.isPending}
                  index={i}
                />
              ))}
            </div>
          )}
          <BatchActionBar
            count={selectedReturnIds.size}
            onClear={() => setSelectedReturnIds(new Set())}
          >
            <Button
              size="sm"
              onClick={handleSendReturnBatch}
              disabled={sendReturnMut.isPending}
            >
              Send to Scheduler
            </Button>
          </BatchActionBar>
        </TabsContent>
      </Tabs>

      <ReleaseFinalsDialog
        open={releasePlanOpen}
        onOpenChange={setReleasePlanOpen}
        onConfirm={handleReleaseConfirm}
        garmentCount={releaseTargetIds.length}
        defaultPlan={releaseDefaultPlan}
        isPending={releaseWithPlanMut.isPending}
      />

      {/* Warning dialog for releasing finals without brova acceptance */}
      <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              Brovas Not Accepted
            </DialogTitle>
            <DialogDescription className="text-left">
              You are about to release finals for production, but the brovas for this order have not been fully accepted.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 whitespace-pre-line">
            {warningMessage}
          </div>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to proceed? This will start final production without completed brova trials.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWarningOpen(false);
                setPendingReleaseAction(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                setWarningOpen(false);
                pendingReleaseAction?.();
                setPendingReleaseAction(null);
              }}
            >
              <AlertTriangle className="w-4 h-4 mr-1" />
              Release Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── StatsBar (clickable filterable KPIs) ─────────────────────

interface StatCard {
  label: string;
  value: number;
  key: string;
  color: string;
  icon: LucideIcon;
}

function StatsBar({
  stats,
  filter,
  onFilter,
}: {
  stats: StatCard[];
  filter: string;
  onFilter: (key: string) => void;
}) {
  return (
    <div className={cn(
      "grid gap-2 mb-5",
      stats.length <= 5 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-3 sm:grid-cols-6",
    )}>
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <button
            key={s.key}
            onClick={() => onFilter(s.key)}
            className={cn(
              "border rounded-xl p-2 text-center transition-all",
              s.color,
              filter === s.key
                ? "ring-2 ring-primary/40 shadow-md scale-[1.02]"
                : "shadow-sm hover:shadow-md",
            )}
          >
            <Icon className="w-3.5 h-3.5 mx-auto mb-0.5 opacity-60" />
            <p className="text-lg font-black leading-none">{s.value}</p>
            <p className="text-xs mt-0.5 uppercase tracking-wider font-bold opacity-70">{s.label}</p>
          </button>
        );
      })}
    </div>
  );
}
