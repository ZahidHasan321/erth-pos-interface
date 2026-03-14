import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useDispatchGarments } from "@/hooks/useGarmentMutations";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Truck, Package } from "lucide-react";

export const Route = createFileRoute("/(main)/dispatch")({
  component: DispatchPage,
  head: () => ({ meta: [{ title: "Dispatch" }] }),
});

// ── Page ─────────────────────────────────────────────────────────────────────

function DispatchPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();
  const dispatchMut = useDispatchGarments();

  // Ready garments at workshop — includes accepted/completed garments that ended up back here
  const DISPATCH_STAGES = new Set(["ready_for_dispatch", "accepted", "completed", "ready_for_pickup"]);
  const readyGarments = useMemo(
    () => allGarments.filter(
      (g) => g.location === "workshop" && DISPATCH_STAGES.has(g.piece_stage ?? ""),
    ),
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
    <div className="p-6 max-w-4xl mx-auto pb-28">
      <div className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          <Truck className="w-6 h-6" /> Dispatch
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {readyGarments.length} garment{readyGarments.length !== 1 ? "s" : ""}{" "}
          ready for dispatch
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-green-700">{readyGarments.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 opacity-70">Ready</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-center">
          <p className="text-xl font-black text-blue-700">{inTransitGarments.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 opacity-70">In Transit</p>
        </div>
      </div>

      <Tabs defaultValue="ready">
        <TabsList className="mb-4">
          <TabsTrigger value="ready">
            Ready{" "}
            <Badge variant="secondary" className="ml-1 text-xs bg-green-100 text-green-700">
              {readyGarments.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="transit">
            In Transit{" "}
            <Badge variant="secondary" className="ml-1 text-xs">
              {inTransitGarments.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── READY — garment level ── */}
        <TabsContent value="ready">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : readyGarments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl">
              <Package className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">
                No garments ready for dispatch
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {readyGarments.map((g, i) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  selected={selectedReady.has(g.id)}
                  onSelect={toggleGarment(setSelectedReady)}
                  showPipeline={false}
                  index={i}
                  actions={
                    <Button
                      size="sm"
                      onClick={() => handleDispatchSingle(g.id)}
                      disabled={dispatchMut.isPending}
                      className="h-9 px-4 text-sm font-bold"
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
            <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl">
              <Truck className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">
                Nothing in transit
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {inTransitGarments.map((g, i) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  showPipeline={false}
                  index={i}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
