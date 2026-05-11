import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Loader2, AlertCircle, Settings2, Hammer, Store, Plus, ScanBarcode } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Textarea } from "@repo/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Skeleton } from "@repo/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { getPermission } from "@/lib/rbac";
import {
  isLowStock, formatQty,
  MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_COLORS,
} from "@/lib/inventory";
import { getFabricById, createFabric, updateFabric } from "@/api/fabrics";
import { getShelfItemById, createShelfItem, updateShelfItem } from "@/api/shelf";
import { getAccessoryById, createAccessory, updateAccessory } from "@/api/accessories";
import { getSuppliers, createSupplier } from "@/api/suppliers";
import { getMovements } from "@/api/stockMovements";
import { UNIT_OF_MEASURE_LABELS } from "@/components/store/transfer-constants";
import { ImageUpload } from "@/components/inventory/ImageUpload";
import { CategoryCombobox } from "@/components/inventory/CategoryCombobox";
import { RestockDialog } from "@/components/inventory/RestockDialog";
import { AdjustStockDialog } from "@/components/inventory/AdjustStockDialog";
import { BarcodeScannerDialog } from "@/components/inventory/BarcodeScannerDialog";
import { getAccessories } from "@/api/accessories";
import type { Fabric, Shelf, Accessory, StockItemType, UnitOfMeasure, StockLocation, Supplier } from "@repo/database";

type ItemType = "fabric" | "shelf" | "accessory";

export const Route = createFileRoute("/(main)/store/inventory_/$type/$id")({
  component: InventoryItemPage,
  parseParams: ({ type, id }) => {
    if (type !== "fabric" && type !== "shelf" && type !== "accessory") {
      throw new Error(`Invalid inventory type: ${type}`);
    }
    return { type: type as ItemType, id };
  },
  head: ({ params }) => ({ meta: [{ title: params.id === "new" ? `New ${params.type}` : `Inventory · ${params.type}` }] }),
});

// ─────────────────────────────────────────────────────────────────────
// Form state — type-discriminated, with all fields nullable so we can
// reuse the same component for create + edit.

type FormState = {
  // common
  name: string;       // fabrics/accessories — "name"; shelf — "type"
  brand: string;      // shelf only (kept on all to simplify form state)
  color: string;
  color_hex: string;
  category: string;
  unit_of_measure: UnitOfMeasure;
  price: string;
  sku: string;
  default_supplier_id: number | null;
  low_stock_threshold: string;
  image_url: string | null;
  description: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  brand: "",
  color: "",
  color_hex: "",
  category: "",
  unit_of_measure: "pieces",
  price: "",
  sku: "",
  default_supplier_id: null,
  low_stock_threshold: "",
  image_url: null,
  description: "",
};

function fabricToForm(f: Fabric): FormState {
  return {
    ...EMPTY_FORM,
    name: f.name ?? "",
    color: f.color ?? "",
    color_hex: f.color_hex ?? "",
    price: f.price_per_meter == null ? "" : String(f.price_per_meter),
    sku: f.sku ?? "",
    default_supplier_id: f.default_supplier_id ?? null,
    low_stock_threshold: f.low_stock_threshold == null ? "" : String(f.low_stock_threshold),
    image_url: f.image_url ?? null,
    description: f.description ?? "",
  };
}

function shelfToForm(s: Shelf): FormState {
  return {
    ...EMPTY_FORM,
    name: s.type ?? "",
    brand: s.brand ?? "",
    price: s.price == null ? "" : String(s.price),
    sku: s.sku ?? "",
    default_supplier_id: s.default_supplier_id ?? null,
    low_stock_threshold: s.low_stock_threshold == null ? "" : String(s.low_stock_threshold),
    image_url: s.image_url ?? null,
    description: s.description ?? "",
  };
}

function accessoryToForm(a: Accessory): FormState {
  return {
    ...EMPTY_FORM,
    name: a.name ?? "",
    category: a.category ?? "",
    unit_of_measure: a.unit_of_measure ?? "pieces",
    price: a.price == null ? "" : String(a.price),
    sku: a.sku ?? "",
    default_supplier_id: a.default_supplier_id ?? null,
    low_stock_threshold: a.low_stock_threshold == null ? "" : String(a.low_stock_threshold),
    image_url: a.image_url ?? null,
    description: a.description ?? "",
  };
}

// ─────────────────────────────────────────────────────────────────────

function InventoryItemPage() {
  const { type, id } = Route.useParams();
  const isNew = id === "new";
  const numericId = isNew ? null : Number(id);

  if (!isNew && (numericId == null || Number.isNaN(numericId))) {
    return <NotFound type={type} />;
  }

  return <ItemDetail type={type} id={numericId} isNew={isNew} />;
}

function NotFound({ type }: { type: ItemType }) {
  return (
    <div className="px-4 sm:px-6 py-5 max-w-[1200px] mx-auto">
      <BackLink />
      <div className="border border-border rounded-md py-12 text-center bg-card mt-6">
        <AlertCircle className="h-6 w-6 mx-auto mb-2 text-[var(--status-bad)] opacity-70" />
        <p className="text-sm text-muted-foreground">This {type} could not be found.</p>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/store/inventory"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to inventory
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────

function ItemDetail({ type, id, isNew }: { type: ItemType; id: number | null; isNew: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = getPermission(
    user,
    type === "fabric" ? "inventory:fabrics" : type === "shelf" ? "inventory:shelf" : "inventory:accessories",
  ) === "full";
  const canRestock = getPermission(user, "inventory:restock") === "full";
  const canAdjust = getPermission(user, "inventory:adjust") === "full";

  // Load existing item (skip if creating)
  const itemQ = useQuery({
    queryKey: ["inventory-item", type, id],
    queryFn: async () => {
      if (id == null) return null;
      if (type === "fabric") return getFabricById(id);
      if (type === "shelf") return getShelfItemById(id);
      return getAccessoryById(id);
    },
    enabled: !isNew && id != null,
    staleTime: 30_000,
  });

  // Load suppliers
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: () => getSuppliers(), staleTime: 60_000 });

  // Categories — only needed for accessories
  const accessoryListQ = useQuery({
    queryKey: ["accessories"],
    queryFn: () => getAccessories(),
    enabled: type === "accessory",
    staleTime: 60_000,
  });
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    for (const a of accessoryListQ.data ?? []) if (a.category) set.add(a.category);
    return Array.from(set).sort();
  }, [accessoryListQ.data]);

  // Form state. Derived in view mode (from loaded item) so it stays in sync without
  // syncing-effects; in edit mode a separate buffer holds local changes.
  const viewForm = useMemo<FormState>(() => {
    const item = itemQ.data;
    if (!item) return EMPTY_FORM;
    if (type === "fabric") return fabricToForm(item as Fabric);
    if (type === "shelf") return shelfToForm(item as Shelf);
    return accessoryToForm(item as Accessory);
  }, [itemQ.data, type]);

  const [editing, setEditing] = useState(isNew);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const form = editing ? editForm : viewForm;
  const setForm = (next: FormState) => setEditForm(next);

  function startEdit() {
    setEditForm(viewForm);
    setEditing(true);
  }

  // Restock / Adjust dialog state
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockLocation, setRestockLocation] = useState<StockLocation>("workshop");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustLocation, setAdjustLocation] = useState<StockLocation>("workshop");

  // New supplier dialog
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);

  // ── Mutations ────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(type, form);
      if (isNew) {
        if (type === "fabric") return createFabric(payload as Parameters<typeof createFabric>[0]);
        if (type === "shelf") return createShelfItem(payload as Parameters<typeof createShelfItem>[0]);
        return createAccessory(payload as Parameters<typeof createAccessory>[0]);
      }
      if (id == null) throw new Error("Missing item id");
      if (type === "fabric") return updateFabric(id, payload as Partial<Fabric>);
      if (type === "shelf") return updateShelfItem(id, payload as Partial<Shelf>);
      return updateAccessory(id, payload as Partial<Accessory>);
    },
    onSuccess: (saved: Fabric | Shelf | Accessory) => {
      qc.invalidateQueries({ queryKey: [type === "fabric" ? "fabrics" : type === "shelf" ? "shelf" : "accessories"] });
      qc.invalidateQueries({ queryKey: ["inventory-item", type] });
      toast.success(isNew ? "Item created" : "Saved");
      if (isNew && saved && "id" in saved) {
        navigate({ to: "/store/inventory/$type/$id", params: { type, id: String(saved.id) } });
      } else {
        setEditing(false);
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(isNew ? `Could not create item: ${msg}` : `Could not save: ${msg}`);
    },
  });

  function handleCancel() {
    if (isNew) {
      navigate({ to: "/store/inventory" });
      return;
    }
    setEditing(false);
  }

  function handleSave() {
    const nameVal = form.name.trim();
    if (!nameVal) {
      toast.error(type === "shelf" ? "Type is required" : "Name is required");
      return;
    }
    if (type === "accessory" && !form.category.trim()) {
      toast.error("Category is required");
      return;
    }
    saveMut.mutate();
  }

  // ── Loading / error ─────────────────────────────────────────────
  if (!isNew && itemQ.isLoading) return <DetailSkeleton />;
  if (!isNew && itemQ.isError) {
    return (
      <div className="px-4 sm:px-6 py-5 max-w-[1200px] mx-auto">
        <BackLink />
        <div className="border border-border rounded-md py-10 text-center bg-card mt-6">
          <AlertCircle className="h-6 w-6 mx-auto mb-2 text-[var(--status-bad)] opacity-70" />
          <p className="text-sm text-muted-foreground">Failed to load item</p>
        </div>
      </div>
    );
  }
  if (!isNew && itemQ.data == null) return <NotFound type={type} />;

  const item = itemQ.data as Fabric | Shelf | Accessory | null | undefined;
  const workshopStock = item ? Number(item.workshop_stock ?? 0) : 0;
  const shopStock = item ? Number(item.shop_stock ?? 0) : 0;
  const unit: UnitOfMeasure | null = type === "accessory" && item ? (item as Accessory).unit_of_measure ?? null : null;

  const headingPrefix = type === "fabric" ? "Fabric" : type === "shelf" ? "Shelf item" : "Accessory";
  const heading = isNew ? `New ${headingPrefix.toLowerCase()}` : (item ? (type === "shelf" ? (item as Shelf).type : (item as Fabric | Accessory).name) ?? "" : "");

  const stockType: StockItemType = type === "fabric" ? "fabric" : type === "shelf" ? "shelf" : "accessory";

  return (
    <div className="px-4 sm:px-6 py-5 max-w-[1200px] mx-auto pb-10">
      <div className="mb-4">
        <BackLink />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-1">{headingPrefix}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{heading || "—"}</h1>
        </div>
        {!isNew && !editing && canEdit && (
          <Button size="sm" variant="outline" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT — details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Image */}
          <div className="border border-border rounded-md bg-card p-4">
            <Label className="text-sm font-medium text-muted-foreground mb-3 block">Image</Label>
            {isNew ? (
              <p className="text-xs text-muted-foreground">Save the item first, then add an image.</p>
            ) : id != null && (
              <ImageUpload
                itemType={type}
                itemId={id}
                value={form.image_url}
                onChange={(url) => {
                  if (id == null) return;
                  // Persist immediately — image upload is a discrete action, decoupled from metadata save
                  const patch = { image_url: url };
                  const p = type === "fabric"
                    ? updateFabric(id, patch as Partial<Fabric>)
                    : type === "shelf"
                      ? updateShelfItem(id, patch as Partial<Shelf>)
                      : updateAccessory(id, patch as Partial<Accessory>);
                  p.then(() => qc.invalidateQueries({ queryKey: ["inventory-item", type, id] }));
                  // Keep edit buffer in sync so a subsequent Save doesn't revert it
                  if (editing) setEditForm({ ...editForm, image_url: url });
                }}
                readOnly={!canEdit}
              />
            )}
          </div>

          {/* Details */}
          <div className="border border-border rounded-md bg-card">
            <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Details</h3>
            </div>
            <div className="p-4 space-y-4">
              <DetailsForm
                type={type}
                form={form}
                onChange={setForm}
                editing={editing}
                suppliers={suppliersQ.data ?? []}
                existingCategories={existingCategories}
                onNewSupplier={() => setNewSupplierOpen(true)}
              />
              {editing && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saveMut.isPending}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saveMut.isPending}>
                    {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                    {isNew ? "Create" : "Save changes"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — stock + movements (hidden in create mode) */}
        {!isNew && item && id != null && (
          <div className="space-y-5">
            <StockPanel
              type={stockType}
              unit={unit}
              workshopStock={workshopStock}
              shopStock={shopStock}
              threshold={form.low_stock_threshold ? Number(form.low_stock_threshold) : null}
              canRestock={canRestock}
              canAdjust={canAdjust}
              onRestock={(loc) => { setRestockLocation(loc); setRestockOpen(true); }}
              onAdjust={(loc) => { setAdjustLocation(loc); setAdjustOpen(true); }}
            />
            <MovementsPanel itemType={stockType} itemId={id} unit={unit} />
          </div>
        )}
      </div>

      {/* Dialogs */}
      {!isNew && id != null && (
        <>
          <RestockDialog
            open={restockOpen}
            onClose={() => setRestockOpen(false)}
            itemType={stockType}
            itemId={id}
            itemName={heading}
            defaultLocation={restockLocation}
            currentStock={restockLocation === "shop" ? shopStock : workshopStock}
            unit={unit}
          />
          <AdjustStockDialog
            open={adjustOpen}
            onClose={() => setAdjustOpen(false)}
            itemType={stockType}
            itemId={id}
            itemName={heading}
            defaultLocation={adjustLocation}
            currentStock={adjustLocation === "shop" ? shopStock : workshopStock}
            unit={unit}
          />
        </>
      )}

      <NewSupplierDialog
        open={newSupplierOpen}
        onClose={() => setNewSupplierOpen(false)}
        onCreated={(s) => {
          setEditForm((prev) => ({ ...prev, default_supplier_id: s.id }));
          qc.invalidateQueries({ queryKey: ["suppliers"] });
        }}
      />
    </div>
  );
}

function buildPayload(type: ItemType, form: FormState): Record<string, unknown> {
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const txt = (s: string) => (s.trim() === "" ? null : s.trim());

  if (type === "fabric") {
    return {
      name: form.name.trim(),
      color: txt(form.color),
      color_hex: txt(form.color_hex),
      price_per_meter: num(form.price),
      sku: txt(form.sku),
      default_supplier_id: form.default_supplier_id,
      low_stock_threshold: num(form.low_stock_threshold),
      description: txt(form.description),
      image_url: form.image_url,
    };
  }
  if (type === "shelf") {
    return {
      type: form.name.trim(),
      brand: txt(form.brand),
      price: num(form.price),
      sku: txt(form.sku),
      default_supplier_id: form.default_supplier_id,
      low_stock_threshold: num(form.low_stock_threshold),
      description: txt(form.description),
      image_url: form.image_url,
    };
  }
  return {
    name: form.name.trim(),
    category: form.category.trim().toLowerCase(),
    unit_of_measure: form.unit_of_measure,
    price: num(form.price),
    sku: txt(form.sku),
    default_supplier_id: form.default_supplier_id,
    low_stock_threshold: num(form.low_stock_threshold),
    description: txt(form.description),
    image_url: form.image_url,
  };
}

// ─────────────────────────────────────────────────────────────────────

function DetailsForm({
  type, form, onChange, editing, suppliers, existingCategories, onNewSupplier,
}: {
  type: ItemType;
  form: FormState;
  onChange: (next: FormState) => void;
  editing: boolean;
  suppliers: Supplier[];
  existingCategories: string[];
  onNewSupplier: () => void;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...form, [k]: v });
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
      {/* Name / type */}
      <Field label={type === "shelf" ? "Type" : "Name"} required={editing}>
        {editing ? (
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={type === "shelf" ? "e.g. Ready-made dishdasha" : "e.g. Cotton premium"} />
        ) : (
          <Value>{form.name || "—"}</Value>
        )}
      </Field>

      {/* Fabric: color + swatch */}
      {type === "fabric" && (
        <>
          <Field label="Color code">
            {editing ? (
              <Input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="e.g. C04" />
            ) : (
              <Value>{form.color || "—"}</Value>
            )}
          </Field>
          <Field label="Swatch">
            {editing ? (
              <div className="flex gap-2 items-center">
                <Input value={form.color_hex} onChange={(e) => set("color_hex", e.target.value)} placeholder="#FFFFFF" className="flex-1" />
                <input
                  type="color"
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  value={form.color_hex || "#ffffff"}
                  onChange={(e) => set("color_hex", e.target.value)}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {form.color_hex && (
                  <span className="w-4 h-4 rounded-full border shrink-0" style={{ backgroundColor: form.color_hex }} />
                )}
                <Value>{form.color_hex || "—"}</Value>
              </div>
            )}
          </Field>
        </>
      )}

      {/* Shelf: brand */}
      {type === "shelf" && (
        <Field label="Brand">
          {editing ? (
            <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Optional" />
          ) : (
            <Value>{form.brand || "—"}</Value>
          )}
        </Field>
      )}

      {/* Accessory: category + unit */}
      {type === "accessory" && (
        <>
          <Field label="Category" required={editing}>
            {editing ? (
              <CategoryCombobox value={form.category} onChange={(v) => set("category", v)} existing={existingCategories} />
            ) : (
              <Value className="capitalize">{form.category || "—"}</Value>
            )}
          </Field>
          <Field label="Unit of measure">
            {editing ? (
              <Select value={form.unit_of_measure} onValueChange={(v) => set("unit_of_measure", v as UnitOfMeasure)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["pieces", "meters", "rolls", "kg"] as UnitOfMeasure[]).map((u) => (
                    <SelectItem key={u} value={u}>{UNIT_OF_MEASURE_LABELS[u] ?? u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Value>{UNIT_OF_MEASURE_LABELS[form.unit_of_measure] ?? form.unit_of_measure}</Value>
            )}
          </Field>
        </>
      )}

      {/* Price */}
      <Field label={type === "fabric" ? "Price per meter" : "Price"}>
        {editing ? (
          <Input type="number" step="0.001" min={0} value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="0.000" />
        ) : (
          <Value className="tabular-nums">{form.price || "—"}</Value>
        )}
      </Field>

      {/* SKU */}
      <Field label="SKU / Barcode">
        {editing ? (
          <div className="flex gap-2">
            <Input
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="Optional"
              className="flex-1 font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScannerOpen(true)}
              title="Scan barcode with camera"
            >
              <ScanBarcode className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Value className="font-mono text-sm">{form.sku || "—"}</Value>
        )}
      </Field>

      {/* Supplier */}
      <Field label="Default supplier">
        {editing ? (
          <div className="flex gap-2">
            <Select
              value={form.default_supplier_id == null ? "none" : String(form.default_supplier_id)}
              onValueChange={(v) => set("default_supplier_id", v === "none" ? null : Number(v))}
            >
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No default —</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={onNewSupplier} title="Add new supplier">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Value>{suppliers.find((s) => s.id === form.default_supplier_id)?.name ?? "—"}</Value>
        )}
      </Field>

      {/* Low stock threshold */}
      <Field label="Low-stock threshold" hint="Override the default warning level">
        {editing ? (
          <Input type="number" step="0.01" min={0} value={form.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} placeholder="Default" />
        ) : (
          <Value className="tabular-nums">{form.low_stock_threshold || "Default"}</Value>
        )}
      </Field>

      {/* Description — full width */}
      <div className="md:col-span-2">
        <Field label="Description / notes">
          {editing ? (
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              placeholder="Care instructions, supplier notes, anything else worth tracking…"
            />
          ) : (
            <Value className="whitespace-pre-wrap">{form.description || "—"}</Value>
          )}
        </Field>
      </div>

      <BarcodeScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={(code) => {
          set("sku", code);
          setScannerOpen(false);
          toast.success(`Scanned: ${code}`);
        }}
      />
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs text-muted-foreground">
          {label}{required && <span className="text-[var(--status-bad)] ml-0.5">*</span>}
        </Label>
        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Value({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-sm", className)}>{children}</p>;
}

// ─────────────────────────────────────────────────────────────────────

function StockPanel({
  type, unit, workshopStock, shopStock, threshold, canRestock, canAdjust, onRestock, onAdjust,
}: {
  type: StockItemType;
  unit: UnitOfMeasure | null;
  workshopStock: number;
  shopStock: number;
  threshold: number | null;
  canRestock: boolean;
  canAdjust: boolean;
  onRestock: (loc: StockLocation) => void;
  onAdjust: (loc: StockLocation) => void;
}) {
  const effectiveThreshold = threshold ?? undefined;
  const lowWorkshop = effectiveThreshold != null ? workshopStock < effectiveThreshold : isLowStock(type, workshopStock);
  const lowShop = effectiveThreshold != null ? shopStock < effectiveThreshold : isLowStock(type, shopStock);
  const total = workshopStock + shopStock;

  return (
    <div className="border border-border rounded-md bg-card">
      <div className="px-4 py-2.5 border-b bg-muted/30">
        <h3 className="text-sm font-medium text-muted-foreground">Stock</h3>
      </div>
      <div className="p-4 space-y-3">
        <StockRow label="Workshop" qty={workshopStock} type={type} unit={unit} low={lowWorkshop} />
        <StockRow label="Shop" qty={shopStock} type={type} unit={unit} low={lowShop} />
        <div className="pt-2 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-base font-semibold tabular-nums">{formatQty(type, total, unit)}</span>
        </div>

        {(canRestock || canAdjust) && (
          <div className="flex flex-col gap-1.5 pt-2">
            {canRestock && (
              <>
                <Button size="sm" variant="default" onClick={() => onRestock("workshop")}>
                  <Hammer className="h-3.5 w-3.5 mr-1.5" /> Restock workshop
                </Button>
                <Button size="sm" variant="outline" onClick={() => onRestock("shop")}>
                  <Store className="h-3.5 w-3.5 mr-1.5" /> Restock shop
                </Button>
              </>
            )}
            {canAdjust && (
              <Button size="sm" variant="ghost" onClick={() => onAdjust(workshopStock >= shopStock ? "workshop" : "shop")}>
                <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Adjust stock
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StockRow({ label, qty, type, unit, low }: { label: string; qty: number; type: StockItemType; unit: UnitOfMeasure | null; low: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm tabular-nums", low && "text-[var(--status-bad)] font-medium")}>
        {formatQty(type, qty, unit)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function MovementsPanel({ itemType, itemId, unit }: { itemType: StockItemType; itemId: number; unit: UnitOfMeasure | null }) {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["stock_movements", itemType, itemId],
    queryFn: () => getMovements({ itemType, itemId, limit: 30 }),
    staleTime: 30_000,
  });

  return (
    <div className="border border-border rounded-md bg-card">
      <div className="px-4 py-2.5 border-b bg-muted/30">
        <h3 className="text-sm font-medium text-muted-foreground">Recent movements</h3>
      </div>
      <div className="p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : movements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No movements yet</p>
        ) : (
          <div className="space-y-0.5 max-h-[420px] overflow-y-auto">
            {movements.map((m) => (
              <div key={m.id} className="px-2 py-1.5 rounded-md hover:bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium", MOVEMENT_TYPE_COLORS[m.movement_type])}>
                    {MOVEMENT_TYPE_LABELS[m.movement_type]}
                  </span>
                  <span className={cn("text-sm tabular-nums font-medium", Number(m.qty_delta) >= 0 ? "text-[var(--status-ok)]" : "text-[var(--status-bad)]")}>
                    {Number(m.qty_delta) >= 0 ? "+" : ""}{formatQty(itemType, Number(m.qty_delta), unit)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-0.5 truncate">
                  <span className="truncate">
                    {[m.supplier?.name, m.reason, m.notes].filter(Boolean).join(" · ") || m.location}
                  </span>
                  <span className="shrink-0 ml-2">{new Date(m.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function NewSupplierDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: Supplier) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const mut = useMutation({
    mutationFn: () => createSupplier({ name: name.trim(), phone: phone.trim() || undefined }),
    onSuccess: (s) => { onCreated(s); setName(""); setPhone(""); onClose(); toast.success("Supplier created"); },
    onError: (err: unknown) => toast.error(`Could not create supplier: ${err instanceof Error ? err.message : String(err)}`),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New supplier</DialogTitle>
          <DialogDescription>Suppliers are shared across fabrics, shelf items and accessories.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Al-Mansour Textiles" autoFocus />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Phone (optional)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+965 ..." />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Create supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="px-4 sm:px-6 py-5 max-w-[1200px] mx-auto pb-10">
      <BackLink />
      <div className="mt-4 mb-6">
        <Skeleton className="h-3 w-16 mb-2" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Skeleton className="h-48 rounded-md" />
          <Skeleton className="h-80 rounded-md" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-56 rounded-md" />
          <Skeleton className="h-64 rounded-md" />
        </div>
      </div>
    </div>
  );
}
