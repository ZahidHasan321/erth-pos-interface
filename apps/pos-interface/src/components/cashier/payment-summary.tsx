import { Separator } from "@repo/ui/separator";
import { Tag } from "lucide-react";
import type { ReactNode } from "react";
import type { Order } from "@repo/database";

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
    flat: "Flat",
    referral: "Referral",
    loyalty: "Loyalty",
    by_value: "By Value",
};

interface PaymentSummaryProps {
    order: Order | null | undefined;
    totalPayments: number;
    totalRefunds: number;
}

function Row({ label, value, className = "", valueClassName = "" }: { label: ReactNode; value: ReactNode; className?: string; valueClassName?: string }) {
    return (
        <div className={`flex items-baseline gap-2 ${className}`}>
            <span className="shrink-0">{label}</span>
            <span aria-hidden className="flex-1 border-b border-dotted border-border/70 translate-y-[-4px]" />
            <span className={`shrink-0 tabular-nums ${valueClassName}`}>{value}</span>
        </div>
    );
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
                    <Row className="text-muted-foreground" label="Stitching" value={`${fmt(stitchingCharge)} KD`} />
                )}
                {(isWorkOrder || fabricCharge > 0) && (
                    <Row className="text-muted-foreground" label="Fabric" value={`${fmt(fabricCharge)} KD`} />
                )}
                {(isWorkOrder || styleCharge > 0) && (
                    <Row className="text-muted-foreground" label="Add-ons" value={`${fmt(styleCharge)} KD`} />
                )}
                {expressCharge > 0 && (
                    <Row className="text-muted-foreground" label="Express" value={`${fmt(expressCharge)} KD`} />
                )}
                {soakingCharge > 0 && (
                    <Row className="text-muted-foreground" label="Soaking" value={`${fmt(soakingCharge)} KD`} />
                )}
                {shelfCharge > 0 && (
                    <Row className="text-muted-foreground" label="Shelf Products" value={`${fmt(shelfCharge)} KD`} />
                )}
            </div>

            {discountValue > 0 && (
                <>
                    <Row
                        className="pt-1"
                        label={<span className="text-muted-foreground">Subtotal</span>}
                        value={`${fmt(subtotal)} KD`}
                    />
                    <Row
                        className="text-amber-600"
                        label={
                            <span className="flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                Discount
                                {discountType && <span className="text-xs">({DISCOUNT_TYPE_LABELS[discountType] || discountType})</span>}
                                {discountPercentage > 0 && <span className="text-xs">{discountPercentage}%</span>}
                            </span>
                        }
                        value={`-${fmt(discountValue)} KD`}
                    />
                </>
            )}

            {deliveryCharge > 0 && (
                <Row className="text-muted-foreground" label="Delivery" value={`${fmt(deliveryCharge)} KD`} />
            )}

            <Row className="font-medium pt-0.5" label="Order Total" value={`${fmt(orderTotal)} KD`} />

            <Separator />

            <Row className="text-green-600" label="Payments" value={`${fmt(totalPayments)} KD`} />
            {totalRefunds > 0 && (
                <Row className="text-red-600" label="Refunds" value={`-${fmt(totalRefunds)} KD`} />
            )}

            <Separator />

            <Row
                className={`font-bold text-base ${isOverpaid ? "text-amber-600" : remainingBalance > 0 ? "text-red-600" : "text-green-600"}`}
                label={isOverpaid ? "Overpaid" : remainingBalance <= 0 ? "Fully Paid" : "Remaining"}
                value={`${isOverpaid ? `+${fmt(Math.abs(remainingBalance))}` : fmt(Math.max(0, remainingBalance))} KD`}
            />

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
