import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Table2, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { SearchInput } from "@/components/shared/SearchInput";
import {
  FilterBar,
  FilterField,
  Segmented,
} from "@/components/shared/FilterBar";
import { BrandSelect } from "@/components/Filters";
import { Button } from "@repo/ui/button";
import { useOrdersPage } from "@/hooks/useAdmin";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import { formatDate, getDeliveryUrgency } from "@/lib/utils";
import type { OrderRow } from "@/api/admin";

interface OrdersSearch {
  brands?: string;
  type?: string;
  phase?: string;
  q?: string;
}

export const Route = createFileRoute("/(main)/orders/")({
  validateSearch: (s: Record<string, unknown>): OrdersSearch => ({
    brands: typeof s.brands === "string" && s.brands ? s.brands : undefined,
    type: typeof s.type === "string" && s.type ? s.type : undefined,
    phase: typeof s.phase === "string" && s.phase ? s.phase : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
  }),
  component: OrdersPage,
});

const TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "WORK", label: "Work" },
  { value: "SALES", label: "Sales" },
  { value: "ALTERATION", label: "Alteration" },
] as const;

const PHASE_OPTIONS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
] as const;

function OrdersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const brands = useMemo(() => (search.brands ? [search.brands] : []), [search.brands]);

  const filters = useMemo(
    () => ({
      brands,
      orderType: search.type ?? null,
      phase: search.phase ?? null,
      search: search.q ?? null,
      from: null,
      to: null,
    }),
    [brands, search.type, search.phase, search.q],
  );

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } =
    useOrdersPage(filters);

  const patch = (next: Partial<OrdersSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const rows: OrderRow[] = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const stats = data?.pages[0]?.stats ?? null;

  return (
    <div>
      <PageHeader icon={Table2} title="Order explorer" subtitle="Every order across all brands" />

      {/* Filters */}
      <FilterBar
        search={
          <SearchInput
            value={search.q ?? ""}
            onChange={(v) => patch({ q: v || undefined })}
            placeholder="Order #, invoice, name, phone…"
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
        <FilterField label="Type">
          <Segmented
            value={search.type ?? ""}
            onChange={(v) => patch({ type: v || undefined })}
            options={TYPE_OPTIONS}
          />
        </FilterField>
        <FilterField label="Phase">
          <Segmented
            value={search.phase ?? ""}
            onChange={(v) => patch({ phase: v || undefined })}
            options={PHASE_OPTIONS}
          />
        </FilterField>
      </FilterBar>

      {/* Stats (page 1 only) */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatsCard icon={Table2} value={stats.total_orders} label="Orders" color="blue" />
          <StatsCard icon={Table2} value={Math.round(Number(stats.total_value))} label="Total value (KWD)" color="green" />
          <StatsCard icon={Table2} value={Math.round(Number(stats.total_outstanding))} label="Outstanding (KWD)" color="amber" dimOnZero />
        </div>
      )}

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load orders"} />
      ) : isLoading ? (
        <LoadingSkeleton count={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Table2} message="No orders match these filters" />
      ) : (
        <SectionCard bodyClassName="p-0">
          <div className={"overflow-x-auto " + (isFetching && !isFetchingNextPage ? "opacity-60 transition-opacity" : "")}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">Order</th>
                  <th className="py-2.5 px-3 font-medium">Customer</th>
                  <th className="py-2.5 px-3 font-medium">Brand</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Garments</th>
                  <th className="py-2.5 px-3 font-medium text-right">Total</th>
                  <th className="py-2.5 px-3 font-medium text-right">Outstanding</th>
                  <th className="py-2.5 px-3 font-medium">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => <OrderRowView key={o.id} o={o} />)}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Showing {formatNum(rows.length)}{stats ? ` of ${formatNum(stats.total_orders)}` : ""}</span>
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

function OrderRowView({ o }: { o: OrderRow }) {
  const outstanding = Math.max(Number(o.order_total ?? 0) - Number(o.paid ?? 0), 0);
  const urgency = getDeliveryUrgency(o.delivery_date);
  const garmentBits = [
    o.brova_count ? `${o.brova_count}B` : null,
    o.final_count ? `${o.final_count}F` : null,
    o.alteration_count ? `${o.alteration_count}A` : null,
  ].filter(Boolean).join(" ");

  return (
    <tr className="border-b border-border/60 hover:bg-muted/40 transition-colors">
      <td className="py-2.5 px-4">
        <Link to="/orders/$orderId" params={{ orderId: String(o.id) }} className="font-medium hover:underline">#{o.id}</Link>
        {o.invoice_number != null && <div className="text-xs text-muted-foreground tabular-nums">INV-{o.invoice_number}</div>}
      </td>
      <td className="py-2.5 px-3">
        <div className="truncate max-w-[160px]">{o.c_name ?? "—"}</div>
        {o.c_phone && <div className="text-xs text-muted-foreground tabular-nums">{o.c_phone}</div>}
      </td>
      <td className="py-2.5 px-3"><BrandBadge brand={o.brand} /></td>
      <td className="py-2.5 px-3 text-muted-foreground">{titleCase(o.order_type)}</td>
      <td className="py-2.5 px-3">
        {o.checkout_status === "cancelled"
          ? <StatusPill color="red">Cancelled</StatusPill>
          : <span className="text-muted-foreground">{o.status_label ?? titleCase(o.order_phase ?? "—")}</span>}
      </td>
      <td className="py-2.5 px-3 tabular-nums text-muted-foreground">{garmentBits || (o.garments_count ?? 0)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums">{formatKwd(o.order_total)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums">
        {outstanding > 0 ? <span className="text-[var(--status-warn)]">{formatKwd(outstanding)}</span> : <span className="text-muted-foreground/50">—</span>}
      </td>
      <td className="py-2.5 px-3">
        {o.delivery_date ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">{formatDate(o.delivery_date)}</span>
            {urgency.label && urgency.status !== "normal" && (
              <span className={"text-xs " + (urgency.status === "overdue" ? "text-[var(--status-bad)]" : "text-[var(--status-warn)]")}>{urgency.label}</span>
            )}
          </span>
        ) : <span className="text-muted-foreground/50">—</span>}
        {o.home_delivery && <span className="ml-1 text-xs text-muted-foreground">· Home</span>}
      </td>
    </tr>
  );
}
