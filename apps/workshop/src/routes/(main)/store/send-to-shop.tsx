import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, Plus, Minus, Search, AlertCircle, RefreshCw, X } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Skeleton } from "@repo/ui/skeleton";
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
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { PageHeader } from "@/components/shared/PageShell";
import {
  ACCESSORY_CATEGORY_LABELS,
  UNIT_OF_MEASURE_LABELS,
} from "@/components/store/transfer-constants";

export const Route = createFileRoute("/(main)/store/send-to-shop")({
  component: SendToShopPage,
  head: () => ({ meta: [{ title: "Send to Shop" }] }),
});

function SendToShopPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("fabric");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [fabricSelections, setFabricSelections] = useState<Map<number, number>>(new Map());
  const [shelfSelections, setShelfSelections] = useState<Map<number, number>>(new Map());
  const [accessorySelections, setAccessorySelections] = useState<Map<number, number>>(new Map());

  const { data: fabrics = [], isLoading: fabricsLoading, isError: fabricsError, refetch: refetchFabrics } = useQuery({ queryKey: ["fabrics"], queryFn: getFabrics, staleTime: 60_000 });
  const { data: shelfItems = [], isLoading: shelfLoading, isError: shelfError, refetch: refetchShelf } = useQuery({ queryKey: ["shelf"], queryFn: getShelf, staleTime: 60_000 });
  const { data: accessories = [], isLoading: accessoriesLoading, isError: accessoriesError, refetch: refetchAccessories } = useQuery({ queryKey: ["accessories"], queryFn: getAccessories, staleTime: 60_000 });

  const catalogLoading = fabricsLoading || shelfLoading || accessoriesLoading;
  const catalogError = fabricsError || shelfError || accessoriesError;
  const refetchCatalog = () => { refetchFabrics(); refetchShelf(); refetchAccessories(); };

  const [submitting, setSubmitting] = useState(false);

  const filteredFabrics = useMemo(() => {
    const q = search.toLowerCase();
    return fabrics.filter((f) => !q || f.name?.toLowerCase().includes(q));
  }, [fabrics, search]);

  const filteredShelf = useMemo(() => {
    const q = search.toLowerCase();
    return shelfItems.filter((s) => !q || s.type?.toLowerCase().includes(q) || s.brand?.toLowerCase().includes(q));
  }, [shelfItems, search]);

  const filteredAccessories = useMemo(() => {
    const q = search.toLowerCase();
    return accessories.filter((a) => !q || a.name?.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q));
  }, [accessories, search]);

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

  // Build cart items for display
  const cartItems = useMemo(() => {
    const items: CartItem[] = [];
    fabricSelections.forEach((qty, id) => {
      const f = fabrics.find((x) => x.id === id);
      if (f) items.push({ key: `f-${id}`, name: f.name ?? "Fabric", qty, unit: "m", type: "fabric", id });
    });
    shelfSelections.forEach((qty, id) => {
      const s = shelfItems.find((x) => x.id === id);
      if (s) items.push({ key: `s-${id}`, name: s.type ?? "Shelf item", qty, type: "shelf", id });
    });
    accessorySelections.forEach((qty, id) => {
      const a = accessories.find((x) => x.id === id);
      if (a) items.push({ key: `a-${id}`, name: a.name ?? "Accessory", qty, unit: UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ?? a.unit_of_measure, type: "accessory", id });
    });
    return items;
  }, [fabricSelections, shelfSelections, accessorySelections, fabrics, shelfItems, accessories]);

  const handleSend = async () => {
    const batches: { item_type: string; items: any[] }[] = [];

    if (fabricSelections.size > 0) {
      batches.push({
        item_type: "fabric",
        items: Array.from(fabricSelections.entries()).map(([id, qty]) => ({ fabric_id: id, requested_qty: qty })),
      });
    }
    if (shelfSelections.size > 0) {
      batches.push({
        item_type: "shelf",
        items: Array.from(shelfSelections.entries()).map(([id, qty]) => ({ shelf_id: id, requested_qty: qty })),
      });
    }
    if (accessorySelections.size > 0) {
      batches.push({
        item_type: "accessory",
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
        const transfer = await createTransferRequest({
          direction: "workshop_to_shop",
          item_type: batch.item_type,
          brand: "ERTH",
          requested_by: user!.id,
          notes: notes || undefined,
          items: batch.items,
        });

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

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader icon={Send} title="Send to Shop" subtitle="Proactively dispatch items from the workshop to the shop" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* Left: catalog */}
        <div className="min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <Card className="shadow-none rounded-xl overflow-hidden border">
              {/* Header: tab switcher + search */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b bg-muted/30">
                <TabsList className="h-8 w-fit">
                  <TabsTrigger value="fabric" className="text-xs px-3 h-7">Fabrics</TabsTrigger>
                  <TabsTrigger value="shelf" className="text-xs px-3 h-7">Shelf</TabsTrigger>
                  <TabsTrigger value="accessory" className="text-xs px-3 h-7">Accessories</TabsTrigger>
                </TabsList>
                <div className="relative sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </div>

              {/* Table content */}
              {catalogError ? (
                <div className="py-10 text-center">
                  <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
                  <p className="font-medium text-sm">Failed to load inventory</p>
                  <p className="text-xs text-muted-foreground mt-1">Something went wrong. Please try again.</p>
                  <Button variant="outline" size="sm" onClick={refetchCatalog} className="mt-4">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Retry
                  </Button>
                </div>
              ) : catalogLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-12 ml-auto" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-7 w-28" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
                  <TabsContent value="fabric" className="mt-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableHead className="pl-4">Name</TableHead>
                          <TableHead className="text-right pr-1.5">Workshop</TableHead>
                          <TableHead className="text-right pl-1.5">Shop</TableHead>
                          <TableHead className="text-right w-[140px] pr-4 pl-6">Send (m)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredFabrics.map((f) => {
                          const stock = Number(f.workshop_stock ?? 0);
                          const noStock = stock <= 0;
                          const selected = (fabricSelections.get(f.id) ?? 0) > 0;
                          return (
                            <TableRow key={f.id} className={cn(selected && "bg-primary/[0.04]", noStock && !selected && "opacity-50")}>
                              <TableCell className="pl-4 font-medium">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {f.color_hex && <span className="w-3.5 h-3.5 rounded-full border shrink-0" style={{ backgroundColor: f.color_hex }} />}
                                  <span>{f.name}</span>
                                  {noStock && <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">No stock</span>}
                                </div>
                              </TableCell>
                              <TableCell className="text-right pr-1.5">
                                <StockValue value={stock} />
                              </TableCell>
                              <TableCell className="text-right pl-1.5">
                                <StockValue value={Number(f.shop_stock ?? 0)} />
                              </TableCell>
                              <TableCell className="text-right pr-4 pl-6">
                                {noStock ? (
                                  <span className="text-xs text-muted-foreground">Unavailable</span>
                                ) : (
                                  <QtyInput value={fabricSelections.get(f.id) ?? 0} onChange={(v) => updateQty(fabricSelections, setFabricSelections, f.id, v)} step={0.5} max={stock} />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredFabrics.length === 0 && (
                          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-10">{search ? "No fabrics match your search" : "No fabrics found"}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="shelf" className="mt-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableHead className="pl-4">Type</TableHead>
                          <TableHead>Brand</TableHead>
                          <TableHead className="text-right pr-1.5">Workshop</TableHead>
                          <TableHead className="text-right pl-1.5">Shop</TableHead>
                          <TableHead className="text-right w-[140px] pr-4 pl-6">Send Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredShelf.map((s) => {
                          const stock = Number(s.workshop_stock ?? 0);
                          const noStock = stock <= 0;
                          const selected = (shelfSelections.get(s.id) ?? 0) > 0;
                          return (
                            <TableRow key={s.id} className={cn(selected && "bg-primary/[0.04]", noStock && !selected && "opacity-50")}>
                              <TableCell className="pl-4 font-medium">{s.type}</TableCell>
                              <TableCell>{s.brand ?? "—"}</TableCell>
                              <TableCell className="text-right pr-1.5">
                                <StockValue value={stock} />
                              </TableCell>
                              <TableCell className="text-right pl-1.5">
                                <StockValue value={Number(s.shop_stock ?? 0)} />
                              </TableCell>
                              <TableCell className="text-right pr-4 pl-6">
                                {noStock ? (
                                  <span className="text-xs text-muted-foreground">Unavailable</span>
                                ) : (
                                  <QtyInput value={shelfSelections.get(s.id) ?? 0} onChange={(v) => updateQty(shelfSelections, setShelfSelections, s.id, v)} max={stock} />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredShelf.length === 0 && (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">{search ? "No shelf items match your search" : "No shelf items found"}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>

                  <TabsContent value="accessory" className="mt-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableHead className="pl-4">Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className="text-right pr-1.5">Workshop</TableHead>
                          <TableHead className="text-right pl-1.5">Shop</TableHead>
                          <TableHead className="text-right w-[140px] pr-4 pl-6">Send Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAccessories.map((a) => {
                          const stock = Number(a.workshop_stock ?? 0);
                          const noStock = stock <= 0;
                          const step = a.unit_of_measure === "meters" || a.unit_of_measure === "kg" ? 0.5 : 1;
                          const selected = (accessorySelections.get(a.id) ?? 0) > 0;
                          return (
                            <TableRow key={a.id} className={cn(selected && "bg-primary/[0.04]", noStock && !selected && "opacity-50")}>
                              <TableCell className="pl-4 font-medium">{a.name}</TableCell>
                              <TableCell>{ACCESSORY_CATEGORY_LABELS[a.category] ?? a.category}</TableCell>
                              <TableCell>{UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ?? a.unit_of_measure}</TableCell>
                              <TableCell className="text-right pr-1.5">
                                <StockValue value={stock} />
                              </TableCell>
                              <TableCell className="text-right pl-1.5">
                                <StockValue value={Number(a.shop_stock ?? 0)} />
                              </TableCell>
                              <TableCell className="text-right pr-4 pl-6">
                                {noStock ? (
                                  <span className="text-xs text-muted-foreground">Unavailable</span>
                                ) : (
                                  <QtyInput value={accessorySelections.get(a.id) ?? 0} onChange={(v) => updateQty(accessorySelections, setAccessorySelections, a.id, v)} step={step} max={stock} />
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {filteredAccessories.length === 0 && (
                          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">{search ? "No accessories match your search" : "No accessories found"}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TabsContent>
                </div>
              )}
            </Card>
          </Tabs>
        </div>

        {/* Right: dispatch cart */}
        <div className="lg:sticky lg:top-4">
          <DispatchCart
            items={cartItems}
            notes={notes}
            onNotesChange={setNotes}
            onRemove={(type, id) => {
              if (type === "fabric") updateQty(fabricSelections, setFabricSelections, id, 0);
              else if (type === "shelf") updateQty(shelfSelections, setShelfSelections, id, 0);
              else updateQty(accessorySelections, setAccessorySelections, id, 0);
            }}
            onSubmit={handleSend}
            isPending={submitting}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Cart ─────────────────────────────────────────────────────────────

type CartItem = {
  key: string;
  name: string;
  qty: number;
  unit?: string;
  type: "fabric" | "shelf" | "accessory";
  id: number;
};

const TYPE_LABEL: Record<CartItem["type"], string> = {
  fabric: "Fabric",
  shelf: "Shelf",
  accessory: "Accessory",
};

function DispatchCart({
  items,
  notes,
  onNotesChange,
  onRemove,
  onSubmit,
  isPending,
}: {
  items: CartItem[];
  notes: string;
  onNotesChange: (v: string) => void;
  onRemove: (type: CartItem["type"], id: number) => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Card className="shadow-none rounded-xl overflow-hidden border">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Dispatch Cart
        </span>
        {items.length > 0 && (
          <span className="text-[11px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5 tabular-nums">
            {items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-10 px-4 text-center text-muted-foreground">
          <Send className="h-7 w-7 mx-auto mb-2.5 opacity-20" />
          <p className="text-sm font-medium">Cart is empty</p>
          <p className="text-xs mt-0.5 opacity-70">Select quantities from the table</p>
        </div>
      ) : (
        <div className="divide-y max-h-[50vh] overflow-y-auto">
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-2 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" title={item.name}>{item.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {TYPE_LABEL[item.type]} · <span className="tabular-nums font-semibold text-foreground/80">{item.qty}{item.unit ? ` ${item.unit}` : ""}</span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(item.type, item.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t space-y-3">
        <Textarea
          placeholder="Notes (optional)..."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          className="resize-none text-sm"
        />
        <Button
          className="w-full"
          onClick={onSubmit}
          disabled={items.length === 0 || isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Send to Shop
        </Button>
      </div>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function StockValue({ value, danger }: { value: number; danger?: boolean }) {
  if (value === 0) return <span className="text-muted-foreground/40 italic">0</span>;
  return <span className={cn(danger && "text-red-600 font-semibold")}>{value}</span>;
}

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
    v = Math.max(0, v);
    if (max != null) v = Math.min(v, max);
    return v;
  };
  return (
    <div className="group/qty flex items-center justify-end gap-1">
      <Button
        variant="outline"
        size="icon"
        className={cn(
          "h-7 w-7 rounded-full transition-all",
          value > 0 ? "opacity-100" : "opacity-0 group-hover/qty:opacity-100",
        )}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= 0}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <div className={cn(
        "w-12 h-7 flex items-center justify-center rounded-md text-sm font-semibold tabular-nums transition-all",
        value > 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground/40",
      )}>
        {value > 0 ? value : "\u2014"}
      </div>
      <Button
        variant="outline"
        size="icon"
        className={cn(
          "h-7 w-7 rounded-full transition-all",
          value === 0 ? "opacity-0 group-hover/qty:opacity-100" : "opacity-100",
        )}
        onClick={() => onChange(clamp(value + step))}
        disabled={max != null && value >= max}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
