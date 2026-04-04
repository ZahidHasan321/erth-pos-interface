import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  PackageOpen,
  Check,
  AlertTriangle,
  Search,
  History,
  Package,
} from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";

import { parseUtcTimestamp } from "@/lib/utils";
import { useTransferRequests, useReceiveTransfer } from "@/hooks/useTransfers";
import { TransferStatusBadge, ItemTypeBadge } from "./transfer-status-badge";
import type { TransferRequestWithItems } from "@/api/transfers";

function getItemName(item: TransferRequestWithItems["items"][0]) {
  if (item.fabric) return item.fabric.name;
  if (item.shelf_item) return item.shelf_item.type;
  if (item.accessory)
    return `${item.accessory.name} (${item.accessory.category})`;
  return "Unknown";
}

function getItemStep(item: TransferRequestWithItems["items"][0]) {
  // Shelf items are whole pieces, fabrics are meters (0.5), accessories depend on unit
  if (item.shelf_item) return 1;
  if (item.accessory) {
    const unit = item.accessory.unit_of_measure;
    return unit === "pieces" || unit === "rolls" ? 1 : 0.5;
  }
  return 0.5; // fabrics - meters
}

function filterRequests(requests: TransferRequestWithItems[], search: string) {
  if (!search) return requests;
  const q = search.toLowerCase();
  return requests.filter((r) => {
    if (String(r.id).includes(q)) return true;
    return r.items.some((item) => getItemName(item).toLowerCase().includes(q));
  });
}

export default function ReceivingDeliveriesPage() {
  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");

  const { data: transfers = [], isLoading } = useTransferRequests({
    status: "dispatched",
    direction: "workshop_to_shop",
  });
  const { data: historyTransfers = [], isLoading: historyLoading } =
    useTransferRequests({
      status: ["received", "partially_received"],
      direction: "workshop_to_shop",
    });

  const totalItems = useMemo(() => {
    return transfers.reduce((sum, t) => sum + t.items.length, 0);
  }, [transfers]);

  return (
    <div className="p-4 md:p-5 max-w-[1600px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">
          Receiving Deliveries
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Receive items dispatched from the workshop
        </p>
      </div>

      {/* Summary cards */}
      {!isLoading && transfers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-50">
                <Package className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Pending Deliveries
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {transfers.length}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-sky-50">
                <PackageOpen className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold tabular-nums">{totalItems}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by item name or transfer ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit [&>[data-slot=tabs-trigger]]:shrink-0">
          <TabsTrigger value="pending">
            Awaiting Receipt{" "}
            {transfers.length > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 font-bold">
                {transfers.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1.5" />
            Received History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <PendingDeliveries
            transfers={transfers}
            isLoading={isLoading}
            search={search}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ReceivedHistory
            transfers={historyTransfers}
            isLoading={historyLoading}
            search={search}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PendingDeliveries({
  transfers,
  isLoading,
  search,
}: {
  transfers: TransferRequestWithItems[];
  isLoading: boolean;
  search: string;
}) {
  const receiveTransfer = useReceiveTransfer();
  const [receivingTransfer, setReceivingTransfer] =
    useState<TransferRequestWithItems | null>(null);
  const [receivingQtys, setReceivingQtys] = useState<
    Map<number, { qty: number; note: string }>
  >(new Map());

  const filtered = useMemo(
    () => filterRequests(transfers, search),
    [transfers, search],
  );

  const openReceiving = (transfer: TransferRequestWithItems) => {
    setReceivingTransfer(transfer);
    const initial = new Map<number, { qty: number; note: string }>();
    transfer.items.forEach((item) => {
      initial.set(item.id, { qty: item.dispatched_qty ?? 0, note: "" });
    });
    setReceivingQtys(initial);
  };

  const handleReceive = async () => {
    if (!receivingTransfer) return;

    const items = Array.from(receivingQtys.entries()).map(
      ([id, { qty, note }]) => ({
        id,
        received_qty: qty,
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
    } catch (e: any) {
      toast.error(e.message ?? "Failed to receive transfer");
    }
  };

  const hasAnyDiscrepancy = useMemo(() => {
    if (!receivingTransfer) return false;
    return receivingTransfer.items.some((item) => {
      const entry = receivingQtys.get(item.id);
      return entry && entry.qty !== (item.dispatched_qty ?? 0);
    });
  }, [receivingTransfer, receivingQtys]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <PackageOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No deliveries awaiting receipt</p>
        </CardContent>
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No deliveries match your search</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {filtered.map((transfer) => (
          <Card key={transfer.id}>
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">#{transfer.id}</span>
                    <TransferStatusBadge status={transfer.status} />
                    <ItemTypeBadge itemType={transfer.item_type} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {transfer.items.length} item(s) &middot; Dispatched{" "}
                    {transfer.dispatched_at
                      ? parseUtcTimestamp(
                          transfer.dispatched_at,
                        ).toLocaleDateString()
                      : "N/A"}
                    {transfer.requested_by_user && (
                      <>
                        {" "}
                        &middot; Requested by {transfer.requested_by_user.name}
                      </>
                    )}
                  </p>
                  {transfer.notes && (
                    <p className="text-xs text-muted-foreground italic">
                      {transfer.notes}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => openReceiving(transfer)}
                  size="sm"
                  className="shrink-0 self-start sm:self-center"
                >
                  <PackageOpen className="h-4 w-4 mr-1.5" />
                  Receive
                </Button>
              </div>

              <Table className="mt-3 min-w-[520px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Dispatched Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfer.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{getItemName(item)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.dispatched_qty}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Receiving Dialog */}
      <Dialog
        open={!!receivingTransfer}
        onOpenChange={(open) => !open && setReceivingTransfer(null)}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Receive Transfer #{receivingTransfer?.id}</DialogTitle>
            <DialogDescription>
              Verify quantities received. Adjust if there are discrepancies.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {receivingTransfer?.items.map((item) => {
              const entry = receivingQtys.get(item.id) ?? { qty: 0, note: "" };
              const hasDiscrepancy = entry.qty !== (item.dispatched_qty ?? 0);
              const step = getItemStep(item);

              return (
                <div
                  key={item.id}
                  className={`border rounded-lg p-3 space-y-2 ${hasDiscrepancy ? "border-amber-300 bg-amber-50/50" : ""}`}
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
                        step={step}
                        value={entry.qty}
                        onChange={(e) => {
                          const next = new Map(receivingQtys);
                          next.set(item.id, {
                            ...entry,
                            qty: Number(e.target.value),
                          });
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

          {hasAnyDiscrepancy && (
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

function ReceivedHistory({
  transfers,
  isLoading,
  search,
}: {
  transfers: TransferRequestWithItems[];
  isLoading: boolean;
  search: string;
}) {
  const filtered = useMemo(
    () => filterRequests(transfers, search),
    [transfers, search],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No received deliveries yet</p>
        </CardContent>
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No deliveries match your search</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {filtered.slice(0, 30).map((transfer) => (
        <Card key={transfer.id} className="opacity-90">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">#{transfer.id}</span>
                  <TransferStatusBadge status={transfer.status} />
                  <ItemTypeBadge itemType={transfer.item_type} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {transfer.items.length} item(s) &middot; Received{" "}
                  {transfer.received_at
                    ? parseUtcTimestamp(
                        transfer.received_at,
                      ).toLocaleDateString()
                    : "N/A"}
                  {transfer.requested_by_user && (
                    <>
                      {" "}
                      &middot; Requested by {transfer.requested_by_user.name}
                    </>
                  )}
                </p>
                {transfer.notes && (
                  <p className="text-xs text-muted-foreground italic">
                    {transfer.notes}
                  </p>
                )}
              </div>
            </div>

            <Table className="mt-3 min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Dispatched</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfer.items.map((item) => {
                  const hasDiscrepancy =
                    item.received_qty != null &&
                    item.dispatched_qty != null &&
                    item.received_qty !== item.dispatched_qty;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{getItemName(item)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.dispatched_qty ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${hasDiscrepancy ? "text-amber-600 font-medium" : ""}`}
                      >
                        {item.received_qty ?? "—"}
                        {hasDiscrepancy && " *"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      {filtered.length > 30 && (
        <p className="text-center text-sm text-muted-foreground py-2">
          Showing 30 of {filtered.length} results
        </p>
      )}
    </div>
  );
}
