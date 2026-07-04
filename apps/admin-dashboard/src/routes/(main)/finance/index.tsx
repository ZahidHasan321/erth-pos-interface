import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Receipt,
  Scale,
  AlertTriangle,
} from "lucide-react";
import {
  SectionCard,
  KpiCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { FilterBar, FilterField } from "@/components/shared/FilterBar";
import { BrandSelect, RangeFilter } from "@/components/Filters";
import { useFinanceSummary } from "@/hooks/useFinance";
import { getRangeBounds, type RangePreset, type RangeBounds } from "@/lib/date-range";
import { formatKwd, formatNum, titleCase } from "@/lib/format";

interface FinanceSearch {
  range?: RangePreset;
  brands?: string;
}

export const Route = createFileRoute("/(main)/finance/")({
  validateSearch: (s: Record<string, unknown>): FinanceSearch => ({
    range: (["today", "week", "month", "quarter", "all"] as const).includes(s.range as RangePreset)
      ? (s.range as RangePreset)
      : undefined,
    brands: typeof s.brands === "string" && s.brands ? s.brands : undefined,
  }),
  component: FinanceOverview,
});

function num(v: number | string | null | undefined): number {
  return v == null ? 0 : typeof v === "string" ? Number(v) : v;
}

function FinanceOverview() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const patch = (next: Partial<FinanceSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const preset = (search.range ?? "month") as RangePreset;
  const brands = useMemo(() => (search.brands ? [search.brands] : []), [search.brands]);
  const range: RangeBounds = useMemo(() => getRangeBounds(preset), [preset]);

  const { data, isLoading, isError, error, isFetching } = useFinanceSummary(range, brands);

  return (
    <div>
      <FilterBar>
        <FilterField label="Period">
          <RangeFilter value={preset} onChange={(p) => patch({ range: p === "month" ? undefined : p })} />
        </FilterField>
        <FilterField label="Brand">
          <BrandSelect value={search.brands ?? ""} onChange={(b) => patch({ brands: b || undefined })} />
        </FilterField>
      </FilterBar>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load finance summary"} />
      ) : isLoading || !data ? (
        <LoadingSkeleton count={4} />
      ) : (
        <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {/* ── Headline KPIs ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard
              icon={Wallet}
              label="Net revenue"
              value={formatKwd(data.totals.net)}
              subtitle={`${formatKwd(data.totals.collected)} in / ${formatKwd(data.totals.refunded)} refunded`}
            />
            <KpiCard
              icon={Receipt}
              label="Transactions"
              value={formatNum(data.totals.tx_count)}
              subtitle="Payments + refunds in range"
            />
            <KpiCard
              icon={ArrowUpCircle}
              label="Purchases settled"
              value={formatKwd(data.purchases.settled_amount)}
              subtitle={`${formatKwd(data.purchases.outstanding_now_amount)} payable now (${formatNum(data.purchases.outstanding_now_count)})`}
              tone={num(data.purchases.outstanding_now_amount) > 0 ? "warn" : null}
            />
            <KpiCard
              icon={Scale}
              label="Register variance"
              value={formatKwd(data.registers.total_variance)}
              subtitle={`${formatNum(data.registers.closed_count)} closed · ${formatNum(data.registers.open_count)} open`}
              tone={num(data.registers.total_variance) !== 0 ? (num(data.registers.total_variance) < 0 ? "bad" : "warn") : "ok"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ── Collected by payment method ─────────────────────────── */}
            <SectionCard title="Collected by payment method" bodyClassName="p-0">
              {data.by_method.length === 0 ? (
                <div className="p-4"><EmptyState message="No payments in range" /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 px-4 font-medium">Method</th>
                      <th className="py-2 px-3 font-medium text-right">Collected</th>
                      <th className="py-2 px-3 font-medium text-right">Refunded</th>
                      <th className="py-2 px-3 font-medium text-right">Net</th>
                      <th className="py-2 px-4 font-medium text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_method.map((m) => (
                      <tr key={m.payment_type} className="border-b border-border/60 last:border-0">
                        <td className="py-2 px-4">{titleCase(m.payment_type)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatKwd(m.collected)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                          {num(m.refunded) > 0 ? formatKwd(m.refunded) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium">{formatKwd(m.net)}</td>
                        <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">{formatNum(m.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30 font-medium">
                      <td className="py-2 px-4">Total</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatKwd(data.totals.collected)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatKwd(data.totals.refunded)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatKwd(data.totals.net)}</td>
                      <td className="py-2 px-4 text-right tabular-nums">{formatNum(data.totals.tx_count)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </SectionCard>

            {/* ── Cash drawer flow ────────────────────────────────────── */}
            <SectionCard title="Cash drawer movements" bodyClassName="p-0">
              <div className="grid grid-cols-2 gap-3 p-4 pb-0">
                <div className="rounded-md border border-border px-3 py-2.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ArrowDownCircle className="w-4 h-4 text-[var(--status-ok)]" />
                    <span className="text-xs">Cash in</span>
                  </div>
                  <p className="text-xl font-semibold tabular-nums mt-1">{formatKwd(data.cash_flow.cash_in)}</p>
                </div>
                <div className="rounded-md border border-border px-3 py-2.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ArrowUpCircle className="w-4 h-4 text-[var(--status-warn)]" />
                    <span className="text-xs">Cash out</span>
                  </div>
                  <p className="text-xl font-semibold tabular-nums mt-1">{formatKwd(data.cash_flow.cash_out)}</p>
                </div>
              </div>
              {data.cash_flow.by_category.length === 0 ? (
                <div className="p-4"><EmptyState message="No drawer movements in range" /></div>
              ) : (
                <table className="w-full text-sm mt-2">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 px-4 font-medium">Reason</th>
                      <th className="py-2 px-3 font-medium">Direction</th>
                      <th className="py-2 px-3 font-medium text-right">Amount</th>
                      <th className="py-2 px-4 font-medium text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cash_flow.by_category.map((c, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="py-2 px-4">{titleCase(c.reason_category)}</td>
                        <td className="py-2 px-3">
                          <span className={c.type === "cash_in" ? "text-[var(--status-ok)]" : "text-[var(--status-warn)]"}>
                            {c.type === "cash_in" ? "In" : "Out"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatKwd(c.amount)}</td>
                        <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">{formatNum(c.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </SectionCard>

            {/* ── Purchases (money out) ───────────────────────────────── */}
            <SectionCard title="Purchases (money out)">
              <div className="space-y-2.5 text-sm">
                <Row label="Payables created" value={`${formatKwd(data.purchases.payables_created_amount)} (${formatNum(data.purchases.payables_created_count)})`} />
                <Row label="Settled in range" value={formatKwd(data.purchases.settled_amount)} />
                <Row label="Outstanding now" value={`${formatKwd(data.purchases.outstanding_now_amount)} (${formatNum(data.purchases.outstanding_now_count)})`} warn={num(data.purchases.outstanding_now_amount) > 0} />
                {data.purchases.settled_by_method.length > 0 && (
                  <div className="pt-2 mt-1 border-t border-border/60 space-y-1.5">
                    <p className="text-xs text-muted-foreground">Settled by method</p>
                    {data.purchases.settled_by_method.map((m) => (
                      <div key={m.payment_type} className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Banknote className="w-3.5 h-3.5" />{titleCase(m.payment_type)}
                        </span>
                        <span className="tabular-nums">{formatKwd(m.amount)} <span className="text-muted-foreground text-xs">· {formatNum(m.count)}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── Registers (EOD) ─────────────────────────────────────── */}
            <SectionCard title="Registers (EOD)">
              <div className="space-y-2.5 text-sm">
                <Row label="Open drawers" value={formatNum(data.registers.open_count)} />
                <Row label="Closed drawers" value={formatNum(data.registers.closed_count)} />
                <Row label="Total variance" value={formatKwd(data.registers.total_variance)} warn={num(data.registers.total_variance) !== 0} />
                <div className="pt-2 mt-1 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatNum(data.registers.over_count)} over · {formatNum(data.registers.short_count)} short</span>
                  <span>Variance = counted − expected</span>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={"tabular-nums font-medium " + (warn ? "text-[var(--status-warn)]" : "")}>{value}</span>
    </div>
  );
}
