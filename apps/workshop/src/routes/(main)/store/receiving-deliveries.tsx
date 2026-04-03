import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, PackageOpen, Check, AlertTriangle } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";

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

function ReceivingDeliveriesPage() {
  const { data: transfers = [], isLoading } = useTransferRequests({
    status: "dispatched",
    direction: "shop_to_workshop",
  });
  const receiveTransfer = useReceiveTransfer();
  const [receivingTransfer, setReceivingTransfer] = useState<TransferRequestWithItems | null>(null);
  const [receivingQtys, setReceivingQtys] = useState<Map<number, { qty: number; note: string }>>(new Map());

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
        toast.success("Transfer received successfully");
      }
      setReceivingTransfer(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to receive transfer");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Receiving Deliveries</h1>
        <p className="text-sm text-muted-foreground mt-1">Receive items dispatched from the shop</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : transfers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <PackageOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No deliveries awaiting receipt</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {transfers.map((transfer) => (
            <Card key={transfer.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Transfer #{transfer.id}</span>
                      <TransferStatusBadge status={transfer.status} />
                      <ItemTypeBadge itemType={transfer.item_type} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {transfer.items.length} item(s) &middot; Dispatched {transfer.dispatched_at ? new Date(transfer.dispatched_at).toLocaleDateString() : "N/A"}
                      {transfer.requested_by_user && <> &middot; Requested by {transfer.requested_by_user.name}</>}
                    </p>
                    {transfer.notes && <p className="text-xs text-muted-foreground italic">{transfer.notes}</p>}
                  </div>
                  <Button onClick={() => openReceiving(transfer)} size="sm">
                    <PackageOpen className="h-4 w-4 mr-1.5" />
                    Receive
                  </Button>
                </div>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
              return (
                <div key={item.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{getItemName(item)}</span>
                    <span className="text-xs text-muted-foreground">Dispatched: {item.dispatched_qty}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-20">Received:</label>
                    <Input
                      type="number" min={0} step={0.5} value={entry.qty}
                      onChange={(e) => { const next = new Map(receivingQtys); next.set(item.id, { ...entry, qty: Number(e.target.value) }); setReceivingQtys(next); }}
                      className="w-24 h-8 text-sm"
                    />
                    {hasDiscrepancy && <AlertTriangle className="h-4 w-4 text-amber-500" />}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceivingTransfer(null)}>Cancel</Button>
            <Button onClick={handleReceive} disabled={receiveTransfer.isPending}>
              {receiveTransfer.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
              Confirm Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
