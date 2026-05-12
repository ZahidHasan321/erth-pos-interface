import { Loader2, Package } from "lucide-react";
import { Button } from "@repo/ui/button";
import { useCollectGarmentsMutation } from "@/hooks/useCashier";
import { useGarmentCollection } from "@/hooks/useGarmentCollection";
import { GarmentCollection } from "@/components/cashier/garment-collection";

type Props = {
    order: any;
    garments: any[];
    isHomeDelivery: boolean;
};

export function HandoverMode({ order, garments, isHomeDelivery }: Props) {
    const eligibleGarments = garments.filter((g: any) =>
        g.location === "shop" && ["ready_for_pickup", "brova_trialed", "awaiting_trial"].includes(g.piece_stage)
    );
    const collection = useGarmentCollection({ orderId: String(order.id), eligibleGarments, isHomeDelivery });
    const collectMutation = useCollectGarmentsMutation();
    const hasEligible = eligibleGarments.length > 0;
    const selectedCount = collection.selectedIds.size;

    const onSubmit = () => {
        collectMutation.mutate(
            {
                orderId: order.id,
                garmentIds: Array.from(collection.selectedIds),
                fulfillmentOverrides: Object.fromEntries(collection.fulfillmentModes),
            },
            {
                onSuccess: (res) => { if (res.status === "success") collection.clear(); },
            }
        );
    };

    return (
        <div className="max-w-3xl mx-auto space-y-3 lg:h-full lg:overflow-y-auto">
            <div className="bg-card border-2 border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold flex items-center gap-2">
                        <Package className="h-4 w-4" /> Hand over to customer
                    </h3>
                    <span className="text-sm text-muted-foreground tabular-nums">
                        {eligibleGarments.length} ready / {garments.length} total
                    </span>
                </div>
                {hasEligible ? (
                    <GarmentCollection
                        garments={garments}
                        selectedIds={collection.selectedIds}
                        onToggle={collection.toggle}
                        onToggleAll={collection.toggleAll}
                        fulfillmentModes={collection.fulfillmentModes}
                        onFulfillmentModeChange={collection.setMode}
                        isHomeDelivery={isHomeDelivery}
                    />
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                        No garments ready for handover yet.
                    </p>
                )}
            </div>

            <Button
                type="button"
                onClick={onSubmit}
                disabled={selectedCount === 0 || collectMutation.isPending}
                className="w-full h-14 text-base font-bold"
            >
                {collectMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</>
                ) : selectedCount === 0 ? (
                    `Select garments to ${collection.actionLabel.toLowerCase()}`
                ) : (
                    `${collection.actionLabel} ${selectedCount} garment${selectedCount !== 1 ? "s" : ""}`
                )}
            </Button>
        </div>
    );
}
