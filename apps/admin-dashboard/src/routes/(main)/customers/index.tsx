import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Contact, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { StatusPill } from "@/components/shared/StatusPill";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterBar, FilterField, Segmented } from "@/components/shared/FilterBar";
import { Button } from "@repo/ui/button";
import { useCustomersPage } from "@/hooks/useAdmin";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import type { CustomerRow } from "@/api/admin";

interface CustomersSearch {
  q?: string;
  acct?: string;
}

export const Route = createFileRoute("/(main)/customers/")({
  validateSearch: (s: Record<string, unknown>): CustomersSearch => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    acct: s.acct === "Primary" || s.acct === "Secondary" ? s.acct : undefined,
  }),
  component: CustomersPage,
});

const ACCT_OPTIONS = [
  { value: "", label: "All" },
  { value: "Primary", label: "Primary" },
  { value: "Secondary", label: "Secondary" },
] as const;

function CustomersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const patch = (next: Partial<CustomersSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const filters = useMemo(
    () => ({ accountType: search.acct ?? null, search: search.q ?? null }),
    [search.acct, search.q],
  );
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } =
    useCustomersPage(filters);

  const rows: CustomerRow[] = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const stats = data?.pages[0]?.stats ?? null;

  return (
    <div>
      <PageHeader icon={Contact} title="Customers" subtitle="Every customer across all brands" />

      <FilterBar
        search={
          <SearchInput
            value={search.q ?? ""}
            onChange={(v) => patch({ q: v || undefined })}
            placeholder="Name, Arabic name, phone…"
            className="sm:w-72"
          />
        }
      >
        <FilterField label="Account">
          <Segmented
            value={search.acct ?? ""}
            onChange={(v) => patch({ acct: v || undefined })}
            options={ACCT_OPTIONS}
          />
        </FilterField>
      </FilterBar>

      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatsCard icon={Contact} value={stats.total_customers} label="Customers" color="blue" />
          <StatsCard icon={Contact} value={stats.primary_count} label="Primary" color="green" />
          <StatsCard icon={Contact} value={stats.secondary_count} label="Secondary" color="purple" dimOnZero />
        </div>
      )}

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load customers"} />
      ) : isLoading ? (
        <LoadingSkeleton count={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Contact} message="No customers match" />
      ) : (
        <SectionCard bodyClassName="p-0">
          <div className={"overflow-x-auto " + (isFetching && !isFetchingNextPage ? "opacity-60 transition-opacity" : "")}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">Customer</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Phone</th>
                  <th className="py-2.5 px-3 font-medium text-right">Orders</th>
                  <th className="py-2.5 px-3 font-medium text-right">Spend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => <CustomerRowView key={c.id} c={c} />)}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Showing {formatNum(rows.length)}{stats ? ` of ${formatNum(stats.total_customers)}` : ""}</span>
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

function CustomerRowView({ c }: { c: CustomerRow }) {
  return (
    <tr className="border-b border-border/60 hover:bg-muted/40 transition-colors">
      <td className="py-2.5 px-4">
        <Link to="/customers/$customerId" params={{ customerId: String(c.id) }} className="font-medium hover:underline">
          {c.name}
        </Link>
        <div className="text-xs text-muted-foreground">
          {c.arabic_name ? <span dir="rtl">{c.arabic_name}</span> : null}
          {c.account_type === "Secondary" && c.primary_name ? (
            <span>{c.arabic_name ? " · " : ""}{c.relation ? `${titleCase(c.relation)} of ` : "of "}{c.primary_name}</span>
          ) : null}
        </div>
      </td>
      <td className="py-2.5 px-3">
        {c.account_type === "Secondary"
          ? <StatusPill color="purple">Secondary</StatusPill>
          : <span className="text-muted-foreground">Primary</span>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground tabular-nums">{c.phone ?? "—"}</td>
      <td className="py-2.5 px-3 text-right tabular-nums">{formatNum(c.orders_count)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums">{formatKwd(c.total_spend)}</td>
    </tr>
  );
}
