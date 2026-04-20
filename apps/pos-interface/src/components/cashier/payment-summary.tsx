import { Separator } from "@repo/ui/separator";
import { Tag } from "lucide-react";

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
    flat: "Flat",
    referral: "Referral",
    loyalty: "Loyalty",
    by_value: "By Value",
};

interface PaymentSummaryProps {
    order: any;
    totalPayments: number;
    totalRefunds: number;
}

export function PaymentSummary({ order, totalPayments, totalRefunds }: PaymentSummaryProps) {
    const orderTotal = Number(order?.order_total) || 0;
    const totalPaid = Number(order?.paid) || 0;
    const remainingBalance = orderTotal - totalPaid;
    const discountValue = Number(order?.discount_value) || 0;
    const discountPercentage = Number(order?.discount_percentage) || 0;
    const discountType = order?.discount_type;
    const deliveryCharge = Number(order?.delivery_charge) || 0;
    const expressCharge = Number(order?.express_charge) || 0;
    const soakingCharge = Number(order?.soaking_charge) || 0;
    const fabricCharge = Number(order?.fabric_charge) || 0;
    const stitchingCharge = Number(order?.stitching_charge) || 0;
    const styleCharge = Number(order?.style_charge) || 0;
    const shelfCharge = Number(order?.shelf_charge) || 0;

    const isWorkOrder = order?.order_type === "WORK";

    const subtotal = orderTotal + discountValue;

    // Advance = 50% stitching + 100% everything else, capped at remaining balance
    // (so a 100% discount or near-paid order doesn't demand a phantom advance)
    const advanceRaw = (stitchingCharge * 0.5) + fabricCharge + styleCharge + deliveryCharge + expressCharge + soakingCharge + shelfCharge;
    const advance = Math.min(advanceRaw, Math.max(0, remainingBalance));
    const isOverpaid = remainingBalance < -0.001;

    const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();

    return (
        <div className="space-y-1.5 text-sm">
            {/* Charge breakdown — always show for work orders, only non-zero for sales */}
            <div className="space-y-1">
                {(isWorkOrder || stitchingCharge > 0) && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Stitching</span>
                        <span className="tabular-nums">{fmt(stitchingCharge)} KD</span>
                    </div>
                )}
                {(isWorkOrder || fabricCharge > 0) && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Fabric</span>
                        <span className="tabular-nums">{fmt(fabricCharge)} KD</span>
                    </div>
                )}
                {(isWorkOrder || styleCharge > 0) && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Style</span>
                        <span className="tabular-nums">{fmt(styleCharge)} KD</span>
                    </div>
                )}
                {(isWorkOrder || deliveryCharge > 0) && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Delivery</span>
                        <span className="tabular-nums">{fmt(deliveryCharge)} KD</span>
                    </div>
                )}
                {expressCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Express</span>
                        <span className="tabular-nums">{fmt(expressCharge)} KD</span>
                    </div>
                )}
                {soakingCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Soaking</span>
                        <span className="tabular-nums">{fmt(soakingCharge)} KD</span>
                    </div>
                )}
                {shelfCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Shelf Items</span>
                        <span className="tabular-nums">{fmt(shelfCharge)} KD</span>
                    </div>
                )}
            </div>

            {discountValue > 0 && (
                <>
                    <div className="flex justify-between pt-1">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="tabular-nums">{fmt(subtotal)} KD</span>
                    </div>
                    <div className="flex justify-between text-amber-600">
                        <span className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            Discount
                            {discountType && <span className="text-xs">({DISCOUNT_TYPE_LABELS[discountType] || discountType})</span>}
                            {discountPercentage > 0 && <span className="text-xs">{discountPercentage}%</span>}
                        </span>
                        <span className="tabular-nums">-{fmt(discountValue)} KD</span>
                    </div>
                </>
            )}

            <div className="flex justify-between font-medium pt-0.5">
                <span>Order Total</span>
                <span className="tabular-nums">{fmt(orderTotal)} KD</span>
            </div>

            <Separator />

            <div className="flex justify-between text-green-600">
                <span>Payments</span>
                <span className="tabular-nums">{fmt(totalPayments)} KD</span>
            </div>
            {totalRefunds > 0 && (
                <div className="flex justify-between text-red-600">
                    <span>Refunds</span>
                    <span className="tabular-nums">-{fmt(totalRefunds)} KD</span>
                </div>
            )}

            <Separator />

            <div className={`flex justify-between font-bold text-base ${isOverpaid ? "text-amber-600" : remainingBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                <span>{isOverpaid ? "Overpaid" : remainingBalance <= 0 ? "Fully Paid" : "Remaining"}</span>
                <span className="tabular-nums">{isOverpaid ? `+${fmt(Math.abs(remainingBalance))}` : fmt(Math.max(0, remainingBalance))} KD</span>
            </div>

            {/* Advance reference — only when not yet covered */}
            {isWorkOrder && advance > 0 && totalPaid < advance && (
                <div className="flex items-center justify-between text-xs font-medium px-2.5 py-2 mt-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                    <span>Minimum advance</span>
                    <span className="font-bold tabular-nums">{fmt(advance)} KD</span>
                </div>
            )}
        </div>
    );
}
