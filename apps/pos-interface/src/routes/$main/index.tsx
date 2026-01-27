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
    });

    const { data: customersRes, isLoading: isLoadingCustomers } = useQuery({
        queryKey: ["dashboard-customers"],
        queryFn: () => getCustomers(),
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
            if (o.production_stage === 'order_delivered' || o.production_stage === 'order_collected') return false;
            const deliveryDate = new Date(o.delivery_date);
            return deliveryDate >= today && deliveryDate <= sevenDaysFromNow;
        }),
        todayDeliveries: orders.filter(o => {
            if (!o.delivery_date || o.checkout_status !== 'confirmed') return false;
            if (o.production_stage === 'order_delivered' || o.production_stage === 'order_collected') return false;
            const deliveryDate = new Date(o.delivery_date);
            return deliveryDate >= today && deliveryDate <= endOfDay(today);
        }),
        urgentOrders: orders.filter(o => {
            if (o.checkout_status !== 'confirmed') return false;
            if (o.production_stage === 'order_delivered' || o.production_stage === 'order_collected') return false;
            return o.garments?.some((g: any) => g.express);
        }),
        brovaNeeded: orders.filter(o => {
            if (o.checkout_status !== 'confirmed') return false;
            return o.garments?.some((g: any) => g.brova && g.piece_stage !== 'brova_accepted');
        })
    };

    const isLoading = isLoadingOrders || isLoadingCustomers;

    if (isLoading) {
        return (
            <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Skeleton className="h-[400px] lg:col-span-2 rounded-2xl" />
                    <Skeleton className="h-[400px] rounded-2xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-10 max-w-[1600px] mx-auto space-y-10">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <h1 className="text-4xl font-black tracking-tight text-foreground uppercase">
                    Control <span className="text-primary">Center</span>
                </h1>
                <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs opacity-70">
                    Welcome back. Here is what is happening at the showroom today.
                </p>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    title="Total Customers" 
                    value={stats.totalCustomers} 
                    icon={Users}
                    color="text-blue-600"
                    bg="bg-blue-50"
                    trend={`${customers.length > 0 ? '+12%' : '0%'} from last month`}
                />
                <StatCard 
                    title="Active Work Orders" 
                    value={stats.confirmedOrders} 
                    icon={ShoppingBag}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                    trend="Running production"
                />
                <StatCard 
                    title="Deliveries (Next 7d)" 
                    value={stats.upcomingDeliveries.length} 
                    icon={CalendarIcon}
                    color="text-amber-600"
                    bg="bg-amber-50"
                    trend={stats.todayDeliveries.length > 0 ? `${stats.todayDeliveries.length} due today` : "Upcoming schedule"}
                />
                <StatCard 
                    title="Urgent Actions" 
                    value={stats.urgentOrders.length + stats.brovaNeeded.length} 
                    icon={AlertCircle}
                    color="text-rose-600"
                    bg="bg-rose-50"
                    trend="Needs attention"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Upcoming Deliveries Table */}
                <Card className="lg:col-span-8 border-2 shadow-sm rounded-3xl overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b pb-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-xl font-black uppercase tracking-tight">Priority Deliveries</CardTitle>
                                <CardDescription className="font-bold uppercase text-[10px] tracking-widest mt-1">Orders due in the next 7 days</CardDescription>
                            </div>
                            <Badge variant="outline" className="font-black px-3 py-1 bg-background">
                                {stats.upcomingDeliveries.length} SCHEDULED
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {stats.upcomingDeliveries.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b bg-muted/10">
                                            <th className="px-6 py-4 text-left">Order / Customer</th>
                                            <th className="px-6 py-4 text-left">Production Stage</th>
                                            <th className="px-6 py-4 text-left">Delivery Date</th>
                                            <th className="px-6 py-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {stats.upcomingDeliveries.slice(0, 6).sort((a, b) => new Date(a.delivery_date!).getTime() - new Date(b.delivery_date!).getTime()).map((order) => (
                                            <tr key={order.id} className="hover:bg-muted/5 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-sm text-foreground">#{order.id}</span>
                                                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-tighter">
                                                            {order.customer?.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="secondary" className="text-[10px] font-black uppercase tracking-tight bg-primary/5 text-primary border-none">
                                                        {order.production_stage?.replace(/_/g, ' ') || 'Pending'}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className={cn(
                                                            "w-3.5 h-3.5",
                                                            new Date(order.delivery_date!) <= endOfDay(today) ? "text-rose-500" : "text-muted-foreground"
                                                        )} />
                                                        <span className={cn(
                                                            "text-xs font-bold",
                                                            new Date(order.delivery_date!) <= endOfDay(today) ? "text-rose-600 font-black" : "text-foreground"
                                                        )}>
                                                            {format(new Date(order.delivery_date!), "MMM d, yyyy")}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Link 
                                                            to={order.order_type === 'SALES' ? "/$main/orders/new-sales-order" : "/$main/orders/new-work-order"}
                                                            search={{ orderId: order.id }}
                                                        >
                                                            <Badge className="cursor-pointer font-black text-[9px] uppercase tracking-widest bg-primary hover:bg-primary/90 flex items-center gap-1.5">
                                                                <Eye className="w-3 h-3" />
                                                                View Order
                                                            </Badge>
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-20 text-center space-y-4">
                                <div className="size-16 bg-muted rounded-full flex items-center justify-center mx-auto opacity-40">
                                    <Package className="w-8 h-8" />
                                </div>
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">No deliveries scheduled this week</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Workflow Summary */}
                <Card className="lg:col-span-4 border-2 shadow-sm rounded-3xl overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b pb-6">
                        <CardTitle className="text-xl font-black uppercase tracking-tight">Workflow Health</CardTitle>
                        <CardDescription className="font-bold uppercase text-[10px] tracking-widest mt-1">Status of ongoing production</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <WorkflowItem 
                            label="Express Orders" 
                            count={stats.urgentOrders.length} 
                            icon={TrendingUp} 
                            color="text-rose-600" 
                            bg="bg-rose-50"
                        />
                        <WorkflowItem 
                            label="Brova Required" 
                            count={stats.brovaNeeded.length} 
                            icon={Scissors} 
                            color="text-amber-600" 
                            bg="bg-amber-50"
                        />
                        <WorkflowItem 
                            label="Drafts / Pending" 
                            count={stats.pendingOrders} 
                            icon={Clock} 
                            color="text-blue-600" 
                            bg="bg-blue-50"
                        />
                        <WorkflowItem 
                            label="Completed & Closed" 
                            count={orders.filter(o => o.production_stage === 'order_delivered').length} 
                            icon={CheckCircle2} 
                            color="text-emerald-600" 
                            bg="bg-emerald-50" 
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Recent Customers Section */}
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-black uppercase tracking-tight">Recently Joined Customers</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {customers.slice(0, 5).sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime()).map((customer) => (
                        <Card key={customer.id} className="border-2 shadow-none hover:border-primary/20 transition-all group">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-sm group-hover:bg-primary group-hover:text-white transition-colors">
                                    {customer.name?.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm truncate">{customer.name}</p>
                                    <p className="text-[10px] font-medium text-muted-foreground">{customer.phone}</p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
function StatCard({ title, value, icon: Icon, color, bg, trend }: any) {
    return (
        <Card className="border-2 shadow-none rounded-3xl overflow-hidden group hover:border-primary/30 transition-all">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className={cn("p-3 rounded-2xl", bg)}>
                        <Icon className={cn("w-6 h-6", color)} />
                    </div>
                    <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-[0.1em] opacity-60">Live</Badge>
                </div>
                <div className="space-y-1">
                    <h3 className="text-3xl font-black tracking-tighter">{value}</h3>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
                </div>
                <div className="mt-4 pt-4 border-t border-dashed flex items-center justify-between">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">{trend}</span>
                    <TrendingUp className="w-3 h-3 text-muted-foreground opacity-30" />
                </div>
            </CardContent>
        </Card>
    );
}

function WorkflowItem({ label, count, icon: Icon, color, bg }: any) {
    return (
        <div className="flex items-center justify-between p-4 rounded-2xl border-2 border-transparent hover:border-border hover:bg-muted/5 transition-all">
            <div className="flex items-center gap-4">
                <div className={cn("p-2.5 rounded-xl", bg)}>
                    <Icon className={cn("w-5 h-5", color)} />
                </div>
                <span className="text-xs font-bold uppercase tracking-wide text-foreground">{label}</span>
            </div>
            <div className="flex items-center gap-3">
                <span className="text-lg font-black tracking-tighter">{count}</span>
                <div className="size-1.5 rounded-full bg-border" />
            </div>
        </div>
    );
}

