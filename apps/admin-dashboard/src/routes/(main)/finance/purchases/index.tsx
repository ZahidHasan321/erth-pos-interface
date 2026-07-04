import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ShoppingCart, AlertTriangle, Wallet } from "lucide-react";
import {
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterBar, FilterField, Segmented } from "@/components/shared/FilterBar";
import { BrandSelect, RangeFilter } from "@/components/Filters";
import { Button } from "@repo/ui/button";
import { usePurchasesPage } from "@/hooks/useFinance";
import { getRangeBounds, type RangePreset } from "@/lib/date-range";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import type { PurchaseRow } from "@/api/finance";

interface PurchasesSearch {
  range?: RangePreset;
  brands?: string;
  status?: string;
  q?: string;
}

export const Route = createFileRoute("/(main)/finance/purchases/")({
  validateSearch: (s: Record<string, unknown>): PurchasesSearch => ({
    range: (["today", "week", "month", "quarter", "all"] as const).includes(s.range as RangePreset)
      ? (s.range as RangePreset)
      : undefined,
    brands: typeof s.brands === "string" && s.brands ? s.brands : undefined,
    status:
      s.status === "unpaid" || s.status === "partially_paid" || s.status === "paid"
        ? s.status
        : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
  }),
  component: PurchasesPage,
});

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partial" },
  { value: "paid", label: "Paid" },
] as const;

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") return <StatusPill color="green">Paid</StatusPill>;
  if (status === "partially_paid") return <StatusPill color="amber">Partial</StatusPill>;
  return <StatusPill color="red">Unpaid</StatusPill>;
}

function PurchasesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const patch = (next: Partial<PurchasesSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const preset = (search.range ?? "month") as RangePreset;
  const brands = useMemo(() => (search.brands ? [search.brands] : []), [search.brands]);
  const range = useMemo(() => getRangeBounds(preset), [preset]);

  const filters = useMemo(
    () => ({ brands, status: search.status ?? null, search: search.q ?? null, from: range.from, to: range.to }),
    [brands, search.status, search.q, range.from, range.to],
  );

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } =
    usePurchasesPage(filters);

  const rows: PurchaseRow[] = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const stats = data?.pages[0]?.stats ?? null;

  return (
    <div>
      <FilterBar
        search={
          <SearchInput
            value={search.q ?? ""}
            onChange={(v) => patch({ q: v || undefined })}
            placeholder="Item, supplier, purchase #…"
            className="sm:w-72"
          />
        }
      >
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
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatsCard icon={Wallet} value={Math.round(Number(stats.total_payable))} label="Total payable (KWD)" color="blue" />
          <StatsCard icon={Wallet} value={Math.round(Number(stats.total_paid))} label="Paid (KWD)" color="green" />
          <StatsCard icon={Wallet} value={Math.round(Number(stats.total_outstanding))} label="Outstanding (KWD)" color="amber" dimOnZero />
        </div>
      )}

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load purchases"} />
      ) : isLoading ? (
        <LoadingSkeleton count={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ShoppingCart} message="No purchases match these filters" />
      ) : (
        <SectionCard bodyClassName="p-0">
          <div className={"overflow-x-auto " + (isFetching && !isFetchingNextPage ? "opacity-60 transition-opacity" : "")}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">Date</th>
                  <th className="py-2.5 px-3 font-medium">Item</th>
                  <th className="py-2.5 px-3 font-medium">Brand</th>
                  <th className="py-2.5 px-3 font-medium">Supplier</th>
                  <th className="py-2.5 px-3 font-medium text-right">Total</th>
                  <th className="py-2.5 px-3 font-medium text-right">Paid</th>
                  <th className="py-2.5 px-3 font-medium text-right">Outstanding</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 hover:bg-muted/40 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <Link to="/finance/purchases/$purchaseId" params={{ purchaseId: String(p.id) }} className="font-medium hover:underline">{formatDate(p.created_at)}</Link>
                      <div className="text-xs text-muted-foreground">#{p.id}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="truncate max-w-[180px]">{p.item_name ?? `${titleCase(p.item_type)} #${p.item_id}`}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{formatNum(p.qty)} × {formatKwd(p.unit_cost)}</div>
                    </td>
                    <td className="py-2.5 px-3"><BrandBadge brand={p.brand} /></td>
                    <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[140px]">{p.supplier_name ?? "—"}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatKwd(p.total_cost)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{formatKwd(p.amount_paid)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {Number(p.outstanding) > 0 ? <span className="text-[var(--status-warn)]">{formatKwd(p.outstanding)}</span> : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="py-2.5 px-4"><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Showing {formatNum(rows.length)}{stats ? ` of ${formatNum(stats.count)}` : ""}</span>
            {hasNextPage && (
              <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
