import { useState, useEffect } from "react";
import { Button } from "@repo/ui/button";
import { ChipToggle } from "@repo/ui/chip-toggle";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
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
    currentApprovedBy?: string | null;
    currentApproverName?: string | null;
    currentReason?: string | null;
    orderTotal: number;
    totalPaid?: number;
    onSaved?: () => void;
}

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();

export function DiscountControls({
    orderId,
    currentDiscountType,
    currentDiscountValue = 0,
    currentDiscountPercentage = 0,
    currentReferralCode,
    orderTotal,
    totalPaid = 0,
    onSaved,
}: DiscountControlsProps) {
    const subtotal = orderTotal + currentDiscountValue;

    const [discountType, setDiscountType] = useState<string>(currentDiscountType || "flat");
    const [percentage, setPercentage] = useState<string>(currentDiscountPercentage ? String(currentDiscountPercentage) : "");
    const [kwdValue, setKwdValue] = useState<string>(currentDiscountValue ? currentDiscountValue.toFixed(3) : "");
    const [referralCode, setReferralCode] = useState<string>(currentReferralCode || "");

    const discountMutation = useUpdateDiscountMutation();

    // Sync from props when order data changes (server response)
    useEffect(() => {
        setDiscountType(currentDiscountType || "flat");
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

    // RPC rejects if new total would drop below already-paid amount.
    // Surface this client-side so the user sees the exact refund they need first.
    const prospectiveTotal = Math.max(0, subtotal - discountVal);
    const refundNeededFirst = totalPaid > prospectiveTotal ? totalPaid - prospectiveTotal : 0;
    const blocksBelowPaid = refundNeededFirst > 0.001;

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
        }, {
            onSuccess: (res) => {
                if (!res || res.status !== "error") onSaved?.();
            },
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
        }, {
            onSuccess: (res) => {
                if (!res || res.status !== "error") onSaved?.();
            },
        });
    };

    return (
        <div className="flex flex-col h-full space-y-3">
            {/* Type selector */}
            <div className="flex flex-wrap gap-2">
                {discountOptions.map((opt) => {
                    const isActive = discountType === opt.value;
                    const hasSavedDiscount = currentDiscountValue > 0;
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
                                    setPercentage("");
                                    setKwdValue("");
                                    setReferralCode("");
                                }
                            }}
                            className={`h-10 px-4 text-sm font-semibold ${isLocked ? "opacity-40 cursor-not-allowed" : ""}`}>
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
                    <div className="space-y-3 py-1 px-0.5">
                        <div className="flex gap-3">
                            {isPercentageType ? (
                                <>
                                    <div className="flex-1 space-y-1">
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Percentage (%)</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            max="100"
                                            placeholder="0"
                                            value={percentage}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v === "") { setPercentage(""); return; }
                                                const n = Number(v);
                                                if (isNaN(n)) return;
                                                setPercentage(String(Math.max(0, Math.min(100, n))));
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            className="h-12 text-lg tabular-nums"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Value (KWD)</Label>
                                        <Input value={kwdValue} readOnly className="h-12 text-lg tabular-nums bg-muted" />
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 space-y-1">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Value (KWD)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max={subtotal}
                                        placeholder="0.000"
                                        value={kwdValue}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === "") { setKwdValue(""); return; }
                                            const n = Number(v);
                                            if (isNaN(n)) return;
                                            setKwdValue(String(Math.max(0, Math.min(subtotal, n))));
                                        }}
                                        onFocus={(e) => e.target.select()}
                                        className="h-12 text-lg tabular-nums"
                                    />
                                </div>
                            )}
                        </div>

                        {discountType === "referral" && (
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Referral Code</Label>
                                <Input
                                    placeholder="Enter code"
                                    value={referralCode}
                                    onChange={(e) => setReferralCode(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    className="h-11 text-base"
                                />
                            </div>
                        )}

                        {blocksBelowPaid && (
                            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                                Discount leaves total ({fmt(prospectiveTotal)} KWD) below already-paid ({fmt(totalPaid)} KWD).
                                Refund <span className="font-bold">{fmt(refundNeededFirst)} KWD</span> first.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Action row — pinned at bottom, Apply always on the right */}
            <div className="mt-auto flex items-center gap-2 pt-1">
                {currentDiscountValue > 0 && (
                    <button
                        type="button"
                        className="text-sm text-red-500 hover:text-red-600 font-medium cursor-pointer px-2 py-1"
                        onClick={handleRemove}
                        disabled={discountMutation.isPending}
                    >
                        Remove
                    </button>
                )}
                <div className="flex-1" />
                {!isDirty && discountMutation.isPending && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                    </span>
                )}
                <Button
                    size="lg"
                    className="h-11 text-sm px-5 font-semibold"
                    onClick={handleApply}
                    disabled={!discountType || !isDirty || discountMutation.isPending || discountVal === 0 || blocksBelowPaid}
                >
                    {discountMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving...</> : "Apply"}
                </Button>
            </div>
        </div>
    );
}
