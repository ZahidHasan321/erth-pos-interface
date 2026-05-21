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
import type { StockMovementType } from "@repo/database";

export const Route = createFileRoute("/$main/store/reports")({
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
  // Anchor lower bound to local start-of-day so the window is "since the start
  // of that calendar day" — otherwise YTD/Nd start at the current time-of-day
  // and silently drop that day's earlier movements.
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

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

  const kpis = [
    { label: "Restocked", value: restocked.toFixed(1), icon: ArrowDownToLine, color: "bg-green-50 text-green-600", trend: "+ inflow" },
    { label: "Consumed", value: consumed.toFixed(1), icon: Send, color: "bg-blue-50 text-blue-600", trend: "outflow" },
    { label: "Net change", value: (net >= 0 ? "+" : "") + net.toFixed(1), icon: BarChart, color: net >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600", trend: net >= 0 ? "growth" : "draw down" },
    { label: "Lost in transit", value: lost.toFixed(1), icon: AlertTriangle, color: lost > 0 ? "bg-amber-50 text-amber-600" : "bg-muted text-muted-foreground", trend: lost > 0 ? "investigate" : "clean" },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <BarChart className="h-5 w-5" /> Inventory Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Stock movement aggregates from the ledger.
          </p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="ytd">Year to date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map((k) => (
          <Card key={k.label} className="shadow-none rounded-xl">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn("p-2 rounded-lg shrink-0", k.color)}>
                <k.icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                {aggLoading ? (
                  <div className="h-6 w-16 bg-muted rounded animate-pulse" />
                ) : (
                  <p className="text-lg font-bold tabular-nums">{k.value}</p>
                )}
                <p className="text-[10px] text-muted-foreground/70">{k.trend}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* By-type breakdown */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <h3 className="text-sm font-semibold mb-3">Movements by type</h3>
          <div className="space-y-2">
            {(Object.entries(MOVEMENT_TYPE_LABELS) as [StockMovementType, string][]).map(([type, label]) => {
              const v = totals[type] ?? 0;
              const max = Math.max(...Object.values(totals as Record<string, number>), 1);
              const pct = (v / max) * 100;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] uppercase font-semibold w-24 justify-center ${MOVEMENT_TYPE_COLORS[type]}`}>{label}</span>
                  <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
                    <div className={cn("h-full transition-all", MOVEMENT_TYPE_COLORS[type].split(" ")[0].replace("bg-", "bg-"))} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm tabular-nums w-20 text-right font-medium">{v.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top items */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <TopItemsCard title="Top consumed" rows={topConsumed} icon={Send} color="text-blue-600" />
        <TopItemsCard title="Top restocked" rows={topRestocked} icon={ArrowDownToLine} color="text-green-600" />
      </div>

      {/* Recent adjustments */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-amber-600" /> Recent adjustments
            </h3>
            <span className="text-xs text-muted-foreground">{recentAdjustments.length} in window</span>
          </div>
          {recentAdjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No manual adjustments in this period</p>
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
                      <TableCell className={`text-right tabular-nums font-semibold ${Number(m.qty_delta) >= 0 ? "text-green-700" : "text-red-700"}`}>
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
        </CardContent>
      </Card>
    </div>
  );
}

function TopItemsCard({ title, rows, icon: Icon, color }: { title: string; rows: any[]; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Icon className={cn("h-4 w-4", color)} /> {title}
        </h3>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center">
            <Package className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No data in this period</p>
          </div>
        ) : (
          <div className="space-y-1">
            {rows.map((r, i) => (
              <div key={`${r.item_type}-${r.item_id}`} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/50 text-sm">
                <span className="w-6 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className="flex-1 truncate">{r.name ?? `#${r.item_id}`} <span className="text-xs text-muted-foreground">({r.item_type})</span></span>
                <span className="font-semibold tabular-nums">{Number(r.total).toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
