import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAssignedOrdersPage } from "@/hooks/useWorkshopGarments";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrandBadge } from "@/components/shared/StageBadge";
import { type PillColor } from "@/components/shared/StatusPill";
import { PageHeader } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { Input } from "@repo/ui/input";
import { OrderTypeBadge } from "@repo/ui/order-type-badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@repo/ui/table";
import { cn, formatDate, parseUtcTimestamp, toLocalDateStr } from "@/lib/utils";
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
  Layers,
  Search,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

const BRANDS = ["ERTH", "SAKKBA", "QASS"] as const;
type Brand = (typeof BRANDS)[number];

type DeliverySort = "none" | "asc" | "desc";

type AssignedSearch = { express?: boolean };

export const Route = createFileRoute("/(main)/assigned/")({
  component: AssignedPage,
  head: () => ({ meta: [{ title: "Production Tracker" }] }),
  validateSearch: (raw: Record<string, unknown>): AssignedSearch => ({
    express: raw.express === true || raw.express === "1" || raw.express === "true",
  }),
});

// ── Helpers ───────────────────────────────────────────────────

type UrgencyTone = "bad" | "warn" | "muted";

/** Days between today and a delivery timestamp, in local (Kuwait) calendar days. */
function deliveryUrgency(value: string | null | undefined): { tone: UrgencyTone; days: number | null; label: string | null } {
  if (!value) return { tone: "muted", days: null, label: null };
  const diff = Math.ceil((parseUtcTimestamp(value).getTime() - Date.now()) / 86_400_000);
  if (diff < 0)  return { tone: "bad",  days: diff, label: `${Math.abs(diff)}d overdue` };
  if (diff === 0) return { tone: "bad", days: 0,    label: "Due today" };
  if (diff <= 2) return { tone: "warn", days: diff, label: `${diff}d` };
  return { tone: "muted", days: diff, label: `${diff}d` };
}

const URGENCY_TEXT: Record<UrgencyTone, string> = {
  bad:   "text-[var(--status-bad)]",
  warn:  "text-[var(--status-warn)]",
  muted: "text-foreground",
};

/**
 * Delivery date display. Shows the order-level delivery date always. When any
 * garment has its own delivery_date that differs from the order date, renders
 * a second "Piece:" line so staff see the tighter per-garment deadline.
 */
function DeliveryDisplay({ row, align = "center" }: { row: AssignedOrderRow; align?: "center" | "start" }) {
  if (!row.delivery_date) {
    return <span className="text-muted-foreground">—</span>;
  }

  const u = deliveryUrgency(row.delivery_date);
  const toneClass = URGENCY_TEXT[u.tone];

  return (
    <div className={cn("flex flex-col gap-1 text-base", align === "center" ? "items-center" : "items-start")}>
      <span className={cn("flex items-center gap-1.5 whitespace-nowrap font-medium", toneClass)}>
        <Clock className={cn("w-4 h-4", u.tone === "muted" ? "text-muted-foreground" : toneClass)} />
        <span>{formatDate(row.delivery_date)}</span>
      </span>
      {u.label && u.tone !== "muted" && (
        <span className={cn("text-sm font-medium tabular-nums", toneClass)}>
          {u.label}
        </span>
      )}
      {row.home_delivery && (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-50 bg-indigo-900 px-2 py-0.5 rounded-md">
          <Home className="w-3.5 h-3.5" /> Home
        </span>
      )}
    </div>
  );
}


// ── Order Indicators ────────────────────────────────────────

function OrderIndicators({ group }: { group: AssignedOrderRow }) {
  // Each indicator carries distinct meaning — give it a distinct dark-toned
  // color so staff can scan a row and pick it out. Dark shades (not -500
  // brights) keep things professional.
  return (
    <span className="inline-flex items-center gap-1.5 ml-1.5">
      {group.express && (
        <span className="text-red-700" title="Express">
          <Zap className="w-3.5 h-3.5 fill-current" />
        </span>
      )}
      {group.home_delivery && (
        <span className="text-indigo-700" title="Home delivery">
          <Home className="w-3.5 h-3.5" />
        </span>
      )}
      {group.soaking && (
        <span className="text-sky-700" title="Soaking required">
          <Droplets className="w-3.5 h-3.5 fill-current" />
        </span>
      )}
      {group.has_returns && (
        <span className="text-amber-700" title="Has returns">
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
          className="flex items-center gap-2 text-base leading-tight min-w-0"
        >
          {/* Type + count + optional garment ID */}
          <span className="shrink-0 font-semibold text-sm text-muted-foreground tabular-nums">
            {(() => {
              const letter = grp.type === "brova" ? "B" : grp.type === "alteration" ? "A" : "F";
              return grp.count > 1 ? `${grp.count}${letter}` : letter;
            })()}
          </span>
          {grp.count === 1 && grp.gids[0] && (
            <span className="font-mono text-sm text-muted-foreground shrink-0">
              {grp.gids[0]}
            </span>
          )}

          {/* Status dot + label */}
          <span className={cn(
            "w-2 h-2 rounded-full shrink-0",
            STATUS_DOT[grp.label.color] ?? "bg-muted-foreground/40",
          )} />
          <span className={cn(
            "font-medium truncate",
            STATUS_TEXT[grp.label.color] ?? "text-foreground",
          )}>
            {grp.label.text}
          </span>

          {grp.hasExpress && <Zap className="w-3.5 h-3.5 text-[var(--status-bad)] fill-current shrink-0" />}

          {/* Per-garment delivery date (only shown when different from order) */}
          {grp.garmentDelivery && (() => {
            const u = deliveryUrgency(grp.garmentDelivery);
            const bgVar =
              u.tone === "bad"  ? "bg-[var(--status-bad-bg)] text-[var(--status-bad)]" :
              u.tone === "warn" ? "bg-[var(--status-warn-bg)] text-[var(--status-warn)]" :
                                  "bg-muted text-foreground";
            return (
              <span className={cn("inline-flex items-center gap-1 text-sm font-medium rounded-md px-2 py-0.5 shrink-0", bgVar)}>
                <Clock className="w-3.5 h-3.5" />
                {formatDate(grp.garmentDelivery)}
              </span>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

const STATUS_DOT: Record<PillColor, string> = {
  green:   "bg-[var(--status-ok)]",
  emerald: "bg-[var(--status-ok)]",
  teal:    "bg-[var(--status-ok)]",
  sky:     "bg-[var(--status-info)]",
  blue:    "bg-[var(--status-info)]",
  violet:  "bg-[var(--status-info)]",
  purple:  "bg-[var(--status-info)]",
  amber:   "bg-[var(--status-warn)]",
  orange:  "bg-[var(--status-warn)]",
  red:     "bg-[var(--status-bad)]",
  zinc:    "bg-muted-foreground/40",
};

const STATUS_TEXT: Record<PillColor, string> = {
  green:   "text-[var(--status-ok)]",
  emerald: "text-[var(--status-ok)]",
  teal:    "text-[var(--status-ok)]",
  sky:     "text-[var(--status-info)]",
  blue:    "text-[var(--status-info)]",
  violet:  "text-[var(--status-info)]",
  purple:  "text-[var(--status-info)]",
  amber:   "text-[var(--status-warn)]",
  orange:  "text-[var(--status-warn)]",
  red:     "text-[var(--status-bad)]",
  zinc:    "text-muted-foreground",
};

// ── Order Card (mobile) ──────────────────────────────────────

function AssignedOrderCard({ group }: { group: AssignedOrderRow }) {
  return (
    <Link
      to="/assigned/$orderId"
      params={{ orderId: String(group.order_id) }}
      className={cn(
        "block bg-card border border-border rounded-md hover:bg-muted/40 active:bg-muted/50 transition-colors",
        group.express && "border-[var(--status-bad)]/40",
      )}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-mono text-base">#{group.order_id}</span>
            <OrderIndicators group={group} />
            <span className="font-medium text-base truncate tracking-tight">{group.customer_name ?? "—"}</span>
            {group.brands.map((b) => <BrandBadge key={b} brand={b} />)}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {group.invoice_number && (
              <span className="font-mono text-sm text-muted-foreground">INV-{group.invoice_number}</span>
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
        <TableRow className="bg-muted/30 border-b border-border hover:bg-muted/30">
          <TableHead className="font-medium text-muted-foreground h-10 text-sm px-3">Order</TableHead>
          <TableHead className="font-medium text-muted-foreground h-10 text-sm px-3">Customer</TableHead>
          <TableHead className="font-medium text-muted-foreground h-10 text-sm px-3">Brand</TableHead>
          <TableHead className="font-medium text-muted-foreground h-10 text-sm px-3">Garments</TableHead>
          <TableHead className="font-medium text-muted-foreground h-10 text-sm px-3 text-center">Delivery</TableHead>
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
            <TableCell className="py-2.5 px-3">
              <div className="flex items-center">
                <span className="font-mono font-medium text-base">#{group.order_id}</span>
                <OrderIndicators group={group} />
              </div>
              {group.invoice_number && (
                <span className="text-sm text-muted-foreground">INV-{group.invoice_number}</span>
              )}
            </TableCell>
            <TableCell className="py-2.5 px-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-base tracking-tight">{group.customer_name ?? "—"}</span>
                {group.customer_mobile && (
                  <span className="font-mono text-sm text-muted-foreground">{group.customer_mobile}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="py-2.5 px-3">
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
            <TableCell className="py-2.5 px-3">
              <Link
                to="/assigned/$orderId"
                params={{ orderId: String(group.order_id) }}
                className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary whitespace-nowrap"
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

// ── Filter Chip ───────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  icon: Icon,
  iconColor,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-sm font-medium transition-colors",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-card text-foreground border-border hover:bg-muted/50",
      )}
    >
      {Icon && <Icon className={cn("w-3.5 h-3.5", !active && iconColor)} />}
      <span>{children}</span>
      {count !== undefined && (
        <span className={cn(
          "tabular-nums text-xs",
          active ? "text-background/70" : "text-muted-foreground",
        )}>
          {count}
        </span>
      )}
    </button>
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

  // ── Filters ─────────────────────────────────────────────────────────────
  const initialExpress = Route.useSearch({ select: (s) => s.express ?? false });
  const [search, setSearch] = useState("");
  const [expressOnly, setExpressOnly] = useState(initialExpress);
  const [brovaOnly, setBrovaOnly] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<Brand[]>([]);
  const [deliverySort, setDeliverySort] = useState<DeliverySort>("none");

  const cycleDeliverySort = () =>
    setDeliverySort((s) => (s === "none" ? "asc" : s === "asc" ? "desc" : "none"));

  const toggleBrand = (b: Brand) =>
    setSelectedBrands((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b],
    );

  const clearFilters = () => {
    setSearch("");
    setExpressOnly(false);
    setBrovaOnly(false);
    setSelectedBrands([]);
    setDeliverySort("none");
  };

  const hasFilters =
    !!search || expressOnly || brovaOnly || selectedBrands.length > 0 || deliverySort !== "none";

  // Brand-only counts for chip badges. Search/express/brova not factored in
  // so users can see how many of each brand exist before narrowing.
  const brandCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) for (const b of r.brands) counts[b] = (counts[b] ?? 0) + 1;
    return counts;
  }, [rows]);

  const expressCount = useMemo(() => rows.filter((r) => r.express).length, [rows]);
  const brovaCount = useMemo(() => rows.filter((r) => r.has_brova).length, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (expressOnly && !r.express) return false;
      if (brovaOnly && !r.has_brova) return false;
      if (selectedBrands.length > 0 && !r.brands.some((b) => selectedBrands.includes(b as Brand))) return false;
      if (q) {
        const matches =
          (r.customer_name ?? "").toLowerCase().includes(q) ||
          String(r.order_id).includes(q) ||
          (r.invoice_number != null && String(r.invoice_number).includes(q)) ||
          (r.customer_mobile ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, ""));
        if (!matches) return false;
      }
      return true;
    });

    if (deliverySort === "none") return filtered;
    // Rows without a delivery_date sink to the bottom either way.
    const dir = deliverySort === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (!a.delivery_date && !b.delivery_date) return 0;
      if (!a.delivery_date) return 1;
      if (!b.delivery_date) return -1;
      return a.delivery_date < b.delivery_date ? -dir : a.delivery_date > b.delivery_date ? dir : 0;
    });
  }, [rows, search, expressOnly, brovaOnly, selectedBrands, deliverySort]);

  const subtitle = isLoading
    ? "Loading…"
    : hasFilters
      ? `${filteredRows.length} of ${rows.length} order${rows.length !== 1 ? "s" : ""}`
      : `${rows.length} order${rows.length !== 1 ? "s" : ""} in production`;

  return (
    <div className="p-4 sm:p-6 pb-10">
      <PageHeader
        icon={ClipboardList}
        title="Production Tracker"
        subtitle={subtitle}
      />

      <div className="flex flex-col md:flex-row md:items-center md:flex-wrap gap-2 md:gap-3 mb-4">
        <div className="relative w-full md:w-80 md:shrink-0">
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

        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <FilterChip
            active={expressOnly}
            onClick={() => setExpressOnly((v) => !v)}
            icon={Zap}
            iconColor="text-[var(--status-bad)]"
            count={expressCount}
          >
            Express
          </FilterChip>
          <FilterChip
            active={brovaOnly}
            onClick={() => setBrovaOnly((v) => !v)}
            icon={Layers}
            iconColor="text-muted-foreground"
            count={brovaCount}
          >
            With Brova
          </FilterChip>
          <span className="hidden sm:inline-block w-px h-5 bg-border mx-1" />
          {BRANDS.map((b) => (
            <FilterChip
              key={b}
              active={selectedBrands.includes(b)}
              onClick={() => toggleBrand(b)}
              count={brandCounts[b] ?? 0}
            >
              {b}
            </FilterChip>
          ))}
          <span className="hidden sm:inline-block w-px h-5 bg-border mx-1" />
          <FilterChip
            active={deliverySort !== "none"}
            onClick={cycleDeliverySort}
            icon={deliverySort === "desc" ? ArrowDown : ArrowUp}
          >
            Delivery {deliverySort === "asc" ? "↑" : deliverySort === "desc" ? "↓" : ""}
          </FilterChip>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 h-8 px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-card border rounded-md p-3 space-y-2.5">
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
      ) : filteredRows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "No orders match the current filters" : "No orders in production"}
          </p>
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {filteredRows.map((group) => (
            <AssignedOrderCard key={group.order_id} group={group} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden bg-card py-0 gap-0">
          <OrdersTable orders={filteredRows} navigate={goToOrder} />
        </div>
      )}
    </div>
  );
}
