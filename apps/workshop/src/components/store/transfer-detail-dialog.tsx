import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { parseUtcTimestamp } from "@/lib/utils";
import { TransferStatusBadge, ItemTypeBadge } from "./transfer-status-badge";
import { TRANSFER_DIRECTION_LABELS } from "./transfer-constants";
import type { TransferRequestWithItems } from "@/api/transfers";

interface Props {
  transfer: TransferRequestWithItems | null;
  onClose: () => void;
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : parseUtcTimestamp(value);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getItemName(item: TransferRequestWithItems["items"][0]): string {
  if (item.fabric) return item.fabric.name;
  if (item.shelf_item) return `${item.shelf_item.type}${item.shelf_item.brand ? ` (${item.shelf_item.brand})` : ""}`;
  if (item.accessory) return `${item.accessory.name} (${item.accessory.category})`;
  return "Unknown";
}

interface TimelineEntry {
  label: string;
  date: Date | string | null | undefined;
  user: string | null;
  tone: "default" | "success" | "warn" | "danger";
  detail?: string;
}

function buildTimeline(t: TransferRequestWithItems): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      label: "Requested",
      date: t.created_at,
      user: t.requested_by_user?.name ?? null,
      tone: "default",
      detail: t.notes ?? undefined,
    },
  ];

  if (t.status === "rejected") {
    entries.push({
      label: "Rejected",
      date: t.approved_at, // rejection typically updates approved_at path in code; may be null
      user: null,
      tone: "danger",
      detail: t.rejection_reason ?? undefined,
    });
    return entries;
  }

  if (t.approved_at) {
    entries.push({
      label: "Approved",
      date: t.approved_at,
      user: null,
      tone: "success",
    });
  }
  if (t.dispatched_at) {
    entries.push({
      label: "Dispatched",
      date: t.dispatched_at,
      user: t.dispatched_by_user?.name ?? null,
      tone: "warn",
    });
  }
  if (t.received_at) {
    entries.push({
      label: t.status === "partially_received" ? "Received (partial)" : "Received",
      date: t.received_at,
      user: t.received_by_user?.name ?? null,
      tone: t.status === "partially_received" ? "warn" : "success",
    });
  }
  return entries;
}

const TONE_DOT: Record<TimelineEntry["tone"], string> = {
  default: "bg-blue-500",
  success: "bg-emerald-500",
  warn: "bg-amber-500",
  danger: "bg-red-500",
};

export function TransferDetailDialog({ transfer, onClose }: Props) {
  if (!transfer) {
    return (
      <Dialog open={false} onOpenChange={(o) => !o && onClose()}>
        <DialogContent />
      </Dialog>
    );
  }

  const timeline = buildTimeline(transfer);
  const hasDiscrepancy = transfer.items.some((i) => i.discrepancy_note);
  const totalMissing = transfer.items.reduce(
    (sum, i) => sum + Number(i.missing_qty ?? 0),
    0,
  );

  return (
    <Dialog open={!!transfer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap text-base">
            <span className="font-mono">#{transfer.id}</span>
            <span className="text-muted-foreground text-sm font-normal">
              {TRANSFER_DIRECTION_LABELS[transfer.direction] ?? transfer.direction}
            </span>
            <ItemTypeBadge itemType={transfer.item_type} />
            <TransferStatusBadge status={transfer.status} />
            {(transfer.revision_number ?? 0) > 0 && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-normal">
                Rev {transfer.revision_number}
                {transfer.parent_request_id && ` of #${transfer.parent_request_id}`}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Timeline */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Timeline</h3>
            <ol className="space-y-2.5">
              {timeline.map((entry, idx) => (
                <li key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center shrink-0 pt-1.5">
                    <span className={`h-2 w-2 rounded-full ${TONE_DOT[entry.tone]}`} />
                    {idx < timeline.length - 1 && <span className="w-px flex-1 bg-border mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span className="text-sm font-medium">{entry.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(entry.date)}</span>
                    </div>
                    {entry.user && <p className="text-xs text-muted-foreground">by {entry.user}</p>}
                    {entry.detail && (
                      <p className={`text-xs mt-0.5 italic ${entry.tone === "danger" ? "text-red-600" : "text-muted-foreground"}`}>
                        {entry.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Items */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Items ({transfer.items.length})
            </h3>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8">Item</TableHead>
                    <TableHead className="h-8 text-right w-20">Req</TableHead>
                    <TableHead className="h-8 text-right w-20">Appr</TableHead>
                    <TableHead className="h-8 text-right w-20">Disp</TableHead>
                    <TableHead className="h-8 text-right w-20">Recv</TableHead>
                    <TableHead className="h-8 text-right w-20">Missing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfer.items.map((item) => {
                    const req = Number(item.requested_qty);
                    const missing = Number(item.missing_qty ?? 0);
                    const hasMissing = missing > 0;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="py-2">
                          <div className="text-sm">{getItemName(item)}</div>
                          {item.discrepancy_note && (
                            <div className="text-xs text-orange-700 italic mt-0.5">⚠ {item.discrepancy_note}</div>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums text-sm">{req}</TableCell>
                        <TableCell className="py-2 text-right tabular-nums text-sm">
                          {item.approved_qty ?? "—"}
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums text-sm">
                          {item.dispatched_qty ?? "—"}
                        </TableCell>
                        <TableCell className={`py-2 text-right tabular-nums text-sm ${hasMissing ? "text-orange-700 font-medium" : ""}`}>
                          {item.received_qty ?? "—"}
                        </TableCell>
                        <TableCell className={`py-2 text-right tabular-nums text-sm ${hasMissing ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                          {hasMissing ? missing : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {totalMissing > 0 && (
              <p className="text-xs text-red-700 mt-2 font-medium">
                {totalMissing} unit(s) lost in transit — not returned to source stock.
              </p>
            )}
            {hasDiscrepancy && totalMissing === 0 && (
              <p className="text-xs text-orange-700 mt-2">Discrepancies recorded on one or more items.</p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
