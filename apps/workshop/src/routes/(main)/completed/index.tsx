import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCompletedOrders } from "@/hooks/useWorkshopGarments";
import { Pagination } from "@/components/shared/Pagination";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { PageHeader, MetadataChip, LoadingSkeleton } from "@/components/shared/PageShell";
import { Table, TableContainer, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@repo/ui/table";
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

export const Route = createFileRoute("/(main)/completed/")({
  component: CompletedOrdersPage,
  head: () => ({ meta: [{ title: "Completed Orders" }] }),
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
        "bg-card border rounded-xl shadow-sm border-l-4 border-l-green-400 cursor-pointer transition-[color,background-color,border-color,box-shadow]",
        "hover:border-primary/50 hover:shadow-md active:bg-muted/30",
      )}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-sm">#{group.order_id}</span>
            <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
            {group.express && <ExpressBadge />}
            {group.home_delivery && (
              <MetadataChip icon={Home} variant="indigo">Delivery</MetadataChip>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded bg-green-100 text-green-800">
              Completed
            </span>
            <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground/40" />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 mt-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {group.invoice_number && <span>INV-{group.invoice_number}</span>}
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
              className="cursor-pointer hover:bg-muted/50 border-l-4 border-l-green-400"
            >
              <TableCell className="font-mono font-bold text-sm">
                <div className="flex flex-col gap-0.5">
                  <span>#{group.order_id}</span>
                  {group.invoice_number && (
                    <span className="text-[10px] text-muted-foreground font-medium">INV-{group.invoice_number}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">{group.customer_name ?? "—"}</span>
                  {group.customer_mobile && (
                    <span className="text-xs font-mono text-muted-foreground">{group.customer_mobile}</span>
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
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{brovaCount}B</span>
                  )}
                  {finalCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{finalCount}F</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
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
  const { data, isLoading } = useCompletedOrders(page, PAGE_SIZE);
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

      {isLoading && rows.length === 0 ? (
        <LoadingSkeleton />
      ) : totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-xl bg-muted/5">
          <CheckCircle2 className="w-8 h-8 text-muted-foreground/20 mb-3" />
          <p className="font-semibold text-muted-foreground">No completed orders yet</p>
        </div>
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
