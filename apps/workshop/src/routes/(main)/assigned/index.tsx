import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAssignedViewGarments } from "@/hooks/useWorkshopGarments";
import { ProductionPipeline } from "@/components/shared/ProductionPipeline";
import { StageBadge, BrandBadge, ExpressBadge, TrialBadge, AlterationInBadge } from "@/components/shared/StageBadge";
import { MetadataChip } from "@/components/shared/PageShell";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { cn, formatDate, groupByOrder, garmentSummary, type OrderGroup } from "@/lib/utils";
import {
  ClipboardList,
  ChevronDown,
  RotateCcw,
  Check,
  Play,
  Clock,
  Zap,
  Package,
  Timer,
  Home,
  AlertTriangle,
  Truck,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/assigned/")({
  component: AssignedPage,
  head: () => ({ meta: [{ title: "Production Tracker" }] }),
});

// helpers imported from @/lib/utils: groupByOrder, garmentSummary, OrderGroup

const STAGE_ORDER: Record<string, number> = {
  waiting_cut: 0, soaking: 1, cutting: 2, post_cutting: 3,
  sewing: 4, finishing: 5, ironing: 6, quality_check: 7,
  ready_for_dispatch: 8,
};

function getDeliveryUrgency(date?: string) {
  if (!date) return { badge: null, border: "", days: null };
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { badge: "text-red-700 bg-red-100", border: "border-l-red-500", days: diff };
  if (diff <= 2) return { badge: "text-orange-700 bg-orange-100", border: "border-l-orange-400", days: diff };
  if (diff <= 5) return { badge: "text-yellow-800 bg-yellow-100", border: "border-l-yellow-400", days: diff };
  return { badge: "text-green-700 bg-green-100", border: "border-l-green-400", days: diff };
}

// ── Order Card (clickable) ─────────────────────────────────────

function AssignedOrderCard({ group, onClick }: { group: OrderGroup; onClick: () => void }) {
  const urgency = getDeliveryUrgency(group.delivery_date);
  const brovas = group.garments.filter((g) => g.garment_type === "brova");
  const finals = group.garments.filter((g) => g.garment_type === "final");
  const statusLabel = (() => {
    const workshopSide = (g: WorkshopGarment) =>
      g.location === "workshop" || g.location === "transit_to_workshop";
    const atShop = (g: WorkshopGarment) => g.location === "shop";

    const allAtShop = group.garments.every(atShop);
    const workshopGarments = group.garments.filter((g) => g.location === "workshop");
    const allWorkshopReady =
      workshopGarments.length > 0 &&
      workshopGarments.every((g) => g.piece_stage === "ready_for_dispatch");
    const inTransitToShop = group.garments.filter((g) => g.location === "transit_to_shop");
    // Exclude parked finals (waiting_for_acceptance) from "active" counts
    const finalsActiveAtWorkshop = finals.filter((g) => workshopSide(g) && g.piece_stage !== "waiting_for_acceptance");
    const finalsParked = finals.filter((g) => g.piece_stage === "waiting_for_acceptance");
    const brovasAtWorkshop = brovas.filter(workshopSide);
    const brovasAllAtShop = brovas.length > 0 && brovas.every(atShop);

    const inTransitToShopBrovas = brovas.filter((g) => g.location === "transit_to_shop");
    const onlyParkedAtWorkshop = workshopGarments.length > 0 &&
      workshopGarments.every((g) => g.piece_stage === "waiting_for_acceptance");

    // Everything delivered back to shop — workshop side done
    if (allAtShop)
      return { text: "At shop", cls: "bg-green-100 text-green-800" };

    // Everything still at workshop is ready to go
    if (allWorkshopReady)
      return { text: "Ready for dispatch", cls: "bg-emerald-100 text-emerald-800" };

    // Shipped back, nothing left at workshop (or only parked finals)
    if (inTransitToShop.length > 0 && (workshopGarments.length === 0 || onlyParkedAtWorkshop))
      return { text: "In transit to shop", cls: "bg-sky-100 text-sky-800" };

    // Brovas in transit to shop, finals still parked
    if (inTransitToShopBrovas.length > 0 && finalsActiveAtWorkshop.length === 0)
      return { text: "Brovas in transit", cls: "bg-sky-100 text-sky-800" };

    // All brovas at shop, no active finals in workshop
    if (brovasAllAtShop && finalsActiveAtWorkshop.length === 0) {
      const anyAccepted = brovas.some((g) => g.acceptance_status === true);
      if (finalsParked.length > 0 && anyAccepted)
        return { text: "Awaiting finals release", cls: "bg-violet-100 text-violet-800" };
      if (finalsParked.length > 0)
        return { text: "Awaiting brova trial", cls: "bg-teal-100 text-teal-800" };
      return { text: "At shop", cls: "bg-green-100 text-green-800" };
    }

    // Finals actively in production at workshop
    if (finalsActiveAtWorkshop.length > 0)
      return { text: "Finals in production", cls: "bg-blue-100 text-blue-800" };

    // Brovas being produced at workshop
    if (brovasAtWorkshop.length > 0)
      return { text: "Brovas in production", cls: "bg-purple-100 text-purple-800" };

    return { text: "In production", cls: "bg-zinc-100 text-zinc-800" };
  })();

  const daysLabel = urgency.days !== null
    ? urgency.days < 0
      ? `${Math.abs(urgency.days)}d overdue`
      : urgency.days === 0
        ? "Due today"
        : `${urgency.days}d left`
    : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white border rounded-xl shadow-sm border-l-4 cursor-pointer transition-all",
        "hover:border-primary/50 hover:shadow-md active:bg-muted/30",
        urgency.border || "border-l-border",
        group.express && "ring-1 ring-orange-200",
      )}
    >
      <div className="px-3 py-2.5">
        {/* Row 1: identity left, metadata right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-sm">#{group.order_id}</span>
            <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
            {group.express && <ExpressBadge />}
            {group.home_delivery && (
              <MetadataChip icon={Home} variant="indigo">Delivery</MetadataChip>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn("text-xs font-semibold uppercase px-1.5 py-0.5 rounded", statusLabel.cls)}>
              {statusLabel.text}
            </span>
            <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground/40" />
          </div>
        </div>

        {/* Row 2: details spread */}
        <div className="flex items-center justify-between flex-wrap gap-2 mt-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {group.invoice_number && <span>INV-{group.invoice_number}</span>}
            <span className="flex items-center gap-0.5">
              <Package className="w-3 h-3" /> {garmentSummary(group.garments)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {group.delivery_date && (
              <span className={cn("font-semibold flex items-center gap-0.5", urgency.badge && "px-1.5 py-0.5 rounded", urgency.badge)}>
                <Clock className="w-3 h-3" />
                Due {formatDate(group.delivery_date)}
                {daysLabel && <span className="font-bold ml-0.5">({daysLabel})</span>}
              </span>
            )}
            {group.garments[0]?.assigned_date && (
              <span className="flex items-center gap-0.5 text-muted-foreground">
                <Timer className="w-3 h-3" /> Assigned {formatDate(group.garments[0].assigned_date)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Garment Row (for brova returns / alterations) ──────────────

function StandaloneGarmentRow({ garment, onClick }: { garment: WorkshopGarment; onClick: () => void }) {
  const tripNum = garment.trip_number ?? 1;
  const feedbackStatus = garment.feedback_status;
  const needsWorkAtShop =
    garment.location === "shop" &&
    (feedbackStatus === "needs_repair" || feedbackStatus === "needs_redo");
  const isBrovaReturn = needsWorkAtShop && (tripNum === 2 || tripNum === 3) && garment.garment_type === "brova";
  const isAlterationIn = needsWorkAtShop &&
    ((tripNum >= 4 && garment.garment_type === "brova") ||
     (tripNum >= 2 && garment.garment_type === "final"));
  const isAtShopPostProduction =
    garment.location === "shop" && !needsWorkAtShop;

  const locationLabel = garment.location === "shop" ? "At Shop"
    : garment.location === "workshop" ? "Workshop"
    : garment.location === "transit_to_shop" ? "Transit to Shop"
    : garment.location === "transit_to_workshop" ? "Transit to Workshop"
    : garment.location;

  const locationCls = garment.location === "shop" ? "bg-green-100 text-green-800"
    : garment.location === "workshop" ? "bg-blue-100 text-blue-800"
    : garment.location === "transit_to_shop" ? "bg-cyan-100 text-cyan-800"
    : garment.location === "transit_to_workshop" ? "bg-orange-100 text-orange-800"
    : "bg-zinc-100 text-zinc-800";

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white border rounded-xl px-4 py-3 shadow-sm cursor-pointer transition-all",
        "hover:border-primary/50 hover:shadow-md active:bg-muted/30",
        garment.express && "border-orange-200",
        isAlterationIn && "border-l-4 border-l-orange-500",
        isBrovaReturn && "border-l-4 border-l-amber-400",
      )}
    >
      {/* Row 1: ID + type + status badges */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "text-xs font-bold uppercase px-2 py-0.5 rounded border shrink-0",
              garment.garment_type === "brova"
                ? "bg-purple-100 text-purple-800 border-purple-200"
                : "bg-blue-100 text-blue-800 border-blue-200",
            )}
          >
            {garment.garment_type}
          </span>
          <span className="font-mono font-black text-base">{garment.garment_id}</span>
          {garment.customer_name && (
            <span className="text-sm text-muted-foreground truncate">{garment.customer_name}</span>
          )}
        </div>
        <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground/40 shrink-0" />
      </div>

      {/* Row 2: badges */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        <TrialBadge tripNumber={garment.trip_number} />
        {isAlterationIn ? (
          <AlterationInBadge />
        ) : isBrovaReturn ? (
          <span className="text-xs font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500 text-white">
            Brova Return
          </span>
        ) : (
          <StageBadge stage={garment.piece_stage} />
        )}
        <span className={cn("text-xs font-semibold uppercase px-1.5 py-0.5 rounded", locationCls)}>
          {locationLabel}
        </span>
        {garment.express && <ExpressBadge />}
        {isAtShopPostProduction && (
          <span className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded bg-green-100 text-green-800">
            Production Complete
          </span>
        )}
      </div>

      {/* Row 3: metadata */}
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        {garment.invoice_number && <span>INV-{garment.invoice_number}</span>}
        {garment.assigned_date && (
          <span className="flex items-center gap-0.5">
            <Timer className="w-3 h-3" /> Assigned {formatDate(garment.assigned_date)}
          </span>
        )}
      </div>

      {/* Pipeline */}
      {(garment.in_production || (isAtShopPostProduction && garment.production_plan)) && (
        <div className="mt-2">
          <ProductionPipeline currentStage={garment.piece_stage} compact hasSoaking={!!garment.soaking} />
        </div>
      )}
    </div>
  );
}

// ── Tab-aware KPI Stats ─────────────────────────────────────────

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
      stats.length <= 5 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-3 sm:grid-cols-7",
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

// ── Page ───────────────────────────────────────────────────────

function AssignedPage() {
  const { data: all = [], isLoading } = useAssignedViewGarments();
  const navigate = useNavigate();

  // Returns/alterations only show garments still at workshop or in transit — not sitting at shop
  const isWorkshopSide = (g: WorkshopGarment) =>
    g.location === "workshop" || g.location === "transit_to_workshop" || g.location === "transit_to_shop";

  // Split by trip number
  const regular = all.filter((g) => (g.trip_number ?? 1) === 1);
  // Brova returns: trip 2-3 (before alteration threshold)
  const brovaReturns = all.filter((g) =>
    g.garment_type === "brova" &&
    ((g.trip_number ?? 1) === 2 || (g.trip_number ?? 1) === 3) &&
    isWorkshopSide(g),
  );
  // Alterations: brova trip >= 4, final trip >= 2
  const alterations = all.filter((g) =>
    isWorkshopSide(g) &&
    (((g.trip_number ?? 0) >= 4 && g.garment_type === "brova") ||
     ((g.trip_number ?? 0) >= 2 && g.garment_type === "final")),
  );
  const orderGroups = groupByOrder(regular);

  // Order-level classifications
  const scheduled = orderGroups.filter((og) =>
    og.garments.every((g) =>
      g.piece_stage === "waiting_cut" || g.piece_stage === "soaking" ||
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
  const overdueOrders = orderGroups.filter((og) => {
    if (!og.delivery_date) return false;
    return new Date(og.delivery_date).getTime() < Date.now();
  });
  const dueSoonOrders = orderGroups.filter((og) => {
    if (!og.delivery_date) return false;
    const diff = Math.ceil((new Date(og.delivery_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 2;
  });

  // Garment-level classifications for returns/alterations
  const garmentAtShop = (g: WorkshopGarment) => g.location === "shop";
  const garmentInTransit = (g: WorkshopGarment) => g.location === "transit_to_workshop";
  const garmentInProduction = (g: WorkshopGarment) =>
    (g.location === "workshop" || g.location === "transit_to_workshop") &&
    g.piece_stage !== "ready_for_dispatch";
  const garmentReady = (g: WorkshopGarment) => g.piece_stage === "ready_for_dispatch";

  // Tab + filter state
  const [activeTab, setActiveTab] = useState("orders");
  const [orderFilter, setOrderFilter] = useState("all");
  const [returnFilter, setReturnFilter] = useState("all");
  const [alterationFilter, setAlterationFilter] = useState("all");

  // Stats per tab
  const orderStats: StatCard[] = [
    { label: "Total", value: orderGroups.length, key: "all", color: "bg-zinc-50 text-zinc-700 border-zinc-200", icon: ClipboardList },
    { label: "Overdue", value: overdueOrders.length, key: "overdue", color: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle },
    { label: "Due Soon", value: dueSoonOrders.length, key: "due-soon", color: "bg-orange-50 text-orange-700 border-orange-200", icon: Clock },
    { label: "Scheduled", value: scheduled.length, key: "scheduled", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock },
    { label: "Active", value: active.length, key: "active", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Play },
    { label: "Ready", value: readyForDispatch.length, key: "ready", color: "bg-green-50 text-green-700 border-green-200", icon: Check },
    { label: "Express", value: expressOrders.length, key: "express", color: "bg-orange-50 text-orange-700 border-orange-200", icon: Zap },
  ];

  const returnStats: StatCard[] = [
    { label: "Total", value: brovaReturns.length, key: "all", color: "bg-zinc-50 text-zinc-700 border-zinc-200", icon: RotateCcw },
    { label: "At Shop", value: brovaReturns.filter(garmentAtShop).length, key: "at-shop", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Store },
    { label: "In Transit", value: brovaReturns.filter(garmentInTransit).length, key: "in-transit", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Truck },
    { label: "In Production", value: brovaReturns.filter(garmentInProduction).length, key: "in-production", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Play },
    { label: "Ready", value: brovaReturns.filter(garmentReady).length, key: "ready", color: "bg-green-50 text-green-700 border-green-200", icon: Check },
  ];

  const alterationStats: StatCard[] = [
    { label: "Total", value: alterations.length, key: "all", color: "bg-zinc-50 text-zinc-700 border-zinc-200", icon: RotateCcw },
    { label: "At Shop", value: alterations.filter(garmentAtShop).length, key: "at-shop", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Store },
    { label: "In Transit", value: alterations.filter(garmentInTransit).length, key: "in-transit", color: "bg-blue-50 text-blue-700 border-blue-200", icon: Truck },
    { label: "In Production", value: alterations.filter(garmentInProduction).length, key: "in-production", color: "bg-purple-50 text-purple-700 border-purple-200", icon: Play },
    { label: "Ready", value: alterations.filter(garmentReady).length, key: "ready", color: "bg-green-50 text-green-700 border-green-200", icon: Check },
  ];

  // Filtered data based on active tab + filter
  const filteredOrders = (() => {
    switch (orderFilter) {
      case "overdue": return overdueOrders;
      case "due-soon": return dueSoonOrders;
      case "scheduled": return scheduled;
      case "active": return active;
      case "ready": return readyForDispatch;
      case "express": return expressOrders;
      default: return orderGroups;
    }
  })();

  const filteredReturns = (() => {
    switch (returnFilter) {
      case "at-shop": return brovaReturns.filter(garmentAtShop);
      case "in-transit": return brovaReturns.filter(garmentInTransit);
      case "in-production": return brovaReturns.filter(garmentInProduction);
      case "ready": return brovaReturns.filter(garmentReady);
      default: return brovaReturns;
    }
  })();

  const filteredAlterations = (() => {
    switch (alterationFilter) {
      case "at-shop": return alterations.filter(garmentAtShop);
      case "in-transit": return alterations.filter(garmentInTransit);
      case "in-production": return alterations.filter(garmentInProduction);
      case "ready": return alterations.filter(garmentReady);
      default: return alterations;
    }
  })();

  const ordersPagination = usePagination(filteredOrders, 20);
  const returnsPagination = usePagination(filteredReturns, 20);
  const alterationsPagination = usePagination(filteredAlterations, 20);

  const handleOrderClick = (orderId: number) => {
    navigate({ to: "/assigned/$orderId", params: { orderId: String(orderId) } });
  };

  const handleGarmentClick = (g: WorkshopGarment) => {
    navigate({ to: "/assigned/$orderId", params: { orderId: String(g.order_id) } });
  };

  // Reset filter when switching tabs
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === "orders") setOrderFilter("all");
    if (tab === "brova-returns") setReturnFilter("all");
    if (tab === "alterations") setAlterationFilter("all");
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-10">
      <div className="mb-5">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          <ClipboardList className="w-6 h-6" /> Production Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {all.length} garment{all.length !== 1 ? "s" : ""} across {orderGroups.length} order{orderGroups.length !== 1 ? "s" : ""}
          {brovaReturns.length > 0 && <> &middot; {brovaReturns.length} brova return{brovaReturns.length !== 1 ? "s" : ""}</>}
          {alterations.length > 0 && <> &middot; {alterations.length} alteration{alterations.length !== 1 ? "s" : ""}</>}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4">
          <TabsTrigger value="orders">
            Orders <Badge variant="secondary" className="ml-1 text-xs">{orderGroups.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="brova-returns">
            Brova Returns <Badge variant="secondary" className="ml-1 text-xs">{brovaReturns.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="alterations">
            Alterations <Badge variant="secondary" className="ml-1 text-xs">{alterations.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab-aware KPIs */}
        {activeTab === "orders" && (
          <StatsBar stats={orderStats} filter={orderFilter} onFilter={setOrderFilter} />
        )}
        {activeTab === "brova-returns" && (
          <StatsBar stats={returnStats} filter={returnFilter} onFilter={setReturnFilter} />
        )}
        {activeTab === "alterations" && (
          <StatsBar stats={alterationStats} filter={alterationFilter} onFilter={setAlterationFilter} />
        )}


        <TabsContent value="orders" className="mt-0">
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl">
              <ClipboardList className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">No orders match this filter</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {ordersPagination.paged.map((group) => (
                  <AssignedOrderCard
                    key={group.order_id}
                    group={group}
                    onClick={() => handleOrderClick(group.order_id)}
                  />
                ))}
              </div>
              <Pagination
                page={ordersPagination.page}
                totalPages={ordersPagination.totalPages}
                onPageChange={ordersPagination.setPage}
                totalItems={ordersPagination.totalItems}
                pageSize={ordersPagination.pageSize}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="brova-returns" className="mt-0">
          {filteredReturns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl">
              <RotateCcw className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">
                {returnFilter === "all" ? "No brova returns in production" : "No returns match this filter"}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {returnsPagination.paged.map((g) => (
                  <StandaloneGarmentRow key={g.id} garment={g} onClick={() => handleGarmentClick(g)} />
                ))}
              </div>
              <Pagination
                page={returnsPagination.page}
                totalPages={returnsPagination.totalPages}
                onPageChange={returnsPagination.setPage}
                totalItems={returnsPagination.totalItems}
                pageSize={returnsPagination.pageSize}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="alterations" className="mt-0">
          {filteredAlterations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl">
              <RotateCcw className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">
                {alterationFilter === "all" ? "No alterations in production" : "No alterations match this filter"}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {alterationsPagination.paged.map((g) => (
                  <StandaloneGarmentRow key={g.id} garment={g} onClick={() => handleGarmentClick(g)} />
                ))}
              </div>
              <Pagination
                page={alterationsPagination.page}
                totalPages={alterationsPagination.totalPages}
                onPageChange={alterationsPagination.setPage}
                totalItems={alterationsPagination.totalItems}
                pageSize={alterationsPagination.pageSize}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
