import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LockKeyhole, ArrowDownUp, XCircle, CheckCircle2, AlertTriangle, CalendarDays } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Card } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
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
        resolver: zodResolver(openSchema) as any,
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
                        {session.closed_at ? timeFmt.format(new Date(session.closed_at)) : "—"}
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

// ── Register Status Bar ───────────────────────────────────────────────────────

function RegisterStatusBar({ session }: { session: RegisterSessionData }) {
    const [cashMovementOpen, setCashMovementOpen] = useState(false);
    const [closeRegisterOpen, setCloseRegisterOpen] = useState(false);

    const movementCount = session.cash_movements.length;
    // Compare YYYY-MM-DD strings to avoid TZ pitfalls (session.date is a local date).
    const isStale = session.date < getLocalDateStr();
    const sessionDateLabel = sessionDateFmt.format(new Date(`${session.date}T00:00:00`));

    // Stale = session opened on a previous day and never closed. Surfaces
    // the risk that a cashier is transacting against yesterday's session and
    // didn't notice (otherwise expected_cash variance gets weird).
    const barClass = isStale
        ? "bg-amber-50 border-amber-300"
        : "bg-emerald-50 border-emerald-200";
    const dotClass = isStale ? "bg-amber-500" : "bg-emerald-500";
    const labelClass = isStale ? "text-amber-800" : "text-emerald-700";
    const subClass = isStale ? "text-amber-700" : "text-emerald-600";
    const dividerClass = isStale ? "text-amber-600/70" : "text-emerald-600/70";

    return (
        <>
            <div className={`flex items-center justify-between px-4 py-2 border-b text-sm ${barClass}`}>
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full animate-pulse ${dotClass}`} />
                        <span className={`font-medium ${labelClass}`}>
                            {isStale ? "Register Open (stale)" : "Register Open"}
                        </span>
                    </div>
                    <span className={dividerClass}>|</span>
                    <span className={`flex items-center gap-1 text-xs tabular-nums ${subClass}`}>
                        <CalendarDays className="h-3 w-3" />
                        {sessionDateLabel}
                        {isStale && <span className="font-semibold ml-1">— close & reopen for today</span>}
                    </span>
                    <span className={dividerClass}>|</span>
                    <span className={`text-xs tabular-nums ${subClass}`}>
                        Float: {fmtK(session.opening_float)}
                    </span>
                    {movementCount > 0 && (
                        <>
                            <span className={dividerClass}>|</span>
                            <span className={`text-xs ${subClass}`}>
                                {movementCount} movement{movementCount !== 1 ? "s" : ""}
                            </span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className={`h-7 text-xs ${isStale
                            ? "border-amber-300 text-amber-800 hover:bg-amber-100"
                            : "border-emerald-300 text-emerald-700 hover:bg-emerald-100"}`}
                        onClick={() => setCashMovementOpen(true)}
                    >
                        <ArrowDownUp className="h-3.5 w-3.5 mr-1" />
                        Cash In/Out
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50"
                        onClick={() => setCloseRegisterOpen(true)}
                    >
                        <LockKeyhole className="h-3.5 w-3.5 mr-1" />
                        Close Register
                    </Button>
                </div>
            </div>

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
        return (
            <div className="h-full flex flex-col">
                <RegisterStatusBar session={session} />
                <StaleRegisterScreen session={session} />
            </div>
        );
    }

    // Session is open → render cashier terminal with status bar
    return (
        <div className="h-full flex flex-col">
            <RegisterStatusBar session={session} />
            <div className="flex-1 min-h-0">
                {children}
            </div>
        </div>
    );
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
                        <li>Click <span className="font-semibold">Close Register</span> in the bar above</li>
                        <li>Count yesterday's drawer and submit</li>
                        <li>A fresh open-register prompt appears for today</li>
                    </ol>
                </div>
            </Card>
        </div>
    );
}
