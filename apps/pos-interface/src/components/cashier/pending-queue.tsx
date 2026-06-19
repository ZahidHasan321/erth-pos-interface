import { useMemo, useState } from "react";
import { Search, Inbox, Banknote, Check } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Checkbox } from "@repo/ui/checkbox";
import { Badge } from "@repo/ui/badge";
import { Skeleton } from "@repo/ui/skeleton";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";
import { useAuth } from "@/context/auth";
import { toLocalDateStr } from "@/lib/utils";
import {
    useCashierPendingOrders,
    useCashierConfirmNoPaymentMutation,
} from "@/hooks/useCashier";
import type { CashierPendingOrder } from "@/api/cashier";

const fmtK = (n: number): string => `${Number(Number(n).toFixed(3))} KWD`;

/**
 * §3 cashier Pending queue. Lists confirmed WORK orders awaiting cashier
 * processing (the gate before dispatch). The cashier selects one or many, then
 * either confirms them without payment or proceeds to the bulk-payment page.
 *
 * Navigation to the bulk-payment page is injected (`onProceedToPayment`) so the
 * same body works in both the standalone /cashier terminal and the shop-shell
 * /$main/cashier surface, which route to different paths.
 */
export function PendingQueueBody({
    onProceedToPayment,
}: {
    onProceedToPayment: (orderIds: number[]) => void;
}) {
    const { user } = useAuth();
    const { data: result, isLoading } = useCashierPendingOrders();
    const confirmMutation = useCashierConfirmNoPaymentMutation();

    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    const orders = useMemo(() => result?.data ?? [], [result]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return orders;
        return orders.filter((o) =>
            (o.customer_name ?? "").toLowerCase().includes(q) ||
            (o.customer_phone ?? "").toLowerCase().includes(q) ||
            String(o.order_id).includes(q) ||
            String(o.invoice_number ?? "").includes(q),
        );
    }, [orders, search]);

    const toggle = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allFilteredSelected =
        filtered.length > 0 && filtered.every((o) => selected.has(o.order_id));
    const toggleAll = () => {
        setSelected((prev) => {
            if (allFilteredSelected) {
                const next = new Set(prev);
                filtered.forEach((o) => next.delete(o.order_id));
                return next;
            }
            const next = new Set(prev);
            filtered.forEach((o) => next.add(o.order_id));
            return next;
        });
    };

    const selectedIds = Array.from(selected);
    const selectedCount = selectedIds.length;

    const handleConfirmNoPayment = () => {
        confirmMutation.mutate(
            {
                orderIds: selectedIds,
                cashierId: user?.id ?? undefined,
                idempotencyKey: crypto.randomUUID(),
            },
            {
                onSuccess: (res) => {
                    if (res.status === "success") {
                        setSelected(new Set());
                        setShowConfirmDialog(false);
                    }
                },
            },
        );
    };

    const handleProceedToPayment = () => {
        onProceedToPayment(selectedIds);
    };

    return (
        <div className="relative h-full flex flex-col">
            <div className="px-4 py-3 border-b bg-card shrink-0">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-base font-bold">Pending Orders</h1>
                        <p className="text-xs text-muted-foreground">
                            Confirmed work orders awaiting cashier processing
                        </p>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                        {orders.length} pending
                    </Badge>
                </div>
                <div className="relative mt-3">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, phone, or order number"
                        className="pl-8 h-9 text-sm"
                    />
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4 pb-24">
                {isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-16">
                        <Inbox className="h-10 w-10 mb-3 opacity-40" />
                        <p className="text-sm font-medium">
                            {orders.length === 0 ? "No pending orders" : "No orders match your search"}
                        </p>
                        <p className="text-xs mt-1">
                            New work orders show up here for the cashier to process.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 px-1 pb-1 text-xs font-medium text-muted-foreground cursor-pointer select-none">
                            <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
                            Select all ({filtered.length})
                        </label>
                        {filtered.map((o) => (
                            <PendingRow
                                key={o.order_id}
                                order={o}
                                selected={selected.has(o.order_id)}
                                onToggle={() => toggle(o.order_id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {selectedCount > 0 && (
                <div className="absolute bottom-0 left-0 right-0 border-t bg-card/95 backdrop-blur px-4 py-3 flex items-center gap-3 shadow-lg">
                    <span className="text-sm font-semibold">{selectedCount} selected</span>
                    <div className="ml-auto flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowConfirmDialog(true)}
                            disabled={confirmMutation.isPending}
                        >
                            <Check className="h-4 w-4 mr-1.5" />
                            Confirm without payment
                        </Button>
                        <Button size="sm" onClick={handleProceedToPayment}>
                            <Banknote className="h-4 w-4 mr-1.5" />
                            Proceed to payment
                        </Button>
                    </div>
                </div>
            )}

            <ConfirmationDialog
                isOpen={showConfirmDialog}
                onClose={() => setShowConfirmDialog(false)}
                onConfirm={handleConfirmNoPayment}
                title="Confirm without payment"
                description={`Confirm ${selectedCount} order${selectedCount === 1 ? "" : "s"} without taking payment? They will leave the pending queue and can be dispatched to the workshop. Payment can still be collected later.`}
                confirmText="Confirm orders"
                cancelText="Cancel"
            />
        </div>
    );
}

function PendingRow({
    order,
    selected,
    onToggle,
}: {
    order: CashierPendingOrder;
    selected: boolean;
    onToggle: () => void;
}) {
    const delivery = toLocalDateStr(order.delivery_date);
    return (
        <div
            className={`flex items-center gap-3 rounded-lg border-2 p-3 transition-colors cursor-pointer ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
            onClick={onToggle}
        >
            <Checkbox checked={selected} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                        #{order.invoice_number ?? order.order_id}
                    </span>
                    <span className="text-sm truncate">{order.customer_name ?? "Unknown"}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                    {order.customer_phone ?? ""}
                    {order.garment_count > 0 && (
                        <> · {order.garment_count} garment{order.garment_count === 1 ? "" : "s"}</>
                    )}
                    {delivery && <> · due {delivery}</>}
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{fmtK(order.order_total)}</div>
                {order.advance > 0 && (
                    <div className="text-xs text-muted-foreground tabular-nums">
                        advance {fmtK(order.advance)}
                    </div>
                )}
            </div>
        </div>
    );
}
