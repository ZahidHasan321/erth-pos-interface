import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart, ArrowDownToLine, ArrowDownLeft, Send, AlertTriangle, Settings2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";
import { cn, getLocalDateStr, getKuwaitDayRange, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import { getMovements, getMovementAggregates } from "@/api/stockMovements";
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPE_COLORS, getWasteReasonLabel } from "@/lib/inventory";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared/PageShell";
import type { StockMovementType } from "@repo/database";

export const Route = createFileRoute("/(main)/store/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Inventory Reports" }] }),
});

type Range = "7d" | "30d" | "90d" | "ytd";

function rangeToDates(range: Range): { from: string; to: string } {
  // Anchor the lower bound to the start of a Kuwait business day so the window
  // is "since the start of that calendar day" in Kuwait, not in the viewer's
  // browser timezone — otherwise a non-Kuwait user gets a window shifted by
  // their UTC offset. getKuwaitDayRange().start yields the correct UTC bound.
  const [y, m, d] = getLocalDateStr().split("-").map(Number) as [number, number, number];
  let fromStr: string;
  if (range === "ytd") {
    fromStr = `${y}-01-01`;
  } else {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const dt = new Date(Date.UTC(y, m - 1, d) - days * 86_400_000);
    fromStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  return { from: getKuwaitDayRange(fromStr).start, to: new Date().toISOString() };
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

  // The workshop holds only accessories, so every report is scoped to its own
  // side (location='workshop'); fabric/shelf movements are shop-side (§4).
  const { data: agg, isLoading: aggLoading } = useQuery({
    queryKey: ["mv_agg", "workshop", from, to],
    queryFn: () => getMovementAggregates({ from, to, location: "workshop" }),
    staleTime: 60_000,
  });
  const { data: recentAdjustments = [] } = useQuery({
    queryKey: ["recent_adjustments", "workshop", from, to],
    queryFn: () => getMovements({ movementType: "adjustment", location: "workshop", fromDate: from, toDate: to, limit: 20 }),
    staleTime: 60_000,
  });
  const { data: wasteMovements = [] } = useQuery({
    queryKey: ["waste_movements", "workshop", from, to],
    queryFn: () => getMovements({ movementType: "waste", location: "workshop", fromDate: from, toDate: to, limit: 500 }),
    staleTime: 60_000,
  });

  // Damage/Waste grouped by fault category (with cost impact) for the period.
  const wasteByReason = useMemo(() => {
    const map = new Map<string, { qty: number; cost: number }>();
    for (const m of wasteMovements) {
      const key = m.reason ?? "unspecified";
      // Mirror the server measure SUM(ABS(qty_delta) + COALESCE(annotated_qty,0)):
      // net-zero annotations (e.g. partial transfer loss) carry the amount in
      // annotated_qty with qty_delta 0, so include it or they read as 0 units
      // while the "Lost" KPI (from the RPC) counts them.
      const qty = Math.abs(Number(m.qty_delta)) + Number(m.annotated_qty ?? 0);
      const cost = qty * Number(m.unit_cost ?? 0);
      const cur = map.get(key) ?? { qty: 0, cost: 0 };
      cur.qty += qty;
      cur.cost += cost;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.cost - a.cost || b.qty - a.qty);
  }, [wasteMovements]);
  const totalWasteCost = useMemo(() => wasteByReason.reduce((n, w) => n + w.cost, 0), [wasteByReason]);

  const totals = agg?.totals ?? {};
  const restocked = totals.restock ?? 0;
  const received = totals.transfer_in ?? 0;
  const sentOut = totals.transfer_out ?? 0;
  const lost = totals.waste ?? 0;

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-10">
      <PageHeader icon={BarChart} title="Inventory reports">
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

      {/* KPI cards — accessory flows only; the workshop holds no fabric, so
          there is no consumption here (§4). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiTile label="Restocked" value={restocked} icon={ArrowDownToLine} color="green" trend="+ inflow"  loading={aggLoading} />
        <KpiTile label="Received"  value={received}  icon={ArrowDownLeft}   color="blue"  trend="from shop" loading={aggLoading} dimOnZero />
        <KpiTile label="Sent out"  value={sentOut}   icon={Send}            color="blue"  trend="to shop"   loading={aggLoading} dimOnZero />
        <KpiTile label="Lost"      value={lost}      icon={AlertTriangle}   color="amber" trend={lost > 0 ? "investigate" : "clean"} loading={aggLoading} dimOnZero />
      </div>

      {/* By-type breakdown */}
      <SectionCard title="Movements by type" className="mb-6">
        <div className="space-y-2">
          {(Object.entries(MOVEMENT_TYPE_LABELS) as [StockMovementType, string][])
            .filter(([type]) => type !== "consumption")
            .map(([type, label]) => {
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

      {/* Waste by reason */}
      <SectionCard
        title="Waste by reason"
        action={<span className="text-xs text-muted-foreground tabular-nums">{lost.toFixed(1)} units · cost {totalWasteCost.toFixed(2)}</span>}
        className="mb-6"
      >
        {wasteByReason.length === 0 ? (
          <EmptyState icon={AlertTriangle} message="No waste recorded in this period" />
        ) : (
          <div className="space-y-1.5">
            {wasteByReason.map((w) => {
              const pct = totalWasteCost > 0 ? (w.cost / totalWasteCost) * 100 : 0;
              return (
                <div key={w.reason} className="flex items-center gap-3 text-sm">
                  <span className="w-40 truncate min-w-0">{getWasteReasonLabel(w.reason)}</span>
                  <div className="flex-1 bg-muted rounded-md h-2 overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-[var(--status-bad)]" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="tabular-nums text-muted-foreground w-24 text-right">{w.qty.toFixed(1)} units</span>
                  <span className="tabular-nums font-medium w-24 text-right">cost {w.cost.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

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
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{parseUtcTimestamp(m.created_at).toLocaleString("en-GB", { timeZone: TIMEZONE })}</TableCell>
                    <TableCell className="text-sm">{m.item_type} #{m.item_id} <span className="text-xs text-muted-foreground">({m.location})</span></TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${Number(m.qty_delta) >= 0 ? "text-[var(--status-ok)]" : "text-[var(--status-bad)]"}`}>
                      {Number(m.qty_delta) >= 0 ? "+" : ""}{Number(m.qty_delta).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-sm">{m.reason ?? "-"}</TableCell>
                    <TableCell className="text-sm">{m.user?.name ?? "-"}</TableCell>
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
      <p className="text-[11px] text-muted-foreground/70 mt-0.5">{trend}</p>
    </div>
  );
}

