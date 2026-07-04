import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  LayoutDashboard,
  Wallet,
  ShoppingBag,
  Receipt,
  Factory,
  Timer,
  BadgeCheck,
  AlertTriangle,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  KpiCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { FilterBar, FilterField } from "@/components/shared/FilterBar";
import { BrandSelect, RangeFilter } from "@/components/Filters";
import { useDashboardSummary, useCustomerBrandMatrix } from "@/hooks/useAdmin";
import { getRangeBounds, type RangePreset } from "@/lib/date-range";
import { formatKwd, formatNum, formatDuration, titleCase } from "@/lib/format";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import type { RangeBounds } from "@/lib/date-range";

interface DashboardSearch {
  range?: RangePreset;
  brands?: string;
}

export const Route = createFileRoute("/(main)/")({
  validateSearch: (s: Record<string, unknown>): DashboardSearch => ({
    range: (["today", "week", "month", "quarter", "all"] as const).includes(s.range as RangePreset)
      ? (s.range as RangePreset)
      : undefined,
    brands: typeof s.brands === "string" && s.brands ? s.brands : undefined,
  }),
  component: DashboardPage,
});

// Theme-aware chart palette (resolves to light/dark via CSS custom properties).
const COLORS = [
  "var(--status-info)",
  "var(--status-ok)",
  "var(--status-warn)",
  "var(--status-bad)",
  "var(--primary)",
  "var(--muted-foreground)",
];
const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11 };
const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 12,
  color: "var(--foreground)",
};
const GRID = "color-mix(in oklch, var(--border) 60%, transparent)";

function fmtDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", day: "numeric" });
}

function DashboardPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const patch = (next: Partial<DashboardSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const preset = (search.range ?? "month") as RangePreset;
  const brands = useMemo(() => (search.brands ? [search.brands] : []), [search.brands]);
  const range: RangeBounds = useMemo(() => getRangeBounds(preset), [preset]);

  const { data, isLoading, isError, error, isFetching } = useDashboardSummary(range, brands);
  const matrix = useCustomerBrandMatrix(range);

  const brandParam = search.brands;

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title="Overview"
        subtitle="Cross-brand analytics across ERTH, SAKKBA and QASS"
      />

      <FilterBar>
        <FilterField label="Period">
          <RangeFilter value={preset} onChange={(p) => patch({ range: p === "month" ? undefined : p })} />
        </FilterField>
        <FilterField label="Brand">
          <BrandSelect value={search.brands ?? ""} onChange={(b) => patch({ brands: b || undefined })} />
        </FilterField>
      </FilterBar>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load dashboard"} />
      ) : isLoading || !data ? (
        <LoadingSkeleton count={4} />
      ) : (
        <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {/* ── KPI row ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard icon={Wallet} label="Net revenue" value={formatKwd(data.kpis.net_revenue)}
              subtitle={`${formatKwd(data.kpis.collected)} in / ${formatKwd(data.kpis.refunded)} refunded`} />
            <KpiCard icon={ShoppingBag} label="Orders" value={formatNum(data.kpis.orders_count)}
              subtitle={`${formatNum(data.kpis.work_count)} work · ${formatNum(data.kpis.sales_count)} sales · ${formatNum(data.kpis.alteration_count)} alt`} />
            <KpiCard icon={Receipt} label="Outstanding AR" value={formatKwd(data.kpis.outstanding_ar)}
              tone={Number(data.kpis.outstanding_ar) > 0 ? "warn" : "ok"} subtitle="All-time balance" />
            <KpiCard icon={Factory} label="In production" value={formatNum(data.kpis.garments_in_production)}
              subtitle="Garments active now" />
            <KpiCard icon={BadgeCheck} label="QC pass rate"
              value={data.kpis.qc_pass_rate == null ? "—" : `${data.kpis.qc_pass_rate}%`}
              tone={data.kpis.qc_pass_rate == null ? null : data.kpis.qc_pass_rate >= 90 ? "ok" : data.kpis.qc_pass_rate >= 75 ? "warn" : "bad"} />
            <KpiCard icon={Timer} label="Avg turnaround"
              value={data.kpis.avg_turnaround_days == null ? "—" : `${data.kpis.avg_turnaround_days}d`}
              subtitle="Order to completion" />
            <KpiCard icon={ShoppingBag} label="Gross sales" value={formatKwd(data.kpis.gross_sales)}
              subtitle="Confirmed order value" />
            <KpiCard icon={AlertTriangle} label="Cancelled" value={formatNum(data.kpis.cancelled_count)}
              tone={data.kpis.cancelled_count > 0 ? "warn" : null} />
          </div>

          {/* ── Charts ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <SectionCard title="Revenue trend">
              {data.revenue_trend.length === 0 ? <EmptyState message="No payments in range" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.revenue_trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="day" tickFormatter={fmtDay} {...AXIS} tickLine={false} />
                    <YAxis {...AXIS} tickLine={false} width={48} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => fmtDay(String(l))}
                      formatter={(v, n) => [formatKwd(Number(v)), titleCase(String(n))]} />
                    <Line type="monotone" dataKey="collected" stroke={COLORS[1]} strokeWidth={2} dot={false} name="collected" />
                    <Line type="monotone" dataKey="refunded" stroke={COLORS[3]} strokeWidth={2} dot={false} name="refunded" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title="Orders by brand">
              {data.orders_by_brand.length === 0 ? <EmptyState message="No orders in range" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.orders_by_brand} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="brand" {...AXIS} tickLine={false} />
                    <YAxis {...AXIS} tickLine={false} width={40} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) =>
                      [n === "gross_sales" ? formatKwd(Number(v)) : formatNum(Number(v)), titleCase(String(n))]} />
                    <Bar dataKey="count" name="orders" radius={[3, 3, 0, 0]}>
                      {data.orders_by_brand.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title="Production funnel (now)">
              {data.production_funnel.length === 0 ? <EmptyState message="Nothing in production" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart layout="vertical" data={data.production_funnel} margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                    <XAxis type="number" {...AXIS} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="stage" width={110} {...AXIS} tickLine={false}
                      tickFormatter={(s: string) => (PIECE_STAGE_LABELS as Record<string, string>)[s] ?? titleCase(s)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [formatNum(Number(v)), "garments"]}
                      labelFormatter={(s) => (PIECE_STAGE_LABELS as Record<string, string>)[String(s)] ?? titleCase(String(s))} />
                    <Bar dataKey="count" fill={COLORS[0]} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title="QC pass / fail">
              {data.qc_trend.length === 0 ? <EmptyState message="No QC attempts in range" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.qc_trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="day" tickFormatter={fmtDay} {...AXIS} tickLine={false} />
                    <YAxis {...AXIS} tickLine={false} width={40} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => fmtDay(String(l))}
                      formatter={(v, n) => [formatNum(Number(v)), titleCase(String(n))]} />
                    <Bar dataKey="pass" stackId="qc" fill={COLORS[1]} name="pass" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="fail" stackId="qc" fill={COLORS[3]} name="fail" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title="Order type split">
              {data.order_type_split.length === 0 ? <EmptyState message="No orders in range" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.order_type_split} dataKey="count" nameKey="type" cx="50%" cy="50%"
                      innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {data.order_type_split.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [formatNum(Number(v)), titleCase(String(n))]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {data.order_type_split.map((t, i) => (
                  <span key={t.type} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {titleCase(t.type)} · <span className="tabular-nums text-foreground">{formatNum(t.count)}</span>
                  </span>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Avg time per terminal">
              {data.terminal_timing.length === 0 ? <EmptyState message="No completed sessions in range" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.terminal_timing} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="stage" {...AXIS} tickLine={false} tickFormatter={titleCase} />
                    <YAxis {...AXIS} tickLine={false} width={48} tickFormatter={(s: number) => formatDuration(s)} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => titleCase(String(l))}
                      formatter={(v, _n, p) => [`${formatDuration(Number(v))} · ${formatNum((p as { payload?: { piece_count?: number } })?.payload?.piece_count)} pcs`, "avg"]} />
                    <Bar dataKey="avg_seconds" fill={COLORS[4]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>

          {/* ── Breakdowns ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Top customers"
              action={<Link to="/orders" search={brandParam ? { brands: brandParam } : undefined}
                className="text-xs text-muted-foreground hover:text-foreground">View orders →</Link>}>
              {data.top_customers.length === 0 ? <EmptyState message="No customers in range" /> : (
                <div className="divide-y divide-border -my-1">
                  {data.top_customers.map((c) => (
                    <div key={c.customer_id} className="flex items-center justify-between py-2 text-sm">
                      <span className="truncate">{c.name ?? `Customer #${c.customer_id}`}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground tabular-nums">{formatNum(c.orders)} ord</span>
                        <span className="tabular-nums font-medium">{formatKwd(c.spend)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Fabric consumption by brand">
              {!data.fabric_by_brand || data.fabric_by_brand.length === 0 ? (
                <EmptyState message="No fabric consumed in range" />
              ) : (
                <div className="divide-y divide-border -my-1">
                  {data.fabric_by_brand.map((f) => (
                    <div key={f.brand} className="flex items-center justify-between py-2 text-sm">
                      <BrandBadge brand={f.brand} />
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground tabular-nums">{formatNum(f.count)} orders</span>
                        <span className="tabular-nums font-medium">{formatNum(f.total)} m</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Customer × brand matrix ─────────────────────────────── */}
          <SectionCard title="Customer × brand" className="mt-4">
            {matrix.isLoading ? <LoadingSkeleton count={2} /> :
              !matrix.data || matrix.data.length === 0 ? <EmptyState message="No cross-brand data in range" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-4 font-medium">Customer</th>
                      {["ERTH", "SAKKBA", "QASS"].map((b) => <th key={b} className="py-2 px-3 font-medium text-right">{b}</th>)}
                      <th className="py-2 pl-3 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.data.map((row) => (
                      <tr key={row.customer_id} className="border-b border-border/60">
                        <td className="py-2 pr-4 truncate max-w-[220px]">{row.name ?? `#${row.customer_id}`}</td>
                        {["ERTH", "SAKKBA", "QASS"].map((b) => {
                          const cell = row.brands?.[b];
                          return (
                            <td key={b} className="py-2 px-3 text-right tabular-nums">
                              {cell ? <span title={`${formatNum(cell.orders)} orders`}>{formatKwd(cell.spend)}</span>
                                : <span className="text-muted-foreground/40">—</span>}
                            </td>
                          );
                        })}
                        <td className="py-2 pl-3 text-right tabular-nums font-medium">{formatKwd(row.total_spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
