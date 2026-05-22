import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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

// Variance ≥ this magnitude → cashier must explain it in notes.
// 0.001 KWD = the smallest representable unit, so anything non-zero counts.
// Industry POS commonly uses a small threshold to allow for rounding error
// (e.g. ±0.250 KWD); raise this if rounding noise becomes a problem in practice.
const VARIANCE_NOTES_THRESHOLD = 0.001;

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

    // Idempotency key bound to this dialog instance: generated on first submit,
    // reused on every user-visible retry (toast-on-error → click again), and
    // cleared when the dialog closes. A fresh key per click would defeat the
    // server-side dedupe and let a lost-response retry double-record the close.
    const idemKeyRef = useRef<string | null>(null);
    useEffect(() => {
        if (!open) idemKeyRef.current = null;
    }, [open]);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema) as any,
        defaultValues: { counted_cash: undefined as unknown as number, notes: "" },
    });

    const countedCashRaw = form.watch("counted_cash");
    const notesRaw = form.watch("notes");
    const hasCount = countedCashRaw != null && !isNaN(countedCashRaw);

    // Cash movement totals from the session payload.
    const cashIn = session.cash_movements
        .filter(m => m.type === "cash_in")
        .reduce((sum, m) => sum + Number(m.amount), 0);
    const cashOut = session.cash_movements
        .filter(m => m.type === "cash_out")
        .reduce((sum, m) => sum + Number(m.amount), 0);

    // Cash transaction totals from the server-side tally — same numbers the
    // server will use during close, so the preview matches the recorded result.
    const tx = session.tx_summary;
    const cashPayments = Number(tx?.cash_payment_total) || 0;
    const cashRefunds = Number(tx?.cash_refund_total) || 0;
    const cashPaymentCount = tx?.cash_payment_count ?? 0;
    const cashRefundCount = tx?.cash_refund_count ?? 0;

    const openingFloat = Number(session.opening_float);
    const expectedCash = openingFloat + cashPayments - cashRefunds + cashIn - cashOut;
    const counted = hasCount ? Number(countedCashRaw) : null;
    const variance = counted !== null ? counted - expectedCash : null;
    const varianceAbs = variance !== null ? Math.abs(variance) : 0;
    const varianceOverThreshold = variance !== null && varianceAbs > VARIANCE_NOTES_THRESHOLD;
    const notesProvided = !!(notesRaw && notesRaw.trim().length > 0);
    const notesRequired = varianceOverThreshold && !notesProvided;

    const onSubmit = (values: FormValues) => {
        if (!user) {
            toast.error("Not signed in. Please sign in again before closing the register.");
            return;
        }
        // Belt-and-braces — onInvalid already covers zod errors, but the
        // variance-notes rule lives outside zod so guard here too.
        if (notesRequired) {
            toast.error("Variance is non-zero — explain the difference in notes before closing.");
            return;
        }
        if (!idemKeyRef.current) idemKeyRef.current = crypto.randomUUID();
        mutation.mutate(
            {
                sessionId: session.id,
                userId: user.id,
                countedCash: values.counted_cash,
                notes: values.notes || undefined,
                idempotencyKey: idemKeyRef.current,
            },
            {
                onSuccess: (res) => {
                    if (res.status === "success") {
                        idemKeyRef.current = null;
                        form.reset();
                        onOpenChange(false);
                    }
                },
            }
        );
    };

    const onInvalid = () => {
        const err = form.formState.errors.counted_cash?.message
            || "Enter the counted cash amount before confirming.";
        toast.error(err);
    };

    const varianceTone = variance === null
        ? "muted"
        : varianceAbs <= VARIANCE_NOTES_THRESHOLD
            ? "ok"
            : variance > 0
                ? "over"
                : "short";

    const varianceColor = varianceTone === "ok"
        ? "text-emerald-700"
        : varianceTone === "muted"
            ? "text-muted-foreground"
            : "text-red-600";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Close Register</DialogTitle>
                </DialogHeader>

                <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
                    {/* Cash drawer breakdown */}
                    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Opening Float</span>
                            <span className="font-semibold tabular-nums">{fmtK(openingFloat)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-700">
                            <span>Cash sales {cashPaymentCount > 0 ? `(${cashPaymentCount})` : ""}</span>
                            <span className="font-semibold tabular-nums">+{fmtK(cashPayments)}</span>
                        </div>
                        {cashRefundCount > 0 && (
                            <div className="flex justify-between text-red-600">
                                <span>Cash refunds ({cashRefundCount})</span>
                                <span className="font-semibold tabular-nums">−{fmtK(cashRefunds)}</span>
                            </div>
                        )}
                        {cashIn > 0 && (
                            <div className="flex justify-between text-emerald-600">
                                <span>Cash In</span>
                                <span className="font-semibold tabular-nums">+{fmtK(cashIn)}</span>
                            </div>
                        )}
                        {cashOut > 0 && (
                            <div className="flex justify-between text-red-600">
                                <span>Cash Out</span>
                                <span className="font-semibold tabular-nums">−{fmtK(cashOut)}</span>
                            </div>
                        )}
                        <div className="flex justify-between border-t border-border pt-1.5 mt-1">
                            <span className="font-medium">Expected in drawer</span>
                            <span className="font-bold tabular-nums">{fmtK(expectedCash)}</span>
                        </div>
                    </div>

                    {/* Counted Cash */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Counted Cash in Drawer (KWD)</Label>
                        <Input
                            type="number"
                            step="0.001"
                            min="0"
                            {...form.register("counted_cash")}
                            placeholder="0.000"
                            className="text-right font-bold tabular-nums text-lg h-12 placeholder:font-normal placeholder:text-muted-foreground/50"
                            autoFocus
                        />
                        {form.formState.errors.counted_cash && (
                            <p className="text-xs text-red-500">{form.formState.errors.counted_cash.message}</p>
                        )}
                    </div>

                    {/* Live variance preview */}
                    {variance !== null && (
                        <div className={`flex justify-between text-sm px-1 ${varianceColor}`}>
                            <span className="font-medium">Variance</span>
                            <span className="font-bold tabular-nums">
                                {variance > 0 ? "+" : ""}{fmtK(variance)}
                                {" "}
                                {varianceTone === "ok" ? "(exact)" : varianceTone === "over" ? "(over)" : "(short)"}
                            </span>
                        </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                            Notes {notesRequired ? <span className="text-red-600 normal-case">· required (variance non-zero)</span> : "(optional)"}
                        </Label>
                        <Textarea
                            {...form.register("notes")}
                            placeholder={notesRequired
                                ? "Explain the over/short — e.g. miscounted, gave wrong change, refund slip missed..."
                                : "Any notes about the register close..."}
                            className={`resize-none h-16 ${notesRequired ? "border-red-300 focus-visible:ring-red-300" : ""}`}
                        />
                    </div>

                    <Button
                        type="submit"
                        variant="destructive"
                        className="w-full"
                        disabled={mutation.isPending || notesRequired}
                    >
                        {mutation.isPending
                            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Closing...</>
                            : "Confirm Close Register"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
