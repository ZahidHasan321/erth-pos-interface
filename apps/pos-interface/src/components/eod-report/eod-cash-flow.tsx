import { Card } from "@repo/ui/card";
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight } from "lucide-react";
import type { EodReportSummary } from "@/api/cashier";
import { CASH_MOVEMENT_CATEGORY_LABEL } from "@/lib/cashMovementLabels";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;

interface EodCashFlowProps {
    data: EodReportSummary;
}

interface Line {
    label: string;
    amount: number;
    count?: number;
}

/**
 * All cash that moved through the drawer in the period — works for a single day
 * OR a multi-day range (the drawer reconciliation card is single-day only, so
 * this is the only place a week's drops / deposits / petty-cash show up).
 * Combines customer cash (order payments / refunds) with the manual
 * register_cash_movements, split into money in vs money out.
 */
export function EodCashFlow({ data }: EodCashFlowProps) {
    const cashTender = data.by_payment_method.find((m) => m.payment_type === "cash");
    const orderCashIn = cashTender?.total ?? 0;
    const orderCashOut = cashTender?.refund_total ?? 0;

    const inLines: Line[] = [];
    const outLines: Line[] = [];

    if (orderCashIn > 0) inLines.push({ label: "Order payments (cash)", amount: orderCashIn, count: cashTender?.count });
    if (orderCashOut > 0) outLines.push({ label: "Order refunds (cash)", amount: orderCashOut });

    for (const c of data.cash_flow.by_category) {
        const line: Line = {
            label: CASH_MOVEMENT_CATEGORY_LABEL[c.reason_category] ?? "Other",
            amount: Number(c.total),
            count: Number(c.count),
        };
        if (c.type === "cash_in") inLines.push(line);
        else outLines.push(line);
    }

    const totalIn = inLines.reduce((s, l) => s + l.amount, 0);
    const totalOut = outLines.reduce((s, l) => s + l.amount, 0);
    const net = totalIn - totalOut;

    if (inLines.length === 0 && outLines.length === 0) return null;

    return (
        <Card className="p-5 shadow-none">
            <div className="mb-4 pb-3 border-b border-border flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <div>
                    <h2 className="text-base font-semibold">Cash flow</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        All cash that moved through the drawer in this period
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                <Column
                    heading="Cash in"
                    icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
                    lines={inLines}
                    total={totalIn}
                    tone="pos"
                />
                <Column
                    heading="Cash out"
                    icon={<ArrowUpFromLine className="h-3.5 w-3.5" />}
                    lines={outLines}
                    total={totalOut}
                    tone="neg"
                />
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-sm font-medium">Net cash movement</span>
                <span className={`text-lg font-semibold tabular-nums ${net < 0 ? "text-destructive" : "text-foreground"}`}>
                    {net < 0 ? "−" : "+"}{fmtK(Math.abs(net))}
                </span>
            </div>
        </Card>
    );
}

function Column({
    heading,
    icon,
    lines,
    total,
    tone,
}: {
    heading: string;
    icon: React.ReactNode;
    lines: Line[];
    total: number;
    tone: "pos" | "neg";
}) {
    const sign = tone === "neg" ? "−" : "+";
    return (
        <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                {icon}
                {heading}
            </div>
            {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">None</p>
            ) : (
                <div className="space-y-1.5">
                    {lines.map((l, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                            <span>
                                {l.label}
                                {l.count != null && <span className="text-muted-foreground"> · {l.count}</span>}
                            </span>
                            <span className="tabular-nums">{fmtK(l.amount)}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-sm font-medium">
                <span>Total {heading.toLowerCase()}</span>
                <span className="tabular-nums">{sign}{fmtK(total)}</span>
            </div>
        </div>
    );
}
