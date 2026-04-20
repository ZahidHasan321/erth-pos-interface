import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { Package, Loader2 } from "lucide-react";
import { Button } from "@repo/ui/button";
import { ChipToggle } from "@repo/ui/chip-toggle";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@repo/ui/select";
import { usePaymentMutation } from "@/hooks/useCashier";
import { PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useAuth } from "@/context/auth";
import type { RefundItem } from "@/api/cashier";

const paymentSchema = z.object({
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    payment_type: z.enum(["knet", "cash", "link_payment", "installments", "others"]),
    payment_ref_no: z.string().optional(),
    payment_note: z.string().optional(),
    cashier_id: z.string().optional(),
    refund_reason: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

interface PaymentFormProps {
    orderId: number;
    remainingBalance: number;
    orderTotal: number;
    totalPaid: number;
    advance?: number;
    collectGarmentIds?: Set<string>;
    onCollected?: () => void;
    refundOnly?: boolean;
    isRefund?: boolean;
    onRefundModeChange?: (isRefund: boolean) => void;
    refundItems?: RefundItem[];
    refundTotal?: number;
}

export function PaymentForm({ orderId, remainingBalance, orderTotal, totalPaid, advance, collectGarmentIds, onCollected, refundOnly, isRefund: controlledRefund, onRefundModeChange, refundItems, refundTotal }: PaymentFormProps) {
    const [internalRefund, setInternalRefund] = useState(refundOnly ?? false);
    const isRefund = controlledRefund ?? internalRefund;
    const paymentMutation = usePaymentMutation();
    const { user: currentUser } = useAuth();

    const { data: employeesRaw } = useQuery({
        queryKey: ["employees"],
        queryFn: async () => {
            const { data, error } = await db.from("users").select("id, name");
            if (error || !Array.isArray(data)) return [];
            return data;
        },
        staleTime: Infinity,
        gcTime: Infinity,
    });
    const employees = Array.isArray(employeesRaw) ? employeesRaw : [];

    const form = useForm<PaymentFormValues>({
        resolver: zodResolver(paymentSchema) as any,
        defaultValues: {
            amount: undefined as unknown as number,
            payment_type: "knet",
            payment_ref_no: "",
            payment_note: "",
            cashier_id: currentUser?.id ?? "",
            refund_reason: "",
        },
    });

    // Auto-set cashier to current user once auth loads
    useEffect(() => {
        if (currentUser?.id && !form.getValues("cashier_id")) {
            form.setValue("cashier_id", currentUser.id);
        }
    }, [currentUser?.id]);

    // Auto-fill refund amount when refund items change
    useEffect(() => {
        if (isRefund && refundTotal && refundTotal > 0) {
            form.setValue("amount", Number(refundTotal.toFixed(3)));
        }
    }, [isRefund, refundTotal, form]);

    const setRefundMode = (val: boolean) => {
        if (onRefundModeChange) onRefundModeChange(val);
        else setInternalRefund(val);
    };

    const overpayment = Math.max(0, totalPaid - orderTotal);

    const onSubmit = (values: PaymentFormValues) => {
        if (isRefund) {
            if (!values.refund_reason || values.refund_reason.trim() === "") {
                form.setError("refund_reason", { message: "Refund reason is required" });
                return;
            }
            const hasItems = !!refundItems && refundItems.length > 0;
            // Overpayment refund path: allow item-less refund capped at the overage.
            // Picking items would wrongly flag them as refunded when the real refund is the excess cash.
            if (!hasItems) {
                if (overpayment <= 0.001) {
                    form.setError("amount", { message: "Select items to refund" });
                    return;
                }
                if (values.amount > overpayment + 0.001) {
                    form.setError("amount", { message: `Without items, refund capped at overpayment (${overpayment.toFixed(3)} KWD)` });
                    return;
                }
            }
            if (values.amount > totalPaid) {
                form.setError("amount", { message: `Cannot refund more than paid (${totalPaid.toFixed(3)})` });
                return;
            }
        }

        if (!isRefund && values.payment_type !== "cash" && !values.payment_ref_no?.trim()) {
            form.setError("payment_ref_no", { message: "Reference number is required" });
            return;
        }

        const garmentIds = !isRefund && collectGarmentIds && collectGarmentIds.size > 0
            ? Array.from(collectGarmentIds)
            : undefined;

        paymentMutation.mutate(
            {
                orderId,
                amount: values.amount,
                paymentType: values.payment_type,
                paymentRefNo: values.payment_ref_no || undefined,
                paymentNote: values.payment_note || undefined,
                cashierId: values.cashier_id || undefined,
                transactionType: isRefund ? "refund" : "payment",
                refundReason: isRefund ? values.refund_reason : undefined,
                collectGarmentIds: garmentIds,
                refundItems: isRefund && refundItems && refundItems.length > 0 ? refundItems : undefined,
            },
            {
                onSuccess: (response) => {
                    if (response.status === "success") {
                        form.reset();
                        setRefundMode(refundOnly ?? false);
                        if (garmentIds && onCollected) onCollected();
                    }
                },
            }
        );
    };

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
            {/* Payment / Refund Toggle */}
            {!refundOnly && (
                <div className="relative flex rounded-lg bg-muted/80 p-0.5 border border-border/50">
                    <div
                        className={`absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-md transition-all duration-300 ease-in-out ${isRefund ? "translate-x-[calc(100%+2px)] bg-red-100 ring-1 ring-red-200" : "translate-x-0 bg-background shadow-sm ring-1 ring-border/50"}`}
                        style={{ left: 2 }}
                    />
                    <button type="button" onClick={() => setRefundMode(false)}
                        className={`relative z-10 flex-1 text-xs font-semibold py-1.5 rounded-md cursor-pointer transition-colors duration-300 ${!isRefund ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        Payment
                    </button>
                    <button type="button" onClick={() => setRefundMode(true)}
                        className={`relative z-10 flex-1 text-xs font-semibold py-1.5 rounded-md cursor-pointer transition-colors duration-300 ${isRefund ? "text-red-700" : "text-muted-foreground hover:text-foreground"}`}>
                        Refund
                    </button>
                </div>
            )}

            {/* Refund items summary */}
            {isRefund && refundItems && refundItems.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium">
                    <Package className="h-3 w-3" />
                    {refundItems.length} item{refundItems.length !== 1 ? "s" : ""} selected — {Number((refundTotal || 0).toFixed(3))} KWD
                </div>
            )}

            {/* Amount + Quick fills */}
            <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Amount (KWD)</Label>
                <div className="flex items-center gap-1.5">
                    <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        {...form.register("amount")}
                        placeholder="0.000"
                        className="w-28 text-right font-bold tabular-nums border-2 border-border"
                        readOnly={isRefund && !!refundItems && refundItems.length > 0}
                    />
                    {(() => {
                        // Cap advance at remaining balance — discount/near-paid orders shouldn't suggest paying more than what's owed
                        const cappedAdvance = Math.min(advance ?? 0, Math.max(0, remainingBalance));
                        return !isRefund && totalPaid === 0 && cappedAdvance > 0 && (
                            <button type="button" onClick={() => form.setValue("amount", Number(cappedAdvance.toFixed(3)))}
                                className="text-[10px] font-medium text-primary hover:text-primary/80 px-1.5 py-1 rounded border border-primary/20 bg-primary/5 cursor-pointer whitespace-nowrap">
                                Advance {cappedAdvance.toFixed(3)}
                            </button>
                        );
                    })()}
                    {!isRefund && remainingBalance > 0 && (
                        <button type="button" onClick={() => form.setValue("amount", Number(remainingBalance.toFixed(3)))}
                            className="text-[10px] font-medium text-primary hover:text-primary/80 px-1.5 py-1 rounded border border-primary/20 bg-primary/5 cursor-pointer whitespace-nowrap">
                            Full {remainingBalance.toFixed(3)}
                        </button>
                    )}
                    {isRefund && (!refundItems || refundItems.length === 0) && overpayment > 0.001 && (
                        <button type="button" onClick={() => form.setValue("amount", Number(overpayment.toFixed(3)))}
                            className="text-[10px] font-medium text-red-600 hover:text-red-700 px-1.5 py-1 rounded border border-red-200 bg-red-50 cursor-pointer whitespace-nowrap">
                            Overpaid {overpayment.toFixed(3)}
                        </button>
                    )}
                </div>
                {isRefund && (!refundItems || refundItems.length === 0) && overpayment > 0.001 && (
                    <p className="text-[10px] text-muted-foreground">No items selected — refunding overpayment only. No garment will be flagged as refunded.</p>
                )}
                {form.formState.errors.amount && (
                    <p className="text-[10px] text-red-500">{form.formState.errors.amount.message}</p>
                )}
            </div>

            {/* Payment Method */}
            <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Method</Label>
                <div className="flex flex-wrap gap-1">
                    {Object.entries(PAYMENT_TYPE_LABELS).map(([key, label]) => (
                        <ChipToggle
                            key={key}
                            active={form.watch("payment_type") === key}
                            onClick={() => form.setValue("payment_type", key as any)}
                            className="py-1 px-2.5 text-[11px]">
                            {label}
                        </ChipToggle>
                    ))}
                </div>
            </div>

            {/* Ref + Cashier */}
            <div className="grid grid-cols-2 gap-1.5">
                <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Ref No.</Label>
                    <Input {...form.register("payment_ref_no")} placeholder="Ref" className="h-8 text-sm" />
                    {form.formState.errors.payment_ref_no && (
                        <p className="text-[10px] text-red-500">{form.formState.errors.payment_ref_no.message}</p>
                    )}
                </div>
                <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Cashier</Label>
                    <Select
                        value={form.watch("cashier_id") || ""}
                        onValueChange={(val) => form.setValue("cashier_id", val)}
                    >
                        <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                            {employees.length > 0
                                ? employees.map((emp: any) => (
                                    <SelectItem key={emp.id} value={emp.id}>
                                        {emp.name}
                                    </SelectItem>
                                ))
                                : currentUser && (
                                    <SelectItem value={currentUser.id}>
                                        {currentUser.name}
                                    </SelectItem>
                                )
                            }
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Note / Refund Reason */}
            {isRefund ? (
                <div className="space-y-0.5">
                    <Label className="text-[10px] text-red-600 uppercase tracking-wide">Refund Reason *</Label>
                    <Input {...form.register("refund_reason")} placeholder="Reason for refund (required)" className="h-8 text-sm" />
                    {form.formState.errors.refund_reason && (
                        <p className="text-[10px] text-red-500">{form.formState.errors.refund_reason.message}</p>
                    )}
                </div>
            ) : (
                <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Note</Label>
                    <Input {...form.register("payment_note")} placeholder="Optional note" className="h-8 text-sm" />
                </div>
            )}

            {/* Collection indicator */}
            {!isRefund && collectGarmentIds && collectGarmentIds.size > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
                    <Package className="h-3 w-3" />
                    {collectGarmentIds.size} garment{collectGarmentIds.size !== 1 ? "s" : ""} collected with payment
                </div>
            )}

            {/* Submit */}
            <Button
                type="submit"
                size="sm"
                className={`w-full h-9 text-sm font-semibold ${isRefund ? "bg-red-600 hover:bg-red-700" : ""}`}
                disabled={paymentMutation.isPending}
            >
                {paymentMutation.isPending
                    ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Processing...</>
                    : isRefund
                      ? "Record Refund"
                      : collectGarmentIds && collectGarmentIds.size > 0
                        ? `Pay & Collect ${collectGarmentIds.size}`
                        : "Record Payment"}
            </Button>
        </form>
    );
}
