"use client";

import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
    PackageCheck,
    Search,
    RefreshCw,
    ChevronRight,
    AlertTriangle,
    ExternalLink,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Checkbox } from "@repo/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { updateGarment } from "@/api/garments";
import { useDispatchedOrders } from "@/hooks/useDispatchedOrders";
import type { Order, Garment } from "@repo/database";

import {
    GarmentTypeBadge,
    OrderCardShell,
    TabEmptyState,
    TabLoading,
    tripLabel,
} from "@/components/order-management/_shared";

export const Route = createFileRoute(
    "/$main/orders/order-management/receiving-brova-final"
)({
    component: ReceivingInterface,
    head: () => ({
        meta: [{ title: "Receiving Brova & Final" }],
    }),
});

function ReceivingInterface() {
    const queryClient = useQueryClient();
    const { data: orders = [], isLoading } = useDispatchedOrders();
    const [searchQuery, setSearchQuery] = useState("");

    const receiveMutation = useMutation({
        mutationFn: async ({ garments, orderId }: { garments: Garment[]; orderId: number }) => {
            const promises = garments.map((garment) =>
                updateGarment(garment.id, {
                    piece_stage: (garment.garment_type === "brova"
                        ? "awaiting_trial"
                        : "ready_for_pickup") as any,
                    location: "shop",
                })
            );
            const results = await Promise.all(promises);
            const error = results.find((r) => r.status === "error");
            if (error) throw new Error(`receiveGarments: failed to mark garments received: ${error.message}`);
            return { count: garments.length, orderId };
        },
        onMutate: async ({ garments, orderId }) => {
            await queryClient.cancelQueries({ queryKey: ["dispatched-orders"] });
            const prev = queryClient.getQueryData<Order[]>(["dispatched-orders"]);
            if (prev) {
                const receivedIds = new Set(garments.map((g) => g.id));
                queryClient.setQueryData<Order[]>(
                    ["dispatched-orders"],
                    prev
                        .map((o) => {
                            if (o.id !== orderId) return o;
                            const remaining = o.garments?.filter((g) => !receivedIds.has(g.id)) ?? [];
                            if (remaining.length === 0) return null;
                            return { ...o, garments: remaining };
                        })
                        .filter(Boolean) as Order[],
                );
            }
            return { prev };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["dispatched-orders"] });
            queryClient.invalidateQueries({ queryKey: ["orders"] });
        },
        onError: (err: any, _vars, context) => {
            if (context?.prev) {
                queryClient.setQueryData(["dispatched-orders"], context.prev);
            }
            toast.error("Could not mark garments as received", { description: err.message });
        },
    });

    const filteredOrders = useMemo(() => {
        if (!searchQuery) return orders;
        const q = searchQuery.toLowerCase();
        return orders.filter(
            (order) =>
                order.id.toString().includes(q) ||
                order.invoice_number?.toString().includes(q) ||
                order.customer?.name.toLowerCase().includes(q)
        );
    }, [orders, searchQuery]);

    return (
        <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-5">
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-border pb-5">
                <div className="space-y-1">
                    <h1 className="text-xl font-semibold text-foreground">
                        Receiving
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Mark workshop deliveries as received at the showroom
                    </p>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search order, invoice, customer…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-sm"
                    />
                </div>
            </div>

            {isLoading ? (
                <TabLoading count={4} />
            ) : filteredOrders.length === 0 ? (
                <TabEmptyState
                    icon={PackageCheck}
                    title={searchQuery ? "No matches" : "Nothing to receive"}
                    subtitle={
                        searchQuery
                            ? "No orders match the current search"
                            : "No garments are currently in transit from the workshop"
                    }
                />
            ) : (
                <div className="space-y-4">
                    {filteredOrders.map((order) => (
                        <OrderRow
                            key={order.id}
                            order={order}
                            onReceive={(garments) =>
                                receiveMutation.mutate({ garments, orderId: order.id })
                            }
                            isSubmitting={
                                receiveMutation.isPending &&
                                receiveMutation.variables?.orderId === order.id
                            }
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function OrderRow({
    order,
    onReceive,
    isSubmitting,
}: {
    order: Order;
    onReceive: (garments: Garment[]) => void;
    isSubmitting: boolean;
}) {
    const allGarments = order.garments ?? [];
    const receivableGarments = useMemo(
        () => allGarments.filter((g) => g.location === "transit_to_shop"),
        [allGarments],
    );
    const lostCount = allGarments.filter((g) => g.location === "lost_in_transit").length;

    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(receivableGarments.map((g) => g.id)),
    );

    const receivableIds = useMemo(
        () => new Set(receivableGarments.map((g) => g.id)),
        [receivableGarments],
    );

    const selectedReceivable = receivableGarments.filter((g) => selectedIds.has(g.id));
    const allReceivableSelected =
        receivableGarments.length > 0 &&
        selectedReceivable.length === receivableGarments.length;

    const brovaCount = allGarments.filter((g) => g.garment_type === "brova").length;
    const finalCount = allGarments.filter((g) => g.garment_type === "final").length;
    const alterationCount = allGarments.filter((g) => g.garment_type === "alteration").length;

    function toggleSelectAll(checked: boolean) {
        setSelectedIds(checked ? new Set(receivableGarments.map((g) => g.id)) : new Set());
    }

    function toggleGarment(id: string, checked: boolean) {
        if (!receivableIds.has(id)) return;
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    }

    function handleReceive(e: React.MouseEvent) {
        e.stopPropagation();
        if (!isSubmitting && selectedReceivable.length > 0) onReceive(selectedReceivable);
    }

    const receiveLabel =
        selectedReceivable.length === receivableGarments.length
            ? "Receive"
            : `Receive (${selectedReceivable.length})`;

    const action = (
        <Button
            size="sm"
            className="h-9"
            onClick={handleReceive}
            disabled={isSubmitting || selectedReceivable.length === 0}
        >
            {isSubmitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
                <>
                    <span>{receiveLabel}</span>
                    <ChevronRight className="w-3 h-3 ml-1" />
                </>
            )}
        </Button>
    );

    const detailRoute =
        order.order_type === "SALES"
            ? "/$main/orders/new-sales-order"
            : order.order_type === "ALTERATION"
              ? "/$main/orders/new-alteration-order"
              : "/$main/orders/new-work-order";

    return (
        <OrderCardShell
            orderId={order.id}
            invoiceNumber={order.invoice_number}
            customerName={order.customer?.name}
            customerPhone={order.customer?.phone}
            orderDate={order.order_date}
            pieceCount={allGarments.length}
            brovaCount={brovaCount}
            finalCount={finalCount}
            alterationCount={alterationCount}
            action={action}
            collapsible
            rightBadges={
                lostCount > 0 ? (
                    <span className="flex items-center gap-1 text-sm font-medium text-destructive">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {lostCount} lost
                    </span>
                ) : undefined
            }
        >
            {allGarments.length > 0 && (
                <div className="p-3">
                    <div
                        className="flex items-center justify-between gap-2 mb-2 px-1"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer">
                            <Checkbox
                                checked={allReceivableSelected}
                                onCheckedChange={(checked) => toggleSelectAll(!!checked)}
                                disabled={receivableGarments.length === 0}
                            />
                            <span>Select all receivable</span>
                        </label>
                        <Link
                            to={detailRoute}
                            search={{ orderId: order.id }}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            Order details
                            <ExternalLink className="w-3 h-3" />
                        </Link>
                    </div>
                    <div
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {allGarments.map((g) => {
                            const isLost = g.location === "lost_in_transit";
                            const isReceivable = g.location === "transit_to_shop";
                            const isSelected = selectedIds.has(g.id);
                            const fabric = (g as any).fabric as
                                | { name?: string | null; color?: string | null }
                                | null
                                | undefined;

                            return (
                                <div
                                    key={g.id}
                                    className={cn(
                                        "flex items-start gap-2.5 rounded-md border bg-background p-3 transition-colors",
                                        isReceivable &&
                                            "cursor-pointer hover:bg-muted/20",
                                        isReceivable && !isSelected && "opacity-60",
                                        isLost && "opacity-60",
                                    )}
                                    onClick={() =>
                                        isReceivable && toggleGarment(g.id, !isSelected)
                                    }
                                >
                                    {isReceivable ? (
                                        <Checkbox
                                            checked={isSelected}
                                            onCheckedChange={(checked) =>
                                                toggleGarment(g.id, !!checked)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            className="mt-0.5 shrink-0"
                                        />
                                    ) : (
                                        <div className="w-4 mt-0.5 shrink-0" aria-hidden />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                            <span className="font-medium text-sm">
                                                {g.garment_id}
                                            </span>
                                            <GarmentTypeBadge type={g.garment_type} />
                                            {isLost && (
                                                <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Lost
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                            <span>{g.style || "Kuwaiti"}</span>
                                            {fabric?.name && (
                                                <span className="flex items-center gap-1.5">
                                                    {fabric.color && (
                                                        <span
                                                            className="size-2.5 rounded-full border border-border/60 shrink-0"
                                                            style={{ backgroundColor: fabric.color }}
                                                            aria-hidden
                                                        />
                                                    )}
                                                    <span className="truncate max-w-[140px]">
                                                        {fabric.name}
                                                    </span>
                                                </span>
                                            )}
                                            <span>{tripLabel(g.trip_number, g.garment_type)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            {allGarments.length === 0 && (
                <Card className="border-0 rounded-none shadow-none">
                    <CardContent className="p-4 text-sm text-muted-foreground text-center">
                        No garments on this order.
                    </CardContent>
                </Card>
            )}
        </OrderCardShell>
    );
}
