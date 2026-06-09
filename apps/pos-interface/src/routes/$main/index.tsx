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
  type LucideIcon,
} from "lucide-react";
import { addDays } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell as RechartsCell,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { Skeleton } from "@repo/ui/skeleton";
import { getDashboardOrders } from "@/api/orders";
import { getCustomerCount } from "@/api/customers";
import { cn, parseUtcTimestamp, getKuwaitMidnight, getKuwaitEndOfDay, getLocalDateStr, toLocalDateStr, TIMEZONE } from "@/lib/utils";
import { ORDER_PHASE_LABELS, ORDER_PHASE_COLORS } from "@/lib/constants";
import { ANIMATION_CLASSES } from "@/lib/constants/animations";
import { getShowroomStatus } from "@repo/database";

// Chart palette — matches eod-charts.tsx so charts read consistently
// across the app regardless of brand. Per §5, brand classes recolor only
// chrome (primary/ring/sidebar), not data-vis ink.
const CHART_PRIMARY = "#1f2937";     // slate-800
const CHART_DESTRUCTIVE = "#b91c1c"; // red-700
const CHART_GRID = "#eef0f2";
const CHART_AXIS = "#94a3b8";

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

export const Route = createFileRoute('/$main/')({
  component: DashboardPage,
  head: () => ({
    meta: [{ title: "Dashboard" }]
  }),
})

function DashboardPage() {
  const { main } = Route.useParams();
  if (main === 'erth') return <ErthDashboard />;
  return <DefaultDashboard />;
}

// ────────────────────────────────────────────────────────────────────────────
// ERTH dashboard — panel/cell language matching EOD report & sales summary:
// typography-driven, no icon decoration, primary/destructive as the only color
// signals, multiple metrics share one Card divided by border separators.
// ────────────────────────────────────────────────────────────────────────────

function ErthDashboard() {
  const { main } = Route.useParams();

  const { data: ordersRes, isLoading: isLoadingOrders } = useQuery({
    queryKey: ["dashboard-orders", main],
    queryFn: () => getDashboardOrders(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });

  const { data: customerCount, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["dashboard-customers"],
    queryFn: () => getCustomerCount(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });

  const orders = ordersRes?.data || [];
  const today = getKuwaitMidnight();
  const endOfToday = getKuwaitEndOfDay();
  const sevenDaysFromNow = getKuwaitEndOfDay(addDays(new Date(), 7));
  const sevenDaysAgo = getKuwaitMidnight(addDays(new Date(), -7));
  const todayStr = getLocalDateStr();

  // Order intake KPIs
  const todayOrdersCount = orders.filter(o => toLocalDateStr(o.order_date) === todayStr).length;
  const weekOrdersCount = orders.filter(o => {
    if (!o.order_date) return false;
    return parseUtcTimestamp(o.order_date) >= sevenDaysAgo;
  }).length;
  const activeOrdersCount = orders.filter(o => o.order_phase === 'in_progress').length;

  // Daily orders trend — last 14 days, grouped by Kuwait-local order_date
  const ordersTrendData = (() => {
    const buckets = new Map<string, { work: number; sales: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      buckets.set(getLocalDateStr(d), { work: 0, sales: 0 });
    }
    for (const o of orders) {
      const day = toLocalDateStr(o.order_date);
      if (!day) continue;
      const bucket = buckets.get(day);
      if (!bucket) continue;
      if (o.order_type === 'SALES') bucket.sales++;
      else bucket.work++;
    }
    return [...buckets.entries()].map(([day, v]) => ({
      day: shortDate.format(new Date(day + "T00:00:00")),
      work: v.work,
      sales: v.sales,
      total: v.work + v.sales,
    }));
  })();

  // Deliveries
  const upcomingDeliveries = orders.filter(o => {
    if (!o.delivery_date || o.order_phase === 'completed') return false;
    const d = parseUtcTimestamp(o.delivery_date);
    return d >= today && d <= sevenDaysFromNow;
  });
  const overdueDeliveries = orders.filter(o => {
    if (!o.delivery_date || o.order_phase === 'completed') return false;
    return parseUtcTimestamp(o.delivery_date) < today;
  });
  const todayDeliveriesCount = upcomingDeliveries.filter(o =>
    parseUtcTimestamp(o.delivery_date!) <= endOfToday,
  ).length;

  // Deliveries by day — next 7 days bar chart
  const deliveriesByDayData = (() => {
    const buckets = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      buckets.set(getLocalDateStr(addDays(new Date(), i)), 0);
    }
    for (const o of upcomingDeliveries) {
      const day = toLocalDateStr(o.delivery_date);
      if (!day) continue;
      const cur = buckets.get(day);
      if (cur === undefined) continue;
      buckets.set(day, cur + 1);
    }
    return [...buckets.entries()].map(([day, count], i) => ({
      day: i === 0 ? "Today" : i === 1 ? "Tomorrow" : shortDate.format(new Date(day + "T00:00:00")),
      count,
      isToday: i === 0,
    }));
  })();

  // Showroom buckets (priority order from §2.8)
  const alterationInCount = orders.filter(o => getShowroomStatus(o.garments || []).label === 'alteration_in').length;
  const brovaTrialsCount = orders.filter(o => getShowroomStatus(o.garments || []).label === 'brova_trial').length;
  const needsActionCount = orders.filter(o => getShowroomStatus(o.garments || []).label === 'needs_action').length;
  const readyForPickupCount = orders.filter(o => getShowroomStatus(o.garments || []).label === 'ready_for_pickup').length;

  // Order mix — totals for the orders shown in the trend window (last 14 days)
  const totalWork = ordersTrendData.reduce((s, d) => s + d.work, 0);
  const totalSales = ordersTrendData.reduce((s, d) => s + d.sales, 0);
  const totalMix = totalWork + totalSales;

  const isLoading = isLoadingOrders || isLoadingCustomers;
  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className={cn("p-4 sm:p-6 max-w-[1400px] mx-auto pb-10 space-y-6", ANIMATION_CLASSES.fadeInUp)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-GB", {
              timeZone: TIMEZONE,
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {overdueDeliveries.length > 0 && (
              <span className="ml-2 text-destructive">
                · {overdueDeliveries.length} overdue
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Activity panel — single card with cells (EOD sales-summary pattern) */}
      <Card className="p-5 shadow-none">
        <div className="mb-4 pb-3 border-b border-border">
          <h2 className="text-base font-semibold">Activity</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Confirmed orders in this brand</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <Cell label="New today" value={`${todayOrdersCount}`} emphasize />
          <Cell label="This week" value={`${weekOrdersCount}`} sub="Last 7 days" />
          <Cell label="Active orders" value={`${activeOrdersCount}`} sub="In production" />
          <Cell label="Customers" value={`${customerCount || 0}`} sub="Total profiles" />
        </div>
      </Card>

      {/* Charts row: orders trend (wide) + order mix (narrow) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 shadow-none">
          <h3 className="text-base font-semibold">Orders trend</h3>
          <p className="text-xs text-muted-foreground mb-4">New orders per day · last 14 days</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={ordersTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: CHART_AXIS }}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_AXIS }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip content={<ChartTooltipBox />} />
              <Area
                type="monotone"
                dataKey="total"
                name="Orders"
                stroke={CHART_PRIMARY}
                strokeWidth={2}
                fill="url(#ordersFill)"
                dot={{ r: 2.5, fill: CHART_PRIMARY, strokeWidth: 0 }}
                activeDot={{ r: 4, fill: CHART_PRIMARY, stroke: "#fff", strokeWidth: 2 }}
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5 shadow-none">
          <h3 className="text-base font-semibold">Order mix</h3>
          <p className="text-xs text-muted-foreground mb-4">Work vs sales · last 14 days</p>
          {totalMix === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No orders in this period</p>
          ) : (
            <div className="space-y-4">
              <MixBar label="Work orders" count={totalWork} total={totalMix} tone="primary" />
              <MixBar label="Sales orders" count={totalSales} total={totalMix} tone="muted" />
            </div>
          )}
        </Card>
      </div>

      {/* Deliveries row: chart + list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 shadow-none">
          <h3 className="text-base font-semibold">Deliveries by day</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Scheduled · next 7 days
            {todayDeliveriesCount > 0 && (
              <> · <span className="text-destructive">{todayDeliveriesCount} today</span></>
            )}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deliveriesByDayData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: CHART_AXIS }}
                tickLine={false}
                axisLine={{ stroke: CHART_GRID }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_AXIS }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip content={<ChartTooltipBox />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
              <Bar dataKey="count" name="Deliveries" radius={[3, 3, 0, 0]} animationDuration={500}>
                {deliveriesByDayData.map((d, i) => (
                  <RechartsCell key={i} fill={d.isToday ? CHART_DESTRUCTIVE : CHART_PRIMARY} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="lg:col-span-2 p-0 shadow-none overflow-hidden">
          <div className="p-5 pb-3 border-b border-border flex items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Upcoming deliveries</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Detail · sorted by date</p>
            </div>
            <Link
              to="/$main/orders/order-history"
              params={{ main }}
              search={{ statusFilter: "confirmed" }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {upcomingDeliveries.length > 0 ? (
            <div className="divide-y divide-border">
              {upcomingDeliveries
                .slice()
                .sort((a, b) => parseUtcTimestamp(a.delivery_date!).getTime() - parseUtcTimestamp(b.delivery_date!).getTime())
                .slice(0, 7)
                .map((order) => (
                  <DeliveryRow
                    key={order.id}
                    order={order}
                    isDueToday={parseUtcTimestamp(order.delivery_date!) <= endOfToday}
                    main={main}
                  />
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-10 text-center">No upcoming deliveries</p>
          )}
        </Card>
      </div>

      {/* Showroom panel — what shop staff must do */}
      <Card className="p-5 shadow-none">
        <div className="mb-4 pb-3 border-b border-border flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Showroom queue</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Action priority: alterations first, then trials, then pickups
            </p>
          </div>
          <Link
            to="/$main/orders/orders-at-showroom"
            params={{ main }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            Open showroom
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <CellLink
            label="Alterations in"
            value={`${alterationInCount}`}
            sub="Returned for rework"
            tone={alterationInCount > 0 ? "neg" : undefined}
            to={`/${main}/orders/orders-at-showroom`}
            search={{ stage: "alteration_in" }}
          />
          <CellLink
            label="Brova trials"
            value={`${brovaTrialsCount}`}
            sub="Awaiting customer trial"
            to={`/${main}/orders/orders-at-showroom`}
            search={{ stage: "brova_trial" }}
          />
          <CellLink
            label="Needs action"
            value={`${needsActionCount}`}
            sub="Rejected: send back"
            tone={needsActionCount > 0 ? "neg" : undefined}
            to={`/${main}/orders/orders-at-showroom`}
            search={{ stage: "needs_action" }}
          />
          <CellLink
            label="Ready for pickup"
            value={`${readyForPickupCount}`}
            sub="Customer can collect"
            emphasize={readyForPickupCount > 0}
            to={`/${main}/orders/orders-at-showroom`}
            search={{ stage: "ready_for_pickup" }}
          />
        </div>
      </Card>

      {/* Quick links — minimal text row, sidebar carries the heavy navigation */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link
          to="/$main/orders/new-work-order"
          params={{ main }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          + New work order
        </Link>
        <Link
          to="/$main/orders/new-sales-order"
          params={{ main }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          + New sales order
        </Link>
        <Link
          to="/$main/orders/new-alteration-order"
          params={{ main }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          + New alteration
        </Link>
      </div>
    </div>
  );
}

// ── ERTH primitives ────────────────────────────────────────────────────────

function ChartTooltipBox({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-foreground text-background text-xs rounded-md shadow-md px-3 py-2">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="opacity-70">{entry.name}:</span>
          <span className="font-medium tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function MixBar({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: "primary" | "muted";
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-sm tabular-nums">
          <span className="font-medium">{count}</span>
          <span className="text-muted-foreground"> · {pct}%</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={tone === "primary" ? "h-full bg-primary" : "h-full bg-muted-foreground/40"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  sub,
  tone,
  emphasize,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neg";
  emphasize?: boolean;
}) {
  const color = tone === "neg" ? "text-destructive" : emphasize ? "text-primary" : "text-foreground";
  const size = emphasize ? "text-lg font-semibold" : "text-base font-medium";
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`${size} tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function CellLink({
  label,
  value,
  sub,
  tone,
  emphasize,
  to,
  search,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neg";
  emphasize?: boolean;
  to: string;
  search?: Record<string, unknown>;
}) {
  return (
    <Link to={to} search={search} className="block -m-1 p-1 rounded-md hover:bg-muted/50 transition-colors">
      <Cell label={label} value={value} sub={sub} tone={tone} emphasize={emphasize} />
    </Link>
  );
}

function DeliveryRow({
  order,
  isDueToday,
  main,
}: {
  order: {
    id: number;
    order_type?: string | null;
    order_phase?: string | null;
    delivery_date?: string | Date | null;
    customer?: { name?: string | null } | null;
  };
  isDueToday: boolean;
  main: string;
}) {
  return (
    <Link
      to={order.order_type === 'SALES' ? "/$main/orders/new-sales-order" : "/$main/orders/view-work-order"}
      params={{ main }}
      search={{ orderId: order.id }}
      className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/50 transition-colors"
    >
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <span className="text-sm tabular-nums text-foreground">#{order.id}</span>
        <span className="text-sm text-muted-foreground truncate">{order.customer?.name}</span>
      </div>
      {order.order_phase && (
        <span className="text-xs text-muted-foreground shrink-0">
          {ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS]}
        </span>
      )}
      <div className="flex items-center gap-1.5 shrink-0 min-w-[76px] justify-end">
        <span
          className={cn(
            "text-sm tabular-nums",
            isDueToday ? "text-destructive font-medium" : "text-foreground",
          )}
        >
          {formatDeliveryDate(order.delivery_date!)}
        </span>
      </div>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto pb-10 space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}

function formatDeliveryDate(dateStr: string | Date) {
  const date = parseUtcTimestamp(dateStr);
  const dayStr = toLocalDateStr(date);
  const todayStr = getLocalDateStr();
  const tomorrowStr = getLocalDateStr(addDays(new Date(), 1));
  if (dayStr === todayStr) return "Today";
  if (dayStr === tomorrowStr) return "Tomorrow";
  return date.toLocaleDateString("en-GB", { timeZone: TIMEZONE, day: "numeric", month: "short" });
}

// ────────────────────────────────────────────────────────────────────────────
// Default (non-ERTH) dashboard — preserved for SAKKBA/QASS until each is
// redesigned for its own brand voice.
// ────────────────────────────────────────────────────────────────────────────

function DefaultDashboard() {
  const { main } = Route.useParams();

  const { data: ordersRes, isLoading: isLoadingOrders } = useQuery({
    queryKey: ["dashboard-orders", main],
    queryFn: () => getDashboardOrders(),
    staleTime: 1000 * 60 * 5, // 5 min — dashboard should refresh reasonably
    gcTime: 1000 * 60 * 60,
  });

  const { data: customerCount, isLoading: isLoadingCustomers } = useQuery({
    queryKey: ["dashboard-customers"],
    queryFn: () => getCustomerCount(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });

  const orders = ordersRes?.data || [];

  const today = getKuwaitMidnight();
  const endOfToday = getKuwaitEndOfDay();
  const sevenDaysFromNow = getKuwaitEndOfDay(addDays(new Date(), 7));

  // All orders from getDashboardOrders are already checkout_status='confirmed'
  const stats = {
    totalCustomers: customerCount || 0,
    confirmedOrders: orders.length,
    activeOrders: orders.filter(o => o.order_phase === 'in_progress').length,
    completedOrders: orders.filter(o => o.order_phase === 'completed').length,
    upcomingDeliveries: orders.filter(o => {
      if (!o.delivery_date || o.order_phase === 'completed') return false;
      const deliveryDate = parseUtcTimestamp(o.delivery_date);
      return deliveryDate >= today && deliveryDate <= sevenDaysFromNow;
    }),
    todayDeliveries: orders.filter(o => {
      if (!o.delivery_date || o.order_phase === 'completed') return false;
      const deliveryDate = parseUtcTimestamp(o.delivery_date);
      return deliveryDate >= today && deliveryDate <= endOfToday;
    }),
    readyForPickup: orders.filter(o => {
      return getShowroomStatus(o.garments || []).label === "ready_for_pickup";
    }),
    brovaTrials: orders.filter(o => {
      return getShowroomStatus(o.garments || []).label === "brova_trial";
    }),
    needsAction: orders.filter(o => {
      return o.garments?.some((g) => (g.feedback_status === 'needs_repair' || g.feedback_status === 'needs_redo') && g.location === 'shop');
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

  return (
    <div className={cn("p-4 md:p-5 max-w-[1600px] mx-auto space-y-5", ANIMATION_CLASSES.fadeInUp)}>
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" })}
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
        <DefaultStatCard
          title="Customers"
          value={stats.totalCustomers}
          icon={Users}
          color="text-primary"
          bg="bg-primary/10"
          index={0}
          to="/$main/customers"
        />
        <DefaultStatCard
          title="Active Orders"
          value={stats.activeOrders}
          icon={ShoppingBag}
          color="text-primary"
          bg="bg-primary/10"
          index={1}
          to="/$main/orders/order-history"
          search={{ statusFilter: "confirmed", phaseFilter: "in_progress" }}
        />
        <DefaultStatCard
          title="Deliveries (7d)"
          value={stats.upcomingDeliveries.length}
          icon={CalendarIcon}
          color="text-amber-600"
          bg="bg-amber-500/10"
          index={2}
          to="/$main/orders/order-history"
          search={{ statusFilter: "confirmed" }}
        />
        <DefaultStatCard
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
                  .sort((a, b) => parseUtcTimestamp(a.delivery_date!).getTime() - parseUtcTimestamp(b.delivery_date!).getTime())
                  .map((order) => {
                    const isDueToday = parseUtcTimestamp(order.delivery_date!) <= endOfToday;
                    return (
                      <Link
                        key={order.id}
                        to={order.order_type === 'SALES' ? "/$main/orders/new-sales-order" : "/$main/orders/view-work-order"}
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
            <DefaultWorkflowItem
              label="Ready for Pickup"
              count={stats.readyForPickup.length}
              icon={Package}
              color="text-primary"
              bg="bg-primary/10"
              to="/$main/orders/orders-at-showroom"
              search={{ stage: "ready_for_pickup" }}
            />
            <DefaultWorkflowItem
              label="Brova Trials"
              count={stats.brovaTrials.length}
              icon={Scissors}
              color="text-amber-600"
              bg="bg-amber-500/10"
              to="/$main/orders/orders-at-showroom"
              search={{ stage: "brova_trial" }}
            />
            <DefaultWorkflowItem
              label="Needs Action"
              count={stats.needsAction.length}
              icon={AlertCircle}
              color="text-rose-600"
              bg="bg-rose-500/10"
              to="/$main/orders/orders-at-showroom"
              search={{ stage: "needs_action" }}
              urgent={stats.needsAction.length > 0}
            />
            <DefaultWorkflowItem
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
          <DefaultQuickAction
            label="New Work Order"
            icon={ShoppingBag}
            to={`/${main}/orders/new-work-order`}
          />
          <DefaultQuickAction
            label="New Sales Order"
            icon={ShoppingCart}
            to={`/${main}/orders/new-sales-order`}
          />
          <DefaultQuickAction
            label="Orders at Showroom"
            icon={Store}
            to={`/${main}/orders/orders-at-showroom`}
          />
          <DefaultQuickAction
            label="Customers"
            icon={Users}
            to={`/${main}/customers`}
          />
        </div>
      </div>
    </div>
  );
}

function DefaultStatCard({ title, value, icon: Icon, color, bg, index, to, search }: {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
  bg: string;
  index: number;
  to?: string;
  search?: Record<string, unknown>;
}) {
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

function DefaultWorkflowItem({ label, count, icon: Icon, color, bg, to, search, urgent }: {
  label: string;
  count: number;
  icon: LucideIcon;
  color: string;
  bg: string;
  to?: string;
  search?: Record<string, unknown>;
  urgent?: boolean;
}) {
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

function DefaultQuickAction({ label, icon: Icon, to }: { label: string; icon: LucideIcon; to: string }) {
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
