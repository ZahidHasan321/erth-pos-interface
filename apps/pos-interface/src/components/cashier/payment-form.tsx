import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipToggle } from "@/components/ui/chip-toggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { usePaymentMutation } from "@/hooks/useCashier";
import { PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";

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
}

export function PaymentForm({ orderId, remainingBalance, totalPaid, advance, collectGarmentIds, onCollected }: PaymentFormProps) {
    const [isRefund, setIsRefund] = useState(false);
    const paymentMutation = usePaymentMutation();

    const { data: employeesRaw } = useQuery({
        queryKey: ["employees"],
        queryFn: async () => {
            const { data, error } = await db.from("users").select("id, name");
            if (error || !Array.isArray(data)) return [];
            return data;
        },
    });
    const employees = Array.isArray(employeesRaw) ? employeesRaw : [];

    const form = useForm<PaymentFormValues>({
        resolver: zodResolver(paymentSchema) as any,
        defaultValues: {
            amount: undefined as unknown as number,
            payment_type: "knet",
            payment_ref_no: "",
            payment_note: "",
            cashier_id: "",
            refund_reason: "",
        },
    });

    const onSubmit = (values: PaymentFormValues) => {
        if (isRefund && (!values.refund_reason || values.refund_reason.trim() === "")) {
            form.setError("refund_reason", { message: "Refund reason is required" });
            return;
        }

        if (!values.payment_ref_no?.trim()) {
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
            },
            {
                onSuccess: (response) => {
                    if (response.status === "success") {
                        form.reset();
                        setIsRefund(false);
                        if (garmentIds && onCollected) onCollected();
                    }
                },
            }
        );
    };

    const fillRemaining = () => {
        if (remainingBalance > 0) {
            form.setValue("amount", Number(remainingBalance.toFixed(3)));
        }
    };

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2.5">
            {/* Payment / Refund Tabs */}
            <div className="relative flex rounded-xl bg-muted/80 p-1 shadow-inner border border-border/50">
                {/* Sliding indicator */}
                <div
                    className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ease-in-out ${isRefund ? "translate-x-[calc(100%+4px)] bg-red-100 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-red-200" : "translate-x-0 bg-background shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-border/50"}`}
                    style={{ left: 4 }}
                />
                <button type="button"
                    onClick={() => setIsRefund(false)}
                    className={`relative z-10 flex-1 text-sm font-semibold py-2 rounded-lg cursor-pointer transition-colors duration-300 ${!isRefund ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    Payment
                </button>
                <button type="button"
                    onClick={() => setIsRefund(true)}
                    className={`relative z-10 flex-1 text-sm font-semibold py-2 rounded-lg cursor-pointer transition-colors duration-300 ${isRefund ? "text-red-700" : "text-muted-foreground hover:text-foreground"}`}>
                    Refund
                </button>
            </div>

            {/* Amount */}
            <div className="space-y-1">
                <Label className="text-xs">Amount (KWD)</Label>
                <div className="flex gap-2">
                    <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        {...form.register("amount")}
                        placeholder="Enter amount"
                        className="flex-1 border-2 border-border"
                    />
                    {!isRefund && totalPaid === 0 && advance != null && advance > 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={() => form.setValue("amount", Number(advance.toFixed(3)))}>
                            Advance ({advance.toFixed(3)})
                        </Button>
                    )}
                    {!isRefund && remainingBalance > 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={fillRemaining}>
                            Pay Full ({remainingBalance.toFixed(3)})
                        </Button>
                    )}
                </div>
                {form.formState.errors.amount && (
                    <p className="text-xs text-red-500">{form.formState.errors.amount.message}</p>
                )}
            </div>

            {/* Payment Type */}
            <div className="space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(PAYMENT_TYPE_LABELS).map(([key, label]) => (
                        <ChipToggle
                            key={key}
                            active={form.watch("payment_type") === key}
                            onClick={() => form.setValue("payment_type", key as any)}
                            className="py-2">
                            {label}
                        </ChipToggle>
                    ))}
                </div>
            </div>

            {/* Ref + Cashier — same row */}
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <Label className="text-xs">Reference No.</Label>
                    <Input {...form.register("payment_ref_no")} placeholder="Transaction ref" className="border-2 border-border" />
                    {form.formState.errors.payment_ref_no && (
                        <p className="text-xs text-red-500">{form.formState.errors.payment_ref_no.message}</p>
                    )}
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Cashier</Label>
                    <Select
                        value={form.watch("cashier_id") || ""}
                        onValueChange={(val) => form.setValue("cashier_id", val)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select cashier" />
                        </SelectTrigger>
                        <SelectContent>
                            {employees?.map((emp: any) => (
                                <SelectItem key={emp.id} value={emp.id}>
                                    {emp.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Note (hidden during refund — refund reason covers it) */}
            {!isRefund && (
                <div className="space-y-1">
                    <Label className="text-xs">Note</Label>
                    <Textarea {...form.register("payment_note")} placeholder="Optional note" rows={2} className="border-2 border-border" />
                </div>
            )}

            {/* Refund Reason */}
            {isRefund && (
                <div className="space-y-1">
                    <Label className="text-xs text-red-600">Refund Reason *</Label>
                    <Textarea
                        {...form.register("refund_reason")}
                        placeholder="Reason for refund (required)"
                        rows={2}
                        className="border-2 border-border"
                    />
                    {form.formState.errors.refund_reason && (
                        <p className="text-xs text-red-500">{form.formState.errors.refund_reason.message}</p>
                    )}
                </div>
            )}

            {/* Collection indicator */}
            {!isRefund && collectGarmentIds && collectGarmentIds.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                    <Package className="h-3.5 w-3.5" />
                    {collectGarmentIds.size} garment{collectGarmentIds.size !== 1 ? "s" : ""} will be collected with this payment
                </div>
            )}

            <Button
                type="submit"
                className={`w-full ${isRefund ? "bg-red-600 hover:bg-red-700" : ""}`}
                disabled={paymentMutation.isPending}
            >
                {paymentMutation.isPending
                    ? "Processing..."
                    : isRefund
                      ? "Record Refund"
                      : collectGarmentIds && collectGarmentIds.size > 0
                        ? `Record Payment & Collect ${collectGarmentIds.size}`
                        : "Record Payment"}
            </Button>
        </form>
    );
}
