import { Fragment, useState, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAssignedViewGarments } from "@/hooks/useWorkshopGarments";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrandBadge, StageBadge } from "@/components/shared/StageBadge";
import { StatusPill, type PillColor } from "@/components/shared/StatusPill";
import { PageHeader, GarmentTypeBadgeCompact } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@repo/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { Badge } from "@repo/ui/badge";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { cn, clickableProps, formatDate, groupByOrder, garmentSummary, parseUtcTimestamp, type OrderGroup } from "@/lib/utils";
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
  AlertTriangle,
  Activity,
  CheckCircle2,
  LayoutDashboard,
  List,
  X,
  Store,
  Truck,
} from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/assigned/")({
  component: AssignedPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
    filter: (search.filter as string) || undefined,
  }),
  head: () => ({ meta: [{ title: "Production Tracker" }] }),
});

// ── Helpers ───────────────────────────────────────────────────

const STAGE_ORDER: Record<string, number> = {
  waiting_cut: 0, soaking: 1, cutting: 2, post_cutting: 3,
  sewing: 4, finishing: 5, ironing: 6, quality_check: 7,
  ready_for_dispatch: 8,
};

function getDeliveryUrgency(date?: string) {
  if (!date) return { cls: null, border: "", days: null };
  const diff = Math.ceil((parseUtcTimestamp(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { cls: "text-red-600 font-bold", border: "border-l-red-500", days: diff };
  if (diff <= 2) return { cls: "text-orange-600 font-bold", border: "border-l-orange-400", days: diff };
  if (diff <= 5) return { cls: "text-yellow-700", border: "border-l-yellow-400", days: diff };
  return { cls: "text-green-700", border: "border-l-green-400", days: diff };
}

function getOrderStatusLabel(
  group: OrderGroup,
  brovas: WorkshopGarment[],
  finals: WorkshopGarment[],
): { text: string; color: PillColor } {
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
    return { text: "At shop", color: "green" };
  if (allWorkshopReady)
    return { text: "Ready for dispatch", color: "emerald" };
  if (inTransitToShop.length > 0 && (workshopGarments.length === 0 || onlyParkedAtWorkshop))
    return { text: "In transit to shop", color: "sky" };
  if (inTransitToShopBrovas.length > 0 && finalsActiveAtWorkshop.length === 0)
    return { text: "Brovas in transit", color: "sky" };
  if (brovasAllAtShop && finalsActiveAtWorkshop.length === 0) {
    const anyAccepted = brovas.some((g) => g.acceptance_status === true);
    if (finalsParked.length > 0 && anyAccepted)
      return { text: "Awaiting finals release", color: "violet" };
    if (finalsParked.length > 0)
      return { text: "Awaiting brova trial", color: "teal" };
    return { text: "At shop", color: "green" };
  }
  if (finalsActiveAtWorkshop.length > 0)
    return { text: "Finals in production", color: "blue" };
  if (brovasAtWorkshop.length > 0)
    return { text: "Brovas in production", color: "purple" };
  return { text: "In production", color: "zinc" };
}

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

function getDaysLabel(days: number | null) {
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d left`;
}

// ── Order group classification helpers ───────────────────────

function isActive(og: OrderGroup) {
  return og.garments.some((g) => {
    const so = STAGE_ORDER[g.piece_stage ?? ""] ?? 0;
    return (so === 1 && g.start_time) || (so >= 2 && so <= 7);
  });
}

function isReadyForDispatch(og: OrderGroup) {
  const workshopGarments = og.garments.filter((g) => g.location === "workshop");
  return workshopGarments.length > 0 && workshopGarments.every((g) => g.piece_stage === "ready_for_dispatch");
}

function isOverdue(og: OrderGroup) {
  if (!og.delivery_date) return false;
  return parseUtcTimestamp(og.delivery_date).getTime() < Date.now();
}

function isDueSoon(og: OrderGroup) {
  if (!og.delivery_date) return false;
  const diff = Math.ceil((parseUtcTimestamp(og.delivery_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff >= 0 && diff <= 2;
}

function hasReturns(og: OrderGroup) {
  return og.garments.some((g) => (g.trip_number ?? 1) > 1);
}

function isExpressOrder(og: OrderGroup) { return og.express; }
function isHomeDelivery(og: OrderGroup) { return og.home_delivery; }
function hasSoaking(og: OrderGroup) { return og.garments.some((g) => g.soaking); }

// ── Sort: overdue first, then express, then delivery date asc ─

function sortByUrgency(orders: OrderGroup[]) {
  return [...orders].sort((a, b) => {
    const now = Date.now();
    const daysA = a.delivery_date ? Math.ceil((parseUtcTimestamp(a.delivery_date).getTime() - now) / 86400000) : 999;
    const daysB = b.delivery_date ? Math.ceil((parseUtcTimestamp(b.delivery_date).getTime() - now) / 86400000) : 999;
    const overdueA = daysA < 0 ? 1 : 0;
    const overdueB = daysB < 0 ? 1 : 0;
    if (overdueA !== overdueB) return overdueB - overdueA;
    if (a.express && !b.express) return -1;
    if (!a.express && b.express) return 1;
    return daysA - daysB;
  });
}

// ── Garment Location Pill ───────────────────────────────────

/**
 * Resolves the garment's display location. Returns null when the garment is
 * actively in a workshop production stage — in that case the StageBadge already
 * communicates what's happening, so location would be redundant.
 */
function getGarmentLocationDisplay(garment: WorkshopGarment): {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: PillColor;
} | null {
  const loc = garment.location;
  const stage = garment.piece_stage;
  const activeWorkshopStages = new Set([
    "soaking", "cutting", "post_cutting", "sewing",
    "finishing", "ironing", "quality_check", "ready_for_dispatch",
  ]);
  if (loc === "workshop" && stage && activeWorkshopStages.has(stage)) return null;

  const config: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: PillColor }> = {
    shop: { label: "At shop", icon: Store, color: "green" },
    transit_to_shop: { label: "In transit to shop", icon: Truck, color: "sky" },
    transit_to_workshop: { label: "In transit to workshop", icon: Truck, color: "amber" },
    workshop: { label: "At workshop", icon: Package, color: "zinc" },
  };
  return loc ? config[loc] ?? null : null;
}

// ── Garment Mini Cards ──────────────────────────────────────

function GarmentMiniCards({ garments }: { garments: WorkshopGarment[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
      {garments.map((g) => {
        const tripNum = g.trip_number ?? 1;
        const isReturn = tripNum > 1;
        const worker = getWorkerName(g);
        const locationDisplay = getGarmentLocationDisplay(g);

        return (
          <div
            key={g.id}
            className={cn(
              "p-2 bg-background rounded-lg border border-border/60 text-sm shadow-sm",
              isReturn && "border-l-2 border-l-amber-400",
              g.express && "ring-1 ring-red-200",
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <GarmentTypeBadgeCompact type={g.garment_type ?? "final"} />
                <span className="font-mono font-medium text-xs text-muted-foreground truncate">
                  {g.garment_id ?? g.id.slice(0, 8)}
                </span>
                {g.express && <Zap className="w-3 h-3 text-red-500 fill-red-500 shrink-0" />}
                {g.soaking && <Droplets className="w-3 h-3 text-sky-500 shrink-0" />}
                {isReturn && (
                  <StatusPill color="amber" className="shrink-0">
                    Trip {tripNum}
                  </StatusPill>
                )}
              </div>
              <StageBadge stage={g.piece_stage} className="text-[10px] py-0 shrink-0" />
            </div>

            <div className="space-y-1">
              {locationDisplay && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px] uppercase font-bold">Location</span>
                  <StatusPill color={locationDisplay.color} icon={locationDisplay.icon}>
                    {locationDisplay.label}
                  </StatusPill>
                </div>
              )}
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

// ── Order Indicators ────────────────────────────────────────

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
  const daysLabel = getDaysLabel(urgency.days);

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
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-sm">#{group.order_id}</span>
            <OrderIndicators group={group} />
            <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <StatusPill color={statusLabel.color}>{statusLabel.text}</StatusPill>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground/40 transition-transform", expanded && "rotate-180")} />
          </div>
        </div>

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

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className={cn("px-3 pb-3 pt-2", expanded && "border-t")}>
            <GarmentMiniCards garments={group.garments} />
          </div>
        </div>
      </div>
    </div>
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
    <Table className="min-w-[850px]">
      <TableHeader>
        <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
          <TableHead className="w-8 h-8 px-2" />
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2">Order</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2">Customer</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2">Brand</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2">Status</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2">Garments</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2">Delivery</TableHead>
          <TableHead className="w-8 h-8 px-2" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((group) => {
          const urgency = getDeliveryUrgency(group.delivery_date);
          const brovas = group.garments.filter((g) => g.garment_type === "brova");
          const finals = group.garments.filter((g) => g.garment_type === "final");
          const statusLabel = getOrderStatusLabel(group, brovas, finals);
          const isExpanded = expandedId === group.order_id;
          const daysLabel = getDaysLabel(urgency.days);

          return (
            <Fragment key={group.order_id}>
              <TableRow
                onClick={() => onToggle(group.order_id)}
                aria-expanded={isExpanded}
                className={cn(
                  "hover:bg-muted/30 border-b border-border/40 cursor-pointer transition-colors",
                  group.express && "bg-orange-50/30",
                  urgency.days !== null && urgency.days < 0 && "border-l-4 border-l-red-500",
                )}
              >
                <TableCell className="py-2.5 px-2.5">
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                </TableCell>
                <TableCell className="py-2.5 px-2.5 text-xs">
                  <div className="flex items-center">
                    <span className="font-mono font-bold">#{group.order_id}</span>
                    <OrderIndicators group={group} />
                  </div>
                  {group.invoice_number && (
                    <span className="text-[10px] text-muted-foreground">INV-{group.invoice_number}</span>
                  )}
                </TableCell>
                <TableCell className="py-2.5 px-2.5 text-xs max-w-[160px] truncate">
                  {group.customer_name ?? "—"}
                </TableCell>
                <TableCell className="py-2.5 px-2.5">
                  <div className="flex items-center gap-1">
                    {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
                  </div>
                </TableCell>
                <TableCell className="py-2.5 px-2.5">
                  <StatusPill color={statusLabel.color}>{statusLabel.text}</StatusPill>
                </TableCell>
                <TableCell className="py-2.5 px-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {garmentSummary(group.garments)}
                </TableCell>
                <TableCell className="py-2.5 px-2.5 text-xs whitespace-nowrap">
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
                <TableCell className="py-2.5 px-2.5">
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
              <TableRow key={`${group.order_id}-detail`} className="border-0 hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className={cn(
                    "p-0 transition-colors",
                    isExpanded ? "bg-muted/10 border-b border-border/40 shadow-inner" : "border-0",
                  )}
                >
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-300 ease-out",
                      isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="p-3 pl-10">
                        <GarmentMiniCards garments={group.garments} />
                      </div>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Overview Dashboard ───────────────────────────────────────

function OverviewDashboard({
  orderGroups,
  counts,
  onNavigate,
}: {
  orderGroups: OrderGroup[];
  counts: { overdue: number; dueSoon: number; active: number; ready: number; returns: number; total: number };
  onNavigate: (tab: string) => void;
}) {
  // Unified card treatment — one surface, varied by accent icon badge.
  // Tone (urgent / warning / ok / neutral) drives only the icon badge color.
  const cards: {
    key: string;
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
    tone: "urgent" | "warning" | "info" | "success" | "accent" | "neutral";
  }[] = [
    { key: "attention", label: "Overdue",           count: counts.overdue, icon: AlertTriangle, tone: "urgent" },
    { key: "attention", label: "Due Soon",          count: counts.dueSoon, icon: Clock,         tone: "warning" },
    { key: "production",label: "In Production",     count: counts.active,  icon: Activity,      tone: "info" },
    { key: "ready",     label: "Ready to Dispatch", count: counts.ready,   icon: CheckCircle2,  tone: "success" },
    { key: "attention", label: "Returns",           count: counts.returns, icon: RotateCcw,     tone: "accent" },
    { key: "all",       label: "Total Orders",      count: counts.total,   icon: List,          tone: "neutral" },
  ];

  const toneStyles: Record<typeof cards[number]["tone"], { iconBg: string; iconColor: string; accentBar: string }> = {
    urgent:  { iconBg: "bg-red-50",     iconColor: "text-red-600",     accentBar: "bg-red-500" },
    warning: { iconBg: "bg-orange-50",  iconColor: "text-orange-600",  accentBar: "bg-orange-500" },
    info:    { iconBg: "bg-blue-50",    iconColor: "text-blue-600",    accentBar: "bg-blue-500" },
    success: { iconBg: "bg-emerald-50", iconColor: "text-emerald-600", accentBar: "bg-emerald-500" },
    accent:  { iconBg: "bg-amber-50",   iconColor: "text-amber-600",   accentBar: "bg-amber-500" },
    neutral: { iconBg: "bg-muted",      iconColor: "text-muted-foreground", accentBar: "bg-border" },
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const s = toneStyles[card.tone];
          const isZero = card.count === 0;
          return (
            <button
              key={card.label}
              onClick={() => onNavigate(card.key)}
              className={cn(
                "group relative flex flex-col items-start gap-3 p-4 rounded-xl border border-border bg-card text-left cursor-pointer transition-all",
                "hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5",
                "pointer-coarse:active:scale-[0.98] pointer-coarse:active:translate-y-0",
                isZero && "opacity-60",
              )}
            >
              <div className={cn("inline-flex items-center justify-center w-9 h-9 rounded-lg", s.iconBg)}>
                <Icon className={cn("w-4.5 h-4.5", s.iconColor)} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-3xl font-black tabular-nums leading-none text-foreground">
                  {card.count}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {card.label}
                </span>
              </div>
              <span className={cn("absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full transition-opacity opacity-0 group-hover:opacity-100", s.accentBar)} />
            </button>
          );
        })}
      </div>

      {/* Quick list of overdue orders if any */}
      {counts.overdue > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/70">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-50">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Overdue Orders
              </h3>
              <StatusPill color="red" className="ml-0.5">{counts.overdue}</StatusPill>
            </div>
            {counts.overdue > 5 && (
              <button
                onClick={() => onNavigate("attention")}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="divide-y divide-border/60">
            {orderGroups
              .filter(isOverdue)
              .slice(0, 5)
              .map((og) => {
                const urgency = getDeliveryUrgency(og.delivery_date);
                return (
                  <Link
                    key={og.order_id}
                    to="/assigned/$orderId"
                    params={{ orderId: String(og.order_id) }}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono font-bold text-sm">#{og.order_id}</span>
                      {og.express && <Zap className="w-3.5 h-3.5 text-red-500 fill-red-500 shrink-0" />}
                      <span className="text-sm text-foreground truncate">{og.customer_name}</span>
                    </div>
                    <span className={cn("text-xs font-bold shrink-0 tabular-nums", urgency.cls)}>
                      {getDaysLabel(urgency.days)}
                    </span>
                  </Link>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Secondary Filter Chips ──────────────────────────────────

function FilterChips({
  filters,
  active,
  onToggle,
  onReset,
}: {
  filters: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[];
  active: Set<string>;
  onToggle: (key: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((f) => {
        const Icon = f.icon;
        const isActive = active.has(f.key);
        return (
          <button
            key={f.key}
            onClick={() => onToggle(f.key)}
            className={cn(
              "group inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer transition-all",
              isActive
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {f.label}
            <span
              className={cn(
                "ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
              )}
            >
              {f.count}
            </span>
          </button>
        );
      })}
      {active.size > 0 && (
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          title="Clear filters"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}

// ── Order List (shared between tabs) ────────────────────────

function OrderList({
  orders,
  isMobile,
  emptyText,
}: {
  orders: OrderGroup[];
  isMobile: boolean;
  emptyText?: string;
}) {
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const toggleExpanded = (id: number) =>
    setExpandedOrderId((prev) => (prev === id ? null : id));
  const pagination = usePagination(orders, 20);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted/60 mb-4">
          <ClipboardList className="w-6 h-6 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-semibold text-foreground">{emptyText ?? "No orders match this filter"}</p>
        <p className="text-xs text-muted-foreground mt-1">Try clearing filters or switching tabs</p>
      </div>
    );
  }

  return (
    <>
      {isMobile ? (
        <div className="space-y-2">
          {pagination.paged.map((group) => (
            <AssignedOrderCard
              key={group.order_id}
              group={group}
              expanded={expandedOrderId === group.order_id}
              onToggle={() => toggleExpanded(group.order_id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border shadow-sm overflow-x-auto bg-card py-0 gap-0">
          <OrdersTable
            orders={pagination.paged}
            expandedId={expandedOrderId}
            onToggle={toggleExpanded}
          />
        </div>
      )}
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={pagination.setPage}
        totalItems={pagination.totalItems}
        pageSize={pagination.pageSize}
      />
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────

const VALID_TABS = new Set(["overview", "production", "ready", "attention", "all"]);
const VALID_FILTERS = new Set(["express", "delivery", "soaking"]);

function AssignedPage() {
  const { data: all = [], isLoading } = useAssignedViewGarments();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { tab: searchTab, filter: searchFilter } = Route.useSearch();

  // Derive state from URL
  const primaryTab = VALID_TABS.has(searchTab ?? "") ? searchTab! : "overview";
  const chipFilters = new Set(
    (searchFilter ?? "").split(",").filter((f) => VALID_FILTERS.has(f)),
  );

  const setTab = useCallback((tab: string, filter?: string) => {
    navigate({
      to: "/assigned",
      search: { tab: tab === "overview" ? undefined : tab, filter: filter || undefined },
      replace: true,
    });
  }, [navigate]);

  const setPrimaryTab = useCallback((tab: string) => {
    setTab(tab);
  }, [setTab]);

  const orderGroups = sortByUrgency(groupByOrder(all));

  // Classify order groups
  const overdueOrders = orderGroups.filter(isOverdue);
  const dueSoonOrders = orderGroups.filter(isDueSoon);
  const activeOrders = orderGroups.filter(isActive);
  const readyOrders = orderGroups.filter(isReadyForDispatch);
  const returningOrders = orderGroups.filter(hasReturns);

  const toggleChip = useCallback((key: string) => {
    const next = new Set(chipFilters);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const filterStr = Array.from(next).join(",");
    setTab(primaryTab, filterStr);
  }, [chipFilters, primaryTab, setTab]);

  const resetChips = useCallback(() => {
    setTab(primaryTab);
  }, [primaryTab, setTab]);

  // Get base orders for current primary tab
  const baseOrders = (() => {
    switch (primaryTab) {
      case "production": return activeOrders;
      case "ready": return readyOrders;
      case "attention": return sortByUrgency([
        ...new Map([
          ...overdueOrders,
          ...dueSoonOrders,
          ...returningOrders,
        ].map((o) => [o.order_id, o])).values(),
      ]);
      case "all": return orderGroups;
      default: return orderGroups;
    }
  })();

  // Chip counts reflect the current tab's base orders, not all orders
  const chipOptions = [
    { key: "express", label: "Express", icon: Zap, count: baseOrders.filter(isExpressOrder).length },
    { key: "delivery", label: "Delivery", icon: Home, count: baseOrders.filter(isHomeDelivery).length },
    { key: "soaking", label: "Soaking", icon: Droplets, count: baseOrders.filter(hasSoaking).length },
  ];

  // Apply chip filters
  const filteredOrders = chipFilters.size === 0
    ? baseOrders
    : baseOrders.filter((og) => {
      if (chipFilters.has("express") && !og.express) return false;
      if (chipFilters.has("delivery") && !og.home_delivery) return false;
      if (chipFilters.has("soaking") && !og.garments.some((g) => g.soaking)) return false;
      return true;
    });

  const primaryTabs = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "production", label: "In Production", icon: Activity, count: activeOrders.length, badgeCls: "bg-blue-100 text-blue-700" },
    { key: "ready", label: "Ready", icon: CheckCircle2, count: readyOrders.length, badgeCls: "bg-emerald-100 text-emerald-700" },
    { key: "attention", label: "Attention", icon: AlertTriangle, count: overdueOrders.length + dueSoonOrders.length, badgeCls: overdueOrders.length > 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700" },
    { key: "all", label: "All Orders", icon: List, count: orderGroups.length },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader
        icon={ClipboardList}
        title="Production Tracker"
        subtitle={`${all.length} garment${all.length !== 1 ? "s" : ""} across ${orderGroups.length} order${orderGroups.length !== 1 ? "s" : ""}${returningOrders.length > 0 ? ` · ${returningOrders.length} with returns` : ""}`}
      />

      <Tabs value={primaryTab} onValueChange={(v) => setTab(v)}>
        <TabsList className="h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden mb-3">
          {primaryTabs.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.count !== undefined && (
                  <Badge variant="secondary" className={cn("ml-0.5 text-xs", t.badgeCls)}>
                    {t.count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

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
        ) : (
          <>
            {/* Overview tab */}
            <TabsContent value="overview">
              <OverviewDashboard
                orderGroups={orderGroups}
                counts={{
                  overdue: overdueOrders.length,
                  dueSoon: dueSoonOrders.length,
                  active: activeOrders.length,
                  ready: readyOrders.length,
                  returns: returningOrders.length,
                  total: orderGroups.length,
                }}
                onNavigate={setPrimaryTab}
              />
            </TabsContent>

            {/* List tabs */}
            {["production", "ready", "attention", "all"].map((tabKey) => (
              <TabsContent key={tabKey} value={tabKey}>
                <div className="space-y-3">
                  <FilterChips filters={chipOptions} active={chipFilters} onToggle={toggleChip} onReset={resetChips} />
                  <OrderList
                    orders={filteredOrders}
                    isMobile={isMobile}
                    emptyText={
                      tabKey === "production" ? "No orders in production"
                        : tabKey === "ready" ? "No orders ready for dispatch"
                        : tabKey === "attention" ? "No orders need attention"
                        : "No orders found"
                    }
                  />
                </div>
              </TabsContent>
            ))}
          </>
        )}
      </Tabs>
    </div>
  );
}
