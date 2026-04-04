import React, { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useReceiveGarments, useReceiveAndStart, useMarkLostInTransit } from "@/hooks/useGarmentMutations";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import {
  PageHeader, EmptyState, LoadingSkeleton,
  GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { Button } from "@repo/ui/button";
import { Checkbox } from "@repo/ui/checkbox";
import { Badge } from "@repo/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { BrandBadge, ExpressBadge, AlterationBadge } from "@/components/shared/StageBadge";
import { cn, formatDate, groupByOrder, garmentSummary, type OrderGroup } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { WorkshopGarment } from "@repo/database";
import { toast } from "sonner";
import {
  Inbox, ChevronDown, ChevronUp, Clock, Package, Home,
  Droplets, AlertTriangle, CircleX,
} from "lucide-react";

export const Route = createFileRoute("/(main)/receiving")({
  component: ReceivingPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
  }),
  head: () => ({ meta: [{ title: "Receiving" }] }),
});

// ── Garment Row (per-garment inside an order dropdown) ─────────────────────

function GarmentRow({
  garment,
  onReceive,
  onReceiveAndStart,
  onLostInTransit,
  isReceiving,
}: {
  garment: WorkshopGarment;
  onReceive: () => void;
  onReceiveAndStart: () => void;
  onLostInTransit: () => void;
  isReceiving: boolean;
}) {
  return (
    <div className="bg-card rounded-lg border p-2.5 flex flex-col gap-2">
      {/* Top: identity + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <GarmentTypeBadge type={garment.garment_type ?? "final"} />
          <span className="font-mono text-sm font-bold">{garment.garment_id ?? garment.id.slice(0, 8)}</span>
          {garment.express && <ExpressBadge />}
          {garment.soaking && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
              <Droplets className="w-3 h-3" /> Soak
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onReceive} disabled={isReceiving} className="text-xs h-7">
            Receive
          </Button>
          <Button size="sm" onClick={onReceiveAndStart} disabled={isReceiving} className="text-xs h-7">
            Receive & Start
          </Button>
          <Button size="sm" variant="ghost" onClick={onLostInTransit} disabled={isReceiving} className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10">
            <AlertTriangle className="w-3 h-3 mr-1" /> Lost
          </Button>
        </div>
      </div>
      {/* Bottom: fabric & style info */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground pl-1">
        {garment.fabric_name ? (
          <span className="truncate">
            <span className="font-medium text-foreground">{garment.fabric_name}</span>
            {garment.fabric_color && <span className="ml-1 text-muted-foreground">({garment.fabric_color})</span>}
          </span>
        ) : (
          <span>
            Source: Outside
            {garment.fabric_color && <span className="ml-1">({garment.fabric_color})</span>}
          </span>
        )}
        {garment.style_name && (
          <span className="capitalize truncate">{garment.style_name}</span>
        )}
      </div>
    </div>
  );
}

// ── OrderCard (order-level, for Incoming tab — mobile) ──────────────────────

function OrderCard({
  group,
  selected,
  onToggle,
  onReceiveGarment,
  onReceiveAndStartGarment,
  onLostGarment,
  onReceivePark,
  onReceiveSchedule,
  isReceiving,
}: {
  group: OrderGroup;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onReceiveGarment: (id: string) => void;
  onReceiveAndStartGarment: (id: string) => void;
  onLostGarment: (id: string) => void;
  onReceivePark: () => void;
  onReceiveSchedule: () => void;
  isReceiving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const deliveryDate = group.garments[0]?.delivery_date_order;
  const daysLeft = deliveryDate
    ? Math.ceil((new Date(deliveryDate).getTime() - Date.now()) / 86400000)
    : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isUrgent = daysLeft !== null && daysLeft <= 2 && !isOverdue;

  return (
    <div
      className={cn(
        "bg-card border rounded-xl transition-[color,background-color,border-color,box-shadow] shadow-sm border-l-4",
        group.express ? "border-l-orange-400 ring-1 ring-orange-200" : "border-l-border",
        selected && "border-primary ring-2 ring-primary/20 bg-primary/5",
      )}
    >
      <div className="px-3 py-2.5 transition-colors rounded-t-xl">
        {/* Row 1: Identity + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => { onToggle(!!checked); }}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select order #${group.order_id}`}
              className="size-4"
            />
            <span className="font-mono font-bold text-sm shrink-0">#{group.order_id}</span>
            {group.invoice_number && (
              <span className="text-xs text-muted-foreground/50 font-mono shrink-0">· #{group.invoice_number}</span>
            )}
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
            <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onReceivePark(); }} disabled={isReceiving} className="text-xs h-7">
              Receive All
            </Button>
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onReceiveSchedule(); }} disabled={isReceiving} className="text-xs h-7">
              Receive & Start All
            </Button>
            <button
              className={cn("p-1.5 rounded-md transition-colors cursor-pointer", expanded ? "bg-muted" : "text-muted-foreground/50 hover:text-foreground")}
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse garments" : "Expand garments"}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Row 2: Status (left) + Logistics (right) */}
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs text-muted-foreground/60">{garmentSummary(group.garments)}</span>
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

      {/* Garment dropdown list — animated */}
      <div className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out",
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}>
        <div className="overflow-hidden">
          <div className="border-t bg-muted/20 px-3 py-2 space-y-1.5">
            {group.garments.map((g) => (
              <GarmentRow
                key={g.id}
                garment={g}
                onReceive={() => onReceiveGarment(g.id)}
                onReceiveAndStart={() => onReceiveAndStartGarment(g.id)}
                onLostInTransit={() => onLostGarment(g.id)}
                isReceiving={isReceiving}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Incoming Table (order-level, desktop) ───────────────────────────────────

function IncomingTable({
  orders,
  selectedOrderIds,
  onToggleOrder,
  onReceivePark,
  onReceiveSchedule,
  onReceiveGarment,
  onReceiveAndStartGarment,
  onLostGarment,
  isReceiving,
}: {
  orders: OrderGroup[];
  selectedOrderIds: Set<number>;
  onToggleOrder: (orderId: number, checked: boolean) => void;
  onReceivePark: (group: OrderGroup) => void;
  onReceiveSchedule: (group: OrderGroup) => void;
  onReceiveGarment: (id: string) => void;
  onReceiveAndStartGarment: (id: string) => void;
  onLostGarment: (id: string) => void;
  isReceiving: boolean;
}) {
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());

  const toggleExpand = (orderId: number) =>
    setExpandedOrders((prev) => {
      const n = new Set(prev);
      n.has(orderId) ? n.delete(orderId) : n.add(orderId);
      return n;
    });

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/40 border-b">
            <th className="w-10 p-3 text-left">
              <Checkbox
                checked={orders.length > 0 && orders.every((o) => selectedOrderIds.has(o.order_id))}
                onCheckedChange={(checked) => {
                  for (const o of orders) onToggleOrder(o.order_id, !!checked);
                }}
                aria-label="Select all orders"
                className="size-4"
              />
            </th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Order</th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Customer</th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Brand</th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Garments</th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Express</th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Delivery</th>
            <th className="p-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((group) => {
            const selected = selectedOrderIds.has(group.order_id);
            const expanded = expandedOrders.has(group.order_id);
            const deliveryDate = group.garments[0]?.delivery_date_order;
            const daysLeft = deliveryDate
              ? Math.ceil((new Date(deliveryDate).getTime() - Date.now()) / 86400000)
              : null;
            const isOverdue = daysLeft !== null && daysLeft < 0;
            const isUrgent = daysLeft !== null && daysLeft <= 2 && !isOverdue;
            const rowBg = cn(selected && "bg-primary/5", group.express && "bg-orange-50/30");

            return (
              <React.Fragment key={group.order_id}>
                {/* Order row */}
                <tr
                  className={cn("cursor-pointer hover:bg-muted/30 transition-colors", rowBg)}
                  onClick={() => toggleExpand(group.order_id)}
                >
                  <td className="p-3 border-b">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) => onToggleOrder(group.order_id, !!checked)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select order #${group.order_id}`}
                      className="size-4"
                    />
                  </td>
                  <td className="p-3 border-b">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold">#{group.order_id}</span>
                      {group.invoice_number && (
                        <span className="text-xs text-muted-foreground/50 font-mono">#{group.invoice_number}</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 border-b text-sm text-muted-foreground">
                    {group.customer_name ?? "—"}
                  </td>
                  <td className="p-3 border-b">
                    <div className="flex items-center gap-1">
                      {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
                    </div>
                  </td>
                  <td className="p-3 border-b text-sm text-muted-foreground/60">
                    {garmentSummary(group.garments)}
                  </td>
                  <td className="p-3 border-b">
                    {group.express && <ExpressBadge />}
                  </td>
                  <td className="p-3 border-b">
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
                  </td>
                  <td className="p-3 border-b">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onReceivePark(group); }} disabled={isReceiving} className="text-xs h-7">
                        Receive All
                      </Button>
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); onReceiveSchedule(group); }} disabled={isReceiving} className="text-xs h-7">
                        Receive & Start All
                      </Button>
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground/50 transition-transform duration-200 shrink-0", expanded && "rotate-180")} />
                    </div>
                  </td>
                </tr>
                {/* Garment expansion row — animated */}
                <tr>
                  <td colSpan={8} className="p-0">
                    <div className={cn(
                      "grid transition-[grid-template-rows] duration-200 ease-out",
                      expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}>
                      <div className="overflow-hidden">
                        <div className="bg-muted/20 px-4 py-2.5 space-y-1.5 border-b">
                          {group.garments.map((g) => (
                            <GarmentRow
                              key={g.id}
                              garment={g}
                              onReceive={() => onReceiveGarment(g.id)}
                              onReceiveAndStart={() => onReceiveAndStartGarment(g.id)}
                              onLostInTransit={() => onLostGarment(g.id)}
                              isReceiving={isReceiving}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Garment Table (garment-level, desktop — for Brova Returns & Alteration In) ──

function GarmentTable({
  garments,
  selectedIds,
  onToggle,
  onReceive,
  onReceiveAndStart,
  isReceiving,
  isReceiveStarting,
  showAlteration,
}: {
  garments: WorkshopGarment[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onReceive: (id: string) => void;
  onReceiveAndStart: (id: string) => void;
  isReceiving: boolean;
  isReceiveStarting: boolean;
  showAlteration?: boolean;
}) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/40 border-b">
            <th className="w-10 p-3 text-left">
              <Checkbox
                checked={garments.length > 0 && garments.every((g) => selectedIds.has(g.id))}
                onCheckedChange={(checked) => {
                  for (const g of garments) onToggle(g.id, !!checked);
                }}
                aria-label="Select all garments"
                className="size-4"
              />
            </th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Type</th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Garment</th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Customer</th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Invoice</th>
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Trip</th>
            {showAlteration && <th className="p-3 text-left text-sm font-medium text-muted-foreground">Alt #</th>}
            <th className="p-3 text-left text-sm font-medium text-muted-foreground">Express</th>
            <th className="p-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {garments.map((g) => {
            const selected = selectedIds.has(g.id);
            return (
              <tr
                key={g.id}
                className={cn(
                  "border-b last:border-b-0",
                  g.express && "bg-orange-50/30",
                  selected && "bg-primary/5",
                )}
              >
                <td className="p-3">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(checked) => onToggle(g.id, !!checked)}
                    aria-label={`Select garment ${g.garment_id ?? g.id.slice(0, 8)}`}
                    className="size-4"
                  />
                </td>
                <td className="p-3">
                  <GarmentTypeBadge type={g.garment_type ?? "final"} />
                </td>
                <td className="p-3">
                  <span className="font-mono text-sm font-bold">{g.garment_id ?? g.id.slice(0, 8)}</span>
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {g.customer_name ?? "—"}
                </td>
                <td className="p-3 text-sm text-muted-foreground font-mono">
                  {g.invoice_number ? `#${g.invoice_number}` : "—"}
                </td>
                <td className="p-3">
                  <Badge variant="secondary" className="text-xs font-bold">
                    {g.trip_number ?? 1}
                  </Badge>
                </td>
                {showAlteration && (
                  <td className="p-3">
                    <AlterationBadge tripNumber={g.trip_number} garmentType={g.garment_type} />
                  </td>
                )}
                <td className="p-3">
                  {g.express && <ExpressBadge />}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReceive(g.id)}
                      disabled={isReceiving}
                      className="text-xs h-7"
                    >
                      Receive
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onReceiveAndStart(g.id)}
                      disabled={isReceiveStarting}
                      className="text-xs h-7"
                    >
                      Receive & Start
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Lost in Transit Card ────────────────────────────────────────────────────

function LostGarmentCard({
  garment,
  onReceive,
  isReceiving,
}: {
  garment: WorkshopGarment;
  onReceive: () => void;
  isReceiving: boolean;
}) {
  return (
    <div className="bg-card border border-destructive/20 rounded-xl p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-1.5 rounded-lg bg-destructive/10">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GarmentTypeBadge type={garment.garment_type ?? "final"} />
            <span className="font-mono text-sm font-bold">{garment.garment_id ?? garment.id.slice(0, 8)}</span>
            {garment.express && <ExpressBadge />}
            <BrandBadge brand={garment.order_brand} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{garment.customer_name ?? "—"}</span>
            {garment.invoice_number && <span className="font-mono">#{garment.invoice_number}</span>}
            {garment.fabric_name && <span>{garment.fabric_name}</span>}
          </div>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onReceive} disabled={isReceiving} className="text-xs h-7 shrink-0">
        Found — Receive
      </Button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function ReceivingPage() {
  const { tab: searchTab } = Route.useSearch();
  const [activeTab, setActiveTab] = useState(searchTab ?? "incoming");
  const isMobile = useIsMobile();
  const { data: allGarments = [], isLoading } = useWorkshopGarments();
  const receiveMut = useReceiveGarments();
  const receiveStartMut = useReceiveAndStart();
  const lostMut = useMarkLostInTransit();

  // Sync tab when navigating via notification deep links
  useEffect(() => {
    if (searchTab) setActiveTab(searchTab);
  }, [searchTab]);

  // Split by tab
  const inTransit = allGarments.filter((g) => g.location === "transit_to_workshop");
  const incoming = inTransit.filter((g) => (g.trip_number ?? 1) === 1);
  // Brova returns: trip 2 or 3 (after first/second trial, before alteration threshold)
  const brovaReturns = inTransit.filter(
    (g) => g.garment_type === "brova" && (g.trip_number === 2 || g.trip_number === 3),
  );
  // Alterations: brova trip >= 4, final trip >= 2
  const alterationIn = inTransit.filter(
    (g) =>
      ((g.trip_number ?? 0) >= 4 && g.garment_type === "brova") ||
      ((g.trip_number ?? 0) >= 2 && g.garment_type === "final"),
  );
  // Lost in transit
  const lostInTransit = allGarments.filter((g) => g.location === "lost_in_transit");

  const incomingOrders = groupByOrder(incoming).sort((a, b) => {
    if (a.express && !b.express) return -1;
    if (!a.express && b.express) return 1;
    if (a.delivery_date && b.delivery_date) return a.delivery_date.localeCompare(b.delivery_date);
    if (a.delivery_date && !b.delivery_date) return -1;
    if (!a.delivery_date && b.delivery_date) return 1;
    return 0;
  });

  // Selection state per tab (Incoming selects at order level)
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [selectedBrova, setSelectedBrova] = useState<Set<string>>(new Set());
  const [selectedAltIn, setSelectedAltIn] = useState<Set<string>>(new Set());

  const toggleOrder = (orderId: number, checked: boolean) =>
    setSelectedOrderIds((prev) => {
      const n = new Set(prev);
      checked ? n.add(orderId) : n.delete(orderId);
      return n;
    });

  const toggleGarment =
    (setFn: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (id: string, checked: boolean) =>
      setFn((prev) => {
        const n = new Set(prev);
        checked ? n.add(id) : n.delete(id);
        return n;
      });

  const getSelectedIncomingGarmentIds = () =>
    incomingOrders
      .filter((g) => selectedOrderIds.has(g.order_id))
      .flatMap((g) => g.garments.map((gg) => gg.id));

  // Per-card actions for incoming orders
  const handleReceiveParkOrder = async (group: OrderGroup) => {
    const ids = group.garments.map((g) => g.id);
    await receiveMut.mutateAsync(ids);
  };

  const handleReceiveScheduleOrder = async (group: OrderGroup) => {
    const ids = group.garments.map((g) => g.id);
    await receiveStartMut.mutateAsync(ids);
  };

  // Per-garment actions
  const handleReceiveSingle = async (id: string) => {
    await receiveMut.mutateAsync([id]);
  };

  const handleReceiveAndStartSingle = async (id: string) => {
    await receiveStartMut.mutateAsync([id]);
  };

  const handleLostSingle = async (id: string) => {
    await lostMut.mutateAsync([id]);
    toast.warning("Garment marked as lost in transit");
  };

  // Batch actions
  const handleReceiveOrders = async () => {
    const ids = getSelectedIncomingGarmentIds();
    await receiveMut.mutateAsync(ids);
    setSelectedOrderIds(new Set());
  };

  const handleReceiveAndStartOrders = async () => {
    const ids = getSelectedIncomingGarmentIds();
    await receiveStartMut.mutateAsync(ids);
    setSelectedOrderIds(new Set());
  };

  const handleReceiveBatch = async (
    ids: Set<string>,
    clearFn: () => void,
  ) => {
    await receiveMut.mutateAsync([...ids]);
    clearFn();
  };

  const isBusy = receiveMut.isPending || receiveStartMut.isPending || lostMut.isPending;

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-28">
      <PageHeader
        icon={Inbox}
        title="Receiving"
        subtitle={`${inTransit.length} garment${inTransit.length !== 1 ? "s" : ""} in transit from shop`}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="incoming">
            Incoming{" "}
            <Badge variant="secondary" className="ml-1 text-xs bg-blue-100 text-blue-700">
              {incomingOrders.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="brova-returns">
            Brova Returns{" "}
            <Badge variant="secondary" className="ml-1 text-xs bg-purple-100 text-purple-700">
              {brovaReturns.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="alteration-in">
            Alteration In{" "}
            <Badge variant="secondary" className="ml-1 text-xs bg-orange-100 text-orange-700">
              {alterationIn.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="alteration-out">
            Alteration Out{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              0
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="lost-in-transit">
            Lost in Transit{" "}
            {lostInTransit.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs bg-red-100 text-red-700">
                {lostInTransit.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── INCOMING — order level with per-garment dropdown ── */}
        <TabsContent value="incoming">
          {isLoading ? (
            <LoadingSkeleton />
          ) : incomingOrders.length === 0 ? (
            <EmptyState icon={Inbox} message="No incoming orders" />
          ) : isMobile ? (
            <div className="space-y-2">
              {incomingOrders.map((group) => (
                <OrderCard
                  key={group.order_id}
                  group={group}
                  selected={selectedOrderIds.has(group.order_id)}
                  onToggle={(checked) => toggleOrder(group.order_id, checked)}
                  onReceiveGarment={handleReceiveSingle}
                  onReceiveAndStartGarment={handleReceiveAndStartSingle}
                  onLostGarment={handleLostSingle}
                  onReceivePark={() => handleReceiveParkOrder(group)}
                  onReceiveSchedule={() => handleReceiveScheduleOrder(group)}
                  isReceiving={isBusy}
                />
              ))}
            </div>
          ) : (
            <IncomingTable
              orders={incomingOrders}
              selectedOrderIds={selectedOrderIds}
              onToggleOrder={toggleOrder}
              onReceivePark={handleReceiveParkOrder}
              onReceiveSchedule={handleReceiveScheduleOrder}
              onReceiveGarment={handleReceiveSingle}
              onReceiveAndStartGarment={handleReceiveAndStartSingle}
              onLostGarment={handleLostSingle}
              isReceiving={isBusy}
            />
          )}
          <BatchActionBar
            count={selectedOrderIds.size}
            onClear={() => setSelectedOrderIds(new Set())}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={handleReceiveOrders}
              disabled={receiveMut.isPending}
            >
              Receive
            </Button>
            <Button
              size="sm"
              onClick={handleReceiveAndStartOrders}
              disabled={receiveStartMut.isPending}
            >
              Receive & Start
            </Button>
          </BatchActionBar>
        </TabsContent>

        {/* ── BROVA RETURNS — garment level ── */}
        <TabsContent value="brova-returns">
          {isLoading ? (
            <LoadingSkeleton />
          ) : brovaReturns.length === 0 ? (
            <EmptyState icon={Package} message="No brova returns in transit" />
          ) : isMobile ? (
            <div className="space-y-2">
              {brovaReturns.map((g, i) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  selected={selectedBrova.has(g.id)}
                  onSelect={toggleGarment(setSelectedBrova)}
                  showPipeline={false}
                  index={i}
                  actions={
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReceiveSingle(g.id)}
                        disabled={receiveMut.isPending}
                        className="text-xs h-7"
                      >
                        Receive
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          await receiveStartMut.mutateAsync([g.id]);
                        }}
                        disabled={receiveStartMut.isPending}
                        className="text-xs h-7"
                      >
                        Receive & Start
                      </Button>
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <GarmentTable
              garments={brovaReturns}
              selectedIds={selectedBrova}
              onToggle={toggleGarment(setSelectedBrova)}
              onReceive={handleReceiveSingle}
              onReceiveAndStart={async (id) => {
                await receiveStartMut.mutateAsync([id]);
              }}
              isReceiving={receiveMut.isPending}
              isReceiveStarting={receiveStartMut.isPending}
            />
          )}
          <BatchActionBar
            count={selectedBrova.size}
            onClear={() => setSelectedBrova(new Set())}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                handleReceiveBatch(selectedBrova, () => setSelectedBrova(new Set()))
              }
              disabled={receiveMut.isPending}
            >
              Receive
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await receiveStartMut.mutateAsync([...selectedBrova]);
                setSelectedBrova(new Set());
              }}
              disabled={receiveStartMut.isPending}
            >
              Receive & Start
            </Button>
          </BatchActionBar>
        </TabsContent>

        {/* ── ALTERATION IN — garment level ── */}
        <TabsContent value="alteration-in">
          {isLoading ? (
            <LoadingSkeleton />
          ) : alterationIn.length === 0 ? (
            <EmptyState icon={Clock} message="No alteration returns in transit" />
          ) : isMobile ? (
            <div className="space-y-2">
              {alterationIn.map((g, i) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  selected={selectedAltIn.has(g.id)}
                  onSelect={toggleGarment(setSelectedAltIn)}
                  showPipeline={false}
                  index={i}
                  actions={
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReceiveSingle(g.id)}
                        disabled={receiveMut.isPending}
                        className="text-xs h-7"
                      >
                        Receive
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          await receiveStartMut.mutateAsync([g.id]);
                        }}
                        disabled={receiveStartMut.isPending}
                        className="text-xs h-7"
                      >
                        Receive & Start
                      </Button>
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <GarmentTable
              garments={alterationIn}
              selectedIds={selectedAltIn}
              onToggle={toggleGarment(setSelectedAltIn)}
              onReceive={handleReceiveSingle}
              onReceiveAndStart={async (id) => {
                await receiveStartMut.mutateAsync([id]);
              }}
              isReceiving={receiveMut.isPending}
              isReceiveStarting={receiveStartMut.isPending}
              showAlteration
            />
          )}
          <BatchActionBar
            count={selectedAltIn.size}
            onClear={() => setSelectedAltIn(new Set())}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                handleReceiveBatch(selectedAltIn, () => setSelectedAltIn(new Set()))
              }
              disabled={receiveMut.isPending}
            >
              Receive
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await receiveStartMut.mutateAsync([...selectedAltIn]);
                setSelectedAltIn(new Set());
              }}
              disabled={receiveStartMut.isPending}
            >
              Receive & Start
            </Button>
          </BatchActionBar>
        </TabsContent>

        {/* ── ALTERATION OUT — placeholder ── */}
        <TabsContent value="alteration-out">
          <EmptyState message="No outgoing alterations" />
        </TabsContent>

        {/* ── LOST IN TRANSIT ── */}
        <TabsContent value="lost-in-transit">
          {isLoading ? (
            <LoadingSkeleton />
          ) : lostInTransit.length === 0 ? (
            <EmptyState icon={CircleX} message="No garments lost in transit" />
          ) : (
            <div className="space-y-2">
              {lostInTransit.map((g) => (
                <LostGarmentCard
                  key={g.id}
                  garment={g}
                  onReceive={async () => {
                    await receiveMut.mutateAsync([g.id]);
                  }}
                  isReceiving={receiveMut.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
