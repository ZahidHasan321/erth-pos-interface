import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, Plus, Minus, Truck, Search, Clock } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Badge } from "@repo/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@repo/ui/tooltip";

import { PageHeader } from "@/components/shared/PageShell";
import { getFabrics } from "@/api/fabrics";
import { getShelf } from "@/api/shelf";
import { getAccessories } from "@/api/accessories";
import { useCreateTransfer, useTransferRequests } from "@/hooks/useTransfers";
import { ACCESSORY_CATEGORY_LABELS, UNIT_OF_MEASURE_LABELS } from "@/components/store/transfer-constants";

export const Route = createFileRoute("/(main)/store/request-delivery")({
  component: RequestDeliveryPage,
  head: () => ({ meta: [{ title: "Request Delivery" }] }),
});

const LOW_STOCK_THRESHOLD_WORKSHOP = 5;

function RequestDeliveryPage() {
  const [activeTab, setActiveTab] = useState("fabric");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [fabricSelections, setFabricSelections] = useState<Map<number, number>>(new Map());
  const [shelfSelections, setShelfSelections] = useState<Map<number, number>>(new Map());
  const [accessorySelections, setAccessorySelections] = useState<Map<number, number>>(new Map());

  const { data: fabrics = [] } = useQuery({ queryKey: ["fabrics"], queryFn: getFabrics, staleTime: 60_000 });
  const { data: shelfItems = [] } = useQuery({ queryKey: ["shelf"], queryFn: getShelf, staleTime: 60_000 });
  const { data: accessoriesData = [] } = useQuery({ queryKey: ["accessories"], queryFn: getAccessories, staleTime: 60_000 });

  // Pending requests for awareness
  const { data: pendingRequests = [] } = useTransferRequests({
    status: ["requested", "approved"],
    direction: "shop_to_workshop",
  });

  const pendingItemIds = useMemo(() => {
    const ids = { fabric: new Set<number>(), shelf: new Set<number>(), accessory: new Set<number>() };
    for (const req of pendingRequests) {
      for (const item of req.items) {
        if (item.fabric_id) ids.fabric.add(item.fabric_id);
        if (item.shelf_id) ids.shelf.add(item.shelf_id);
        if (item.accessory_id) ids.accessory.add(item.accessory_id);
      }
    }
    return ids;
  }, [pendingRequests]);

  const createTransfer = useCreateTransfer();

  const updateQty = (
    selections: Map<number, number>,
    setSelections: (m: Map<number, number>) => void,
    id: number,
    qty: number,
    max?: number,
  ) => {
    const next = new Map(selections);
    let val = Math.max(0, qty);
    if (max != null) val = Math.min(val, max);
    if (val <= 0) next.delete(id); else next.set(id, val);
    setSelections(next);
  };

  // Filter and sort: low workshop stock first
  const filteredFabrics = useMemo(() => {
    const q = search.toLowerCase();
    return [...fabrics]
      .filter((f) => !q || f.name?.toLowerCase().includes(q))
      .sort((a, b) => Number(a.workshop_stock ?? 0) - Number(b.workshop_stock ?? 0));
  }, [fabrics, search]);

  const filteredShelf = useMemo(() => {
    const q = search.toLowerCase();
    return [...shelfItems]
      .filter((s) => !q || s.type?.toLowerCase().includes(q) || s.brand?.toLowerCase().includes(q))
      .sort((a, b) => Number(a.workshop_stock ?? 0) - Number(b.workshop_stock ?? 0));
  }, [shelfItems, search]);

  const filteredAccessories = useMemo(() => {
    const q = search.toLowerCase();
    return [...accessoriesData]
      .filter((a) => !q || a.name?.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q))
      .sort((a, b) => Number(a.workshop_stock ?? 0) - Number(b.workshop_stock ?? 0));
  }, [accessoriesData, search]);

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
        await createTransfer.mutateAsync({
          direction: "shop_to_workshop",
          item_type: req.item_type,
          notes: notes || undefined,
          items: req.items,
        });
      }
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
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader icon={Truck} title="Request Delivery" subtitle="Request items to be sent from the shop to the workshop" />

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search items by name, type, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="pt-6 pb-6 space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fabric</TableHead>
                      <TableHead className="text-right">Shop Stock</TableHead>
                      <TableHead className="text-right">Workshop Stock</TableHead>
                      <TableHead className="text-right w-[180px]">Request Qty (m)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFabrics.map((f) => {
                      const shopStock = Number(f.shop_stock ?? 0);
                      const workshopStock = Number(f.workshop_stock ?? 0);
                      const isLow = workshopStock < LOW_STOCK_THRESHOLD_WORKSHOP;
                      const outOfStock = shopStock <= 0;
                      const hasPending = pendingItemIds.fabric.has(f.id);
                      return (
                        <TableRow key={f.id} className={isLow ? "bg-amber-50/60" : outOfStock ? "opacity-50" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {f.color_hex && <span className="w-4 h-4 rounded-full border shrink-0" style={{ backgroundColor: f.color_hex }} />}
                              <span>{f.name}</span>
                              {isLow && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Low</Badge>}
                              {outOfStock && <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">No stock</span>}
                              {hasPending && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>Pending request exists</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{shopStock}</TableCell>
                          <TableCell className={`text-right tabular-nums ${isLow ? "text-red-600 font-semibold" : ""}`}>{workshopStock}</TableCell>
                          <TableCell className="text-right">
                            {outOfStock ? (
                              <span className="text-xs text-muted-foreground">Unavailable</span>
                            ) : (
                              <QtyInput value={fabricSelections.get(f.id) ?? 0} onChange={(v) => updateQty(fabricSelections, setFabricSelections, f.id, v, shopStock)} step={0.5} max={shopStock} />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredFabrics.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{search ? "No fabrics match your search" : "No fabrics found"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="shelf">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-right">Shop Stock</TableHead>
                      <TableHead className="text-right">Workshop Stock</TableHead>
                      <TableHead className="text-right w-[180px]">Request Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredShelf.map((s) => {
                      const shopStock = Number(s.shop_stock ?? 0);
                      const workshopStock = Number(s.workshop_stock ?? 0);
                      const isLow = workshopStock < 3;
                      const outOfStock = shopStock <= 0;
                      const hasPending = pendingItemIds.shelf.has(s.id);
                      return (
                        <TableRow key={s.id} className={isLow ? "bg-amber-50/60" : outOfStock ? "opacity-50" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span>{s.type}</span>
                              {isLow && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Low</Badge>}
                              {outOfStock && <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">No stock</span>}
                              {hasPending && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>Pending request exists</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{s.brand}</TableCell>
                          <TableCell className="text-right tabular-nums">{shopStock}</TableCell>
                          <TableCell className={`text-right tabular-nums ${isLow ? "text-red-600 font-semibold" : ""}`}>{workshopStock}</TableCell>
                          <TableCell className="text-right">
                            {outOfStock ? (
                              <span className="text-xs text-muted-foreground">Unavailable</span>
                            ) : (
                              <QtyInput value={shelfSelections.get(s.id) ?? 0} onChange={(v) => updateQty(shelfSelections, setShelfSelections, s.id, v, shopStock)} step={1} max={shopStock} />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredShelf.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{search ? "No shelf items match your search" : "No shelf items found"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="accessory">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Shop Stock</TableHead>
                      <TableHead className="text-right">Workshop Stock</TableHead>
                      <TableHead className="text-right w-[180px]">Request Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccessories.map((a) => {
                      const shopStock = Number(a.shop_stock ?? 0);
                      const workshopStock = Number(a.workshop_stock ?? 0);
                      const isLow = workshopStock < 10;
                      const outOfStock = shopStock <= 0;
                      const hasPending = pendingItemIds.accessory.has(a.id);
                      const step = a.unit_of_measure === "meters" || a.unit_of_measure === "kg" ? 0.5 : 1;
                      return (
                        <TableRow key={a.id} className={isLow ? "bg-amber-50/60" : outOfStock ? "opacity-50" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span>{a.name}</span>
                              {isLow && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Low</Badge>}
                              {outOfStock && <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">No stock</span>}
                              {hasPending && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>Pending request exists</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{ACCESSORY_CATEGORY_LABELS[a.category] ?? a.category}</TableCell>
                          <TableCell>{UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ?? a.unit_of_measure}</TableCell>
                          <TableCell className="text-right tabular-nums">{shopStock}</TableCell>
                          <TableCell className={`text-right tabular-nums ${isLow ? "text-red-600 font-semibold" : ""}`}>{workshopStock}</TableCell>
                          <TableCell className="text-right">
                            {outOfStock ? (
                              <span className="text-xs text-muted-foreground">Unavailable</span>
                            ) : (
                              <QtyInput value={accessorySelections.get(a.id) ?? 0} onChange={(v) => updateQty(accessorySelections, setAccessorySelections, a.id, v, shopStock)} step={step} max={shopStock} />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredAccessories.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{search ? "No accessories match your search" : "No accessories found"}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
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

function QtyInput({ value, onChange, step = 1, max }: { value: number; onChange: (v: number) => void; step?: number; max?: number }) {
  const clamp = (v: number) => {
    const clamped = Math.max(0, v);
    return max != null ? Math.min(clamped, max) : clamped;
  };
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange(Math.max(0, value - step))} disabled={value <= 0}>
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Input type="number" min={0} max={max} step={step} value={value || ""} onChange={(e) => onChange(clamp(Number(e.target.value)))} className="w-20 h-8 text-center text-sm tabular-nums" placeholder="0" />
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange(clamp(value + step))} disabled={max != null && value >= max}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
