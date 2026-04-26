import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Package, Search, AlertCircle, RefreshCw, AlertTriangle, Scissors, ArrowRight } from "lucide-react";
import { IconStack2 } from "@tabler/icons-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Skeleton } from "@repo/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import {
  TableContainer,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { getPermission } from "@/lib/rbac";
import { getFabrics, createFabric, updateFabric } from "@/api/fabrics";
import { getShelf, createShelfItem, updateShelf } from "@/api/shelf";
import { getAccessories, createAccessory, updateAccessory } from "@/api/accessories";
import {
  ACCESSORY_CATEGORY_LABELS,
  UNIT_OF_MEASURE_LABELS,
} from "@/components/store/transfer-constants";
import type { Fabric, Shelf, Accessory } from "@repo/database";

export const Route = createFileRoute("/$main/store/inventory")({
  component: InventoryPage,
  head: () => ({ meta: [{ title: "Inventory Management" }] }),
});

const LOW_STOCK = { fabric: 5, shelf: 3, accessory: 10 };

function isLowStock(type: "fabric" | "shelf" | "accessory", shopStock: number) {
  return shopStock > 0 && shopStock < LOW_STOCK[type];
}

function InventoryPage() {
  const { user } = useAuth();
  const canEditFabrics = getPermission(user, "inventory:fabrics") === "full";
  const canEditAccessories = getPermission(user, "inventory:accessories") === "full";
  const canEditShelf = getPermission(user, "inventory:shelf") === "full";

  const [activeTab, setActiveTab] = useState("fabric");
  const [search, setSearch] = useState("");

  const { data: fabrics = [], isLoading: fl, isError: fe, refetch: fr } = useQuery({ queryKey: ["fabrics"], queryFn: getFabrics, staleTime: 60_000 });
  const { data: shelfItems = [], isLoading: sl, isError: se, refetch: sr } = useQuery({ queryKey: ["shelf"], queryFn: getShelf, staleTime: 60_000 });
  const { data: accessories = [], isLoading: al, isError: ae, refetch: ar } = useQuery({ queryKey: ["accessories"], queryFn: getAccessories, staleTime: 60_000 });

  const isLoading = fl || sl || al;
  const isError = fe || se || ae;
  const refetchAll = () => { fr(); sr(); ar(); };

  const lowStockCount = useMemo(() => {
    let count = 0;
    for (const f of fabrics) if (isLowStock("fabric", Number(f.shop_stock ?? 0))) count++;
    for (const s of shelfItems) if (isLowStock("shelf", Number(s.shop_stock ?? 0))) count++;
    for (const a of accessories) if (isLowStock("accessory", Number(a.shop_stock ?? 0))) count++;
    return count;
  }, [fabrics, shelfItems, accessories]);

  const stats = [
    { label: "Fabric Types", value: fabrics.length, icon: Scissors, bg: "bg-purple-50 text-purple-600" },
    { label: "Shelf Items", value: shelfItems.length, icon: IconStack2, bg: "bg-sky-50 text-sky-600" },
    { label: "Accessories", value: accessories.length, icon: Package, bg: "bg-pink-50 text-pink-600" },
    { label: "Low Stock", value: lowStockCount, icon: AlertTriangle, bg: lowStockCount > 0 ? "bg-amber-50 text-amber-600" : "bg-muted text-muted-foreground", highlight: lowStockCount > 0 },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-10">
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">Inventory Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Create and manage fabrics, shelf items, and accessories</p>
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
              <span className="font-bold tabular-nums">{lowStockCount}</span> item{lowStockCount !== 1 ? "s" : ""} running low on stock
            </p>
          </div>
          <Button size="sm" variant="outline" className="border-amber-200 text-amber-800 hover:bg-amber-100 hover:border-amber-300 shrink-0" asChild>
            <Link to="/$main/store/request-delivery" params={(p: Record<string, string>) => p}>
              Request Delivery
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

      <div className="relative max-w-xl mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search items by name, type, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="fabric">Fabrics</TabsTrigger>
          <TabsTrigger value="shelf">Shelf Items</TabsTrigger>
          <TabsTrigger value="accessory">Accessories</TabsTrigger>
        </TabsList>
        <TabsContent value="fabric">
          <FabricsTab search={search} canEdit={canEditFabrics} />
        </TabsContent>
        <TabsContent value="shelf">
          <ShelfTab search={search} canEdit={canEditShelf} />
        </TabsContent>
        <TabsContent value="accessory">
          <AccessoriesTab search={search} canEdit={canEditAccessories} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────

function LowStockBadge() {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700">
      Low
    </span>
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

// ─── Fabrics ─────────────────────────────────────────────────────────────

function FabricsTab({ search, canEdit }: { search: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: fabrics = [], isLoading, isError, refetch } = useQuery({ queryKey: ["fabrics"], queryFn: getFabrics, staleTime: 60_000 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fabric | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return fabrics.filter((f) => !q || f.name?.toLowerCase().includes(q) || f.color?.toLowerCase().includes(q));
  }, [fabrics, search]);

  const createMut = useMutation({
    mutationFn: createFabric,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fabrics"] }); setDialogOpen(false); },
    onError: (err: any) => toast.error(`Could not create fabric: ${err?.message ?? String(err)}`),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<Fabric>) => updateFabric(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fabrics"] }); setDialogOpen(false); setEditing(null); },
    onError: (err: any) => toast.error(`Could not update fabric: ${err?.message ?? String(err)}`),
  });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (f: Fabric) => { setEditing(f); setDialogOpen(true); };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const color = (fd.get("color") as string).trim() || undefined;
    const color_hex = (fd.get("color_hex") as string).trim() || undefined;
    const price_per_meter = fd.get("price_per_meter") ? Number(fd.get("price_per_meter")) : undefined;
    const shop_stock = fd.get("shop_stock") ? Number(fd.get("shop_stock")) : undefined;
    if (!name) { toast.error("Name is required"); return; }
    if (price_per_meter !== undefined && (!Number.isFinite(price_per_meter) || price_per_meter < 0)) { toast.error("Price must be ≥ 0"); return; }
    if (shop_stock !== undefined && (!Number.isFinite(shop_stock) || shop_stock < 0)) { toast.error("Shop stock must be ≥ 0"); return; }
    if (editing) {
      updateMut.mutate({ id: editing.id, name, color: color ?? null, color_hex: color_hex ?? null, price_per_meter: price_per_meter ?? null, shop_stock: shop_stock ?? 0 });
    } else {
      createMut.mutate({ name, color, color_hex, price_per_meter, shop_stock });
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
              <Button size="sm" onClick={openCreate}>
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
                  <TableHead className="text-right">Shop Stock</TableHead>
                  <TableHead className="text-right">Workshop Stock</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((f) => {
                  const shop = Number(f.shop_stock ?? 0);
                  const low = isLowStock("fabric", shop);
                  return (
                    <TableRow key={f.id} className={low ? "bg-red-50/40" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {f.color_hex && <span className="w-4 h-4 rounded-full border shrink-0" style={{ backgroundColor: f.color_hex }} />}
                          {f.name}
                          {low && <LowStockBadge />}
                        </div>
                      </TableCell>
                      <TableCell>{f.color ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.price_per_meter ?? "—"}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", low && "text-red-600 font-semibold")}>{shop}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.workshop_stock ?? 0}</TableCell>
                      <TableCell>
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">{search ? "No fabrics match your search" : "No fabrics yet"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Fabric" : "Add Fabric"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fab-name">Name *</Label>
              <Input id="fab-name" name="name" defaultValue={editing?.name ?? ""} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fab-color">Color Code</Label>
                <Input id="fab-color" name="color" placeholder="e.g. C04" defaultValue={editing?.color ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fab-hex">Color Hex</Label>
                <div className="flex gap-2">
                  <Input id="fab-hex" name="color_hex" placeholder="#FFFFFF" defaultValue={editing?.color_hex ?? ""} className="flex-1" />
                  <input type="color" className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5" defaultValue={editing?.color_hex || "#ffffff"} onChange={(e) => { const el = document.getElementById("fab-hex") as HTMLInputElement; if (el) el.value = e.target.value; }} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fab-price">Price per Meter</Label>
                <Input id="fab-price" name="price_per_meter" type="number" step="0.001" min={0} defaultValue={editing?.price_per_meter ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fab-stock">Shop Stock (m)</Label>
                <Input id="fab-stock" name="shop_stock" type="number" step="0.5" min={0} defaultValue={editing?.shop_stock ?? 0} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Shelf Items ──────────────────────────────────────────────────────────

function ShelfTab({ search, canEdit }: { search: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ["shelf"], queryFn: getShelf, staleTime: 60_000 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Shelf | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((s) => !q || s.type?.toLowerCase().includes(q) || s.brand?.toLowerCase().includes(q));
  }, [items, search]);

  const createMut = useMutation({
    mutationFn: createShelfItem,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shelf"] }); setDialogOpen(false); },
    onError: (err: any) => toast.error(`Could not create shelf item: ${err?.message ?? String(err)}`),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<Shelf>) => updateShelf(String(id), data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shelf"] }); setDialogOpen(false); setEditing(null); },
    onError: (err: any) => toast.error(`Could not update shelf item: ${err?.message ?? String(err)}`),
  });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (s: Shelf) => { setEditing(s); setDialogOpen(true); };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = (fd.get("type") as string).trim();
    const brand = (fd.get("brand") as string).trim() || undefined;
    const price = fd.get("price") ? Number(fd.get("price")) : undefined;
    const shop_stock = fd.get("shop_stock") ? Number(fd.get("shop_stock")) : undefined;
    if (!type) { toast.error("Type is required"); return; }
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) { toast.error("Price must be ≥ 0"); return; }
    if (shop_stock !== undefined && (!Number.isFinite(shop_stock) || shop_stock < 0)) { toast.error("Shop stock must be ≥ 0"); return; }
    if (editing) { updateMut.mutate({ id: editing.id, type, brand: brand ?? null, price: price ?? null, shop_stock: shop_stock ?? 0 }); }
    else { createMut.mutate({ type, brand, price, shop_stock }); }
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
            {canEdit && <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Shelf Item</Button>}
          </div>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Type</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Shop Stock</TableHead>
                  <TableHead className="text-right">Workshop Stock</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const shop = Number(s.shop_stock ?? 0);
                  const low = isLowStock("shelf", shop);
                  return (
                    <TableRow key={s.id} className={low ? "bg-red-50/40" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">{s.type}{low && <LowStockBadge />}</div>
                      </TableCell>
                      <TableCell>{s.brand ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.price ?? "—"}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", low && "text-red-600 font-semibold")}>{shop}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.workshop_stock ?? 0}</TableCell>
                      <TableCell>{canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>}</TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">{search ? "No shelf items match your search" : "No shelf items yet"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Shelf Item" : "Add Shelf Item"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="shelf-type">Type *</Label><Input id="shelf-type" name="type" defaultValue={editing?.type ?? ""} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="shelf-brand">Brand</Label><Input id="shelf-brand" name="brand" defaultValue={editing?.brand ?? ""} /></div>
              <div className="space-y-2"><Label htmlFor="shelf-price">Price</Label><Input id="shelf-price" name="price" type="number" step="0.001" min={0} defaultValue={editing?.price ?? ""} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="shelf-stock">Shop Stock</Label><Input id="shelf-stock" name="shop_stock" type="number" min={0} defaultValue={editing?.shop_stock ?? 0} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Accessories ──────────────────────────────────────────────────────────

const CATEGORIES = ["buttons", "zippers", "thread", "lining", "elastic", "interlining", "other"] as const;
const UNITS = ["pieces", "meters", "rolls", "kg"] as const;

function AccessoriesTab({ search, canEdit }: { search: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: items = [], isLoading, isError, refetch } = useQuery({ queryKey: ["accessories"], queryFn: getAccessories, staleTime: 60_000 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Accessory | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter((a) => !q || a.name?.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q));
  }, [items, search]);

  const createMut = useMutation({
    mutationFn: createAccessory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accessories"] }); setDialogOpen(false); },
    onError: (err: any) => toast.error(`Could not create accessory: ${err?.message ?? String(err)}`),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<Accessory>) => updateAccessory(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accessories"] }); setDialogOpen(false); setEditing(null); },
    onError: (err: any) => toast.error(`Could not update accessory: ${err?.message ?? String(err)}`),
  });

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (a: Accessory) => { setEditing(a); setDialogOpen(true); };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const category = fd.get("category") as string;
    const unit_of_measure = fd.get("unit_of_measure") as string;
    const price = fd.get("price") ? Number(fd.get("price")) : undefined;
    const shop_stock = fd.get("shop_stock") ? Number(fd.get("shop_stock")) : undefined;
    if (!name || !category) { toast.error("Name and category are required"); return; }
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) { toast.error("Price must be ≥ 0"); return; }
    if (shop_stock !== undefined && (!Number.isFinite(shop_stock) || shop_stock < 0)) { toast.error("Shop stock must be ≥ 0"); return; }
    if (editing) {
      updateMut.mutate({ id: editing.id, name, category: category as Accessory["category"], unit_of_measure: unit_of_measure as Accessory["unit_of_measure"], price: price ?? null, shop_stock: shop_stock ?? 0 });
    } else {
      createMut.mutate({ name, category: category as Accessory["category"], unit_of_measure: (unit_of_measure || "pieces") as Accessory["unit_of_measure"], price, shop_stock } as any);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;
  if (isLoading) return <TableSkeleton cols={7} />;
  if (isError) return <QueryErrorState onRetry={refetch} />;

  return (
    <>
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {filtered.length} accessory(ies){search && items.length !== filtered.length && ` of ${items.length}`}
              {!canEdit && <span className="ml-2 text-xs text-muted-foreground/60">(read only)</span>}
            </p>
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
                  <TableHead className="text-right">Shop Stock</TableHead>
                  <TableHead className="text-right">Workshop Stock</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => {
                  const shop = Number(a.shop_stock ?? 0);
                  const low = isLowStock("accessory", shop);
                  return (
                    <TableRow key={a.id} className={low ? "bg-red-50/40" : ""}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">{a.name}{low && <LowStockBadge />}</div>
                      </TableCell>
                      <TableCell>{ACCESSORY_CATEGORY_LABELS[a.category] ?? a.category}</TableCell>
                      <TableCell>{UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ?? a.unit_of_measure}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.price ?? "—"}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", low && "text-red-600 font-semibold")}>{shop}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.workshop_stock ?? 0}</TableCell>
                      <TableCell>{canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>}</TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">{search ? "No accessories match your search" : "No accessories yet"}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Accessory" : "Add Accessory"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="acc-name">Name *</Label><Input id="acc-name" name="name" defaultValue={editing?.name ?? ""} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="acc-category">Category *</Label>
                <Select name="category" defaultValue={editing?.category ?? "other"}>
                  <SelectTrigger id="acc-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{ACCESSORY_CATEGORY_LABELS[c] ?? c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-unit">Unit of Measure</Label>
                <Select name="unit_of_measure" defaultValue={editing?.unit_of_measure ?? "pieces"}>
                  <SelectTrigger id="acc-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{UNIT_OF_MEASURE_LABELS[u] ?? u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="acc-price">Price</Label><Input id="acc-price" name="price" type="number" step="0.001" min={0} defaultValue={editing?.price ?? ""} /></div>
              <div className="space-y-2"><Label htmlFor="acc-stock">Shop Stock</Label><Input id="acc-stock" name="shop_stock" type="number" step="0.5" min={0} defaultValue={editing?.shop_stock ?? 0} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
