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

import { cn, parseUtcTimestamp } from "@/lib/utils";
import { useTransferRequests, useReceiveTransfer } from "@/hooks/useTransfers";
import { ItemTypeBadge } from "@/components/store/transfer-status-badge";
import type { TransferRequestWithItems } from "@/api/transfers";

export const Route = createFileRoute("/(main)/store/receiving-deliveries")({
  component: ReceivingDeliveriesPage,
  head: () => ({ meta: [{ title: "Receiving Deliveries" }] }),
});

type FlatItem = {
  transfer: TransferRequestWithItems;
  item: TransferRequestWithItems["items"][0];
};

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
  return 0.5;
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

function flattenTransfers(transfers: TransferRequestWithItems[]): FlatItem[] {
  const all = transfers.flatMap((t) => t.items.map((item) => ({ transfer: t, item })));
  return [
    ...all.filter((x) => x.item.received_qty == null),
    ...all.filter((x) => x.item.received_qty != null),
  ];
}

function filterItems(items: FlatItem[], search: string): FlatItem[] {
  if (!search) return items;
  const q = search.toLowerCase();
  return items.filter(
    ({ transfer, item }) =>
      String(transfer.id).includes(q) ||
      getItemName(item).toLowerCase().includes(q),
  );
}

function ItemRow({
  transfer,
  item,
  onReceive,
  isReceiving,
}: {
  transfer: TransferRequestWithItems;
  item: TransferRequestWithItems["items"][0];
  onReceive: (qty: number, note: string) => void;
  isReceiving: boolean;
}) {
  const alreadyReceived = item.received_qty != null;
  const dispatched = Number(item.dispatched_qty ?? 0);
  const step = getItemStep(item);
  const [adjQty, setAdjQty] = useState<number | "">(dispatched);
  const [adjNote, setAdjNote] = useState("");

  const hasDiscrepancy = adjQty !== "" && Number(adjQty) !== dispatched;
  const missing = adjQty !== "" ? Math.max(0, dispatched - Number(adjQty)) : 0;

  return (
    <TableRow className={cn(alreadyReceived && "opacity-50")}>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold">#{transfer.id}</span>
          <AgeBadge dateStr={transfer.dispatched_at} />
        </div>
      </TableCell>
      <TableCell>
        <ItemTypeBadge itemType={transfer.item_type} />
      </TableCell>
      <TableCell>
        <div>
          <span className="font-medium text-sm">{getItemName(item)}</span>
          {transfer.notes && (
            <p className="text-xs text-muted-foreground/70 italic truncate max-w-[200px]">
              {transfer.notes}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
        {item.dispatched_qty ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        {alreadyReceived ? (
          <span className="font-medium text-emerald-600 tabular-nums text-sm">
            {item.received_qty}
          </span>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={dispatched}
                step={step}
                value={adjQty}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") { setAdjQty(""); return; }
                  let val = Math.max(0, Math.min(Number(raw), dispatched));
                  if (step === 1) val = Math.round(val);
                  setAdjQty(val);
                }}
                className="w-24 h-8 text-sm"
              />
              {hasDiscrepancy && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
            </div>
            {hasDiscrepancy && (
              <div className="w-48 space-y-0.5">
                <Textarea
                  placeholder="Explain discrepancy..."
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  rows={2}
                  className="text-xs"
                />
                {missing > 0 && (
                  <p className="text-xs text-red-700">{missing} unit(s) lost in transit</p>
                )}
              </div>
            )}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">
        {alreadyReceived ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3 w-3" />
            Done
          </span>
        ) : (
          <Button
            size="sm"
            disabled={isReceiving}
            onClick={() => onReceive(adjQty === "" ? 0 : Number(adjQty), adjNote)}
          >
            {isReceiving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            )}
            Receive
          </Button>
        )}
      </TableCell>
    </TableRow>
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
  const [isReceivingAll, setIsReceivingAll] = useState(false);

  const flatItems = useMemo(() => flattenTransfers(transfers), [transfers]);
  const filtered = useMemo(() => filterItems(flatItems, search), [flatItems, search]);
  const pendingCount = flatItems.filter((x) => x.item.received_qty == null).length;

  const handleReceive = async (
    transfer: TransferRequestWithItems,
    item: TransferRequestWithItems["items"][0],
    qty: number,
    note: string,
  ) => {
    try {
      const result = await receiveTransfer.mutateAsync({
        transferId: transfer.id,
        items: [{ id: item.id, received_qty: qty, ...(note ? { discrepancy_note: note } : {}) }],
      });
      if (result.has_discrepancy) toast.warning("Received with discrepancy noted");
      else toast.success(`${getItemName(item)} received`);
    } catch (err: any) {
      toast.error(`Could not receive item: ${err?.message ?? String(err)}`);
    }
  };

  const handleReceiveAll = async () => {
    const byTransfer = new Map<
      number,
      { transferId: number; items: { id: number; received_qty: number }[] }
    >();
    for (const { transfer, item } of flatItems) {
      if (item.received_qty != null) continue;
      if (!byTransfer.has(transfer.id)) {
        byTransfer.set(transfer.id, { transferId: transfer.id, items: [] });
      }
      byTransfer
        .get(transfer.id)!
        .items.push({ id: item.id, received_qty: Number(item.dispatched_qty ?? 0) });
    }
    setIsReceivingAll(true);
    try {
      await Promise.all(
        Array.from(byTransfer.values()).map(({ transferId, items }) =>
          receiveTransfer.mutateAsync({ transferId, items }),
        ),
      );
      toast.success("All items received");
    } catch (err: any) {
      toast.error(`Could not receive all: ${err?.message ?? String(err)}`);
    } finally {
      setIsReceivingAll(false);
    }
  };

  const isItemReceiving = (itemId: number) =>
    isReceivingAll ||
    (receiveTransfer.isPending &&
      (receiveTransfer.variables?.items.some((i) => i.id === itemId) ?? false));

  if (isLoading) {
    return (
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Transfer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Dispatched</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
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
    <div className="space-y-3">
      {pendingCount > 1 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={isReceivingAll || receiveTransfer.isPending}
            onClick={handleReceiveAll}
          >
            {isReceivingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Check className="h-3.5 w-3.5 mr-1.5" />
            )}
            Receive All ({pendingCount})
          </Button>
        </div>
      )}

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Transfer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Dispatched</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(({ transfer, item }) => (
              <ItemRow
                key={item.id}
                transfer={transfer}
                item={item}
                onReceive={(qty, note) => handleReceive(transfer, item, qty, note)}
                isReceiving={isItemReceiving(item.id)}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
