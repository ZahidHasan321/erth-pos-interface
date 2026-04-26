import { Card } from "@repo/ui/card";
import { Alert, AlertDescription } from "@repo/ui/alert";
import { CheckCircle2, CreditCard, XCircle } from "lucide-react";
import { PaymentForm } from "@/components/cashier/payment-form";
import type { RefundItem } from "@/api/cashier";

const fmtK = (n: number): string => `${Number(Number(n).toFixed(3)).toString()} KWD`;

type Props = {
    orderId: number;
    isCancelled: boolean;
    cancelledWithPayments: boolean;
    isFullyPaid: boolean;
    allGarmentsCompleted: boolean;
    isRefundMode: boolean;
    onRefundModeChange: (val: boolean) => void;
    orderTotal: number;
    totalPaid: number;
    advance: number;
    remainingBalance: number;
    refundItems: RefundItem[];
    refundTotal: number;
    selectedCollectIds: Set<string>;
    fulfillmentOverrides: Record<string, "collected" | "delivered">;
    collectActionLabel: string;
    onCollected: () => void;
    onBeforeSubmit: () => Promise<void>;
};

/** Right-column payment card. Picks one of four variants from order state. */
export function PaymentActionCard({
    orderId, isCancelled, cancelledWithPayments, isFullyPaid, allGarmentsCompleted,
    isRefundMode, onRefundModeChange, orderTotal, totalPaid, advance, remainingBalance,
    refundItems, refundTotal,
    selectedCollectIds, fulfillmentOverrides, collectActionLabel, onCollected, onBeforeSubmit,
}: Props) {
    if (cancelledWithPayments) {
        return (
            <Card className="p-3 bg-red-50 border-red-300">
                <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm">
                    <CreditCard className="h-4 w-4" />Refund Cancelled Order
                </h3>
                <Alert variant="destructive" className="mb-2">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                        Order cancelled with {fmtK(totalPaid)} paid. Refund customer to close it out.
                    </AlertDescription>
                </Alert>
                <PaymentForm orderId={orderId} remainingBalance={remainingBalance} orderTotal={orderTotal}
                    totalPaid={totalPaid} advance={advance} refundOnly isRefund={true}
                    onRefundModeChange={() => {}} refundItems={refundItems} refundTotal={refundTotal} />
            </Card>
        );
    }

    if (isCancelled) {
        return (
            <Card className="p-3">
                <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>Cancelled. No payments allowed.</AlertDescription>
                </Alert>
            </Card>
        );
    }

    if (isFullyPaid && allGarmentsCompleted) {
        return (
            <Card className="p-3 bg-green-50 border-green-300">
                <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm">
                    <CreditCard className="h-4 w-4" />Refund Only
                </h3>
                <Alert className="mb-2 bg-green-50 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800 text-xs">
                        Fully paid and all garments collected.
                    </AlertDescription>
                </Alert>
                <PaymentForm orderId={orderId} remainingBalance={remainingBalance} orderTotal={orderTotal}
                    totalPaid={totalPaid} advance={advance} refundOnly isRefund={true}
                    onRefundModeChange={() => {}} refundItems={refundItems} refundTotal={refundTotal} />
            </Card>
        );
    }

    return (
        <Card className={`p-3 ${isFullyPaid ? "bg-green-50 border-green-300" : ""}`}>
            <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm">
                <CreditCard className="h-4 w-4" />
                {isRefundMode ? "Record Refund" : isFullyPaid ? "Refund / Additional" : "Record Payment"}
            </h3>
            {isFullyPaid && !isRefundMode && (
                <Alert className="mb-2 bg-green-50 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800 text-xs">Fully paid.</AlertDescription>
                </Alert>
            )}
            <PaymentForm
                orderId={orderId}
                remainingBalance={remainingBalance}
                orderTotal={orderTotal}
                totalPaid={totalPaid}
                advance={advance}
                collectGarmentIds={isRefundMode ? undefined : selectedCollectIds}
                collectFulfillmentOverrides={isRefundMode ? undefined : fulfillmentOverrides}
                collectActionLabel={isRefundMode ? undefined : collectActionLabel}
                onCollected={onCollected}
                isRefund={isRefundMode}
                onRefundModeChange={onRefundModeChange}
                refundItems={refundItems}
                refundTotal={refundTotal}
                onBeforeSubmit={isRefundMode ? undefined : onBeforeSubmit}
            />
        </Card>
    );
}
