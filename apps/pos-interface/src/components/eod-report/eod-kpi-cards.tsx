import { Card } from "@repo/ui/card";
import { ArrowDownRight, ArrowUpRight, Banknote, TrendingUp } from "lucide-react";
import type { EodReportSummary } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;

interface EodKpiCardsProps {
    data: EodReportSummary;
}

export function EodKpiCards({ data }: EodKpiCardsProps) {
    const kpis = [
        {
            label: "Total Collected",
            value: fmtK(data.total_collected),
            icon: ArrowUpRight,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            iconBg: "bg-emerald-100",
            sub: `${data.transaction_count} transactions`,
        },
        {
            label: "Total Refunded",
            value: fmtK(data.total_refunded),
            icon: ArrowDownRight,
            color: "text-red-600",
            bg: "bg-red-50",
            iconBg: "bg-red-100",
            sub: null,
        },
        {
            label: "Net Revenue",
            value: fmtK(data.net_revenue),
            icon: TrendingUp,
            color: "text-primary",
            bg: "bg-primary/5",
            iconBg: "bg-primary/10",
            sub: `Billed: ${fmtK(data.total_billed)}`,
        },
        {
            label: "Outstanding",
            value: fmtK(data.outstanding),
            icon: Banknote,
            color: "text-amber-600",
            bg: "bg-amber-50",
            iconBg: "bg-amber-100",
            sub: `${data.order_count} orders`,
        },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map((kpi, i) => (
                <Card
                    key={kpi.label}
                    className={`p-4 ${kpi.bg} border-none`}
                    style={{ animation: `cashier-number-count 500ms cubic-bezier(0.2, 0, 0, 1) ${i * 80}ms both` }}
                >
                    <div className="flex items-start justify-between mb-3">
                        <span className="text-xs font-medium text-muted-foreground">{kpi.label}</span>
                        <div className={`p-2 rounded-lg ${kpi.iconBg}`}>
                            <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                        </div>
                    </div>
                    <p className={`text-xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
                    {kpi.sub && (
                        <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                    )}
                </Card>
            ))}
        </div>
    );
}
