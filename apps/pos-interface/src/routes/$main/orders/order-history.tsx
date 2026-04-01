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
    Truck,
    Search,
    X,
    ArrowUpDown
} from "lucide-react";
import { useOrderHistory, type OrderHistoryItem } from "@/hooks/useOrderHistory";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@repo/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { Input } from "@repo/ui/input";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { DatePicker } from "@repo/ui/date-picker";
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
        <div className="p-4 md:p-5 max-w-[1600px] mx-auto space-y-3">
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
            <div className="bg-white border border-border/60 rounded-xl shadow-sm p-2.5 sm:p-3 space-y-2.5">
                {/* Search + Count */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0 group">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                        <Input
                            placeholder="Search customer, phone, or #ID..."
                            className="pl-8 pr-8 h-8 text-xs bg-muted/30 border-transparent focus-visible:bg-white focus-visible:border-border shadow-none rounded-lg font-medium placeholder:font-normal"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Clear search"
                            >
                                <X className="size-3" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 bg-primary/5 px-2.5 py-1.5 rounded-lg border border-primary/10 text-primary font-black text-xs tabular-nums shrink-0">
                        <Package className="size-3.5" />
                        <span>{totalCount}</span>
                    </div>
                </div>

                {/* Filter Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Tabs value={typeFilter} onValueChange={setTypeFilter} className="w-auto gap-0">
                        <TabsList className="h-8">
                            <TabsTrigger value="all" className="text-[11px] font-bold px-2.5">All</TabsTrigger>
                            <TabsTrigger value="WORK" className="text-[11px] font-bold px-2.5">Work</TabsTrigger>
                            <TabsTrigger value="SALES" className="text-[11px] font-bold px-2.5">Sales</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto gap-0">
                        <TabsList className="h-8">
                            <TabsTrigger value="all" className="text-[11px] font-bold px-2.5">All</TabsTrigger>
                            <TabsTrigger value="confirmed" className="text-[11px] font-bold px-2.5">Confirmed</TabsTrigger>
                            <TabsTrigger value="draft" className="text-[11px] font-bold px-2.5">Draft</TabsTrigger>
                            <TabsTrigger value="cancelled" className="text-[11px] font-bold px-2.5">Cancelled</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <Tabs value={phaseFilter} onValueChange={setPhaseFilter} className="w-auto gap-0">
                        <TabsList className="h-8">
                            <TabsTrigger value="all" className="text-[11px] font-bold px-2.5">All</TabsTrigger>
                            <TabsTrigger value="new" className="text-[11px] font-bold px-2.5">New</TabsTrigger>
                            <TabsTrigger value="in_progress" className="text-[11px] font-bold px-2.5">In Prog</TabsTrigger>
                            <TabsTrigger value="completed" className="text-[11px] font-bold px-2.5">Done</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <div className="shrink-0 w-32">
                        <DatePicker
                            value={dateFilter}
                            onChange={setDateFilter}
                            clearable
                            placeholder="Any date"
                            displayFormat="dd MMM yy"
                            className="h-8 bg-transparent border-border/40 rounded-lg shadow-none text-[11px] font-bold"
                        />
                    </div>

                    <div className="flex-1 min-w-0" />

                    <button
                        type="button"
                        onClick={() => setSortOrder(prev => prev === "newest" ? "oldest" : "newest")}
                        className="flex items-center gap-1 h-8 px-2.5 text-[11px] font-bold text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors shrink-0"
                    >
                        <ArrowUpDown className="size-3" />
                        {sortOrder === "newest" ? "Newest" : "Oldest"}
                    </button>

                    {(searchTerm || statusFilter !== "all" || phaseFilter !== "all" || typeFilter !== "all" || dateFilter) && (
                        <button
                            type="button"
                            onClick={() => { setSearchTerm(""); setStatusFilter("all"); setPhaseFilter("all"); setTypeFilter("all"); setDateFilter(null); }}
                            className="flex items-center gap-0.5 h-8 px-1.5 text-[11px] font-bold text-destructive/70 hover:text-destructive transition-colors shrink-0"
                        >
                            <X className="size-3" />
                            Clear
                        </button>
                    )}
                </div>
            </div>

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
    completed: "bg-primary/15 text-primary",
};

const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
        case "confirmed":
            return <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px] px-1.5 py-0 h-5 shadow-none"><CheckCircle2 className="w-3 h-3 mr-1" />Confirmed</Badge>;
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
                <span className="text-primary font-bold uppercase text-[10px] tracking-tight">Paid</span>
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

                <CardContent className="pl-4 pr-3 py-2.5 sm:pl-5 sm:pr-4 space-y-1.5">
                    {/* ===== DESKTOP (lg+): 2-row layout ===== */}
                    <div className="hidden lg:block space-y-1.5">
                        {/* Row 1: ID, customer, status badges */}
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm font-bold tabular-nums">#{order.id}</span>
                                <TypeBadge type={order.order_type} />
                            </div>
                            <div className="w-px h-4 bg-border/30 shrink-0" />
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <User className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{order.customer_name}</span>
                                <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">{order.customer_phone}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <StatusBadge status={order.checkout_status} />
                                {order.order_phase && <PhaseBadge phase={order.order_phase} />}
                                <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all ml-1" />
                            </div>
                        </div>
                        {/* Row 2: contextual details */}
                        <div className="flex items-center gap-3 pl-0.5">
                            <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
                                <Calendar className="w-3 h-3" />{orderDate}
                            </span>
                            {isWorkOrder && order.delivery_date && (
                                <span className="text-[11px] tabular-nums text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" />Due {format(new Date(order.delivery_date), "dd/MM/yy")}
                                </span>
                            )}
                            {isWorkOrder && <DeliveryBadge homeDelivery={order.home_delivery} />}
                            <ItemCount isWork={isWorkOrder} count={itemCount} />
                            {isWorkOrder && order.charges.discount > 0 && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded leading-none">
                                    -{order.charges.discount.toFixed(2)} disc
                                </span>
                            )}
                            <div className="flex-1" />
                            <Financials order={order} isWorkOrder={isWorkOrder} />
                        </div>
                    </div>

                    {/* ===== TABLET (sm to lg): 2-row grid ===== */}
                    <div className="hidden sm:block lg:hidden space-y-1.5">
                        {/* Row 1: ID + customer + badges */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold tabular-nums shrink-0">#{order.id}</span>
                            <TypeBadge type={order.order_type} />
                            <div className="w-px h-4 bg-border/30 shrink-0" />
                            <User className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{order.customer_name}</span>
                            <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">{order.customer_phone}</span>
                            <div className="flex-1" />
                            <StatusBadge status={order.checkout_status} />
                            {order.order_phase && <PhaseBadge phase={order.order_phase} />}
                            <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>
                        {/* Row 2: date, delivery, items, financials */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-muted-foreground tabular-nums flex items-center gap-1">
                                <Calendar className="w-3 h-3" />{orderDate}
                            </span>
                            {isWorkOrder && order.delivery_date && (
                                <span className="text-[11px] tabular-nums text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" />Due {format(new Date(order.delivery_date), "dd/MM/yy")}
                                </span>
                            )}
                            {isWorkOrder && <DeliveryBadge homeDelivery={order.home_delivery} />}
                            <ItemCount isWork={isWorkOrder} count={itemCount} />
                            <div className="flex-1" />
                            <Financials order={order} isWorkOrder={isWorkOrder} />
                        </div>
                    </div>

                    {/* ===== MOBILE (<sm): 3-row stack ===== */}
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
                        {/* Row 2: customer + phone + delivery */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <User className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span className="font-semibold text-sm truncate">{order.customer_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {isWorkOrder && <DeliveryBadge homeDelivery={order.home_delivery} />}
                                <span className="text-[11px] text-muted-foreground font-mono tabular-nums">{order.customer_phone}</span>
                            </div>
                        </div>
                        {/* Row 3: badges + items + financials */}
                        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/30">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <StatusBadge status={order.checkout_status} />
                                {order.order_phase && <PhaseBadge phase={order.order_phase} />}
                                <ItemCount isWork={isWorkOrder} count={itemCount} />
                            </div>
                            <Financials order={order} isWorkOrder={isWorkOrder} />
                        </div>
                        {isWorkOrder && order.delivery_date && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                                <Clock className="w-3 h-3" />Due {format(new Date(order.delivery_date), "dd/MM/yy")}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}

