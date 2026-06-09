import { Card } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, CheckCircle2, Lock, Unlock, RotateCcw } from "lucide-react";
import { useRegisterSessionByDate } from "@/hooks/useCashier";
import type { EodReportSummary, CashMovementReasonCategory } from "@/api/cashier";
import { CASH_MOVEMENT_CATEGORY_LABEL } from "@/lib/cashMovementLabels";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;
const fmtTime = (iso: string): string =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

interface EodCashDrawerProps {
    date: string;
    report: EodReportSummary;
}

export function EodCashDrawer({ date, report }: EodCashDrawerProps) {
    const { data: sessionRes, isLoading } = useRegisterSessionByDate(date);
    const session = sessionRes?.data;

    // Cash payments / refunds for the day, derived from tender breakdown
    const cashTender = report.by_payment_method.find((m) => m.payment_type === "cash");
    const cashPayments = cashTender?.total ?? 0;
    const cashRefunds = cashTender?.refund_total ?? 0;

    if (isLoading) {
        return <Skeleton className="h-64 rounded-lg" />;
    }

    if (!session) {
        return (
            <Card className="p-5 shadow-none border-dashed">
                <div className="flex items-start gap-3">
                    <Wallet className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                        <p className="text-sm font-medium">No register session for this day</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            The cash drawer was never opened on {date}. Cash reconciliation unavailable.
                        </p>
                    </div>
                </div>
            </Card>
        );
    }

    const cashIn = session.cash_movements.filter((m) => m.type === "cash_in");
    const cashOut = session.cash_movements.filter((m) => m.type === "cash_out");
    const cashInTotal = cashIn.reduce((s, m) => s + Number(m.amount), 0);
    const cashOutTotal = cashOut.reduce((s, m) => s + Number(m.amount), 0);
    const expectedCash =
        Number(session.opening_float) + cashPayments - cashRefunds + cashInTotal - cashOutTotal;
    const closed = session.status === "closed";
    const variance = session.variance !== null ? Number(session.variance) : null;
    const reopened = !!session.reopened_at;

    return (
        <Card className="p-5 shadow-none">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-base font-semibold">Cash drawer reconciliation</h2>
                </div>
                <div className="flex items-center gap-2">
                    {reopened && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                            <RotateCcw className="h-3 w-3" />
                            Reopened
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted text-foreground">
                        {closed ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                        {closed ? "Closed" : "Open"}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <Row label="Opening Float" value={fmtK(Number(session.opening_float))} />
                <Row label="Cash Payments" value={fmtK(cashPayments)} tone="pos" />
                <Row label="Cash Refunds" value={fmtK(cashRefunds)} tone="neg" />
                <Row label="Paid In / Out" value={`+${fmtK(cashInTotal)} / −${fmtK(cashOutTotal)}`} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-border">
                <Row label="Expected Cash" value={fmtK(expectedCash)} emphasize />
                <Row
                    label="Counted Cash"
                    value={session.closing_counted_cash !== null ? fmtK(Number(session.closing_counted_cash)) : "-"}
                    emphasize
                />
                <VarianceRow variance={variance} closed={closed} />
            </div>

            {(cashIn.length > 0 || cashOut.length > 0) && (
                <div className="mt-5 pt-4 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Cash Movements</p>
                    <div className="space-y-1.5">
                        {cashIn.map((m) => (
                            <MovementLine key={`in-${m.id}`} type="in" amount={Number(m.amount)} category={m.reason_category} reason={m.reason} by={m.performed_by_name} at={m.created_at} />
                        ))}
                        {cashOut.map((m) => (
                            <MovementLine key={`out-${m.id}`} type="out" amount={Number(m.amount)} category={m.reason_category} reason={m.reason} by={m.performed_by_name} at={m.created_at} />
                        ))}
                    </div>
                </div>
            )}

            {closed && (
                <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
                    Closed by {session.closed_by_name ?? "-"} at {session.closed_at ? fmtTime(session.closed_at) : "-"}
                    {session.closing_notes && <span className="ml-2">· {session.closing_notes}</span>}
                </div>
            )}
        </Card>
    );
}

function Row({ label, value, tone, emphasize }: { label: string; value: string; tone?: "pos" | "neg"; emphasize?: boolean }) {
    const color = tone === "neg" ? "text-destructive" : "text-foreground";
    const size = emphasize ? "text-lg font-semibold" : "text-sm font-medium";
    return (
        <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`${size} tabular-nums ${color}`}>{value}</p>
        </div>
    );
}

function VarianceRow({ variance, closed }: { variance: number | null; closed: boolean }) {
    if (!closed || variance === null) {
        return (
            <div>
                <p className="text-xs text-muted-foreground mb-1">Variance</p>
                <p className="text-lg font-semibold text-muted-foreground tabular-nums">-</p>
                <p className="text-xs text-muted-foreground mt-0.5">Pending close</p>
            </div>
        );
    }
    const zero = Math.abs(variance) < 0.001;
    const color = zero ? "text-foreground" : "text-destructive";
    return (
        <div>
            <p className="text-xs text-muted-foreground mb-1">Variance</p>
            <p className={`text-lg font-semibold tabular-nums flex items-center gap-1.5 ${color}`}>
                {zero ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {variance > 0 ? "+" : ""}{fmt(variance)} KWD
            </p>
            <p className={`text-xs mt-0.5 ${zero ? "text-muted-foreground" : "text-destructive"}`}>
                {zero ? "Balanced" : variance > 0 ? "Over" : "Short"}
            </p>
        </div>
    );
}

function MovementLine({ type, amount, category, reason, by, at }: { type: "in" | "out"; amount: number; category: CashMovementReasonCategory; reason: string; by: string; at: string }) {
    const Icon = type === "in" ? ArrowDownToLine : ArrowUpFromLine;
    const label = CASH_MOVEMENT_CATEGORY_LABEL[category] ?? "Other";
    return (
        <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground shrink-0">{fmtTime(at)}</span>
                <span className="truncate">
                    {label}
                    {reason ? <span className="text-muted-foreground"> · {reason}</span> : null}
                </span>
                <span className="text-muted-foreground shrink-0">· {by}</span>
            </div>
            <span className="tabular-nums font-medium">
                {type === "in" ? "+" : "−"}{fmtK(amount)}
            </span>
        </div>
    );
}
