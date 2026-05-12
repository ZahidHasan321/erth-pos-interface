import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import {
  PageHeader,
  SectionCard,
  StatsCard,
  EmptyState,
} from "@/components/shared/PageShell";
import { Skeleton } from "@repo/ui/skeleton";
import { cn, getLocalDateStr, parseUtcTimestamp } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import {
  Inbox, CalendarDays, ClipboardList, LayoutDashboard,
  Truck, ArrowRight, Zap, AlertTriangle,
  Unlock, PackageCheck, RotateCcw,
  ParkingSquare,
} from "lucide-react";

export const Route = createFileRoute("/(main)/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard" }] }),
});

type ActionTone = "bad" | "warn" | "info";

const ACTION_TONE: Record<ActionTone, { card: string; icon: string }> = {
  bad: {
    card: "bg-[var(--status-bad-bg)] border-[color:var(--status-bad)]/30 hover:border-[color:var(--status-bad)]/60",
    icon: "text-[var(--status-bad)]",
  },
  warn: {
    card: "bg-[var(--status-warn-bg)] border-[color:var(--status-warn)]/30 hover:border-[color:var(--status-warn)]/60",
    icon: "text-[var(--status-warn)]",
  },
  info: {
    card: "bg-[var(--status-info-bg)] border-[color:var(--status-info)]/30 hover:border-[color:var(--status-info)]/60",
    icon: "text-[var(--status-info)]",
  },
};

// Delivery urgency uses a single tone progression (ok→warn→bad) — one signal
// per region. CSS vars only; no Tailwind palette.
const URGENCY_TONE: Record<string, string> = {
  Overdue:    "var(--status-bad)",
  "Due Today": "var(--status-bad)",
  "1-2 Days":  "var(--status-warn)",
  "3-5 Days":  "var(--status-warn)",
  "6+ Days":   "var(--status-ok)",
  "No Date":   "var(--muted-foreground)",
};

// TEMP DISABLED: post_cutting hidden from production flow
const STAGE_MAP: Record<string, string> = {
  soaking: "Soaking", cutting: "Cutting",
  sewing: "Sewing", finishing: "Finishing", ironing: "Ironing",
  quality_check: "QC", ready_for_dispatch: "Dispatch",
};

const PIPELINE_ORDER = ["Soaking", "Cutting", "Sewing", "Finishing", "Ironing", "QC", "Dispatch"];

const PLAN_KEY_TO_STAGE: Record<string, string> = {
  soaker: "Soak", cutter: "Cut",
  sewer: "Sew", finisher: "Finish", ironer: "Iron", quality_checker: "QC",
};

function DashboardPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();

  // ── Action items (PM attention needed) ────────────────────────────
  const actionItems = useMemo(() => {
    const todayStr = getLocalDateStr();

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
      (g) =>
        (g.location === "workshop" || g.location === "transit_to_workshop") &&
        (g.feedback_status === "needs_repair" || g.feedback_status === "needs_redo")
    );
    const readyToDispatch = allGarments.filter(
      (g) => g.piece_stage === "ready_for_dispatch"
    );
    const overdueOrderIds = new Set<number>();
    for (const g of allGarments) {
      if (
        g.location === "workshop" &&
        g.delivery_date_order &&
        getLocalDateStr(parseUtcTimestamp(g.delivery_date_order)) < todayStr
      ) {
        overdueOrderIds.add(g.order_id);
      }
    }
    const express = allGarments.filter(
      (g) => g.express && g.location === "workshop" && g.in_production
    );

    return {
      finalsToRelease, incoming, needsScheduling, qcReturns, readyToDispatch,
      overdueOrders: overdueOrderIds.size, express,
    };
  }, [allGarments]);

  // Cards only render when count > 0. Tone is semantic, not decorative.
  const actionCards = useMemo(() => {
    const cards: {
      key: string;
      label: string;
      count: number;
      desc: string;
      href: string;
      search?: Record<string, unknown>;
      icon: typeof Inbox;
      tone: ActionTone;
    }[] = [];

    if (actionItems.overdueOrders > 0) {
      cards.push({
        key: "overdue",
        label: "Overdue orders",
        count: actionItems.overdueOrders,
        desc: "Past delivery date — still at workshop",
        href: "/assigned",
        icon: AlertTriangle,
        tone: "bad",
      });
    }
    if (actionItems.express.length > 0) {
      cards.push({
        key: "express",
        label: "Express priority",
        count: actionItems.express.length,
        desc: "Rush orders in production",
        href: "/assigned",
        search: { express: true },
        icon: Zap,
        tone: "bad",
      });
    }
    if (actionItems.finalsToRelease.length > 0) {
      cards.push({
        key: "finals",
        label: "Release finals",
        count: actionItems.finalsToRelease.length,
        desc: "Finals waiting — release to production",
        href: "/parking",
        icon: Unlock,
        tone: "warn",
      });
    }
    if (actionItems.qcReturns.length > 0) {
      cards.push({
        key: "qc-returns",
        label: "QC returns",
        count: actionItems.qcReturns.length,
        desc: "Failed QC — need rescheduling",
        href: "/scheduler",
        icon: RotateCcw,
        tone: "warn",
      });
    }
    if (actionItems.incoming.length > 0) {
      cards.push({
        key: "incoming",
        label: "Incoming shipments",
        count: actionItems.incoming.length,
        desc: "In transit to workshop — receive them",
        href: "/receiving",
        icon: Inbox,
        tone: "info",
      });
    }
    if (actionItems.needsScheduling.length > 0) {
      cards.push({
        key: "schedule",
        label: "Needs scheduling",
        count: actionItems.needsScheduling.length,
        desc: "In production but no plan assigned",
        href: "/scheduler",
        icon: CalendarDays,
        tone: "info",
      });
    }
    if (actionItems.readyToDispatch.length > 0) {
      cards.push({
        key: "dispatch",
        label: "Ready to dispatch",
        count: actionItems.readyToDispatch.length,
        desc: "Passed QC — send back to shop",
        href: "/dispatch",
        icon: PackageCheck,
        tone: "info",
      });
    }

    return cards;
  }, [actionItems]);

  // ── Production pipeline (from actual garment data) ────────────────
  const pipelineData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of allGarments) {
      if (g.location !== "workshop" || !g.in_production) continue;
      const label = STAGE_MAP[g.piece_stage ?? ""] ?? null;
      if (!label) continue;
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return PIPELINE_ORDER.map((stage) => ({ stage, count: counts[stage] ?? 0 }));
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
      const diff = Math.ceil((parseUtcTimestamp(date).getTime() - now) / (1000 * 60 * 60 * 24));
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

    const orderIds = new Set(allGarments.map((g) => g.order_id));

    const todayStr = getLocalDateStr();
    const overdueOrderIds = new Set<number>();
    for (const g of allGarments) {
      if (
        g.location === "workshop" &&
        g.delivery_date_order &&
        getLocalDateStr(parseUtcTimestamp(g.delivery_date_order)) < todayStr
      ) {
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

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto pb-10">
      <PageHeader icon={LayoutDashboard} title="Workshop overview" subtitle="Live production status" />

      {/* ── Action required ───────────────────────────────────────── */}
      {!isLoading && actionCards.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-medium">Action required</h2>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {actionCards.reduce((s, c) => s + c.count, 0)} item{actionCards.reduce((s, c) => s + c.count, 0) === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {actionCards.map((card) => {
              const tone = ACTION_TONE[card.tone];
              const Icon = card.icon;
              return (
                <Link
                  key={card.key}
                  to={card.href}
                  search={card.search}
                  className={cn(
                    "border rounded-md p-3 flex items-start gap-3 transition-colors group",
                    tone.card,
                  )}
                >
                  <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", tone.icon)} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <p className="text-sm font-medium">{card.label}</p>
                      <span className={cn("text-base font-semibold tabular-nums", tone.icon)}>
                        {card.count}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{card.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 mt-1" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
          {[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-16 rounded-md" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
          <StatsCard icon={ClipboardList} value={stats.totalOrders} label="Orders" color="zinc" />
          <StatsCard icon={Inbox} value={stats.totalGarments} label="Garments" color="zinc" />
          <StatsCard icon={Zap} value={stats.inProduction} label="In production" color="blue" />
          <StatsCard icon={ParkingSquare} value={stats.parked} label="Parked" color="zinc" dimOnZero />
          <StatsCard icon={Truck} value={stats.inTransit} label="In transit" color="blue" dimOnZero />
          <StatsCard icon={AlertTriangle} value={stats.overdueOrders} label="Overdue" color="red" dimOnZero />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <SectionCard title="Production pipeline" className="lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-56" />
          ) : pipelineData.every((d) => d.count === 0) ? (
            <EmptyState message="No garments in production" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pipelineData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis
                  dataKey="stage"
                  tick={{ fontSize: 12 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RechartsTooltip
                  contentStyle={{ borderRadius: 6, fontSize: 12, border: "1px solid var(--border)" }}
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  fill="var(--status-info)"
                  animationDuration={600}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Delivery urgency">
          {isLoading ? (
            <Skeleton className="h-56" />
          ) : deliveryData.length === 0 ? (
            <EmptyState message="No orders at workshop" />
          ) : (
            <div className="space-y-2.5">
              {deliveryData.map((d) => {
                const maxCount = Math.max(...deliveryData.map((x) => x.count));
                const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                const color = URGENCY_TONE[d.name] ?? "var(--muted-foreground)";
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">{d.name}</span>
                      <span className="text-sm font-medium tabular-nums">{d.count}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-md overflow-hidden">
                      <div
                        className="h-full rounded-md transition-all"
                        style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Top 5 Busiest Workers */}
      {!isLoading && topWorkersData.length > 0 && (
        <SectionCard title="Busiest workers" className="mb-4">
          <div className="space-y-2.5">
            {topWorkersData.map((w, i) => {
              const maxCount = topWorkersData[0].count;
              const pct = maxCount > 0 ? (w.count / maxCount) * 100 : 0;
              return (
                <div key={w.name} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground tabular-nums w-4 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{w.name}</span>
                      <span className="text-sm tabular-nums shrink-0 ml-2 text-muted-foreground">{w.count} garments</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-md overflow-hidden">
                        <div
                          className="h-full rounded-md bg-[var(--status-info)] transition-all"
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{w.stages}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-base font-medium mb-3">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Receive orders", desc: `${actionItems.incoming.length} incoming`, href: "/receiving", icon: Inbox },
            { label: "Schedule production", desc: `${actionItems.needsScheduling.length} awaiting`, href: "/scheduler", icon: CalendarDays },
            { label: "Dispatch ready", desc: `${actionItems.readyToDispatch.length} ready`, href: "/dispatch", icon: Truck },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                to={action.href}
                className="bg-card border border-border rounded-md p-3 flex items-center gap-3 transition-colors hover:bg-muted/40 group"
              >
                <Icon className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
