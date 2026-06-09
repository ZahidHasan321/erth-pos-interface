import { Fragment, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAssignedOrdersPage } from "@/hooks/useWorkshopGarments";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrandBadge } from "@/components/shared/StageBadge";
import { type PillColor } from "@/components/shared/StatusPill";
import { PageHeader } from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterChip } from "@/components/shared/FilterChip";
import { OrderTypeBadge } from "@repo/ui/order-type-badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/shared/table";
import { cn, formatDate, parseUtcTimestamp, toLocalDateStr } from "@/lib/utils";
import type { AssignedChip } from "@/api/garments";
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
  X,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Link2,
} from "lucide-react";

const BRANDS = ["ERTH", "SAKKBA", "QASS"] as const;
type Brand = (typeof BRANDS)[number];

type DeliverySort = "none" | "asc" | "desc";

// URL is the source of truth for filters. Default-valued keys (no filter, no
// sort, empty search) are omitted so a bare URL behaves exactly as before; the
// component fills in the defaults on read. Optional shape lets the navigate
// updater drop a key by setting it undefined.
type AssignedSearch = {
  q?: string;
  express?: boolean;
  overdue?: boolean;
  brova?: boolean;
  brands?: Brand[];
  sort?: DeliverySort;
};

const isBrand = (v: unknown): v is Brand => BRANDS.includes(v as Brand);
// true only when truthy; undefined otherwise so a false filter drops from the URL.
const asBool = (v: unknown): true | undefined =>
  v === true || v === "1" || v === "true" ? true : undefined;

export const Route = createFileRoute("/(main)/assigned/")({
  component: AssignedPage,
  head: () => ({ meta: [{ title: "Production Tracker" }] }),
  validateSearch: (raw: Record<string, unknown>): AssignedSearch => {
    const brands = Array.isArray(raw.brands) ? raw.brands.filter(isBrand) : [];
    return {
      q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
      express: asBool(raw.express),
      overdue: asBool(raw.overdue),
      brova: asBool(raw.brova),
      brands: brands.length > 0 ? brands : undefined,
      sort: raw.sort === "asc" || raw.sort === "desc" ? raw.sort : undefined,
    };
  },
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
    return <span className="text-muted-foreground">-</span>;
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
          <span className="shrink-0 font-medium text-sm text-muted-foreground tabular-nums">
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

// ── Linked-order grouping (§2.13) ────────────────────────────
// Rows arrive group-adjacent from the RPC (members of a link group sort to the
// position of the group's most-urgent member). Fold consecutive same-group rows
// into a cluster so the tracker reads a linked group as one deliverable. A group
// with only one of its members in production renders as a plain single row.

type TrackerItem =
  | { kind: "single"; row: AssignedOrderRow }
  | { kind: "group"; groupId: number; rows: AssignedOrderRow[] };

function buildTrackerItems(rows: AssignedOrderRow[]): TrackerItem[] {
  const items: TrackerItem[] = [];
  let i = 0;
  while (i < rows.length) {
    const groupId = rows[i].link_group_id;
    let j = i + 1;
    while (j < rows.length && rows[j].link_group_id === groupId) j++;
    const slice = rows.slice(i, j);
    items.push(slice.length > 1 ? { kind: "group", groupId, rows: slice } : { kind: "single", row: slice[0] });
    i = j;
  }
  return items;
}

/** Shared "Linked" cluster header — the shared delivery date + order count. */
function LinkedHeader({ rows }: { rows: AssignedOrderRow[] }) {
  const date = rows.find((r) => r.delivery_date)?.delivery_date ?? null;
  const u = deliveryUrgency(date);
  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      <Link2 className="w-3.5 h-3.5 text-blue-600" />
      <span className="text-blue-700 dark:text-blue-400">Linked</span>
      <span className="text-muted-foreground">· {rows.length} orders</span>
      {date && (
        <span className={cn("ml-auto inline-flex items-center gap-1 tabular-nums", URGENCY_TEXT[u.tone])}>
          <Clock className="w-3.5 h-3.5" />
          {formatDate(date)}
        </span>
      )}
    </div>
  );
}

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
            <span className="font-medium text-base truncate tracking-tight">{group.customer_name ?? "-"}</span>
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

// ── Order Card (mobile) — linked-group wrapper ───────────────

function LinkedGroupCard({ rows }: { rows: AssignedOrderRow[] }) {
  return (
    <div className="rounded-md border border-blue-500/30 bg-blue-500/[0.03] p-1.5">
      <div className="px-1.5 py-1">
        <LinkedHeader rows={rows} />
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => <AssignedOrderCard key={r.order_id} group={r} />)}
      </div>
    </div>
  );
}

// ── Orders Table (desktop) ────────────────────────────────────

function OrderTableRow({ row, navigate, linked = false }: { row: AssignedOrderRow; navigate: (id: number) => void; linked?: boolean }) {
  return (
    <TableRow
      onClick={() => navigate(row.order_id)}
      className={cn(
        "hover:bg-muted/30 border-b border-border/40 cursor-pointer transition-colors",
        linked && "bg-blue-500/[0.03] hover:bg-blue-500/[0.06]",
      )}
    >
      <TableCell className={cn("py-2.5 px-3", linked && "border-l-2 border-l-blue-500/50")}>
        <div className="flex items-center">
          <span className="font-mono font-medium text-base">#{row.order_id}</span>
          <OrderIndicators group={row} />
        </div>
        {row.invoice_number && (
          <span className="text-sm text-muted-foreground">INV-{row.invoice_number}</span>
        )}
      </TableCell>
      <TableCell className="py-2.5 px-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-base tracking-tight">{row.customer_name ?? "-"}</span>
          {row.customer_mobile && (
            <span className="font-mono text-sm text-muted-foreground">{row.customer_mobile}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="py-2.5 px-3">
        <div className="flex items-center gap-1">
          {row.brands.map((b) => <BrandBadge key={b} brand={b} />)}
        </div>
      </TableCell>
      <TableCell className="py-3 px-3 align-top">
        <GarmentBreakdown row={row} />
      </TableCell>
      <TableCell className="py-3 px-3 align-middle text-center">
        <DeliveryDisplay row={row} align="center" />
      </TableCell>
      <TableCell className="py-2.5 px-3">
        <Link
          to="/assigned/$orderId"
          params={{ orderId: String(row.order_id) }}
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          Details
          <ArrowRight className="w-4 h-4" />
        </Link>
      </TableCell>
    </TableRow>
  );
}

function OrdersTable({ items, navigate }: { items: TrackerItem[]; navigate: (id: number) => void }) {
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
        {items.map((item) =>
          item.kind === "single" ? (
            <OrderTableRow key={item.row.order_id} row={item.row} navigate={navigate} />
          ) : (
            <Fragment key={`g-${item.groupId}`}>
              <TableRow className="bg-blue-500/[0.06] hover:bg-blue-500/[0.06] border-b border-blue-500/20">
                <TableCell colSpan={6} className="py-1.5 px-3">
                  <LinkedHeader rows={item.rows} />
                </TableCell>
              </TableRow>
              {item.rows.map((r) => (
                <OrderTableRow key={r.order_id} row={r} navigate={navigate} linked />
              ))}
            </Fragment>
          ),
        )}
      </TableBody>
    </Table>
  );
}

// ── Page ─────────────────────────────────────────────────────

const PAGE_SIZE = 500;

function AssignedPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const goToOrder = (orderId: number) =>
    navigate({ to: "/assigned/$orderId", params: { orderId: String(orderId) } });

  // ── Filters (URL is the source of truth; defaults applied on read) ──────
  const sp = Route.useSearch();
  const search = sp.q ?? "";
  const expressOnly = sp.express ?? false;
  const overdueOnly = sp.overdue ?? false;
  const brovaOnly = sp.brova ?? false;
  const selectedBrands = sp.brands ?? [];
  const deliverySort = sp.sort ?? "none";

  // Server-side filter/sort/count: build the chip array from the boolean
  // filters and let the RPC do the narrowing + counting.
  const chips = ([
    expressOnly && "express",
    overdueOnly && "overdue",
    brovaOnly && "brova",
  ].filter(Boolean)) as AssignedChip[];

  const pageQuery = useAssignedOrdersPage({
    tab: "all",
    chips,
    page: 1,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    sort: deliverySort === "none" ? undefined : deliverySort,
    brands: selectedBrands.length > 0 ? selectedBrands : undefined,
  });

  const rows = pageQuery.data?.rows ?? [];
  // Fold linked orders (§2.13) into adjacent clusters; rows arrive group-adjacent.
  const items = useMemo(() => buildTrackerItems(rows), [rows]);
  const totalCount = pageQuery.data?.totalCount ?? 0;
  const totalUnfiltered = pageQuery.data?.totalUnfiltered ?? 0;
  const chipCounts = pageQuery.data?.chipCounts;
  const isLoading = pageQuery.isLoading;

  const navFilters = Route.useNavigate();
  // Filter tweaks shouldn't pile up in history (esp. per-keystroke search).
  // Each setter passes through validateSearch, which drops default-valued keys,
  // so a cleared filter leaves the URL bare.
  const patchSearch = (patch: AssignedSearch) =>
    navFilters({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const setSearch = (q: string) => patchSearch({ q: q || undefined });

  const cycleDeliverySort = () =>
    patchSearch({ sort: deliverySort === "none" ? "asc" : deliverySort === "asc" ? "desc" : undefined });

  const toggleBrand = (b: Brand) => {
    const next = selectedBrands.includes(b)
      ? selectedBrands.filter((x) => x !== b)
      : [...selectedBrands, b];
    patchSearch({ brands: next.length > 0 ? next : undefined });
  };

  const clearFilters = () =>
    patchSearch({ q: undefined, express: undefined, overdue: undefined, brova: undefined, brands: undefined, sort: undefined });

  const hasFilters =
    !!search || expressOnly || overdueOnly || brovaOnly || selectedBrands.length > 0 || deliverySort !== "none";

  // Chip badge counts come from the server, computed over the full pre-narrowing
  // set — so a badge shows how many exist before any filter is applied.
  const expressCount = chipCounts?.express ?? 0;
  const brovaCount = chipCounts?.brova ?? 0;
  const overdueCount = chipCounts?.overdue ?? 0;
  const brandCounts = chipCounts?.brands ?? {};

  const subtitle = isLoading
    ? "Loading…"
    : hasFilters
      ? `${totalCount} of ${totalUnfiltered} order${totalUnfiltered !== 1 ? "s" : ""}`
      : `${totalUnfiltered} order${totalUnfiltered !== 1 ? "s" : ""} in production`;

  return (
    <div className="p-4 sm:p-6 pb-10">
      <PageHeader
        icon={ClipboardList}
        title="Production Tracker"
        subtitle={subtitle}
      />

      <div className="flex flex-col md:flex-row md:items-center md:flex-wrap gap-2 md:gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Customer, order #, invoice, phone…"
          className="w-full md:w-80 md:shrink-0"
        />

        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <FilterChip
            active={overdueOnly}
            onClick={() => patchSearch({ overdue: overdueOnly ? undefined : true })}
            icon={AlertTriangle}
            iconColor="text-[var(--status-bad)]"
            count={overdueCount}
          >
            Overdue
          </FilterChip>
          <FilterChip
            active={expressOnly}
            onClick={() => patchSearch({ express: expressOnly ? undefined : true })}
            icon={Zap}
            iconColor="text-[var(--status-bad)]"
            count={expressCount}
          >
            Express
          </FilterChip>
          <FilterChip
            active={brovaOnly}
            onClick={() => patchSearch({ brova: brovaOnly ? undefined : true })}
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
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "No orders match the current filters" : "No orders in production"}
          </p>
        </div>
      ) : (
        <>
          {totalCount > rows.length && (
            <p className="mb-3 text-sm text-muted-foreground">
              Showing first {rows.length} of {totalCount}. Refine filters to narrow.
            </p>
          )}
          {isMobile ? (
            <div className="space-y-2">
              {items.map((item) =>
                item.kind === "single" ? (
                  <AssignedOrderCard key={item.row.order_id} group={item.row} />
                ) : (
                  <LinkedGroupCard key={`g-${item.groupId}`} rows={item.rows} />
                ),
              )}
            </div>
          ) : (
            <div className="rounded-md border border-border overflow-hidden bg-card py-0 gap-0">
              <OrdersTable items={items} navigate={goToOrder} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
