import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ArrowDownToLine, Send, AlertTriangle, Settings2, Package, Building2, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@repo/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import { cn, getLocalDateStr, getKuwaitDayRange } from "@/lib/utils";
import { getMovements, getMovementAggregates, getTopItemsByMovement, getConsumptionByBrand } from "@/api/stockMovements";
import { MOVEMENT_TYPE_LABELS, getWasteReasonLabel } from "@/lib/inventory";
import type { StockMovementType, StockItemType } from "@repo/database";
import type { TopItem } from "@/api/stockMovements";

export const Route = createFileRoute("/$main/store/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Inventory Reports" }] }),
});

type Range = "7d" | "30d" | "90d" | "ytd";

// Reports scope to one item type at a time: totals only make sense within a
// single unit (fabric is meters, shelf is pieces, accessories carry their own
// unit). Mixing them into one "Restocked: 47" was meaningless.
const ITEM_TYPES: { value: StockItemType; label: string; unit: string }[] = [
  { value: "fabric", label: "Fabric", unit: "m" },
  { value: "shelf", label: "Shelf", unit: "pcs" },
  { value: "accessory", label: "Accessories", unit: "units" },
];

function rangeToDates(range: Range): { from: string; to: string } {
  // Anchor the lower bound to the start of a Kuwait business day, not the
  // viewer's browser day: otherwise a non-Kuwait user gets a window shifted by
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

function ReportsPage() {
  const [range, setRange] = useState<Range>("30d");
  const [itemType, setItemType] = useState<StockItemType>("fabric");
  const { from, to } = useMemo(() => rangeToDates(range), [range]);
  const unit = ITEM_TYPES.find((t) => t.value === itemType)?.unit ?? "units";

  // Every report is scoped to location='shop' so workshop accessory movements
  // never leak in (§4: each side blind to the other) and to one item type so
  // totals stay in a single unit. Mirrors the workshop reports page (which
  // scopes to 'workshop').
  const { data: agg, isLoading: aggLoading, isError: aggError } = useQuery({
    queryKey: ["mv_agg", "shop", itemType, from, to],
    queryFn: () => getMovementAggregates({ from, to, location: "shop", itemType }),
    staleTime: 60_000,
  });
  const { data: topConsumed = [] } = useQuery({
    queryKey: ["top_consumed", "shop", itemType, from, to],
    queryFn: () => getTopItemsByMovement({ movementType: "consumption", from, to, limit: 10, location: "shop", itemType }),
    staleTime: 60_000,
  });
  const { data: topRestocked = [] } = useQuery({
    queryKey: ["top_restocked", "shop", itemType, from, to],
    queryFn: () => getTopItemsByMovement({ movementType: "restock", from, to, limit: 10, location: "shop", itemType }),
    staleTime: 60_000,
  });
  // The one sanctioned cross-brand view (§1/§4): how each brand draws down the
  // shared fabric pool. Only meaningful for fabric (the only stock home brands use).
  const { data: consumptionByBrand = [] } = useQuery({
    queryKey: ["consumption_by_brand", itemType, from, to],
    queryFn: () => getConsumptionByBrand({ from, to, itemType }),
    staleTime: 60_000,
    enabled: itemType === "fabric",
  });
  const { data: recentAdjustments = [] } = useQuery({
    queryKey: ["recent_adjustments", "shop", itemType, from, to],
    queryFn: () => getMovements({ movementType: "adjustment", location: "shop", itemType, fromDate: from, toDate: to, limit: 20 }),
    staleTime: 60_000,
  });
  const { data: wasteMovements = [] } = useQuery({
    queryKey: ["waste_movements", "shop", itemType, from, to],
    queryFn: () => getMovements({ movementType: "waste", location: "shop", itemType, fromDate: from, toDate: to, limit: 500 }),
    staleTime: 60_000,
  });

  // Damage/Waste grouped by reason (with cost impact) for the period.
  const wasteByReason = useMemo(() => {
    const map = new Map<string, { qty: number; cost: number }>();
    for (const m of wasteMovements) {
      const key = m.reason ?? "unspecified";
      // Mirror the server measure SUM(ABS(qty_delta) + COALESCE(annotated_qty,0)):
      // real wastes carry the loss in qty_delta (annotated_qty NULL); net-zero
      // redo-scrap annotations carry it in annotated_qty (qty_delta 0). Dropping
      // annotated_qty here made redo scrap a phantom 0-unit row and made this
      // breakdown disagree with the "Lost" KPI (which comes from that RPC).
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
  const consumed = totals.consumption ?? 0;
  const lost = totals.waste ?? 0;
  // True signed net stock change from the ledger (all movement types), not the
  // old restock-minus-consumed proxy that ignored transfers/returns/waste.
  const net = agg?.net ?? 0;

  const kpis: { label: string; value: string; icon: LucideIcon; sub?: string; bad?: boolean }[] = [
    { label: "Restocked", value: restocked.toFixed(1), icon: ArrowDownToLine, sub: "supplier inflow" },
    { label: "Consumed", value: consumed.toFixed(1), icon: Send, sub: "cut and sold" },
    { label: "Net change", value: (net >= 0 ? "+" : "") + net.toFixed(1), icon: BarChart3, sub: "all movements", bad: net < 0 },
    { label: "Lost", value: lost.toFixed(1), icon: AlertTriangle, sub: lost > 0 ? "needs review" : "none recorded", bad: lost > 0 },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" /> Inventory reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shop stock movements from the ledger. Workshop stock is reported separately.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border bg-muted/30 p-0.5" role="tablist" aria-label="Item type">
            {ITEM_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={itemType === t.value}
                onClick={() => setItemType(t.value)}
                className={cn(
                  "px-3 py-1 text-sm rounded-md transition-colors",
                  itemType === t.value
                    ? "bg-card text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="ytd">Year to date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {aggError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 mb-6 text-sm text-destructive">
          Could not load report data. Check your connection and try again.
        </div>
      )}

      {/* KPI cards — clean, border-led, brand-neutral (§11). The number is the
          hero; loss-direction is the only place colour is used. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
                <k.icon className="h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
              </div>
              {aggLoading ? (
                <div className="h-8 w-20 mt-2 bg-muted rounded animate-pulse" />
              ) : (
                <p className={cn("text-2xl font-semibold tabular-nums mt-1.5 leading-none", k.bad && "text-destructive")}>
                  {k.value}<span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
                </p>
              )}
              {k.sub && <p className="text-[11px] text-muted-foreground/70 mt-1.5">{k.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* By-type breakdown */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <h3 className="text-sm font-semibold mb-4">Movements by type</h3>
          <div className="space-y-3">
            {(Object.entries(MOVEMENT_TYPE_LABELS) as [StockMovementType, string][]).map(([type, label]) => {
              const v = totals[type] ?? 0;
              const max = Math.max(...Object.values(totals as Record<string, number>), 1);
              const pct = (v / max) * 100;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="w-24 text-xs text-muted-foreground shrink-0">{label}</span>
                  <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", v > 0 ? "bg-primary/70" : "bg-transparent")} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm tabular-nums w-16 text-right font-medium">{v.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Consumption by brand — the only cross-brand view (§1/§4), fabric only */}
      {itemType === "fabric" && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" /> Consumption by brand
              </h3>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{consumed.toFixed(1)} {unit} total</span>
            </div>
            <p className="text-[11px] text-muted-foreground/70 mb-4">How each brand draws down the shared fabric stock.</p>
            {consumptionByBrand.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No fabric consumption in this period.</p>
            ) : (
              <div className="space-y-3">
                {consumptionByBrand.map((b) => {
                  const max = Math.max(...consumptionByBrand.map((x) => Number(x.total)), 1);
                  const pct = Math.round((Number(b.total) / max) * 100);
                  const label = b.brand === "UNATTRIBUTED" ? "Unattributed" : b.brand;
                  return (
                    <div key={b.brand} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 truncate text-muted-foreground" title={label}>{label}</span>
                      <div className="flex-1 min-w-0 h-1.5 bg-muted rounded-full overflow-hidden" aria-hidden="true">
                        <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular-nums text-muted-foreground w-12 text-right">{b.count}</span>
                      <span className="tabular-nums font-medium w-20 text-right">{Number(b.total).toFixed(1)} {unit}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Waste by reason */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" /> Waste by reason
            </h3>
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {lost.toFixed(1)} {unit} · {totalWasteCost.toFixed(2)} cost
            </span>
          </div>
          {wasteByReason.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No waste recorded in this period.</p>
          ) : (
            <div className="space-y-3">
              {wasteByReason.map((w) => {
                const maxCost = Math.max(...wasteByReason.map((x) => x.cost), 1);
                const pct = Math.round((w.cost / maxCost) * 100);
                return (
                  <div key={w.reason} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 truncate text-muted-foreground" title={getWasteReasonLabel(w.reason)}>{getWasteReasonLabel(w.reason)}</span>
                    <div className="flex-1 min-w-0 h-1.5 bg-muted rounded-full overflow-hidden" aria-hidden="true">
                      <div className="h-full bg-destructive/50 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular-nums text-muted-foreground w-20 text-right">{w.qty.toFixed(1)} {unit}</span>
                    <span className="tabular-nums font-medium w-20 text-right">{w.cost.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top items */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <TopItemsCard title="Top consumed" rows={topConsumed} icon={Send} />
        <TopItemsCard title="Top restocked" rows={topRestocked} icon={ArrowDownToLine} />
      </div>

      {/* Recent adjustments */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" /> Recent adjustments
            </h3>
            <span className="text-xs text-muted-foreground">
              {recentAdjustments.length === 20 ? "latest 20" : `${recentAdjustments.length} in window`}
            </span>
          </div>
          {recentAdjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No manual adjustments in this period.</p>
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAdjustments.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{m.item_type} #{m.item_id} <span className="text-xs text-muted-foreground">({m.location})</span></TableCell>
                      <TableCell className={cn("text-right tabular-nums font-semibold", Number(m.qty_delta) >= 0 ? "text-foreground" : "text-destructive")}>
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
        </CardContent>
      </Card>
    </div>
  );
}

function TopItemsCard({ title, rows, icon: Icon }: { title: string; rows: TopItem[]; icon: LucideIcon }) {
  return (
    <Card>
      <CardContent className="py-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" /> {title}
        </h3>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center">
            <Package className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No data in this period</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {rows.map((r, i) => (
              <div key={`${r.item_type}-${r.item_id}`} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50 text-sm">
                <span className="w-5 text-xs text-muted-foreground/70 tabular-nums">{i + 1}</span>
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
