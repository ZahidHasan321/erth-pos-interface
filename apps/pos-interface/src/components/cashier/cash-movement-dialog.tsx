import { useState, useEffect, useRef } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { ChipToggle } from "@repo/ui/chip-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@repo/ui/dialog";
import { useAddCashMovementMutation } from "@/hooks/useCashier";
import { useAuth } from "@/context/auth";
import type { CashMovementReasonCategory } from "@/api/cashier";

const schema = z.object({
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    reason: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Categories available per movement type. Mirrors the cash_movement_reason_category
// enum in the DB but split so the dropdown only shows valid combinations.
const CATEGORIES_BY_TYPE: Record<"cash_in" | "cash_out", { value: CashMovementReasonCategory; label: string }[]> = {
    cash_in: [
        { value: "pickup", label: "Pickup from safe" },
        { value: "change_refill", label: "Change refill" },
        { value: "other", label: "Other" },
    ],
    cash_out: [
        { value: "drop", label: "Drop to safe" },
        { value: "bank_deposit", label: "Bank deposit" },
        { value: "petty_cash", label: "Petty cash / expense" },
        { value: "tip_out", label: "Tip out" },
        { value: "other", label: "Other" },
    ],
};

interface CashMovementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sessionId: number;
}

export function CashMovementDialog({ open, onOpenChange, sessionId }: CashMovementDialogProps) {
    const [type, setType] = useState<"cash_in" | "cash_out">("cash_in");
    const [category, setCategory] = useState<CashMovementReasonCategory>("pickup");
    const { user } = useAuth();
    const mutation = useAddCashMovementMutation();

    // See close-register-dialog: stable per-submit key for dedupe across retries.
    const idemKeyRef = useRef<string | null>(null);
    useEffect(() => {
        if (!open) idemKeyRef.current = null;
    }, [open]);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema) as Resolver<FormValues>,
        defaultValues: { amount: undefined as unknown as number, reason: "" },
    });

    // Reset the selected category when switching cash_in ↔ cash_out so the
    // dropdown never shows a stale value that doesn't exist in the new list.
    useEffect(() => {
        const first = CATEGORIES_BY_TYPE[type][0];
        if (first) setCategory(first.value);
    }, [type]);

    const onSubmit = (values: FormValues) => {
        if (!user) return;
        if (!idemKeyRef.current) idemKeyRef.current = crypto.randomUUID();
        mutation.mutate(
            {
                sessionId,
                type,
                reasonCategory: category,
                amount: values.amount,
                reason: values.reason || "",
                userId: user.id,
                idempotencyKey: idemKeyRef.current,
            },
            {
                onSuccess: (res) => {
                    if (res.status === "success") {
                        idemKeyRef.current = null;
                        form.reset();
                        setType("cash_in");
                        onOpenChange(false);
                    }
                },
            }
        );
    };

    const categories = CATEGORIES_BY_TYPE[type];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Cash Movement</DialogTitle>
                </DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {/* Type toggle */}
                    <div className="flex gap-2">
                        <ChipToggle active={type === "cash_in"} onClick={() => setType("cash_in")} className="flex-1 justify-center">
                            Cash In
                        </ChipToggle>
                        <ChipToggle active={type === "cash_out"} onClick={() => setType("cash_out")} className="flex-1 justify-center">
                            Cash Out
                        </ChipToggle>
                    </div>

                    {/* Category */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Category</Label>
                        <Select value={category} onValueChange={(v) => setCategory(v as CashMovementReasonCategory)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {categories.map((c) => (
                                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Amount */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Amount (KWD)</Label>
                        <Input
                            type="number"
                            step="0.001"
                            min="0.001"
                            {...form.register("amount")}
                            placeholder="0.000"
                            className="text-right font-bold tabular-nums"
                        />
                        {form.formState.errors.amount && (
                            <p className="text-xs text-red-500">{form.formState.errors.amount.message}</p>
                        )}
                    </div>

                    {/* Optional note */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Note (optional)</Label>
                        <Input
                            {...form.register("reason")}
                            placeholder="e.g. envelope #3, supplier invoice 412"
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={mutation.isPending}>
                        {mutation.isPending
                            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Recording...</>
                            : type === "cash_in" ? "Record Cash In" : "Record Cash Out"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
