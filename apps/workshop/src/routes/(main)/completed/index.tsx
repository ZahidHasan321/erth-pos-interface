import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCompletedOrders } from "@/hooks/useWorkshopGarments";
import { Pagination } from "@/components/shared/Pagination";
import { SearchInput } from "@/components/shared/SearchInput";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { PageHeader, MetadataChip, LoadingSkeleton, GarmentTypeBadgeCompact, EmptyState } from "@/components/shared/PageShell";
import { Table, TableContainer, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/shared/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, clickableProps, formatDate } from "@/lib/utils";
import type { CompletedOrderGroup } from "@/api/garments";
import {
  CheckCircle2,
  ChevronDown,
  Package,
  Clock,
  Home,
} from "lucide-react";

// URL holds the search text so a filtered view is bookmarkable. Empty = bare URL.
type CompletedSearch = { q?: string };

export const Route = createFileRoute("/(main)/completed/")({
  component: CompletedOrdersPage,
  head: () => ({ meta: [{ title: "Completed Orders" }] }),
  validateSearch: (raw: Record<string, unknown>): CompletedSearch => ({
    q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
  }),
});

const PAGE_SIZE = 20;

/** Page-local garment summary — the RPC returns only garment_type, so we
 *  don't share lib/utils garmentSummary which expects full WorkshopGarment. */
function summarizeGarments(garments: CompletedOrderGroup["garments"]): string {
  const b = garments.filter((g) => g.garment_type === "brova").length;
  const f = garments.filter((g) => g.garment_type === "final").length;
  const parts: string[] = [];
  if (b) parts.push(`${b} Brova`);
  if (f) parts.push(`${f} Final${f > 1 ? "s" : ""}`);
  return parts.join(" + ") || `${garments.length} garment${garments.length !== 1 ? "s" : ""}`;
}

// ── Order Card ─────────────────────────────────────────────────

function CompletedOrderCard({ group, onClick }: { group: CompletedOrderGroup; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      {...clickableProps(onClick)}
      className={cn(
        "bg-card border border-border rounded-md cursor-pointer transition-colors",
        "hover:bg-muted/20 active:bg-muted/30",
      )}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-mono text-base tabular-nums">#{group.order_id}</span>
            <span className="text-base truncate">{group.customer_name ?? "—"}</span>
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
            {group.express && <ExpressBadge />}
            {group.home_delivery && (
              <MetadataChip icon={Home} variant="indigo">Delivery</MetadataChip>
            )}
          </div>

          <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground/40 shrink-0" />
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 mt-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {group.invoice_number && <span className="tabular-nums">INV-{group.invoice_number}</span>}
            <span className="flex items-center gap-0.5">
              <Package className="w-3 h-3" /> {summarizeGarments(group.garments)}
            </span>
          </div>

          {group.delivery_date && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              Delivered: {formatDate(group.delivery_date)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Table (desktop) ───────────────────────────────────────────

function CompletedOrderTable({
  groups,
  onOrderClick,
}: {
  groups: CompletedOrderGroup[];
  onOrderClick: (orderId: number) => void;
}) {
  return (
    <TableContainer>
      <Table className="w-full">
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Garments</TableHead>
            <TableHead>Delivery</TableHead>
            <TableHead className="text-right">Tags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const brovaCount = group.garments.filter((g) => g.garment_type === "brova").length;
            const finalCount = group.garments.filter((g) => g.garment_type === "final").length;
            return (
            <TableRow
              key={group.order_id}
              onClick={() => onOrderClick(group.order_id)}
              {...clickableProps(() => onOrderClick(group.order_id))}
              className="cursor-pointer hover:bg-muted/30"
            >
              <TableCell className="font-mono text-base tabular-nums">
                <div className="flex flex-col gap-0.5">
                  <span>#{group.order_id}</span>
                  {group.invoice_number && (
                    <span className="text-xs text-muted-foreground">INV-{group.invoice_number}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-base">
                <div className="flex flex-col gap-0.5">
                  <span>{group.customer_name ?? "—"}</span>
                  {group.customer_mobile && (
                    <span className="text-xs font-mono text-muted-foreground tabular-nums">{group.customer_mobile}</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 flex-wrap">
                  {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {brovaCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs">
                      <GarmentTypeBadgeCompact type="brova" />
                      <span className="tabular-nums text-muted-foreground">×{brovaCount}</span>
                    </span>
                  )}
                  {finalCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs">
                      <GarmentTypeBadgeCompact type="final" />
                      <span className="tabular-nums text-muted-foreground">×{finalCount}</span>
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {group.delivery_date ? formatDate(group.delivery_date) : "—"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center gap-1.5 justify-end">
                  {group.express && <ExpressBadge />}
                  {group.home_delivery && <MetadataChip icon={Home} variant="indigo">Delivery</MetadataChip>}
                </div>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ── Page ───────────────────────────────────────────────────────

function CompletedOrdersPage() {
  const [page, setPage] = useState(1);
  const search = Route.useSearch().q ?? "";
  const routeNavigate = Route.useNavigate();
  // A new search must restart pagination — the server-side narrowed set has its
  // own page boundaries. Reset here at the source rather than via an effect.
  const setSearch = (value: string) => {
    setPage(1);
    routeNavigate({ search: { q: value || undefined }, replace: true });
  };

  const { data, isLoading } = useCompletedOrders(page, PAGE_SIZE, search);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const rows = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const handleOrderClick = (orderId: number) => {
    navigate({ to: "/completed/$orderId", params: { orderId: String(orderId) } });
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader
        icon={CheckCircle2}
        title="Completed Orders"
        subtitle={`${totalCount} order${totalCount !== 1 ? "s" : ""} fully completed`}
      />

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Customer, invoice, phone…"
          className="w-full md:w-80"
        />
      </div>

      {isLoading && rows.length === 0 ? (
        <LoadingSkeleton />
      ) : totalCount === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          message={search ? "No completed orders match your search" : "No completed orders yet"}
        />
      ) : (
        <>
          {isMobile ? (
            <div className="space-y-2">
              {rows.map((group) => (
                <CompletedOrderCard
                  key={group.order_id}
                  group={group}
                  onClick={() => handleOrderClick(group.order_id)}
                />
              ))}
            </div>
          ) : (
            <CompletedOrderTable
              groups={rows}
              onOrderClick={handleOrderClick}
            />
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
