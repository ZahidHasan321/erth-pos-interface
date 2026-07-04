import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Receipt, AlertTriangle, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import {
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { SearchInput } from "@/components/shared/SearchInput";
import {
  FilterBar,
  FilterField,
  Segmented,
  FilterSelect,
} from "@/components/shared/FilterBar";
import { BrandSelect, RangeFilter } from "@/components/Filters";
import { Button } from "@repo/ui/button";
import { useTransactionsPage } from "@/hooks/useFinance";
import { getRangeBounds, type RangePreset } from "@/lib/date-range";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import { formatDateTime } from "@/lib/utils";
import type { TransactionRow } from "@/api/finance";

interface TransactionsSearch {
  range?: RangePreset;
  brands?: string;
  txn?: string;
  method?: string;
  q?: string;
}

export const Route = createFileRoute("/(main)/finance/transactions")({
  validateSearch: (s: Record<string, unknown>): TransactionsSearch => ({
    range: (["today", "week", "month", "quarter", "all"] as const).includes(s.range as RangePreset)
      ? (s.range as RangePreset)
      : undefined,
    brands: typeof s.brands === "string" && s.brands ? s.brands : undefined,
    txn: s.txn === "payment" || s.txn === "refund" ? s.txn : undefined,
    method: typeof s.method === "string" && s.method ? s.method : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
  }),
  component: TransactionsPage,
});

const TXN_OPTIONS = [
  { value: "", label: "All" },
  { value: "payment", label: "Payments" },
  { value: "refund", label: "Refunds" },
] as const;

const METHOD_OPTIONS = ["cash", "knet", "link_payment", "installments", "others"].map((p) => ({
  value: p,
  label: titleCase(p),
}));

function TransactionsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const patch = (next: Partial<TransactionsSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const preset = (search.range ?? "month") as RangePreset;
  const brands = useMemo(() => (search.brands ? [search.brands] : []), [search.brands]);
  const range = useMemo(() => getRangeBounds(preset), [preset]);

  const filters = useMemo(
    () => ({
      brands,
      txnType: search.txn ?? null,
      paymentType: search.method ?? null,
      search: search.q ?? null,
      from: range.from,
      to: range.to,
    }),
    [brands, search.txn, search.method, search.q, range.from, range.to],
  );

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } =
    useTransactionsPage(filters);

  const rows: TransactionRow[] = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const stats = data?.pages[0]?.stats ?? null;

  return (
    <div>
      <FilterBar
        search={
          <SearchInput
            value={search.q ?? ""}
            onChange={(v) => patch({ q: v || undefined })}
            placeholder="Order #, invoice, ref, cashier…"
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
        <FilterField label="Type">
          <Segmented
            value={search.txn ?? ""}
            onChange={(v) => patch({ txn: v || undefined })}
            options={TXN_OPTIONS}
          />
        </FilterField>
        <FilterField label="Method">
          <FilterSelect
            value={search.method ?? ""}
            onChange={(v) => patch({ method: v || undefined })}
            options={METHOD_OPTIONS}
            allLabel="All methods"
            className="w-40"
          />
        </FilterField>
      </FilterBar>

      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatsCard icon={ArrowDownCircle} value={Math.round(Number(stats.total_in))} label="Collected (KWD)" color="green" />
          <StatsCard icon={ArrowUpCircle} value={Math.round(Number(stats.total_out))} label="Refunded (KWD)" color="amber" dimOnZero />
          <StatsCard icon={Receipt} value={stats.count} label="Transactions" color="blue" />
        </div>
      )}

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load transactions"} />
      ) : isLoading ? (
        <LoadingSkeleton count={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Receipt} message="No transactions match these filters" />
      ) : (
        <SectionCard bodyClassName="p-0">
          <div className={"overflow-x-auto " + (isFetching && !isFetchingNextPage ? "opacity-60 transition-opacity" : "")}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">When</th>
                  <th className="py-2.5 px-3 font-medium">Order</th>
                  <th className="py-2.5 px-3 font-medium">Brand</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Method</th>
                  <th className="py-2.5 px-3 font-medium">Cashier</th>
                  <th className="py-2.5 px-3 font-medium">Drawer</th>
                  <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => <TxnRowView key={t.id} t={t} />)}
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

function TxnRowView({ t }: { t: TransactionRow }) {
  const isRefund = t.transaction_type === "refund";
  const amount = Math.abs(Number(t.amount));

  return (
    <tr className="border-b border-border/60 hover:bg-muted/40 transition-colors">
      <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">{formatDateTime(t.created_at)}</td>
      <td className="py-2.5 px-3">
        <Link to="/orders/$orderId" params={{ orderId: String(t.order_id) }} className="font-medium hover:underline">#{t.order_id}</Link>
        {t.invoice_number != null && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">INV-{t.invoice_number}</span>}
        {t.customer_name && <div className="text-xs text-muted-foreground truncate max-w-[160px]">{t.customer_name}</div>}
      </td>
      <td className="py-2.5 px-3"><BrandBadge brand={t.brand} /></td>
      <td className="py-2.5 px-3">
        <span className={"inline-flex items-center gap-1 " + (isRefund ? "text-[var(--status-warn)]" : "text-[var(--status-ok)]")}>
          {isRefund ? "Refund" : "Payment"}
        </span>
        {isRefund && t.refund_reason && <div className="text-xs text-muted-foreground truncate max-w-[160px]">{t.refund_reason}</div>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground">
        {titleCase(t.payment_type ?? "—")}
        {t.payment_ref_no && <div className="text-xs text-muted-foreground/70 tabular-nums truncate max-w-[120px]">{t.payment_ref_no}</div>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[140px]">{t.cashier_name ?? "—"}</td>
      <td className="py-2.5 px-3 tabular-nums">
        {t.register_session_id != null ? (
          <Link to="/finance/registers/$sessionId" params={{ sessionId: String(t.register_session_id) }} className="text-muted-foreground hover:underline">#{t.register_session_id}</Link>
        ) : <span className="text-muted-foreground/50">—</span>}
      </td>
      <td className="py-2.5 px-4 text-right tabular-nums font-medium">
        <span className={isRefund ? "text-[var(--status-warn)]" : ""}>{isRefund ? "−" : ""}{formatKwd(amount)}</span>
      </td>
    </tr>
  );
}
