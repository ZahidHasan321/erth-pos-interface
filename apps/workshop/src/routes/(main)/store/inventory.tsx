import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Package } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import {
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

import { getFabrics, createFabric, updateFabric } from "@/api/fabrics";
import { getShelf, createShelfItem, updateShelfItem } from "@/api/shelf";
import {
  getAccessories,
  createAccessory,
  updateAccessory,
} from "@/api/accessories";
import { PageHeader, LoadingSkeleton } from "@/components/shared/PageShell";
import {
  ACCESSORY_CATEGORY_LABELS,
  UNIT_OF_MEASURE_LABELS,
} from "@/components/store/transfer-constants";
import type { Fabric, Shelf, Accessory } from "@repo/database";

export const Route = createFileRoute("/(main)/store/inventory")({
  component: InventoryPage,
  head: () => ({ meta: [{ title: "Inventory Management" }] }),
});

function InventoryPage() {
  const [activeTab, setActiveTab] = useState("fabric");

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader icon={Package} title="Inventory Management" subtitle="Create and manage fabrics, shelf items, and accessories" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="fabric">Fabrics</TabsTrigger>
          <TabsTrigger value="shelf">Shelf Items</TabsTrigger>
          <TabsTrigger value="accessory">Accessories</TabsTrigger>
        </TabsList>

        <TabsContent value="fabric">
          <FabricsTab />
        </TabsContent>
        <TabsContent value="shelf">
          <ShelfTab />
        </TabsContent>
        <TabsContent value="accessory">
          <AccessoriesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Fabrics ───────────────────────────────────────────────────────────

function FabricsTab() {
  const qc = useQueryClient();
  const { data: fabrics = [], isLoading } = useQuery({
    queryKey: ["fabrics"],
    queryFn: getFabrics,
    staleTime: 60_000,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fabric | null>(null);

  const createMut = useMutation({
    mutationFn: createFabric,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fabrics"] });
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create fabric"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<Fabric>) =>
      updateFabric(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fabrics"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update fabric"),
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (f: Fabric) => {
    setEditing(f);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const color = (fd.get("color") as string).trim() || undefined;
    const color_hex = (fd.get("color_hex") as string).trim() || undefined;
    const price_per_meter = fd.get("price_per_meter")
      ? Number(fd.get("price_per_meter"))
      : undefined;
    const workshop_stock = fd.get("workshop_stock")
      ? Number(fd.get("workshop_stock"))
      : undefined;

    if (!name) {
      toast.error("Name is required");
      return;
    }

    if (editing) {
      updateMut.mutate({
        id: editing.id,
        name,
        color: color ?? null,
        color_hex: color_hex ?? null,
        price_per_meter: price_per_meter ?? null,
        workshop_stock: workshop_stock ?? 0,
      });
    } else {
      createMut.mutate({
        name,
        color,
        color_hex,
        price_per_meter,
        workshop_stock,
      });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  if (isLoading) return <LoadingSkeleton count={3} />;

  return (
    <>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {fabrics.length} fabric(s)
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Add Fabric
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Color Code</TableHead>
                <TableHead className="text-right">Price/m</TableHead>
                <TableHead className="text-right">Workshop Stock</TableHead>
                <TableHead className="text-right">Shop Stock</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fabrics.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {f.color_hex && (
                        <span
                          className="w-4 h-4 rounded-full border"
                          style={{ backgroundColor: f.color_hex }}
                        />
                      )}
                      {f.name}
                    </div>
                  </TableCell>
                  <TableCell>{f.color ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.price_per_meter ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.workshop_stock ?? 0}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.shop_stock ?? 0}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(f)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {fabrics.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No fabrics yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Fabric" : "Add Fabric"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fab-name">Name *</Label>
              <Input
                id="fab-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fab-color">Color Code</Label>
                <Input
                  id="fab-color"
                  name="color"
                  placeholder="e.g. C04"
                  defaultValue={editing?.color ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fab-hex">Color Hex</Label>
                <div className="flex gap-2">
                  <Input
                    id="fab-hex"
                    name="color_hex"
                    placeholder="#FFFFFF"
                    defaultValue={editing?.color_hex ?? ""}
                    className="flex-1"
                  />
                  <input
                    type="color"
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                    defaultValue={editing?.color_hex || "#ffffff"}
                    onChange={(e) => {
                      const hexInput = document.getElementById("fab-hex") as HTMLInputElement;
                      if (hexInput) hexInput.value = e.target.value;
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fab-price">Price per Meter</Label>
                <Input
                  id="fab-price"
                  name="price_per_meter"
                  type="number"
                  step="0.001"
                  min={0}
                  defaultValue={editing?.price_per_meter ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fab-stock">Workshop Stock (m)</Label>
                <Input
                  id="fab-stock"
                  name="workshop_stock"
                  type="number"
                  step="0.5"
                  min={0}
                  defaultValue={editing?.workshop_stock ?? 0}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                )}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Shelf Items ──────────────────────────────────────────────────────

function ShelfTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["shelf"],
    queryFn: getShelf,
    staleTime: 60_000,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Shelf | null>(null);

  const createMut = useMutation({
    mutationFn: createShelfItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shelf"] });
      setDialogOpen(false);
    },
    onError: (e: any) =>
      toast.error(e.message ?? "Failed to create shelf item"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<Shelf>) =>
      updateShelfItem(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shelf"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: any) =>
      toast.error(e.message ?? "Failed to update shelf item"),
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (s: Shelf) => {
    setEditing(s);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = (fd.get("type") as string).trim();
    const brand = (fd.get("brand") as string).trim() || undefined;
    const price = fd.get("price") ? Number(fd.get("price")) : undefined;
    const workshop_stock = fd.get("workshop_stock")
      ? Number(fd.get("workshop_stock"))
      : undefined;

    if (!type) {
      toast.error("Type is required");
      return;
    }

    if (editing) {
      updateMut.mutate({
        id: editing.id,
        type,
        brand: brand ?? null,
        price: price ?? null,
        workshop_stock: workshop_stock ?? 0,
      });
    } else {
      createMut.mutate({ type, brand, price, workshop_stock });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  if (isLoading) return <LoadingSkeleton count={3} />;

  return (
    <>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {items.length} shelf item(s)
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Add Shelf Item
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Workshop Stock</TableHead>
                <TableHead className="text-right">Shop Stock</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.type}</TableCell>
                  <TableCell>{s.brand ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.price ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.workshop_stock ?? 0}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.shop_stock ?? 0}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No shelf items yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Shelf Item" : "Add Shelf Item"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shelf-type">Type *</Label>
              <Input
                id="shelf-type"
                name="type"
                defaultValue={editing?.type ?? ""}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="shelf-brand">Brand</Label>
                <Input
                  id="shelf-brand"
                  name="brand"
                  defaultValue={editing?.brand ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shelf-price">Price</Label>
                <Input
                  id="shelf-price"
                  name="price"
                  type="number"
                  step="0.001"
                  min={0}
                  defaultValue={editing?.price ?? ""}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shelf-stock">Workshop Stock</Label>
              <Input
                id="shelf-stock"
                name="workshop_stock"
                type="number"
                min={0}
                defaultValue={editing?.workshop_stock ?? 0}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                )}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Accessories ──────────────────────────────────────────────────────

const CATEGORIES = [
  "buttons",
  "zippers",
  "thread",
  "lining",
  "elastic",
  "interlining",
  "other",
] as const;

const UNITS = ["pieces", "meters", "rolls", "kg"] as const;

function AccessoriesTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["accessories"],
    queryFn: getAccessories,
    staleTime: 60_000,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Accessory | null>(null);

  const createMut = useMutation({
    mutationFn: createAccessory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accessories"] });
      setDialogOpen(false);
    },
    onError: (e: any) =>
      toast.error(e.message ?? "Failed to create accessory"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<Accessory>) =>
      updateAccessory(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accessories"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: any) =>
      toast.error(e.message ?? "Failed to update accessory"),
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (a: Accessory) => {
    setEditing(a);
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const category = fd.get("category") as string;
    const unit_of_measure = fd.get("unit_of_measure") as string;
    const price = fd.get("price") ? Number(fd.get("price")) : undefined;
    const workshop_stock = fd.get("workshop_stock")
      ? Number(fd.get("workshop_stock"))
      : undefined;

    if (!name || !category) {
      toast.error("Name and category are required");
      return;
    }

    if (editing) {
      updateMut.mutate({
        id: editing.id,
        name,
        category: category as Accessory["category"],
        unit_of_measure: unit_of_measure as Accessory["unit_of_measure"],
        price: price ?? null,
        workshop_stock: workshop_stock ?? 0,
      });
    } else {
      createMut.mutate({
        name,
        category: category as Accessory["category"],
        unit_of_measure: (unit_of_measure || "pieces") as Accessory["unit_of_measure"],
        price,
        workshop_stock,
      } as any);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  if (isLoading) return <LoadingSkeleton count={3} />;

  return (
    <>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {items.length} accessory(ies)
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Add Accessory
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Workshop Stock</TableHead>
                <TableHead className="text-right">Shop Stock</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>
                    {ACCESSORY_CATEGORY_LABELS[a.category] ?? a.category}
                  </TableCell>
                  <TableCell>
                    {UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ??
                      a.unit_of_measure}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.price ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.workshop_stock ?? 0}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.shop_stock ?? 0}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(a)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    No accessories yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Accessory" : "Add Accessory"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="acc-name">Name *</Label>
              <Input
                id="acc-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="acc-category">Category *</Label>
                <Select
                  name="category"
                  defaultValue={editing?.category ?? "other"}
                >
                  <SelectTrigger id="acc-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {ACCESSORY_CATEGORY_LABELS[c] ?? c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-unit">Unit of Measure</Label>
                <Select
                  name="unit_of_measure"
                  defaultValue={editing?.unit_of_measure ?? "pieces"}
                >
                  <SelectTrigger id="acc-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {UNIT_OF_MEASURE_LABELS[u] ?? u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="acc-price">Price</Label>
                <Input
                  id="acc-price"
                  name="price"
                  type="number"
                  step="0.001"
                  min={0}
                  defaultValue={editing?.price ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="acc-stock">Workshop Stock</Label>
                <Input
                  id="acc-stock"
                  name="workshop_stock"
                  type="number"
                  step="0.5"
                  min={0}
                  defaultValue={editing?.workshop_stock ?? 0}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                )}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
