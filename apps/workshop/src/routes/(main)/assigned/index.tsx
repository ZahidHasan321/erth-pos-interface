import { Fragment, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAssignedViewGarments } from "@/hooks/useWorkshopGarments";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrandBadge, StageBadge } from "@/components/shared/StageBadge";
import { PageHeader, GarmentTypeBadgeCompact } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@repo/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { Badge } from "@repo/ui/badge";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { cn, clickableProps, formatDate, groupByOrder, garmentSummary, type OrderGroup } from "@/lib/utils";
import {
  ClipboardList,
  ChevronDown,
  RotateCcw,
  Clock,
  Package,
  Home,
  Zap,
  Droplets,
  ArrowRight,
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
  if (!date) return { cls: null, border: "", days: null };
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { cls: "text-red-600 font-bold", border: "border-l-red-500", days: diff };
  if (diff <= 2) return { cls: "text-orange-600 font-bold", border: "border-l-orange-400", days: diff };
  if (diff <= 5) return { cls: "text-yellow-700", border: "border-l-yellow-400", days: diff };
  return { cls: "text-green-700", border: "border-l-green-400", days: diff };
}

// ── Extracted helpers for status/location ─────────────────────

function getOrderStatusLabel(
  group: OrderGroup,
  brovas: WorkshopGarment[],
  finals: WorkshopGarment[],
) {
  const workshopSide = (g: WorkshopGarment) =>
    g.location === "workshop" || g.location === "transit_to_workshop";
  const atShop = (g: WorkshopGarment) => g.location === "shop";

  const allAtShop = group.garments.every(atShop);
  const workshopGarments = group.garments.filter((g) => g.location === "workshop");
  const allWorkshopReady =
    workshopGarments.length > 0 &&
    workshopGarments.every((g) => g.piece_stage === "ready_for_dispatch");
  const inTransitToShop = group.garments.filter((g) => g.location === "transit_to_shop");
  const finalsActiveAtWorkshop = finals.filter((g) => workshopSide(g) && g.piece_stage !== "waiting_for_acceptance");
  const finalsParked = finals.filter((g) => g.piece_stage === "waiting_for_acceptance");
  const brovasAtWorkshop = brovas.filter(workshopSide);
  const brovasAllAtShop = brovas.length > 0 && brovas.every(atShop);

  const inTransitToShopBrovas = brovas.filter((g) => g.location === "transit_to_shop");
  const onlyParkedAtWorkshop = workshopGarments.length > 0 &&
    workshopGarments.every((g) => g.piece_stage === "waiting_for_acceptance");

  if (allAtShop)
    return { text: "At shop", cls: "text-green-700" };
  if (allWorkshopReady)
    return { text: "Ready for dispatch", cls: "text-emerald-700" };
  if (inTransitToShop.length > 0 && (workshopGarments.length === 0 || onlyParkedAtWorkshop))
    return { text: "In transit to shop", cls: "text-sky-700" };
  if (inTransitToShopBrovas.length > 0 && finalsActiveAtWorkshop.length === 0)
    return { text: "Brovas in transit", cls: "text-sky-700" };
  if (brovasAllAtShop && finalsActiveAtWorkshop.length === 0) {
    const anyAccepted = brovas.some((g) => g.acceptance_status === true);
    if (finalsParked.length > 0 && anyAccepted)
      return { text: "Awaiting finals release", cls: "text-violet-700" };
    if (finalsParked.length > 0)
      return { text: "Awaiting brova trial", cls: "text-teal-700" };
    return { text: "At shop", cls: "text-green-700" };
  }
  if (finalsActiveAtWorkshop.length > 0)
    return { text: "Finals in production", cls: "text-blue-700" };
  if (brovasAtWorkshop.length > 0)
    return { text: "Brovas in production", cls: "text-purple-700" };
  return { text: "In production", cls: "text-zinc-600" };
}


// ── Garment Mini Cards (shared between card & table) ─────────

function getWorkerName(garment: WorkshopGarment): string | null {
  const plan = garment.production_plan as Record<string, string> | null;
  if (!plan) return null;
  const stage = garment.piece_stage;
  const stageToKey: Record<string, string> = {
    soaking: "soaker", cutting: "cutter", post_cutting: "post_cutter",
    sewing: "sewer", finishing: "finisher", ironing: "ironer", quality_check: "quality_checker",
  };
  return plan[stageToKey[stage ?? ""] ?? ""] || null;
}

function GarmentMiniCards({ garments }: { garments: WorkshopGarment[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
      {garments.map((g) => {
        const tripNum = g.trip_number ?? 1;
        const isReturn = tripNum > 1;
        const worker = getWorkerName(g);

        return (
          <div
            key={g.id}
            className={cn(
              "p-2 bg-background rounded-lg border border-border/60 text-sm shadow-sm",
              isReturn && "border-l-2 border-l-amber-400",
              g.express && "ring-1 ring-red-200",
            )}
          >
            {/* Header: ID + badges */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <GarmentTypeBadgeCompact type={g.garment_type ?? "final"} />
                <span className="font-mono font-medium text-xs text-muted-foreground">
                  {g.garment_id ?? g.id.slice(0, 8)}
                </span>
                {g.express && <Zap className="w-3 h-3 text-red-500 fill-red-500" />}
                {g.soaking && <Droplets className="w-3 h-3 text-sky-500" />}
                {isReturn && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1 rounded">
                    Trip {tripNum}
                  </span>
                )}
              </div>
              <StageBadge stage={g.piece_stage} className="text-[10px] py-0" />
            </div>

            {/* Details */}
            <div className="space-y-1">
              {worker && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px] uppercase font-bold">Worker</span>
                  <span className="text-xs font-medium truncate max-w-[120px]">{worker}</span>
                </div>
              )}
              {g.style_name && (
                <div className="pt-1 border-t border-border/40">
                  <span className="text-xs font-medium text-primary leading-tight">{g.style_name}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Order Card (mobile) ──────────────────────────────────────

function AssignedOrderCard({
  group,
  expanded,
  onToggle,
}: {
  group: OrderGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const urgency = getDeliveryUrgency(group.delivery_date);
  const brovas = group.garments.filter((g) => g.garment_type === "brova");
  const finals = group.garments.filter((g) => g.garment_type === "final");
  const statusLabel = getOrderStatusLabel(group, brovas, finals);

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
        "bg-card border rounded-xl shadow-sm border-l-4 transition-[color,background-color,border-color,box-shadow]",
        urgency.border || "border-l-border",
        group.express && "ring-1 ring-red-200",
      )}
    >
      <div
        className="px-3 py-2.5 cursor-pointer hover:bg-muted/30 active:bg-muted/40"
        onClick={onToggle}
        {...clickableProps(onToggle)}
      >
        {/* Row 1: identity left, metadata right */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-sm">#{group.order_id}</span>
            <OrderIndicators group={group} />
            <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn("text-xs font-semibold uppercase whitespace-nowrap", statusLabel.cls)}>
              {statusLabel.text}
            </span>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground/40 transition-transform", expanded && "rotate-180")} />
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

          <div className="flex items-center gap-3 text-xs">
            {group.delivery_date && (
              <span className={cn("font-semibold flex items-center gap-0.5", urgency.cls)}>
                <Clock className="w-3 h-3" />
                Due {formatDate(group.delivery_date)}
                {daysLabel && <span className="font-bold ml-0.5">({daysLabel})</span>}
              </span>
            )}
            <Link
              to="/assigned/$orderId"
              params={{ orderId: String(group.order_id) }}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Details
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Expanded garment cards */}
      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t">
          <GarmentMiniCards garments={group.garments} />
        </div>
      )}
    </div>
  );
}

// ── Inline order indicators ──────────────────────────────────

function OrderIndicators({ group }: { group: OrderGroup }) {
  const hasReturns = group.garments.some((g) => (g.trip_number ?? 1) > 1);
  const hasSoaking = group.garments.some((g) => g.soaking);

  return (
    <span className="inline-flex items-center gap-1 ml-1.5">
      {group.express && (
        <span className="text-red-500" title="Express">
          <Zap className="w-3.5 h-3.5 fill-red-500" />
        </span>
      )}
      {group.home_delivery && (
        <span className="text-indigo-500" title="Home delivery">
          <Home className="w-3.5 h-3.5" />
        </span>
      )}
      {hasSoaking && (
        <span className="text-sky-500" title="Soaking required">
          <Droplets className="w-3.5 h-3.5" />
        </span>
      )}
      {hasReturns && (
        <span className="text-amber-500" title="Has returns">
          <RotateCcw className="w-3.5 h-3.5" />
        </span>
      )}
    </span>
  );
}

// ── Orders Table (desktop) ────────────────────────────────────

function OrdersTable({
  orders,
  expandedId,
  onToggle,
}: {
  orders: OrderGroup[];
  expandedId: number | null;
  onToggle: (id: number) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Order</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Garments</TableHead>
          <TableHead>Delivery</TableHead>
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((group) => {
          const urgency = getDeliveryUrgency(group.delivery_date);
          const brovas = group.garments.filter((g) => g.garment_type === "brova");
          const finals = group.garments.filter((g) => g.garment_type === "final");
          const statusLabel = getOrderStatusLabel(group, brovas, finals);
          const isExpanded = expandedId === group.order_id;
          const daysLabel = urgency.days !== null
            ? urgency.days < 0
              ? `${Math.abs(urgency.days)}d overdue`
              : urgency.days === 0
                ? "Due today"
                : `${urgency.days}d left`
            : null;

          return (
            <Fragment key={group.order_id}>
              <TableRow
                onClick={() => onToggle(group.order_id)}
                className={cn(
                  "cursor-pointer",
                  group.express && "bg-orange-50/30",
                  urgency.days !== null && urgency.days < 0 && "border-l-2 border-l-red-500",
                  isExpanded && "bg-muted/20 border-b-0",
                )}
              >
                <TableCell className="px-2">
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                </TableCell>
                <TableCell className="text-xs">
                  <div className="flex items-center">
                    <span className="font-mono font-bold">#{group.order_id}</span>
                    <OrderIndicators group={group} />
                  </div>
                  {group.invoice_number && (
                    <span className="text-[10px] text-muted-foreground">INV-{group.invoice_number}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs max-w-[160px] truncate">
                  {group.customer_name ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={cn("text-xs font-semibold uppercase px-1.5 py-0.5 rounded whitespace-nowrap", statusLabel.cls)}>
                    {statusLabel.text}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {garmentSummary(group.garments)}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {group.delivery_date ? (
                    <span className={cn("font-semibold flex items-center gap-1", urgency.cls)}>
                      <Clock className="w-3 h-3" />
                      {formatDate(group.delivery_date)}
                      {daysLabel && <span className="font-bold">({daysLabel})</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="px-2">
                  <Link
                    to="/assigned/$orderId"
                    params={{ orderId: String(group.order_id) }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Details
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </TableCell>
              </TableRow>
              {isExpanded && (
                <TableRow key={`${group.order_id}-detail`}>
                  <TableCell colSpan={8} className="bg-muted/10 p-0 border-b">
                    <div className="p-3 pl-10">
                      <GarmentMiniCards garments={group.garments} />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Filter Chips (no component needed — uses shared Tabs) ─

// ── Page ───────────────────────────────────────────────────────

function AssignedPage() {
  const { data: all = [], isLoading } = useAssignedViewGarments();
  const isMobile = useIsMobile();

  // Group ALL garments by order (including returns/alterations)
  const orderGroupsUnsorted = groupByOrder(all);

  // Sort: overdue first, then due soon, then express, then delivery date asc
  const orderGroups = [...orderGroupsUnsorted].sort((a, b) => {
    const now = Date.now();
    const daysA = a.delivery_date ? Math.ceil((new Date(a.delivery_date).getTime() - now) / 86400000) : 999;
    const daysB = b.delivery_date ? Math.ceil((new Date(b.delivery_date).getTime() - now) / 86400000) : 999;
    const overdueA = daysA < 0 ? 1 : 0;
    const overdueB = daysB < 0 ? 1 : 0;
    if (overdueA !== overdueB) return overdueB - overdueA;
    if (a.express && !b.express) return -1;
    if (!a.express && b.express) return 1;
    return daysA - daysB;
  });

  // Order-level classifications
  const active = orderGroups.filter((og) =>
    og.garments.some((g) => {
      const so = STAGE_ORDER[g.piece_stage ?? ""] ?? 0;
      // Active = soaking (with start_time) through quality_check
      return (so === 1 && g.start_time) || (so >= 2 && so <= 7);
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
  const returningOrders = orderGroups.filter((og) =>
    og.garments.some((g) => (g.trip_number ?? 1) > 1),
  );
  const homeDeliveryOrders = orderGroups.filter((og) => og.home_delivery);
  const soakingOrders = orderGroups.filter((og) =>
    og.garments.some((g) => g.soaking),
  );

  const [orderFilter, setOrderFilter] = useState("all");
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const toggleExpanded = (id: number) =>
    setExpandedOrderId((prev) => (prev === id ? null : id));

  const filters = [
    { label: "All", count: orderGroups.length, key: "all" },
    { label: "Overdue", count: overdueOrders.length, key: "overdue", badgeCls: "bg-red-100 text-red-700" },
    { label: "Due Soon", count: dueSoonOrders.length, key: "due-soon", badgeCls: "bg-orange-100 text-orange-700" },
    { label: "Active", count: active.length, key: "active", badgeCls: "bg-emerald-100 text-emerald-700" },
    { label: "Ready", count: readyForDispatch.length, key: "ready", badgeCls: "bg-green-100 text-green-700" },
    { label: "Express", count: expressOrders.length, key: "express", badgeCls: "bg-red-100 text-red-700" },
    { label: "Returns", count: returningOrders.length, key: "returns", badgeCls: "bg-amber-100 text-amber-700" },
    { label: "Delivery", count: homeDeliveryOrders.length, key: "home-delivery", badgeCls: "bg-indigo-100 text-indigo-700" },
    { label: "Soaking", count: soakingOrders.length, key: "soaking", badgeCls: "bg-sky-100 text-sky-700" },
  ];

  const filteredOrders = (() => {
    switch (orderFilter) {
      case "overdue": return overdueOrders;
      case "due-soon": return dueSoonOrders;
      case "active": return active;
      case "ready": return readyForDispatch;
      case "express": return expressOrders;
      case "returns": return returningOrders;
      case "home-delivery": return homeDeliveryOrders;
      case "soaking": return soakingOrders;
      default: return orderGroups;
    }
  })();

  const ordersPagination = usePagination(filteredOrders, 20);

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader
        icon={ClipboardList}
        title="Production Tracker"
        subtitle={`${all.length} garment${all.length !== 1 ? "s" : ""} across ${orderGroups.length} order${orderGroups.length !== 1 ? "s" : ""}${returningOrders.length > 0 ? ` · ${returningOrders.length} with returns` : ""}`}
      />

      <Tabs value={orderFilter} onValueChange={setOrderFilter} className="mb-3">
        <TabsList className="h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
          {filters.map((f) => (
            <TabsTrigger key={f.key} value={f.key} className="gap-1.5">
              {f.label}
              <Badge variant="secondary" className={cn("ml-0.5 text-xs", f.badgeCls)}>
                {f.count}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-card border rounded-xl border-l-4 border-l-border p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-4 w-12 rounded" />
                </div>
                <Skeleton className="h-4 w-28 rounded" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3.5 w-16 rounded" />
                  <Skeleton className="h-3.5 w-20 rounded" />
                </div>
                <Skeleton className="h-3.5 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-xl bg-muted/5">
          <ClipboardList className="w-8 h-8 text-muted-foreground/20 mb-3" />
          <p className="font-semibold text-muted-foreground">No orders match this filter</p>
        </div>
      ) : (
        <>
          {isMobile ? (
            <div className="space-y-2">
              {ordersPagination.paged.map((group) => (
                <AssignedOrderCard
                  key={group.order_id}
                  group={group}
                  expanded={expandedOrderId === group.order_id}
                  onToggle={() => toggleExpanded(group.order_id)}
                />
              ))}
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <OrdersTable
                orders={ordersPagination.paged}
                expandedId={expandedOrderId}
                onToggle={toggleExpanded}
              />
            </div>
          )}
          <Pagination
            page={ordersPagination.page}
            totalPages={ordersPagination.totalPages}
            onPageChange={ordersPagination.setPage}
            totalItems={ordersPagination.totalItems}
            pageSize={ordersPagination.pageSize}
          />
        </>
      )}
    </div>
  );
}
