import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useDispatchGarments } from "@/hooks/useGarmentMutations";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { PageHeader, StatsCard, EmptyState, LoadingSkeleton } from "@/components/shared/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Truck, Package, ArrowRightLeft } from "lucide-react";

export const Route = createFileRoute("/(main)/dispatch")({
  component: DispatchPage,
  head: () => ({ meta: [{ title: "Dispatch" }] }),
});

// ── Page ─────────────────────────────────────────────────────────────────────

function DispatchPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();
  const dispatchMut = useDispatchGarments();

  // Ready garments at workshop — includes accepted/completed garments that ended up back here
  const DISPATCH_STAGES = new Set(["ready_for_dispatch", "brova_trialed", "completed", "ready_for_pickup"]);
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
    <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-28">
      <PageHeader
        icon={Truck}
        title="Dispatch"
        subtitle={`${readyGarments.length} garment${readyGarments.length !== 1 ? "s" : ""} ready for dispatch`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <StatsCard icon={Package} value={readyGarments.length} label="Ready" color="green" />
        <StatsCard icon={ArrowRightLeft} value={inTransitGarments.length} label="In Transit" color="blue" dimOnZero />
      </div>

      <Tabs defaultValue="ready">
        <TabsList className="mb-3 flex-nowrap overflow-x-auto">
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
          ) : (
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
          ) : (
            <div className="space-y-2">
              {inTransitGarments.map((g) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  showPipeline={false}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
