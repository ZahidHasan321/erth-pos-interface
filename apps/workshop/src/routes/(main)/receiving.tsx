import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useReceiveGarments, useReceiveAndStart } from "@/hooks/useGarmentMutations";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import {
  PageHeader, StatsCard, EmptyState, LoadingSkeleton,
  GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { cn, clickableProps, formatDate, groupByOrder, garmentSummary, type OrderGroup } from "@/lib/utils";
import { toast } from "sonner";
import { Inbox, ChevronDown, ChevronUp, Clock, Package, Home, Eye } from "lucide-react";
import { OrderPeekSheet } from "@/components/shared/PeekSheets";

export const Route = createFileRoute("/(main)/receiving")({
  component: ReceivingPage,
  head: () => ({ meta: [{ title: "Receiving" }] }),
});

// helpers imported from @/lib/utils: groupByOrder, garmentSummary, OrderGroup

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
  const [peekOpen, setPeekOpen] = useState(false);
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
        "bg-card border rounded-xl transition-[color,background-color,border-color,box-shadow] shadow-sm border-l-4",
        group.express ? "border-l-orange-400 ring-1 ring-orange-200" : "border-l-border",
        selected && "border-primary ring-2 ring-primary/20 bg-primary/5",
      )}
    >
      <div
        className="px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-xl"
        onClick={() => onToggle(!selected)}
        {...clickableProps(() => onToggle(!selected))}
      >
        {/* Row 1: Identity + actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => { e.stopPropagation(); onToggle(e.target.checked); }}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select order #${group.order_id}`}
              className="w-4 h-4 accent-primary cursor-pointer shrink-0"
            />
            <span className="font-mono font-bold text-lg shrink-0">#{group.order_id}</span>
            {group.invoice_number && (
              <span className="text-sm text-muted-foreground/50 font-mono shrink-0">· #{group.invoice_number}</span>
            )}
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
            <span className="text-base text-muted-foreground truncate">{group.customer_name ?? "—"}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onReceivePark(); }} disabled={isReceiving} className="text-xs h-7">
              Receive
            </Button>
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onReceiveSchedule(); }} disabled={isReceiving} className="text-xs h-7">
              Receive & Start
            </Button>
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
            <div key={g.id} className="bg-card rounded-lg border p-2 flex items-center gap-2">
              <GarmentTypeBadge type={g.garment_type ?? "final"} />
              <span className="font-mono text-xs font-bold">{g.garment_id ?? g.id.slice(0, 8)}</span>
              {g.express && <ExpressBadge />}
            </div>
          ))}
        </div>
      )}
    </div>
    <OrderPeekSheet orderId={peekOpen ? group.order_id : null} open={peekOpen} onOpenChange={setPeekOpen} />
    </>
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
    <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-28">
      <PageHeader
        icon={Inbox}
        title="Receiving"
        subtitle={`${inTransit.length} garment${inTransit.length !== 1 ? "s" : ""} in transit from shop`}
      />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatsCard icon={Inbox} value={incomingOrders.length} label="Incoming" color="blue" />
        <StatsCard icon={Package} value={brovaReturns.length} label="Brova Returns" color="purple" />
        <StatsCard icon={Clock} value={alterationIn.length} label="Alteration In" color="orange" dimOnZero />
      </div>

      <Tabs defaultValue="incoming">
        <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto">
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
        </TabsList>

        {/* ── INCOMING — order level ── */}
        <TabsContent value="incoming">
          {isLoading ? (
            <LoadingSkeleton />
          ) : incomingOrders.length === 0 ? (
            <EmptyState icon={Inbox} message="No incoming orders" />
          ) : (
            <div className="space-y-2">
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
            <EmptyState icon={Package} message="No brova returns in transit" />
          ) : (
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
                          toast.success(`Brova ${g.garment_id ?? g.id.slice(0, 8)} received → Scheduler`);
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
                toast.success(`${selectedBrova.size} brova(s) received → Scheduler`);
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
          ) : (
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
                          toast.success(`Garment ${g.garment_id ?? g.id.slice(0, 8)} received → Scheduler`);
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
                toast.success(`${selectedAltIn.size} garment(s) received → Scheduler`);
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
      </Tabs>
    </div>
  );
}
