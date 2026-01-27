"use client";

import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { 
  ShoppingBag, 
  Package, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Search, 
  ChevronRight, 
  User, 
  Wallet,
  Calendar,
  Filter,
  History
} from "lucide-react";
import { useOrderHistory, type OrderHistoryItem } from "@/hooks/useOrderHistory";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export const Route = createFileRoute("/$main/orders/order-history")({
  component: OrderHistoryPage,
  head: () => ({
    meta: [{ title: "Order History" }],
  }),
});

function OrderHistoryPage() {
  const { data: orders = [], isLoading, isError } = useOrderHistory();
  
  // Filter states
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");

  const filteredOrders = React.useMemo(() => {
    return orders.filter((order) => {
      const customerName = order.customer_name || "";
      const customerPhone = order.customer_phone || "";
      const orderId = order.id?.toString() || "";
      const invoiceNumber = order.invoice_number?.toString() || "";

      const matchesSearch = 
        customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        orderId.includes(searchTerm) ||
        invoiceNumber.includes(searchTerm) ||
        customerPhone.includes(searchTerm);
      
      const matchesStatus = statusFilter === "all" || order.checkout_status === statusFilter;
      const matchesType = typeFilter === "all" || order.order_type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [orders, searchTerm, statusFilter, typeFilter]);

  return (
    <div className="container mx-auto py-8 px-4 lg:px-8 space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="w-8 h-8 text-primary" />
            Order History
          </h1>
          <p className="text-muted-foreground">
            Track and manage all previous work and sales orders
          </p>
        </div>
        <div className="flex items-center gap-2 bg-primary/5 px-4 py-2 rounded-lg border border-primary/10 text-primary font-medium">
          <Package className="w-4 h-4" />
          <span>{filteredOrders.length} {filteredOrders.length === 1 ? 'Order' : 'Orders'} Total</span>
        </div>
      </div>

      {/* Filters Section */}
      <Card className="border-none shadow-md bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Search */}
            <div className="md:col-span-6 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by customer, phone, or order ID..."
                className="pl-10 h-11 bg-background"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Status Filter */}
            <div className="md:col-span-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11 bg-background">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="All Statuses" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="confirmed">Confirmed Only</SelectItem>
                  <SelectItem value="draft">Drafts Only</SelectItem>
                  <SelectItem value="cancelled">Cancelled Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Type Filter */}
            <div className="md:col-span-3">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-11 bg-background">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="All Types" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="WORK">Work Orders</SelectItem>
                  <SelectItem value="SALES">Sales Orders</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List Section */}
      <div className="grid gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border-none shadow-sm animate-pulse">
              <CardContent className="p-6 h-32 bg-muted/20" />
            </Card>
          ))
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <XCircle className="w-12 h-12 text-destructive opacity-50" />
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Failed to load orders</h3>
              <p className="text-muted-foreground text-sm">There was an error connecting to the server. Please try again.</p>
            </div>
            <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 border-2 border-dashed border-muted rounded-2xl bg-muted/5">
            <ShoppingBag className="w-12 h-12 text-muted-foreground opacity-20" />
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">No orders found</h3>
              <p className="text-muted-foreground text-sm">Try adjusting your filters or search term to find what you're looking for.</p>
            </div>
            <Button variant="outline" onClick={() => { setSearchTerm(""); setStatusFilter("all"); setTypeFilter("all"); }}>
              Clear all filters
            </Button>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))
        )}
      </div>
    </div>
  );
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "confirmed":
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 hover:bg-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Confirmed</Badge>;
    case "cancelled":
      return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20"><XCircle className="w-3 h-3 mr-1" /> Cancelled</Badge>;
    case "draft":
    default:
      return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-200 hover:bg-amber-500/20"><Clock className="w-3 h-3 mr-1" /> Draft</Badge>;
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
      <Card className="overflow-hidden border border-border/50 group-hover:border-primary/30 group-hover:shadow-md transition-all bg-card/50 backdrop-blur-sm relative">
        <div className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          isWorkOrder ? "bg-primary" : "bg-amber-500"
        )} />
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3 sm:gap-4">
            
            {/* Top Row: ID, Status, Type & Date */}
            <div className="flex flex-col gap-1.5 md:w-44 md:shrink-0">
              <div className="flex items-center justify-between md:justify-start gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    #{order.id}
                  </span>
                  {order.order_type === "SALES" ? (
                    <span className="bg-amber-100 text-amber-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">SALES</span>
                  ) : (
                    <span className="bg-primary/10 text-primary text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">WORK</span>
                  )}
                </div>
                <div className="md:hidden transform scale-90 origin-right">
                  {getStatusBadge(order.checkout_status)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {order.order_date ? format(new Date(order.order_date), "MMM d, yy") : "N/A"}
                </div>
                {order.invoice_number && (
                  <div className="font-bold text-primary">
                    Inv: {order.invoice_number}
                  </div>
                )}
              </div>
            </div>

            {/* Middle Section: Customer & Content */}
            <div className="flex flex-1 items-center justify-between gap-4 min-w-0 border-y md:border-0 border-border/30 py-2 md:py-0">
              <div className="min-w-0 space-y-0.5">
                <h3 className="font-bold text-sm sm:text-base leading-tight group-hover:text-primary transition-colors truncate">
                  {order.customer_name}
                </h3>
                <p className="text-[12px] text-muted-foreground font-mono">
                  {order.customer_phone}
                </p>
              </div>

              <div className="bg-muted/40 px-2.5 py-1.5 rounded-lg flex items-center gap-2 shrink-0 border border-border/20">
                {isWorkOrder ? (
                  <Package className="w-3.5 h-3.5 text-primary/70" />
                ) : (
                  <ShoppingBag className="w-3.5 h-3.5 text-amber-500/70" />
                )}
                <span className="text-sm font-black tabular-nums">
                  {isWorkOrder ? order.fabric_count : order.shelf_item_count}
                </span>
              </div>
            </div>

            {/* Right Section: Financials & Status */}
            <div className="flex items-center justify-between md:justify-end gap-4 md:min-w-[240px]">
              
              <div className="flex flex-col items-start md:items-end">
                <div className="flex items-center gap-1.5 text-foreground">
                  <span className="font-black text-sm sm:text-base tabular-nums">
                    {order.total_amount.toFixed(2)}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground">KWD</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground/80">Paid: {order.paid_amount.toFixed(2)}</span>
                  {order.balance > 0 && (
                    <span className="text-destructive font-bold">
                      Bal: {order.balance.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden md:block transform scale-90 origin-right">
                  {getStatusBadge(order.checkout_status)}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>

          </div>
        </CardContent>
      </Card>
    </Link>
  );
}