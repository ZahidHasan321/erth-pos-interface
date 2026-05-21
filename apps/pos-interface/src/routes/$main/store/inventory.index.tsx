import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Package, Search, AlertCircle, RefreshCw, AlertTriangle, Scissors, ArrowRight, Users, ArrowDownToLine, Settings2, Trash2, ArchiveRestore } from "lucide-react";
import { IconStack2 } from "@tabler/icons-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Skeleton } from "@repo/ui/skeleton";
import { Switch } from "@repo/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@repo/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { getPermission } from "@/lib/rbac";
import { isLowStock, formatQty } from "@/lib/inventory";
import { getFabrics, createFabric, updateFabric, deleteFabric, unarchiveFabric } from "@/api/fabrics";
import { getShelf, createShelfItem, updateShelf, deleteShelfItem, unarchiveShelfItem } from "@/api/shelf";
import { getAccessories, createAccessory, updateAccessory, deleteAccessory, unarchiveAccessory } from "@/api/accessories";
import { UNIT_OF_MEASURE_LABELS } from "@/components/store/transfer-constants";
import { RestockDialog } from "@/components/inventory/RestockDialog";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import { CategoryCombobox } from "@/components/inventory/CategoryCombobox";
import type { Fabric, Shelf, Accessory, StockItemType, UnitOfMeasure } from "@repo/database";

export const Route = createFileRoute("/$main/store/inventory/")({
  component: InventoryPage,
  head: () => ({ meta: [{ title: "Inventory Management" }] }),
});

type SortKey = "name" | "stock_asc" | "stock_desc";
type StatusFilter = "all" | "low" | "out" | "ok";

const UNITS: UnitOfMeasure[] = ["pieces", "meters", "rolls", "kg"];

function InventoryPage() {
  const { main } = Route.useParams();
  const { user } = useAuth();
  const canEditFabrics = getPermission(user, "inventory:fabrics") === "full";
  const canEditAccessories = getPermission(user, "inventory:accessories") === "full";
  const canEditShelf = getPermission(user, "inventory:shelf") === "full";
  const canRestock = getPermission(user, "inventory:restock") === "full";
  const canAdjust = getPermission(user, "inventory:adjust") === "full";
  const canDelete = getPermission(user, "inventory:delete") === "full";

  const [activeTab, setActiveTab] = useState("fabric");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const { data: fabrics = [], isLoading: fl, isError: fe, refetch: fr } = useQuery({ queryKey: ["fabrics", { archived: showArchived }], queryFn: () => getFabrics(showArchived), staleTime: 60_000 });
  const { data: shelfItems = [], isLoading: sl, isError: se, refetch: sr } = useQuery({ queryKey: ["shelf", { archived: showArchived }], queryFn: () => getShelf(showArchived), staleTime: 60_000 });
  const { data: accessories = [], isLoading: al, isError: ae, refetch: ar } = useQuery({ queryKey: ["accessories", { archived: showArchived }], queryFn: () => getAccessories(showArchived), staleTime: 60_000 });

  const isLoading = fl || sl || al;
  const isError = fe || se || ae;
  const refetchAll = () => { fr(); sr(); ar(); };

  const activeFabrics = useMemo(() => fabrics.filter((f) => !f.is_archived), [fabrics]);
  const activeShelf = useMemo(() => shelfItems.filter((s) => !s.is_archived), [shelfItems]);
  const activeAccessories = useMemo(() => accessories.filter((a) => !a.is_archived), [accessories]);

  const lowStockCount = useMemo(() => {
    let count = 0;
    for (const f of activeFabrics) if (isLowStock("fabric", Number(f.shop_stock ?? 0), f.low_stock_threshold)) count++;
    for (const s of activeShelf) if (isLowStock("shelf", Number(s.shop_stock ?? 0), s.low_stock_threshold)) count++;
    for (const a of activeAccessories) if (isLowStock("accessory", Number(a.shop_stock ?? 0), a.low_stock_threshold)) count++;
    return count;
  }, [activeFabrics, activeShelf, activeAccessories]);

  const stats = [
    { label: "Fabric Types", value: activeFabrics.length, icon: Scissors, bg: "bg-purple-50 text-purple-600" },
    { label: "Shelf Items", value: activeShelf.length, icon: IconStack2, bg: "bg-sky-50 text-sky-600" },
    { label: "Accessories", value: activeAccessories.length, icon: Package, bg: "bg-pink-50 text-pink-600" },
    { label: "Low Stock", value: lowStockCount, icon: AlertTriangle, bg: lowStockCount > 0 ? "bg-amber-50 text-amber-600" : "bg-muted text-muted-foreground", highlight: lowStockCount > 0 },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-10">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Click any row to see history, restock, or adjust stock</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/$main/store/suppliers" params={{ main }}>
            <Users className="h-3.5 w-3.5 mr-1.5" /> Suppliers
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {stats.map((s) => (
            <Card key={s.label} className={cn("shadow-none rounded-xl border", s.highlight && "border-amber-200")}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={cn("p-2 rounded-lg shrink-0", s.bg)}>
                  <s.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("text-lg font-bold tabular-nums", s.highlight && "text-amber-700")}>{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && lowStockCount > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-5">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm font-medium text-amber-900">
              <span className="font-bold tabular-nums">{lowStockCount}</span> item{lowStockCount !== 1 ? "s" : ""} running low
            </p>
          </div>
          <Button size="sm" variant="outline" className="border-amber-200 text-amber-800 hover:bg-amber-100 shrink-0" asChild>
            <Link to="/$main/store/transfers" params={{ main }}>
              Request transfer
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {isError && !isLoading && (
        <Card className="shadow-none rounded-xl border border-destructive/20 mb-5">
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
            <p className="font-medium text-sm">Failed to load stock data</p>
            <Button variant="outline" size="sm" onClick={refetchAll} className="mt-4">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, color, brand…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="ok">Healthy</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name (A→Z)</SelectItem>
            <SelectItem value="stock_asc">Stock (low → high)</SelectItem>
            <SelectItem value="stock_desc">Stock (high → low)</SelectItem>
          </SelectContent>
        </Select>
        {canDelete && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground ml-auto select-none cursor-pointer">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            Show archived
          </label>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="fabric">Fabrics</TabsTrigger>
          <TabsTrigger value="shelf">Shelf Items</TabsTrigger>
          <TabsTrigger value="accessory">Accessories</TabsTrigger>
        </TabsList>

        <TabsContent value="fabric">
          <FabricsTab search={search} sort={sort} status={status} canEdit={canEditFabrics} canRestock={canRestock} canAdjust={canAdjust} canDelete={canDelete} showArchived={showArchived} />
        </TabsContent>
        <TabsContent value="shelf">
          <ShelfTab search={search} sort={sort} status={status} canEdit={canEditShelf} canRestock={canRestock} canAdjust={canAdjust} canDelete={canDelete} showArchived={showArchived} />
        </TabsContent>
        <TabsContent value="accessory">
          <AccessoriesTab search={search} sort={sort} status={status} canEdit={canEditAccessories} canRestock={canRestock} canAdjust={canAdjust} canDelete={canDelete} showArchived={showArchived} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────

function LowStockBadge() {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700">Low</span>
  );
}

function OutBadge() {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-zinc-100 text-zinc-700">Out</span>
  );
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                {Array.from({ length: cols }).map((_, i) => <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: cols }).map((_, j) => (
                    <TableCell key={j}><Skeleton className={j === cols - 1 ? "h-7 w-7 ml-auto" : "h-4 w-16"} /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

function QueryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="shadow-none rounded-xl border border-destructive/20">
      <CardContent className="py-10 text-center">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
        <p className="font-medium text-sm">Failed to load data</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </CardContent>
    </Card>
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

function applySort<T extends { name?: string | null; type?: string | null; shop_stock?: any }>(items: T[], sort: SortKey, nameKey: "name" | "type"): T[] {
  const copy = [...items];
  if (sort === "name") return copy.sort((a, b) => (a[nameKey] ?? "").localeCompare(b[nameKey] ?? ""));
  if (sort === "stock_asc") return copy.sort((a, b) => Number(a.shop_stock ?? 0) - Number(b.shop_stock ?? 0));
  return copy.sort((a, b) => Number(b.shop_stock ?? 0) - Number(a.shop_stock ?? 0));
}

type TabProps = { search: string; sort: SortKey; status: StatusFilter; canEdit: boolean; canRestock: boolean; canAdjust: boolean; canDelete: boolean; showArchived: boolean };

// Row-level quick action buttons. Restock and Adjust open dedicated dialogs
// directly without navigating to the detail page. Archived items show
// Unarchive in place of Restock/Adjust/Edit.
function RowActions({
  canEdit, canRestock, canAdjust, canDelete, isArchived,
  onEdit, onRestock, onAdjust, onDelete, onUnarchive,
}: {
  canEdit: boolean; canRestock: boolean; canAdjust: boolean; canDelete: boolean; isArchived: boolean;
  onEdit: () => void; onRestock: () => void; onAdjust: () => void; onDelete: () => void; onUnarchive: () => void;
}) {
  if (isArchived) {
    return (
      <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        {canDelete && (
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-blue-50 hover:text-blue-700" onClick={onUnarchive} title="Unarchive">
            <ArchiveRestore className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {canRestock && (
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-green-50 hover:text-green-700" onClick={onRestock} title="Restock">
          <ArrowDownToLine className="h-3.5 w-3.5" />
        </Button>
      )}
      {canAdjust && (
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-amber-50 hover:text-amber-700" onClick={onAdjust} title="Adjust stock">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      )}
      {canEdit && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Edit metadata">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
      {canDelete && (
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-50 hover:text-red-700" onClick={onDelete} title="Delete or archive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// Delete confirmation. Shows the item's name and warns that if it is FK-referenced
// (orders, movements, transfers), it will be archived rather than deleted.
function DeleteConfirmDialog({
  open, itemKind, itemName, onConfirm, onCancel, isPending,
}: {
  open: boolean; itemKind: string; itemName: string;
  onConfirm: () => void; onCancel: () => void; isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {itemKind}?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{itemName}</span> will be deleted.
            If it has ever been used in an order or stock movement, it will be archived instead (kept for history, hidden from pickers).
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>Cancel</Button>
          <Button type="button" onClick={onConfirm} disabled={isPending} className="bg-red-600 hover:bg-red-700 text-white">
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchivedBadge() {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-zinc-200 text-zinc-600">Archived</span>
  );
}

// ─── Polished dialog primitives ───────────────────────────────────────

function FormSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-semibold">{title}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Fabrics ───────────────────────────────────────────────────────────

function FabricsTab({ search, sort, status, canEdit, canRestock, canAdjust, canDelete, showArchived }: TabProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { main } = Route.useParams();
  const { data: fabrics = [], isLoading, isError, refetch } = useQuery({ queryKey: ["fabrics", { archived: showArchived }], queryFn: () => getFabrics(showArchived), staleTime: 60_000 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fabric | null>(null);
  const [restockTarget, setRestockTarget] = useState<Fabric | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Fabric | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Fabric | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let out = fabrics.filter((f) =>
      (!q || f.name?.toLowerCase().includes(q) || f.color?.toLowerCase().includes(q))
      && applyStatus(status, "fabric", Number(f.shop_stock ?? 0), f.low_stock_threshold)
    );
    out = applySort(out, sort, "name");
    return out;
  }, [fabrics, search, sort, status]);

  const createMut = useMutation({
    mutationFn: createFabric,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fabrics"] }); setDialogOpen(false); toast.success("Fabric created"); },
    onError: (err: any) => toast.error(`Could not create fabric: ${err?.message ?? String(err)}`),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<Fabric>) => updateFabric(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fabrics"] }); setDialogOpen(false); setEditing(null); toast.success("Fabric updated"); },
    onError: (err: any) => toast.error(`Could not update fabric: ${err?.message ?? String(err)}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFabric(id),
    onSuccess: (res, _id) => {
      qc.invalidateQueries({ queryKey: ["fabrics"] });
      const name = deleteTarget?.name ?? "Fabric";
      setDeleteTarget(null);
      toast.success(res.mode === "deleted" ? `${name} deleted` : `${name} archived (it's been used in orders)`);
    },
    onError: (err: any) => toast.error(`${err?.message ?? String(err)}`),
  });

  const unarchiveMut = useMutation({
    mutationFn: (id: number) => unarchiveFabric(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fabrics"] }); toast.success("Fabric restored"); },
    onError: (err: any) => toast.error(`${err?.message ?? String(err)}`),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const color = (fd.get("color") as string).trim() || undefined;
    const color_hex = (fd.get("color_hex") as string).trim() || undefined;
    const price_per_meter = fd.get("price_per_meter") ? Number(fd.get("price_per_meter")) : undefined;
    if (!name) { toast.error("Name is required"); return; }
    if (editing) {
      updateMut.mutate({ id: editing.id, name, color: color ?? null, color_hex: color_hex ?? null, price_per_meter: price_per_meter ?? null });
    } else {
      createMut.mutate({ name, color, color_hex, price_per_meter });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;
  if (isLoading) return <TableSkeleton cols={6} />;
  if (isError) return <QueryErrorState onRetry={refetch} />;

  return (
    <>
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {filtered.length} fabric(s){search && fabrics.length !== filtered.length && ` of ${fabrics.length}`}
              {!canEdit && <span className="ml-2 text-xs text-muted-foreground/60">(read only)</span>}
            </p>
            {canEdit && (
              <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Fabric
              </Button>
            )}
          </div>

          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Name</TableHead>
                  <TableHead>Color Code</TableHead>
                  <TableHead className="text-right">Price/m</TableHead>
                  <TableHead className="text-right">Shop</TableHead>
                  <TableHead className="text-right">Workshop</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => {
                  const ws = Number(f.shop_stock ?? 0);
                  const wsh = Number(f.workshop_stock ?? 0);
                  const low = isLowStock("fabric", ws, f.low_stock_threshold);
                  const out = ws <= 0;
                  const archived = !!f.is_archived;
                  return (
                    <TableRow key={f.id} className={cn("cursor-pointer", low && !archived && "bg-red-50/40", archived && "opacity-60")} onClick={() => !archived && navigate({ to: "/$main/store/inventory/$itemType/$itemId", params: { main, itemType: "fabric", itemId: String(f.id) } })}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {f.color_hex && <span className="w-4 h-4 rounded-full border shrink-0" style={{ backgroundColor: f.color_hex }} />}
                          {f.name}
                          {archived ? <ArchivedBadge /> : out ? <OutBadge /> : low && <LowStockBadge />}
                        </div>
                      </TableCell>
                      <TableCell>{f.color ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.price_per_meter ?? "—"}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", low && !archived && "text-red-600 font-semibold")}>{formatQty("fabric", ws)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty("fabric", wsh)}</TableCell>
                      <TableCell>
                        <RowActions
                          canEdit={canEdit}
                          canRestock={canRestock}
                          canAdjust={canAdjust}
                          canDelete={canDelete}
                          isArchived={archived}
                          onEdit={() => { setEditing(f); setDialogOpen(true); }}
                          onRestock={() => setRestockTarget(f)}
                          onAdjust={() => setAdjustTarget(f)}
                          onDelete={() => setDeleteTarget(f)}
                          onUnarchive={() => unarchiveMut.mutate(f.id)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No fabrics match the current filters</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle>{editing ? "Edit fabric" : "Add fabric"}</DialogTitle>
            <DialogDescription>Stock changes happen via Restock or Adjust on the item detail page.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-5 space-y-5">
              <FormSection title="Identity">
                <Label htmlFor="fab-name" className="text-xs text-muted-foreground">Name</Label>
                <Input id="fab-name" name="name" defaultValue={editing?.name ?? ""} required placeholder="e.g. Cotton Premium" />
              </FormSection>

              <FormSection title="Color">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="fab-color" className="text-xs text-muted-foreground">Code</Label>
                    <Input id="fab-color" name="color" placeholder="e.g. C04" defaultValue={editing?.color ?? ""} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="fab-hex" className="text-xs text-muted-foreground">Swatch</Label>
                    <div className="flex gap-2 mt-1">
                      <Input id="fab-hex" name="color_hex" placeholder="#FFFFFF" defaultValue={editing?.color_hex ?? ""} className="flex-1" />
                      <input
                        type="color"
                        className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                        defaultValue={editing?.color_hex || "#ffffff"}
                        onChange={(e) => {
                          const el = document.getElementById("fab-hex") as HTMLInputElement;
                          if (el) el.value = e.target.value;
                        }}
                      />
                    </div>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Pricing">
                <Label htmlFor="fab-price" className="text-xs text-muted-foreground">Price per meter</Label>
                <div className="relative">
                  <Input id="fab-price" name="price_per_meter" type="number" step="0.001" min={0} defaultValue={editing?.price_per_meter ?? ""} placeholder="0.000" className="pr-12" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">/ m</span>
                </div>
              </FormSection>
            </div>

            <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {editing ? "Save changes" : "Create fabric"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {restockTarget && (
        <RestockDialog
          open
          onClose={() => setRestockTarget(null)}
          itemType="fabric"
          itemId={restockTarget.id}
          itemName={restockTarget.name}
          defaultLocation="shop"
          currentStock={Number(restockTarget.shop_stock ?? 0)}
        />
      )}
      {adjustTarget && (
        <AdjustStockDialog
          open
          onClose={() => setAdjustTarget(null)}
          itemType="fabric"
          itemId={adjustTarget.id}
          itemName={adjustTarget.name}
          defaultLocation="shop"
          currentStock={Number(adjustTarget.shop_stock ?? 0)}
        />
      )}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemKind="fabric"
        itemName={deleteTarget?.name ?? ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        isPending={deleteMut.isPending}
      />
    </>
  );
}

// ─── Shelf ────────────────────────────────────────────────────────────

function ShelfTab({ search, sort, status, canEdit, canRestock, canAdjust, canDelete, showArchived }: TabProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { main } = Route.useParams();
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ["shelf", { archived: showArchived }], queryFn: () => getShelf(showArchived), staleTime: 60_000 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Shelf | null>(null);
  const [restockTarget, setRestockTarget] = useState<Shelf | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Shelf | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Shelf | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let out = items.filter((s) =>
      (!q || s.type?.toLowerCase().includes(q) || s.brand?.toLowerCase().includes(q))
      && applyStatus(status, "shelf", Number(s.shop_stock ?? 0), s.low_stock_threshold)
    );
    out = applySort(out, sort, "type");
    return out;
  }, [items, search, sort, status]);

  const createMut = useMutation({
    mutationFn: createShelfItem,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shelf"] }); setDialogOpen(false); toast.success("Shelf item created"); },
    onError: (err: any) => toast.error(`Could not create shelf item: ${err?.message ?? String(err)}`),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<Shelf>) => updateShelf(String(id), data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shelf"] }); setDialogOpen(false); setEditing(null); toast.success("Shelf item updated"); },
    onError: (err: any) => toast.error(`Could not update shelf item: ${err?.message ?? String(err)}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteShelfItem(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["shelf"] });
      const name = deleteTarget?.type ?? "Shelf item";
      setDeleteTarget(null);
      toast.success(res.mode === "deleted" ? `${name} deleted` : `${name} archived (it's been used in orders)`);
    },
    onError: (err: any) => toast.error(`${err?.message ?? String(err)}`),
  });

  const unarchiveMut = useMutation({
    mutationFn: (id: number) => unarchiveShelfItem(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shelf"] }); toast.success("Shelf item restored"); },
    onError: (err: any) => toast.error(`${err?.message ?? String(err)}`),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = (fd.get("type") as string).trim();
    const brand = (fd.get("brand") as string).trim() || undefined;
    const price = fd.get("price") ? Number(fd.get("price")) : undefined;
    if (!type) { toast.error("Type is required"); return; }
    if (editing) updateMut.mutate({ id: editing.id, type, brand: brand ?? null, price: price ?? null });
    else createMut.mutate({ type, brand, price } as any);
  };

  const isPending = createMut.isPending || updateMut.isPending;
  if (isLoading) return <TableSkeleton cols={6} />;
  if (isError) return <QueryErrorState onRetry={refetch} />;

  return (
    <>
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {filtered.length} shelf item(s){search && items.length !== filtered.length && ` of ${items.length}`}
              {!canEdit && <span className="ml-2 text-xs text-muted-foreground/60">(read only)</span>}
            </p>
            {canEdit && <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Add Shelf Item</Button>}
          </div>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Type</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Shop</TableHead>
                  <TableHead className="text-right">Workshop</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const ws = Number(s.shop_stock ?? 0);
                  const wsh = Number(s.workshop_stock ?? 0);
                  const low = isLowStock("shelf", ws, s.low_stock_threshold);
                  const out = ws <= 0;
                  const archived = !!s.is_archived;
                  return (
                    <TableRow key={s.id} className={cn("cursor-pointer", low && !archived && "bg-red-50/40", archived && "opacity-60")} onClick={() => !archived && navigate({ to: "/$main/store/inventory/$itemType/$itemId", params: { main, itemType: "shelf", itemId: String(s.id) } })}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">{s.type}{archived ? <ArchivedBadge /> : out ? <OutBadge /> : low && <LowStockBadge />}</div>
                      </TableCell>
                      <TableCell>{s.brand ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.price ?? "—"}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", low && !archived && "text-red-600 font-semibold")}>{formatQty("shelf", ws)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty("shelf", wsh)}</TableCell>
                      <TableCell>
                        <RowActions
                          canEdit={canEdit}
                          canRestock={canRestock}
                          canAdjust={canAdjust}
                          canDelete={canDelete}
                          isArchived={archived}
                          onEdit={() => { setEditing(s); setDialogOpen(true); }}
                          onRestock={() => setRestockTarget(s)}
                          onAdjust={() => setAdjustTarget(s)}
                          onDelete={() => setDeleteTarget(s)}
                          onUnarchive={() => unarchiveMut.mutate(s.id)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No shelf items match the current filters</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle>{editing ? "Edit shelf item" : "Add shelf item"}</DialogTitle>
            <DialogDescription>Stock changes happen via Restock or Adjust on the item detail page.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-5 space-y-5">
              <FormSection title="Identity">
                <Label htmlFor="shelf-type" className="text-xs text-muted-foreground">Type</Label>
                <Input id="shelf-type" name="type" defaultValue={editing?.type ?? ""} required placeholder="e.g. Ready-made dishdasha" />
              </FormSection>
              <FormSection title="Details">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="shelf-brand" className="text-xs text-muted-foreground">Brand</Label>
                    <Input id="shelf-brand" name="brand" defaultValue={editing?.brand ?? ""} className="mt-1" placeholder="Optional" />
                  </div>
                  <div>
                    <Label htmlFor="shelf-price" className="text-xs text-muted-foreground">Price</Label>
                    <Input id="shelf-price" name="price" type="number" step="0.001" min={0} defaultValue={editing?.price ?? ""} className="mt-1" placeholder="0.000" />
                  </div>
                </div>
              </FormSection>
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}{editing ? "Save changes" : "Create item"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {restockTarget && (
        <RestockDialog
          open
          onClose={() => setRestockTarget(null)}
          itemType="shelf"
          itemId={restockTarget.id}
          itemName={restockTarget.type ?? "(unnamed)"}
          defaultLocation="shop"
          currentStock={Number(restockTarget.shop_stock ?? 0)}
        />
      )}
      {adjustTarget && (
        <AdjustStockDialog
          open
          onClose={() => setAdjustTarget(null)}
          itemType="shelf"
          itemId={adjustTarget.id}
          itemName={adjustTarget.type ?? "(unnamed)"}
          defaultLocation="shop"
          currentStock={Number(adjustTarget.shop_stock ?? 0)}
        />
      )}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemKind="shelf item"
        itemName={deleteTarget?.type ?? ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        isPending={deleteMut.isPending}
      />
    </>
  );
}

// ─── Accessories ──────────────────────────────────────────────────────

function AccessoriesTab({ search, sort, status, canEdit, canRestock, canAdjust, canDelete, showArchived }: TabProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { main } = Route.useParams();
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ["accessories", { archived: showArchived }], queryFn: () => getAccessories(showArchived), staleTime: 60_000 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Accessory | null>(null);
  const [restockTarget, setRestockTarget] = useState<Accessory | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Accessory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Accessory | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [formCategory, setFormCategory] = useState<string>("");
  const [formUnit, setFormUnit] = useState<UnitOfMeasure>("pieces");

  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const a of items) if (a.category) set.add(a.category);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let out = items.filter((a) =>
      (!q || a.name?.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q))
      && (categoryFilter === "all" || a.category === categoryFilter)
      && applyStatus(status, "accessory", Number(a.shop_stock ?? 0), a.low_stock_threshold)
    );
    out = applySort(out, sort, "name");
    return out;
  }, [items, search, sort, status, categoryFilter]);

  const createMut = useMutation({
    mutationFn: createAccessory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accessories"] }); setDialogOpen(false); toast.success("Accessory created"); },
    onError: (err: any) => toast.error(`Could not create accessory: ${err?.message ?? String(err)}`),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<Accessory>) => updateAccessory(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accessories"] }); setDialogOpen(false); setEditing(null); toast.success("Accessory updated"); },
    onError: (err: any) => toast.error(`Could not update accessory: ${err?.message ?? String(err)}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAccessory(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["accessories"] });
      const name = deleteTarget?.name ?? "Accessory";
      setDeleteTarget(null);
      toast.success(res.mode === "deleted" ? `${name} deleted` : `${name} archived (it's been used in orders)`);
    },
    onError: (err: any) => toast.error(`${err?.message ?? String(err)}`),
  });

  const unarchiveMut = useMutation({
    mutationFn: (id: number) => unarchiveAccessory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accessories"] }); toast.success("Accessory restored"); },
    onError: (err: any) => toast.error(`${err?.message ?? String(err)}`),
  });

  function openCreate() {
    setEditing(null);
    setFormCategory("");
    setFormUnit("pieces");
    setDialogOpen(true);
  }
  function openEdit(a: Accessory) {
    setEditing(a);
    setFormCategory(a.category ?? "");
    setFormUnit(a.unit_of_measure ?? "pieces");
    setDialogOpen(true);
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const price = fd.get("price") ? Number(fd.get("price")) : undefined;
    const category = formCategory.trim().toLowerCase();
    if (!name) { toast.error("Name is required"); return; }
    if (!category) { toast.error("Category is required"); return; }
    if (editing) {
      updateMut.mutate({ id: editing.id, name, category, unit_of_measure: formUnit, price: price ?? null });
    } else {
      createMut.mutate({ name, category, unit_of_measure: formUnit, price } as any);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;
  if (isLoading) return <TableSkeleton cols={7} />;
  if (isError) return <QueryErrorState onRetry={refetch} />;

  return (
    <>
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {filtered.length} accessor(ies){search && items.length !== filtered.length && ` of ${items.length}`}
                {!canEdit && <span className="ml-2 text-xs text-muted-foreground/60">(read only)</span>}
              </p>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {existingCategories.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {canEdit && <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Accessory</Button>}
          </div>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Shop</TableHead>
                  <TableHead className="text-right">Workshop</TableHead>
                  <TableHead className="w-[140px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => {
                  const ws = Number(a.shop_stock ?? 0);
                  const wsh = Number(a.workshop_stock ?? 0);
                  const low = isLowStock("accessory", ws, a.low_stock_threshold);
                  const out = ws <= 0;
                  const archived = !!a.is_archived;
                  return (
                    <TableRow key={a.id} className={cn("cursor-pointer", low && !archived && "bg-red-50/40", archived && "opacity-60")} onClick={() => !archived && navigate({ to: "/$main/store/inventory/$itemType/$itemId", params: { main, itemType: "accessory", itemId: String(a.id) } })}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">{a.name}{archived ? <ArchivedBadge /> : out ? <OutBadge /> : low && <LowStockBadge />}</div>
                      </TableCell>
                      <TableCell className="capitalize">{a.category}</TableCell>
                      <TableCell>{UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ?? a.unit_of_measure}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.price ?? "—"}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", low && !archived && "text-red-600 font-semibold")}>{formatQty("accessory", ws, a.unit_of_measure)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQty("accessory", wsh, a.unit_of_measure)}</TableCell>
                      <TableCell>
                        <RowActions
                          canEdit={canEdit}
                          canRestock={canRestock}
                          canAdjust={canAdjust}
                          canDelete={canDelete}
                          isArchived={archived}
                          onEdit={() => openEdit(a)}
                          onRestock={() => setRestockTarget(a)}
                          onAdjust={() => setAdjustTarget(a)}
                          onDelete={() => setDeleteTarget(a)}
                          onUnarchive={() => unarchiveMut.mutate(a.id)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No accessories match the current filters</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle>{editing ? "Edit accessory" : "Add accessory"}</DialogTitle>
            <DialogDescription>Stock changes happen via Restock or Adjust on the item detail page.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-5 space-y-5">
              <FormSection title="Identity">
                <Label htmlFor="acc-name" className="text-xs text-muted-foreground">Name</Label>
                <Input id="acc-name" name="name" defaultValue={editing?.name ?? ""} required placeholder="e.g. Black plastic button 14mm" />
              </FormSection>

              <FormSection title="Classification" hint="Type a new category if needed">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <div className="mt-1">
                      <CategoryCombobox value={formCategory} onChange={setFormCategory} existing={existingCategories} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Unit of measure</Label>
                    <Select value={formUnit} onValueChange={(v) => setFormUnit(v as UnitOfMeasure)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => <SelectItem key={u} value={u}>{UNIT_OF_MEASURE_LABELS[u] ?? u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Pricing">
                <Label htmlFor="acc-price" className="text-xs text-muted-foreground">Price</Label>
                <div className="relative">
                  <Input id="acc-price" name="price" type="number" step="0.001" min={0} defaultValue={editing?.price ?? ""} placeholder="0.000" className="pr-16" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    / {UNIT_OF_MEASURE_LABELS[formUnit] ?? formUnit}
                  </span>
                </div>
              </FormSection>
            </div>
            <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}{editing ? "Save changes" : "Create accessory"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {restockTarget && (
        <RestockDialog
          open
          onClose={() => setRestockTarget(null)}
          itemType="accessory"
          itemId={restockTarget.id}
          itemName={restockTarget.name}
          defaultLocation="shop"
          currentStock={Number(restockTarget.shop_stock ?? 0)}
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
          defaultLocation="shop"
          currentStock={Number(adjustTarget.shop_stock ?? 0)}
          unit={adjustTarget.unit_of_measure}
        />
      )}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        itemKind="accessory"
        itemName={deleteTarget?.name ?? ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        isPending={deleteMut.isPending}
      />
    </>
  );
}
