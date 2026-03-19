import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useUpdateDiscountMutation } from "@/hooks/useCashier";

const discountOptions = [
    { value: "flat", label: "Flat %" },
    { value: "referral", label: "Referral" },
    { value: "loyalty", label: "Loyalty" },
    { value: "by_value", label: "By Value" },
] as const;

interface DiscountControlsProps {
    orderId: number;
    currentDiscountType?: string | null;
    currentDiscountValue?: number;
    currentDiscountPercentage?: number;
    currentReferralCode?: string | null;
    orderTotal: number;
}

export function DiscountControls({
    orderId,
    currentDiscountType,
    currentDiscountValue = 0,
    currentDiscountPercentage = 0,
    currentReferralCode,
    orderTotal,
}: DiscountControlsProps) {
    const subtotal = orderTotal + currentDiscountValue;

    const [discountType, setDiscountType] = useState<string>(currentDiscountType || "");
    const [percentage, setPercentage] = useState<string>(currentDiscountPercentage ? String(currentDiscountPercentage) : "");
    const [kwdValue, setKwdValue] = useState<string>(currentDiscountValue ? currentDiscountValue.toFixed(3) : "");
    const [referralCode, setReferralCode] = useState<string>(currentReferralCode || "");

    const discountMutation = useUpdateDiscountMutation();
    // Track whether changes are from user input vs prop sync
    const isSyncingFromProps = useRef(false);

    // Sync from props when order data changes
    useEffect(() => {
        isSyncingFromProps.current = true;
        setDiscountType(currentDiscountType || "");
        setPercentage(currentDiscountPercentage ? String(currentDiscountPercentage) : "");
        setKwdValue(currentDiscountValue ? currentDiscountValue.toFixed(3) : "");
        setReferralCode(currentReferralCode || "");
        // Reset flag after state updates flush
        setTimeout(() => { isSyncingFromProps.current = false; }, 0);
    }, [currentDiscountType, currentDiscountValue, currentDiscountPercentage, currentReferralCode]);

    // Auto-compute KWD from percentage for flat/referral/loyalty
    useEffect(() => {
        if ((discountType === "flat" || discountType === "referral" || discountType === "loyalty") && percentage) {
            const pct = Number(percentage);
            if (!isNaN(pct) && pct >= 0 && subtotal > 0) {
                setKwdValue((subtotal * (pct / 100)).toFixed(3));
            }
        }
    }, [percentage, discountType, subtotal]);

    // Debounced auto-apply when values change
    useEffect(() => {
        if (isSyncingFromProps.current) return;
        if (!discountType) return;

        const discountVal = Number(kwdValue) || 0;
        if (discountVal === 0 && !percentage) return;

        const timer = setTimeout(() => {
            const pct = Number(percentage) || undefined;
            const newTotal = subtotal - discountVal;

            discountMutation.mutate({
                orderId,
                discountType,
                discountValue: discountVal,
                discountPercentage: discountType === "by_value" ? undefined : pct,
                referralCode: discountType === "referral" ? referralCode : undefined,
                newOrderTotal: Math.max(0, newTotal),
            });
        }, 800);

        return () => clearTimeout(timer);
    }, [discountType, kwdValue, percentage, referralCode]);

    const handleRemove = () => {
        discountMutation.mutate({
            orderId,
            discountType: "flat",
            discountValue: 0,
            discountPercentage: undefined,
            referralCode: undefined,
            newOrderTotal: subtotal,
        });
    };

    const isPercentageType = discountType === "flat" || discountType === "referral" || discountType === "loyalty";

    return (
        <div className="space-y-2">
            {/* Type selector */}
            <div className="grid grid-cols-4 gap-1.5">
                {discountOptions.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDiscountType(discountType === opt.value ? "" : opt.value)}
                        className={`text-xs py-1.5 px-2 rounded-md border transition-all cursor-pointer ${discountType === opt.value
                                ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
                                : "border-border bg-background hover:bg-accent/50 hover:border-primary/40"
                            }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Inputs — animate open/close */}
            <div className={`grid transition-all duration-300 ease-in-out ${discountType ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                    <div className="space-y-2 pt-0.5">
                    <div className="flex gap-2">
                        {isPercentageType ? (
                            <>
                                <div className="flex-1 space-y-1">
                                    <Label className="text-xs">Percentage (%)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0"
                                        value={percentage}
                                        onChange={(e) => setPercentage(e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                        className="border-2 border-border"
                                    />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <Label className="text-xs">Value (KWD)</Label>
                                    <Input value={kwdValue} readOnly className="bg-muted border-2 border-border" />
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs">Discount Value (KWD)</Label>
                                <Input
                                    type="number"
                                    placeholder="0.000"
                                    value={kwdValue}
                                    onChange={(e) => setKwdValue(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    className="border-2 border-border"
                                />
                            </div>
                        )}
                    </div>

                    {discountType === "referral" && (
                        <div className="space-y-1">
                            <Label className="text-xs">Referral Code</Label>
                            <Input
                                placeholder="Enter referral code"
                                value={referralCode}
                                onChange={(e) => setReferralCode(e.target.value)}
                                className="border-2 border-border"
                            />
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        {discountMutation.isPending && (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                            </span>
                        )}
                        <div className="flex-1" />
                        {currentDiscountValue > 0 && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                                onClick={handleRemove}
                                disabled={discountMutation.isPending}
                            >
                                Remove Discount
                            </Button>
                        )}
                    </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
