import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useDispatchGarments } from "@/hooks/useGarmentMutations";
import { useIsMobile } from "@/hooks/use-mobile";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { PageHeader, EmptyState, LoadingSkeleton, GarmentTypeBadge } from "@/components/shared/PageShell";
import { StageBadge, ExpressBadge, AlterationBadge } from "@/components/shared/StageBadge";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Checkbox } from "@repo/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@repo/ui/table";
import { toast } from "sonner";
import { Truck, Package } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/dispatch")({
  component: DispatchPage,
  head: () => ({ meta: [{ title: "Dispatch" }] }),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function deliveryUrgency(deliveryDate: string | null | undefined) {
  if (!deliveryDate) return { label: null, className: "text-muted-foreground" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delivery = new Date(deliveryDate + "T00:00:00");
  const daysLeft = Math.ceil((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)
    return { label: `+${Math.abs(daysLeft)}d`, className: "text-red-700 bg-red-100 px-1.5 py-0.5 rounded" };
  if (daysLeft <= 2)
    return { label: null, className: "text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded" };
  return { label: null, className: "text-muted-foreground" };
}

// ── Desktop Tables ──────────────────────────────────────────────────────────

function ReadyTable({
  garments,
  selectedReady,
  onToggle,
  onDispatchSingle,
  isPending,
}: {
  garments: WorkshopGarment[];
  selectedReady: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onDispatchSingle: (id: string) => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-10" />
            <TableHead className="w-20">Type</TableHead>
            <TableHead>Garment</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="w-24">Express</TableHead>
            <TableHead>Delivery</TableHead>
            <TableHead className="w-28 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {garments.map((g) => {
            const urgency = deliveryUrgency(g.delivery_date_order);
            const isSelected = selectedReady.has(g.id);
            return (
              <TableRow
                key={g.id}
                className={cn(
                  g.express && "bg-orange-50/60",
                  isSelected && "bg-primary/5",
                )}
              >
                <TableCell>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => onToggle(g.id, !!checked)}
                  />
                </TableCell>
                <TableCell>
                  <GarmentTypeBadge type={g.garment_type ?? "final"} />
                </TableCell>
                <TableCell className="font-mono font-bold text-sm">
                  {g.garment_id}
                </TableCell>
                <TableCell className="text-sm">{g.customer_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{g.order_id}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <StageBadge stage={g.piece_stage} />
                    <AlterationBadge tripNumber={g.trip_number} garmentType={g.garment_type} />
                  </div>
                </TableCell>
                <TableCell>
                  {g.express && <ExpressBadge />}
                </TableCell>
                <TableCell>
                  {g.delivery_date_order ? (
                    <span className={cn("text-xs font-medium rounded", urgency.className)}>
                      {formatDate(g.delivery_date_order)}
                      {urgency.label && <span className="ml-1 font-bold">{urgency.label}</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => onDispatchSingle(g.id)}
                    disabled={isPending}
                    className="text-xs h-7"
                  >
                    <Truck className="w-3 h-3 mr-1" />
                    Dispatch
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function InTransitTable({ garments }: { garments: WorkshopGarment[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-20">Type</TableHead>
            <TableHead>Garment</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="w-24">Express</TableHead>
            <TableHead>Delivery</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {garments.map((g) => {
            const urgency = deliveryUrgency(g.delivery_date_order);
            return (
              <TableRow
                key={g.id}
                className={cn(g.express && "bg-orange-50/60")}
              >
                <TableCell>
                  <GarmentTypeBadge type={g.garment_type ?? "final"} />
                </TableCell>
                <TableCell className="font-mono font-bold text-sm">
                  {g.garment_id}
                </TableCell>
                <TableCell className="text-sm">{g.customer_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{g.order_id}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <StageBadge stage={g.piece_stage} />
                    <AlterationBadge tripNumber={g.trip_number} garmentType={g.garment_type} />
                  </div>
                </TableCell>
                <TableCell>
                  {g.express && <ExpressBadge />}
                </TableCell>
                <TableCell>
                  {g.delivery_date_order ? (
                    <span className={cn("text-xs font-medium rounded", urgency.className)}>
                      {formatDate(g.delivery_date_order)}
                      {urgency.label && <span className="ml-1 font-bold">{urgency.label}</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function DispatchPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();
  const dispatchMut = useDispatchGarments();
  const isMobile = useIsMobile();

  // Ready garments at workshop — ready_for_dispatch (passed QC) or brova_trialed (accepted, returning with order)
  const DISPATCH_STAGES = new Set(["ready_for_dispatch", "brova_trialed"]);
  const readyGarments = useMemo(
    () => allGarments
      .filter((g) => g.location === "workshop" && DISPATCH_STAGES.has(g.piece_stage ?? ""))
      .sort((a, b) => {
        if (a.express && !b.express) return -1;
        if (!a.express && b.express) return 1;
        const dateA = a.delivery_date_order ?? "";
        const dateB = b.delivery_date_order ?? "";
        if (dateA && dateB) return dateA.localeCompare(dateB);
        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;
        return 0;
      }),
    [allGarments],
  );

  // In transit garments
  const inTransitGarments = useMemo(
    () => allGarments.filter((g) => g.location === "transit_to_shop"),
    [allGarments],
  );

  // Selection (garment-level)
  const [selectedReady, setSelectedReady] = useState<Set<string>>(new Set());

  const toggleGarment = (
    setFn: React.Dispatch<React.SetStateAction<Set<string>>>,
  ) => (id: string, checked: boolean) =>
    setFn((prev) => {
      const n = new Set(prev);
      checked ? n.add(id) : n.delete(id);
      return n;
    });

  const handleDispatchSingle = async (id: string) => {
    await dispatchMut.mutateAsync([id]);
    toast.success("Garment dispatched");
  };

  const handleBatchDispatch = async () => {
    const ids = [...selectedReady];
    await dispatchMut.mutateAsync(ids);
    toast.success(`${ids.length} garment(s) dispatched`);
    setSelectedReady(new Set());
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-28">
      <PageHeader
        icon={Truck}
        title="Dispatch"
        subtitle={`${readyGarments.length} garment${readyGarments.length !== 1 ? "s" : ""} ready for dispatch`}
      />

      <Tabs defaultValue="ready">
        <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="ready">
            Ready{" "}
            <Badge variant="secondary" className="ml-1 text-xs bg-green-100 text-green-700">
              {readyGarments.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="transit">
            In Transit{" "}
            <Badge variant="secondary" className="ml-1 text-xs bg-blue-100 text-blue-700">
              {inTransitGarments.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── READY — garment level ── */}
        <TabsContent value="ready">
          {isLoading ? (
            <LoadingSkeleton />
          ) : readyGarments.length === 0 ? (
            <EmptyState icon={Package} message="No garments ready for dispatch" />
          ) : isMobile ? (
            <div className="space-y-2">
              {readyGarments.map((g) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  selected={selectedReady.has(g.id)}
                  onSelect={toggleGarment(setSelectedReady)}
                  showPipeline={false}
                  actions={
                    <Button
                      size="sm"
                      onClick={() => handleDispatchSingle(g.id)}
                      disabled={dispatchMut.isPending}
                      className="text-xs h-7"
                    >
                      <Truck className="w-3 h-3 mr-1" />
                      Dispatch
                    </Button>
                  }
                />
              ))}
            </div>
          ) : (
            <ReadyTable
              garments={readyGarments}
              selectedReady={selectedReady}
              onToggle={toggleGarment(setSelectedReady)}
              onDispatchSingle={handleDispatchSingle}
              isPending={dispatchMut.isPending}
            />
          )}
          <BatchActionBar
            count={selectedReady.size}
            onClear={() => setSelectedReady(new Set())}
          >
            <Button
              size="sm"
              onClick={handleBatchDispatch}
              disabled={dispatchMut.isPending}
            >
              Dispatch Selected
            </Button>
          </BatchActionBar>
        </TabsContent>

        {/* ── IN TRANSIT — garment level, read-only ── */}
        <TabsContent value="transit">
          {inTransitGarments.length === 0 ? (
            <EmptyState icon={Truck} message="Nothing in transit" />
          ) : isMobile ? (
            <div className="space-y-2">
              {inTransitGarments.map((g) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  showPipeline={false}
                />
              ))}
            </div>
          ) : (
            <InTransitTable garments={inTransitGarments} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
