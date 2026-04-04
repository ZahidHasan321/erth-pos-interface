import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, PackageOpen, Check, AlertTriangle, ArrowDownToLine, Search, History, Package } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";

import { PageHeader, EmptyState as PageEmptyState, LoadingSkeleton, StatsCard } from "@/components/shared/PageShell";
import { useTransferRequests, useReceiveTransfer } from "@/hooks/useTransfers";
import { TransferStatusBadge, ItemTypeBadge } from "@/components/store/transfer-status-badge";
import type { TransferRequestWithItems } from "@/api/transfers";

export const Route = createFileRoute("/(main)/store/receiving-deliveries")({
  component: ReceivingDeliveriesPage,
  head: () => ({ meta: [{ title: "Receiving Deliveries" }] }),
});

function getItemName(item: TransferRequestWithItems["items"][0]) {
  if (item.fabric) return item.fabric.name;
  if (item.shelf_item) return item.shelf_item.type;
  if (item.accessory) return `${item.accessory.name} (${item.accessory.category})`;
  return "Unknown";
}

function getItemStep(item: TransferRequestWithItems["items"][0]) {
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

function ReceivingDeliveriesPage() {
  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");

  const { data: transfers = [], isLoading } = useTransferRequests({
    status: "dispatched",
    direction: "shop_to_workshop",
  });
  const { data: historyTransfers = [], isLoading: historyLoading } = useTransferRequests({
    status: ["received", "partially_received"],
    direction: "shop_to_workshop",
  });

  const totalItems = useMemo(() => {
    return transfers.reduce((sum, t) => sum + t.items.length, 0);
  }, [transfers]);

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10">
      <PageHeader icon={ArrowDownToLine} title="Receiving Deliveries" subtitle="Receive items dispatched from the shop" />

      {/* Summary cards */}
      {!isLoading && transfers.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatsCard icon={Package} value={transfers.length} label="Pending" color="amber" />
          <StatsCard icon={PackageOpen} value={totalItems} label="Total Items" color="blue" />
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by item name or transfer ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="pending">
            Awaiting Receipt {transfers.length > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 font-bold">{transfers.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1.5" />
            Received History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <PendingDeliveries transfers={transfers} isLoading={isLoading} search={search} />
        </TabsContent>
        <TabsContent value="history">
          <ReceivedHistory transfers={historyTransfers} isLoading={historyLoading} search={search} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PendingDeliveries({ transfers, isLoading, search }: { transfers: TransferRequestWithItems[]; isLoading: boolean; search: string }) {
  const receiveTransfer = useReceiveTransfer();
  const [receivingTransfer, setReceivingTransfer] = useState<TransferRequestWithItems | null>(null);
  const [receivingQtys, setReceivingQtys] = useState<Map<number, { qty: number; note: string }>>(new Map());

  const filtered = useMemo(() => filterRequests(transfers, search), [transfers, search]);

  const openReceiving = (transfer: TransferRequestWithItems) => {
    setReceivingTransfer(transfer);
    const initial = new Map<number, { qty: number; note: string }>();
    transfer.items.forEach((item) => initial.set(item.id, { qty: item.dispatched_qty ?? 0, note: "" }));
    setReceivingQtys(initial);
  };

  const handleReceive = async () => {
    if (!receivingTransfer) return;
    const items = Array.from(receivingQtys.entries()).map(([id, { qty, note }]) => ({
      id,
      received_qty: qty,
      ...(note ? { discrepancy_note: note } : {}),
    }));

    try {
      const result = await receiveTransfer.mutateAsync({ transferId: receivingTransfer.id, items });
      if (result.has_discrepancy) {
        toast.warning("Transfer received with discrepancies noted");
      } else {
        // UI updates via query invalidation
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

  if (isLoading) return <LoadingSkeleton count={3} />;

  if (transfers.length === 0) {
    return <PageEmptyState icon={PackageOpen} message="No deliveries awaiting receipt" />;
  }

  if (filtered.length === 0) {
    return <PageEmptyState icon={Search} message="No deliveries match your search" />;
  }

  return (
    <>
      <div className="space-y-3">
        {filtered.map((transfer) => (
          <Card key={transfer.id} className="rounded-xl">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">#{transfer.id}</span>
                    <TransferStatusBadge status={transfer.status} />
                    <ItemTypeBadge itemType={transfer.item_type} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {transfer.items.length} item(s) &middot; Dispatched {transfer.dispatched_at ? new Date(transfer.dispatched_at).toLocaleDateString() : "N/A"}
                    {transfer.requested_by_user && <> &middot; Requested by {transfer.requested_by_user.name}</>}
                  </p>
                  {transfer.notes && <p className="text-xs text-muted-foreground italic">{transfer.notes}</p>}
                </div>
                <Button onClick={() => openReceiving(transfer)} size="sm" className="shrink-0 self-start sm:self-center">
                  <PackageOpen className="h-4 w-4 mr-1.5" />
                  Receive
                </Button>
              </div>

              <div className="overflow-x-auto">
                <Table className="mt-3">
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
                        <TableCell className="text-right tabular-nums">{item.dispatched_qty}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!receivingTransfer} onOpenChange={(open) => !open && setReceivingTransfer(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receive Transfer #{receivingTransfer?.id}</DialogTitle>
            <DialogDescription>Verify quantities received. Adjust if there are discrepancies.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {receivingTransfer?.items.map((item) => {
              const entry = receivingQtys.get(item.id) ?? { qty: 0, note: "" };
              const hasDiscrepancy = entry.qty !== (item.dispatched_qty ?? 0);
              const step = getItemStep(item);
              return (
                <div key={item.id} className={`border rounded-lg p-3 space-y-2 ${hasDiscrepancy ? "border-amber-300 bg-amber-50/50" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-medium text-sm block truncate">{getItemName(item)}</span>
                      <span className="text-xs text-muted-foreground">Dispatched: {item.dispatched_qty}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-xs text-muted-foreground">Received:</label>
                      <Input
                        type="number" min={0} step={step} value={entry.qty}
                        onChange={(e) => { const next = new Map(receivingQtys); next.set(item.id, { ...entry, qty: Number(e.target.value) }); setReceivingQtys(next); }}
                        className="w-24 h-8 text-sm"
                      />
                      {hasDiscrepancy && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    </div>
                  </div>
                  {hasDiscrepancy && (
                    <Textarea
                      placeholder="Explain discrepancy..."
                      value={entry.note}
                      onChange={(e) => { const next = new Map(receivingQtys); next.set(item.id, { ...entry, note: e.target.value }); setReceivingQtys(next); }}
                      rows={2} className="text-sm"
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
            <Button variant="outline" onClick={() => setReceivingTransfer(null)}>Cancel</Button>
            <Button onClick={handleReceive} disabled={receiveTransfer.isPending}>
              {receiveTransfer.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
              Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReceivedHistory({ transfers, isLoading, search }: { transfers: TransferRequestWithItems[]; isLoading: boolean; search: string }) {
  const filtered = useMemo(() => filterRequests(transfers, search), [transfers, search]);

  if (isLoading) return <LoadingSkeleton count={3} />;

  if (transfers.length === 0) {
    return <PageEmptyState icon={History} message="No received deliveries yet" />;
  }

  if (filtered.length === 0) {
    return <PageEmptyState icon={Search} message="No deliveries match your search" />;
  }

  return (
    <div className="space-y-3">
      {filtered.slice(0, 30).map((transfer) => (
        <Card key={transfer.id} className="rounded-xl opacity-90">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">#{transfer.id}</span>
                  <TransferStatusBadge status={transfer.status} />
                  <ItemTypeBadge itemType={transfer.item_type} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {transfer.items.length} item(s) &middot; Received{" "}
                  {transfer.received_at ? new Date(transfer.received_at).toLocaleDateString() : "N/A"}
                  {transfer.requested_by_user && <> &middot; Requested by {transfer.requested_by_user.name}</>}
                </p>
                {transfer.notes && <p className="text-xs text-muted-foreground italic">{transfer.notes}</p>}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Dispatched</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfer.items.map((item) => {
                    const hasDiscrepancy = item.received_qty != null && item.dispatched_qty != null && item.received_qty !== item.dispatched_qty;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{getItemName(item)}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.dispatched_qty ?? "\u2014"}</TableCell>
                        <TableCell className={`text-right tabular-nums ${hasDiscrepancy ? "text-amber-600 font-medium" : ""}`}>
                          {item.received_qty ?? "\u2014"}
                          {hasDiscrepancy && " *"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
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
