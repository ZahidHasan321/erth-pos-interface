import { Card } from "@repo/ui/card";
import type { EodReportSummary } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;

interface EodSalesSummaryProps {
    data: EodReportSummary;
}

export function EodSalesSummary({ data }: EodSalesSummaryProps) {
    const netSales = data.gross_sales - data.discount_total;

    return (
        <Card className="p-5 shadow-none">
            <div className="mb-4 pb-3 border-b border-border">
                <h2 className="text-base font-semibold">Sales summary</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Accrual basis: orders booked in this period
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
                <Cell label="Gross sales" value={fmtK(data.gross_sales)} />
                <Cell
                    label="Discounts"
                    value={data.discount_total > 0 ? `− ${fmtK(data.discount_total)}` : fmtK(0)}
                    tone={data.discount_total > 0 ? "neg" : undefined}
                />
                <Cell
                    label="Cancellations"
                    value={`${data.cancelled_count}`}
                    sub={data.cancelled_billed > 0 ? `Was ${fmtK(data.cancelled_billed)}` : undefined}
                    tone={data.cancelled_count > 0 ? "neg" : undefined}
                />
                <Cell label="Net sales" value={fmtK(netSales)} emphasize />
                <Cell label="Avg order" value={fmtK(data.avg_order_value)} sub={`${data.order_count} orders`} />
                <Cell
                    label="Orders booked"
                    value={`${data.order_count}`}
                    sub={`${data.work_count} work · ${data.sales_count} sales`}
                />
            </div>

            <div className="mt-5 pt-4 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                <Cell
                    label="Deposits collected"
                    value={fmtK(data.deposit_collected)}
                    sub="First payment per order"
                />
                <Cell
                    label="Balance payments"
                    value={fmtK(data.balance_collected)}
                    sub="Settlements on prior orders"
                />
                <Cell
                    label="Outstanding (this period)"
                    value={fmtK(data.outstanding)}
                    sub="Unpaid balance on new orders"
                />
                <Cell
                    label="Delivered / collected"
                    value={`${data.delivered_count}`}
                    sub="Garments handed over"
                />
            </div>
        </Card>
    );
}

function Cell({
    label,
    value,
    sub,
    tone,
    emphasize,
}: {
    label: string;
    value: string;
    sub?: string;
    tone?: "neg";
    emphasize?: boolean;
}) {
    const color = tone === "neg" ? "text-destructive" : emphasize ? "text-primary" : "text-foreground";
    const size = emphasize ? "text-lg font-semibold" : "text-base font-medium";
    return (
        <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`${size} tabular-nums ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
    );
}
