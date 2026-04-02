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
        <Card className="p-5" style={{ animation: "cashier-number-count 500ms cubic-bezier(0.2, 0, 0, 1) 200ms both" }}>
            <h3 className="font-semibold text-sm mb-4">Payment Methods</h3>

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

                    {/* Detailed breakdown */}
                    <div className="w-full space-y-2">
                        {data.by_payment_method.map(m => {
                            const pct = totalCollected > 0 ? Math.round((Number(m.total) / totalCollected) * 100) : 0;
                            const label = PAYMENT_TYPE_LABELS[m.payment_type as keyof typeof PAYMENT_TYPE_LABELS] || m.payment_type;
                            const color = PAYMENT_METHOD_COLORS[m.payment_type] || "#888";
                            return (
                                <div key={m.payment_type} className="flex items-center gap-3 text-sm">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                    <span className="flex-1 text-muted-foreground">{label}</span>
                                    <span className="tabular-nums font-medium text-xs text-muted-foreground">{m.count} txn</span>
                                    <span className="tabular-nums font-semibold w-24 text-right">{fmtK(m.total)}</span>
                                    <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                                </div>
                            );
                        })}
                        {Number(data.total_refunded) > 0 && (
                            <>
                                <div className="border-t border-border my-1" />
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-red-400" />
                                    <span className="flex-1 text-red-600">Refunds</span>
                                    <span className="tabular-nums font-medium text-xs text-muted-foreground" />
                                    <span className="tabular-nums font-semibold w-24 text-right text-red-600">-{fmtK(data.total_refunded)}</span>
                                    <span className="w-10" />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
}

export function EodOrderBreakdown({ data }: { data: EodReportSummary }) {
    const fmt3 = (n: number): string => Number(Number(n).toFixed(3)).toString();

    return (
        <Card className="p-5" style={{ animation: "cashier-number-count 500ms cubic-bezier(0.2, 0, 0, 1) 280ms both" }}>
            <h3 className="font-semibold text-sm mb-4">Order Breakdown</h3>

            {data.order_count === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No orders in this period</p>
            ) : (
                <div className="space-y-4">
                    <div>
                        <p className="text-3xl font-bold tabular-nums">{data.order_count}</p>
                        <p className="text-xs text-muted-foreground">Total Orders</p>
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1 p-3 rounded-lg bg-sky-50">
                            <p className="text-lg font-bold tabular-nums text-sky-700">{data.work_count}</p>
                            <p className="text-xs text-sky-600">Work Orders</p>
                        </div>
                        <div className="flex-1 p-3 rounded-lg bg-violet-50">
                            <p className="text-lg font-bold tabular-nums text-violet-700">{data.sales_count}</p>
                            <p className="text-xs text-violet-600">Sales Orders</p>
                        </div>
                    </div>

                    <div className="border-t border-border pt-3 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Total Billed</span>
                            <span className="font-semibold tabular-nums">{fmtK(data.total_billed)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Avg. Order Value</span>
                            <span className="font-semibold tabular-nums">{fmt3(data.avg_order_value)} KWD</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Outstanding</span>
                            <span className="font-semibold tabular-nums text-amber-600">{fmtK(data.outstanding)}</span>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}
