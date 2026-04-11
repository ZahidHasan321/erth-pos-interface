import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Loader2,
  PackageOpen,
  Check,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Search,
  ArrowRight,
  ChevronDown,
  Clock,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Skeleton } from "@repo/ui/skeleton";
import {
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@repo/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";

import { cn, parseUtcTimestamp } from "@/lib/utils";
import { useTransferRequests, useReceiveTransfer } from "@/hooks/useTransfers";
import { ItemTypeBadge } from "@/components/store/transfer-status-badge";
import type { TransferRequestWithItems } from "@/api/transfers";

export const Route = createFileRoute("/(main)/store/receiving-deliveries")({
  component: ReceivingDeliveriesPage,
  head: () => ({ meta: [{ title: "Receiving Deliveries" }] }),
});

function getItemName(item: TransferRequestWithItems["items"][0]) {
  if (item.fabric) return item.fabric.name;
  if (item.shelf_item) return item.shelf_item.type;
  if (item.accessory)
    return `${item.accessory.name} (${item.accessory.category})`;
  return "Unknown";
}

function getItemStep(item: TransferRequestWithItems["items"][0]) {
  if (item.shelf_item) return 1;
  if (item.accessory) {
    const unit = item.accessory.unit_of_measure;
    return unit === "pieces" || unit === "rolls" ? 1 : 0.5;
  }
  return 0.5; // fabrics — meters
}

function daysSince(dateStr: string | Date | null | undefined) {
  if (!dateStr) return 0;
  const diff = Date.now() - parseUtcTimestamp(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function AgeBadge({ dateStr }: { dateStr: string | Date | null | undefined }) {
  const days = daysSince(dateStr);
  if (days < 2) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
        days >= 5
          ? "bg-red-100 text-red-700"
          : "bg-amber-100 text-amber-700",
      )}
    >
      <Clock className="h-2.5 w-2.5" />
      {days}d ago
    </span>
  );
}

function filterRequests(requests: TransferRequestWithItems[], search: string) {
  if (!search) return requests;
  const q = search.toLowerCase();
  return requests.filter((r) => {
    if (String(r.id).includes(q)) return true;
    return r.items.some((item) => getItemName(item).toLowerCase().includes(q));
  });
}

function TransferRow({
  transfer,
  isExpanded,
  onToggle,
  onReceive,
  onReceiveItem,
  isReceivingItem,
}: {
  transfer: TransferRequestWithItems;
  isExpanded: boolean;
  onToggle: () => void;
  onReceive: () => void;
  onReceiveItem: (transferId: number, item: { id: number; received_qty: number }) => void;
  isReceivingItem: boolean;
}) {
  const pendingItems = transfer.items.filter((i) => i.received_qty == null);
  const receivedItems = transfer.items.filter((i) => i.received_qty != null);

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={onToggle}
      >
        <TableCell className="w-8 px-2">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground/40 transition-transform duration-300",
              isExpanded && "rotate-180 text-primary",
            )}
          />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold">
              #{transfer.id}
            </span>
            <AgeBadge dateStr={transfer.dispatched_at} />
          </div>
        </TableCell>
        <TableCell>
          <ItemTypeBadge itemType={transfer.item_type} />
        </TableCell>
        <TableCell>
          <span className="tabular-nums font-medium">
            {receivedItems.length}
          </span>
          <span className="text-muted-foreground">/{transfer.items.length}</span>
          <span className="text-muted-foreground ml-1 text-xs">received</span>
        </TableCell>
        <TableCell>
          <span className="text-sm">
            {transfer.dispatched_at
              ? parseUtcTimestamp(transfer.dispatched_at).toLocaleDateString(
                  undefined,
                  { day: "numeric", month: "short" },
                )
              : "N/A"}
          </span>
        </TableCell>
        <TableCell>
          <span className="text-sm">
            {transfer.requested_by_user?.name ?? "—"}
          </span>
        </TableCell>
        <TableCell className="text-right">
          {pendingItems.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onReceive();
              }}
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Receive All
            </Button>
          )}
        </TableCell>
      </TableRow>

      <TableRow className="border-0 hover:bg-transparent">
        <TableCell
          colSpan={7}
          className={cn(
            "p-0 transition-colors",
            isExpanded
              ? "bg-muted/30 border-b border-border/40"
              : "border-0",
          )}
        >
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out",
              isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="px-6 py-3">
                {transfer.notes && (
                  <p className="text-xs text-muted-foreground italic mb-3">
                    Note: &ldquo;{transfer.notes}&rdquo;
                  </p>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="text-left pb-2 font-semibold">Item</th>
                      <th className="text-right pb-2 font-semibold pr-2">
                        Dispatched
                      </th>
                      <th className="text-right pb-2 font-semibold pr-2">
                        Received
                      </th>
                      <th className="text-right pb-2 font-semibold w-28" />
                    </tr>
                  </thead>
                  <tbody>
                    {transfer.items.map((item) => {
                      const alreadyReceived = item.received_qty != null;
                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            "border-t border-border/50",
                            alreadyReceived && "opacity-50",
                          )}
                        >
                          <td className="py-2 font-medium">
                            {getItemName(item)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground pr-2">
                            {item.dispatched_qty ?? "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums pr-2">
                            {alreadyReceived ? (
                              <span className="font-medium text-emerald-600">
                                {item.received_qty}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {alreadyReceived ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                <Check className="h-3 w-3" />
                                Done
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                disabled={isReceivingItem}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onReceiveItem(transfer.id, {
                                    id: item.id,
                                    received_qty: Number(item.dispatched_qty ?? 0),
                                  });
                                }}
                              >
                                {isReceivingItem ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <Check className="h-3 w-3 mr-1" />
                                )}
                                Receive
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}

function ReceivingDeliveriesPage() {
  const [search, setSearch] = useState("");

  const filters = useMemo(
    () => ({
      status: ["dispatched", "partially_received"],
      direction: "shop_to_workshop",
    }),
    [],
  );

  const { data: transfers = [], isLoading, isError, refetch } = useTransferRequests(filters);

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Receiving Deliveries
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {transfers.length > 0
              ? `${transfers.length} delivery${transfers.length === 1 ? "" : "s"} awaiting receipt`
              : "Receive items dispatched from the shop"}
          </p>
        </div>
        <Link
          to="/store/transfer-history"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start sm:self-auto"
        >
          View all past deliveries
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by item name or transfer ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <PendingDeliveries
        transfers={transfers}
        isLoading={isLoading && transfers.length === 0}
        isError={isError}
        refetch={refetch}
        search={search}
      />
    </div>
  );
}

function PendingDeliveries({
  transfers,
  isLoading,
  isError,
  refetch,
  search,
}: {
  transfers: TransferRequestWithItems[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  search: string;
}) {
  const receiveTransfer = useReceiveTransfer();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [receivingTransfer, setReceivingTransfer] =
    useState<TransferRequestWithItems | null>(null);
  const [receivingQtys, setReceivingQtys] = useState<
    Map<number, { qty: number | ""; note: string }>
  >(new Map());

  const filtered = useMemo(
    () => filterRequests(transfers, search),
    [transfers, search],
  );

  const openReceiving = (transfer: TransferRequestWithItems) => {
    setReceivingTransfer(transfer);
    const initial = new Map<number, { qty: number | ""; note: string }>();
    transfer.items.forEach((item) => {
      if (item.received_qty == null) {
        initial.set(item.id, { qty: item.dispatched_qty ?? 0, note: "" });
      }
    });
    setReceivingQtys(initial);
  };

  const handleReceiveItem = async (
    transferId: number,
    item: { id: number; received_qty: number },
  ) => {
    try {
      await receiveTransfer.mutateAsync({
        transferId,
        items: [item],
      });
      toast.success("Item received");
    } catch (err: any) {
      toast.error(`Could not receive item: ${err?.message ?? String(err)}`);
    }
  };

  const handleReceive = async () => {
    if (!receivingTransfer) return;
    const items = Array.from(receivingQtys.entries()).map(
      ([id, { qty, note }]) => ({
        id,
        received_qty: qty === "" ? 0 : qty,
        ...(note ? { discrepancy_note: note } : {}),
      }),
    );
    try {
      const result = await receiveTransfer.mutateAsync({
        transferId: receivingTransfer.id,
        items,
      });
      if (result.has_discrepancy) {
        toast.warning("Transfer received with discrepancies noted");
      }
      setReceivingTransfer(null);
    } catch (err: any) {
      toast.error(`Could not receive transfer: ${err?.message ?? String(err)}`);
    }
  };

  const hasAnyDiscrepancy = useMemo(() => {
    if (!receivingTransfer) return false;
    return receivingTransfer.items.some((item) => {
      const entry = receivingQtys.get(item.id);
      return entry && entry.qty !== (item.dispatched_qty ?? 0);
    });
  }, [receivingTransfer, receivingQtys]);

  const totalMissing = useMemo(() => {
    if (!receivingTransfer) return 0;
    let sum = 0;
    for (const item of receivingTransfer.items) {
      const entry = receivingQtys.get(item.id);
      const dispatched = Number(item.dispatched_qty ?? 0);
      const received = entry?.qty === "" ? 0 : (entry?.qty ?? 0);
      if (received < dispatched) sum += dispatched - received;
    }
    return sum;
  }, [receivingTransfer, receivingQtys]);

  if (isLoading) {
    return (
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-8" />
              <TableHead>Transfer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Dispatched</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell className="w-8 px-2"><Skeleton className="h-4 w-4" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  if (isError) {
    return (
      <Card className="shadow-none rounded-xl border border-destructive/20">
        <CardContent className="py-10 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
          <p className="font-medium text-sm">Failed to load deliveries</p>
          <p className="text-xs text-muted-foreground mt-1">
            Something went wrong. Please try again.
          </p>
          <Button variant="outline" size="sm" onClick={refetch} className="mt-4">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (transfers.length === 0) {
    return (
      <Card className="shadow-none rounded-xl border">
        <CardContent className="py-12 text-center text-muted-foreground">
          <PackageOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No deliveries awaiting receipt</p>
          <p className="text-xs mt-1 opacity-70">
            Items dispatched from the shop will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <Card className="shadow-none rounded-xl border">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No deliveries match your search</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-8" />
              <TableHead>Transfer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Dispatched</TableHead>
              <TableHead>Requested By</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((transfer) => {
              const isExpanded = expandedId === transfer.id;
              return (
                <TransferRow
                  key={transfer.id}
                  transfer={transfer}
                  isExpanded={isExpanded}
                  onToggle={() =>
                    setExpandedId(isExpanded ? null : transfer.id)
                  }
                  onReceive={() => openReceiving(transfer)}
                  onReceiveItem={handleReceiveItem}
                  isReceivingItem={receiveTransfer.isPending}
                />
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Receiving Dialog */}
      <Dialog
        open={!!receivingTransfer}
        onOpenChange={(open) => !open && setReceivingTransfer(null)}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Receive Transfer #{receivingTransfer?.id}</DialogTitle>
            <DialogDescription>
              Quantities are pre-filled with what was dispatched. Reduce any
              item that did not arrive — the shortfall will be flagged as a
              discrepancy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {receivingTransfer?.items
              .filter((item) => item.received_qty == null)
              .map((item) => {
              const entry = receivingQtys.get(item.id) ?? { qty: 0, note: "" };
              const hasDiscrepancy = entry.qty !== (item.dispatched_qty ?? 0);
              const step = getItemStep(item);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "border rounded-lg p-3 space-y-2",
                    hasDiscrepancy ? "border-amber-300 bg-amber-50/50" : "",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-medium text-sm block truncate">
                        {getItemName(item)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Dispatched: {item.dispatched_qty}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-xs text-muted-foreground">
                        Received:
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={Number(item.dispatched_qty ?? 0)}
                        step={step}
                        value={entry.qty}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const next = new Map(receivingQtys);
                          if (raw === "") {
                            next.set(item.id, { ...entry, qty: "" });
                          } else {
                            const dispatched = Number(item.dispatched_qty ?? 0);
                            let val = Math.max(0, Math.min(Number(raw), dispatched));
                            if (step === 1) val = Math.round(val);
                            next.set(item.id, { ...entry, qty: val });
                          }
                          setReceivingQtys(next);
                        }}
                        className="w-24 h-8 text-sm"
                      />
                      {hasDiscrepancy && (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                  </div>
                  {hasDiscrepancy && (
                    <Textarea
                      placeholder="Explain discrepancy..."
                      value={entry.note}
                      onChange={(e) => {
                        const next = new Map(receivingQtys);
                        next.set(item.id, { ...entry, note: e.target.value });
                        setReceivingQtys(next);
                      }}
                      rows={2}
                      className="text-sm"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {totalMissing > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-800 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold">
                  {totalMissing} unit(s) will be marked as lost in transit
                </p>
                <p className="text-red-700/90">
                  These units were dispatched but not received. They are NOT
                  returned to source stock — they are written off as missing.
                </p>
              </div>
            </div>
          )}
          {hasAnyDiscrepancy && totalMissing === 0 && (
            <div className="flex items-center gap-2 px-1 text-amber-700 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Discrepancies detected. Notes help track issues.</span>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReceivingTransfer(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReceive}
              disabled={receiveTransfer.isPending}
            >
              {receiveTransfer.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Check className="h-4 w-4 mr-1.5" />
              )}
              Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
