import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart, ArrowDownToLine, Send, AlertTriangle, Settings2, Package } from "lucide-react";
import { Card, CardContent } from "@repo/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { cn } from "@/lib/utils";
import { getMovements, getMovementAggregates, getTopItemsByMovement } from "@/api/stockMovements";
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_COLORS } from "@/lib/inventory";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared/PageShell";
import type { StockMovementType } from "@repo/database";

export const Route = createFileRoute("/(main)/store/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Inventory Reports" }] }),
});

type Range = "7d" | "30d" | "90d" | "ytd";

function rangeToDates(range: Range): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (range === "7d") from.setDate(to.getDate() - 7);
  else if (range === "30d") from.setDate(to.getDate() - 30);
  else if (range === "90d") from.setDate(to.getDate() - 90);
  else from.setMonth(0, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

// Bar accent maps to the same semantic tone as the chip — keeps the row
// visually self-consistent without re-deriving from the chip className.
const MOVEMENT_BAR_BG: Record<StockMovementType, string> = {
  restock:      "bg-[var(--status-ok)]",
  consumption:  "bg-[var(--status-info)]",
  transfer_out: "bg-muted-foreground/60",
  transfer_in:  "bg-[var(--status-info)]",
  adjustment:   "bg-[var(--status-warn)]",
  waste:        "bg-[var(--status-bad)]",
  return:       "bg-muted-foreground/60",
};

function ReportsPage() {
  const [range, setRange] = useState<Range>("30d");
  const { from, to } = useMemo(() => rangeToDates(range), [range]);

  const { data: agg, isLoading: aggLoading } = useQuery({
    queryKey: ["mv_agg", from, to],
    queryFn: () => getMovementAggregates({ from, to }),
    staleTime: 60_000,
  });
  const { data: topConsumed = [] } = useQuery({
    queryKey: ["top_consumed", from, to],
    queryFn: () => getTopItemsByMovement({ movementType: "consumption", from, to, limit: 10 }),
    staleTime: 60_000,
  });
  const { data: topRestocked = [] } = useQuery({
    queryKey: ["top_restocked", from, to],
    queryFn: () => getTopItemsByMovement({ movementType: "restock", from, to, limit: 10 }),
    staleTime: 60_000,
  });
  const { data: recentAdjustments = [] } = useQuery({
    queryKey: ["recent_adjustments", from, to],
    queryFn: () => getMovements({ movementType: "adjustment", fromDate: from, toDate: to, limit: 20 }),
    staleTime: 60_000,
  });

  const totals = agg?.totals ?? {};
  const restocked = totals.restock ?? 0;
  const consumed = totals.consumption ?? 0;
  const lost = totals.waste ?? 0;
  const net = restocked - consumed;

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-10">
      <PageHeader icon={BarChart} title="Inventory reports" subtitle="Stock movement aggregates from the ledger.">
        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="ytd">Year to date</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiTile label="Restocked"      value={restocked} icon={ArrowDownToLine} color="green"   trend="+ inflow"   loading={aggLoading} />
        <KpiTile label="Consumed"       value={consumed}  icon={Send}            color="blue"    trend="outflow"    loading={aggLoading} />
        <KpiTile label="Net change"     value={net}       icon={BarChart}        color={net >= 0 ? "green" : "red"} trend={net >= 0 ? "growth" : "draw down"} loading={aggLoading} showSign />
        <KpiTile label="Lost in transit" value={lost}     icon={AlertTriangle}   color="amber"   trend={lost > 0 ? "investigate" : "clean"} loading={aggLoading} dimOnZero />
      </div>

      {/* By-type breakdown */}
      <SectionCard title="Movements by type" className="mb-6">
        <div className="space-y-2">
          {(Object.entries(MOVEMENT_TYPE_LABELS) as [StockMovementType, string][]).map(([type, label]) => {
            const v = totals[type] ?? 0;
            const max = Math.max(...Object.values(totals as Record<string, number>), 1);
            const pct = (v / max) * 100;
            return (
              <div key={type} className="flex items-center gap-3">
                <span className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium w-24 justify-center",
                  MOVEMENT_TYPE_COLORS[type],
                )}>
                  {label}
                </span>
                <div className="flex-1 bg-muted rounded-md h-2 overflow-hidden">
                  <div className={cn("h-full transition-all", MOVEMENT_BAR_BG[type])} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm tabular-nums w-20 text-right">{v.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Top items */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <TopItemsCard title="Top consumed" rows={topConsumed} icon={Send} tone="info" />
        <TopItemsCard title="Top restocked" rows={topRestocked} icon={ArrowDownToLine} tone="ok" />
      </div>

      {/* Recent adjustments */}
      <SectionCard
        title="Recent adjustments"
        action={<span className="text-xs text-muted-foreground">{recentAdjustments.length} in window</span>}
      >
        {recentAdjustments.length === 0 ? (
          <EmptyState icon={Settings2} message="No manual adjustments in this period" />
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAdjustments.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm">{m.item_type} #{m.item_id} <span className="text-xs text-muted-foreground">({m.location})</span></TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${Number(m.qty_delta) >= 0 ? "text-[var(--status-ok)]" : "text-[var(--status-bad)]"}`}>
                      {Number(m.qty_delta) >= 0 ? "+" : ""}{Number(m.qty_delta).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-sm">{m.reason ?? "—"}</TableCell>
                    <TableCell className="text-sm">{m.user?.name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>
    </div>
  );
}

function KpiTile({ label, value, icon, color, trend, loading, showSign, dimOnZero }: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: "green" | "blue" | "red" | "amber";
  trend: string;
  loading: boolean;
  showSign?: boolean;
  dimOnZero?: boolean;
}) {
  // Build a tiny wrapper that renders the StatsCard shape but lets us show
  // the trend line + handle loading skeleton + signed values consistently.
  const displayValue = showSign && value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  const isDimmed = dimOnZero && value === 0;
  const accent = isDimmed ? "text-muted-foreground/50" : {
    green: "text-[var(--status-ok)]",
    blue:  "text-[var(--status-info)]",
    red:   "text-[var(--status-bad)]",
    amber: "text-[var(--status-warn)]",
  }[color];
  const Icon = icon;

  if (loading) {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 shrink-0 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <div className="h-7 w-16 mt-1 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4 shrink-0", accent)} aria-hidden="true" />
        <p className={cn("text-xs text-muted-foreground", isDimmed && "text-muted-foreground/60")}>{label}</p>
      </div>
      <p className={cn("text-xl font-semibold tabular-nums leading-tight mt-1", isDimmed ? "text-muted-foreground/60" : "text-foreground")}>{displayValue}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-0.5">{trend}</p>
    </div>
  );
}

function TopItemsCard({ title, rows, icon: Icon, tone }: { title: string; rows: any[]; icon: any; tone: "ok" | "info" }) {
  const iconColor = tone === "ok" ? "text-[var(--status-ok)]" : "text-[var(--status-info)]";
  return (
    <Card>
      <CardContent className="py-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Icon className={cn("h-4 w-4", iconColor)} /> {title}
        </h3>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-8 text-center">
            <Package className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No data in this period</p>
          </div>
        ) : (
          <div className="space-y-1">
            {rows.map((r, i) => (
              <div key={`${r.item_type}-${r.item_id}`} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50 text-sm">
                <span className="w-6 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className="flex-1 truncate">{r.name ?? `#${r.item_id}`} <span className="text-xs text-muted-foreground">({r.item_type})</span></span>
                <span className="font-medium tabular-nums">{Number(r.total).toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
