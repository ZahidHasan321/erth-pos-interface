import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  ShoppingBag,
  ShoppingCart,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar as CalendarIcon,
  Package,
  Scissors,
  Store,
  Eye,
  ArrowRight,
} from "lucide-react";
import { format, addDays, startOfDay, endOfDay, isToday, isTomorrow } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrdersList } from "@/api/orders";
import { getCustomers } from "@/api/customers";
import { cn } from "@/lib/utils";
import { ORDER_PHASE_LABELS, ORDER_PHASE_COLORS } from "@/lib/constants";
import { ANIMATION_CLASSES } from "@/lib/constants/animations";
import { getShowroomStatus } from "@repo/database";

export const Route = createFileRoute('/$main/')({
  component: DashboardPage,
  head: () => ({
    meta: [{ title: "Dashboard" }]
  }),
})

function DashboardPage() {
  const { main } = Route.useParams();

  const { data: ordersRes, isLoading: isLoadingOrders } = useQuery({
    queryKey: ["dashboard-orders"],
    queryFn: () => getOrdersList({}),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
  });

  const { data: customersRes, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["dashboard-customers"],
    queryFn: () => getCustomers(),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24,
  });

  const orders = ordersRes?.data || [];
  const customers = customersRes?.data || [];

  const today = startOfDay(new Date());
  const sevenDaysFromNow = endOfDay(addDays(new Date(), 7));

  const stats = {
    totalCustomers: customers.length,
    confirmedOrders: orders.filter(o => o.checkout_status === 'confirmed').length,
    activeOrders: orders.filter(o => o.checkout_status === 'confirmed' && o.order_phase === 'in_progress').length,
    completedOrders: orders.filter(o => o.order_phase === 'completed').length,
    upcomingDeliveries: orders.filter(o => {
      if (!o.delivery_date || o.checkout_status !== 'confirmed') return false;
      if (o.order_phase === 'completed') return false;
      const deliveryDate = new Date(o.delivery_date);
      return deliveryDate >= today && deliveryDate <= sevenDaysFromNow;
    }),
    todayDeliveries: orders.filter(o => {
      if (!o.delivery_date || o.checkout_status !== 'confirmed') return false;
      if (o.order_phase === 'completed') return false;
      const deliveryDate = new Date(o.delivery_date);
      return deliveryDate >= today && deliveryDate <= endOfDay(today);
    }),
    readyForPickup: orders.filter(o => {
      if (o.checkout_status !== 'confirmed') return false;
      return getShowroomStatus(o.garments || []).label === "ready_for_pickup";
    }),
    brovaTrials: orders.filter(o => {
      if (o.checkout_status !== 'confirmed') return false;
      return getShowroomStatus(o.garments || []).label === "brova_trial";
    }),
    needsAction: orders.filter(o => {
      if (o.checkout_status !== 'confirmed') return false;
      return o.garments?.some((g: any) => (g.feedback_status === 'needs_repair' || g.feedback_status === 'needs_redo') && g.location === 'shop');
    }),
  };

  const isLoading = isLoadingOrders || isLoadingCustomers;

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-5">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-[360px] lg:col-span-2 rounded-xl" />
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      </div>
    );
  }

  function formatDeliveryDate(dateStr: string | Date) {
    const date = new Date(dateStr);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "d MMM");
  }

  return (
    <div className={cn("p-4 md:p-5 max-w-[1600px] mx-auto space-y-5", ANIMATION_CLASSES.fadeInUp)}>
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, d MMMM yyyy")}
          </p>
        </div>
        {stats.todayDeliveries.length > 0 && (
          <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 font-bold text-xs px-2.5 py-1">
            {stats.todayDeliveries.length} due today
          </Badge>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Customers"
          value={stats.totalCustomers}
          icon={Users}
          color="text-primary"
          bg="bg-primary/10"
          index={0}
          to="/$main/customers"
        />
        <StatCard
          title="Active Orders"
          value={stats.activeOrders}
          icon={ShoppingBag}
          color="text-secondary"
          bg="bg-secondary/10"
          index={1}
          to="/$main/orders/order-history"
          search={{ statusFilter: "confirmed", phaseFilter: "in_progress" }}
        />
        <StatCard
          title="Deliveries (7d)"
          value={stats.upcomingDeliveries.length}
          icon={CalendarIcon}
          color="text-amber-600"
          bg="bg-amber-500/10"
          index={2}
          to="/$main/orders/order-history"
          search={{ statusFilter: "confirmed" }}
        />
        <StatCard
          title="Ready for Pickup"
          value={stats.readyForPickup.length}
          icon={Package}
          color="text-primary"
          bg="bg-primary/10"
          index={3}
          to="/$main/orders/orders-at-showroom"
          search={{ stage: "ready_for_pickup" }}
        />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Priority Deliveries */}
        <Card className={cn("lg:col-span-2 border shadow-none rounded-xl overflow-hidden", ANIMATION_CLASSES.fadeInUp)} style={ANIMATION_CLASSES.staggerDelay(4)}>
          <CardHeader className="border-b py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold uppercase tracking-wide">Priority Deliveries</CardTitle>
              <Link
                to="/$main/orders/order-history"
                search={{ statusFilter: "confirmed" }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {stats.upcomingDeliveries.length > 0 ? (
              <div className="divide-y divide-border/50">
                {stats.upcomingDeliveries
                  .slice(0, 7)
                  .sort((a, b) => new Date(a.delivery_date!).getTime() - new Date(b.delivery_date!).getTime())
                  .map((order) => {
                    const isDueToday = new Date(order.delivery_date!) <= endOfDay(today);
                    return (
                      <Link
                        key={order.id}
                        to={order.order_type === 'SALES' ? "/$main/orders/new-sales-order" : "/$main/orders/new-work-order"}
                        search={{ orderId: order.id }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group"
                      >
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          isDueToday ? "bg-rose-500" : "bg-muted-foreground/30"
                        )} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm tabular-nums">#{order.id}</span>
                            <span className="text-sm text-muted-foreground truncate">{order.customer?.name}</span>
                          </div>
                        </div>
                        {order.order_phase && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-bold uppercase tracking-tight border-none shrink-0 h-5 px-1.5",
                              ORDER_PHASE_COLORS[order.order_phase as keyof typeof ORDER_PHASE_COLORS] === "gray" && "bg-gray-500/10 text-gray-500",
                              ORDER_PHASE_COLORS[order.order_phase as keyof typeof ORDER_PHASE_COLORS] === "amber" && "bg-amber-500/10 text-amber-600",
                              ORDER_PHASE_COLORS[order.order_phase as keyof typeof ORDER_PHASE_COLORS] === "emerald" && "bg-primary/10 text-primary"
                            )}
                          >
                            {ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS]}
                          </Badge>
                        )}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Clock className={cn(
                            "w-3 h-3",
                            isDueToday ? "text-rose-500" : "text-muted-foreground/50"
                          )} />
                          <span className={cn(
                            "text-xs font-semibold tabular-nums",
                            isDueToday ? "text-rose-600 font-bold" : "text-muted-foreground"
                          )}>
                            {formatDeliveryDate(order.delivery_date!)}
                          </span>
                        </div>
                        <Eye className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
                      </Link>
                    );
                  })}
              </div>
            ) : (
              <div className="py-12 text-center">
                <Package className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No upcoming deliveries</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Workflow Health */}
        <Card className={cn("border shadow-none rounded-xl overflow-hidden", ANIMATION_CLASSES.fadeInUp)} style={ANIMATION_CLASSES.staggerDelay(5)}>
          <CardHeader className="border-b py-3 px-4">
            <CardTitle className="text-sm font-bold uppercase tracking-wide">Showroom Status</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-1.5">
            <WorkflowItem
              label="Ready for Pickup"
              count={stats.readyForPickup.length}
              icon={Package}
              color="text-primary"
              bg="bg-primary/10"
              to="/$main/orders/orders-at-showroom"
              search={{ stage: "ready_for_pickup" }}
            />
            <WorkflowItem
              label="Brova Trials"
              count={stats.brovaTrials.length}
              icon={Scissors}
              color="text-amber-600"
              bg="bg-amber-500/10"
              to="/$main/orders/orders-at-showroom"
              search={{ stage: "brova_trial" }}
            />
            <WorkflowItem
              label="Needs Action"
              count={stats.needsAction.length}
              icon={AlertCircle}
              color="text-rose-600"
              bg="bg-rose-500/10"
              to="/$main/orders/orders-at-showroom"
              search={{ stage: "needs_action" }}
              urgent={stats.needsAction.length > 0}
            />
            <WorkflowItem
              label="Completed"
              count={stats.completedOrders}
              icon={CheckCircle2}
              color="text-primary"
              bg="bg-primary/10"
              to="/$main/orders/order-history"
              search={{ phaseFilter: "completed" }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className={cn(ANIMATION_CLASSES.fadeInUp)} style={ANIMATION_CLASSES.staggerDelay(6)}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction
            label="New Work Order"
            icon={ShoppingBag}
            to={`/${main}/orders/new-work-order`}
          />
          <QuickAction
            label="New Sales Order"
            icon={ShoppingCart}
            to={`/${main}/orders/new-sales-order`}
          />
          <QuickAction
            label="Orders at Showroom"
            icon={Store}
            to={`/${main}/orders/orders-at-showroom`}
          />
          <QuickAction
            label="Customers"
            icon={Users}
            to={`/${main}/customers`}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg, index, to, search }: any) {
  const content = (
    <CardContent className="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("p-2 rounded-lg", bg)}>
          <Icon className={cn("w-5 h-5", color)} />
        </div>
      </div>
      <h3 className="text-2xl font-black tracking-tight tabular-nums">{value}</h3>
      <p className="text-xs font-medium text-muted-foreground mt-0.5">{title}</p>
    </CardContent>
  );

  return (
    <Card className={cn("border shadow-none rounded-xl overflow-hidden group hover:border-primary/20 transition-colors", ANIMATION_CLASSES.fadeInUp)} style={ANIMATION_CLASSES.staggerDelay(index)}>
      {to ? (
        <Link to={to} search={search}>
          {content}
        </Link>
      ) : content}
    </Card>
  );
}

function WorkflowItem({ label, count, icon: Icon, color, bg, to, search, urgent }: any) {
  const content = (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-muted/30",
      urgent && "bg-rose-500/5"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn("p-1.5 rounded-lg", bg)}>
          <Icon className={cn("w-4 h-4", color)} />
        </div>
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <span className={cn(
        "text-lg font-black tracking-tight tabular-nums",
        urgent && count > 0 && "text-rose-600"
      )}>
        {count}
      </span>
    </div>
  );

  if (to) {
    return (
      <Link to={to} search={search} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

function QuickAction({ label, icon: Icon, to }: { label: string; icon: any; to: string }) {
  return (
    <Link to={to} target="_blank" rel="noopener noreferrer">
      <Card className="border shadow-none rounded-xl hover:border-primary/20 hover:bg-muted/20 transition-all group cursor-pointer">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/5 group-hover:bg-primary/10 transition-colors">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-medium">{label}</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors ml-auto" />
        </CardContent>
      </Card>
    </Link>
  );
}
