import { Card } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { Package, Shirt } from "lucide-react";
import { GarmentCollection } from "@/components/cashier/garment-collection";
import { RefundItemSelector } from "@/components/cashier/refund-item-selector";
import { usePricing } from "@/hooks/usePricing";
import type { FulfillmentMode } from "@/hooks/useGarmentCollection";
import type { RefundItem } from "@/api/cashier";

const fmtK = (n: number): string => `${Number(Number(n).toFixed(3)).toString()} KWD`;

type Props = {
    order: any;
    garments: any[];
    shelfItems: any[];
    isCancelled: boolean;
    isRefundMode: boolean;
    showRefundUI: boolean;
    allGarmentsCompleted: boolean;
    isHomeDelivery: boolean;
    totalPaid: number;
    selectedIds: Set<string>;
    fulfillmentModes: Map<string, FulfillmentMode>;
    onToggle: (id: string) => void;
    onToggleAll: () => void;
    onFulfillmentModeChange: (id: string, mode: FulfillmentMode) => void;
    onRefundItemsChange: (items: RefundItem[], total: number) => void;
};

export function OrderItemsSection({
    order, garments, shelfItems, isCancelled, isRefundMode, showRefundUI,
    allGarmentsCompleted, isHomeDelivery, totalPaid,
    selectedIds, fulfillmentModes, onToggle, onToggleAll, onFulfillmentModeChange,
    onRefundItemsChange,
}: Props) {
    const { getPrice } = usePricing();
    const isSalesOrder = order?.order_type === "SALES";
    const hasGarments = garments.length > 0;
    const hasShelfItems = shelfItems.length > 0;

    if (!hasGarments && !hasShelfItems) return null;

    if (showRefundUI) {
        return (
            <Card className="p-3 border-red-200 bg-red-50/30">
                <h3 className="font-semibold flex items-center gap-2 text-sm mb-2">
                    <Shirt className="h-4 w-4 text-red-600" />Select Items to Refund
                </h3>
                <RefundItemSelector
                    garments={garments as any}
                    shelfItems={shelfItems as any}
                    expressSurcharge={getPrice("EXPRESS_SURCHARGE") || 2}
                    soaking8hPrice={getPrice("SOAKING_8H_CHARGE") || 0}
                    soaking24hPrice={getPrice("SOAKING_24H_CHARGE") || 0}
                    totalPaid={totalPaid}
                    onRefundItemsChange={onRefundItemsChange}
                />
            </Card>
        );
    }

    if (isRefundMode) return null;

    const garmentSubtotal = (Number(order?.stitching_charge) || 0)
        + (Number(order?.fabric_charge) || 0)
        + (Number(order?.style_charge) || 0);

    return (
        <div className={`grid grid-cols-1 ${hasGarments && hasShelfItems ? "xl:grid-cols-2" : ""} gap-4`}>
            {hasGarments && (
                <Card className="p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="font-semibold flex items-center gap-2 text-sm">
                            <Shirt className="h-4 w-4" />Garments ({garments.length})
                        </h3>
                        {allGarmentsCompleted && <Badge className="bg-green-600 text-xs">All Completed</Badge>}
                        {garmentSubtotal > 0 && (
                            <span className="ml-auto text-sm font-bold tabular-nums text-muted-foreground">
                                {fmtK(garmentSubtotal)}
                            </span>
                        )}
                    </div>
                    {isCancelled ? (
                        <p className="text-sm text-muted-foreground text-center py-3">Cancelled.</p>
                    ) : (
                        <GarmentCollection
                            garments={garments}
                            selectedIds={selectedIds}
                            onToggle={onToggle}
                            onToggleAll={onToggleAll}
                            fulfillmentModes={fulfillmentModes}
                            onFulfillmentModeChange={onFulfillmentModeChange}
                            isHomeDelivery={isHomeDelivery}
                        />
                    )}
                </Card>
            )}
            {hasShelfItems && (
                <Card className="p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="font-semibold flex items-center gap-2 text-sm">
                            <Package className="h-4 w-4" />
                            {isSalesOrder ? `Items Purchased (${shelfItems.length})` : `Shelf Items (${shelfItems.length})`}
                        </h3>
                        <span className="ml-auto text-sm font-bold tabular-nums text-muted-foreground">
                            {fmtK(shelfItems.reduce((s, i) => s + (i.unit_price * i.quantity), 0))}
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {shelfItems.map((item) => (
                            <div key={item.id} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded-lg">
                                <div>
                                    <span className="font-medium">{item.shelf?.type || `Item #${item.shelf_id}`}</span>
                                    <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                                </div>
                                <span className="font-semibold">{fmtK(item.unit_price * item.quantity)}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
}
