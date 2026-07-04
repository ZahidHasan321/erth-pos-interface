import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Banknote, AlertTriangle, Scale } from "lucide-react";
import {
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { FilterBar, FilterField, Segmented } from "@/components/shared/FilterBar";
import { BrandSelect, RangeFilter } from "@/components/Filters";
import { useRegistersPage } from "@/hooks/useFinance";
import { getRangeBounds, type RangePreset } from "@/lib/date-range";
import { formatKwd, formatNum } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import type { RegisterRow } from "@/api/finance";

interface RegistersSearch {
  range?: RangePreset;
  brands?: string;
  status?: string;
}

export const Route = createFileRoute("/(main)/finance/registers/")({
  validateSearch: (s: Record<string, unknown>): RegistersSearch => ({
    range: (["today", "week", "month", "quarter", "all"] as const).includes(s.range as RangePreset)
      ? (s.range as RangePreset)
      : undefined,
    brands: typeof s.brands === "string" && s.brands ? s.brands : undefined,
    status: s.status === "open" || s.status === "closed" ? s.status : undefined,
  }),
  component: RegistersPage,
});

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
] as const;

function VarianceCell({ value }: { value: number | string | null }) {
  if (value == null) return <span className="text-muted-foreground/50">—</span>;
  const n = Number(value);
  if (n === 0) return <span className="text-[var(--status-ok)] tabular-nums">0.000</span>;
  return (
    <span className={"tabular-nums " + (n < 0 ? "text-[var(--status-bad)]" : "text-[var(--status-warn)]")}>
      {n > 0 ? "+" : "−"}{formatKwd(Math.abs(n))}
    </span>
  );
}

function RegistersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const patch = (next: Partial<RegistersSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const preset = (search.range ?? "month") as RangePreset;
  const brands = useMemo(() => (search.brands ? [search.brands] : []), [search.brands]);
  const range = useMemo(() => getRangeBounds(preset), [preset]);

  const { data, isLoading, isError, error, isFetching } = useRegistersPage(range, brands, search.status ?? null);

  const rows: RegisterRow[] = data?.data ?? [];
  const stats = data?.stats ?? null;

  return (
    <div>
      <FilterBar>
        <FilterField label="Brand">
          <BrandSelect
            value={search.brands ?? ""}
            onChange={(b) => patch({ brands: b || undefined })}
          />
        </FilterField>
        <FilterField label="Period">
          <RangeFilter value={preset} onChange={(p) => patch({ range: p === "month" ? undefined : p })} />
        </FilterField>
        <FilterField label="Status">
          <Segmented
            value={search.status ?? ""}
            onChange={(v) => patch({ status: v || undefined })}
            options={STATUS_OPTIONS}
          />
        </FilterField>
      </FilterBar>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatsCard icon={Banknote} value={stats.session_count} label="Sessions" color="blue" />
          <StatsCard icon={Banknote} value={Math.round(Number(stats.total_expected))} label="Expected cash (KWD)" color="green" />
          <StatsCard icon={Banknote} value={Math.round(Number(stats.total_counted))} label="Counted cash (KWD)" color="emerald" />
          <StatsCard icon={Scale} value={Math.round(Number(stats.total_variance))} label="Variance (KWD)" color="amber" dimOnZero />
        </div>
      )}

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load registers"} />
      ) : isLoading ? (
        <LoadingSkeleton count={5} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Banknote} message="No register sessions in this range" />
      ) : (
        <SectionCard bodyClassName="p-0">
          <div className={"overflow-x-auto " + (isFetching ? "opacity-60 transition-opacity" : "")}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">Date</th>
                  <th className="py-2.5 px-3 font-medium">Brand</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium text-right">Float</th>
                  <th className="py-2.5 px-3 font-medium text-right">Expected</th>
                  <th className="py-2.5 px-3 font-medium text-right">Counted</th>
                  <th className="py-2.5 px-3 font-medium text-right">Variance</th>
                  <th className="py-2.5 px-3 font-medium">Opened by</th>
                  <th className="py-2.5 px-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <Link to="/finance/registers/$sessionId" params={{ sessionId: String(r.id) }} className="font-medium hover:underline">
                        {formatDate(r.date)}
                      </Link>
                      <div className="text-xs text-muted-foreground tabular-nums">{formatNum(r.tx_count)} txns</div>
                    </td>
                    <td className="py-2.5 px-3"><BrandBadge brand={r.brand} /></td>
                    <td className="py-2.5 px-3">
                      {r.status === "open"
                        ? <StatusPill color="blue">Open</StatusPill>
                        : <StatusPill color="green">Closed</StatusPill>}
                      {r.reopened_at && <div className="text-xs text-muted-foreground mt-0.5">reopened</div>}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{formatKwd(r.opening_float)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatKwd(r.expected_cash)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {r.closing_counted_cash != null ? formatKwd(r.closing_counted_cash) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right"><VarianceCell value={r.variance} /></td>
                    <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[140px]">{r.opened_by_name ?? "—"}</td>
                    <td className="py-2.5 px-4 text-right">
                      <Link to="/finance/registers/$sessionId" params={{ sessionId: String(r.id) }} className="text-xs text-primary hover:underline">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
