import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useReceiveGarments, useReceiveAndStart } from "@/hooks/useGarmentMutations";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StageBadge, BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Inbox, ChevronDown, ChevronUp, Clock, Package, Home } from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/receiving")({
  component: ReceivingPage,
  head: () => ({ meta: [{ title: "Receiving" }] }),
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

// ── OrderCard (order-level, for Incoming tab) ────────────────────────────────

function OrderCard({
  group,
  selected,
  onToggle,
  onReceivePark,
  onReceiveSchedule,
  isReceiving,
}: {
  group: OrderGroup;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onReceivePark: () => void;
  onReceiveSchedule: () => void;
  isReceiving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const deliveryDate = group.garments[0]?.delivery_date_order;

  return (
    <div
      className={cn(
        "bg-white border rounded-xl transition-all shadow-sm border-l-4",
        group.express ? "border-l-orange-400 ring-1 ring-orange-200" : "border-l-border",
        selected && "border-primary ring-1 ring-primary/30",
      )}
    >
      {/* Header - clickable to expand */}
      <div
        className="px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-xl"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => { e.stopPropagation(); onToggle(e.target.checked); }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 accent-primary cursor-pointer shrink-0 mt-1"
          />

          {/* Left: order info */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Top row: ID + customer + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-base">#{group.order_id}</span>
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
            </div>

            {/* Bottom row: metadata chips */}
            <div className="flex items-center flex-wrap gap-1.5">
              {group.invoice_number && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
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
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-100 font-semibold px-2 py-0.5 rounded-md">
                  <Clock className="w-3 h-3" />
                  {formatDate(deliveryDate)}
                </span>
              )}
            </div>
          </div>

          {/* Right: action buttons + chevron indicator */}
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); onReceivePark(); }}
              disabled={isReceiving}
              className="text-xs h-7"
            >
              Receive
            </Button>
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onReceiveSchedule(); }}
              disabled={isReceiving}
              className="text-xs h-7"
            >
              Receive & Start
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

      {/* Expanded garment list */}
      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-3 space-y-2">
          {group.garments.map((g) => (
            <div key={g.id} className="bg-white rounded-lg border p-2 flex items-center gap-2">
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
              {g.express && <ExpressBadge />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-2xl">
      <Inbox className="w-10 h-10 text-muted-foreground/30 mb-3" />
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

function ReceivingPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();
  const receiveMut = useReceiveGarments();
  const receiveStartMut = useReceiveAndStart();

  // Split by tab
  const inTransit = allGarments.filter((g) => g.location === "transit_to_workshop");
  const incoming = inTransit.filter((g) => (g.trip_number ?? 1) === 1);
  const brovaReturns = inTransit.filter(
    (g) => (g.trip_number ?? 1) > 1 && g.garment_type === "brova",
  );
  const alterationIn = inTransit.filter(
    (g) => (g.trip_number ?? 1) > 1 && g.garment_type === "final",
  );
  const incomingOrders = groupByOrder(incoming);

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
    toast.success(`Order #${group.order_id} received → Received`);
  };

  const handleReceiveScheduleOrder = async (group: OrderGroup) => {
    const ids = group.garments.map((g) => g.id);
    await receiveStartMut.mutateAsync(ids);
    toast.success(`Order #${group.order_id} received → Started`);
  };

  // Batch actions
  const handleReceiveOrders = async () => {
    const ids = getSelectedIncomingGarmentIds();
    await receiveMut.mutateAsync(ids);
    toast.success(`${selectedOrderIds.size} order(s) received → Received`);
    setSelectedOrderIds(new Set());
  };

  const handleReceiveAndStartOrders = async () => {
    const ids = getSelectedIncomingGarmentIds();
    await receiveStartMut.mutateAsync(ids);
    toast.success(`${selectedOrderIds.size} order(s) received → Started`);
    setSelectedOrderIds(new Set());
  };

  const handleReceiveSingle = async (id: string) => {
    await receiveMut.mutateAsync([id]);
    toast.success("Garment received → Received");
  };

  const handleReceiveBatch = async (
    ids: Set<string>,
    clearFn: () => void,
  ) => {
    await receiveMut.mutateAsync([...ids]);
    toast.success(`${ids.size} garment(s) received → Received`);
    clearFn();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto pb-28">
      <div className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          <Inbox className="w-6 h-6" /> Receiving
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {inTransit.length} garment{inTransit.length !== 1 ? "s" : ""} in transit from shop
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <div className="border rounded-xl p-2.5 text-center bg-blue-50 text-blue-700 border-blue-200 shadow-sm">
          <Inbox className="w-4 h-4 mx-auto mb-1 opacity-60" />
          <p className="text-xl font-black leading-none">{incomingOrders.length}</p>
          <p className="text-[10px] mt-1 uppercase tracking-wider font-bold opacity-70">Incoming</p>
        </div>
        <div className="border rounded-xl p-2.5 text-center bg-purple-50 text-purple-700 border-purple-200 shadow-sm">
          <Package className="w-4 h-4 mx-auto mb-1 opacity-60" />
          <p className="text-xl font-black leading-none">{brovaReturns.length}</p>
          <p className="text-[10px] mt-1 uppercase tracking-wider font-bold opacity-70">Brova Returns</p>
        </div>
        <div className="border rounded-xl p-2.5 text-center bg-orange-50 text-orange-700 border-orange-200 shadow-sm">
          <Clock className="w-4 h-4 mx-auto mb-1 opacity-60" />
          <p className="text-xl font-black leading-none">{alterationIn.length}</p>
          <p className="text-[10px] mt-1 uppercase tracking-wider font-bold opacity-70">Alteration In</p>
        </div>
      </div>

      <Tabs defaultValue="incoming">
        <TabsList className="mb-4 h-auto flex-wrap gap-1">
          <TabsTrigger value="incoming">
            Incoming{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              {incomingOrders.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="brova-returns">
            Brova Returns{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              {brovaReturns.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="alteration-in">
            Alteration In{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              {alterationIn.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="alteration-out">
            Alteration Out{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              0
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── INCOMING — order level ── */}
        <TabsContent value="incoming">
          {isLoading ? (
            <LoadingSkeleton />
          ) : incomingOrders.length === 0 ? (
            <EmptyState message="No incoming orders" />
          ) : (
            <div className="space-y-3">
              {incomingOrders.map((group) => (
                <OrderCard
                  key={group.order_id}
                  group={group}
                  selected={selectedOrderIds.has(group.order_id)}
                  onToggle={(checked) => toggleOrder(group.order_id, checked)}
                  onReceivePark={() => handleReceiveParkOrder(group)}
                  onReceiveSchedule={() => handleReceiveScheduleOrder(group)}
                  isReceiving={receiveMut.isPending || receiveStartMut.isPending}
                />
              ))}
            </div>
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
            <EmptyState message="No brova returns in transit" />
          ) : (
            <div className="space-y-3">
              {brovaReturns.map((g, i) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  selected={selectedBrova.has(g.id)}
                  onSelect={toggleGarment(setSelectedBrova)}
                  showPipeline={false}
                  index={i}
                  actions={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReceiveSingle(g.id)}
                      disabled={receiveMut.isPending}
                    >
                      Receive
                    </Button>
                  }
                />
              ))}
            </div>
          )}
          <BatchActionBar
            count={selectedBrova.size}
            onClear={() => setSelectedBrova(new Set())}
          >
            <Button
              size="sm"
              onClick={() =>
                handleReceiveBatch(selectedBrova, () => setSelectedBrova(new Set()))
              }
              disabled={receiveMut.isPending}
            >
              Receive All
            </Button>
          </BatchActionBar>
        </TabsContent>

        {/* ── ALTERATION IN — garment level ── */}
        <TabsContent value="alteration-in">
          {isLoading ? (
            <LoadingSkeleton />
          ) : alterationIn.length === 0 ? (
            <EmptyState message="No alteration returns in transit" />
          ) : (
            <div className="space-y-3">
              {alterationIn.map((g, i) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  selected={selectedAltIn.has(g.id)}
                  onSelect={toggleGarment(setSelectedAltIn)}
                  showPipeline={false}
                  index={i}
                  actions={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReceiveSingle(g.id)}
                      disabled={receiveMut.isPending}
                    >
                      Receive
                    </Button>
                  }
                />
              ))}
            </div>
          )}
          <BatchActionBar
            count={selectedAltIn.size}
            onClear={() => setSelectedAltIn(new Set())}
          >
            <Button
              size="sm"
              onClick={() =>
                handleReceiveBatch(selectedAltIn, () => setSelectedAltIn(new Set()))
              }
              disabled={receiveMut.isPending}
            >
              Receive All
            </Button>
          </BatchActionBar>
        </TabsContent>

        {/* ── ALTERATION OUT — placeholder ── */}
        <TabsContent value="alteration-out">
          <EmptyState message="No outgoing alterations" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
