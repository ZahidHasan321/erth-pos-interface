import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Package,
  Store,
  Send,
  Settings2,
  ImageIcon,
  Upload,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Textarea } from "@repo/ui/textarea";
import { Badge } from "@repo/ui/badge";
import { Separator } from "@repo/ui/separator";
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

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { getPermission } from "@/lib/rbac";
import {
  formatQty,
  getLowStockThreshold,
  getWasteReasonLabel,
  isLowStock,
  MOVEMENT_TYPE_COLORS,
  MOVEMENT_TYPE_LABELS,
} from "@/lib/inventory";
import { getFabrics, updateFabric } from "@/api/fabrics";
import { getShelf, updateShelf } from "@/api/shelf";
import { getAccessories, updateAccessory } from "@/api/accessories";
import {
  getMovements,
  getItemUsageStats,
  getTopConsumingOrders,
  getRestockHistory,
  itemHasMovements,
  type MovementWithJoins,
} from "@/api/stockMovements";
import {
  uploadInventoryImage,
  deleteInventoryImageByUrl,
} from "@/lib/storage";
import { RestockDialog } from "@/components/inventory/RestockDialog";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import { DamageWasteDialog } from "@/components/inventory/DamageWasteDialog";
import { UNIT_OF_MEASURE_LABELS } from "@/components/store/transfer-constants";
import type {
  Fabric,
  Shelf,
  Accessory,
  StockItemType,
  UnitOfMeasure,
} from "@repo/database";

export const Route = createFileRoute("/$main/store/inventory/$itemType/$itemId")({
  component: InventoryItemDetailPage,
  head: () => ({ meta: [{ title: "Item Details | Inventory" }] }),
});

type ItemTypeParam = "fabric" | "shelf" | "accessory";

function isItemType(v: string): v is ItemTypeParam {
  return v === "fabric" || v === "shelf" || v === "accessory";
}

// Discriminated union so each branch carries the matching DB type without casts.
type ResolvedItem =
  | { kind: "fabric"; row: Fabric }
  | { kind: "shelf"; row: Shelf }
  | { kind: "accessory"; row: Accessory };

function InventoryItemDetailPage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const itemTypeRaw = params.itemType;
  const itemId = Number(params.itemId);
  const main = params.main;
  const urlValid = isItemType(itemTypeRaw) && Number.isFinite(itemId);
  const itemType: StockItemType = urlValid ? (itemTypeRaw as StockItemType) : "fabric";

  // Load all rows of the relevant type once and resolve the matching row.
  // Cheaper than building three separate single-item endpoints; lists are small.
  const fabricsQ = useQuery({
    queryKey: ["fabrics", { archived: true }],
    queryFn: () => getFabrics(true),
    enabled: urlValid && itemType === "fabric",
    staleTime: 30_000,
  });
  const shelfQ = useQuery({
    queryKey: ["shelf", { archived: true }],
    queryFn: () => getShelf(true),
    enabled: urlValid && itemType === "shelf",
    staleTime: 30_000,
  });
  const accQ = useQuery({
    queryKey: ["accessories", { archived: true }],
    queryFn: () => getAccessories(true),
    enabled: urlValid && itemType === "accessory",
    staleTime: 30_000,
  });

  const isListLoading =
    (itemType === "fabric" && fabricsQ.isLoading) ||
    (itemType === "shelf" && shelfQ.isLoading) ||
    (itemType === "accessory" && accQ.isLoading);

  const item: ResolvedItem | null = useMemo(() => {
    if (itemType === "fabric") {
      const row = fabricsQ.data?.find((f) => f.id === itemId);
      return row ? { kind: "fabric", row } : null;
    }
    if (itemType === "shelf") {
      const row = shelfQ.data?.find((s) => s.id === itemId);
      return row ? { kind: "shelf", row } : null;
    }
    const row = accQ.data?.find((a) => a.id === itemId);
    return row ? { kind: "accessory", row } : null;
  }, [itemType, itemId, fabricsQ.data, shelfQ.data, accQ.data]);

  if (!urlValid) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">Invalid inventory item URL.</p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/$main/store/inventory" params={{ main }}>Back to inventory</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isListLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-6 max-w-[800px] mx-auto">
        <Card>
          <CardContent className="py-10 text-center">
            <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium text-sm">Item not found</p>
            <p className="text-xs text-muted-foreground mt-1">
              It may have been deleted, or the URL is wrong.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/$main/store/inventory" params={{ main }}>Back to inventory</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ItemDetailContent item={item} main={main} onBack={() => navigate({ to: "/$main/store/inventory", params: { main } })} />;
}

// ─── Page body ────────────────────────────────────────────────────────────

type ContentProps = {
  item: ResolvedItem;
  main: string;
  onBack: () => void;
};

function nameOf(item: ResolvedItem): string {
  if (item.kind === "shelf") return item.row.type ?? "(unnamed)";
  return item.row.name;
}

function subtitleOf(item: ResolvedItem): string | null {
  if (item.kind === "fabric") {
    const parts = [item.row.color, item.row.price_per_meter ? `${item.row.price_per_meter}/m` : null].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (item.kind === "shelf") return item.row.brand ?? null;
  return `${item.row.category}`;
}

function unitOf(item: ResolvedItem): UnitOfMeasure | null {
  return item.kind === "accessory" ? item.row.unit_of_measure : null;
}

function ItemDetailContent({ item, main, onBack }: ContentProps) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canRestock = getPermission(user, "inventory:restock") === "full";
  const canAdjust = getPermission(user, "inventory:adjust") === "full";
  const canWaste = getPermission(user, "inventory:waste") === "full";
  const canEdit =
    item.kind === "fabric"
      ? getPermission(user, "inventory:fabrics") === "full"
      : item.kind === "shelf"
        ? getPermission(user, "inventory:shelf") === "full"
        : getPermission(user, "inventory:accessories") === "full";

  const itemType = item.kind;
  const itemId = item.row.id;
  const unit = unitOf(item);
  // Shop app shows only the shop-side stock — workshop stock is never surfaced here.
  const shopStock = Number(item.row.shop_stock ?? 0);
  const threshold = getLowStockThreshold(itemType, item.row.low_stock_threshold);
  const lowShop = isLowStock(itemType, shopStock, item.row.low_stock_threshold);

  const [restockOpen, setRestockOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  // Cost basis for the waste action: item price (per-meter for fabric).
  const unitCost =
    item.kind === "fabric"
      ? item.row.price_per_meter != null ? Number(item.row.price_per_meter) : null
      : item.row.price != null ? Number(item.row.price) : null;

  const movementsQ = useQuery({
    queryKey: ["stock_movements", itemType, itemId, "all"],
    queryFn: () => getMovements({ itemType, itemId, limit: 200 }),
    staleTime: 30_000,
  });

  const showUsage = itemType !== "accessory";
  const usageQ = useQuery({
    queryKey: ["item_usage", itemType, itemId],
    queryFn: () => getItemUsageStats(itemType, itemId),
    enabled: showUsage,
    staleTime: 60_000,
  });
  const topOrdersQ = useQuery({
    queryKey: ["item_top_orders", itemType, itemId],
    queryFn: () => getTopConsumingOrders(itemType, itemId, 30, 5),
    enabled: showUsage,
    staleTime: 60_000,
  });

  const restocksQ = useQuery({
    queryKey: ["item_restocks", itemType, itemId],
    queryFn: () => getRestockHistory(itemType, itemId, 50),
    staleTime: 60_000,
  });

  // For accessories: lock unit_of_measure once any movement exists.
  const lockUnitQ = useQuery({
    queryKey: ["item_has_movements", itemType, itemId],
    queryFn: () => itemHasMovements(itemType, itemId),
    enabled: itemType === "accessory" && canEdit,
    staleTime: 60_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: [itemType === "fabric" ? "fabrics" : itemType === "shelf" ? "shelf" : "accessories"] });
    qc.invalidateQueries({ queryKey: ["stock_movements", itemType, itemId] });
    qc.invalidateQueries({ queryKey: ["item_usage", itemType, itemId] });
    qc.invalidateQueries({ queryKey: ["item_top_orders", itemType, itemId] });
    qc.invalidateQueries({ queryKey: ["item_restocks", itemType, itemId] });
    qc.invalidateQueries({ queryKey: ["item_has_movements", itemType, itemId] });
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto pb-12 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight truncate">{nameOf(item)}</h1>
            <Badge variant="outline" className="capitalize">{itemType}</Badge>
            {item.row.is_archived && (
              <Badge variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-700">Archived</Badge>
            )}
            {lowShop && (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                <AlertTriangle className="h-3 w-3 mr-1" /> Low stock
              </Badge>
            )}
          </div>
          {subtitleOf(item) && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              {item.kind === "fabric" && item.row.color_hex && (
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full border shrink-0"
                  style={{ backgroundColor: item.row.color_hex }}
                />
              )}
              {subtitleOf(item)}
            </p>
          )}
        </div>
      </div>

      {/* Top: image + meta + stock */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        <ImageCard
          itemType={itemType}
          itemId={itemId}
          imageUrl={item.row.image_url ?? null}
          canEdit={canEdit}
          onChanged={invalidateAll}
        />
        <div className="space-y-5">
          <StockBreakdown
            itemType={itemType}
            unit={unit}
            shopStock={shopStock}
            low={lowShop}
            threshold={threshold}
            isThresholdOverridden={item.row.low_stock_threshold != null}
          />

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {canRestock && !item.row.is_archived && (
              <Button size="sm" onClick={() => setRestockOpen(true)}>
                <Store className="h-3.5 w-3.5 mr-1.5" /> Restock
              </Button>
            )}
            {canAdjust && !item.row.is_archived && (
              <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
                <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Adjust
              </Button>
            )}
            {canWaste && !item.row.is_archived && shopStock > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setWasteOpen(true)}
                className="text-red-700 border-red-200 hover:bg-red-50"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Damage / waste
              </Button>
            )}
            {/* Only accessories cross to the workshop — fabric/shelf are shop-only
                (SPEC §4), so the transfers shortcut is accessories-only. */}
            {itemType === "accessory" && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/$main/store/transfers" params={{ main }}>
                  <Send className="h-3.5 w-3.5 mr-1.5" /> Transfers
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Metadata + notes/threshold editor */}
      <MetadataCard
        item={item}
        canEdit={canEdit && !item.row.is_archived}
        unitLocked={lockUnitQ.data !== false}
        onSaved={invalidateAll}
      />

      {/* Usage analytics — fabrics + shelf only */}
      {showUsage && (
        <UsageSection
          itemType={itemType}
          unit={unit}
          stats={usageQ.data}
          isLoading={usageQ.isLoading}
          topOrders={topOrdersQ.data ?? []}
          isTopLoading={topOrdersQ.isLoading}
        />
      )}

      {/* Tabs: movements + supplier history */}
      <Tabs defaultValue="movements">
        <TabsList>
          <TabsTrigger value="movements">Movement history</TabsTrigger>
          <TabsTrigger value="restocks">Supplier history</TabsTrigger>
        </TabsList>
        <TabsContent value="movements">
          <MovementsTab
            itemType={itemType}
            unit={unit}
            movements={movementsQ.data ?? []}
            isLoading={movementsQ.isLoading}
            isError={movementsQ.isError}
          />
        </TabsContent>
        <TabsContent value="restocks">
          <RestocksTab
            itemType={itemType}
            unit={unit}
            entries={restocksQ.data ?? []}
            isLoading={restocksQ.isLoading}
            isError={restocksQ.isError}
          />
        </TabsContent>
      </Tabs>

      <RestockDialog
        open={restockOpen}
        onClose={() => setRestockOpen(false)}
        itemType={itemType}
        itemId={itemId}
        itemName={nameOf(item)}
        defaultLocation="shop"
        currentStock={shopStock}
        unit={unit}
      />
      <AdjustStockDialog
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        itemType={itemType}
        itemId={itemId}
        itemName={nameOf(item)}
        defaultLocation="shop"
        currentStock={shopStock}
        unit={unit}
      />
      <DamageWasteDialog
        open={wasteOpen}
        onClose={() => setWasteOpen(false)}
        itemType={itemType}
        itemId={itemId}
        itemName={nameOf(item)}
        location="shop"
        currentStock={shopStock}
        unit={unit}
        unitCost={unitCost}
      />
    </div>
  );
}

// ─── Image card ───────────────────────────────────────────────────────────

function ImageCard({
  itemType,
  itemId,
  imageUrl,
  canEdit,
  onChanged,
}: {
  itemType: ItemTypeParam;
  itemId: number;
  imageUrl: string | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);

  const persistUrl = async (newUrl: string | null) => {
    if (itemType === "fabric") await updateFabric(itemId, { image_url: newUrl });
    else if (itemType === "shelf") await updateShelf(String(itemId), { image_url: newUrl });
    else await updateAccessory(itemId, { image_url: newUrl });
  };

  const handleFile = async (file: File) => {
    if (busy) return;
    setBusy("upload");
    try {
      // Drop the prior image first to avoid orphaned files in the bucket.
      if (imageUrl) {
        try { await deleteInventoryImageByUrl(imageUrl); } catch { /* non-fatal */ }
      }
      const { url } = await uploadInventoryImage(file, itemType, itemId);
      await persistUrl(url);
      toast.success("Image updated");
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not upload image: ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    if (!imageUrl || busy) return;
    setBusy("delete");
    try {
      try { await deleteInventoryImageByUrl(imageUrl); } catch { /* non-fatal */ }
      await persistUrl(null);
      toast.success("Image removed");
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not remove image: ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="shadow-none">
      <CardContent className="p-3">
        <div className="aspect-square w-full rounded-lg bg-muted/40 overflow-hidden flex items-center justify-center">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
          )}
        </div>
        {canEdit && (
          <div className="mt-3 flex gap-2">
            <label className={cn("flex-1", busy && "pointer-events-none opacity-60")}>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.currentTarget.value = "";
                }}
              />
              <Button asChild size="sm" variant="outline" className="w-full cursor-pointer">
                <span>
                  {busy === "upload" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                  {imageUrl ? "Replace" : "Upload"}
                </span>
              </Button>
            </label>
            {imageUrl && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRemove}
                disabled={!!busy}
                className="text-destructive hover:bg-red-50"
              >
                {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        )}
        {!canEdit && imageUrl == null && (
          <p className="text-xs text-muted-foreground text-center mt-3">No image</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Stock breakdown ──────────────────────────────────────────────────────

function StockBreakdown({
  itemType, unit, shopStock, low, threshold, isThresholdOverridden,
}: {
  itemType: StockItemType;
  unit: UnitOfMeasure | null;
  shopStock: number;
  low: boolean;
  threshold: number;
  isThresholdOverridden: boolean;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Stock</h2>
          <span className="text-xs text-muted-foreground">
            Low threshold: <span className="font-medium tabular-nums text-foreground">{formatQty(itemType, threshold, unit)}</span>
            {isThresholdOverridden && <span className="ml-1 text-xs uppercase text-muted-foreground">(custom)</span>}
          </span>
        </div>
        <StockCard label="At shop" qty={shopStock} itemType={itemType} unit={unit} low={low} icon={Store} />
      </CardContent>
    </Card>
  );
}

function StockCard({
  label, qty, itemType, unit, low, icon: Icon,
}: {
  label: string;
  qty: number;
  itemType: StockItemType;
  unit?: UnitOfMeasure | null;
  low?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className={cn(
      "rounded-lg border px-3 py-3",
      low ? "bg-red-50 border-red-200" : "bg-card",
    )}>
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className={cn("text-2xl font-bold tabular-nums mt-1", low && "text-red-700")}>
        {formatQty(itemType, qty, unit)}
      </p>
    </div>
  );
}

// ─── Metadata editor (name/color/price/category/notes/threshold) ──────────

type MetadataDraft = {
  name: string;
  color?: string;
  color_hex?: string;
  season?: "summer" | "winter" | "none";
  price?: string;
  brand?: string;
  category?: string;
  unit_of_measure?: UnitOfMeasure;
  description: string;
  low_stock_threshold: string;
};

function MetadataCard({
  item, canEdit, unitLocked, onSaved,
}: {
  item: ResolvedItem;
  canEdit: boolean;
  unitLocked: boolean;
  onSaved: () => void;
}) {
  const initial = useMemo<MetadataDraft>(() => {
    if (item.kind === "fabric") {
      return {
        name: item.row.name,
        color: item.row.color ?? "",
        color_hex: item.row.color_hex ?? "",
        season: item.row.season ?? "none",
        price: item.row.price_per_meter == null ? "" : String(item.row.price_per_meter),
        description: item.row.description ?? "",
        low_stock_threshold: item.row.low_stock_threshold == null ? "" : String(item.row.low_stock_threshold),
      };
    }
    if (item.kind === "shelf") {
      return {
        name: item.row.type ?? "",
        brand: item.row.brand ?? "",
        price: item.row.price == null ? "" : String(item.row.price),
        description: item.row.description ?? "",
        low_stock_threshold: item.row.low_stock_threshold == null ? "" : String(item.row.low_stock_threshold),
      };
    }
    return {
      name: item.row.name,
      category: item.row.category,
      unit_of_measure: item.row.unit_of_measure,
      price: item.row.price == null ? "" : String(item.row.price),
      description: item.row.description ?? "",
      low_stock_threshold: item.row.low_stock_threshold == null ? "" : String(item.row.low_stock_threshold),
    };
  }, [item]);

  const [draft, setDraft] = useState<MetadataDraft>(initial);
  // Reset the edit buffer only when navigating to a *different* item — not on
  // every background refetch of the same one. Keying on `initial` directly
  // wiped in-progress unsaved edits whenever a list refetch / window refocus
  // returned a new object reference.
  const itemKey = `${item.kind}:${item.row.id}`;
  const lastItemKeyRef = useRef(itemKey);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  useEffect(() => {
    const keyChanged = lastItemKeyRef.current !== itemKey;
    if (keyChanged) lastItemKeyRef.current = itemKey;
    // Re-sync on navigation to another item, or when there are no unsaved
    // edits (picks up server-normalised values after a save). Never clobber
    // an in-progress dirty edit from a background refetch.
    if (keyChanged || !dirty) setDraft(initial);
  }, [itemKey, initial, dirty]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const lst = draft.low_stock_threshold.trim() === "" ? null : Number(draft.low_stock_threshold);
      if (lst != null && (!Number.isFinite(lst) || lst < 0)) {
        throw new Error("Low-stock threshold must be a positive number");
      }
      // Shelf low_stock_threshold is an integer column — a decimal would be
      // rejected/truncated by Postgres. Catch it here with a clear message.
      if (item.kind === "shelf" && lst != null && !Number.isInteger(lst)) {
        throw new Error("Shelf low-stock threshold must be a whole number");
      }
      // Same NaN footgun for price: type=number can still be bypassed by paste
      // / locale, and Number("abc") → NaN → opaque DB failure.
      const priceStr = (draft.price ?? "").trim();
      const price = priceStr === "" ? null : Number(priceStr);
      if (price != null && (!Number.isFinite(price) || price < 0)) {
        throw new Error("Price must be a positive number");
      }
      const desc = draft.description.trim() === "" ? null : draft.description.trim();
      // numeric() columns round-trip as string in Drizzle; integer() as number.
      const lstNumeric = lst;
      if (item.kind === "fabric") {
        await updateFabric(item.row.id, {
          name: draft.name.trim(),
          color: draft.color?.trim() || null,
          color_hex: draft.color_hex?.trim() || null,
          season: draft.season === "none" ? null : draft.season,
          price_per_meter: price,
          description: desc,
          low_stock_threshold: lstNumeric,
        });
      } else if (item.kind === "shelf") {
        await updateShelf(String(item.row.id), {
          type: draft.name.trim(),
          brand: draft.brand?.trim() || null,
          price,
          description: desc,
          low_stock_threshold: lst,
        });
      } else {
        const patch: Partial<Accessory> = {
          name: draft.name.trim(),
          category: (draft.category ?? "").trim().toLowerCase(),
          price,
          description: desc,
          low_stock_threshold: lstNumeric,
        };
        if (!unitLocked && draft.unit_of_measure) {
          patch.unit_of_measure = draft.unit_of_measure;
        }
        await updateAccessory(item.row.id, patch);
      }
    },
    onSuccess: () => { toast.success("Item updated"); onSaved(); },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not save: ${msg}`);
    },
  });

  return (
    <Card className="shadow-none">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Details</h2>
          {!canEdit && <span className="text-xs text-muted-foreground">Read only</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={item.kind === "shelf" ? "Type" : "Name"}>
            <Input
              value={draft.name}
              disabled={!canEdit}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>

          {item.kind === "fabric" && (
            <>
              <Field label="Color code">
                <Input
                  value={draft.color ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  placeholder="e.g. C04"
                />
              </Field>
              <Field label="Color swatch (hex)">
                <div className="flex gap-2">
                  <Input
                    value={draft.color_hex ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => setDraft((d) => ({ ...d, color_hex: e.target.value }))}
                    placeholder="#FFFFFF"
                  />
                  <input
                    type="color"
                    disabled={!canEdit}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5 disabled:opacity-50"
                    value={draft.color_hex || "#ffffff"}
                    onChange={(e) => setDraft((d) => ({ ...d, color_hex: e.target.value }))}
                  />
                </div>
              </Field>
              <Field label="Price per meter">
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  disabled={!canEdit}
                  value={draft.price ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                  placeholder="0.000"
                />
              </Field>
              <Field label="Season" hint="Optional">
                <select
                  disabled={!canEdit}
                  value={draft.season ?? "none"}
                  onChange={(e) => setDraft((d) => ({ ...d, season: e.target.value as "summer" | "winter" | "none" }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                >
                  <option value="none">No season</option>
                  <option value="summer">Summer</option>
                  <option value="winter">Winter</option>
                </select>
              </Field>
            </>
          )}

          {item.kind === "shelf" && (
            <>
              <Field label="Brand">
                <Input
                  value={draft.brand ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
                />
              </Field>
              <Field label="Price">
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  disabled={!canEdit}
                  value={draft.price ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                  placeholder="0.000"
                />
              </Field>
            </>
          )}

          {item.kind === "accessory" && (
            <>
              <Field label="Category">
                <Input
                  value={draft.category ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                />
              </Field>
              <Field
                label="Unit of measure"
                hint={unitLocked ? "Locked, already used in stock movements" : undefined}
              >
                <select
                  disabled={!canEdit || unitLocked}
                  value={draft.unit_of_measure ?? "pieces"}
                  onChange={(e) => setDraft((d) => ({ ...d, unit_of_measure: e.target.value as UnitOfMeasure }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                >
                  {(["pieces", "meters", "rolls", "kg"] as UnitOfMeasure[]).map((u) => (
                    <option key={u} value={u}>{UNIT_OF_MEASURE_LABELS[u] ?? u}</option>
                  ))}
                </select>
              </Field>
              <Field label="Price">
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  disabled={!canEdit}
                  value={draft.price ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                  placeholder="0.000"
                />
              </Field>
            </>
          )}

          <Field label={`Low-stock threshold`} hint={`Default: ${LOW_STOCK_DEFAULTS[item.kind]}`}>
            <Input
              type="number"
              step={item.kind === "shelf" ? "1" : "0.01"}
              min={0}
              disabled={!canEdit}
              value={draft.low_stock_threshold}
              onChange={(e) => setDraft((d) => ({ ...d, low_stock_threshold: e.target.value }))}
              placeholder="(use default)"
            />
          </Field>
        </div>

        <Separator />

        <Field label="Notes" hint="Optional">
          <Textarea
            rows={3}
            disabled={!canEdit}
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Anything worth remembering about this item: care notes, sourcing quirks, etc."
          />
        </Field>

        {canEdit && (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!dirty || saveMut.isPending}
              onClick={() => setDraft(initial)}
            >
              <X className="h-3.5 w-3.5 mr-1.5" /> Discard
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!dirty || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Save changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const LOW_STOCK_DEFAULTS: Record<ItemTypeParam, number> = { fabric: 5, shelf: 3, accessory: 10 };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground shrink-0">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Usage analytics ──────────────────────────────────────────────────────

function UsageSection({
  itemType, unit, stats, isLoading, topOrders, isTopLoading,
}: {
  itemType: StockItemType;
  unit: UnitOfMeasure | null;
  stats: { yesterday: number; last7d: number; last30d: number } | undefined;
  isLoading: boolean;
  topOrders: Array<{ order_id: number; total: number; last_at: string }>;
  isTopLoading: boolean;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5 space-y-4">
        <h2 className="text-base font-semibold">Usage in orders</h2>
        <div className="grid grid-cols-3 gap-3">
          <UsageCard label="Yesterday" qty={stats?.yesterday ?? 0} itemType={itemType} unit={unit} loading={isLoading} />
          <UsageCard label="Last 7 days" qty={stats?.last7d ?? 0} itemType={itemType} unit={unit} loading={isLoading} />
          <UsageCard label="Last 30 days" qty={stats?.last30d ?? 0} itemType={itemType} unit={unit} loading={isLoading} />
        </div>

        <div className="pt-1">
          <p className="text-sm font-medium text-muted-foreground mb-2">Top orders (30d)</p>
          {isTopLoading ? (
            <div className="space-y-1.5">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
            </div>
          ) : topOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No order consumption recorded in the last 30 days.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {topOrders.map((o) => (
                <li key={o.order_id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40">
                  <span className="text-sm font-medium">Order #{o.order_id}</span>
                  <span className="text-xs text-muted-foreground">
                    last {new Date(o.last_at).toLocaleDateString()}
                  </span>
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {formatQty(itemType, o.total, unit)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function UsageCard({
  label, qty, itemType, unit, loading,
}: { label: string; qty: number; itemType: StockItemType; unit: UnitOfMeasure | null; loading: boolean }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="h-6 w-16 mt-1" />
      ) : (
        <p className="text-xl font-bold tabular-nums mt-1">{formatQty(itemType, qty, unit)}</p>
      )}
    </div>
  );
}

// ─── Movements tab ────────────────────────────────────────────────────────

function MovementsTab({
  itemType, unit, movements, isLoading, isError,
}: {
  itemType: StockItemType;
  unit: UnitOfMeasure | null;
  movements: MovementWithJoins[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500/60" />
          <p className="text-sm text-muted-foreground">Couldn't load movement history. Try again shortly.</p>
        </CardContent>
      </Card>
    );
  }
  if (movements.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="py-3">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[120px]">Type</TableHead>
                <TableHead className="text-right w-[120px]">Qty</TableHead>
                <TableHead className="w-[110px]">Location</TableHead>
                <TableHead>Context</TableHead>
                <TableHead className="text-right w-[170px]">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => {
                const delta = Number(m.qty_delta);
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Badge className={cn(MOVEMENT_TYPE_COLORS[m.movement_type as keyof typeof MOVEMENT_TYPE_COLORS], "font-medium text-xs uppercase hover:bg-current")}>
                        {MOVEMENT_TYPE_LABELS[m.movement_type as keyof typeof MOVEMENT_TYPE_LABELS]}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums font-semibold", delta >= 0 ? "text-green-700" : "text-red-700")}>
                      {delta >= 0 ? "+" : ""}{formatQty(itemType, delta, unit)}
                    </TableCell>
                    <TableCell className="capitalize text-sm">{m.location}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[
                        m.supplier?.name,
                        m.movement_type === "waste" ? getWasteReasonLabel(m.reason ?? "") : m.reason,
                        m.notes,
                      ].filter(Boolean).join(" · ") || "-"}
                      {m.image_url && (
                        <a
                          href={m.image_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open waste photo in a new tab"
                          className="ml-2 inline-flex items-center gap-0.5 text-xs text-primary underline align-middle"
                        >
                          <ImageIcon className="h-3 w-3" /> photo
                        </a>
                      )}
                      {m.user?.name && <span className="ml-2 text-xs opacity-70">by {m.user.name}</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

// ─── Restock history tab ──────────────────────────────────────────────────

function RestocksTab({
  itemType, unit, entries, isLoading, isError,
}: {
  itemType: StockItemType;
  unit: UnitOfMeasure | null;
  entries: Array<{ id: number; created_at: string; qty: number; unit_cost: number | null; supplier: { id: number; name: string } | null; notes: string | null }>;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500/60" />
          <p className="text-sm text-muted-foreground">Couldn't load restock history. Try again shortly.</p>
        </CardContent>
      </Card>
    );
  }
  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">No restocks recorded yet.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="py-3">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-[170px]">Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right w-[120px]">Qty</TableHead>
                <TableHead className="text-right w-[120px]">Unit cost</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{e.supplier?.name ?? "-"}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-green-700">
                    +{formatQty(itemType, e.qty, unit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.unit_cost == null ? "-" : e.unit_cost.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.notes ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}
