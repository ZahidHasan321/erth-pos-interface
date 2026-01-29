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
    Filter,
    History,
    Phone,
    CalendarArrowDown,
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
    const [typeFilter, setTypeFilter] = React.useState<string>("all");
    const [sortOrder, setSortOrder] = React.useState<"newest" | "oldest">("newest");
    const [dateFilter, setDateFilter] = React.useState<Date | null>(null);

    const { data, isLoading, isError, isFetching } = useOrderHistory({
        page,
        pageSize,
        searchTerm,
        statusFilter,
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
    }, [searchTerm, statusFilter, typeFilter, sortOrder, dateFilter, pageSize]);

    return (
        <div className="container mx-auto py-4 px-4 lg:px-8 space-y-3 max-w-7xl">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-foreground">
                        <History className="w-8 h-8 text-primary" />
                        Order History
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Manage your previous work and sales orders
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rows per page</span>
                        <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                            <SelectTrigger className="h-9 w-20 bg-white border-border/80">
                                <SelectValue placeholder={pageSize.toString()} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2 bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/10 text-primary font-bold text-sm">
                        <Package className="w-4 h-4" />
                        <span>{totalCount} {totalCount === 1 ? 'Order' : 'Orders'} Total</span>
                    </div>
                </div>
            </div>

            {/* Filters Section */}
            <Card className="border border-border/80 shadow-md bg-white rounded-2xl overflow-hidden mb-4 py-0 gap-0">
                <CardContent className="p-4 sm:p-6 space-y-4">
                    {/* Search - Full Width */}
                    <OrderHistorySearch
                        value={searchTerm}
                        onChange={setSearchTerm}
                    />

                    {/* Filter Row */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Date Filter */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Date</label>
                            <DatePicker
                                value={dateFilter}
                                onChange={setDateFilter}
                                clearable
                                placeholder="Filter by date"
                                className="h-10 bg-white border-border/80 rounded-xl shadow-sm focus:ring-primary/20 w-full text-sm"
                            />
                        </div>

                        {/* Sort Order */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Sort By</label>
                            <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
                                <SelectTrigger className="h-10 bg-white border-border/80 rounded-xl shadow-sm focus:ring-primary/20">
                                    <div className="flex items-center gap-2">
                                        <CalendarArrowDown className="size-4 text-primary shrink-0" />
                                        <SelectValue placeholder="Sort" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent className="rounded-xl shadow-xl">
                                    <SelectItem value="newest" className="rounded-lg">Newest First</SelectItem>
                                    <SelectItem value="oldest" className="rounded-lg">Oldest First</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Status Filter */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Status</label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="h-10 bg-white border-border/80 rounded-xl shadow-sm focus:ring-primary/20">
                                    <div className="flex items-center gap-2">
                                        <Filter className="size-4 text-primary shrink-0" />
                                        <SelectValue placeholder="Status" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent className="rounded-xl shadow-xl">
                                    <SelectItem value="all" className="rounded-lg">All Status</SelectItem>
                                    <SelectItem value="confirmed" className="rounded-lg">Confirmed</SelectItem>
                                    <SelectItem value="draft" className="rounded-lg">Drafts</SelectItem>
                                    <SelectItem value="cancelled" className="rounded-lg">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Type Filter */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Order Type</label>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="h-10 bg-white border-border/80 rounded-xl shadow-sm focus:ring-primary/20">
                                    <div className="flex items-center gap-2">
                                        <ShoppingBag className="size-4 text-primary shrink-0" />
                                        <SelectValue placeholder="Type" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent className="rounded-xl shadow-xl">
                                    <SelectItem value="all" className="rounded-lg">All Types</SelectItem>
                                    <SelectItem value="WORK" className="rounded-lg">Work Orders</SelectItem>
                                    <SelectItem value="SALES" className="rounded-lg">Sales Orders</SelectItem>
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
                        <Button size="sm" variant="outline" className="h-9 px-4" onClick={() => { setSearchTerm(""); setStatusFilter("all"); setTypeFilter("all"); setDateFilter(null); }}>
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
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-2 py-6">
                                <div className="text-sm text-muted-foreground">
                                    {totalCount > 0 ? (
                                        <>
                                            Showing <span className="font-bold text-foreground">{orders.length}</span> out of{" "}
                                            <span className="font-bold text-foreground">{totalCount}</span> orders
                                        </>
                                    ) : (
                                        "No orders to show"
                                    )}
                                </div>
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
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

const getStatusBadge = (status: string) => {
    switch (status) {
        case "confirmed":
            return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 hover:bg-emerald-500/20 text-xs px-2 py-0.5 h-6 shadow-none"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Confirmed</Badge>;
        case "cancelled":
            return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 text-xs px-2 py-0.5 h-6 shadow-none"><XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancelled</Badge>;
        case "draft":
        default:
            return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-200 hover:bg-amber-500/20 text-xs px-2 py-0.5 h-6 shadow-none"><Clock className="w-3.5 h-3.5 mr-1.5" /> Draft</Badge>;
    }
};

function OrderCard({ order }: { order: OrderHistoryItem }) {
    const isWorkOrder = order.order_type === "WORK";
    const route = isWorkOrder ? "/$main/orders/new-work-order" : "/$main/orders/new-sales-order";

    return (
        <Link
            to={route}
            search={{ orderId: order.id }}
            className="group block transition-all"
        >
            <Card className="overflow-hidden border border-border/50 group-hover:border-primary/40 group-hover:shadow-md transition-all bg-card/50 backdrop-blur-sm relative py-0 gap-0 shadow-sm rounded-xl">
                <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-1.5",
                    isWorkOrder ? "bg-primary" : "bg-amber-500"
                )} />
                <CardContent className="p-2 sm:px-4 sm:py-3">
                    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">

                        {/* ID & Date */}
                        <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center gap-1 md:w-36 shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-foreground tabular-nums">
                                    #{order.id}
                                </span>
                                {order.order_type === "SALES" ? (
                                    <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider">SALES</span>
                                ) : (
                                    <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider">WORK</span>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 opacity-70" />
                                    <span className="tabular-nums font-medium">{order.order_date ? format(new Date(order.order_date), "dd/MM/yy") : "N/A"}</span>
                                </div>

                            </div>
                        </div>

                        {/* Customer Info */}
                        <div className="flex-1 min-w-0 md:border-l md:border-border/20 md:pl-6">
                            <div className="flex items-center gap-6">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2.5">
                                        <div className="bg-primary/10 p-1.5 rounded-full shrink-0">
                                            <User className="w-4 h-4 text-primary" />
                                        </div>
                                        <h3 className="font-bold text-base leading-tight group-hover:text-primary transition-colors truncate">
                                            {order.customer_name}
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground mt-1 ml-0.5">
                                        <Phone className="w-3.5 h-3.5 opacity-70 shrink-0" />
                                        <span className="text-sm font-mono tabular-nums font-medium">
                                            {order.customer_phone}
                                        </span>
                                    </div>
                                </div>
                                {order.order_type === "WORK" && (
                                    <div className="flex flex-col items-center gap-1 shrink-0">
                                        <div className={cn(
                                            "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border",
                                            order.home_delivery
                                                ? "bg-blue-50 text-blue-600 border-blue-200"
                                                : "bg-slate-50 text-slate-600 border-slate-200"
                                        )}>
                                            {order.home_delivery ? (
                                                <><Truck className="w-3 h-3" /> Delivery</>
                                            ) : (
                                                <><ShoppingBag className="w-3 h-3" /> Pick Up</>
                                            )}
                                        </div>
                                        {order.delivery_date && (
                                            <span className="text-[11px] tabular-nums font-medium text-muted-foreground">
                                                {format(new Date(order.delivery_date), "dd/MM/yy")}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Items, Financials & Status */}
                        <div className="flex items-center justify-between md:justify-end gap-3 md:border-l md:border-border/20 md:pl-6 md:min-w-65">

                            <div className="flex items-center gap-4">
                                {/* Item Badge */}
                                <div className="bg-muted/50 px-2.5 py-1 rounded-lg flex items-center gap-2 border border-border/10">
                                    {isWorkOrder ? (
                                        <Package className="w-4 h-4 text-primary/70" />
                                    ) : (
                                        <ShoppingBag className="w-4 h-4 text-amber-500/70" />
                                    )}
                                    <span className="text-sm font-bold tabular-nums">
                                        {isWorkOrder ? order.fabric_count : order.shelf_item_count}
                                    </span>
                                </div>

                                {/* Financials */}
                                <div className="flex flex-col items-end min-w-25">
                                    {isWorkOrder ? (
                                        <div className="flex flex-col items-end space-y-0.5">
                                            <span className="text-[10px] text-muted-foreground font-bold tabular-nums">
                                                Total: {order.total_amount.toFixed(2)}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground font-bold tabular-nums">
                                                Paid: {order.paid_amount.toFixed(2)}
                                            </span>
                                            {order.balance > 0 ? (
                                                <span className="text-[10px] text-destructive font-black tabular-nums bg-destructive/5 px-1 rounded border border-destructive/10">
                                                    Due: {order.balance.toFixed(2)}
                                                </span>
                                            ) : (
                                                <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-tighter">Paid Full</span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-foreground">
                                            <span className="font-black text-base tabular-nums leading-none">
                                                {order.total_amount.toFixed(2)}
                                            </span>
                                            <span className="text-[10px] font-bold text-muted-foreground">KWD</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="hidden sm:block">
                                    {getStatusBadge(order.checkout_status)}
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                            </div>
                        </div>

                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
