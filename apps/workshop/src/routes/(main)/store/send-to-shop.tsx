import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, Plus, Minus, Package } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";

import { getFabrics } from "@/api/fabrics";
import { getShelf } from "@/api/shelf";
import { getAccessories } from "@/api/accessories";
import {
  createTransferRequest,
  dispatchTransfer,
} from "@/api/transfers";
import { db } from "@/lib/db";
import { useAuth } from "@/context/auth";
import { PageHeader, EmptyState } from "@/components/shared/PageShell";
import {
  ACCESSORY_CATEGORY_LABELS,
  UNIT_OF_MEASURE_LABELS,
} from "@/components/store/transfer-constants";
import type { Fabric, Shelf, Accessory } from "@repo/database";

export const Route = createFileRoute("/(main)/store/send-to-shop")({
  component: SendToShopPage,
  head: () => ({ meta: [{ title: "Send to Shop" }] }),
});

function SendToShopPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("fabric");
  const [notes, setNotes] = useState("");
  const [fabricSelections, setFabricSelections] = useState<Map<number, number>>(new Map());
  const [shelfSelections, setShelfSelections] = useState<Map<number, number>>(new Map());
  const [accessorySelections, setAccessorySelections] = useState<Map<number, number>>(new Map());

  const { data: fabrics = [] } = useQuery({ queryKey: ["fabrics"], queryFn: getFabrics, staleTime: 60_000 });
  const { data: shelfItems = [] } = useQuery({ queryKey: ["shelf"], queryFn: getShelf, staleTime: 60_000 });
  const { data: accessories = [] } = useQuery({ queryKey: ["accessories"], queryFn: getAccessories, staleTime: 60_000 });

  const [submitting, setSubmitting] = useState(false);

  const updateQty = (
    selections: Map<number, number>,
    setSelections: (m: Map<number, number>) => void,
    id: number,
    qty: number,
  ) => {
    const next = new Map(selections);
    if (qty <= 0) next.delete(id); else next.set(id, qty);
    setSelections(next);
  };

  const handleSend = async () => {
    const batches: { item_type: string; items: any[]; idField: string }[] = [];

    if (fabricSelections.size > 0) {
      batches.push({
        item_type: "fabric",
        idField: "fabric_id",
        items: Array.from(fabricSelections.entries()).map(([id, qty]) => ({ fabric_id: id, requested_qty: qty })),
      });
    }
    if (shelfSelections.size > 0) {
      batches.push({
        item_type: "shelf",
        idField: "shelf_id",
        items: Array.from(shelfSelections.entries()).map(([id, qty]) => ({ shelf_id: id, requested_qty: qty })),
      });
    }
    if (accessorySelections.size > 0) {
      batches.push({
        item_type: "accessory",
        idField: "accessory_id",
        items: Array.from(accessorySelections.entries()).map(([id, qty]) => ({ accessory_id: id, requested_qty: qty })),
      });
    }

    if (batches.length === 0) {
      toast.error("Select at least one item to send");
      return;
    }

    setSubmitting(true);
    try {
      for (const batch of batches) {
        // 1. Create a transfer request (workshop_to_shop, auto-approved)
        const transfer = await createTransferRequest({
          direction: "workshop_to_shop",
          item_type: batch.item_type,
          requested_by: user!.id,
          notes: notes || undefined,
          items: batch.items,
        });

        // 2. Approve it immediately (set approved_qty = requested_qty)
        const { data: createdItems, error: fetchError } = await db
          .from("transfer_request_items")
          .select("id, requested_qty")
          .eq("transfer_request_id", transfer.id);

        if (fetchError) throw fetchError;

        for (const item of createdItems ?? []) {
          await db
            .from("transfer_request_items")
            .update({ approved_qty: item.requested_qty })
            .eq("id", item.id);
        }

        await db
          .from("transfer_requests")
          .update({ status: "approved", approved_at: new Date().toISOString() })
          .eq("id", transfer.id);

        // 3. Dispatch (calls the RPC which adjusts stock)
        const dispatchItems = (createdItems ?? []).map((item) => ({
          id: item.id,
          dispatched_qty: Number(item.requested_qty),
        }));

        await dispatchTransfer(transfer.id, user!.id, dispatchItems);
      }

      setFabricSelections(new Map());
      setShelfSelections(new Map());
      setAccessorySelections(new Map());
      setNotes("");
      qc.invalidateQueries({ queryKey: ["fabrics"] });
      qc.invalidateQueries({ queryKey: ["shelf"] });
      qc.invalidateQueries({ queryKey: ["accessories"] });
      qc.invalidateQueries({ queryKey: ["transfer-requests"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send items");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSelected = fabricSelections.size + shelfSelections.size + accessorySelections.size;

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader icon={Send} title="Send to Shop" subtitle="Proactively dispatch items from the workshop to the shop" />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
              <TabsTrigger value="fabric">
                Fabrics
                {fabricSelections.size > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5">
                    {fabricSelections.size}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="shelf">
                Shelf Items
                {shelfSelections.size > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5">
                    {shelfSelections.size}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="accessory">
                Accessories
                {accessorySelections.size > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5">
                    {accessorySelections.size}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="fabric">
              <FabricTable
                fabrics={fabrics}
                selections={fabricSelections}
                onUpdate={(id, qty) => updateQty(fabricSelections, setFabricSelections, id, qty)}
              />
            </TabsContent>

            <TabsContent value="shelf">
              <ShelfTable
                items={shelfItems}
                selections={shelfSelections}
                onUpdate={(id, qty) => updateQty(shelfSelections, setShelfSelections, id, qty)}
              />
            </TabsContent>

            <TabsContent value="accessory">
              <AccessoryTable
                items={accessories}
                selections={accessorySelections}
                onUpdate={(id, qty) => updateQty(accessorySelections, setAccessorySelections, id, qty)}
              />
            </TabsContent>
          </Tabs>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea
              placeholder="Any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              {totalSelected} item(s) selected
            </p>
            <Button onClick={handleSend} disabled={totalSelected === 0 || submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send to Shop
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tables ───────────────────────────────────────────────────────────

function FabricTable({
  fabrics,
  selections,
  onUpdate,
}: {
  fabrics: Fabric[];
  selections: Map<number, number>;
  onUpdate: (id: number, qty: number) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Workshop Stock</TableHead>
          <TableHead className="text-right">Shop Stock</TableHead>
          <TableHead className="text-right w-[160px]">Send Qty (m)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fabrics.map((f) => {
          const stock = Number(f.workshop_stock ?? 0);
          const noStock = stock <= 0;
          return (
            <TableRow key={f.id} className={noStock ? "opacity-50" : ""}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {f.color_hex && (
                    <span className="w-4 h-4 rounded-full border" style={{ backgroundColor: f.color_hex }} />
                  )}
                  {f.name}
                  {noStock && <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">No stock</span>}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{stock}</TableCell>
              <TableCell className="text-right tabular-nums">{f.shop_stock ?? 0}</TableCell>
              <TableCell className="text-right">
                {noStock ? (
                  <span className="text-xs text-muted-foreground">Unavailable</span>
                ) : (
                  <QtyInput value={selections.get(f.id) ?? 0} onChange={(v) => onUpdate(f.id, v)} step={0.5} max={stock} />
                )}
              </TableCell>
            </TableRow>
          );
        })}
        {fabrics.length === 0 && (
          <TableRow><TableCell colSpan={4}><EmptyState icon={Package} message="No fabrics found" /></TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function ShelfTable({
  items,
  selections,
  onUpdate,
}: {
  items: Shelf[];
  selections: Map<number, number>;
  onUpdate: (id: number, qty: number) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead className="text-right">Workshop Stock</TableHead>
          <TableHead className="text-right">Shop Stock</TableHead>
          <TableHead className="text-right w-[160px]">Send Qty</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((s) => {
          const stock = Number(s.workshop_stock ?? 0);
          const noStock = stock <= 0;
          return (
            <TableRow key={s.id} className={noStock ? "opacity-50" : ""}>
              <TableCell className="font-medium">{s.type}</TableCell>
              <TableCell>{s.brand ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{stock}</TableCell>
              <TableCell className="text-right tabular-nums">{s.shop_stock ?? 0}</TableCell>
              <TableCell className="text-right">
                {noStock ? (
                  <span className="text-xs text-muted-foreground">Unavailable</span>
                ) : (
                  <QtyInput value={selections.get(s.id) ?? 0} onChange={(v) => onUpdate(s.id, v)} max={stock} />
                )}
              </TableCell>
            </TableRow>
          );
        })}
        {items.length === 0 && (
          <TableRow><TableCell colSpan={5}><EmptyState icon={Package} message="No shelf items found" /></TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function AccessoryTable({
  items,
  selections,
  onUpdate,
}: {
  items: Accessory[];
  selections: Map<number, number>;
  onUpdate: (id: number, qty: number) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead className="text-right">Workshop Stock</TableHead>
          <TableHead className="text-right">Shop Stock</TableHead>
          <TableHead className="text-right w-[160px]">Send Qty</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((a) => {
          const stock = Number(a.workshop_stock ?? 0);
          const noStock = stock <= 0;
          const step = a.unit_of_measure === "meters" || a.unit_of_measure === "kg" ? 0.5 : 1;
          return (
            <TableRow key={a.id} className={noStock ? "opacity-50" : ""}>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell>{ACCESSORY_CATEGORY_LABELS[a.category] ?? a.category}</TableCell>
              <TableCell>{UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ?? a.unit_of_measure}</TableCell>
              <TableCell className="text-right tabular-nums">{stock}</TableCell>
              <TableCell className="text-right tabular-nums">{a.shop_stock ?? 0}</TableCell>
              <TableCell className="text-right">
                {noStock ? (
                  <span className="text-xs text-muted-foreground">Unavailable</span>
                ) : (
                  <QtyInput value={selections.get(a.id) ?? 0} onChange={(v) => onUpdate(a.id, v)} step={step} max={stock} />
                )}
              </TableCell>
            </TableRow>
          );
        })}
        {items.length === 0 && (
          <TableRow><TableCell colSpan={6}><EmptyState icon={Package} message="No accessories found" /></TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// ─── QtyInput ─────────────────────────────────────────────────────────

function QtyInput({
  value,
  onChange,
  step = 1,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  max?: number;
}) {
  const clamp = (v: number) => {
    const clamped = Math.max(0, v);
    return max != null ? Math.min(clamped, max) : clamped;
  };
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        onClick={() => onChange(Math.max(0, value - step))}
        disabled={value <= 0}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <Input
        type="number"
        min={0}
        max={max}
        step={step}
        value={value || ""}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="w-20 h-7 text-center text-sm tabular-nums"
        placeholder="0"
      />
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        onClick={() => onChange(clamp(value + step))}
        disabled={max != null && value >= max}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
