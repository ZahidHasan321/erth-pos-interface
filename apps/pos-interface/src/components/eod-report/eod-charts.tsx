import { Card } from "@repo/ui/card";
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from "recharts";
import type { EodDailyData, EodCashierData } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;
const fmtKSafe = (v: string | number | undefined): string => fmtK(Number(v) || 0);
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

// Restrained neutral chart palette — collected uses primary tone, refunds use destructive.
const COLLECTED_COLOR = "#1f2937";  // slate-800 — single dark neutral (brand primary is too varied per brand to hardcode)
const REFUND_COLOR = "#b91c1c";     // red-700 — matches --destructive intent
const GRID_COLOR = "#eef0f2";
const AXIS_COLOR = "#94a3b8";

interface ChartTooltipEntry {
    color?: string;
    name?: string | number;
    value?: string | number;
}

interface ChartTooltipProps {
    active?: boolean;
    payload?: ChartTooltipEntry[];
    label?: string | number;
    formatter?: (value: string | number | undefined) => string;
}

function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-foreground text-background text-xs rounded-md shadow-md px-3 py-2">
            <p className="font-medium mb-1">{label}</p>
            {payload.map((entry, i: number) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="opacity-70">{entry.name}:</span>
                    <span className="font-medium tabular-nums">
                        {formatter ? formatter(entry.value) : entry.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

interface RevenueTrendChartProps {
    data: EodDailyData[];
}

export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
    if (data.length < 2) return null;

    const chartData = data.map(d => ({
        date: shortDate.format(new Date(d.date + "T00:00:00")),
        collected: Number(d.collected),
        refunded: Number(d.refunded),
    }));

    return (
        <Card className="p-5 shadow-none">
            <h3 className="text-base font-semibold">Revenue trend</h3>
            <p className="text-xs text-muted-foreground mb-4">Daily collections over the selected period</p>

            <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: AXIS_COLOR }}
                        tickLine={false}
                        axisLine={{ stroke: GRID_COLOR }}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: AXIS_COLOR }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                        width={45}
                    />
                    <Tooltip content={<ChartTooltip formatter={fmtKSafe} />} />
                    <Area
                        type="monotone"
                        dataKey="collected"
                        name="Collected"
                        stroke={COLLECTED_COLOR}
                        strokeWidth={2}
                        fill={COLLECTED_COLOR}
                        fillOpacity={0.08}
                        dot={data.length <= 14 ? { r: 2.5, fill: COLLECTED_COLOR, strokeWidth: 0 } : false}
                        activeDot={{ r: 4, fill: COLLECTED_COLOR, stroke: "#fff", strokeWidth: 2 }}
                        animationDuration={500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </Card>
    );
}

interface CollectionsVsRefundsChartProps {
    data: EodDailyData[];
}

export function CollectionsVsRefundsChart({ data }: CollectionsVsRefundsChartProps) {
    if (data.length < 2) return null;

    const hasRefunds = data.some(d => Number(d.refunded) > 0);

    const chartData = data.map(d => ({
        date: shortDate.format(new Date(d.date + "T00:00:00")),
        collected: Number(d.collected),
        refunded: Number(d.refunded),
    }));

    return (
        <Card className="p-5 shadow-none">
            <h3 className="text-base font-semibold">Collections vs refunds</h3>
            <p className="text-xs text-muted-foreground mb-4">Daily payment and refund comparison</p>

            <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: AXIS_COLOR }}
                        tickLine={false}
                        axisLine={{ stroke: GRID_COLOR }}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: AXIS_COLOR }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                        width={45}
                    />
                    <Tooltip content={<ChartTooltip formatter={fmtKSafe} />} />
                    <Bar
                        dataKey="collected"
                        name="Collected"
                        fill={COLLECTED_COLOR}
                        radius={[3, 3, 0, 0]}
                        animationDuration={500}
                    />
                    {hasRefunds && (
                        <Bar
                            dataKey="refunded"
                            name="Refunded"
                            fill={REFUND_COLOR}
                            radius={[3, 3, 0, 0]}
                            animationDuration={500}
                        />
                    )}
                </BarChart>
            </ResponsiveContainer>
        </Card>
    );
}

interface CashierLeaderboardProps {
    data: EodCashierData[];
}

export function CashierLeaderboard({ data }: CashierLeaderboardProps) {
    if (data.length === 0) return null;

    const chartData = data
        .filter(d => Number(d.collected) > 0 || Number(d.refunded) > 0)
        .map(d => ({
            name: d.cashier_name || "Unknown",
            collected: Number(d.collected),
            transactions: Number(d.transaction_count),
        }));

    if (chartData.length === 0) return null;

    return (
        <Card className="p-5 shadow-none">
            <h3 className="text-base font-semibold">Cashier performance</h3>
            <p className="text-xs text-muted-foreground mb-4">Collections by cashier</p>

            <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 48 + 20)}>
                <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                    <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: AXIS_COLOR }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                    />
                    <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 12, fill: "#374151" }}
                        tickLine={false}
                        axisLine={false}
                        width={100}
                    />
                    <Tooltip content={<ChartTooltip formatter={fmtKSafe} />} />
                    <Bar
                        dataKey="collected"
                        name="Collected"
                        fill={COLLECTED_COLOR}
                        radius={[0, 3, 3, 0]}
                        animationDuration={500}
                    />
                </BarChart>
            </ResponsiveContainer>

            <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                {chartData.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                        <span className="font-medium">{c.name}</span>
                        <div className="flex items-center gap-4 tabular-nums">
                            <span className="text-muted-foreground">{c.transactions} txn</span>
                            <span className="font-medium">{fmtK(c.collected)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
