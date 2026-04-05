import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Send,
  Plus,
  Minus,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Eye,
  Plane,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { Badge } from "@repo/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";

import { parseUtcTimestamp } from "@/lib/utils";
import { getFabrics } from "@/api/fabrics";
import { getShelf } from "@/api/shelf";
import { getAccessories } from "@/api/accessories";
import {
  useCreateTransfer,
  useTransferRequests,
  useCancelTransfer,
} from "@/hooks/useTransfers";
import {
  ACCESSORY_CATEGORY_LABELS,
  UNIT_OF_MEASURE_LABELS,
} from "./transfer-constants";
import { TransferStatusBadge, ItemTypeBadge } from "./transfer-status-badge";
import { TransferDetailDialog } from "./transfer-detail-dialog";
import type { TransferRequestWithItems } from "@/api/transfers";

const LOW_STOCK_THRESHOLD = 5;

export default function RequestDeliveryPage() {
  const [activeTab, setActiveTab] = useState("fabric");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [fabricSelections, setFabricSelections] = useState<Map<number, number>>(
    new Map(),
  );
  const [shelfSelections, setShelfSelections] = useState<Map<number, number>>(
    new Map(),
  );
  const [accessorySelections, setAccessorySelections] = useState<
    Map<number, number>
  >(new Map());

  const { data: fabrics = [] } = useQuery({
    queryKey: ["fabrics"],
    queryFn: getFabrics,
  });
  const { data: shelfItems = [] } = useQuery({
    queryKey: ["shelf"],
    queryFn: getShelf,
  });
  const { data: accessoriesData = [] } = useQuery({
    queryKey: ["accessories"],
    queryFn: getAccessories,
  });

  // In-flight requests we've sent that haven't landed yet (still open somewhere in
  // the pipeline). These power both the In-Flight panel at the top of the page and
  // the per-row "already in transit" chips in each item table.
  const { data: inFlightRequests = [] } = useTransferRequests({
    status: ["requested", "approved", "dispatched"],
    direction: "workshop_to_shop",
  });

  const inFlightQtys = useMemo(() => {
    const qtys = {
      fabric: new Map<number, number>(),
      shelf: new Map<number, number>(),
      accessory: new Map<number, number>(),
    };
    for (const req of inFlightRequests) {
      for (const item of req.items) {
        // Once dispatched we know the real shipped quantity; before that the
        // requested qty is the best guess of what's coming.
        const qty = Number(
          item.dispatched_qty ?? item.approved_qty ?? item.requested_qty ?? 0,
        );
        if (item.fabric_id) {
          qtys.fabric.set(
            item.fabric_id,
            (qtys.fabric.get(item.fabric_id) ?? 0) + qty,
          );
        }
        if (item.shelf_id) {
          qtys.shelf.set(
            item.shelf_id,
            (qtys.shelf.get(item.shelf_id) ?? 0) + qty,
          );
        }
        if (item.accessory_id) {
          qtys.accessory.set(
            item.accessory_id,
            (qtys.accessory.get(item.accessory_id) ?? 0) + qty,
          );
        }
      }
    }
    return qtys;
  }, [inFlightRequests]);

  const createTransfer = useCreateTransfer();

  const updateQty = (
    selections: Map<number, number>,
    setSelections: (m: Map<number, number>) => void,
    id: number,
    qty: number,
  ) => {
    const next = new Map(selections);
    if (qty <= 0) next.delete(id);
    else next.set(id, qty);
    setSelections(next);
  };

  // Filter and sort: low shop stock first, then alphabetical
  const filteredFabrics = useMemo(() => {
    const q = search.toLowerCase();
    return [...fabrics]
      .filter((f) => !q || f.name?.toLowerCase().includes(q))
      .sort((a, b) => Number(a.shop_stock ?? 0) - Number(b.shop_stock ?? 0));
  }, [fabrics, search]);

  const filteredShelf = useMemo(() => {
    const q = search.toLowerCase();
    return [...shelfItems]
      .filter(
        (s) =>
          !q ||
          s.type?.toLowerCase().includes(q) ||
          s.brand?.toLowerCase().includes(q),
      )
      .sort((a, b) => Number(a.shop_stock ?? 0) - Number(b.shop_stock ?? 0));
  }, [shelfItems, search]);

  const filteredAccessories = useMemo(() => {
    const q = search.toLowerCase();
    return [...accessoriesData]
      .filter(
        (a) =>
          !q ||
          a.name?.toLowerCase().includes(q) ||
          a.category?.toLowerCase().includes(q),
      )
      .sort((a, b) => Number(a.shop_stock ?? 0) - Number(b.shop_stock ?? 0));
  }, [accessoriesData, search]);

  const handleSubmit = async () => {
    const requests: { item_type: string; items: any[] }[] = [];

    if (fabricSelections.size > 0) {
      requests.push({
        item_type: "fabric",
        items: Array.from(fabricSelections.entries()).map(([id, qty]) => ({
          fabric_id: id,
          requested_qty: qty,
        })),
      });
    }
    if (shelfSelections.size > 0) {
      requests.push({
        item_type: "shelf",
        items: Array.from(shelfSelections.entries()).map(([id, qty]) => ({
          shelf_id: id,
          requested_qty: qty,
        })),
      });
    }
    if (accessorySelections.size > 0) {
      requests.push({
        item_type: "accessory",
        items: Array.from(accessorySelections.entries()).map(([id, qty]) => ({
          accessory_id: id,
          requested_qty: qty,
        })),
      });
    }

    if (requests.length === 0) {
      toast.error("Select at least one item to request");
      return;
    }

    try {
      for (const req of requests) {
        await createTransfer.mutateAsync({
          direction: "workshop_to_shop",
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

  const totalSelected =
    fabricSelections.size + shelfSelections.size + accessorySelections.size;

  return (
    <div className="p-4 md:p-5 max-w-[1600px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Request Delivery</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Request items to be sent from the workshop to the shop
        </p>
      </div>

      <InFlightPanel requests={inFlightRequests} />

      {/* Search bar */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search items by name, type, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="py-5 space-y-5">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start overflow-x-auto sm:w-fit [&>[data-slot=tabs-trigger]]:shrink-0">
              <TabsTrigger value="fabric">
                Fabrics{" "}
                {fabricSelections.size > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5">
                    {fabricSelections.size}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="shelf">
                Shelf Items{" "}
                {shelfSelections.size > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5">
                    {shelfSelections.size}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="accessory">
                Accessories{" "}
                {accessorySelections.size > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5">
                    {accessorySelections.size}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="fabric" className="mt-4">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Shop Stock</TableHead>
                    <TableHead className="text-right">Workshop Stock</TableHead>
                    <TableHead className="text-right w-[180px]">
                      Request Qty (m)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFabrics.map((f) => {
                    const shopStock = Number(f.shop_stock ?? 0);
                    const isLow = shopStock < LOW_STOCK_THRESHOLD;
                    const inFlightQty = inFlightQtys.fabric.get(f.id) ?? 0;
                    return (
                      <TableRow
                        key={f.id}
                        className={isLow ? "bg-amber-50/60" : ""}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            {f.color_hex && (
                              <span
                                className="w-4 h-4 rounded-full border shrink-0"
                                style={{ backgroundColor: f.color_hex }}
                              />
                            )}
                            <span>{f.name}</span>
                            {isLow && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] px-1.5 py-0"
                              >
                                Low
                              </Badge>
                            )}
                            <InFlightChip qty={inFlightQty} suffix="m" />
                          </div>
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${isLow ? "text-red-600 font-semibold" : ""}`}
                        >
                          {shopStock}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(f.workshop_stock ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <QtyInput
                            value={fabricSelections.get(f.id) ?? 0}
                            onChange={(v) =>
                              updateQty(
                                fabricSelections,
                                setFabricSelections,
                                f.id,
                                v,
                              )
                            }
                            step={0.5}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredFabrics.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground py-8"
                      >
                        {search
                          ? "No fabrics match your search"
                          : "No fabrics found"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="shelf" className="mt-4">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Shop Stock</TableHead>
                    <TableHead className="text-right">Workshop Stock</TableHead>
                    <TableHead className="text-right w-[180px]">
                      Request Qty
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShelf.map((s) => {
                    const shopStock = Number(s.shop_stock ?? 0);
                    const isLow = shopStock < 3;
                    const inFlightQty = inFlightQtys.shelf.get(s.id) ?? 0;
                    return (
                      <TableRow
                        key={s.id}
                        className={isLow ? "bg-amber-50/60" : ""}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{s.type}</span>
                            {isLow && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] px-1.5 py-0"
                              >
                                Low
                              </Badge>
                            )}
                            <InFlightChip qty={inFlightQty} />
                          </div>
                        </TableCell>
                        <TableCell>{s.brand}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${isLow ? "text-red-600 font-semibold" : ""}`}
                        >
                          {shopStock}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(s.workshop_stock ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <QtyInput
                            value={shelfSelections.get(s.id) ?? 0}
                            onChange={(v) =>
                              updateQty(
                                shelfSelections,
                                setShelfSelections,
                                s.id,
                                v,
                              )
                            }
                            step={1}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredShelf.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground py-8"
                      >
                        {search
                          ? "No shelf items match your search"
                          : "No shelf items found"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="accessory" className="mt-4">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Shop Stock</TableHead>
                    <TableHead className="text-right">Workshop Stock</TableHead>
                    <TableHead className="text-right w-[180px]">
                      Request Qty
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccessories.map((a) => {
                    const shopStock = Number(a.shop_stock ?? 0);
                    const isLow = shopStock < 10;
                    const inFlightQty = inFlightQtys.accessory.get(a.id) ?? 0;
                    const step =
                      a.unit_of_measure === "meters" ||
                      a.unit_of_measure === "kg"
                        ? 0.5
                        : 1;
                    return (
                      <TableRow
                        key={a.id}
                        className={isLow ? "bg-amber-50/60" : ""}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{a.name}</span>
                            {isLow && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] px-1.5 py-0"
                              >
                                Low
                              </Badge>
                            )}
                            <InFlightChip qty={inFlightQty} />
                          </div>
                        </TableCell>
                        <TableCell>
                          {ACCESSORY_CATEGORY_LABELS[a.category] ?? a.category}
                        </TableCell>
                        <TableCell>
                          {UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ??
                            a.unit_of_measure}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${isLow ? "text-red-600 font-semibold" : ""}`}
                        >
                          {shopStock}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(a.workshop_stock ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <QtyInput
                            value={accessorySelections.get(a.id) ?? 0}
                            onChange={(v) =>
                              updateQty(
                                accessorySelections,
                                setAccessorySelections,
                                a.id,
                                v,
                              )
                            }
                            step={step}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredAccessories.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        {search
                          ? "No accessories match your search"
                          : "No accessories found"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea
              placeholder="Any additional notes for this request..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {totalSelected}
              </span>{" "}
              item(s) selected
            </p>
            <Button
              className="sm:min-w-36"
              onClick={handleSubmit}
              disabled={totalSelected === 0 || createTransfer.isPending}
            >
              {createTransfer.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Submit Request
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QtyInput({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={() => onChange(Math.max(0, value - step))}
        disabled={value <= 0}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Input
        type="number"
        min={0}
        step={step}
        value={value || ""}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="w-20 h-9 text-center text-sm tabular-nums"
        placeholder="0"
      />
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        onClick={() => onChange(value + step)}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * Small inline chip shown next to an item's name when there is already an
 * outstanding request for the same item (requested / approved / dispatched but
 * not yet received). Formats e.g. `5m in transit` or `12 in transit`.
 */
function InFlightChip({ qty, suffix }: { qty: number; suffix?: string }) {
  if (qty <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 border border-sky-200">
      {qty}
      {suffix ?? ""} in transit
    </span>
  );
}

function summarizeItems(req: TransferRequestWithItems): string {
  const parts: string[] = [];
  const total = req.items.reduce(
    (sum, it) => sum + Number(it.requested_qty ?? 0),
    0,
  );
  parts.push(`${req.items.length} item${req.items.length === 1 ? "" : "s"}`);
  if (total > 0) parts.push(`${total} total`);
  return parts.join(" · ");
}

function daysSince(dateStr: string | Date | null | undefined) {
  if (!dateStr) return 0;
  const diff = Date.now() - parseUtcTimestamp(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Panel rendered above the item tables showing every open outbound request
 * the shop has sent. Prevents re-requesting items that are already on their
 * way back. For requests still in `requested` status the shop can cancel
 * them directly (hard-delete); after that they're display-only with a
 * "View details" link.
 */
function InFlightPanel({ requests }: { requests: TransferRequestWithItems[] }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmCancel, setConfirmCancel] =
    useState<TransferRequestWithItems | null>(null);
  const [viewing, setViewing] = useState<TransferRequestWithItems | null>(null);
  const cancelTransfer = useCancelTransfer();

  if (requests.length === 0) return null;

  const alwaysVisible = requests.slice(0, 3);
  const collapsible = requests.slice(3);
  const hidden = collapsible.length;

  const handleCancel = async () => {
    if (!confirmCancel) return;
    try {
      await cancelTransfer.mutateAsync(confirmCancel.id);
      toast.success(`Request #${confirmCancel.id} cancelled`);
      setConfirmCancel(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to cancel request");
    }
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50/30 shadow-sm animate-in slide-in-from-top-2 fade-in duration-300">
        {/* decorative top stripe */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent" />
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 ring-1 ring-sky-200">
                <Plane className="h-4 w-4 -rotate-12" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-sky-950">
                    In-flight requests
                  </span>
                  <span className="text-[11px] text-sky-800 bg-sky-100 rounded-full px-2 py-0.5 font-bold tabular-nums ring-1 ring-sky-200">
                    {requests.length}
                  </span>
                </div>
                <p className="text-[11px] text-sky-800/70 mt-0.5">
                  Already on the way — check before requesting again.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {alwaysVisible.map((req) => {
              const days = daysSince(req.created_at);
              const canCancel = req.status === "requested";
              return (
                <RequestRow
                  key={req.id}
                  req={req}
                  days={days}
                  canCancel={canCancel}
                  onView={setViewing}
                  onCancel={setConfirmCancel}
                />
              );
            })}
          </div>

          {collapsible.length > 0 && (
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="overflow-hidden">
                <div className="space-y-2 pt-2">
                  {collapsible.map((req) => {
                    const days = daysSince(req.created_at);
                    const canCancel = req.status === "requested";
                    return (
                      <RequestRow
                        key={req.id}
                        req={req}
                        days={days}
                        canCancel={canCancel}
                        onView={setViewing}
                        onCancel={setConfirmCancel}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {requests.length > 3 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-sky-700 hover:bg-sky-100"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5 mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5 mr-1" />
                  Show {hidden} more
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <TransferDetailDialog
        transfer={viewing}
        onClose={() => setViewing(null)}
      />

      <Dialog
        open={!!confirmCancel}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel request #{confirmCancel?.id}?</DialogTitle>
            <DialogDescription>
              This removes the request permanently. No approver will see it.
              You can create a new request afterwards if you change your mind.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmCancel(null)}
              disabled={cancelTransfer.isPending}
            >
              Keep request
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelTransfer.isPending}
            >
              {cancelTransfer.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              )}
              Cancel request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RequestRow({
  req,
  days,
  canCancel,
  onView,
  onCancel,
}: {
  req: TransferRequestWithItems;
  days: number;
  canCancel: boolean;
  onView: (req: TransferRequestWithItems) => void;
  onCancel: (req: TransferRequestWithItems) => void;
}) {
  return (
    <div className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white/90 border border-sky-100 hover:border-sky-300 hover:shadow-sm transition-colors rounded-lg px-3 py-2.5">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-sky-700 font-semibold">
            #{req.id}
          </span>
          <TransferStatusBadge status={req.status} />
          <ItemTypeBadge itemType={req.item_type} />
          {days >= 2 && (
            <span
              className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${days >= 5 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}
            >
              {days}d ago
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {summarizeItems(req)}
          {req.requested_by_user && <> · By {req.requested_by_user.name}</>}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => onView(req)}
        >
          <Eye className="h-3.5 w-3.5 mr-1" />
          Details
        </Button>
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => onCancel(req)}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
