import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAssignedOrdersPage } from "@/hooks/useWorkshopGarments";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill, type PillColor } from "@/components/shared/StatusPill";
import { PageHeader } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { Input } from "@repo/ui/input";
import { OrderTypeBadge } from "@repo/ui/order-type-badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@repo/ui/table";
import { cn, formatDate, toLocalDateStr } from "@/lib/utils";
import { getGarmentStatusLabel } from "@/lib/garment-status";
import type { AssignedOrderRow } from "@/api/garments";
import {
  ClipboardList,
  RotateCcw,
  Clock,
  Home,
  Zap,
  Droplets,
  ArrowRight,
  Shirt,
  Layers,
  Search,
  X,
} from "lucide-react";

export const Route = createFileRoute("/(main)/assigned/")({
  component: AssignedPage,
  head: () => ({ meta: [{ title: "Production Tracker" }] }),
});

// ── Helpers ───────────────────────────────────────────────────

/**
 * Delivery date display. Shows the order-level delivery date always. When any
 * garment has its own delivery_date that differs from the order date, renders
 * a second "Piece:" line so staff see the tighter per-garment deadline.
 */
function DeliveryDisplay({ row, align = "center" }: { row: AssignedOrderRow; align?: "center" | "start" }) {
  if (!row.delivery_date) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className={cn("flex flex-col gap-1 text-sm", align === "center" ? "items-center" : "items-start")}>
      <span className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>{formatDate(row.delivery_date)}</span>
      </span>
      {row.home_delivery && (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-violet-600 px-2 py-0.5 rounded-full">
          <Home className="w-3 h-3" /> Home
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
      {group.order_type === "ALTERATION" && (
        <OrderTypeBadge type="ALTERATION" className="ml-0.5" />
      )}
    </span>
  );
}

// ── Garment Breakdown ───────────────────────────────────────

type GarmentStatusLabel = ReturnType<typeof getGarmentStatusLabel>;

interface GarmentGroup {
  key: string;
  type: string;
  label: GarmentStatusLabel;
  gids: string[];
  count: number;
  hasExpress: boolean;
  /** Per-garment delivery date (only when it differs from order date). */
  garmentDelivery: string | null;
}

function buildGarmentGroups(row: AssignedOrderRow): GarmentGroup[] {
  const summaries = row.garment_summaries ?? [];
  if (summaries.length === 0) return [];

  const anyBrovaAccepted = summaries.some(
    (g) => g.type === "brova" && g.acc === true,
  );

  const orderDate = row.delivery_date ? toLocalDateStr(row.delivery_date) : null;

  const groups: GarmentGroup[] = [];
  for (const g of summaries) {
    const status = getGarmentStatusLabel(g, anyBrovaAccepted);
    const gDel = g.del ? toLocalDateStr(g.del) : null;
    const showDel = gDel && gDel !== orderDate ? gDel : null;
    const key = `${g.type}::${status.text}::${showDel ?? ""}`;
    const existing = groups.find((grp) => grp.key === key);
    if (existing) {
      existing.count++;
      if (g.gid) existing.gids.push(g.gid);
      if (g.express) existing.hasExpress = true;
    } else {
      groups.push({
        key,
        type: g.type,
        label: status,
        gids: g.gid ? [g.gid] : [],
        count: 1,
        hasExpress: g.express,
        garmentDelivery: showDel,
      });
    }
  }
  return groups;
}

/** Compact vertical list — one line per garment group. Reads top-to-bottom. */
function GarmentBreakdown({ row }: { row: AssignedOrderRow }) {
  const groups = buildGarmentGroups(row);
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 min-w-0">
      {groups.map((grp) => (
        <div
          key={grp.key}
          className="flex items-center gap-2 text-sm leading-snug min-w-0"
        >
          {/* Type + count + optional garment ID */}
          <span className="shrink-0 font-black text-xs uppercase text-muted-foreground">
            {(() => {
              const letter = grp.type === "brova" ? "B" : grp.type === "alteration" ? "A" : "F";
              return grp.count > 1 ? `${grp.count}${letter}` : letter;
            })()}
          </span>
          {grp.count === 1 && grp.gids[0] && (
            <span className="font-mono text-xs text-muted-foreground shrink-0">
              {grp.gids[0]}
            </span>
          )}

          {/* Status dot + label */}
          <span className={cn(
            "w-2 h-2 rounded-full shrink-0",
            STATUS_DOT[grp.label.color] ?? "bg-zinc-400",
          )} />
          <span className={cn(
            "font-semibold truncate",
            STATUS_TEXT[grp.label.color] ?? "text-zinc-700",
          )}>
            {grp.label.text}
          </span>

          {grp.hasExpress && <Zap className="w-3 h-3 text-red-500 fill-red-500 shrink-0" />}

          {/* Per-garment delivery date (only shown when different from order) */}
          {grp.garmentDelivery && (
            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-800 bg-amber-100 rounded px-1.5 py-0.5 shrink-0">
              <Clock className="w-3 h-3" />
              {formatDate(grp.garmentDelivery)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

const STATUS_DOT: Record<PillColor, string> = {
  green: "bg-green-500", emerald: "bg-emerald-500", sky: "bg-sky-500",
  blue: "bg-blue-500", violet: "bg-violet-500", teal: "bg-teal-500",
  purple: "bg-purple-500", amber: "bg-amber-500", orange: "bg-orange-500",
  red: "bg-red-500", zinc: "bg-zinc-400",
};

const STATUS_TEXT: Record<PillColor, string> = {
  green: "text-green-700", emerald: "text-emerald-700", sky: "text-sky-700",
  blue: "text-blue-700", violet: "text-violet-700", teal: "text-teal-700",
  purple: "text-purple-700", amber: "text-amber-700", orange: "text-orange-700",
  red: "text-red-700", zinc: "text-zinc-600",
};

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
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-mono font-bold text-sm">#{group.order_id}</span>
            <OrderIndicators group={group} />
            <span className="font-semibold text-sm truncate">{group.customer_name ?? "—"}</span>
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {group.invoice_number && (
              <span className="font-mono text-[11px] text-muted-foreground">INV-{group.invoice_number}</span>
            )}
            <ArrowRight className="w-4 h-4 text-muted-foreground/40" />
          </div>
        </div>

        <div className="mt-1.5 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            {group.garment_summaries?.length > 0 && <GarmentBreakdown row={group} />}
          </div>
          {group.delivery_date && (
            <div className="shrink-0">
              <DeliveryDisplay row={group} align="start" />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Orders Table (desktop) ────────────────────────────────────

function OrdersTable({ orders, navigate }: { orders: AssignedOrderRow[]; navigate: (id: number) => void }) {
  return (
    <Table className="w-full">
      <TableHeader>
        <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
          <TableHead className="font-semibold text-foreground h-10 text-xs uppercase tracking-wider px-3">Order</TableHead>
          <TableHead className="font-semibold text-foreground h-10 text-xs uppercase tracking-wider px-3">Customer</TableHead>
          <TableHead className="font-semibold text-foreground h-10 text-xs uppercase tracking-wider px-3">Brand</TableHead>
          <TableHead className="font-semibold text-foreground h-10 text-xs uppercase tracking-wider px-3">Garments</TableHead>
          <TableHead className="font-semibold text-foreground h-10 text-xs uppercase tracking-wider px-3 text-center">Delivery</TableHead>
          <TableHead className="w-[70px] h-10 px-3" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((group) => (
          <TableRow
            key={group.order_id}
            onClick={() => navigate(group.order_id)}
            className="hover:bg-muted/30 border-b border-border/40 cursor-pointer transition-colors"
          >
            <TableCell className="py-3 px-3">
              <div className="flex items-center">
                <span className="font-mono font-bold text-sm">#{group.order_id}</span>
                <OrderIndicators group={group} />
              </div>
              {group.invoice_number && (
                <span className="text-xs text-muted-foreground">INV-{group.invoice_number}</span>
              )}
            </TableCell>
            <TableCell className="py-3 px-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-sm">{group.customer_name ?? "—"}</span>
                {group.customer_mobile && (
                  <span className="font-mono text-xs text-muted-foreground">{group.customer_mobile}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="py-3 px-3">
              <div className="flex items-center gap-1">
                {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
              </div>
            </TableCell>
            <TableCell className="py-3 px-3 align-top">
              <GarmentBreakdown row={group} />
            </TableCell>
            <TableCell className="py-3 px-3 align-middle text-center">
              <DeliveryDisplay row={group} align="center" />
            </TableCell>
            <TableCell className="py-3 px-3">
              <Link
                to="/assigned/$orderId"
                params={{ orderId: String(group.order_id) }}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
              >
                Details
                <ArrowRight className="w-4 h-4" />
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
        <div className="rounded-xl border border-border shadow-sm overflow-hidden bg-card py-0 gap-0">
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

  // ── Search ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.customer_name ?? "").toLowerCase().includes(q) ||
        String(r.order_id).includes(q) ||
        (r.invoice_number != null && String(r.invoice_number).includes(q)) ||
        (r.customer_mobile ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")),
    );
  }, [rows, search]);

  const express: AssignedOrderRow[] = [];
  const brova: AssignedOrderRow[] = [];
  const rest: AssignedOrderRow[] = [];
  for (const row of filteredRows) {
    if (row.express) express.push(row);
    else if (row.has_brova) brova.push(row);
    else rest.push(row);
  }

  const subtitle = `${rows.length} order${rows.length !== 1 ? "s" : ""} in production`;

  return (
    <div className="p-4 sm:p-6 pb-10">
      <PageHeader
        icon={ClipboardList}
        title="Production Tracker"
        subtitle={isLoading ? "Loading…" : subtitle}
      />

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Customer, order #, invoice, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-8"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

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
            iconBg="bg-muted"
            iconColor="text-muted-foreground"
            orders={brova}
            isMobile={isMobile}
            emptyText="No brova orders in production"
            onNavigate={goToOrder}
          />
          <OrdersSection
            title="Other Orders"
            icon={Shirt}
            iconBg="bg-muted"
            iconColor="text-muted-foreground"
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
