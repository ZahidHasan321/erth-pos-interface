import { useState, type ReactNode } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LockKeyhole, ArrowDownUp, XCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Card } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/popover";
import { useRegisterSession, useOpenRegisterMutation, useReopenRegisterMutation } from "@/hooks/useCashier";
import { useAuth } from "@/context/auth";
import type { RegisterSessionData } from "@/api/cashier";
import { getLocalDateStr } from "@/lib/utils";
import { CashMovementDialog } from "./cash-movement-dialog";
import { CloseRegisterDialog } from "./close-register-dialog";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
const sessionDateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short" });

// ── Open Register Form ────────────────────────────────────────────────────────

const openSchema = z.object({
    opening_float: z.coerce.number().min(0, "Cannot be negative"),
});
type OpenFormValues = z.infer<typeof openSchema>;

function OpenRegisterScreen() {
    const { user } = useAuth();
    const mutation = useOpenRegisterMutation();

    const form = useForm<OpenFormValues>({
        resolver: zodResolver(openSchema) as Resolver<OpenFormValues>,
        defaultValues: { opening_float: undefined as unknown as number },
    });

    const onSubmit = (values: OpenFormValues) => {
        if (!user) return;
        mutation.mutate({ userId: user.id, openingFloat: values.opening_float });
    };

    return (
        <div className="h-full flex items-center justify-center p-6">
            <Card className="w-full max-w-sm p-8 space-y-6 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <LockKeyhole className="h-7 w-7 text-primary" />
                </div>

                <div>
                    <h2 className="text-xl font-bold font-[Marcellus]">Open Register</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Enter the cash currently in the drawer to start the day.
                    </p>
                </div>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 text-left">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Opening Float (KWD)</Label>
                        <Input
                            type="number"
                            step="0.001"
                            min="0"
                            {...form.register("opening_float")}
                            placeholder="0.000"
                            className="text-right font-bold tabular-nums text-lg h-12"
                            autoFocus
                        />
                        {form.formState.errors.opening_float && (
                            <p className="text-xs text-red-500">{form.formState.errors.opening_float.message}</p>
                        )}
                    </div>

                    <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={mutation.isPending}>
                        {mutation.isPending
                            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Opening...</>
                            : "Open Register"}
                    </Button>
                </form>
            </Card>
        </div>
    );
}

// ── Closed Register Screen ────────────────────────────────────────────────────

function ClosedRegisterScreen({ session }: { session: RegisterSessionData }) {
    const { user } = useAuth();
    const reopenMutation = useReopenRegisterMutation();
    const variance = Number(session.variance) || 0;
    const isOver = variance > 0;
    const isShort = variance < 0;
    const isExact = variance === 0;

    // Prior closes = every close before the latest one. Surfaces shortages that
    // would otherwise be erased by a reopen + clean reclose.
    const events = session.close_events ?? [];
    const priorCloses = events.slice(0, -1);

    const handleReopen = () => {
        if (!user) return;
        reopenMutation.mutate({ sessionId: session.id, userId: user.id });
    };

    return (
        <div className="h-full flex items-center justify-center p-6">
            <Card className="w-full max-w-md p-8 space-y-5 text-center">
                <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center ${isExact ? "bg-emerald-50" : isShort ? "bg-red-50" : "bg-amber-50"}`}>
                    {isExact
                        ? <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                        : isShort
                          ? <XCircle className="h-7 w-7 text-red-600" />
                          : <AlertTriangle className="h-7 w-7 text-amber-600" />}
                </div>

                <div>
                    <h2 className="text-xl font-bold font-[Marcellus]">Register Closed</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Closed by {session.closed_by_name || "Unknown"} at{" "}
                        {session.closed_at ? timeFmt.format(new Date(session.closed_at)) : "-"}
                    </p>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm text-left">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Opening Float</span>
                        <span className="font-semibold tabular-nums">{fmtK(session.opening_float)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Expected Cash</span>
                        <span className="font-semibold tabular-nums">{fmtK(session.expected_cash ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Counted Cash</span>
                        <span className="font-semibold tabular-nums">{fmtK(session.closing_counted_cash ?? 0)}</span>
                    </div>
                    <div className="border-t border-border pt-2 flex justify-between">
                        <span className="font-medium">Variance</span>
                        <span className={`font-bold tabular-nums ${isExact ? "text-emerald-600" : isShort ? "text-red-600" : "text-amber-600"}`}>
                            {isOver ? "+" : ""}{fmtK(variance)}
                            {isExact ? " (exact)" : isShort ? " (short)" : " (over)"}
                        </span>
                    </div>
                </div>

                {session.closing_notes && (
                    <p className="text-xs text-muted-foreground italic">"{session.closing_notes}"</p>
                )}

                {priorCloses.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left space-y-2">
                        <p className="text-xs font-semibold text-amber-800">
                            Prior close{priorCloses.length > 1 ? "s" : ""} ({priorCloses.length})
                        </p>
                        <ul className="space-y-2 text-xs text-amber-900">
                            {priorCloses.map((ev) => {
                                const v = Number(ev.variance) || 0;
                                const label = v === 0 ? "exact" : v < 0 ? "short" : "over";
                                return (
                                    <li key={ev.id} className="border-t border-amber-200/60 pt-2 first:border-t-0 first:pt-0">
                                        <div className="flex justify-between tabular-nums">
                                            <span>{timeFmt.format(new Date(ev.closed_at))} · {ev.closed_by_name}</span>
                                            <span className="font-semibold">
                                                {v > 0 ? "+" : ""}{fmtK(v)} ({label})
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-amber-700/80 tabular-nums">
                                            <span>counted {fmtK(ev.counted_cash)} / expected {fmtK(ev.expected_cash)}</span>
                                        </div>
                                        {ev.notes && (
                                            <p className="italic mt-0.5">"{ev.notes}"</p>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleReopen}
                    disabled={reopenMutation.isPending}
                >
                    {reopenMutation.isPending
                        ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Reopening...</>
                        : "Reopen Register"}
                </Button>
            </Card>
        </div>
    );
}

// ── Register Menu (popover trigger + details) ─────────────────────────────────

export function RegisterMenu({ session }: { session: RegisterSessionData }) {
    const [open, setOpen] = useState(false);
    const [cashMovementOpen, setCashMovementOpen] = useState(false);
    const [closeRegisterOpen, setCloseRegisterOpen] = useState(false);

    const movementCount = session.cash_movements.length;
    const isStale = session.date < getLocalDateStr();
    const sessionDateLabel = sessionDateFmt.format(new Date(`${session.date}T00:00:00`));

    const dotClass = isStale ? "bg-amber-500" : "bg-emerald-500";
    const triggerClass = isStale
        ? "border-amber-300 text-amber-800 hover:bg-amber-50"
        : "border-border text-foreground hover:bg-muted";

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={`h-8 text-xs gap-2 ${triggerClass}`}>
                        <span className={`w-2 h-2 rounded-full animate-pulse ${dotClass}`} />
                        <span className="font-medium">
                            {isStale ? "Register (stale)" : "Register"}
                        </span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-0">
                    <div className="px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                            <span className="text-sm font-semibold">
                                {isStale ? "Register Open (stale)" : "Register Open"}
                            </span>
                        </div>
                        {isStale && (
                            <p className="text-xs text-amber-700 mt-1">
                                Opened {sessionDateLabel}. Close & reopen for today.
                            </p>
                        )}
                    </div>

                    <div className="px-4 py-3 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Session date</span>
                            <span className="tabular-nums">{sessionDateLabel}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Opening float</span>
                            <span className="tabular-nums font-medium">{fmtK(session.opening_float)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Cash movements</span>
                            <span className="tabular-nums">{movementCount}</span>
                        </div>
                    </div>

                    <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-border">
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-8 text-xs justify-start"
                            onClick={() => { setOpen(false); setCashMovementOpen(true); }}
                        >
                            <ArrowDownUp className="h-3.5 w-3.5 mr-2" />
                            Cash In/Out
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-8 text-xs justify-start border-red-300 text-red-600 hover:bg-red-50"
                            onClick={() => { setOpen(false); setCloseRegisterOpen(true); }}
                        >
                            <LockKeyhole className="h-3.5 w-3.5 mr-2" />
                            Close Register
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>

            <CashMovementDialog
                open={cashMovementOpen}
                onOpenChange={setCashMovementOpen}
                sessionId={session.id}
            />
            <CloseRegisterDialog
                open={closeRegisterOpen}
                onOpenChange={setCloseRegisterOpen}
                session={session}
            />
        </>
    );
}

// ── Register Gate (wraps cashier terminal) ────────────────────────────────────

/**
 * Whether the brand's register can RECORD MONEY right now: an open session that
 * belongs to today. Mirrors the gate's open/closed/stale logic. Used to gate
 * only the money actions (payment, refund) — handover/collection is ungated on
 * the register session (SPEC §3: "frozen day rejects money"; pickup is ungated),
 * so the order detail stays usable for handover even with no/stale/closed
 * register. `isLoading` is true while the session is still being fetched.
 */
export function useRegisterReady(): { ready: boolean; isLoading: boolean } {
    const { data: sessionResult, isLoading } = useRegisterSession();
    const session = sessionResult?.data;
    const ready = !!session && session.status !== "closed" && session.date >= getLocalDateStr();
    return { ready, isLoading };
}

interface RegisterGateProps {
    children: ReactNode;
}

export function RegisterGate({ children }: RegisterGateProps) {
    const { data: sessionResult, isLoading } = useRegisterSession();
    const session = sessionResult?.data;

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center p-6">
                <div className="space-y-3 w-full max-w-sm">
                    <Skeleton className="h-14 w-14 rounded-full mx-auto" />
                    <Skeleton className="h-6 w-48 mx-auto" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-11 w-full" />
                </div>
            </div>
        );
    }

    // No session today → show open register
    if (!session) {
        return <OpenRegisterScreen />;
    }

    // Session is closed → show closed summary
    if (session.status === "closed") {
        return <ClosedRegisterScreen session={session} />;
    }

    // Stale = session opened on a previous day. Block transactions until
    // staff close yesterday's drawer and reopen for today; otherwise the
    // expected_cash reconciliation rolls yesterday's float into today.
    const isStale = session.date < getLocalDateStr();

    if (isStale) {
        return <StaleRegisterScreen session={session} />;
    }

    return <>{children}</>;
}

// Renders the register menu in the global app header when an open session
// exists. Non-cashier users have no session → returns null.
export function RegisterHeaderMenu() {
    const { data: sessionResult } = useRegisterSession();
    const session = sessionResult?.data;
    if (!session || session.status === "closed") return null;
    return <RegisterMenu session={session} />;
}

// ── Stale Register Screen ─────────────────────────────────────────────────────

function StaleRegisterScreen({ session }: { session: RegisterSessionData }) {
    return (
        <div className="flex-1 flex items-center justify-center p-6">
            <Card className="w-full max-w-md p-8 space-y-5 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
                    <AlertTriangle className="h-7 w-7 text-amber-600" />
                </div>
                <div>
                    <h2 className="text-xl font-bold font-[Marcellus]">Yesterday's Register Still Open</h2>
                    <p className="text-sm text-muted-foreground mt-2">
                        This register was opened on{" "}
                        <span className="font-semibold">
                            {sessionDateFmt.format(new Date(`${session.date}T00:00:00`))}
                        </span>{" "}
                        and never closed. Recording transactions against a stale session would mix
                        yesterday's float into today's reconciliation.
                    </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-left text-amber-900 space-y-1">
                    <p className="font-semibold">To continue:</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Open the <span className="font-semibold">Register</span> menu (top-right)</li>
                        <li>Click <span className="font-semibold">Close Register</span> and count yesterday's drawer</li>
                        <li>A fresh open-register prompt appears for today</li>
                    </ol>
                </div>
            </Card>
        </div>
    );
}
