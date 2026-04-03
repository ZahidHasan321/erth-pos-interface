import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, Plus, Minus } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";

import { getFabrics } from "@/api/fabrics";
import { getShelf } from "@/api/shelf";
import { getAccessories } from "@/api/accessories";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { ACCESSORY_CATEGORY_LABELS, UNIT_OF_MEASURE_LABELS } from "@/components/store/transfer-constants";

export const Route = createFileRoute("/(main)/store/request-delivery")({
  component: RequestDeliveryPage,
  head: () => ({ meta: [{ title: "Request Delivery" }] }),
});

function RequestDeliveryPage() {
  const [direction, setDirection] = useState<string>("shop_to_workshop");
  const [activeTab, setActiveTab] = useState("fabric");
  const [notes, setNotes] = useState("");
  const [fabricSelections, setFabricSelections] = useState<Map<number, number>>(new Map());
  const [shelfSelections, setShelfSelections] = useState<Map<number, number>>(new Map());
  const [accessorySelections, setAccessorySelections] = useState<Map<number, number>>(new Map());

  const { data: fabrics = [] } = useQuery({ queryKey: ["fabrics"], queryFn: getFabrics });
  const { data: shelfItems = [] } = useQuery({ queryKey: ["shelf"], queryFn: getShelf });
  const { data: accessoriesData = [] } = useQuery({ queryKey: ["accessories"], queryFn: getAccessories });

  const createTransfer = useCreateTransfer();

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

  const handleSubmit = async () => {
    const requests: { item_type: string; items: any[] }[] = [];

    if (fabricSelections.size > 0) {
      requests.push({
        item_type: "fabric",
        items: Array.from(fabricSelections.entries()).map(([id, qty]) => ({ fabric_id: id, requested_qty: qty })),
      });
    }
    if (shelfSelections.size > 0) {
      requests.push({
        item_type: "shelf",
        items: Array.from(shelfSelections.entries()).map(([id, qty]) => ({ shelf_id: id, requested_qty: qty })),
      });
    }
    if (accessorySelections.size > 0) {
      requests.push({
        item_type: "accessory",
        items: Array.from(accessorySelections.entries()).map(([id, qty]) => ({ accessory_id: id, requested_qty: qty })),
      });
    }

    if (requests.length === 0) {
      toast.error("Select at least one item to request");
      return;
    }

    try {
      for (const req of requests) {
        await createTransfer.mutateAsync({ direction, item_type: req.item_type, notes: notes || undefined, items: req.items });
      }
      toast.success(`${requests.length} transfer request(s) created`);
      setFabricSelections(new Map());
      setShelfSelections(new Map());
      setAccessorySelections(new Map());
      setNotes("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create request");
    }
  };

  const totalSelected = fabricSelections.size + shelfSelections.size + accessorySelections.size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Request Delivery</h1>
        <p className="text-sm text-muted-foreground mt-1">Request items to be transferred between workshop and shop</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Direction</label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shop_to_workshop">Shop &rarr; Workshop (request from shop)</SelectItem>
                <SelectItem value="workshop_to_shop">Workshop &rarr; Shop (send to shop)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="fabric">
                Fabrics {fabricSelections.size > 0 && <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5">{fabricSelections.size}</span>}
              </TabsTrigger>
              <TabsTrigger value="shelf">
                Shelf Items {shelfSelections.size > 0 && <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5">{shelfSelections.size}</span>}
              </TabsTrigger>
              <TabsTrigger value="accessory">
                Accessories {accessorySelections.size > 0 && <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5">{accessorySelections.size}</span>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="fabric">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Shop Stock</TableHead>
                    <TableHead className="text-right">Workshop Stock</TableHead>
                    <TableHead className="text-right w-[160px]">Request Qty (m)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fabrics.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {f.color_hex && <span className="w-4 h-4 rounded-full border" style={{ backgroundColor: f.color_hex }} />}
                          {f.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.shop_stock ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.workshop_stock ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <QtyInput value={fabricSelections.get(f.id) ?? 0} onChange={(v) => updateQty(fabricSelections, setFabricSelections, f.id, v)} step={0.5} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {fabrics.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No fabrics found</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="shelf">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Shop Stock</TableHead>
                    <TableHead className="text-right">Workshop Stock</TableHead>
                    <TableHead className="text-right w-[160px]">Request Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shelfItems.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.type}</TableCell>
                      <TableCell>{s.brand}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.shop_stock ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.workshop_stock ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <QtyInput value={shelfSelections.get(s.id) ?? 0} onChange={(v) => updateQty(shelfSelections, setShelfSelections, s.id, v)} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {shelfItems.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No shelf items found</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="accessory">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Shop Stock</TableHead>
                    <TableHead className="text-right">Workshop Stock</TableHead>
                    <TableHead className="text-right w-[160px]">Request Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessoriesData.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{ACCESSORY_CATEGORY_LABELS[a.category] ?? a.category}</TableCell>
                      <TableCell>{UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ?? a.unit_of_measure}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.shop_stock ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.workshop_stock ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <QtyInput
                          value={accessorySelections.get(a.id) ?? 0}
                          onChange={(v) => updateQty(accessorySelections, setAccessorySelections, a.id, v)}
                          step={a.unit_of_measure === "meters" || a.unit_of_measure === "kg" ? 0.5 : 1}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {accessoriesData.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No accessories found</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea placeholder="Any additional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              {totalSelected} item(s) selected
            </p>
            <Button onClick={handleSubmit} disabled={totalSelected === 0 || createTransfer.isPending}>
              {createTransfer.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Submit Request
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QtyInput({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onChange(Math.max(0, value - step))} disabled={value <= 0}>
        <Minus className="h-3 w-3" />
      </Button>
      <Input type="number" min={0} step={step} value={value || ""} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} className="w-20 h-7 text-center text-sm tabular-nums" placeholder="0" />
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onChange(value + step)}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
