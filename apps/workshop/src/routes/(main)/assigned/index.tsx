import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAssignedOrdersPage } from "@/hooks/useWorkshopGarments";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill, type PillColor } from "@/components/shared/StatusPill";
import { PageHeader } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@repo/ui/table";
import { cn, formatDate, toLocalDateStr } from "@/lib/utils";
import type { AssignedOrderRow } from "@/api/garments";
import {
  ClipboardList,
  RotateCcw,
  Clock,
  Package,
  Home,
  Zap,
  Droplets,
  ArrowRight,
  Shirt,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/(main)/assigned/")({
  component: AssignedPage,
  head: () => ({ meta: [{ title: "Production Tracker" }] }),
});

// ── Helpers ───────────────────────────────────────────────────

const STATUS_LABEL_COLOR: Record<string, PillColor> = {
  "At shop": "green",
  "Ready for dispatch": "emerald",
  "In transit to shop": "sky",
  "Brovas in transit": "sky",
  "Awaiting finals release": "violet",
  "Awaiting brova trial": "teal",
  "Finals in production": "blue",
  "Brovas in production": "purple",
  "In production": "zinc",
};

function statusLabelColor(label: string): PillColor {
  return STATUS_LABEL_COLOR[label] ?? "zinc";
}

/**
 * Delivery date display. Shows the order-level delivery date always. When any
 * garment has its own delivery_date that differs from the order date, renders
 * a second "Piece:" line so staff see the tighter per-garment deadline.
 */
function DeliveryDisplay({ row, align = "center" }: { row: AssignedOrderRow; align?: "center" | "start" }) {
  const orderDateStr = toLocalDateStr(row.delivery_date);
  const earliestStr = toLocalDateStr(row.earliest_garment_delivery);
  const showPiece = !!earliestStr && earliestStr !== orderDateStr;

  if (!row.delivery_date && !row.earliest_garment_delivery) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className={cn("flex flex-col gap-0.5 text-xs", align === "center" ? "items-center" : "items-start")}>
      {row.delivery_date && (
        <span className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Order</span>
          <span>{formatDate(row.delivery_date)}</span>
        </span>
      )}
      {showPiece && (
        <span className="flex items-center gap-1 whitespace-nowrap text-amber-700">
          <span className="text-[10px] font-bold uppercase tracking-wide">Piece</span>
          <span className="font-semibold">{formatDate(row.earliest_garment_delivery!)}</span>
        </span>
      )}
    </div>
  );
}


// ── Order Indicators ────────────────────────────────────────

function OrderIndicators({ group }: { group: AssignedOrderRow }) {
  return (
    <span className="inline-flex items-center gap-1 ml-1.5">
      {group.express && (
        <span className="text-red-500" title="Express">
          <Zap className="w-3.5 h-3.5 fill-red-500" />
        </span>
      )}
      {group.home_delivery && (
        <span className="text-indigo-500" title="Home delivery">
          <Home className="w-3.5 h-3.5" />
        </span>
      )}
      {group.soaking && (
        <span className="text-sky-500" title="Soaking required">
          <Droplets className="w-3.5 h-3.5" />
        </span>
      )}
      {group.has_returns && (
        <span className="text-amber-500" title="Has returns">
          <RotateCcw className="w-3.5 h-3.5" />
        </span>
      )}
    </span>
  );
}

// ── Order Card (mobile) ──────────────────────────────────────

function AssignedOrderCard({ group }: { group: AssignedOrderRow }) {
  return (
    <Link
      to="/assigned/$orderId"
      params={{ orderId: String(group.order_id) }}
      className={cn(
        "block bg-card border rounded-xl shadow-sm hover:bg-muted/30 active:bg-muted/40 transition-[color,background-color,border-color,box-shadow]",
        group.express && "ring-1 ring-red-200",
      )}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-sm">#{group.order_id}</span>
            <OrderIndicators group={group} />
            <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <StatusPill color={statusLabelColor(group.status_label)}>{group.status_label}</StatusPill>
            <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 mt-1.5">
          <span className="flex items-center gap-1 text-xs font-semibold">
            <Package className="w-3 h-3 text-muted-foreground" />
            {group.garments_count}
            <span className="text-muted-foreground font-normal">
              garment{group.garments_count !== 1 ? "s" : ""}
            </span>
          </span>
          {group.brova_count > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              {group.brova_count} Brova
            </span>
          )}
          {group.final_count > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
              {group.final_count} Final{group.final_count !== 1 ? "s" : ""}
            </span>
          )}
          {group.invoice_number && (
            <span className="text-xs text-muted-foreground ml-auto">INV-{group.invoice_number}</span>
          )}
        </div>

        {(group.delivery_date || group.earliest_garment_delivery) && (
          <div className="mt-1">
            <DeliveryDisplay row={group} align="start" />
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Orders Table (desktop) ────────────────────────────────────

function OrdersTable({ orders, navigate }: { orders: AssignedOrderRow[]; navigate: (id: number) => void }) {
  return (
    <Table className="min-w-[900px]">
      <TableHeader>
        <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[90px]">Order</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[180px]">Customer</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[80px]">Brand</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[140px] text-center">Garments</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[190px]">Status</TableHead>
          <TableHead className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2 w-[120px] text-center">Delivery</TableHead>
          <TableHead className="w-[90px] h-8 px-2" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((group) => (
          <TableRow
            key={group.order_id}
            onClick={() => navigate(group.order_id)}
            className="hover:bg-muted/30 border-b border-border/40 cursor-pointer transition-colors"
          >
            <TableCell className="py-2.5 px-2.5 text-xs">
              <div className="flex items-center">
                <span className="font-mono font-bold">#{group.order_id}</span>
                <OrderIndicators group={group} />
              </div>
              {group.invoice_number && (
                <span className="text-[10px] text-muted-foreground">INV-{group.invoice_number}</span>
              )}
            </TableCell>
            <TableCell className="py-2.5 px-2.5 text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold max-w-[160px] truncate">{group.customer_name ?? "—"}</span>
                {group.customer_mobile && (
                  <span className="font-mono text-muted-foreground">{group.customer_mobile}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="py-2.5 px-2.5">
              <div className="flex items-center gap-1">
                {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
              </div>
            </TableCell>
            <TableCell className="py-2.5 px-2.5 text-xs align-middle text-center">
              <div className="flex flex-col gap-1 items-center">
                <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                  <Package className="w-3 h-3 text-muted-foreground" />
                  {group.garments_count}
                  <span className="text-muted-foreground font-normal">
                    garment{group.garments_count !== 1 ? "s" : ""}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  {group.brova_count > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      {group.brova_count} Brova
                    </span>
                  )}
                  {group.final_count > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      {group.final_count} Final{group.final_count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell className="py-2.5 px-2.5">
              <StatusPill color={statusLabelColor(group.status_label)}>{group.status_label}</StatusPill>
            </TableCell>
            <TableCell className="py-2.5 px-2.5 align-middle text-center">
              <DeliveryDisplay row={group} align="center" />
            </TableCell>
            <TableCell className="py-2.5 px-2.5">
              <Link
                to="/assigned/$orderId"
                params={{ orderId: String(group.order_id) }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
              >
                Details
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Section (titled table) ────────────────────────────────────

function OrdersSection({
  title,
  icon: Icon,
  iconBg,
  iconColor,
  orders,
  isMobile,
  emptyText,
  onNavigate,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  orders: AssignedOrderRow[];
  isMobile: boolean;
  emptyText: string;
  onNavigate: (orderId: number) => void;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className={cn("inline-flex items-center justify-center w-7 h-7 rounded-lg", iconBg)}>
          <Icon className={cn("w-3.5 h-3.5", iconColor)} />
        </div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
          {title}
        </h2>
        <StatusPill color="zinc">{orders.length}</StatusPill>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 py-8 text-center">
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {orders.map((group) => (
            <AssignedOrderCard key={group.order_id} group={group} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border shadow-sm overflow-x-auto bg-card py-0 gap-0">
          <OrdersTable orders={orders} navigate={onNavigate} />
        </div>
      )}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────

const PAGE_SIZE = 500;

function AssignedPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const goToOrder = (orderId: number) =>
    navigate({ to: "/assigned/$orderId", params: { orderId: String(orderId) } });

  const pageQuery = useAssignedOrdersPage({
    tab: "all",
    chips: [],
    page: 1,
    pageSize: PAGE_SIZE,
  });

  const rows = pageQuery.data?.rows ?? [];
  const isLoading = pageQuery.isLoading;

  const express: AssignedOrderRow[] = [];
  const brova: AssignedOrderRow[] = [];
  const rest: AssignedOrderRow[] = [];
  for (const row of rows) {
    if (row.express) express.push(row);
    else if (row.has_brova) brova.push(row);
    else rest.push(row);
  }

  const subtitle = `${rows.length} order${rows.length !== 1 ? "s" : ""} in production`;

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader
        icon={ClipboardList}
        title="Production Tracker"
        subtitle={isLoading ? "Loading…" : subtitle}
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-card border rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-4 w-12 rounded" />
                </div>
                <Skeleton className="h-4 w-28 rounded" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3.5 w-16 rounded" />
                  <Skeleton className="h-3.5 w-20 rounded" />
                </div>
                <Skeleton className="h-3.5 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <OrdersSection
            title="Express"
            icon={Zap}
            iconBg="bg-red-50"
            iconColor="text-red-600"
            orders={express}
            isMobile={isMobile}
            emptyText="No express orders in production"
            onNavigate={goToOrder}
          />
          <OrdersSection
            title="With Brova"
            icon={Layers}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            orders={brova}
            isMobile={isMobile}
            emptyText="No brova orders in production"
            onNavigate={goToOrder}
          />
          <OrdersSection
            title="Other Orders"
            icon={Shirt}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
            orders={rest}
            isMobile={isMobile}
            emptyText="No other orders in production"
            onNavigate={goToOrder}
          />
        </div>
      )}
    </div>
  );
}
