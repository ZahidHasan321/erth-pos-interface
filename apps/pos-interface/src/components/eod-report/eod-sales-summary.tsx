import { Card } from "@repo/ui/card";
import type { EodReportSummary } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;

interface EodSalesSummaryProps {
    data: EodReportSummary;
}

export function EodSalesSummary({ data }: EodSalesSummaryProps) {
    const netSales = data.gross_sales - data.discount_total;
    const avg = data.avg_order_value;

    return (
        <Card className="p-5 border border-border">
            <div className="mb-4 pb-3 border-b border-border">
                <h2 className="text-base font-semibold">Sales Summary</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Accrual basis — orders booked in this period
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
                <Cell label="Gross Sales" value={fmtK(data.gross_sales)} />
                <Cell label="Discounts" value={`− ${fmtK(data.discount_total)}`} tone="neg" />
                <Cell
                    label="Cancellations"
                    value={`${data.cancelled_count}`}
                    sub={data.cancelled_billed > 0 ? `Was ${fmtK(data.cancelled_billed)}` : undefined}
                    tone={data.cancelled_count > 0 ? "neg" : undefined}
                />
                <Cell label="Net Sales" value={fmtK(netSales)} emphasize />
                <Cell label="Refunds (cash basis)" value={fmtK(data.total_refunded)} tone="neg" />
                <Cell label="Avg Order Value" value={fmtK(avg)} sub={`${data.order_count} orders`} />
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
    const color = tone === "neg" ? "text-red-600" : "text-foreground";
    const size = emphasize ? "text-lg font-semibold" : "text-base font-medium";
    return (
        <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`${size} tabular-nums ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
    );
}
