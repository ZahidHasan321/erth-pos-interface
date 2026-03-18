"use client";

import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
    ShoppingBag,
    Package,
    Clock,
    CheckCircle2,
    XCircle,
    ChevronRight,
    ChevronLeft,
    User,
    Calendar,
    History,
    Truck
} from "lucide-react";
import { useOrderHistory, type OrderHistoryItem } from "@/hooks/useOrderHistory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { OrderHistorySearch } from "@/components/order-management/order-history-search";
import { DatePicker } from "@/components/ui/date-picker";
import { ORDER_PHASE_LABELS } from "@/lib/constants";

export const Route = createFileRoute("/$main/orders/order-history")({
    component: OrderHistoryPage,
    head: () => ({
        meta: [{ title: "Order History" }],
    }),
});

function OrderHistoryPage() {
    const [page, setPage] = React.useState(0);
    const [pageSize, setPageSize] = React.useState(20);

    // Filter states
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
        dateFilter
    });

    const orders = data?.items || [];
    const totalCount = data?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Reset to page 0 when filters change
    React.useEffect(() => {
        setPage(0);
    }, [searchTerm, statusFilter, phaseFilter, typeFilter, sortOrder, dateFilter, pageSize]);

    return (
        <div className="container mx-auto py-4 px-4 lg:px-8 space-y-3 max-w-7xl">
            {/* Header */}
            <div className="space-y-1">
                <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 text-foreground">
                    <History className="w-5 h-5 text-primary" />
                    Order History
                </h1>
                <p className="text-sm text-muted-foreground">
                    Manage your previous work and sales orders
                </p>
            </div>

            {/* Filters Section */}
            <Card className="border border-border/80 shadow-sm bg-white rounded-xl overflow-hidden mb-3 py-0 gap-0">
                <CardContent className="p-2.5 sm:p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                            <OrderHistorySearch
                                value={searchTerm}
                                onChange={setSearchTerm}
                            />
                        </div>
                        <div className="flex items-center gap-1.5 bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10 text-primary font-bold text-xs tabular-nums shrink-0 self-start">
                            <Package className="w-3.5 h-3.5" />
                            <span>{totalCount}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2">
                        <div className="space-y-1 col-span-2 sm:col-span-1">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground ml-0.5">Date</label>
                            <DatePicker
                                value={dateFilter}
                                onChange={setDateFilter}
                                clearable
                                placeholder="Any date"
                                className="h-8 bg-white border-border/80 rounded-lg shadow-sm focus:ring-primary/20 w-full text-xs [&>button]:truncate"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground ml-0.5">Sort</label>
                            <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
                                <SelectTrigger className="h-8 bg-white border-border/80 rounded-lg shadow-sm text-xs">
                                    <SelectValue placeholder="Sort" />
                                </SelectTrigger>
                                <SelectContent className="rounded-lg">
                                    <SelectItem value="newest" className="text-xs">Newest</SelectItem>
                                    <SelectItem value="oldest" className="text-xs">Oldest</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground ml-0.5">Status</label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="h-8 bg-white border-border/80 rounded-lg shadow-sm text-xs">
                                    <SelectValue placeholder="All" />
                                </SelectTrigger>
                                <SelectContent className="rounded-lg">
                                    <SelectItem value="all" className="text-xs">All</SelectItem>
                                    <SelectItem value="confirmed" className="text-xs">Confirmed</SelectItem>
                                    <SelectItem value="draft" className="text-xs">Drafts</SelectItem>
                                    <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground ml-0.5">Phase</label>
                            <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                                <SelectTrigger className="h-8 bg-white border-border/80 rounded-lg shadow-sm text-xs">
                                    <SelectValue placeholder="All" />
                                </SelectTrigger>
                                <SelectContent className="rounded-lg">
                                    <SelectItem value="all" className="text-xs">All</SelectItem>
                                    <SelectItem value="new" className="text-xs">New</SelectItem>
                                    <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                                    <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground ml-0.5">Type</label>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="h-8 bg-white border-border/80 rounded-lg shadow-sm text-xs">
                                    <SelectValue placeholder="All" />
                                </SelectTrigger>
                                <SelectContent className="rounded-lg">
                                    <SelectItem value="all" className="text-xs">All</SelectItem>
                                    <SelectItem value="WORK" className="text-xs">Work</SelectItem>
                                    <SelectItem value="SALES" className="text-xs">Sales</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* List Section */}
            <div className="flex flex-col gap-2 min-h-100">
                {(isLoading || (isFetching && orders.length === 0)) ? (
                    Array.from({ length: 8 }).map((_, i) => (
                        <Card key={i} className="border-none shadow-sm animate-pulse py-0 gap-0">
                            <CardContent className="p-4 h-18 bg-muted/20 rounded-xl" />
                        </Card>
                    ))
                ) : isError ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
                        <XCircle className="w-12 h-12 text-destructive opacity-50" />
                        <div className="space-y-1">
                            <h3 className="font-bold text-lg">Failed to load orders</h3>
                            <p className="text-muted-foreground text-sm">There was an error connecting to the server.</p>
                        </div>
                        <Button onClick={() => window.location.reload()} variant="outline" size="sm" className="h-9 px-4">Retry</Button>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 border-2 border-dashed border-muted rounded-xl bg-muted/5">
                        <ShoppingBag className="w-12 h-12 text-muted-foreground opacity-20" />
                        <div className="space-y-0.5">
                            <h3 className="font-bold text-lg text-muted-foreground">No orders found</h3>
                        </div>
                        <Button size="sm" variant="outline" className="h-9 px-4" onClick={() => { setSearchTerm(""); setStatusFilter("all"); setPhaseFilter("all"); setTypeFilter("all"); setDateFilter(null); }}>
                            Clear filters
                        </Button>
                    </div>) : (
                    <>
                        <div className={cn("flex flex-col gap-2 transition-opacity duration-200", isFetching && "opacity-60")}>
                            {orders.map((order) => (
                                <OrderCard key={order.id} order={order} />
                            ))}
                        </div>

                        {/* Pagination Controls */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 py-3">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rows</span>
                                    <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                                        <SelectTrigger className="h-8 w-16 bg-white border-border/80 text-xs">
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
                                            Showing <span className="font-bold text-foreground">{orders.length}</span> of{" "}
                                            <span className="font-bold text-foreground">{totalCount}</span>
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
                                        onClick={() => setPage(p => Math.max(0, p - 1))}
                                        disabled={page === 0 || isFetching}
                                        className="h-9 gap-2 pr-4 shadow-sm"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                        Previous
                                    </Button>
                                    <div className="flex items-center gap-1 text-sm font-bold px-4 h-9 bg-muted/50 rounded-md border border-border/50 shadow-inner">
                                        Page {page + 1} of {totalPages}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                        disabled={page >= totalPages - 1 || isFetching}
                                        className="h-9 gap-2 pl-4 shadow-sm"
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

const PHASE_BADGE_STYLES: Record<string, string> = {
    new: "bg-gray-500/15 text-gray-600",
    in_progress: "bg-amber-500/15 text-amber-600",
    completed: "bg-emerald-500/15 text-emerald-600",
};

const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
        case "confirmed":
            return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-[11px] px-1.5 py-0 h-5 shadow-none"><CheckCircle2 className="w-3 h-3 mr-1" />Confirmed</Badge>;
        case "cancelled":
            return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 text-[11px] px-1.5 py-0 h-5 shadow-none"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
        default:
            return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-200 text-[11px] px-1.5 py-0 h-5 shadow-none"><Clock className="w-3 h-3 mr-1" />Draft</Badge>;
    }
};

const PhaseBadge = ({ phase }: { phase: string }) => (
    <Badge variant="outline" className={cn("h-5 px-1.5 text-[11px] font-black uppercase border-none shadow-xs", PHASE_BADGE_STYLES[phase])}>
        {ORDER_PHASE_LABELS[phase as keyof typeof ORDER_PHASE_LABELS]}
    </Badge>
);

const TypeBadge = ({ type }: { type: string }) => type === "SALES"
    ? <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider leading-none">SALES</span>
    : <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider leading-none">WORK</span>;

const DeliveryBadge = ({ homeDelivery }: { homeDelivery: boolean }) => (
    <span className={cn(
        "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border leading-none",
        homeDelivery ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-slate-50 text-slate-600 border-slate-200"
    )}>
        {homeDelivery ? <><Truck className="w-2.5 h-2.5" />Delivery</> : <><ShoppingBag className="w-2.5 h-2.5" />Pickup</>}
    </span>
);

const ItemCount = ({ isWork, count }: { isWork: boolean; count: number }) => (
    <div className="bg-muted/50 px-2 py-0.5 rounded-md inline-flex items-center gap-1.5 border border-border/10">
        {isWork ? <Package className="w-3 h-3 text-primary/70" /> : <ShoppingBag className="w-3 h-3 text-amber-500/70" />}
        <span className="text-xs font-bold tabular-nums">{count}</span>
    </div>
);

const Financials = ({ order, isWorkOrder }: { order: OrderHistoryItem; isWorkOrder: boolean }) => {
    if (!isWorkOrder) {
        return (
            <div className="flex items-center gap-1 text-foreground">
                <span className="font-black text-sm tabular-nums leading-none">{order.total_amount.toFixed(2)}</span>
                <span className="text-[10px] font-bold text-muted-foreground">KWD</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-2 tabular-nums text-[11px]">
            <span className="text-muted-foreground font-bold">{order.total_amount.toFixed(2)}</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-muted-foreground font-bold">{order.paid_amount.toFixed(2)}</span>
            {order.balance > 0 ? (
                <span className="text-destructive font-black bg-destructive/5 px-1 py-0.5 rounded border border-destructive/10 leading-none">
                    Due {order.balance.toFixed(2)}
                </span>
            ) : (
                <span className="text-emerald-600 font-bold uppercase text-[10px] tracking-tight">Paid</span>
            )}
        </div>
    );
};

function OrderCard({ order }: { order: OrderHistoryItem }) {
    const isWorkOrder = order.order_type === "WORK";
    const route = isWorkOrder ? "/$main/orders/new-work-order" : "/$main/orders/new-sales-order";
    const itemCount = isWorkOrder ? order.fabric_count : order.shelf_item_count;
    const orderDate = order.order_date ? format(new Date(order.order_date), "dd/MM/yy") : "N/A";

    return (
        <Link to={route} search={{ orderId: order.id }} className="group block">
            <Card className="overflow-hidden border border-border/50 group-hover:border-primary/40 group-hover:shadow-md transition-all bg-card/50 relative py-0 gap-0 shadow-sm rounded-xl">
                <div className={cn("absolute left-0 top-0 bottom-0 w-1", isWorkOrder ? "bg-primary" : "bg-amber-500")} />

                <CardContent className="pl-4 pr-3 py-2 sm:pl-5 sm:pr-4">
                    {/* ===== DESKTOP (lg+): single row ===== */}
                    <div className="hidden lg:flex items-center gap-4">
                        <div className="flex items-center gap-2 w-40 shrink-0">
                            <span className="text-sm font-bold tabular-nums">#{order.id}</span>
                            <TypeBadge type={order.order_type} />
                            <span className="text-xs text-muted-foreground tabular-nums">{orderDate}</span>
                        </div>

                        <div className="w-px h-8 bg-border/30 shrink-0" />

                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <User className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{order.customer_name}</span>
                            <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">{order.customer_phone}</span>
                            {isWorkOrder && <DeliveryBadge homeDelivery={order.home_delivery} />}
                            {isWorkOrder && order.delivery_date && (
                                <span className="text-[11px] tabular-nums text-muted-foreground">Due {format(new Date(order.delivery_date), "dd/MM/yy")}</span>
                            )}
                        </div>

                        <ItemCount isWork={isWorkOrder} count={itemCount} />
                        <Financials order={order} isWorkOrder={isWorkOrder} />

                        <div className="w-px h-8 bg-border/30 shrink-0" />

                        <div className="flex items-center gap-1.5 shrink-0">
                            <StatusBadge status={order.checkout_status} />
                            {order.order_phase && <PhaseBadge phase={order.order_phase} />}
                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all ml-1" />
                        </div>
                    </div>

                    {/* ===== TABLET (sm to lg): compact 2-row grid ===== */}
                    <div className="hidden sm:grid lg:hidden grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                        {/* Row 1 left: ID + customer */}
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-bold tabular-nums shrink-0">#{order.id}</span>
                            <TypeBadge type={order.order_type} />
                            <div className="w-px h-4 bg-border/30 shrink-0" />
                            <User className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{order.customer_name}</span>
                            <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">{order.customer_phone}</span>
                        </div>
                        {/* Row 1 right: financials + chevron */}
                        <div className="flex items-center gap-2 shrink-0">
                            <Financials order={order} isWorkOrder={isWorkOrder} />
                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>

                        {/* Row 2 left: date, delivery, items, badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
                                <Calendar className="w-3 h-3" />{orderDate}
                            </span>
                            {isWorkOrder && <DeliveryBadge homeDelivery={order.home_delivery} />}
                            {isWorkOrder && order.delivery_date && (
                                <span className="text-[11px] tabular-nums text-muted-foreground">Due {format(new Date(order.delivery_date), "dd/MM/yy")}</span>
                            )}
                            <ItemCount isWork={isWorkOrder} count={itemCount} />
                        </div>
                        {/* Row 2 right: status badges */}
                        <div className="flex items-center gap-1.5 justify-end">
                            <StatusBadge status={order.checkout_status} />
                            {order.order_phase && <PhaseBadge phase={order.order_phase} />}
                        </div>
                    </div>

                    {/* ===== MOBILE (<sm): compact stack ===== */}
                    <div className="sm:hidden space-y-1.5">
                        {/* Row 1: ID + type + date + chevron */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold tabular-nums">#{order.id}</span>
                                <TypeBadge type={order.order_type} />
                                <span className="text-[11px] text-muted-foreground tabular-nums">{orderDate}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                        </div>
                        {/* Row 2: customer + phone */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <User className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span className="font-semibold text-sm truncate">{order.customer_name}</span>
                            </div>
                            <span className="text-[11px] text-muted-foreground font-mono tabular-nums shrink-0">{order.customer_phone}</span>
                        </div>
                        {/* Row 3: badges + financials */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <StatusBadge status={order.checkout_status} />
                                {order.order_phase && <PhaseBadge phase={order.order_phase} />}
                                <ItemCount isWork={isWorkOrder} count={itemCount} />
                            </div>
                            <Financials order={order} isWorkOrder={isWorkOrder} />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
