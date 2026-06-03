import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Check, Send, ArrowDownToLine, AlertTriangle, MoreHorizontal, Copy, Ban } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@repo/ui/sheet";
import { Separator } from "@repo/ui/separator";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@repo/ui/dropdown-menu";
import { useAuth } from "@/context/auth";
import { useDispatchTransfer, useReceiveTransfer, useCancelTransfer } from "@/hooks/useTransfers";
import { primaryActionFor, personalAwaitingLabel, sourceSideOf, destinationSideOf, sourceStockOf } from "@/lib/transfers";
import { TransferStatusBadge, ItemTypeBadge } from "@/components/store/transfer-status-badge";
import type { TransferRequestWithItems } from "@/api/transfers";

type Props = {
  open: boolean;
  onClose: () => void;
  transfer: TransferRequestWithItems | null;
};

type ItemQty = { id: number; qty: string; note?: string };

// No approval gate (CLAUDE.md §4): requested → sent (dispatched) → received.
const STEPS = [
  { key: "requested", label: "Requested" },
  { key: "dispatched", label: "Sent" },
  { key: "received", label: "Received" },
] as const;

function activeStepIndex(status: string): number {
  if (status === "requested") return 0;
  if (status === "dispatched" || status === "partially_received") return 1;
  if (status === "received") return 2;
  return 0;
}

export function TransferDetailDrawer({ open, onClose, transfer }: Props) {
  const { user } = useAuth();
  const action = transfer ? primaryActionFor(user, transfer) : null;

  const [items, setItems] = useState<ItemQty[]>([]);

  const dispatchMut = useDispatchTransfer();
  const receiveMut = useReceiveTransfer();
  const cancelMut = useCancelTransfer();

  useEffect(() => {
    if (!transfer) return;
    if (action === "dispatch") {
      // No approve step — the send dialog defaults to the requested quantity;
      // the sender lowers it to send partial (or zero to send nothing).
      setItems(transfer.items.map((i) => ({ id: i.id, qty: String(i.requested_qty ?? 0) })));
    } else if (action === "receive") {
      setItems(transfer.items
        .filter((i) => i.received_qty == null)
        .map((i) => ({ id: i.id, qty: String(i.dispatched_qty ?? 0), note: "" })));
    } else {
      setItems([]);
    }
  }, [transfer?.id, action]);

  const totalDispatchQty = useMemo(() => {
    if (action !== "dispatch") return 0;
    return items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  }, [items, action]);

  // The DB rejects a dispatch that exceeds source stock; block it client-side
  // too so the user gets a clear in-place signal instead of a server error
  // toast after submit.
  const dispatchOverStock = useMemo(() => {
    if (action !== "dispatch" || !transfer) return false;
    return items.some((i) => {
      const it = transfer.items.find((t) => t.id === i.id);
      if (!it) return false;
      const src = sourceStockOf(transfer, it);
      return src != null && (Number(i.qty) || 0) > src;
    });
  }, [items, action, transfer]);

  if (!transfer) return null;

  const srcSide = sourceSideOf(transfer.direction);
  const dstSide = destinationSideOf(transfer.direction);
  const stepIdx = activeStepIndex(transfer.status);

  function setQty(id: number, qty: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty } : i)));
  }
  function setNote(id: number, note: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, note } : i)));
  }

  function fillAll(getter: (it: TransferRequestWithItems["items"][number]) => number | string | null | undefined) {
    if (!transfer) return;
    setItems(transfer.items
      .filter((it) => action !== "receive" || it.received_qty == null)
      .map((it) => {
        const v = getter(it);
        return { id: it.id, qty: String(v ?? 0), note: "" };
      }));
  }

  const itemName = (it: TransferRequestWithItems["items"][number]) =>
    it.fabric?.name ?? it.shelf_item?.type ?? it.accessory?.name ?? `#${it.id}`;

  function handleDispatch() {
    if (totalDispatchQty <= 0) {
      toast.error("Send quantity must be greater than zero");
      return;
    }
    if (dispatchOverStock) {
      toast.error("A line exceeds available source stock — lower it before sending");
      return;
    }
    const payload = items.map((i) => ({ id: i.id, dispatched_qty: Number(i.qty) }));
    dispatchMut.mutate({ transferId: transfer!.id, items: payload }, {
      onSuccess: () => { toast.success("Transfer sent"); onClose(); },
      onError: (err: unknown) => toast.error(`Could not send: ${err instanceof Error ? err.message : String(err)}`),
    });
  }
  function handleReceive() {
    const payload = items.map((i) => ({ id: i.id, received_qty: Number(i.qty), discrepancy_note: i.note?.trim() || undefined }));
    receiveMut.mutate({ transferId: transfer!.id, items: payload }, {
      onSuccess: (data: { has_discrepancy?: boolean } | null | undefined) => {
        if (data?.has_discrepancy) toast.warning("Received with discrepancy logged as waste");
        else toast.success("Transfer received");
        onClose();
      },
      onError: (err: unknown) => toast.error(`Could not receive: ${err instanceof Error ? err.message : String(err)}`),
    });
  }
  function handleCancel() {
    if (!confirm("Cancel this transfer request? This cannot be undone.")) return;
    cancelMut.mutate(transfer!.id, {
      onSuccess: () => { toast.success("Transfer cancelled"); onClose(); },
      onError: (err: unknown) => toast.error(`Could not cancel: ${err instanceof Error ? err.message : String(err)}`),
    });
  }
  function copyId() {
    navigator.clipboard.writeText(`#${transfer!.id}`);
    toast.success(`Copied #${transfer!.id}`);
  }

  const canCancel = transfer.status === "requested";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <div className="sticky top-0 bg-background z-10 border-b px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetHeader className="space-y-1.5 text-left">
                <SheetTitle className="flex items-center gap-2 flex-wrap text-base">
                  <span className="tabular-nums">Transfer #{transfer.id}</span>
                  <TransferStatusBadge status={transfer.status} />
                  <ItemTypeBadge itemType={transfer.item_type} />
                </SheetTitle>
                <SheetDescription className="text-xs">
                  <span className="capitalize font-medium">{srcSide}</span>
                  <span className="mx-1.5 text-muted-foreground/60">→</span>
                  <span className="capitalize font-medium">{dstSide}</span>
                  <span className="mx-2">·</span>
                  <span>{personalAwaitingLabel(user, transfer)}</span>
                </SheetDescription>
              </SheetHeader>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={copyId}>
                  <Copy className="h-4 w-4 mr-2" /> Copy ID
                </DropdownMenuItem>
                {canCancel && (
                  <DropdownMenuItem onClick={handleCancel} className="text-red-600 focus:text-red-600">
                    <Ban className="h-4 w-4 mr-2" /> Cancel request
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Compact lifecycle stepper */}
          <div className="mt-4 flex items-center gap-1.5">
            {STEPS.map((step, i) => {
              const done = i < stepIdx;
              const current = i === stepIdx;
              const dotClass = done
                ? "bg-emerald-500 text-white"
                : current
                  ? "bg-blue-500 text-white ring-2 ring-blue-200"
                  : "bg-muted text-muted-foreground";
              return (
                <div key={step.key} className="flex items-center gap-1.5 flex-1">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${dotClass}`}>
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className={`text-[11px] font-medium truncate ${done || current ? "" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 rounded ${done ? "bg-emerald-300" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Audit log */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-xs">
            <AuditLine label="Requested" who={transfer.requested_by_user?.name} ts={transfer.created_at} />
            {transfer.dispatched_at && <AuditLine label="Sent" who={transfer.dispatched_by_user?.name} ts={transfer.dispatched_at} />}
            {transfer.received_at && <AuditLine label="Received" who={transfer.received_by_user?.name} ts={transfer.received_at} />}
          </div>

          {transfer.notes && (
            <div className="rounded-md border bg-amber-50/40 border-amber-100 px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-amber-700 font-semibold">Note</p>
              <p className="text-amber-900">{transfer.notes}</p>
            </div>
          )}

          <Separator />

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Items ({transfer.items.length})</h3>
              {action === "dispatch" && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => fillAll((it) => it.requested_qty)}>
                  Send all as requested
                </Button>
              )}
              {action === "receive" && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => fillAll((it) => it.dispatched_qty)}>
                  Receive all as sent
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {transfer.items.map((it) => {
                const editing = items.find((u) => u.id === it.id);
                const isReceived = it.received_qty != null;
                const srcStock = sourceStockOf(transfer, it);
                const requestedQty = Number(it.requested_qty ?? 0);
                const dispatchedQty = it.dispatched_qty != null ? Number(it.dispatched_qty) : null;

                return (
                  <div key={it.id} className="border rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{itemName(it)}</p>
                        {action === "dispatch" && srcStock != null && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {srcSide} stock: <span className="font-medium tabular-nums">{srcStock}</span>
                          </p>
                        )}
                      </div>
                      {isReceived && <span className="text-[10px] uppercase font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded shrink-0">received</span>}
                    </div>

                    {/* Qty grid — only show cells with values, or the next-to-fill cell when editing */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                      <QtyCell label="Requested" value={requestedQty} highlight={action === "dispatch"} />
                      {(dispatchedQty != null || action === "receive") && (
                        <QtyCell label="Sent" value={dispatchedQty ?? "—"} highlight={action === "receive"} />
                      )}
                      {isReceived && <QtyCell label="Received" value={it.received_qty ?? "—"} />}
                    </div>

                    {!!it.missing_qty && Number(it.missing_qty) > 0 && (
                      <p className="text-xs text-red-700 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Missing <span className="font-semibold">{it.missing_qty}</span> (logged as waste)</span>
                        {it.discrepancy_note && <span className="text-muted-foreground">· {it.discrepancy_note}</span>}
                      </p>
                    )}

                    {editing && action === "dispatch" && (
                      <QtyInput
                        label="Send qty"
                        max={requestedQty}
                        value={editing.qty}
                        onChange={(v) => setQty(it.id, v)}
                        srcStock={srcStock}
                      />
                    )}
                    {editing && action === "receive" && !isReceived && (
                      <div className="space-y-2">
                        <QtyInput
                          label="Received qty"
                          max={dispatchedQty ?? 0}
                          value={editing.qty}
                          onChange={(v) => setQty(it.id, v)}
                        />
                        {Number(editing.qty) < Number(dispatchedQty ?? 0) && (
                          <Input
                            className="h-8 text-xs"
                            placeholder="Discrepancy note (e.g. lost in transit)"
                            value={editing.note ?? ""}
                            onChange={(e) => setNote(it.id, e.target.value)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action area */}
          {action === "dispatch" && (
            <div className="flex gap-2 justify-end">
              <Button onClick={handleDispatch} disabled={dispatchMut.isPending || totalDispatchQty <= 0 || dispatchOverStock}>
                {dispatchMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                <Send className="h-4 w-4 mr-1" /> Send
              </Button>
            </div>
          )}

          {action === "receive" && (
            <div className="flex gap-2 justify-end">
              <Button onClick={handleReceive} disabled={receiveMut.isPending}>
                {receiveMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                <ArrowDownToLine className="h-4 w-4 mr-1" /> Receive
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AuditLine({ label, who, ts }: { label: string; who?: string | null; ts?: string | Date | null }) {
  if (!ts) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}{who && <span className="text-foreground"> · {who}</span>}</span>
      <span className="tabular-nums text-muted-foreground">{new Date(ts).toLocaleString()}</span>
    </div>
  );
}

function QtyCell({ label, value, highlight }: { label: string; value: string | number | null | undefined; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className={`font-semibold tabular-nums ${highlight ? "text-blue-700" : ""}`}>{value}</p>
    </div>
  );
}

function QtyInput({ label, max, value, onChange, srcStock }: { label: string; max: number; value: string; onChange: (v: string) => void; srcStock?: number | null }) {
  const num = Number(value);
  const tooHigh = num > max;
  const overStock = srcStock != null && num > srcStock;
  return (
    <div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground min-w-[90px]">{label}</Label>
        <Input
          type="number"
          min={0}
          max={max}
          step="0.5"
          className={`h-8 max-w-[120px] ${tooHigh || overStock ? "border-red-300 focus-visible:ring-red-200" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-[11px] text-muted-foreground">/ max {max}</span>
      </div>
      {tooHigh && <p className="text-[10px] text-red-600 mt-0.5 ml-[98px]">Exceeds maximum</p>}
      {!tooHigh && overStock && <p className="text-[10px] text-amber-600 mt-0.5 ml-[98px]">Exceeds available stock</p>}
    </div>
  );
}
