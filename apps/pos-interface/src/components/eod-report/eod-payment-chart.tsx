import { Card } from "@repo/ui/card";
import { DonutChart } from "@/components/charts/donut-chart";
import { PAYMENT_TYPE_LABELS, PAYMENT_METHOD_COLORS } from "@/lib/constants";
import type { EodReportSummary } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;

interface EodPaymentChartProps {
    data: EodReportSummary;
}

export function EodPaymentChart({ data }: EodPaymentChartProps) {
    const segments = data.by_payment_method
        .filter(m => m.total > 0)
        .map(m => ({
            value: Number(m.total),
            color: PAYMENT_METHOD_COLORS[m.payment_type] || "#888",
            label: PAYMENT_TYPE_LABELS[m.payment_type as keyof typeof PAYMENT_TYPE_LABELS] || m.payment_type,
            amount: fmtK(m.total),
        }));

    const totalCollected = Number(data.total_collected) || 0;

    return (
        <Card className="p-5 shadow-none">
            <h3 className="text-base font-semibold mb-4">Payment methods</h3>

            {segments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No payment data</p>
            ) : (
                <div className="flex flex-col items-center gap-5">
                    <DonutChart
                        segments={segments}
                        size={160}
                        strokeWidth={18}
                        center={{
                            value: fmtK(totalCollected),
                            label: "total",
                        }}
                    />

                    <div className="w-full space-y-2">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground pb-1 border-b border-border">
                            <span className="w-2.5 h-2.5 shrink-0" />
                            <span className="flex-1">Method</span>
                            <span className="font-medium w-12 text-right">Txns</span>
                            <span className="font-medium w-24 text-right">Collected</span>
                            <span className="font-medium w-20 text-right">Refunded</span>
                            <span className="font-medium w-10 text-right">%</span>
                        </div>
                        {data.by_payment_method.map(m => {
                            const pct = totalCollected > 0 ? Math.round((Number(m.total) / totalCollected) * 100) : 0;
                            const label = PAYMENT_TYPE_LABELS[m.payment_type as keyof typeof PAYMENT_TYPE_LABELS] || m.payment_type;
                            const color = PAYMENT_METHOD_COLORS[m.payment_type] || "#888";
                            const refund = Number(m.refund_total) || 0;
                            return (
                                <div key={m.payment_type} className="flex items-center gap-3 text-sm">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                    <span className="flex-1 text-muted-foreground">{label}</span>
                                    <span className="tabular-nums text-xs text-muted-foreground w-12 text-right">{m.count}</span>
                                    <span className="tabular-nums font-medium w-24 text-right">{fmtK(m.total)}</span>
                                    <span className={`tabular-nums w-20 text-right text-xs ${refund > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                        {refund > 0 ? `−${fmtK(refund)}` : "—"}
                                    </span>
                                    <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </Card>
    );
}

export function EodOrderBreakdown({ data }: { data: EodReportSummary }) {
    const total = data.order_count;
    const workPct = total > 0 ? Math.round((data.work_count / total) * 100) : 0;
    const salesPct = total > 0 ? Math.round((data.sales_count / total) * 100) : 0;

    return (
        <Card className="p-5 shadow-none">
            <h3 className="text-base font-semibold mb-4">Order mix</h3>

            {data.order_count === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No orders in this period</p>
            ) : (
                <div className="space-y-5">
                    <div>
                        <p className="text-2xl font-semibold tabular-nums">{data.order_count}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Total orders booked</p>
                    </div>

                    <div className="space-y-2.5">
                        <MixRow label="Work orders" count={data.work_count} pct={workPct} />
                        <MixRow label="Sales orders" count={data.sales_count} pct={salesPct} />
                    </div>

                    {data.cancelled_count > 0 && (
                        <div className="border-t border-border pt-3 flex justify-between text-sm">
                            <span className="text-muted-foreground">Cancelled</span>
                            <span className="font-medium tabular-nums text-destructive">{data.cancelled_count}</span>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}

function MixRow({ label, count, pct }: { label: string; count: number; pct: number }) {
    return (
        <div>
            <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="tabular-nums">
                    <span className="font-medium">{count}</span>
                    <span className="text-muted-foreground text-xs ml-2">{pct}%</span>
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary/60" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}
