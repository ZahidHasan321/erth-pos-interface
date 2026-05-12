import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@repo/ui/alert";
import { RefundItemSelector } from "@/components/cashier/refund-item-selector";
import { PaymentForm } from "@/components/cashier/payment-form";
import { usePricing } from "@/hooks/usePricing";
import type { RefundItem } from "@/api/cashier";

type Props = {
    order: any;
    garments: any[];
    shelfItems: any[];
    orderTotal: number;
    totalPaid: number;
    advance: number;
    remainingBalance: number;
    cancelledWithPayments: boolean;
};

export function RefundMode({
    order, garments, shelfItems, orderTotal, totalPaid, advance, remainingBalance, cancelledWithPayments,
}: Props) {
    const { getPrice } = usePricing();
    const [refundItems, setRefundItems] = useState<RefundItem[]>([]);
    const [refundTotal, setRefundTotal] = useState(0);

    return (
        <div className="max-w-3xl mx-auto space-y-3 lg:h-full lg:overflow-y-auto">
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                    {cancelledWithPayments
                        ? "Order cancelled with payments on file. Refund the customer to close it out."
                        : "Refund mode — money moves out, not in. Pick items to refund or enter an overpayment amount."}
                </AlertDescription>
            </Alert>

            <div className="bg-card border-2 border-red-200 rounded-xl p-4">
                <h3 className="text-base font-semibold mb-2">Select items to refund</h3>
                <RefundItemSelector
                    garments={garments as any}
                    shelfItems={shelfItems as any}
                    expressSurcharge={getPrice("EXPRESS_SURCHARGE") || 2}
                    soaking8hPrice={getPrice("SOAKING_8H_CHARGE") || 0}
                    soaking24hPrice={getPrice("SOAKING_24H_CHARGE") || 0}
                    totalPaid={totalPaid}
                    onRefundItemsChange={(items, total) => { setRefundItems(items); setRefundTotal(total); }}
                />
            </div>

            <div className="bg-card border-2 border-border rounded-xl p-4">
                <PaymentForm
                    orderId={order.id}
                    remainingBalance={remainingBalance}
                    orderTotal={orderTotal}
                    totalPaid={totalPaid}
                    advance={advance}
                    refundOnly
                    isRefund={true}
                    onRefundModeChange={() => {}}
                    refundItems={refundItems}
                    refundTotal={refundTotal}
                />
            </div>
        </div>
    );
}
