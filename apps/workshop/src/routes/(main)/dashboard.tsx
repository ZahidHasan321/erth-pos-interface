import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useResources } from "@/hooks/useResources";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Inbox, CalendarDays, ClipboardList,
  Truck, ArrowRight, Zap, AlertTriangle,
  Unlock, PackageCheck, RotateCcw, Clock,
  ParkingSquare, Users,
} from "lucide-react";

export const Route = createFileRoute("/(main)/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard" }] }),
});

// Stage colors for pipeline chart
const PIPELINE_COLORS: Record<string, string> = {
  Soaking:   "#0ea5e9",
  Cutting:   "#3b82f6",
  "Post-Cut": "#6366f1",
  Sewing:    "#8b5cf6",
  Finishing:  "#a855f7",
  Ironing:   "#f59e0b",
  QC:        "#f97316",
  Dispatch:  "#10b981",
};

const URGENCY_COLORS: Record<string, string> = {
  Overdue:    "#ef4444",
  "Due Today": "#f97316",
  "1-2 Days": "#f59e0b",
  "3-5 Days": "#eab308",
  "6+ Days":  "#22c55e",
  "No Date":  "#94a3b8",
};

function DashboardPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();
  useResources();

  // ── Action items (PM attention needed) ────────────────────────────
  const actionItems = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);

    const finalsToRelease = allGarments.filter(
      (g) =>
        g.garment_type === "final" &&
        g.location === "workshop" &&
        !g.in_production &&
        (g.piece_stage === "waiting_for_acceptance" ||
          (g.piece_stage === "waiting_cut" && !g.production_plan))
    );
    const incoming = allGarments.filter(
      (g) => g.location === "transit_to_workshop"
    );
    const needsScheduling = allGarments.filter(
      (g) =>
        g.location === "workshop" &&
        g.in_production &&
        !g.production_plan &&
        g.piece_stage === "waiting_cut"
    );
    const qcReturns = allGarments.filter(
      (g) => g.feedback_status === "needs_repair" || g.feedback_status === "needs_redo"
    );
    const readyToDispatch = allGarments.filter(
      (g) => g.piece_stage === "ready_for_dispatch"
    );
    const overdueOrderIds = new Set<number>();
    for (const g of allGarments) {
      if (
        g.location === "workshop" &&
        g.delivery_date_order &&
        g.delivery_date_order < todayStr
      ) {
        overdueOrderIds.add(g.order_id);
      }
    }
    const overdueOrders = overdueOrderIds.size;
    const express = allGarments.filter(
      (g) => g.express && g.location === "workshop" && g.in_production
    );

    return { finalsToRelease, incoming, needsScheduling, qcReturns, readyToDispatch, overdueOrders, express };
  }, [allGarments]);

  // Build the action cards array (only items with count > 0 appear)
  const actionCards = useMemo(() => {
    const cards: {
      key: string;
      label: string;
      count: number;
      desc: string;
      href: string;
      icon: typeof Inbox;
      urgency: "critical" | "warning" | "info";
    }[] = [];

    if (actionItems.overdueOrders > 0) {
      cards.push({
        key: "overdue",
        label: "Overdue Orders",
        count: actionItems.overdueOrders,
        desc: "Past delivery date — still at workshop",
        href: "/assigned",
        icon: AlertTriangle,
        urgency: "critical",
      });
    }
    if (actionItems.express.length > 0) {
      cards.push({
        key: "express",
        label: "Express Priority",
        count: actionItems.express.length,
        desc: "Rush orders in production",
        href: "/assigned",
        icon: Zap,
        urgency: "critical",
      });
    }
    if (actionItems.finalsToRelease.length > 0) {
      cards.push({
        key: "finals",
        label: "Release Finals",
        count: actionItems.finalsToRelease.length,
        desc: "Finals waiting — release to production",
        href: "/parking",
        icon: Unlock,
        urgency: "warning",
      });
    }
    if (actionItems.qcReturns.length > 0) {
      cards.push({
        key: "qc-returns",
        label: "QC Returns",
        count: actionItems.qcReturns.length,
        desc: "Failed QC — need rescheduling",
        href: "/scheduler",
        icon: RotateCcw,
        urgency: "warning",
      });
    }
    if (actionItems.incoming.length > 0) {
      cards.push({
        key: "incoming",
        label: "Incoming Shipments",
        count: actionItems.incoming.length,
        desc: "In transit to workshop — receive them",
        href: "/receiving",
        icon: Inbox,
        urgency: "info",
      });
    }
    if (actionItems.needsScheduling.length > 0) {
      cards.push({
        key: "schedule",
        label: "Needs Scheduling",
        count: actionItems.needsScheduling.length,
        desc: "In production but no plan assigned",
        href: "/scheduler",
        icon: CalendarDays,
        urgency: "info",
      });
    }
    if (actionItems.readyToDispatch.length > 0) {
      cards.push({
        key: "dispatch",
        label: "Ready to Dispatch",
        count: actionItems.readyToDispatch.length,
        desc: "Passed QC — send back to shop",
        href: "/dispatch",
        icon: PackageCheck,
        urgency: "info",
      });
    }

    return cards;
  }, [actionItems]);

  // ── Production pipeline (from actual garment data) ────────────────
  const STAGE_MAP: Record<string, string> = {
    soaking: "Soaking", cutting: "Cutting", post_cutting: "Post-Cut",
    sewing: "Sewing", finishing: "Finishing", ironing: "Ironing",
    quality_check: "QC", ready_for_dispatch: "Dispatch",
  };

  const pipelineData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of allGarments) {
      if (g.location !== "workshop" || !g.in_production) continue;
      const label = STAGE_MAP[g.piece_stage ?? ""] ?? null;
      if (!label) continue;
      counts[label] = (counts[label] ?? 0) + 1;
    }
    const order = ["Soaking", "Cutting", "Post-Cut", "Sewing", "Finishing", "Ironing", "QC", "Dispatch"];
    return order.map((stage) => ({ stage, count: counts[stage] ?? 0 }));
  }, [allGarments]);

  // ── Delivery urgency (order-level) ────────────────────────────────
  const deliveryData = useMemo(() => {
    const orderDeliveries = new Map<number, string | null>();
    for (const g of allGarments) {
      if (g.location !== "workshop") continue;
      if (!orderDeliveries.has(g.order_id)) {
        orderDeliveries.set(g.order_id, g.delivery_date_order ?? null);
      }
    }

    const buckets: Record<string, number> = {
      Overdue: 0, "Due Today": 0, "1-2 Days": 0, "3-5 Days": 0, "6+ Days": 0, "No Date": 0,
    };
    const now = Date.now();
    for (const [, date] of orderDeliveries) {
      if (!date) { buckets["No Date"]++; continue; }
      const diff = Math.ceil((new Date(date).getTime() - now) / (1000 * 60 * 60 * 24));
      if (diff < 0) buckets["Overdue"]++;
      else if (diff === 0) buckets["Due Today"]++;
      else if (diff <= 2) buckets["1-2 Days"]++;
      else if (diff <= 5) buckets["3-5 Days"]++;
      else buckets["6+ Days"]++;
    }
    return Object.entries(buckets)
      .map(([name, count]) => ({ name, count }))
      .filter((d) => d.count > 0);
  }, [allGarments]);

  // ── Top workers by workload ───────────────────────────────────────
  const PLAN_KEY_TO_STAGE: Record<string, string> = {
    soaker: "Soak", cutter: "Cut", post_cutter: "Post-Cut",
    sewer: "Sew", finisher: "Finish", ironer: "Iron", quality_checker: "QC",
  };

  // Aggregate workload per worker (combine across stages)
  const topWorkersData = useMemo(() => {
    const map: Record<string, { name: string; stages: Set<string>; count: number }> = {};
    for (const g of allGarments) {
      if (!g.production_plan || !g.in_production) continue;
      const pp = g.production_plan as Record<string, string>;
      for (const [planKey, workerName] of Object.entries(pp)) {
        if (!workerName || planKey === "sewing_unit") continue;
        const stage = PLAN_KEY_TO_STAGE[planKey] ?? planKey;
        if (!map[workerName]) map[workerName] = { name: workerName, stages: new Set(), count: 0 };
        map[workerName].stages.add(stage);
        map[workerName].count++;
      }
    }
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((w) => ({
        name: w.name,
        stages: Array.from(w.stages).join(", "),
        count: w.count,
      }));
  }, [allGarments]);

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const inProduction = allGarments.filter((g) => g.location === "workshop" && g.in_production);
    const parked = allGarments.filter((g) => g.location === "workshop" && !g.in_production);
    const totalAtWorkshop = allGarments.filter((g) => g.location === "workshop").length;
    const inTransit = allGarments.filter((g) =>
      g.location === "transit_to_workshop" || g.location === "transit_to_shop"
    ).length;

    // Count unique orders
    const orderIds = new Set(allGarments.map((g) => g.order_id));

    const todayStr = new Date().toISOString().slice(0, 10);
    const overdueOrderIds = new Set<number>();
    for (const g of allGarments) {
      if (g.location === "workshop" && g.delivery_date_order && g.delivery_date_order < todayStr) {
        overdueOrderIds.add(g.order_id);
      }
    }

    return {
      totalOrders: orderIds.size,
      totalGarments: totalAtWorkshop,
      inProduction: inProduction.length,
      parked: parked.length,
      inTransit,
      overdueOrders: overdueOrderIds.size,
    };
  }, [allGarments]);

  const URGENCY_STYLES = {
    critical: {
      card: "bg-red-50 border-red-200 hover:bg-red-100/80",
      badge: "bg-red-600 text-white",
      icon: "text-red-600",
      pulse: true,
    },
    warning: {
      card: "bg-amber-50 border-amber-200 hover:bg-amber-100/80",
      badge: "bg-amber-600 text-white",
      icon: "text-amber-600",
      pulse: false,
    },
    info: {
      card: "bg-sky-50 border-sky-200 hover:bg-sky-100/80",
      badge: "bg-sky-600 text-white",
      icon: "text-sky-600",
      pulse: false,
    },
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Workshop Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Live production status</p>
      </div>

      {/* ── ACTION REQUIRED ────────────────────────────────────────── */}
      {!isLoading && actionCards.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Action Required
            </h2>
            <span className="text-xs bg-foreground/10 rounded-full px-2 py-0.5 font-bold">
              {actionCards.reduce((s, c) => s + c.count, 0)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {actionCards.map((card) => {
              const style = URGENCY_STYLES[card.urgency];
              const Icon = card.icon;
              return (
                <Link
                  key={card.key}
                  to={card.href}
                  className={cn(
                    "border rounded-xl p-4 flex items-start gap-3 transition-all hover:shadow-md group",
                    style.card,
                  )}
                >
                  <div className={cn("mt-0.5 shrink-0", style.icon)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-sm">{card.label}</p>
                      <span
                        className={cn(
                          "text-xs font-black rounded-full px-2 py-0.5 min-w-[24px] text-center leading-tight",
                          style.badge,
                          style.pulse && "animate-pulse",
                        )}
                      >
                        {card.count}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{card.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 opacity-30 group-hover:opacity-60 transition-opacity shrink-0 mt-1" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Top KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
          {[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          <KpiCard label="Orders" value={stats.totalOrders} icon={<ClipboardList className="w-5 h-5" />} />
          <KpiCard label="Garments" value={stats.totalGarments} icon={<Inbox className="w-5 h-5" />} />
          <KpiCard label="In Production" value={stats.inProduction} icon={<Zap className="w-5 h-5" />} />
          <KpiCard label="Parked" value={stats.parked} icon={<ParkingSquare className="w-5 h-5" />} />
          <KpiCard label="In Transit" value={stats.inTransit} icon={<Truck className="w-5 h-5" />} />
          <KpiCard label="Overdue" value={stats.overdueOrders} icon={<AlertTriangle className="w-5 h-5" />}
            color={stats.overdueOrders > 0 ? "text-red-600" : undefined}
            highlight={stats.overdueOrders > 0 ? "bg-red-50/60 border-red-200" : undefined}
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Production pipeline — from actual garment stages */}
        <div className="lg:col-span-2 bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Production Pipeline
          </h2>
          {isLoading ? (
            <Skeleton className="h-56" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pipelineData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis
                  dataKey="stage"
                  tick={{ fontSize: 11, fontWeight: 600 }}
                  interval={0}
                  angle={-30}
                  textAnchor="end"
                  height={45}
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RechartsTooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} animationDuration={800}>
                  {pipelineData.map((entry) => (
                    <Cell key={entry.stage} fill={PIPELINE_COLORS[entry.stage] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Delivery urgency — orders by due date */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Delivery Urgency
          </h2>
          {isLoading ? (
            <Skeleton className="h-56" />
          ) : deliveryData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">No orders</div>
          ) : (
            <div className="space-y-2 pt-1">
              {deliveryData.map((d) => {
                const maxCount = Math.max(...deliveryData.map((x) => x.count));
                const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                const color = URGENCY_COLORS[d.name] ?? "#94a3b8";
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold">{d.name}</span>
                      <span className="text-xs font-black">{d.count}</span>
                    </div>
                    <div className="h-5 bg-muted/30 rounded-md overflow-hidden">
                      <div
                        className="h-full rounded-md transition-all flex items-center justify-end pr-1.5"
                        style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: color }}
                      >
                        {pct > 20 && (
                          <span className="text-[10px] font-bold text-white">
                            {d.count} order{d.count !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top 5 Busiest Workers */}
      {!isLoading && topWorkersData.length > 0 && (
        <div className="bg-white border rounded-xl p-4 shadow-sm mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" /> Busiest Workers
          </h2>
          <div className="space-y-2">
            {topWorkersData.map((w, i) => {
              const maxCount = topWorkersData[0].count;
              const pct = maxCount > 0 ? (w.count / maxCount) * 100 : 0;
              return (
                <div key={w.name} className="flex items-center gap-3">
                  <span className="text-xs font-black text-muted-foreground w-4 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-semibold truncate">{w.name}</span>
                      <span className="text-xs font-black shrink-0 ml-2">{w.count} garments</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${Math.max(pct, 5)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{w.stages}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Receive Orders", desc: `${actionItems.incoming.length} incoming`, href: "/receiving", icon: Inbox },
            { label: "Schedule Production", desc: `${actionItems.needsScheduling.length} awaiting`, href: "/scheduler", icon: CalendarDays },
            { label: "Dispatch Ready", desc: `${actionItems.readyToDispatch.length} ready`, href: "/dispatch", icon: Truck },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                to={action.href}
                className="bg-white border rounded-xl p-4 flex items-center gap-3 transition-all hover:shadow-md hover:bg-muted/40"
              >
                <Icon className="w-6 h-6 opacity-60 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 opacity-40" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  color,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
  highlight?: string;
}) {
  return (
    <div className={cn("border rounded-xl p-3 shadow-sm text-center", highlight ?? "bg-white")}>
      <div className={cn("mx-auto mb-1 opacity-60 w-fit", color ?? "text-foreground/50")}>{icon}</div>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
