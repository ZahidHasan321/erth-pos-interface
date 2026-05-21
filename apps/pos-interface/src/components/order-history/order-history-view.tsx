"use client";

import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
    ShoppingBag,
    Package,
    Clock,
    XCircle,
    ChevronRight,
    ChevronLeft,
    User,
    Calendar,
    History,
    Truck,
    Search,
    X,
    ArrowUpDown,
} from "lucide-react";
import { useOrderHistory, type OrderHistoryItem } from "@/hooks/useOrderHistory";
import { Badge } from "@repo/ui/badge";
import { OrderTypeBadge } from "@repo/ui/order-type-badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@repo/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { Input } from "@repo/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@repo/ui/table";
import { cn, parseUtcTimestamp } from "@/lib/utils";
import { format } from "date-fns";
import { DatePicker } from "@repo/ui/date-picker";

// Where a row click should navigate. The $main pages route into the full order
// editor (work / sales / alteration); the standalone cashier shell uses this
// to send rows to the cashier payment view instead. Routes are passed as
// strings so the same view works regardless of the consumer's route tree.
export interface OrderLinkTarget {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
}

export type OrderLinkBuilder = (order: OrderHistoryItem) => OrderLinkTarget;

interface OrderHistoryViewProps {
    linkBuilder: OrderLinkBuilder;
}

export function OrderHistoryView({ linkBuilder }: OrderHistoryViewProps) {
    const [page, setPage] = React.useState(0);
    const [pageSize, setPageSize] = React.useState(20);

    const [searchTerm, setSearchTerm] = React.useState("");
    const [statusFilter, setStatusFilter] = React.useState<string>("all");
    const [phaseFilter, setPhaseFilter] = React.useState<string>("all");
    const [typeFilter, setTypeFilter] = React.useState<string>("all");
    const [sortOrder, setSortOrder] = React.useState<"newest" | "oldest">("newest");
    const [dateFilter, setDateFilter] = React.useState<Date | null>(null);

    const { data, isLoading, isError, isFetching } = useOrderHistory({
        page,
        pageSize,
        searchTerm,
        statusFilter,
        phaseFilter,
        typeFilter,
        sortOrder,
        dateFilter,
    });

    const orders = data?.items || [];
    const totalCount = data?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    React.useEffect(() => {
        setPage(0);
    }, [searchTerm, statusFilter, phaseFilter, typeFilter, sortOrder, dateFilter, pageSize]);

    return (
        <div className="p-4 md:p-5 max-w-[1600px] mx-auto space-y-4">
            <div className="space-y-0.5">
                <h1 className="text-2xl flex items-center gap-2 text-foreground">
                    <History className="w-5 h-5 text-muted-foreground" />
                    Order History
                </h1>
                <p className="text-sm text-muted-foreground">
                    Previous work, sales, and alteration orders
                </p>
            </div>

            <div className="bg-card border rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search customer, phone, or #ID..."
                            className="pl-9 pr-8 h-9 text-sm rounded-md"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Clear search"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
                    </div>
                    <span className="text-sm text-muted-foreground tabular-nums shrink-0">
                        {totalCount} {totalCount === 1 ? "order" : "orders"}
                    </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Tabs value={typeFilter} onValueChange={setTypeFilter} className="w-auto gap-0">
                        <TabsList className="h-auto p-1">
                            <TabsTrigger value="all" className="text-xs font-medium px-2.5 py-1">All</TabsTrigger>
                            <TabsTrigger value="WORK" className="text-xs font-medium px-2.5 py-1">Work</TabsTrigger>
                            <TabsTrigger value="SALES" className="text-xs font-medium px-2.5 py-1">Sales</TabsTrigger>
                            <TabsTrigger value="ALTERATION" className="text-xs font-medium px-2.5 py-1">Alter</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto gap-0">
                        <TabsList className="h-auto p-1">
                            <TabsTrigger value="all" className="text-xs font-medium px-2.5 py-1">All</TabsTrigger>
                            <TabsTrigger value="confirmed" className="text-xs font-medium px-2.5 py-1">Confirmed</TabsTrigger>
                            <TabsTrigger value="draft" className="text-xs font-medium px-2.5 py-1">Draft</TabsTrigger>
                            <TabsTrigger value="cancelled" className="text-xs font-medium px-2.5 py-1">Cancelled</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <Tabs value={phaseFilter} onValueChange={setPhaseFilter} className="w-auto gap-0">
                        <TabsList className="h-auto p-1">
                            <TabsTrigger value="all" className="text-xs font-medium px-2.5 py-1">All</TabsTrigger>
                            <TabsTrigger value="new" className="text-xs font-medium px-2.5 py-1">New</TabsTrigger>
                            <TabsTrigger value="in_progress" className="text-xs font-medium px-2.5 py-1">In Prog</TabsTrigger>
                            <TabsTrigger value="completed" className="text-xs font-medium px-2.5 py-1">Done</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="shrink-0 w-32">
                        <DatePicker
                            value={dateFilter}
                            onChange={setDateFilter}
                            clearable
                            placeholder="Any date"
                            displayFormat="dd MMM yy"
                            className="h-9 rounded-md text-xs"
                        />
                    </div>

                    <div className="flex-1 min-w-0" />

                    <button
                        type="button"
                        onClick={() => setSortOrder((prev) => (prev === "newest" ? "oldest" : "newest"))}
                        className="flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors shrink-0"
                    >
                        <ArrowUpDown className="size-3.5" />
                        {sortOrder === "newest" ? "Newest" : "Oldest"}
                    </button>

                    {(searchTerm || statusFilter !== "all" || phaseFilter !== "all" || typeFilter !== "all" || dateFilter) && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchTerm("");
                                setStatusFilter("all");
                                setPhaseFilter("all");
                                setTypeFilter("all");
                                setDateFilter(null);
                            }}
                            className="flex items-center gap-1 h-9 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                            <X className="size-3.5" />
                            Clear
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-2 min-h-100">
                {(isLoading || (isFetching && orders.length === 0)) ? (
                    Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-[68px] border rounded-lg bg-muted/20 animate-pulse" />
                    ))
                ) : isError ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 border border-dashed rounded-lg">
                        <XCircle className="w-10 h-10 text-destructive opacity-60" />
                        <div className="space-y-1">
                            <h3 className="text-lg">Failed to load orders</h3>
                            <p className="text-muted-foreground text-sm">There was an error connecting to the server.</p>
                        </div>
                        <Button onClick={() => window.location.reload()} variant="outline" size="sm" className="h-9 px-4">Retry</Button>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 border border-dashed rounded-lg">
                        <ShoppingBag className="w-10 h-10 text-muted-foreground opacity-30" />
                        <h3 className="text-lg text-muted-foreground">No orders found</h3>
                        <Button size="sm" variant="outline" className="h-9 px-4" onClick={() => { setSearchTerm(""); setStatusFilter("all"); setPhaseFilter("all"); setTypeFilter("all"); setDateFilter(null); }}>
                            Clear filters
                        </Button>
                    </div>
                ) : (
                    <>
                        <div className={cn("transition-opacity duration-200", isFetching && "opacity-60")}>
                            <OrderTable orders={orders} linkBuilder={linkBuilder} />
                            <div className="flex flex-col gap-2 lg:hidden">
                                {orders.map((order) => (
                                    <OrderCard key={order.id} order={order} linkBuilder={linkBuilder} />
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-2">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Rows</span>
                                    <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                                        <SelectTrigger className="h-9 w-16 text-sm">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="20">20</SelectItem>
                                            <SelectItem value="50">50</SelectItem>
                                            <SelectItem value="100">100</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <span className="text-sm text-muted-foreground">
                                    {totalCount > 0 ? (
                                        <>
                                            Showing <span className="text-foreground">{orders.length}</span> of{" "}
                                            <span className="text-foreground">{totalCount}</span>
                                        </>
                                    ) : (
                                        "No orders"
                                    )}
                                </span>
                            </div>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                                        disabled={page === 0 || isFetching}
                                        className="h-9 gap-2 pr-4"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                        Previous
                                    </Button>
                                    <span className="text-sm text-muted-foreground tabular-nums">
                                        Page {page + 1} of {totalPages}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                        disabled={page >= totalPages - 1 || isFetching}
                                        className="h-9 gap-2 pl-4"
                                    >
                                        Next
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const TypeBadge = ({ type }: { type: string }) => <OrderTypeBadge type={type} />;

const DeliveryBadge = ({ homeDelivery }: { homeDelivery: boolean }) => (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {homeDelivery ? <><Truck className="w-3 h-3" />Delivery</> : <><ShoppingBag className="w-3 h-3" />Pickup</>}
    </span>
);

// Single derived state for the order. Collapses checkout_status + order_phase into
// the one label that actually matters in the history view: Draft / Cancelled / New /
// In progress / Completed. SALES orders have no phase concept, so a confirmed SALES
// is shown as Completed.
function deriveOrderState(order: OrderHistoryItem): {
    label: string;
    tone: "draft" | "cancelled" | "new" | "in_progress" | "completed";
} {
    if (order.checkout_status === "draft") return { label: "Draft", tone: "draft" };
    if (order.checkout_status === "cancelled") return { label: "Cancelled", tone: "cancelled" };
    if (order.order_type === "SALES") return { label: "Completed", tone: "completed" };
    switch (order.order_phase) {
        case "completed": return { label: "Completed", tone: "completed" };
        case "in_progress": return { label: "In progress", tone: "in_progress" };
        case "new":
        default: return { label: "New", tone: "new" };
    }
}

const StateBadge = ({ order }: { order: OrderHistoryItem }) => {
    const { label, tone } = deriveOrderState(order);
    const cls: Record<typeof tone, string> = {
        draft: "text-amber-700 border-amber-300",
        cancelled: "text-destructive border-destructive/30",
        new: "text-muted-foreground border-border",
        in_progress: "text-primary border-primary/30",
        completed: "text-primary border-primary/40 bg-primary/5",
    };
    return (
        <Badge variant="outline" className={cn("text-[11px] font-normal px-1.5 py-0 h-5", cls[tone])}>
            {label}
        </Badge>
    );
};

const PieceCount = ({ order }: { order: OrderHistoryItem }) => {
    if (order.order_type === "WORK") {
        const parts: string[] = [];
        if (order.brova_count > 0) parts.push(`${order.brova_count} ${order.brova_count === 1 ? "brova" : "brovas"}`);
        if (order.final_count > 0) parts.push(`${order.final_count} ${order.final_count === 1 ? "final" : "finals"}`);
        const label = parts.length > 0 ? parts.join(" · ") : `${order.fabric_count} ${order.fabric_count === 1 ? "piece" : "pieces"}`;
        return (
            <div className="text-sm tabular-nums text-foreground inline-flex items-center gap-1">
                <Package className="w-3 h-3" />{label}
            </div>
        );
    }
    if (order.order_type === "ALTERATION") {
        const c = order.fabric_count;
        return (
            <div className="text-sm tabular-nums text-foreground inline-flex items-center gap-1">
                <Package className="w-3 h-3" />{c} {c === 1 ? "alteration" : "alterations"}
            </div>
        );
    }
    const c = order.shelf_item_count;
    return (
        <div className="text-sm tabular-nums text-foreground inline-flex items-center gap-1">
            <ShoppingBag className="w-3 h-3" />{c} {c === 1 ? "item" : "items"}
        </div>
    );
};

const Financials = ({ order, isWorkOrder }: { order: OrderHistoryItem; isWorkOrder: boolean }) => {
    if (!isWorkOrder) {
        return (
            <div className="flex items-baseline gap-1 text-foreground">
                <span className="text-sm font-medium tabular-nums">{order.total_amount.toFixed(2)}</span>
                <span className="text-[11px] text-muted-foreground">KWD</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2 tabular-nums text-sm">
            <span className="text-foreground font-medium">{order.total_amount.toFixed(2)}</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-foreground">{order.paid_amount.toFixed(2)}</span>
            {order.balance > 0 ? (
                <span className="text-destructive font-semibold">
                    Due {order.balance.toFixed(2)}
                </span>
            ) : (
                <span className="text-primary font-medium">Paid</span>
            )}
        </div>
    );
};

function OrderTable({ orders, linkBuilder }: { orders: OrderHistoryItem[]; linkBuilder: OrderLinkBuilder }) {
    const navigate = useNavigate();
    return (
        <div className="hidden lg:block rounded-lg border bg-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="py-2 px-4 text-[10px]">Order</TableHead>
                        <TableHead className="py-2 px-4 text-[10px]">Customer</TableHead>
                        <TableHead className="py-2 px-4 text-[10px]">Type / State</TableHead>
                        <TableHead className="py-2 px-4 text-[10px]">Due / Delivery</TableHead>
                        <TableHead className="py-2 px-4 text-[10px]">Pieces</TableHead>
                        <TableHead className="py-2 px-4 text-[10px] text-right">Amounts</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {orders.map((order) => (
                        <OrderTableRow
                            key={order.id}
                            order={order}
                            onNavigate={(target) => navigate(target as any)}
                            linkBuilder={linkBuilder}
                        />
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function OrderTableRow({
    order,
    linkBuilder,
    onNavigate,
}: {
    order: OrderHistoryItem;
    linkBuilder: OrderLinkBuilder;
    onNavigate: (target: OrderLinkTarget) => void;
}) {
    const isWorkOrder = order.order_type === "WORK";
    const isAlterationOrder = order.order_type === "ALTERATION";
    const isGarmentOrder = isWorkOrder || isAlterationOrder;
    const orderDate = order.order_date ? format(parseUtcTimestamp(order.order_date), "dd/MM/yy") : "N/A";
    const dueDate = isGarmentOrder && order.delivery_date
        ? format(parseUtcTimestamp(order.delivery_date), "dd/MM/yy")
        : null;
    const target = linkBuilder(order);

    return (
        <TableRow
            onClick={() => onNavigate(target)}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onNavigate(target);
                }
            }}
            className="cursor-pointer group focus-visible:outline-none focus-visible:bg-muted/50"
        >
            <TableCell className="px-4 py-2 align-top">
                <div className="text-sm font-semibold tabular-nums text-foreground group-hover:text-primary transition-colors">#{order.id}</div>
                <div className="text-xs text-muted-foreground tabular-nums flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" />{orderDate}
                </div>
            </TableCell>
            <TableCell className="px-4 py-2 align-top max-w-[260px]">
                <div className="text-sm font-medium truncate">{order.customer_name}</div>
                <div className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">{order.customer_phone}</div>
            </TableCell>
            <TableCell className="px-4 py-2 align-top">
                <div className="flex items-center gap-1.5"><TypeBadge type={order.order_type} /></div>
                <div className="flex items-center gap-1.5 mt-1">
                    <StateBadge order={order} />
                </div>
            </TableCell>
            <TableCell className="px-4 py-2 align-top">
                <div className="text-sm tabular-nums text-foreground">
                    {dueDate ? <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{dueDate}</span> : <span className="text-muted-foreground">—</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                    {isGarmentOrder ? <DeliveryBadge homeDelivery={order.home_delivery} /> : <span>—</span>}
                </div>
            </TableCell>
            <TableCell className="px-4 py-2 align-top">
                <PieceCount order={order} />
                {isWorkOrder && order.charges.discount > 0 && (
                    <div className="text-xs text-muted-foreground tabular-nums mt-0.5">−{order.charges.discount.toFixed(2)} disc</div>
                )}
            </TableCell>
            <TableCell className="px-4 py-2 align-top text-right">
                {isGarmentOrder ? (
                    <>
                        <div className="text-sm tabular-nums">
                            <span className="text-foreground font-medium">{order.total_amount.toFixed(2)}</span>
                            <span className="text-muted-foreground/50 mx-1">/</span>
                            <span className="text-foreground">{order.paid_amount.toFixed(2)}</span>
                        </div>
                        <div className="text-xs tabular-nums mt-0.5">
                            {order.balance > 0 ? (
                                <span className="text-destructive font-semibold">Due {order.balance.toFixed(2)}</span>
                            ) : (
                                <span className="text-primary font-medium">Paid</span>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="text-sm tabular-nums text-foreground font-medium">
                            {order.total_amount.toFixed(2)} <span className="text-[11px] text-muted-foreground font-normal">KWD</span>
                        </div>
                        <div className="text-xs text-primary font-medium mt-0.5">Paid</div>
                    </>
                )}
            </TableCell>
        </TableRow>
    );
}

function OrderCard({ order, linkBuilder }: { order: OrderHistoryItem; linkBuilder: OrderLinkBuilder }) {
    const isWorkOrder = order.order_type === "WORK";
    const isAlterationOrder = order.order_type === "ALTERATION";
    const isGarmentOrder = isWorkOrder || isAlterationOrder;
    const orderDate = order.order_date ? format(parseUtcTimestamp(order.order_date), "dd/MM/yy") : "N/A";
    const target = linkBuilder(order);

    return (
        <Link
            to={target.to as any}
            params={target.params as any}
            search={target.search as any}
            className="group block"
        >
            <Card className="overflow-hidden border bg-card group-hover:border-primary/40 group-hover:bg-muted/30 transition-colors py-0 gap-0 rounded-lg">
                <CardContent className="px-4 py-2.5 sm:px-5 space-y-1.5">
                    {/* ===== TABLET (sm to lg): 2-row grid ===== */}
                    <div className="hidden sm:block lg:hidden space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">#{order.id}</span>
                            <TypeBadge type={order.order_type} />
                            <div className="w-px h-4 bg-border/30 shrink-0" />
                            <User className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">{order.customer_name}</span>
                            <span className="text-xs text-foreground font-mono tabular-nums shrink-0">{order.customer_phone}</span>
                            <div className="flex-1" />
                            <StateBadge order={order} />
                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-foreground tabular-nums flex items-center gap-1">
                                <Calendar className="w-3 h-3" />{orderDate}
                            </span>
                            {isGarmentOrder && order.delivery_date && (
                                <span className="text-xs text-foreground tabular-nums flex items-center gap-1">
                                    <Clock className="w-3 h-3" />Due {format(parseUtcTimestamp(order.delivery_date), "dd/MM/yy")}
                                </span>
                            )}
                            {isGarmentOrder && <DeliveryBadge homeDelivery={order.home_delivery} />}
                            <PieceCount order={order} />
                            <div className="flex-1" />
                            <Financials order={order} isWorkOrder={isGarmentOrder} />
                        </div>
                    </div>

                    {/* ===== MOBILE (<sm): 3-row stack ===== */}
                    <div className="sm:hidden space-y-1.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold tabular-nums text-foreground">#{order.id}</span>
                                <TypeBadge type={order.order_type} />
                                <span className="text-xs text-foreground tabular-nums">{orderDate}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <User className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span className="font-medium text-sm truncate">{order.customer_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {isGarmentOrder && <DeliveryBadge homeDelivery={order.home_delivery} />}
                                <span className="text-xs text-foreground font-mono tabular-nums">{order.customer_phone}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/30">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <StateBadge order={order} />
                                <PieceCount order={order} />
                            </div>
                            <Financials order={order} isWorkOrder={isGarmentOrder} />
                        </div>
                        {isGarmentOrder && order.delivery_date && (
                            <div className="flex items-center gap-1 text-xs text-foreground tabular-nums">
                                <Clock className="w-3 h-3" />Due {format(parseUtcTimestamp(order.delivery_date), "dd/MM/yy")}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
