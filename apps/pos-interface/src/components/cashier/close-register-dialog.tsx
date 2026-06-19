import { useEffect, useRef } from "react";
import { useForm, type Resolver } from "react-hook-form";
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
        resolver: zodResolver(schema) as Resolver<FormValues>,
        defaultValues: { counted_cash: undefined as unknown as number, notes: "" },
    });

    const onSubmit = (values: FormValues) => {
        if (!user) {
            toast.error("Not signed in. Please sign in again before closing the register.");
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Close Register</DialogTitle>
                </DialogHeader>

                {/*
                    Blind cash count: the cashier counts the physical drawer and enters the
                    total without seeing the expected amount or variance, so the count can't
                    be back-solved to mask an over/short. The reconciliation is shown to
                    managers in the Store > End of Day report (SPEC §3).
                */}
                <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
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
                        <p className="text-xs text-muted-foreground">
                            Count the physical cash in the drawer and enter the total.
                        </p>
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

                    <Button
                        type="submit"
                        variant="destructive"
                        className="w-full"
                        disabled={mutation.isPending}
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
