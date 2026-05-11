import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, AlertCircle, RefreshCw, ArrowDownToLine, Settings2, Users } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { getPermission } from "@/lib/rbac";
import { isLowStock, formatQty } from "@/lib/inventory";
import { getFabrics } from "@/api/fabrics";
import { getShelf } from "@/api/shelf";
import { getAccessories } from "@/api/accessories";
import { UNIT_OF_MEASURE_LABELS } from "@/components/store/transfer-constants";
import { RestockDialog } from "@/components/inventory/RestockDialog";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import type { Fabric, Shelf, Accessory, StockItemType } from "@repo/database";

export const Route = createFileRoute("/(main)/store/inventory")({
  component: InventoryPage,
  head: () => ({ meta: [{ title: "Inventory" }] }),
});

type StatusFilter = "all" | "low" | "out" | "ok";
type ItemType = "fabric" | "shelf" | "accessory";

function InventoryPage() {
  const [activeTab, setActiveTab] = useState<ItemType>("accessory");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  return (
    <div className="px-4 sm:px-6 py-5 max-w-[1600px] mx-auto pb-10">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <Button variant="outline" size="sm" asChild>
          <Link to="/store/suppliers">
            <Users className="h-3.5 w-3.5 mr-1.5" /> Suppliers
          </Link>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ItemType)}>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <TabsList className="h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
            <TabsTrigger value="accessory">Accessories</TabsTrigger>
            <TabsTrigger value="shelf">Shelf items</TabsTrigger>
            <TabsTrigger value="fabric">Fabrics</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-[220px]"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ok">In stock</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="out">Out</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="fabric"><FabricsTab search={search} status={status} /></TabsContent>
        <TabsContent value="shelf"><ShelfTab search={search} status={status} /></TabsContent>
        <TabsContent value="accessory"><AccessoriesTab search={search} status={status} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────

function LowStockBadge() {
  return <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium bg-[var(--status-bad-bg)] text-[var(--status-bad)]">Low</span>;
}
function OutBadge() {
  return <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">Out</span>;
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <TableContainer>
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
    </div>
  );
}

function QueryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border border-border rounded-md py-10 text-center bg-card">
      <AlertCircle className="h-6 w-6 mx-auto mb-2 text-[var(--status-bad)] opacity-70" />
      <p className="text-sm text-muted-foreground">Failed to load data</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
      </Button>
    </div>
  );
}

function applyStatus(status: StatusFilter, type: StockItemType, qty: number): boolean {
  if (status === "all") return true;
  if (status === "out") return qty <= 0;
  if (status === "low") return isLowStock(type, qty);
  return qty > 0 && !isLowStock(type, qty);
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      <TableContainer>
        <Table>{children}</Table>
      </TableContainer>
    </div>
  );
}

function TabToolbar({ count, total, lowCount, label, addLabel, addTo, children }: {
  count: number;
  total: number;
  lowCount: number;
  label: string;
  addLabel: string;
  addTo: string;
  children?: React.ReactNode;
}) {
  const { user } = useAuth();
  // any inventory edit permission qualifies for adding
  const canAdd =
    getPermission(user, "inventory:fabrics") === "full"
    || getPermission(user, "inventory:shelf") === "full"
    || getPermission(user, "inventory:accessories") === "full";

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
            <Plus className="h-3.5 w-3.5 mr-1" /> {addLabel}
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
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRestock} title="Restock">
          <ArrowDownToLine className="h-3.5 w-3.5" />
        </Button>
      )}
      {canAdjust && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAdjust} title="Adjust stock">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// ─── Fabrics ───────────────────────────────────────────────────────────

function FabricsTab({ search, status }: { search: string; status: StatusFilter }) {
  const navigate = useNavigate();
  const { user } = useAuth();
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
        && applyStatus(status, "fabric", Number(f.workshop_stock ?? 0))
      )
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [fabrics, search, status]);

  const lowCount = useMemo(
    () => fabrics.reduce((n, f) => n + (isLowStock("fabric", Number(f.workshop_stock ?? 0)) ? 1 : 0), 0),
    [fabrics],
  );

  if (isLoading) return <TableSkeleton cols={6} />;
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
      />
      <TableShell>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Name</TableHead>
            <TableHead>Color code</TableHead>
            <TableHead className="text-right">Price/m</TableHead>
            <TableHead className="text-right">Workshop</TableHead>
            <TableHead className="text-right">Shop</TableHead>
            <TableHead className="w-[110px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((f) => {
            const ws = Number(f.workshop_stock ?? 0);
            const wsh = Number(f.shop_stock ?? 0);
            const low = isLowStock("fabric", ws);
            const out = ws <= 0;
            return (
              <TableRow key={f.id} className="cursor-pointer" onClick={() => navigate({ to: "/store/inventory/$type/$id", params: { type: "fabric", id: String(f.id) } })}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {f.color_hex && <span className="w-4 h-4 rounded-full border shrink-0" style={{ backgroundColor: f.color_hex }} />}
                    {f.name}
                    {out ? <OutBadge /> : low && <LowStockBadge />}
                  </div>
                </TableCell>
                <TableCell>{f.color ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{f.price_per_meter ?? "—"}</TableCell>
                <TableCell className={cn("text-right tabular-nums", low && "text-[var(--status-bad)] font-medium")}>{formatQty("fabric", ws)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQty("fabric", wsh)}</TableCell>
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
            <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No fabrics match the current filters</TableCell></TableRow>
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

// ─── Shelf ────────────────────────────────────────────────────────────

function ShelfTab({ search, status }: { search: string; status: StatusFilter }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canRestock = getPermission(user, "inventory:restock") === "full";
  const canAdjust = getPermission(user, "inventory:adjust") === "full";

  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ["shelf"], queryFn: () => getShelf(), staleTime: 60_000 });
  const [restockTarget, setRestockTarget] = useState<Shelf | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Shelf | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items
      .filter((s) =>
        (!q || s.type?.toLowerCase().includes(q) || s.brand?.toLowerCase().includes(q))
        && applyStatus(status, "shelf", Number(s.workshop_stock ?? 0))
      )
      .sort((a, b) => (a.type ?? "").localeCompare(b.type ?? ""));
  }, [items, search, status]);

  const lowCount = useMemo(
    () => items.reduce((n, s) => n + (isLowStock("shelf", Number(s.workshop_stock ?? 0)) ? 1 : 0), 0),
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
        label="shelf items"
        addLabel="Add shelf item"
        addTo="/store/inventory/shelf/new"
      />
      <TableShell>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead>Type</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Workshop</TableHead>
            <TableHead className="text-right">Shop</TableHead>
            <TableHead className="w-[110px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((s) => {
            const ws = Number(s.workshop_stock ?? 0);
            const wsh = Number(s.shop_stock ?? 0);
            const low = isLowStock("shelf", ws);
            const out = ws <= 0;
            return (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate({ to: "/store/inventory/$type/$id", params: { type: "shelf", id: String(s.id) } })}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">{s.type}{out ? <OutBadge /> : low && <LowStockBadge />}</div>
                </TableCell>
                <TableCell>{s.brand ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.price ?? "—"}</TableCell>
                <TableCell className={cn("text-right tabular-nums", low && "text-[var(--status-bad)] font-medium")}>{formatQty("shelf", ws)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQty("shelf", wsh)}</TableCell>
                <TableCell>
                  <RowQuickActions
                    canRestock={canRestock}
                    canAdjust={canAdjust}
                    onRestock={() => setRestockTarget(s)}
                    onAdjust={() => setAdjustTarget(s)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No shelf items match the current filters</TableCell></TableRow>
          )}
        </TableBody>
      </TableShell>

      {restockTarget && (
        <RestockDialog
          open
          onClose={() => setRestockTarget(null)}
          itemType="shelf"
          itemId={restockTarget.id}
          itemName={restockTarget.type ?? "(unnamed)"}
          defaultLocation="workshop"
          currentStock={Number(restockTarget.workshop_stock ?? 0)}
        />
      )}
      {adjustTarget && (
        <AdjustStockDialog
          open
          onClose={() => setAdjustTarget(null)}
          itemType="shelf"
          itemId={adjustTarget.id}
          itemName={adjustTarget.type ?? "(unnamed)"}
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
  const canRestock = getPermission(user, "inventory:restock") === "full";
  const canAdjust = getPermission(user, "inventory:adjust") === "full";

  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ["accessories"], queryFn: () => getAccessories(), staleTime: 60_000 });
  const [restockTarget, setRestockTarget] = useState<Accessory | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Accessory | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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
        && applyStatus(status, "accessory", Number(a.workshop_stock ?? 0))
      )
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [items, search, status, categoryFilter]);

  const lowCount = useMemo(
    () => items.reduce((n, a) => n + (isLowStock("accessory", Number(a.workshop_stock ?? 0)) ? 1 : 0), 0),
    [items],
  );

  if (isLoading) return <TableSkeleton cols={7} />;
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
      >
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
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
            <TableHead className="text-right">Workshop</TableHead>
            <TableHead className="text-right">Shop</TableHead>
            <TableHead className="w-[110px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((a) => {
            const ws = Number(a.workshop_stock ?? 0);
            const wsh = Number(a.shop_stock ?? 0);
            const low = isLowStock("accessory", ws);
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
                <TableCell className="text-right tabular-nums">{formatQty("accessory", wsh, a.unit_of_measure)}</TableCell>
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
            <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No accessories match the current filters</TableCell></TableRow>
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
