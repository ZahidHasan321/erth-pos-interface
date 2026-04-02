import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { ChipToggle } from "@repo/ui/chip-toggle";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@repo/ui/dialog";
import { useAddCashMovementMutation } from "@/hooks/useCashier";
import { useAuth } from "@/context/auth";

const schema = z.object({
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    reason: z.string().min(1, "Reason is required"),
});

type FormValues = z.infer<typeof schema>;

interface CashMovementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sessionId: number;
}

export function CashMovementDialog({ open, onOpenChange, sessionId }: CashMovementDialogProps) {
    const [type, setType] = useState<"cash_in" | "cash_out">("cash_in");
    const { user } = useAuth();
    const mutation = useAddCashMovementMutation();

    const form = useForm<FormValues>({
        resolver: zodResolver(schema) as any,
        defaultValues: { amount: undefined as unknown as number, reason: "" },
    });

    const onSubmit = (values: FormValues) => {
        if (!user) return;
        mutation.mutate(
            { sessionId, type, amount: values.amount, reason: values.reason, userId: user.id },
            {
                onSuccess: (res) => {
                    if (res.status === "success") {
                        form.reset();
                        setType("cash_in");
                        onOpenChange(false);
                    }
                },
            }
        );
    };

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

                    {/* Reason */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Reason</Label>
                        <Input
                            {...form.register("reason")}
                            placeholder={type === "cash_in" ? "e.g. Change refill" : "e.g. Bank deposit"}
                        />
                        {form.formState.errors.reason && (
                            <p className="text-xs text-red-500">{form.formState.errors.reason.message}</p>
                        )}
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
