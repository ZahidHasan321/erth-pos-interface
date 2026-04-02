import { Card } from "@repo/ui/card";
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { EodDailyData, EodCashierData } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

// ── Custom Tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, formatter }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-foreground text-background text-xs rounded-lg shadow-lg px-3 py-2 border border-border/10">
            <p className="font-medium mb-1">{label}</p>
            {payload.map((entry: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="opacity-70">{entry.name}:</span>
                    <span className="font-semibold tabular-nums">
                        {formatter ? formatter(entry.value) : entry.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ── Revenue Trend (Area Chart) ──────────────────────────────────────────────

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
        <Card className="p-5" style={{ animation: "cashier-number-count 500ms cubic-bezier(0.2, 0, 0, 1) 350ms both" }}>
            <h3 className="font-semibold text-sm mb-1">Revenue Trend</h3>
            <p className="text-xs text-muted-foreground mb-4">Daily collections over the selected period</p>

            <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="gradCollected" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#047857" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#047857" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#888" }}
                        tickLine={false}
                        axisLine={{ stroke: "#e5e5e5" }}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: "#888" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                        width={45}
                    />
                    <Tooltip content={<ChartTooltip formatter={fmtK} />} />
                    <Area
                        type="monotone"
                        dataKey="collected"
                        name="Collected"
                        stroke="#047857"
                        strokeWidth={2.5}
                        fill="url(#gradCollected)"
                        dot={data.length <= 14 ? { r: 3, fill: "#047857", strokeWidth: 0 } : false}
                        activeDot={{ r: 5, fill: "#047857", stroke: "#fff", strokeWidth: 2 }}
                        animationDuration={1200}
                        animationEasing="ease-out"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </Card>
    );
}

// ── Collections vs Refunds (Stacked Bar Chart) ─────────────────────────────

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
        <Card className="p-5" style={{ animation: "cashier-number-count 500ms cubic-bezier(0.2, 0, 0, 1) 450ms both" }}>
            <h3 className="font-semibold text-sm mb-1">Collections vs Refunds</h3>
            <p className="text-xs text-muted-foreground mb-4">Daily payment and refund comparison</p>

            <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#888" }}
                        tickLine={false}
                        axisLine={{ stroke: "#e5e5e5" }}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: "#888" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                        width={45}
                    />
                    <Tooltip content={<ChartTooltip formatter={fmtK} />} />
                    <Bar
                        dataKey="collected"
                        name="Collected"
                        fill="#047857"
                        radius={[4, 4, 0, 0]}
                        animationDuration={800}
                        animationEasing="ease-out"
                    />
                    {hasRefunds && (
                        <Bar
                            dataKey="refunded"
                            name="Refunded"
                            fill="#ef4444"
                            radius={[4, 4, 0, 0]}
                            animationDuration={800}
                            animationEasing="ease-out"
                        />
                    )}
                </BarChart>
            </ResponsiveContainer>
        </Card>
    );
}

// ── Cashier Leaderboard (Horizontal Bar Chart) ──────────────────────────────

const CASHIER_COLORS = ["#047857", "#0d9488", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#f59e0b", "#78716c"];

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
        <Card className="p-5" style={{ animation: "cashier-number-count 500ms cubic-bezier(0.2, 0, 0, 1) 500ms both" }}>
            <h3 className="font-semibold text-sm mb-1">Cashier Performance</h3>
            <p className="text-xs text-muted-foreground mb-4">Collections by cashier</p>

            <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 48 + 20)}>
                <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "#888" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                    />
                    <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 12, fill: "#1a1a1a", fontWeight: 500 }}
                        tickLine={false}
                        axisLine={false}
                        width={90}
                    />
                    <Tooltip content={<ChartTooltip formatter={fmtK} />} />
                    <Bar
                        dataKey="collected"
                        name="Collected"
                        radius={[0, 6, 6, 0]}
                        animationDuration={1000}
                        animationEasing="ease-out"
                    >
                        {chartData.map((_, i) => (
                            <Cell key={i} fill={CASHIER_COLORS[i % CASHIER_COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>

            {/* Summary below chart */}
            <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                {chartData.map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CASHIER_COLORS[i % CASHIER_COLORS.length] }} />
                            <span className="font-medium">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-4 tabular-nums">
                            <span className="text-muted-foreground">{c.transactions} txn</span>
                            <span className="font-semibold">{fmtK(c.collected)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
