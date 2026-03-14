import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useResources } from "@/hooks/useResources";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Inbox, CalendarDays, ClipboardList,
  Truck, ArrowRight, Zap, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/(main)/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard" }] }),
});

// Cohesive navy-to-teal gradient for pipeline (shows flow progression)
const STAGE_COLORS: Record<string, string> = {
  Receiving: "#1e3a5f",
  Parking:   "#234b72",
  Scheduler: "#2a5c86",
  Soaking:   "#316d99",
  Cutting:   "#3b7fad",
  "Post-Cut": "#4691bf",
  Sewing:    "#52a3cf",
  Finishing:  "#5fb5dc",
  Ironing:   "#6ec7e8",
  QC:        "#7dd8f2",
  Dispatch:  "#34d399",
};

// Muted, harmonious palette for pie charts
const PIE_COLORS = ["#3b82a0", "#5fa8c8", "#8bc4d8", "#b0dce8", "#d4eef5"];

function DashboardPage() {
  const { data: counts, isLoading: countsLoading } = useSidebarCounts();
  const { data: allGarments = [], isLoading: garmentsLoading } = useWorkshopGarments();
  useResources();

  const isLoading = countsLoading || garmentsLoading;

  // Pipeline bar chart data
  const pipelineData = useMemo(() => {
    if (!counts) return [];
    return [
      { stage: "Receiving", count: counts.receiving },
      { stage: "Parking",   count: counts.parking },
      { stage: "Scheduler", count: counts.scheduler },
      { stage: "Soaking",   count: counts.soaking },
      { stage: "Cutting",   count: counts.cutting },
      { stage: "Post-Cut",  count: counts.post_cutting },
      { stage: "Sewing",    count: counts.sewing },
      { stage: "Finishing",  count: counts.finishing },
      { stage: "Ironing",   count: counts.ironing },
      { stage: "QC",        count: counts.quality_check },
      { stage: "Dispatch",  count: counts.dispatch },
    ];
  }, [counts]);

  // Garment type pie chart
  const garmentTypeData = useMemo(() => {
    const inProd = allGarments.filter((g) => g.location === "workshop" && g.in_production);
    const brova = inProd.filter((g) => g.garment_type === "brova").length;
    const final = inProd.filter((g) => g.garment_type === "final").length;
    return [
      { name: "Brova", value: brova },
      { name: "Final", value: final },
    ].filter((d) => d.value > 0);
  }, [allGarments]);

  // Stage labels for display
  const STAGE_LABELS: Record<string, string> = {
    soaking: "Soak", cutting: "Cut", post_cutting: "Post-Cut",
    sewing: "Sew", finishing: "Finish", ironing: "Iron", quality_check: "QC",
  };

  // Plan key to stage mapping
  const PLAN_KEY_TO_STAGE: Record<string, string> = {
    soaker: "soaking", cutter: "cutting", post_cutter: "post_cutting",
    sewer: "sewing", finisher: "finishing", ironer: "ironing", quality_checker: "quality_check",
  };

  // Top workers by current workload (garments assigned to them in production plans)
  const topWorkersData = useMemo(() => {
    const map: Record<string, { name: string; stage: string; count: number }> = {};
    for (const g of allGarments) {
      if (!g.production_plan || !g.in_production) continue;
      const pp = g.production_plan as Record<string, string>;
      for (const [planKey, workerName] of Object.entries(pp)) {
        if (!workerName || planKey === "sewing_unit") continue;
        const stage = PLAN_KEY_TO_STAGE[planKey] ?? planKey;
        const key = `${workerName}|${stage}`;
        if (!map[key]) map[key] = { name: workerName, stage, count: 0 };
        map[key].count++;
      }
    }
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((w) => ({
        label: `${w.name} (${STAGE_LABELS[w.stage] ?? w.stage})`,
        count: w.count,
      }));
  }, [allGarments]);

  // Brand distribution
  const brandData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of allGarments) {
      if (!g.in_production || g.location !== "workshop") continue;
      const brand = g.order_brand ?? "Unknown";
      map[brand] = (map[brand] ?? 0) + 1;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [allGarments]);

  // Extra stats
  const stats = useMemo(() => {
    const inProduction = allGarments.filter((g) => g.location === "workshop" && g.in_production);
    const expressInProd = inProduction.filter((g) => g.express);
    const totalAtWorkshop = allGarments.filter((g) => g.location === "workshop").length;
    const inTransit = allGarments.filter((g) =>
      g.location === "transit_to_workshop" || g.location === "transit_to_shop"
    ).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const overdue = inProduction.filter((g) =>
      g.assigned_date && g.assigned_date < todayStr && g.piece_stage !== "ready_for_dispatch"
    ).length;

    return {
      totalInProduction: inProduction.length,
      expressCount: expressInProd.length,
      totalAtWorkshop,
      inTransit,
      overdue,
    };
  }, [allGarments]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight">Workshop Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Live production status</p>
      </div>

      {/* Top KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <KpiCard label="In Production" value={stats.totalInProduction} icon={<ClipboardList className="w-5 h-5" />} color="text-foreground/50" />
          <KpiCard label="At Workshop" value={stats.totalAtWorkshop} icon={<Inbox className="w-5 h-5" />} color="text-foreground/50" />
          <KpiCard label="In Transit" value={stats.inTransit} icon={<Truck className="w-5 h-5" />} color="text-foreground/50" />
          <KpiCard label="Express" value={stats.expressCount} icon={<Zap className="w-5 h-5" />}
            color={stats.expressCount > 0 ? "text-amber-600" : "text-foreground/50"}
            highlight={stats.expressCount > 0 ? "bg-amber-50/60 border-amber-200" : undefined}
          />
          <KpiCard label="Overdue" value={stats.overdue} icon={<AlertTriangle className="w-5 h-5" />}
            color={stats.overdue > 0 ? "text-red-600" : "text-foreground/50"}
            highlight={stats.overdue > 0 ? "bg-red-50/60 border-red-200" : undefined}
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Pipeline bar chart — spans 2 cols */}
        <div className="lg:col-span-2 bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Garments per Stage
          </h2>
          {isLoading ? (
            <Skeleton className="h-56" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pipelineData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis
                  dataKey="stage"
                  tick={{ fontSize: 10, fontWeight: 600 }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RechartsTooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} animationDuration={800} animationEasing="ease-out">
                  {pipelineData.map((entry) => (
                    <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Garment type pie chart */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Brova vs Final
          </h2>
          {isLoading ? (
            <Skeleton className="h-56" />
          ) : garmentTypeData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={garmentTypeData}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  <Cell fill="#7c3aed" />
                  <Cell fill="#2563eb" />
                </Pie>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Second row of charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Top workers by workload */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Top Workers by Workload
          </h2>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : topWorkersData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No workers assigned</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, topWorkersData.length * 28)}>
              <BarChart data={topWorkersData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fontWeight: 500 }} width={120} />
                <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }} />
                <Bar dataKey="count" fill="#2a5c86" radius={[0, 4, 4, 0]} animationDuration={800} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Brand distribution */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            By Brand
          </h2>
          {isLoading ? (
            <Skeleton className="h-48" />
          ) : brandData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={brandData}
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {brandData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Receive Orders", desc: `${counts?.receiving ?? 0} incoming`, href: "/receiving", icon: Inbox, color: "bg-white border-border hover:bg-muted/40" },
            { label: "Schedule Production", desc: `${counts?.scheduler ?? 0} awaiting`, href: "/scheduler", icon: CalendarDays, color: "bg-white border-border hover:bg-muted/40" },
            { label: "Dispatch Ready", desc: `${counts?.dispatch ?? 0} ready`, href: "/dispatch", icon: Truck, color: "bg-white border-border hover:bg-muted/40" },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                to={action.href}
                className={cn(
                  "border rounded-xl p-4 flex items-center gap-3 transition-all hover:shadow-md",
                  action.color,
                )}
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
      <div className={cn("mx-auto mb-1 opacity-60 w-fit", color ?? "text-primary")}>{icon}</div>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
