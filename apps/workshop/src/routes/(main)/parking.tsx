import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments, useBrovaStatus, useBrovaPlans } from "@/hooks/useWorkshopGarments";
import {
  useSendToScheduler,
  useSendReturnToProduction,
  useReleaseFinals,
  useReleaseFinalsWithPlan,
} from "@/hooks/useGarmentMutations";
import { PlanDialog } from "@/components/shared/PlanDialog";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandBadge, ExpressBadge, StageBadge } from "@/components/shared/StageBadge";
import { cn, formatDate } from "@/lib/utils";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import { ParkingSquare, Clock, RotateCcw, Zap, Unlock, ChevronDown, ChevronUp, Package, Home, AlertTriangle } from "lucide-react";
import type { WorkshopGarment } from "@repo/database";
import type { PieceStage } from "@repo/database";

export const Route = createFileRoute("/(main)/parking")({
  component: ParkingPage,
  head: () => ({ meta: [{ title: "Parking" }] }),
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

const isAllWaitingAcceptance = (garments: WorkshopGarment[]) =>
  garments.every((g) => g.piece_stage === "waiting_for_acceptance");

const hasWaitingFinals = (garments: WorkshopGarment[]) =>
  garments.some((g) => g.piece_stage === "waiting_for_acceptance" && g.garment_type === "final");

// ── OrderCard (order-level for Orders tab) ───────────────────────────────────

function ParkingOrderCard({
  group,
  selected,
  onToggle,
  onSendToScheduler,
  isSending,
}: {
  group: OrderGroup;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onSendToScheduler: () => void;
  isSending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const allParked = isAllWaitingAcceptance(group.garments);
  const deliveryDate = group.garments[0]?.delivery_date_order;

  return (
    <div
      className={cn(
        "bg-white border rounded-xl transition-all shadow-sm border-l-4",
        group.express
          ? "border-l-orange-400 ring-1 ring-orange-200"
          : allParked
            ? "border-l-amber-400"
            : "border-l-border",
        selected && "border-primary ring-1 ring-primary/30",
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
            disabled={allParked}
            className="w-4 h-4 accent-primary cursor-pointer shrink-0 disabled:cursor-not-allowed mt-0.5"
          />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
              <span className="font-mono font-bold text-base shrink-0">#{group.order_id}</span>
              <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
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
              {allParked && (
                <Badge
                  variant="outline"
                  className="border-0 bg-amber-500 text-white text-[10px] font-semibold uppercase"
                >
                  Waiting for brova trial
                </Badge>
              )}
            </div>
            <div className="flex items-center flex-wrap gap-1.5">
              {group.invoice_number && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-mono">
                  INV-{group.invoice_number}
                </span>
              )}
              {group.customer_mobile && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                  {group.customer_mobile}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                <Package className="w-3 h-3" />
                {garmentSummary(group.garments)}
              </span>
              {deliveryDate && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                  <Clock className="w-3 h-3" />
                  {formatDate(deliveryDate)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            {!allParked && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onSendToScheduler(); }}
                disabled={isSending}
                className="text-xs h-7"
              >
                → Scheduler
              </Button>
            )}
            <div className={cn(
              "p-1.5 rounded-md transition-colors",
              expanded ? "bg-muted" : "text-muted-foreground",
            )}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
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
              <Badge
                variant="outline"
                className="border-0 text-[10px] font-semibold uppercase bg-zinc-200 text-zinc-800"
              >
                {PIECE_STAGE_LABELS[g.piece_stage as keyof typeof PIECE_STAGE_LABELS] ??
                  g.piece_stage}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const waitingGarments = group.garments.filter(
    (g) => g.piece_stage === "waiting_for_acceptance",
  );
  const deliveryDate = group.garments[0]?.delivery_date_order;

  // Determine readiness from brova status
  const noBrovas = !brovaStatus || brovaStatus.total === 0;
  const isReady = noBrovas || (brovaStatus.trialed === brovaStatus.total && brovaStatus.accepted > 0);
  const allRejected = !!(brovaStatus && brovaStatus.total > 0 && brovaStatus.trialed === brovaStatus.total && brovaStatus.accepted === 0);

  return (
    <div
      className={cn(
        "bg-white border rounded-xl transition-all shadow-sm border-l-4",
        group.express
          ? "border-l-orange-400 ring-1 ring-orange-200"
          : "border-l-amber-400",
        isReady ? "border-green-300 bg-green-50/40" : "border-amber-200 bg-amber-50/30",
        selected && "border-primary ring-1 ring-primary/30",
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
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
              <span className="font-mono font-bold text-base shrink-0">#{group.order_id}</span>
              <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
              {group.brands.map((b) => (
                <BrandBadge key={b} brand={b} />
              ))}
              {allRejected ? (
                <Badge
                  variant="outline"
                  className="border-0 bg-red-100 text-red-800 text-[10px] font-semibold uppercase"
                >
                  All brovas rejected
                </Badge>
              ) : isReady ? (
                <Badge
                  variant="outline"
                  className="border-0 bg-green-600 text-white text-[10px] font-semibold uppercase"
                >
                  {noBrovas ? "No brovas — ready" : "Ready for finals"}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-0 bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase"
                >
                  Awaiting trial ({brovaStatus!.trialed}/{brovaStatus!.total} trialed)
                </Badge>
              )}
            </div>
            <div className="flex items-center flex-wrap gap-1.5">
              {group.invoice_number && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-mono">
                  INV-{group.invoice_number}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                <Package className="w-3 h-3" />
                {garmentSummary(group.garments)}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                {waitingGarments.length} final{waitingGarments.length !== 1 ? "s" : ""}
              </span>
              {deliveryDate && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                  <Clock className="w-3 h-3" />
                  {formatDate(deliveryDate)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
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
      </div>

      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-2">
          {group.garments.map((g) => (
            <div key={g.id} className="bg-white rounded-lg border p-2 flex items-center gap-2 flex-wrap">
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
      index={index}
      actions={
        <Button size="sm" variant="outline" onClick={onSendSingle} disabled={isPending}>
          → Scheduler
        </Button>
      }
    />
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
  const releaseMut = useReleaseFinals();
  const releaseWithPlanMut = useReleaseFinalsWithPlan();

  // Split data
  const parked = allGarments.filter((g) => g.location === "workshop" && !g.in_production);
  const ordersGarments = parked.filter((g) => (g.trip_number ?? 1) === 1);
  const returnsGarments = parked.filter((g) => (g.trip_number ?? 1) > 1);
  const orderGroups = groupByOrder(ordersGarments);

  // Separate: orders with waiting finals (for Release Finals tab)
  const waitingFinalsGroups = orderGroups.filter((og) => hasWaitingFinals(og.garments));

  // Fetch brova acceptance status and production plans for orders with waiting finals
  const waitingOrderIds = waitingFinalsGroups.map((og) => og.order_id);
  const { data: brovaStatusMap = {} } = useBrovaStatus(waitingOrderIds);
  const { data: brovaPlansMap = {} } = useBrovaPlans(waitingOrderIds);

  // Sort: ready orders first, then awaiting trial
  const sortedWaitingGroups = [...waitingFinalsGroups].sort((a, b) => {
    const aStatus = brovaStatusMap[a.order_id];
    const bStatus = brovaStatusMap[b.order_id];
    const aReady = !aStatus || aStatus.total === 0 || (aStatus.trialed === aStatus.total && aStatus.accepted > 0);
    const bReady = !bStatus || bStatus.total === 0 || (bStatus.trialed === bStatus.total && bStatus.accepted > 0);
    if (aReady && !bReady) return -1;
    if (!aReady && bReady) return 1;
    return 0;
  });
  const readyCount = sortedWaitingGroups.filter((og) => {
    const s = brovaStatusMap[og.order_id];
    return !s || s.total === 0 || (s.trialed === s.total && s.accepted > 0);
  }).length;
  // KPIs
  const totalOrders = orderGroups.length;
  const waitingForBrova = waitingFinalsGroups.length;
  const returnCount = returnsGarments.length;
  const expressOrders = orderGroups.filter((og) => og.express).length;

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
    return s.trialed === s.total && s.accepted > 0;
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

  // Proceed to open the plan dialog for a set of garment IDs
  const openPlanDialog = (ids: string[], orderId?: number) => {
    setReleaseTargetIds(ids);
    setReleaseDefaultPlan(orderId ? (brovaPlansMap[orderId] ?? null) : null);
    setReleasePlanOpen(true);
  };

  // Release finals — opens plan dialog, or warning first if brovas not accepted
  const handleReleaseFinals = (group: OrderGroup) => {
    const ids = group.garments
      .filter((g) => g.piece_stage === "waiting_for_acceptance" && g.garment_type === "final")
      .map((g) => g.id);
    if (!ids.length) return;

    if (!isOrderReady(group.order_id)) {
      const warning = getBrovaWarning([group.order_id]);
      setWarningMessage(warning ?? "Brovas have not been accepted for this order.");
      setPendingReleaseAction(() => () => openPlanDialog(ids, group.order_id));
      setWarningOpen(true);
    } else {
      openPlanDialog(ids, group.order_id);
    }
  };

  const handleReleaseFinalsBatch = () => {
    const selectedGroups = waitingFinalsGroups.filter((og) => selectedWaitingIds.has(og.order_id));
    const ids = selectedGroups.flatMap((og) =>
      og.garments
        .filter((g) => g.piece_stage === "waiting_for_acceptance" && g.garment_type === "final")
        .map((g) => g.id),
    );
    if (!ids.length) return;

    const notReadyIds = selectedGroups.filter((og) => !isOrderReady(og.order_id)).map((og) => og.order_id);
    const firstOrderId = [...selectedWaitingIds][0];

    if (notReadyIds.length > 0) {
      const warning = getBrovaWarning(notReadyIds);
      setWarningMessage(warning ?? "Some orders have brovas that haven't been accepted.");
      setPendingReleaseAction(() => () => openPlanDialog(ids, firstOrderId));
      setWarningOpen(true);
    } else {
      openPlanDialog(ids, firstOrderId);
    }
  };

  const handleReleaseConfirm = async (plan: Record<string, string>, date: string, unit: string) => {
    await releaseWithPlanMut.mutateAsync({ ids: releaseTargetIds, plan, date, unit: unit || undefined });
    toast.success(`${releaseTargetIds.length} final(s) released with plan`);
    setSelectedWaitingIds(new Set());
    setReleaseTargetIds([]);
  };

  const handleSendReturnSingle = async (id: string) => {
    await sendReturnMut.mutateAsync({ id, stage: "needs_repair" as PieceStage });
    toast.success("Return sent to Scheduler");
  };

  const handleSendReturnBatch = async () => {
    await Promise.all(
      [...selectedReturnIds].map((id) =>
        sendReturnMut.mutateAsync({ id, stage: "needs_repair" as PieceStage }),
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

      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard
          icon={<ParkingSquare className="w-4 h-4 text-blue-700" />}
          label="Orders Parked"
          value={totalOrders}
          color="bg-blue-50 text-blue-700 border-blue-200"
        />
        <KpiCard
          icon={<Clock className="w-4 h-4 text-amber-700" />}
          label="Waiting Brova Trial"
          value={waitingForBrova}
          color="bg-amber-50 text-amber-700 border-amber-200"
        />
        <KpiCard
          icon={<RotateCcw className="w-4 h-4 text-orange-700" />}
          label="Return Garments"
          value={returnCount}
          color="bg-orange-50 text-orange-700 border-orange-200"
        />
        <KpiCard
          icon={<Zap className="w-4 h-4 text-red-700" />}
          label="Express Orders"
          value={expressOrders}
          color="bg-red-50 text-red-700 border-red-200"
        />
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="mb-4 h-auto flex-wrap gap-1">
          <TabsTrigger value="orders">
            Orders{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              {totalOrders}
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

        {/* ── ORDERS tab — order level ── */}
        <TabsContent value="orders">
          {isLoading ? (
            <LoadingSkeleton />
          ) : orderGroups.length === 0 ? (
            <EmptyState
              icon={<ParkingSquare className="w-10 h-10" />}
              message="Parking bay empty"
            />
          ) : (
            <div className="space-y-3">
              {orderGroups.map((group) => (
                <ParkingOrderCard
                  key={group.order_id}
                  group={group}
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
          ) : sortedWaitingGroups.length === 0 ? (
            <EmptyState
              icon={<Unlock className="w-10 h-10" />}
              message="No finals waiting for release"
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Orders with finals awaiting release. Green = brovas trialed &amp; accepted, ready to release.
              </p>
              <div className="space-y-3">
                {sortedWaitingGroups.map((group) => (
                  <WaitingFinalsCard
                    key={group.order_id}
                    group={group}
                    selected={selectedWaitingIds.has(group.order_id)}
                    onToggle={(checked) => toggleWaiting(group.order_id, checked)}
                    onRelease={() => handleReleaseFinals(group)}
                    isReleasing={releaseMut.isPending}
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
          ) : returnsGarments.length === 0 ? (
            <EmptyState
              icon={<RotateCcw className="w-10 h-10" />}
              message="No returns in parking"
            />
          ) : (
            <div className="space-y-3">
              {returnsGarments.map((g, i) => (
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

      <PlanDialog
        open={releasePlanOpen}
        onOpenChange={setReleasePlanOpen}
        onConfirm={handleReleaseConfirm}
        garmentCount={releaseTargetIds.length}
        defaultPlan={releaseDefaultPlan}
        title="Release Finals — Confirm Plan"
        confirmLabel="Release Finals"
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

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className={cn("border rounded-xl p-3 flex items-center gap-3", color ?? "bg-white")}>
      <div className="p-2 rounded-lg bg-white/60 shrink-0">{icon}</div>
      <div>
        <p className="text-xl font-black leading-none">{value}</p>
        <p className="text-xs mt-0.5 opacity-80">{label}</p>
      </div>
    </div>
  );
}
