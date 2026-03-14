import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
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
import { supabase } from "@/lib/supabase";

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
}

export function PaymentForm({ orderId, remainingBalance }: PaymentFormProps) {
    const [isRefund, setIsRefund] = useState(false);
    const paymentMutation = usePaymentMutation();

    const { data: employees = [] } = useQuery({
        queryKey: ["employees"],
        queryFn: async () => {
            const { data, error } = await supabase.from("users").select("id, name");
            if (error || !Array.isArray(data)) return [];
            return data;
        },
    });

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

        if (!isRefund && values.payment_type !== "cash" && !values.payment_ref_no?.trim()) {
            form.setError("payment_ref_no", { message: "Reference number is required for non-cash payments" });
            return;
        }

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
            },
            {
                onSuccess: (response) => {
                    if (response.status === "success") {
                        form.reset();
                        setIsRefund(false);
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Refund Toggle */}
            <div className="flex items-center gap-3 pb-3 border-b">
                <Switch checked={isRefund} onCheckedChange={setIsRefund} id="refund-toggle" />
                <Label htmlFor="refund-toggle" className={isRefund ? "text-red-600 font-semibold" : ""}>
                    {isRefund ? "Refund Mode" : "Payment Mode"}
                </Label>
            </div>

            {/* Amount */}
            <div className="space-y-2">
                <Label>Amount (KD)</Label>
                <div className="flex gap-2">
                    <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        {...form.register("amount")}
                        placeholder="Enter amount"
                        className="flex-1"
                    />
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
            <div className="space-y-2">
                <Label>Payment Method</Label>
                <RadioGroup
                    value={form.watch("payment_type")}
                    onValueChange={(val) => form.setValue("payment_type", val as any)}
                    className="flex flex-wrap gap-3"
                >
                    {Object.entries(PAYMENT_TYPE_LABELS).map(([key, label]) => (
                        <div key={key} className="flex items-center gap-1.5">
                            <RadioGroupItem value={key} id={`pt-${key}`} />
                            <Label htmlFor={`pt-${key}`} className="text-sm cursor-pointer">
                                {label}
                            </Label>
                        </div>
                    ))}
                </RadioGroup>
            </div>

            {/* Payment Ref */}
            <div className="space-y-2">
                <Label>Reference Number</Label>
                <Input {...form.register("payment_ref_no")} placeholder="Transaction reference" />
                {form.formState.errors.payment_ref_no && (
                    <p className="text-xs text-red-500">{form.formState.errors.payment_ref_no.message}</p>
                )}
            </div>

            {/* Cashier */}
            <div className="space-y-2">
                <Label>Cashier</Label>
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

            {/* Note */}
            <div className="space-y-2">
                <Label>Note</Label>
                <Textarea {...form.register("payment_note")} placeholder="Optional note" rows={2} />
            </div>

            {/* Refund Reason */}
            {isRefund && (
                <div className="space-y-2">
                    <Label className="text-red-600">Refund Reason *</Label>
                    <Textarea
                        {...form.register("refund_reason")}
                        placeholder="Reason for refund (required)"
                        rows={2}
                    />
                    {form.formState.errors.refund_reason && (
                        <p className="text-xs text-red-500">{form.formState.errors.refund_reason.message}</p>
                    )}
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
                      : "Record Payment"}
            </Button>
        </form>
    );
}
