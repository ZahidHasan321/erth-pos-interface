import { Card } from "@repo/ui/card";
import {
    ArrowDownRight,
    ArrowUpRight,
    Banknote,
    TrendingUp,
    HandCoins,
    Receipt,
    ShoppingBag,
    PackageCheck,
} from "lucide-react";
import type { EodReportSummary } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;

interface EodKpiCardsProps {
    data: EodReportSummary;
}

interface Kpi {
    label: string;
    value: string;
    icon: typeof ArrowUpRight;
    color: string;
    bg: string;
    iconBg: string;
    sub: string | null;
}

export function EodKpiCards({ data }: EodKpiCardsProps) {
    const cashRow: Kpi[] = [
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
            sub: "Collected − Refunded",
        },
        {
            label: "AR Outstanding",
            value: fmtK(data.ar_outstanding),
            icon: Banknote,
            color: "text-amber-600",
            bg: "bg-amber-50",
            iconBg: "bg-amber-100",
            sub: "All open balances",
        },
    ];

    const tailoringRow: Kpi[] = [
        {
            label: "Deposits Collected",
            value: fmtK(data.deposit_collected),
            icon: HandCoins,
            color: "text-sky-700",
            bg: "bg-sky-50",
            iconBg: "bg-sky-100",
            sub: "First payment per order",
        },
        {
            label: "Balance Payments",
            value: fmtK(data.balance_collected),
            icon: Receipt,
            color: "text-indigo-700",
            bg: "bg-indigo-50",
            iconBg: "bg-indigo-100",
            sub: "Settlements on prior orders",
        },
        {
            label: "New Orders Booked",
            value: `${data.order_count}`,
            icon: ShoppingBag,
            color: "text-slate-700",
            bg: "bg-slate-50",
            iconBg: "bg-slate-100",
            sub: `Billed: ${fmtK(data.gross_sales)}`,
        },
        {
            label: "Delivered / Collected",
            value: `${data.delivered_count}`,
            icon: PackageCheck,
            color: "text-emerald-700",
            bg: "bg-emerald-50",
            iconBg: "bg-emerald-100",
            sub: "Garments handed over",
        },
    ];

    return (
        <div className="space-y-3">
            <KpiRow kpis={cashRow} offset={0} />
            <KpiRow kpis={tailoringRow} offset={4} />
        </div>
    );
}

function KpiRow({ kpis, offset }: { kpis: Kpi[]; offset: number }) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map((kpi, i) => (
                <Card
                    key={kpi.label}
                    className={`p-4 ${kpi.bg} border-none`}
                    style={{ animation: `cashier-number-count 500ms cubic-bezier(0.2, 0, 0, 1) ${(i + offset) * 60}ms both` }}
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
