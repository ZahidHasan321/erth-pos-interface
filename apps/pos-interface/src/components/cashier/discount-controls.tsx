import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChipToggle } from "@/components/ui/chip-toggle";
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

    // Sync from props when order data changes (server response)
    useEffect(() => {
        setDiscountType(currentDiscountType || "");
        setPercentage(currentDiscountPercentage ? String(currentDiscountPercentage) : "");
        setKwdValue(currentDiscountValue ? currentDiscountValue.toFixed(3) : "");
        setReferralCode(currentReferralCode || "");
    }, [currentDiscountType, currentDiscountValue, currentDiscountPercentage, currentReferralCode]);

    // Auto-compute KWD from percentage for flat/referral/loyalty
    const isPercentageType = discountType === "flat" || discountType === "referral" || discountType === "loyalty";
    useEffect(() => {
        if (isPercentageType && percentage) {
            const pct = Number(percentage);
            if (!isNaN(pct) && pct >= 0 && subtotal > 0) {
                setKwdValue((subtotal * (pct / 100)).toFixed(3));
            }
        }
    }, [percentage, isPercentageType, subtotal]);

    // Check if user has unsaved changes
    const discountVal = Number(kwdValue) || 0;
    const pctVal = Number(percentage) || 0;
    const isDirty = discountType !== (currentDiscountType || "") ||
        discountVal !== (currentDiscountValue || 0) ||
        pctVal !== (currentDiscountPercentage || 0) ||
        referralCode !== (currentReferralCode || "");

    const handleApply = () => {
        if (!discountType) return;
        const newTotal = subtotal - discountVal;
        discountMutation.mutate({
            orderId,
            discountType,
            discountValue: discountVal,
            discountPercentage: discountType === "by_value" ? undefined : (pctVal || undefined),
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

    return (
        <div className="space-y-1.5">
            {/* Type selector */}
            <div className="flex flex-wrap gap-1">
                {discountOptions.map((opt) => {
                    const isActive = discountType === opt.value;
                    const hasSavedDiscount = currentDiscountValue > 0;
                    // If a discount is already saved, disable other types — must remove first
                    const isLocked = hasSavedDiscount && !isActive && !!currentDiscountType;
                    return (
                        <ChipToggle
                            key={opt.value}
                            active={isActive}
                            disabled={isLocked}
                            onClick={() => {
                                if (isLocked) return;
                                setDiscountType(isActive ? "" : opt.value);
                                if (!isActive) {
                                    // Switching to a new type — reset values
                                    setPercentage("");
                                    setKwdValue("");
                                    setReferralCode("");
                                }
                            }}
                            className={`py-1 px-2.5 text-[11px] ${isLocked ? "opacity-40 cursor-not-allowed" : ""}`}>
                            {opt.label}
                        </ChipToggle>
                    );
                })}
            </div>

            {/* Inputs — grid-rows animation with padding for focus rings */}
            <div
                className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
                style={{
                    gridTemplateRows: discountType ? "1fr" : "0fr",
                    opacity: discountType ? 1 : 0,
                }}
            >
                <div className="overflow-hidden">
                    <div className="space-y-1.5 py-0.5 px-0.5">
                        <div className="flex gap-1.5">
                            {isPercentageType ? (
                                <>
                                    <div className="flex-1 space-y-0.5">
                                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">%</Label>
                                        <Input
                                            type="number"
                                            placeholder="0"
                                            value={percentage}
                                            onChange={(e) => setPercentage(e.target.value)}
                                            onFocus={(e) => e.target.select()}
                                            className="h-8 text-sm"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-0.5">
                                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">KWD</Label>
                                        <Input value={kwdValue} readOnly className="h-8 text-sm bg-muted" />
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 space-y-0.5">
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Value (KWD)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.000"
                                        value={kwdValue}
                                        onChange={(e) => setKwdValue(e.target.value)}
                                        onFocus={(e) => e.target.select()}
                                        className="h-8 text-sm"
                                    />
                                </div>
                            )}
                        </div>

                        {discountType === "referral" && (
                            <div className="space-y-0.5">
                                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Referral Code</Label>
                                <Input
                                    placeholder="Enter code"
                                    value={referralCode}
                                    onChange={(e) => setReferralCode(e.target.value)}
                                    className="h-8 text-sm"
                                />
                            </div>
                        )}

                        <div className="flex items-center gap-1.5">
                            {isDirty && (
                                <Button
                                    size="sm"
                                    className="h-7 text-xs px-3"
                                    onClick={handleApply}
                                    disabled={discountMutation.isPending || discountVal === 0}
                                >
                                    {discountMutation.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving...</> : "Apply"}
                                </Button>
                            )}
                            {!isDirty && discountMutation.isPending && (
                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Saving...
                                </span>
                            )}
                            <div className="flex-1" />
                            {currentDiscountValue > 0 && (
                                <button
                                    type="button"
                                    className="text-[10px] text-red-500 hover:text-red-600 font-medium cursor-pointer"
                                    onClick={handleRemove}
                                    disabled={discountMutation.isPending}
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
