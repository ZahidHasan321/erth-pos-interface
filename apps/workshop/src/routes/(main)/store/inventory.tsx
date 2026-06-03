import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, AlertCircle, ChevronDown, RefreshCw, ArrowDownToLine, Settings2, Users, Package } from "lucide-react";

import { Button } from "@repo/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import { Skeleton } from "@repo/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { getPermission } from "@/lib/rbac";
import { isLowStock, formatQty, getLowStockThreshold } from "@/lib/inventory";
import { getFabrics } from "@/api/fabrics";
import { getAccessories } from "@/api/accessories";
import { UNIT_OF_MEASURE_LABELS } from "@/components/store/transfer-constants";
import { RestockDialog } from "@/components/inventory/RestockDialog";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import { StocktakeBanner } from "@/components/inventory/StocktakeBanner";
import { PageHeader } from "@/components/shared/PageShell";
import type { Fabric, Accessory, StockItemType } from "@repo/database";

type StatusFilter = "all" | "low" | "out" | "ok";
// Fabrics arrive from the shop via transfer (view-only here); accessories are the
// workshop's own stock. Shelf items are shop-owned and not shown in the workshop.
type ItemType = "fabric" | "accessory";

// URL is the source of truth for the item-type tab + filters. Defaults
// (accessory tab, all statuses, all categories, empty search) are omitted.
type InventorySearch = {
  type?: "fabric";
  q?: string;
  status?: "low" | "out" | "ok";
  category?: string;
};

export const Route = createFileRoute("/(main)/store/inventory")({
  component: InventoryPage,
  head: () => ({ meta: [{ title: "Inventory" }] }),
  validateSearch: (raw: Record<string, unknown>): InventorySearch => ({
    type: raw.type === "fabric" ? "fabric" : undefined,
    q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
    status:
      raw.status === "low" || raw.status === "out" || raw.status === "ok" ? raw.status : undefined,
    category: typeof raw.category === "string" && raw.category ? raw.category : undefined,
  }),
});

function InventoryPage() {
  // URL is the source of truth for tab + filters; defaults applied on read.
  const sp = Route.useSearch();
  const activeTab: ItemType = sp.type ?? "accessory";
  const search = sp.q ?? "";
  const status = sp.status ?? "all";
  const navigate = Route.useNavigate();
  const setActiveTab = (v: ItemType) =>
    navigate({ search: (prev) => ({ ...prev, type: v === "accessory" ? undefined : v }), replace: true });
  const setSearch = (v: string) =>
    navigate({ search: (prev) => ({ ...prev, q: v || undefined }), replace: true });
  const setStatus = (v: StatusFilter) =>
    navigate({ search: (prev) => ({ ...prev, status: v === "all" ? undefined : v }), replace: true });

  // Shared cache with the tabs (same query keys) — drives the Need-to-Restock list.
  const { data: fabrics = [] } = useQuery({ queryKey: ["fabrics"], queryFn: () => getFabrics(), staleTime: 60_000 });
  const { data: accessories = [] } = useQuery({ queryKey: ["accessories"], queryFn: () => getAccessories(), staleTime: 60_000 });

  // Items below their threshold against the WORKSHOP's own count (incl. out-of-stock).
  const needRestock = useMemo(() => {
    const out: RestockItem[] = [];
    const push = (type: ItemType, id: number, name: string, stock: unknown, override: number | string | null) => {
      const qty = Number(stock ?? 0);
      const threshold = getLowStockThreshold(type, override);
      if (qty < threshold) out.push({ type, id, name, qty, threshold });
    };
    for (const a of accessories) if (!a.is_archived) push("accessory", a.id, a.name, a.workshop_stock, a.low_stock_threshold);
    for (const f of fabrics) if (!f.is_archived) push("fabric", f.id, f.name, f.workshop_stock, f.low_stock_threshold);
    return out.sort((x, y) => x.qty / x.threshold - y.qty / y.threshold);
  }, [fabrics, accessories]);

  return (
    <div className="px-4 sm:px-6 py-5 max-w-[1600px] mx-auto pb-10">
      <PageHeader icon={Package} title="Inventory">
        <Button variant="outline" size="sm" asChild>
          <Link to="/store/suppliers">
            <Users className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Suppliers
          </Link>
        </Button>
      </PageHeader>

      <StocktakeBanner />

      <NeedToRestock items={needRestock} />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ItemType)}>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <TabsList className="h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
            <TabsTrigger value="accessory">Accessories</TabsTrigger>
            <TabsTrigger value="fabric">Fabrics</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search…"
              className="w-[220px]"
            />
            <SlidingPillSwitcher
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "ok", label: "In stock" },
                { value: "low", label: "Low" },
                { value: "out", label: "Out" },
              ]}
              size="sm"
            />
          </div>
        </div>

        <TabsContent value="fabric"><FabricsTab search={search} status={status} /></TabsContent>
        <TabsContent value="accessory"><AccessoriesTab search={search} status={status} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Need to restock ──────────────────────────────────────────────────
// Supporting info, not an alert: the stocktake banner owns the dominant
// alert region. This recedes to a neutral card so the page reads as one
// hierarchy — the low/out signal stays on the per-row quantity only.

type RestockItem = { type: ItemType; id: number; name: string; qty: number; threshold: number };

const RESTOCK_COLLAPSE_AT = 5;

function NeedToRestock({ items }: { items: RestockItem[] }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const collapsible = items.length > RESTOCK_COLLAPSE_AT;
  const visible = collapsible && !expanded ? items.slice(0, RESTOCK_COLLAPSE_AT) : items;
  const hidden = items.length - visible.length;

  return (
    <section className="rounded-md border border-border bg-card mb-4 overflow-hidden" aria-label="Items needing restock">
      <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-muted/30">
        <h2 className="text-sm font-medium text-muted-foreground">
          Need to restock <span className="tabular-nums">({items.length})</span>
        </h2>
        <Button variant="outline" size="sm" asChild>
          <Link to="/store/transfers">Request transfer</Link>
        </Button>
      </header>
      <ul className="divide-y divide-border">
        {visible.map((r) => (
          <li key={`${r.type}-${r.id}`}>
            <Link
              to="/store/inventory/$type/$id"
              params={{ type: r.type, id: String(r.id) }}
              className="flex items-center justify-between gap-3 px-3 py-1.5 hover:bg-muted/50"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate text-sm">{r.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground capitalize">{r.type}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums">
                <span className={cn("font-medium", r.qty <= 0 ? "text-[var(--status-bad)]" : "text-[var(--status-warn)]")}>
                  {formatQty(r.type, r.qty)}
                </span>
                <span className="text-muted-foreground"> / {formatQty(r.type, r.threshold)} min</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border-t border-border hover:bg-muted/50"
          aria-expanded={expanded}
        >
          {expanded ? "Show fewer" : `Show ${hidden} more…`}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────

function LowStockBadge() {
  return <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium bg-[var(--status-bad-bg)] text-[var(--status-bad)]">Low</span>;
}
function OutBadge() {
  return <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">Out</span>;
}
// Season is shop-owned metadata, shown here read-only so workshop staff can eyeball
// seasonal stock arriving via bulk transfer. Neutral chip — the low/out badge keeps the color.
function SeasonChip({ season }: { season: "summer" | "winter" }) {
  return <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground capitalize">{season}</span>;
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <TableContainer className="rounded-md shadow-none">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            {Array.from({ length: cols }).map((_, i) => <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: cols }).map((_, j) => (
                <TableCell key={j}><Skeleton className={j === cols - 1 ? "h-7 w-7 ml-auto" : "h-4 w-16"} /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function QueryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border border-border rounded-md py-10 text-center bg-card">
      <AlertCircle className="h-6 w-6 mx-auto mb-2 text-[var(--status-bad)] opacity-70" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Failed to load data</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
        <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Retry
      </Button>
    </div>
  );
}

function applyStatus(
  status: StatusFilter,
  type: StockItemType,
  qty: number,
  threshold?: number | string | null,
): boolean {
  if (status === "all") return true;
  if (status === "out") return qty <= 0;
  if (status === "low") return isLowStock(type, qty, threshold);
  return qty > 0 && !isLowStock(type, qty, threshold);
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <TableContainer className="rounded-md shadow-none">
      <Table>{children}</Table>
    </TableContainer>
  );
}

function TabToolbar({ count, total, lowCount, label, addLabel, addTo, canAdd, children }: {
  count: number;
  total: number;
  lowCount: number;
  label: string;
  addLabel: string;
  addTo: string;
  canAdd: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {count}{count !== total ? ` of ${total}` : ""} {label}
        </span>
        {lowCount > 0 && (
          <span className="text-[var(--status-bad)] tabular-nums">· {lowCount} low</span>
        )}
        {children}
      </div>
      {canAdd && (
        <Button size="sm" variant="outline" asChild>
          <Link to={addTo}>
            <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> {addLabel}
          </Link>
        </Button>
      )}
    </div>
  );
}

function RowQuickActions({
  canRestock, canAdjust, onRestock, onAdjust,
}: {
  canRestock: boolean; canAdjust: boolean;
  onRestock: () => void; onAdjust: () => void;
}) {
  if (!canRestock && !canAdjust) return null;
  return (
    <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {canRestock && (
        <Button variant="ghost" size="icon-touch" onClick={onRestock} title="Restock" aria-label="Restock">
          <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
      {canAdjust && (
        <Button variant="ghost" size="icon-touch" onClick={onAdjust} title="Adjust stock" aria-label="Adjust stock">
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

// ─── Fabrics ───────────────────────────────────────────────────────────

function FabricsTab({ search, status }: { search: string; status: StatusFilter }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Fabrics are shop-owned — the workshop holds transferred-in stock (view + restock/adjust
  // its own count) but never creates a fabric, so no "Add fabric" here.
  const canAdd = getPermission(user, "inventory:fabrics") === "full";
  const canRestock = getPermission(user, "inventory:restock") === "full";
  const canAdjust = getPermission(user, "inventory:adjust") === "full";

  const { data: fabrics = [], isLoading, isError, refetch } = useQuery({ queryKey: ["fabrics"], queryFn: () => getFabrics(), staleTime: 60_000 });
  const [restockTarget, setRestockTarget] = useState<Fabric | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Fabric | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return fabrics
      .filter((f) =>
        (!q || f.name?.toLowerCase().includes(q) || f.color?.toLowerCase().includes(q))
        && applyStatus(status, "fabric", Number(f.workshop_stock ?? 0), f.low_stock_threshold)
      )
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [fabrics, search, status]);

  const lowCount = useMemo(
    () => fabrics.reduce((n, f) => n + (isLowStock("fabric", Number(f.workshop_stock ?? 0), f.low_stock_threshold) ? 1 : 0), 0),
    [fabrics],
  );

  if (isLoading) return <TableSkeleton cols={5} />;
  if (isError) return <QueryErrorState onRetry={refetch} />;

  return (
    <>
      <TabToolbar
        count={filtered.length}
        total={fabrics.length}
        lowCount={lowCount}
        label="fabrics"
        addLabel="Add fabric"
        addTo="/store/inventory/fabric/new"
        canAdd={canAdd}
      />
      <TableShell>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Name</TableHead>
            <TableHead>Color code</TableHead>
            <TableHead className="text-right">Price/m</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="w-[110px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((f) => {
            const ws = Number(f.workshop_stock ?? 0);
            const low = isLowStock("fabric", ws, f.low_stock_threshold);
            const out = ws <= 0;
            return (
              <TableRow key={f.id} className="cursor-pointer" onClick={() => navigate({ to: "/store/inventory/$type/$id", params: { type: "fabric", id: String(f.id) } })}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {f.color_hex && <span className="w-4 h-4 rounded-full border shrink-0" style={{ backgroundColor: f.color_hex }} aria-hidden="true" />}
                    {f.name}
                    {f.season && <SeasonChip season={f.season} />}
                    {out ? <OutBadge /> : low && <LowStockBadge />}
                  </div>
                </TableCell>
                <TableCell>{f.color ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{f.price_per_meter ?? "—"}</TableCell>
                <TableCell className={cn("text-right tabular-nums", low && "text-[var(--status-bad)] font-medium")}>{formatQty("fabric", ws)}</TableCell>
                <TableCell>
                  <RowQuickActions
                    canRestock={canRestock}
                    canAdjust={canAdjust}
                    onRestock={() => setRestockTarget(f)}
                    onAdjust={() => setAdjustTarget(f)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">No fabrics match the current filters</TableCell></TableRow>
          )}
        </TableBody>
      </TableShell>

      {restockTarget && (
        <RestockDialog
          open
          onClose={() => setRestockTarget(null)}
          itemType="fabric"
          itemId={restockTarget.id}
          itemName={restockTarget.name}
          defaultLocation="workshop"
          currentStock={Number(restockTarget.workshop_stock ?? 0)}
        />
      )}
      {adjustTarget && (
        <AdjustStockDialog
          open
          onClose={() => setAdjustTarget(null)}
          itemType="fabric"
          itemId={adjustTarget.id}
          itemName={adjustTarget.name}
          defaultLocation="workshop"
          currentStock={Number(adjustTarget.workshop_stock ?? 0)}
        />
      )}
    </>
  );
}

// ─── Accessories ──────────────────────────────────────────────────────

function AccessoriesTab({ search, status }: { search: string; status: StatusFilter }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canAdd = getPermission(user, "inventory:accessories") === "full";
  const canRestock = getPermission(user, "inventory:restock") === "full";
  const canAdjust = getPermission(user, "inventory:adjust") === "full";

  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ["accessories"], queryFn: () => getAccessories(), staleTime: 60_000 });
  const [restockTarget, setRestockTarget] = useState<Accessory | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Accessory | null>(null);
  const categoryFilter = Route.useSearch().category ?? "all";
  const navSearch = Route.useNavigate();
  const setCategoryFilter = (v: string) =>
    navSearch({ search: (prev) => ({ ...prev, category: v === "all" ? undefined : v }), replace: true });

  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const a of items) if (a.category) set.add(a.category);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items
      .filter((a) =>
        (!q || a.name?.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q))
        && (categoryFilter === "all" || a.category === categoryFilter)
        && applyStatus(status, "accessory", Number(a.workshop_stock ?? 0), a.low_stock_threshold)
      )
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [items, search, status, categoryFilter]);

  const lowCount = useMemo(
    () => items.reduce((n, a) => n + (isLowStock("accessory", Number(a.workshop_stock ?? 0), a.low_stock_threshold) ? 1 : 0), 0),
    [items],
  );

  if (isLoading) return <TableSkeleton cols={6} />;
  if (isError) return <QueryErrorState onRetry={refetch} />;

  return (
    <>
      <TabToolbar
        count={filtered.length}
        total={items.length}
        lowCount={lowCount}
        label="accessories"
        addLabel="Add accessory"
        addTo="/store/inventory/accessory/new"
        canAdd={canAdd}
      >
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-7 w-[150px] text-xs pointer-coarse:h-11" aria-label="Filter by category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {existingCategories.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </TabToolbar>
      <TableShell>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="w-[110px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((a) => {
            const ws = Number(a.workshop_stock ?? 0);
            const low = isLowStock("accessory", ws, a.low_stock_threshold);
            const out = ws <= 0;
            return (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate({ to: "/store/inventory/$type/$id", params: { type: "accessory", id: String(a.id) } })}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">{a.name}{out ? <OutBadge /> : low && <LowStockBadge />}</div>
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">{a.category}</TableCell>
                <TableCell className="text-muted-foreground">{UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ?? a.unit_of_measure}</TableCell>
                <TableCell className="text-right tabular-nums">{a.price ?? "—"}</TableCell>
                <TableCell className={cn("text-right tabular-nums", low && "text-[var(--status-bad)] font-medium")}>{formatQty("accessory", ws, a.unit_of_measure)}</TableCell>
                <TableCell>
                  <RowQuickActions
                    canRestock={canRestock}
                    canAdjust={canAdjust}
                    onRestock={() => setRestockTarget(a)}
                    onAdjust={() => setAdjustTarget(a)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No accessories match the current filters</TableCell></TableRow>
          )}
        </TableBody>
      </TableShell>

      {restockTarget && (
        <RestockDialog
          open
          onClose={() => setRestockTarget(null)}
          itemType="accessory"
          itemId={restockTarget.id}
          itemName={restockTarget.name}
          defaultLocation="workshop"
          currentStock={Number(restockTarget.workshop_stock ?? 0)}
          unit={restockTarget.unit_of_measure}
        />
      )}
      {adjustTarget && (
        <AdjustStockDialog
          open
          onClose={() => setAdjustTarget(null)}
          itemType="accessory"
          itemId={adjustTarget.id}
          itemName={adjustTarget.name}
          defaultLocation="workshop"
          currentStock={Number(adjustTarget.workshop_stock ?? 0)}
          unit={adjustTarget.unit_of_measure}
        />
      )}
    </>
  );
}
