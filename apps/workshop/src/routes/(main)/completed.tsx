import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCompletedOrders } from "@/hooks/useWorkshopGarments";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { MetadataChip } from "@/components/shared/PageShell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, clickableProps, formatDate, groupByOrder, garmentSummary, type OrderGroup } from "@/lib/utils";
import {
  CheckCircle2,
  ChevronDown,
  Package,
  Clock,
  Home,
} from "lucide-react";

export const Route = createFileRoute("/(main)/completed")({
  component: CompletedOrdersPage,
  head: () => ({ meta: [{ title: "Completed Orders" }] }),
});

// helpers imported from @/lib/utils: groupByOrder, garmentSummary, OrderGroup

// ── Order Card ─────────────────────────────────────────────────

function CompletedOrderCard({ group, onClick }: { group: OrderGroup; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      {...clickableProps(onClick)}
      className={cn(
        "bg-white border rounded-xl shadow-sm border-l-4 border-l-green-400 cursor-pointer transition-[color,background-color,border-color,box-shadow]",
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
              <Package className="w-3 h-3" /> {garmentSummary(group.garments)}
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

// ── Page ───────────────────────────────────────────────────────

function CompletedOrdersPage() {
  const { data: all = [], isLoading } = useCompletedOrders();
  const navigate = useNavigate();

  const orderGroups = groupByOrder(all);
  const pagination = usePagination(orderGroups, 20);

  const handleOrderClick = (orderId: number) => {
    navigate({ to: "/assigned/$orderId", params: { orderId: String(orderId) } });
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-10">
      <div className="mb-5">
        <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-green-600" /> Completed Orders
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {orderGroups.length} order{orderGroups.length !== 1 ? "s" : ""} fully completed
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : orderGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-2xl">
          <CheckCircle2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="font-semibold text-muted-foreground">No completed orders yet</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {pagination.paged.map((group) => (
              <CompletedOrderCard
                key={group.order_id}
                group={group}
                onClick={() => handleOrderClick(group.order_id)}
              />
            ))}
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={pagination.setPage}
            totalItems={pagination.totalItems}
            pageSize={pagination.pageSize}
          />
        </>
      )}
    </div>
  );
}
