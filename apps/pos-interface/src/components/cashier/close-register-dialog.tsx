import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Textarea } from "@repo/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@repo/ui/dialog";
import { useCloseRegisterMutation } from "@/hooks/useCashier";
import { useAuth } from "@/context/auth";
import type { RegisterSessionData } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;

const schema = z.object({
    counted_cash: z.coerce.number().min(0, "Cannot be negative"),
    notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface CloseRegisterDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    session: RegisterSessionData;
}

export function CloseRegisterDialog({ open, onOpenChange, session }: CloseRegisterDialogProps) {
    const { user } = useAuth();
    const mutation = useCloseRegisterMutation();

    const form = useForm<FormValues>({
        resolver: zodResolver(schema) as any,
        defaultValues: { counted_cash: undefined as unknown as number, notes: "" },
    });

    const countedCash = form.watch("counted_cash");
    const hasCount = countedCash != null && !isNaN(countedCash);

    // Calculate totals from cash movements
    const cashIn = session.cash_movements
        .filter(m => m.type === "cash_in")
        .reduce((sum, m) => sum + Number(m.amount), 0);
    const cashOut = session.cash_movements
        .filter(m => m.type === "cash_out")
        .reduce((sum, m) => sum + Number(m.amount), 0);

    // Note: actual expected is computed server-side including cash payments/refunds.
    // This is just a preview based on what we know client-side (float + movements).
    // The server will compute the real expected cash including transaction data.

    const onSubmit = (values: FormValues) => {
        if (!user) return;
        mutation.mutate(
            {
                sessionId: session.id,
                userId: user.id,
                countedCash: values.counted_cash,
                notes: values.notes || undefined,
            },
            {
                onSuccess: (res) => {
                    if (res.status === "success") {
                        form.reset();
                        onOpenChange(false);
                    }
                },
            }
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Close Register</DialogTitle>
                </DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    {/* Cash drawer info */}
                    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Opening Float</span>
                            <span className="font-semibold tabular-nums">{fmtK(session.opening_float)}</span>
                        </div>
                        {cashIn > 0 && (
                            <div className="flex justify-between text-emerald-600">
                                <span>Cash In</span>
                                <span className="font-semibold tabular-nums">+{fmtK(cashIn)}</span>
                            </div>
                        )}
                        {cashOut > 0 && (
                            <div className="flex justify-between text-red-600">
                                <span>Cash Out</span>
                                <span className="font-semibold tabular-nums">-{fmtK(cashOut)}</span>
                            </div>
                        )}
                        <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                            Cash payments & refunds are calculated server-side when you close.
                        </p>
                    </div>

                    {/* Counted Cash */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Counted Cash in Drawer (KWD)</Label>
                        <Input
                            type="number"
                            step="0.001"
                            min="0"
                            {...form.register("counted_cash")}
                            placeholder="Count the physical cash"
                            className="text-right font-bold tabular-nums text-lg h-12"
                            autoFocus
                        />
                        {form.formState.errors.counted_cash && (
                            <p className="text-xs text-red-500">{form.formState.errors.counted_cash.message}</p>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Notes (optional)</Label>
                        <Textarea
                            {...form.register("notes")}
                            placeholder="Any notes about the register close..."
                            className="resize-none h-16"
                        />
                    </div>

                    {/* Variance preview hint */}
                    {hasCount && (
                        <div className="text-xs text-muted-foreground text-center">
                            Variance will be calculated after closing.
                        </div>
                    )}

                    <Button type="submit" variant="destructive" className="w-full" disabled={mutation.isPending}>
                        {mutation.isPending
                            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Closing...</>
                            : "Confirm Close Register"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
