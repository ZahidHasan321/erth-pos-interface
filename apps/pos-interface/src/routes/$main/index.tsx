import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, 
  ShoppingBag, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Calendar as CalendarIcon,
  TrendingUp,
  Package,
  Scissors,
  Eye
} from "lucide-react";
import { format, addDays, startOfDay, endOfDay } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
        meta: [{
            title: "Staff Dashboard",
        }]
    }),
})

function DashboardPage() {
    const { data: ordersRes, isLoading: isLoadingOrders } = useQuery({
        queryKey: ["dashboard-orders"],
        queryFn: () => getOrdersList({}),
        staleTime: Infinity,
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
    });

    const { data: customersRes, isLoading: isLoadingCustomers } = useQuery({
        queryKey: ["dashboard-customers"],
        queryFn: () => getCustomers(),
        staleTime: Infinity,
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
    });

    const orders = ordersRes?.data || [];
    const customers = customersRes?.data || [];

    // --- Statistics Calculations ---
    const today = startOfDay(new Date());
    const sevenDaysFromNow = endOfDay(addDays(new Date(), 7));

    const stats = {
        totalOrders: orders.length,
        totalCustomers: customers.length,
        confirmedOrders: orders.filter(o => o.checkout_status === 'confirmed').length,
        pendingOrders: orders.filter(o => o.checkout_status === 'draft').length,
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
        })
    };

    const isLoading = isLoadingOrders || isLoadingCustomers;

    if (isLoading) {
        return (
            <div className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <Skeleton className="h-[400px] lg:col-span-2 rounded-2xl" />
                    <Skeleton className="h-[400px] rounded-2xl" />
                </div>
            </div>
        );
    }

    return (
        <div className={cn("p-4 md:p-5 max-w-[1600px] mx-auto space-y-4", ANIMATION_CLASSES.fadeInUp)}>
            {/* Header */}
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-black tracking-tight text-foreground uppercase">
                    Control <span className="text-primary">Center</span>
                </h1>
                <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs opacity-70">
                    Welcome back. Here is what is happening at the showroom today.
                </p>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard 
                    title="Total Customers" 
                    value={stats.totalCustomers} 
                    icon={Users}
                    color="text-blue-600"
                    bg="bg-blue-50"
                    trend={`${customers.length > 0 ? '+12%' : '0%'} from last month`}
                    index={0}
                    to="/$main/customers"
                />
                <StatCard 
                    title="Active Work Orders" 
                    value={stats.confirmedOrders} 
                    icon={ShoppingBag}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                    trend="Running production"
                    index={1}
                    to="/$main/orders/order-history"
                    search={{ statusFilter: "confirmed", phaseFilter: "in_progress" }}
                />
                <StatCard 
                    title="Deliveries (Next 7d)" 
                    value={stats.upcomingDeliveries.length} 
                    icon={CalendarIcon}
                    color="text-amber-600"
                    bg="bg-amber-50"
                    trend={stats.todayDeliveries.length > 0 ? `${stats.todayDeliveries.length} due today` : "Upcoming schedule"}
                    index={2}
                    to="/$main/orders/order-history"
                    search={{ statusFilter: "confirmed" }}
                />
                <StatCard 
                    title="Ready for Pickup" 
                    value={stats.readyForPickup.length} 
                    icon={Package}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                    trend="Awaiting customer"
                    index={3}
                    to="/$main/orders/orders-at-showroom"
                    search={{ stage: "ready_for_pickup" }}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Upcoming Deliveries */}
                <Card className={cn("md:col-span-8 border-2 shadow-sm rounded-xl overflow-hidden", ANIMATION_CLASSES.fadeInUp)} style={ANIMATION_CLASSES.staggerDelay(4)}>
                    <CardHeader className="bg-muted/30 border-b py-2.5 px-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-black uppercase tracking-tight">Priority Deliveries</CardTitle>
                                <CardDescription className="font-bold uppercase text-[10px] tracking-widest mt-0.5">Next 7 days</CardDescription>
                            </div>
                            <Badge variant="outline" className="font-black px-2 py-0.5 text-xs bg-background">
                                {stats.upcomingDeliveries.length}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {stats.upcomingDeliveries.length > 0 ? (
                            <div className="divide-y">
                                {stats.upcomingDeliveries.slice(0, 6).sort((a, b) => new Date(a.delivery_date!).getTime() - new Date(b.delivery_date!).getTime()).map((order) => (
                                    <Link
                                        key={order.id}
                                        to={order.order_type === 'SALES' ? "/$main/orders/new-sales-order" : "/$main/orders/new-work-order"}
                                        search={{ orderId: order.id }}
                                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/5 transition-colors group"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-sm">#{order.id}</span>
                                                <span className="text-xs font-bold text-muted-foreground truncate">{order.customer?.name}</span>
                                            </div>
                                        </div>
                                        {order.order_phase && (
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "text-[10px] font-black uppercase tracking-tight border-none shrink-0 h-5 px-1.5",
                                                    ORDER_PHASE_COLORS[order.order_phase as keyof typeof ORDER_PHASE_COLORS] === "gray" && "bg-gray-500/15 text-gray-600",
                                                    ORDER_PHASE_COLORS[order.order_phase as keyof typeof ORDER_PHASE_COLORS] === "amber" && "bg-amber-500/15 text-amber-600",
                                                    ORDER_PHASE_COLORS[order.order_phase as keyof typeof ORDER_PHASE_COLORS] === "emerald" && "bg-emerald-500/15 text-emerald-600"
                                                )}
                                            >
                                                {ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS]}
                                            </Badge>
                                        )}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Clock className={cn(
                                                "w-3 h-3",
                                                new Date(order.delivery_date!) <= endOfDay(today) ? "text-rose-500" : "text-muted-foreground"
                                            )} />
                                            <span className={cn(
                                                "text-xs font-bold tabular-nums",
                                                new Date(order.delivery_date!) <= endOfDay(today) ? "text-rose-600 font-black" : "text-foreground"
                                            )}>
                                                {format(new Date(order.delivery_date!), "d MMM")}
                                            </span>
                                        </div>
                                        <Eye className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 text-center">
                                <Package className="w-6 h-6 mx-auto text-muted-foreground/30 mb-2" />
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">No deliveries this week</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Workflow Summary */}
                <Card className={cn("md:col-span-4 border-2 shadow-sm rounded-xl overflow-hidden", ANIMATION_CLASSES.fadeInUp)} style={ANIMATION_CLASSES.staggerDelay(5)}>
                    <CardHeader className="bg-muted/30 border-b py-2.5 px-4">
                        <CardTitle className="text-base font-black uppercase tracking-tight">Workflow Health</CardTitle>
                        <CardDescription className="font-bold uppercase text-[10px] tracking-widest mt-0.5">Ongoing production</CardDescription>
                    </CardHeader>
                    <CardContent className="p-2.5 space-y-2">
                        <WorkflowItem
                            label="Ready for Pickup"
                            count={stats.readyForPickup.length}
                            icon={Package}
                            color="text-emerald-600"
                            bg="bg-emerald-50"
                            to="/$main/orders/orders-at-showroom"
                            search={{ stage: "ready_for_pickup" }}
                        />
                        <WorkflowItem
                            label="Brova Trials"
                            count={stats.brovaTrials.length}
                            icon={Scissors}
                            color="text-amber-600"
                            bg="bg-amber-50"
                            to="/$main/orders/orders-at-showroom"
                            search={{ stage: "brova_trial" }}
                        />
                        <WorkflowItem
                            label="Needs Action"
                            count={stats.needsAction.length}
                            icon={AlertCircle}
                            color="text-rose-600"
                            bg="bg-rose-50"
                            to="/$main/orders/orders-at-showroom"
                            search={{ stage: "needs_action" }}
                        />
                        <WorkflowItem
                            label="Completed"
                            count={orders.filter(o => o.order_phase === 'completed').length}
                            icon={CheckCircle2}
                            color="text-emerald-600"
                            bg="bg-emerald-50"
                            to="/$main/orders/order-history"
                            search={{ phaseFilter: "completed" }}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Recent Customers Section */}
            <div className={cn("space-y-3", ANIMATION_CLASSES.fadeInUp)} style={ANIMATION_CLASSES.staggerDelay(6)}>
                <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-black uppercase tracking-tight">Recently Joined Customers</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {customers.slice(0, 5).sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime()).map((customer, i) => (
                        <Card key={customer.id} className={cn("border-2 shadow-none hover:border-primary/20 transition-all group", ANIMATION_CLASSES.zoomIn)} style={ANIMATION_CLASSES.staggerDelay(7 + i)}>
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-sm group-hover:bg-primary group-hover:text-white transition-colors">
                                    {customer.name?.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm truncate">{customer.name}</p>
                                    <p className="text-xs font-medium text-muted-foreground">{customer.phone}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
function StatCard({ title, value, icon: Icon, color, bg, trend, index, to, search }: any) {
    const content = (
        <CardContent className="p-3">
            <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2 rounded-2xl", bg)}>
                    <Icon className={cn("w-6 h-6", color)} />
                </div>
                <Badge variant="secondary" className="text-xs font-black uppercase tracking-[0.1em] opacity-60">Live</Badge>
            </div>
            <div className="space-y-1">
                <h3 className="text-xl font-black tracking-tighter">{value}</h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
            </div>
            <div className="mt-2 pt-2 border-t border-dashed flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-tight">{trend}</span>
                <TrendingUp className="w-3 h-3 text-muted-foreground opacity-30" />
            </div>
        </CardContent>
    );

    return (
        <Card className={cn("border-2 shadow-none rounded-xl overflow-hidden group hover:border-primary/30 transition-all", ANIMATION_CLASSES.fadeInUp)} style={ANIMATION_CLASSES.staggerDelay(index)}>
            {to ? (
                <Link to={to} search={search}>
                    {content}
                </Link>
            ) : content}
        </Card>
    );
}

function WorkflowItem({ label, count, icon: Icon, color, bg, to, search }: any) {
    const content = (
        <div className="flex items-center justify-between p-2.5 rounded-xl border-2 border-transparent hover:border-border hover:bg-muted/5 transition-all">
            <div className="flex items-center gap-2.5">
                <div className={cn("p-1.5 rounded-lg", bg)}>
                    <Icon className={cn("w-4 h-4", color)} />
                </div>
                <span className="text-xs font-bold uppercase tracking-wide text-foreground">{label}</span>
            </div>
            <span className="text-base font-black tracking-tighter tabular-nums">{count}</span>
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

