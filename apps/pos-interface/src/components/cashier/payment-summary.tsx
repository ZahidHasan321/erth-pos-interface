import { Separator } from "@/components/ui/separator";
import { Tag } from "lucide-react";
import { usePricing } from "@/hooks/usePricing";

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
    const { getPrice } = usePricing();

    const orderTotal = Number(order?.order_total) || 0;
    const totalPaid = Number(order?.paid) || 0;
    const remainingBalance = orderTotal - totalPaid;
    const discountValue = Number(order?.discount_value) || 0;
    const discountPercentage = Number(order?.discount_percentage) || 0;
    const discountType = order?.discount_type;
    const deliveryCharge = Number(order?.delivery_charge) || 0;
    const fabricCharge = Number(order?.fabric_charge) || 0;
    const stitchingCharge = Number(order?.stitching_charge) || 0;
    const styleCharge = Number(order?.style_charge) || 0;
    const shelfCharge = Number(order?.shelf_charge) || 0;

    // Express: count express garments and compute charge from DB price
    const orderGarments = Array.isArray(order?.garments) ? order.garments : [];
    const expressGarmentCount = orderGarments.filter((g: any) => g.express).length;
    const expressSurcharge = getPrice("EXPRESS_SURCHARGE") || 2;
    const expressCharge = expressGarmentCount * expressSurcharge;

    // Home delivery portion of delivery charge
    const homeDeliveryPrice = getPrice("HOME_DELIVERY") || 5;
    const hasHomeDelivery = order?.home_delivery === true;
    const homeDeliveryCharge = hasHomeDelivery ? homeDeliveryPrice : 0;

    const subtotal = orderTotal + discountValue;

    // Advance = 50% stitching + 100% (fabric + style + delivery + shelf)
    const advance = (stitchingCharge * 0.5) + fabricCharge + styleCharge + deliveryCharge + shelfCharge;

    const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();

    return (
        <div className="space-y-1.5 text-sm">
            {/* Charge breakdown */}
            <div className="space-y-1">
                {stitchingCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Stitching</span>
                        <span>{fmt(stitchingCharge)} KD</span>
                    </div>
                )}
                {fabricCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Fabric</span>
                        <span>{fmt(fabricCharge)} KD</span>
                    </div>
                )}
                {styleCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Style</span>
                        <span>{fmt(styleCharge)} KD</span>
                    </div>
                )}
                {homeDeliveryCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Home Delivery</span>
                        <span>{fmt(homeDeliveryCharge)} KD</span>
                    </div>
                )}
                {expressCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Express{expressGarmentCount > 1 ? ` (${expressGarmentCount} x ${fmt(expressSurcharge)})` : ""}</span>
                        <span>{fmt(expressCharge)} KD</span>
                    </div>
                )}
                {shelfCharge > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                        <span>Shelf Items</span>
                        <span>{fmt(shelfCharge)} KD</span>
                    </div>
                )}
            </div>

            {discountValue > 0 && (
                <>
                    <div className="flex justify-between pt-1">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{fmt(subtotal)} KD</span>
                    </div>
                    <div className="flex justify-between text-amber-600">
                        <span className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            Discount
                            {discountType && <span className="text-xs">({DISCOUNT_TYPE_LABELS[discountType] || discountType})</span>}
                            {discountPercentage > 0 && <span className="text-xs">{discountPercentage}%</span>}
                        </span>
                        <span>-{fmt(discountValue)} KD</span>
                    </div>
                </>
            )}

            <div className="flex justify-between font-medium">
                <span>Order Total</span>
                <span>{fmt(orderTotal)} KD</span>
            </div>

            <Separator />

            <div className="flex justify-between text-green-600">
                <span>Payments</span>
                <span>{fmt(totalPayments)} KD</span>
            </div>
            {totalRefunds > 0 && (
                <div className="flex justify-between text-red-600">
                    <span>Refunds</span>
                    <span>-{fmt(totalRefunds)} KD</span>
                </div>
            )}

            <Separator />

            <div className={`flex justify-between font-bold text-base ${remainingBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                <span>{remainingBalance <= 0 ? "Fully Paid" : "Remaining"}</span>
                <span>{fmt(Math.max(0, remainingBalance))} KD</span>
            </div>

            {/* Advance reference — shown when no payments yet */}
            {totalPayments === 0 && advance > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>Advance (minimum)</span>
                    <span>{fmt(advance)} KD</span>
                </div>
            )}
        </div>
    );
}
