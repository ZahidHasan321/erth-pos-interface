import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

    const [discountType, setDiscountType] = useState<string>(currentDiscountType || "flat");
    const [percentage, setPercentage] = useState<string>(currentDiscountPercentage ? String(currentDiscountPercentage) : "");
    const [kwdValue, setKwdValue] = useState<string>(currentDiscountValue ? currentDiscountValue.toFixed(3) : "");
    const [referralCode, setReferralCode] = useState<string>(currentReferralCode || "");

    const discountMutation = useUpdateDiscountMutation();

    // Sync from props when order data changes
    useEffect(() => {
        setDiscountType(currentDiscountType || "flat");
        setPercentage(currentDiscountPercentage ? String(currentDiscountPercentage) : "");
        setKwdValue(currentDiscountValue ? currentDiscountValue.toFixed(3) : "");
        setReferralCode(currentReferralCode || "");
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

    const handleApply = () => {
        const discountVal = Number(kwdValue) || 0;
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
    };

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
        <div className="space-y-3">
            {/* Type selector */}
            <div className="grid grid-cols-4 gap-1.5">
                {discountOptions.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDiscountType(opt.value)}
                        className={`text-xs py-1.5 px-2 rounded-md border transition-all ${
                            discountType === opt.value
                                ? "border-primary bg-primary/10 text-primary font-semibold"
                                : "border-border bg-background hover:bg-accent/50"
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Inputs */}
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
                            />
                        </div>
                        <div className="flex-1 space-y-1">
                            <Label className="text-xs">Value (KD)</Label>
                            <Input value={kwdValue} readOnly className="bg-muted" />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 space-y-1">
                        <Label className="text-xs">Discount Value (KD)</Label>
                        <Input
                            type="number"
                            placeholder="0.000"
                            value={kwdValue}
                            onChange={(e) => setKwdValue(e.target.value)}
                            onFocus={(e) => e.target.select()}
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
                    />
                </div>
            )}

            <div className="flex gap-2">
                <Button
                    size="sm"
                    className="flex-1"
                    onClick={handleApply}
                    disabled={discountMutation.isPending || (!kwdValue && !percentage)}
                >
                    {discountMutation.isPending ? "Applying..." : "Apply Discount"}
                </Button>
                {currentDiscountValue > 0 && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRemove}
                        disabled={discountMutation.isPending}
                    >
                        Remove
                    </Button>
                )}
            </div>
        </div>
    );
}
