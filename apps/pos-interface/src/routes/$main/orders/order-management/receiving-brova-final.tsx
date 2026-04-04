"use client";

import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import {
    Package,
    Search,
    RefreshCw,
    ChevronDown,
    ExternalLink,
    CheckCircle2,
    Hash,
    User,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";
import { cn, parseUtcTimestamp } from "@/lib/utils";

import { updateGarment } from "@/api/garments";
import { useDispatchedOrders } from "@/hooks/useDispatchedOrders";
import { ORDER_PHASE_LABELS } from "@/lib/constants";
import type { Order, Garment } from "@repo/database";

export const Route = createFileRoute(
    "/$main/orders/order-management/receiving-brova-final"
)({
    component: ReceivingInterface,
    head: () => ({
        meta: [{ title: "Receiving Brova & Final" }],
    }),
});

const PHASE_STYLE: Record<string, string> = {
    new: "bg-gray-100 text-gray-700",
    in_progress: "bg-amber-100 text-amber-700",
    completed: "bg-primary/15 text-primary",
};

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
            if (error) throw new Error(error.message);
            return { count: garments.length, orderId };
        },
        onMutate: async ({ orderId }) => {
            await queryClient.cancelQueries({ queryKey: ["dispatched-orders"] });
            const prev = queryClient.getQueryData<Order[]>(["dispatched-orders"]);
            if (prev) {
                queryClient.setQueryData<Order[]>(
                    ["dispatched-orders"],
                    prev.filter((o) => o.id !== orderId),
                );
            }
            return { prev };
        },
        onSuccess: (data) => {
            toast.success(`Received ${data.count} items for #${data.orderId}`);
            queryClient.invalidateQueries({ queryKey: ["dispatched-orders"] });
            queryClient.invalidateQueries({ queryKey: ["orders"] });
        },
        onError: (err: any, _vars, context) => {
            if (context?.prev) {
                queryClient.setQueryData(["dispatched-orders"], context.prev);
            }
            toast.error("Failed to mark as received", { description: err.message });
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
        <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b-2 border-border pb-6">
                <div className="space-y-1">
                    <h1 className="text-xl font-bold text-foreground tracking-tight">
                        Receiving Inventory
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Mark workshop deliveries as received at showroom
                        {" "}&bull;{" "}{filteredOrders.length} ORDER{filteredOrders.length !== 1 ? "S" : ""} IN TRANSIT
                    </p>
                </div>
                <div className="relative w-full md:w-80 group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                        placeholder="Search order, invoice, customer..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-10 bg-card border-2 border-border/60 rounded-xl text-sm focus-visible:ring-primary/20"
                    />
                </div>
            </div>

            {/* List */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <Card key={i} className="border-2 border-border/60 rounded-2xl py-0 gap-0">
                                <CardContent className="p-5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Skeleton className="h-5 w-16 rounded-md" />
                                            <Skeleton className="h-5 w-32 rounded-md" />
                                        </div>
                                        <Skeleton className="h-7 w-24 rounded-full" />
                                    </div>
                                    <div className="flex gap-2">
                                        <Skeleton className="h-4 w-20 rounded-md" />
                                        <Skeleton className="h-4 w-28 rounded-md" />
                                    </div>
                                    <Skeleton className="h-10 w-full rounded-xl" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="py-10 text-center">
                        <div className="inline-flex p-6 bg-muted/30 rounded-full mb-6 border-2 border-dashed border-border">
                            <Package className="size-10 text-muted-foreground/40" />
                        </div>
                        <h2 className="text-base font-bold text-muted-foreground">Queue is Empty</h2>
                        <p className="text-sm text-muted-foreground/60 font-medium mt-1 uppercase tracking-wider">
                            No garments are currently in transit from the workshop
                        </p>
                    </div>
                ) : (
                    filteredOrders.map((order) => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            onReceive={(garments) => receiveMutation.mutate({ garments, orderId: order.id })}
                            isSubmitting={receiveMutation.isPending && receiveMutation.variables?.orderId === order.id}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

function OrderCard({
    order,
    onReceive,
    isSubmitting,
}: {
    order: Order;
    onReceive: (garments: Garment[]) => void;
    isSubmitting: boolean;
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    const dispatchedGarments = useMemo(
        () => order.garments?.filter((g) => g.location === "transit_to_shop") || [],
        [order.garments]
    );

    const brovaCount = dispatchedGarments.filter((g) => g.garment_type === "brova").length;
    const finalCount = dispatchedGarments.filter((g) => g.garment_type === "final").length;
    const orderDate = order.order_date ? parseUtcTimestamp(order.order_date).toLocaleDateString() : "No Date";

    return (
        <Card className={cn(
            "relative overflow-hidden transition-all duration-300 py-0 gap-0 border-l-4",
            isExpanded ? "border-l-primary shadow-md" : "border-l-transparent hover:border-l-primary/40 hover:bg-muted/30"
        )}>
            <CardContent className="p-0">
                {/* Main row */}
                <div className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                    {/* Desktop (lg+): single row */}
                    <div className="hidden lg:flex items-center min-h-[60px]">
                        <div className="flex-1 px-4 py-2.5 border-r border-border/40 min-w-[180px]">
                            <div className="flex items-center gap-2.5 mb-0.5">
                                <div className="p-1 rounded-md bg-primary/10 text-primary">
                                    <Hash className="size-3" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold">Order #{order.id}</h3>
                                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                                        <span className="text-primary/80">Inv #{order.invoice_number || "—"}</span>
                                        <span className="size-1 rounded-full bg-muted-foreground/30" />
                                        <span>{orderDate}</span>
                                    </div>
                                </div>
                            </div>
                            {order.order_phase && (
                                <Badge variant="outline" className={cn("text-[10px] uppercase font-black px-1.5 py-0 h-4 border-none shadow-xs", PHASE_STYLE[order.order_phase as string] || "bg-muted text-muted-foreground")}>
                                    {ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS]}
                                </Badge>
                            )}
                        </div>
                        <div className="flex-[1.5] px-4 py-2.5 border-r border-border/40 bg-muted/10">
                            <div className="flex items-center gap-2">
                                <User className="size-3 text-muted-foreground shrink-0" />
                                <span className="text-sm font-bold truncate">{order.customer?.name || "Unknown Customer"}</span>
                                {order.customer?.phone && <span className="text-xs text-muted-foreground font-medium shrink-0">{order.customer.phone}</span>}
                            </div>
                        </div>
                        <div className="flex-[1.2] px-4 py-2.5 border-r border-border/40">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary" className="font-black text-xs px-2 py-0 h-5">{dispatchedGarments.length} Pcs</Badge>
                                {brovaCount > 0 && <span className="text-[11px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{brovaCount} Brova</span>}
                                {finalCount > 0 && <span className="text-[11px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{finalCount} Final</span>}
                                {order.delivery_date && (
                                    <span className="text-[11px] text-muted-foreground font-medium">Due {format(parseUtcTimestamp(order.delivery_date), "d MMM")}</span>
                                )}
                            </div>
                        </div>
                        <div className="w-[170px] px-4 py-2.5 flex items-center gap-2 bg-muted/5">
                            <Button className="flex-1 h-9 font-bold uppercase tracking-wider text-xs shadow-sm" onClick={(e) => { e.stopPropagation(); onReceive(dispatchedGarments); }} disabled={isSubmitting || dispatchedGarments.length === 0}>
                                {isSubmitting ? <RefreshCw className="size-3.5 animate-spin" /> : <><CheckCircle2 className="size-3.5 mr-1.5" />Receive</>}
                            </Button>
                            <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0">
                                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", isExpanded && "rotate-180")} />
                            </button>
                        </div>
                    </div>

                    {/* Tablet + Mobile (<lg): compact 2-row */}
                    <div className="lg:hidden px-3 sm:px-4 py-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-bold shrink-0">#{order.id}</span>
                                <span className="text-[11px] text-primary/80 font-medium shrink-0">Inv {order.invoice_number || "—"}</span>
                                {order.order_phase && (
                                    <Badge variant="outline" className={cn("text-[10px] uppercase font-black px-1.5 py-0 h-4 border-none shadow-xs", PHASE_STYLE[order.order_phase as string] || "bg-muted text-muted-foreground")}>
                                        {ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS]}
                                    </Badge>
                                )}
                                <div className="w-px h-3.5 bg-border/40 shrink-0" />
                                <User className="size-3 text-muted-foreground shrink-0" />
                                <span className="text-sm font-bold truncate">{order.customer?.name || "Unknown"}</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0">
                                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", isExpanded && "rotate-180")} />
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] text-muted-foreground">{orderDate}</span>
                                {order.customer?.phone && <span className="text-[11px] text-muted-foreground font-medium">{order.customer.phone}</span>}
                                <Badge variant="secondary" className="font-black text-[11px] px-1.5 py-0 h-4">{dispatchedGarments.length} Pcs</Badge>
                                {brovaCount > 0 && <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{brovaCount}B</span>}
                                {finalCount > 0 && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{finalCount}F</span>}
                                {order.delivery_date && <span className="text-[11px] text-muted-foreground">Due {format(parseUtcTimestamp(order.delivery_date), "d MMM")}</span>}
                            </div>
                            <Button className="h-8 px-4 font-bold uppercase tracking-wider text-xs shadow-sm shrink-0" onClick={(e) => { e.stopPropagation(); onReceive(dispatchedGarments); }} disabled={isSubmitting || dispatchedGarments.length === 0}>
                                {isSubmitting ? <RefreshCw className="size-3 animate-spin" /> : "Receive"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Expanded garment table */}
                {isExpanded && (
                    <div className="border-t-2 border-border/40 bg-muted/5">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border/40">
                                    <th className="text-left py-2.5 px-5">Garment</th>
                                    <th className="text-left py-2.5 px-5">Type</th>
                                    <th className="text-left py-2.5 px-5">Style</th>
                                    <th className="text-left py-2.5 px-5">Fabric</th>
                                    <th className="text-left py-2.5 px-5">Trip</th>
                                    <th className="text-left py-2.5 px-5">Location</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dispatchedGarments.map((g) => (
                                    <tr key={g.id} className="border-b border-border/20 last:border-b-0 hover:bg-muted/30 transition-colors">
                                        <td className="py-2.5 px-5 font-bold">{g.garment_id}</td>
                                        <td className="py-2.5 px-5">
                                            <span className={cn(
                                                "inline-block text-xs font-black uppercase px-2 py-0.5 rounded",
                                                g.garment_type === "brova"
                                                    ? "bg-blue-50 text-blue-700"
                                                    : "bg-emerald-50 text-emerald-700"
                                            )}>
                                                {g.garment_type}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-5 text-muted-foreground">{g.style || "Kuwaiti"}</td>
                                        <td className="py-2.5 px-5">
                                            {(g as any).fabric ? (
                                                <div className="flex items-center gap-2">
                                                    {(g as any).fabric.color && (
                                                        <span
                                                            className="size-3.5 rounded-full border border-border/60 shrink-0"
                                                            style={{ backgroundColor: (g as any).fabric.color }}
                                                        />
                                                    )}
                                                    <span className="font-medium truncate max-w-[150px]">{(g as any).fabric.name}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground/40">—</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-5 font-mono text-muted-foreground">
                                            {(() => {
                                                const trip = g.trip_number ?? 1;
                                                const altNum = g.garment_type === "final" && trip >= 2
                                                    ? trip - 1
                                                    : g.garment_type === "brova" && trip >= 4
                                                        ? trip - 3
                                                        : null;
                                                return altNum !== null ? `Alt ${altNum}` : "1st";
                                            })()}
                                        </td>
                                        <td className="py-2.5 px-5">
                                            <span className="text-xs font-bold bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded">
                                                In Transit to Shop
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="px-5 py-3 flex justify-between items-center border-t border-border/40">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                Verify items before marking received
                            </span>
                            <Link
                                to={order.order_type === "SALES" ? "/$main/orders/new-sales-order" : "/$main/orders/new-work-order"}
                                search={{ orderId: order.id }}
                                className="text-xs font-bold text-primary/60 hover:text-primary transition-colors flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                            >
                                View Full Details
                                <ExternalLink className="size-3" />
                            </Link>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
