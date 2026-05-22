import { Card } from "@repo/ui/card";
import type { EodReportSummary } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;

interface EodKpiCardsProps {
    data: EodReportSummary;
}

export function EodKpiCards({ data }: EodKpiCardsProps) {
    const hasRefunds = data.total_refunded > 0;
    const refundCount = data.daily.reduce((s, d) => s + (d.refund_count || 0), 0);
    const refundSub = hasRefunds
        ? refundCount > 0
            ? refundCount === 1
                ? "1 refund"
                : `${refundCount} refunds`
            : "Includes refunds"
        : "No refunds";

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
                label="Net revenue"
                value={fmtK(data.net_revenue)}
                sub="Collected − Refunded"
                accent
            />
            <Kpi
                label="Collected"
                value={fmtK(data.total_collected)}
                sub={`${data.transaction_count} ${data.transaction_count === 1 ? "transaction" : "transactions"}`}
            />
            <Kpi
                label="Refunded"
                value={fmtK(data.total_refunded)}
                sub={refundSub}
                tone={data.total_refunded > 0 ? "neg" : undefined}
            />
            <Kpi
                label="AR outstanding"
                value={fmtK(data.ar_outstanding)}
                sub="All open balances"
            />
        </div>
    );
}

function Kpi({
    label,
    value,
    sub,
    accent,
    tone,
}: {
    label: string;
    value: string;
    sub?: string;
    accent?: boolean;
    tone?: "neg";
}) {
    const valueClass = accent
        ? "text-primary"
        : tone === "neg"
            ? "text-destructive"
            : "text-foreground";
    return (
        <Card className="p-4 shadow-none">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-2 text-xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </Card>
    );
}
