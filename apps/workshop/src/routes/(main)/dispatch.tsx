import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useWorkshopGarments, useOrderLocationBreakdown } from "@/hooks/useWorkshopGarments";
import type { OrderLocationBreakdown } from "@/api/garments";
import { useDispatchGarments } from "@/hooks/useGarmentMutations";
import { PageHeader, EmptyState, LoadingSkeleton, GarmentTypeBadge } from "@/components/shared/PageShell";
import { StageBadge, ExpressBadge, AlterationBadge } from "@/components/shared/StageBadge";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Checkbox } from "@repo/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableContainer } from "@repo/ui/table";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import { Truck, Package, History, Printer, ChevronDown, Hash, User, Loader2 } from "lucide-react";
import { formatDate, cn, parseUtcTimestamp, getKuwaitMidnight } from "@/lib/utils";
import { getDispatchHistory, type DispatchHistoryRow } from "@/api/garments";
import type { WorkshopGarment } from "@repo/database";

export const Route = createFileRoute("/(main)/dispatch")({
  component: DispatchPage,
  head: () => ({ meta: [{ title: "Dispatch" }] }),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function deliveryUrgency(deliveryDate: string | null | undefined) {
  if (!deliveryDate) return { label: null, className: "text-muted-foreground" };
  const today = getKuwaitMidnight();
  const delivery = getKuwaitMidnight(parseUtcTimestamp(deliveryDate));
  const daysLeft = Math.ceil((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)
    return { label: `+${Math.abs(daysLeft)}d`, className: "text-red-700 bg-red-100 px-1.5 py-0.5 rounded" };
  if (daysLeft <= 2)
    return { label: null, className: "text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded" };
  return { label: null, className: "text-muted-foreground" };
}

// ── Ready Tab — Grouped by Order ────────────────────────────────────────────

interface ReadyOrderGroup {
  orderId: number;
  invoiceNumber: number | undefined;
  customerName: string | undefined;
  customerMobile: string | undefined;
  deliveryDate: string | undefined;
  garments: WorkshopGarment[];
}

function groupReadyByOrder(garments: WorkshopGarment[]): ReadyOrderGroup[] {
  const map = new Map<number, ReadyOrderGroup>();
  for (const g of garments) {
    let group = map.get(g.order_id);
    if (!group) {
      group = {
        orderId: g.order_id,
        invoiceNumber: g.invoice_number,
        customerName: g.customer_name,
        customerMobile: g.customer_mobile,
        deliveryDate: g.delivery_date_order,
        garments: [],
      };
      map.set(g.order_id, group);
    }
    group.garments.push(g);
  }
  // Sort groups: express first, then earliest delivery, then order id.
  const groups = [...map.values()];
  groups.sort((a, b) => {
    const aExpress = a.garments.some((g) => g.express);
    const bExpress = b.garments.some((g) => g.express);
    if (aExpress && !bExpress) return -1;
    if (!aExpress && bExpress) return 1;
    const da = a.deliveryDate ?? "";
    const db = b.deliveryDate ?? "";
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (!da && db) return 1;
    return a.orderId - b.orderId;
  });
  return groups;
}

function ReadyOrderCard({
  group,
  breakdown,
  onDispatchGroup,
  dispatchPendingIds,
}: {
  group: ReadyOrderGroup;
  breakdown?: OrderLocationBreakdown;
  onDispatchGroup: (ids: string[]) => void;
  dispatchPendingIds: Set<string>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group.garments.map((g) => g.id)),
  );

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const groupIds = group.garments.map((g) => g.id);
  const allSelected = selected.size === groupIds.length;
  const someSelected = selected.size > 0 && !allSelected;
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(groupIds) : new Set());
  };

  const handleDispatch = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selected.size === 0) return;
    onDispatchGroup([...selected]);
  };

  const hasExpress = group.garments.some((g) => g.express);
  const brovaCount = group.garments.filter((g) => g.garment_type === "brova").length;
  const finalCount = group.garments.filter((g) => g.garment_type === "final").length;
  const isPending = groupIds.some((id) => dispatchPendingIds.has(id));

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden transition-all duration-300 border-l-4",
      expanded ? "border-l-primary shadow-md" : "border-l-transparent hover:border-l-primary/40 hover:bg-muted/30",
      hasExpress && "border-l-orange-500",
    )}>
      <div className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {/* Desktop (lg+): single row */}
        <div className="hidden lg:flex items-center min-h-[64px]">
          {/* Order ID + Invoice */}
          <div className="flex-1 px-4 py-2.5 border-r border-border/40 min-w-[200px]">
            <div className="flex items-center gap-2.5 mb-0.5">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleAll(!!checked)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="p-1 rounded-md bg-primary/10 text-primary">
                <Hash className="w-3 h-3" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Order {group.orderId}</h3>
                {group.invoiceNumber != null && (
                  <span className="text-[11px] text-primary/80 font-medium">Inv {group.invoiceNumber}</span>
                )}
              </div>
            </div>
          </div>

          {/* Customer */}
          <div className="flex-[1.5] px-4 py-2.5 border-r border-border/40 bg-muted/10">
            <div className="flex items-center gap-2">
              <User className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-sm font-bold truncate">{group.customerName ?? "Unknown"}</span>
              {group.customerMobile && (
                <span className="text-xs text-muted-foreground font-medium shrink-0">{group.customerMobile}</span>
              )}
            </div>
          </div>

          {/* Counts */}
          <div className="flex-[1.6] px-4 py-2.5 border-r border-border/40">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-black bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                {groupIds.length}/{breakdown?.total ?? groupIds.length} ready
              </span>
              {breakdown && breakdown.workshop > 0 && (
                <span className="text-[11px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{breakdown.workshop} in production</span>
              )}
              {breakdown && breakdown.transit > 0 && (
                <span className="text-[11px] font-black bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded">{breakdown.transit} in transit</span>
              )}
              {breakdown && breakdown.shop > 0 && (
                <span className="text-[11px] font-black bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">{breakdown.shop} at shop</span>
              )}
              {breakdown && breakdown.done > 0 && (
                <span className="text-[11px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{breakdown.done} done</span>
              )}
              {(brovaCount > 0 || finalCount > 0) && (
                <span className="text-[11px] font-black">
                  {brovaCount > 0 && <span className="text-blue-700">{brovaCount}B</span>}
                  {brovaCount > 0 && finalCount > 0 && <span className="mx-0.5 text-muted-foreground">·</span>}
                  {finalCount > 0 && <span className="text-emerald-700">{finalCount}F</span>}
                </span>
              )}
              {hasExpress && <span className="text-[11px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Express</span>}
            </div>
          </div>

          {/* Actions */}
          <div className="w-[210px] px-4 py-2.5 flex items-center gap-2 bg-muted/5">
            <Button
              className="flex-1 h-9 font-bold uppercase tracking-wider text-xs shadow-sm"
              onClick={handleDispatch}
              disabled={isPending || selected.size === 0}
            >
              {isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Truck className="w-3.5 h-3.5 mr-1" />
              )}
              Dispatch{selected.size > 0 && selected.size < groupIds.length ? ` (${selected.size})` : ""}
            </Button>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0"
            >
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", expanded && "rotate-180")} />
            </button>
          </div>
        </div>

        {/* Mobile/tablet (<lg): compact 2-row */}
        <div className="lg:hidden px-3 sm:px-4 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => toggleAll(!!checked)}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0"
              />
              <span className="text-sm font-bold shrink-0">#{group.orderId}</span>
              {group.invoiceNumber != null && (
                <span className="text-[11px] text-primary/80 font-medium shrink-0">Inv {group.invoiceNumber}</span>
              )}
              <div className="w-px h-3.5 bg-border/40 shrink-0" />
              <User className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-sm font-bold truncate">{group.customerName ?? "Unknown"}</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0"
            >
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", expanded && "rotate-180")} />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {group.customerMobile && <span className="text-[11px] text-muted-foreground">{group.customerMobile}</span>}
              <span className="text-[10px] font-black bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                {groupIds.length}/{breakdown?.total ?? groupIds.length} ready
              </span>
              {breakdown && breakdown.workshop > 0 && <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{breakdown.workshop}P</span>}
              {breakdown && breakdown.transit > 0 && <span className="text-[10px] font-black bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded">{breakdown.transit}T</span>}
              {breakdown && breakdown.shop > 0 && <span className="text-[10px] font-black bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">{breakdown.shop}S</span>}
              {breakdown && breakdown.done > 0 && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{breakdown.done}D</span>}
              {brovaCount > 0 && <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{brovaCount}B</span>}
              {finalCount > 0 && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{finalCount}F</span>}
              {hasExpress && <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Exp</span>}
            </div>
            <Button
              className="h-8 px-4 font-bold uppercase tracking-wider text-xs shadow-sm shrink-0"
              onClick={handleDispatch}
              disabled={isPending || selected.size === 0}
            >
              {isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Dispatch{selected.size > 0 && selected.size < groupIds.length ? ` (${selected.size})` : ""}
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded garment list with slide animation */}
      <div className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-in-out",
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}>
        <div className={cn("overflow-hidden", expanded && "border-t-2 border-border/40 bg-muted/5")}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border/40">
                <th className="text-left py-2.5 px-4">Garment</th>
                <th className="text-left py-2.5 px-4">Type</th>
                <th className="text-left py-2.5 px-4">Stage</th>
              </tr>
            </thead>
            <tbody>
              {group.garments.map((g) => {
                const isSelected = selected.has(g.id);
                return (
                  <tr
                    key={g.id}
                    className={cn(
                      "border-b border-border/20 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer",
                      !isSelected && "opacity-50",
                    )}
                    onClick={() => toggleOne(g.id, !isSelected)}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold">
                      <div className="flex items-center gap-1.5">
                        {g.garment_id}
                        <AlterationBadge tripNumber={g.trip_number} garmentType={g.garment_type} />
                        {g.express && <ExpressBadge />}
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={cn(
                        "text-xs font-black uppercase px-1.5 py-0.5 rounded",
                        g.garment_type === "brova" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700",
                      )}>
                        {g.garment_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <StageBadge stage={g.piece_stage} garmentType={g.garment_type} inProduction={g.in_production} location={g.location} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface InTransitOrderGroup {
  orderId: number;
  invoiceNumber: number | undefined;
  customerName: string | undefined;
  customerMobile: string | undefined;
  deliveryDate: string | undefined;
  garments: WorkshopGarment[];
}

function groupInTransitByOrder(garments: WorkshopGarment[]): InTransitOrderGroup[] {
  const map = new Map<number, InTransitOrderGroup>();
  for (const g of garments) {
    let group = map.get(g.order_id);
    if (!group) {
      group = {
        orderId: g.order_id,
        invoiceNumber: g.invoice_number,
        customerName: g.customer_name,
        customerMobile: g.customer_mobile,
        deliveryDate: g.delivery_date_order,
        garments: [],
      };
      map.set(g.order_id, group);
    }
    group.garments.push(g);
  }
  return [...map.values()];
}

function InTransitOrderCard({ group }: { group: InTransitOrderGroup }) {
  const [expanded, setExpanded] = useState(true);
  const hasExpress = group.garments.some((g) => g.express);
  const urgency = deliveryUrgency(group.deliveryDate);
  const brovaCount = group.garments.filter((g) => g.garment_type === "brova").length;
  const finalCount = group.garments.filter((g) => g.garment_type === "final").length;

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden transition-all duration-300 border-l-4",
      expanded ? "border-l-blue-400 shadow-md" : "border-l-transparent hover:border-l-blue-300 hover:bg-muted/30",
      hasExpress && "border-l-orange-500",
    )}>
      <div className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {/* Desktop (lg+): single row */}
        <div className="hidden lg:flex items-center min-h-[64px]">
          <div className="flex-1 px-4 py-2.5 border-r border-border/40 min-w-[180px]">
            <div className="flex items-center gap-2.5 mb-0.5">
              <div className="p-1 rounded-md bg-blue-100 text-blue-600">
                <Hash className="w-3 h-3" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Order {group.orderId}</h3>
                {group.invoiceNumber != null && (
                  <span className="text-[11px] text-primary/80 font-medium">Inv {group.invoiceNumber}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex-[1.5] px-4 py-2.5 border-r border-border/40 bg-muted/10">
            <div className="flex items-center gap-2">
              <User className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-sm font-bold truncate">{group.customerName ?? "Unknown"}</span>
              {group.customerMobile && (
                <span className="text-xs text-muted-foreground font-medium shrink-0">{group.customerMobile}</span>
              )}
            </div>
          </div>
          <div className="flex-[1.2] px-4 py-2.5 border-r border-border/40">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="font-black text-xs px-2 py-0 h-5">{group.garments.length} Pcs</Badge>
              {brovaCount > 0 && <span className="text-[11px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{brovaCount} Brova</span>}
              {finalCount > 0 && <span className="text-[11px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{finalCount} Final</span>}
              {hasExpress && <span className="text-[11px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Express</span>}
              {group.deliveryDate && (
                <span className={cn("text-[11px] font-medium rounded px-1.5 py-0.5", urgency.className)}>
                  {formatDate(group.deliveryDate)}
                  {urgency.label && <span className="ml-1 font-bold">{urgency.label}</span>}
                </span>
              )}
            </div>
          </div>
          <div className="w-[60px] px-4 py-2.5 flex items-center justify-center bg-muted/5">
            <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="p-1.5 hover:bg-muted rounded-md transition-colors">
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", expanded && "rotate-180")} />
            </button>
          </div>
        </div>

        {/* Mobile/tablet (<lg): compact 2-row */}
        <div className="lg:hidden px-3 sm:px-4 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-bold shrink-0">#{group.orderId}</span>
              {group.invoiceNumber != null && (
                <span className="text-[11px] text-primary/80 font-medium shrink-0">Inv {group.invoiceNumber}</span>
              )}
              <div className="w-px h-3.5 bg-border/40 shrink-0" />
              <User className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-sm font-bold truncate">{group.customerName ?? "Unknown"}</span>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0">
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", expanded && "rotate-180")} />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {group.customerMobile && <span className="text-[11px] text-muted-foreground">{group.customerMobile}</span>}
            <Badge variant="secondary" className="font-black text-[11px] px-1.5 py-0 h-4">{group.garments.length} Pcs</Badge>
            {brovaCount > 0 && <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{brovaCount}B</span>}
            {finalCount > 0 && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{finalCount}F</span>}
            {hasExpress && <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Exp</span>}
            {group.deliveryDate && (
              <span className={cn("text-[10px] font-medium rounded px-1", urgency.className)}>
                {formatDate(group.deliveryDate)}{urgency.label && ` ${urgency.label}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded garment list with slide animation */}
      <div className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-in-out",
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}>
        <div className={cn("overflow-hidden", expanded && "border-t-2 border-border/40 bg-muted/5")}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border/40">
                <th className="text-left py-2.5 px-4">Garment</th>
                <th className="text-left py-2.5 px-4">Type</th>
                <th className="text-left py-2.5 px-4">Stage</th>
              </tr>
            </thead>
            <tbody>
              {group.garments.map((g) => (
                <tr key={g.id} className="border-b border-border/20 last:border-b-0">
                  <td className="py-2.5 px-4 font-mono font-bold">
                    <div className="flex items-center gap-1.5">
                      {g.garment_id}
                      <AlterationBadge tripNumber={g.trip_number} garmentType={g.garment_type} />
                      {g.express && <ExpressBadge />}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={cn(
                      "text-xs font-black uppercase px-1.5 py-0.5 rounded",
                      g.garment_type === "brova" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700",
                    )}>
                      {g.garment_type}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <StageBadge stage={g.piece_stage} garmentType={g.garment_type} inProduction={g.in_production} location={g.location} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Dispatch History Tab ────────────────────────────────────────────────────

type HistoryPeriod = 'today' | 'week' | 'month';

// Compute [from, to) bounds for a given period, in local time.
// Week starts Sunday (matches Kuwait workweek — Fri/Sat weekend).
function getPeriodRange(period: HistoryPeriod): { from: Date; to: Date; label: string } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfDay); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (period === 'today') {
    return { from: startOfDay, to: startOfTomorrow, label: startOfDay.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) };
  }

  if (period === 'week') {
    const dayOfWeek = startOfDay.getDay();
    const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(endOfWeek.getDate() + 7);
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return { from: startOfWeek, to: endOfWeek, label: `${fmt(startOfWeek)} – ${fmt(new Date(endOfWeek.getTime() - 1))}` };
  }

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: startOfMonth, to: startOfNextMonth, label: startOfMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' }) };
}

const PERIOD_OPTIONS = [
  { value: 'today' as const, label: 'Today' },
  { value: 'week' as const, label: 'This Week' },
  { value: 'month' as const, label: 'This Month' },
] satisfies ReadonlyArray<{ value: HistoryPeriod; label: string }>;

function DispatchHistoryTab() {
  const [period, setPeriod] = useState<HistoryPeriod>('today');
  const { from: fromDate, to: toDate, label: periodLabel } = getPeriodRange(period);

  // Workshop-side history is always outbound: workshop → shop.
  const { data: rows = [], isLoading, isError, error } = useQuery<DispatchHistoryRow[]>({
    queryKey: ['dispatchHistory', fromDate.toISOString(), toDate.toISOString(), 'to_shop'],
    queryFn: () => getDispatchHistory(fromDate.toISOString(), toDate.toISOString()),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <SlidingPillSwitcher value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />

        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {periodLabel}
        </span>

        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs font-bold">
          {rows.length} dispatched → Shop
        </Badge>

        <div className="ml-auto">
          <Button
            size="sm"
            onClick={handlePrint}
            disabled={rows.length === 0}
            className="text-xs h-9"
          >
            <Printer className="w-3 h-3 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">Dispatch History — {period === 'today' ? 'Today' : period === 'week' ? 'This Week' : 'This Month'}</h1>
        <p className="text-sm text-muted-foreground">
          Workshop → Shop · {periodLabel} · {rows.length} record{rows.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Body */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="font-bold text-destructive">
            Error: {error instanceof Error ? error.message : 'Fetch Failed'}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={History} message={`No dispatches in ${periodLabel}`} />
      ) : (
        <TableContainer className="print:border-0 print:shadow-none">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
                <TableHead className="w-32">Date</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Garment</TableHead>
                <TableHead className="w-20">Type</TableHead>
                <TableHead className="w-16">Trip</TableHead>
                <TableHead className="w-20">Brand</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const d = new Date(r.dispatched_at);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="text-xs font-bold">{d.toLocaleDateString("en-GB")}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </TableCell>
                    <TableCell className="font-bold text-sm">#{r.order_id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.invoice_number ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-bold">{r.customer_name ?? 'Unknown'}</div>
                      {r.customer_phone && (
                        <div className="text-[10px] text-muted-foreground">{r.customer_phone}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.garment_code ?? r.garment_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      {r.garment_type && (
                        <GarmentTypeBadge type={r.garment_type as 'brova' | 'final'} />
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-bold">{r.trip_number ?? '—'}</TableCell>
                    <TableCell className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {r.brand ?? '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function DispatchPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();
  const dispatchMut = useDispatchGarments();
  // Ready garments at workshop — post-QC garments pending shipment to shop.
  // (brova_trialed lives at shop under unified flow; receiving resets any stray
  // brova_trialed returning to the workshop back to waiting_cut.)
  const readyGarments = useMemo(
    () => allGarments.filter(
      (g) => g.location === "workshop" && g.piece_stage === "ready_for_dispatch",
    ),
    [allGarments],
  );

  // Group by order for partial-dispatch UI (mirrors POS dispatch page).
  const readyGroups = useMemo(() => groupReadyByOrder(readyGarments), [readyGarments]);

  // Per-order breakdown so each card can show where the rest of the order's
  // garments currently sit (workshop / transit / shop / done).
  const readyOrderIds = useMemo(() => readyGroups.map((g) => g.orderId), [readyGroups]);
  const { data: breakdowns = {} } = useOrderLocationBreakdown(readyOrderIds);

  // In transit garments
  const inTransitGarments = useMemo(
    () => allGarments.filter((g) => g.location === "transit_to_shop"),
    [allGarments],
  );
  const inTransitGroups = useMemo(() => groupInTransitByOrder(inTransitGarments), [inTransitGarments]);

  const handleDispatchGroup = async (ids: string[]) => {
    if (ids.length === 0) return;
    await dispatchMut.mutateAsync(ids);
  };

  const dispatchPendingIds = useMemo(
    () =>
      dispatchMut.isPending && dispatchMut.variables
        ? new Set(dispatchMut.variables)
        : new Set<string>(),
    [dispatchMut.isPending, dispatchMut.variables],
  );

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-28">
      <PageHeader
        icon={Truck}
        title="Dispatch"
        subtitle={`${readyGarments.length} garment${readyGarments.length !== 1 ? "s" : ""} ready for dispatch`}
      />

      <Tabs defaultValue="ready">
        <TabsList className="mb-3 h-auto gap-0.5 flex-nowrap overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="ready">
            Ready{" "}
            <Badge variant="secondary" className="ml-1 text-xs bg-green-100 text-green-700">
              {readyGarments.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="transit">
            In Transit{" "}
            <Badge variant="secondary" className="ml-1 text-xs bg-blue-100 text-blue-700">
              {inTransitGarments.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-3 h-3 mr-1" />
            History
          </TabsTrigger>
        </TabsList>

        {/* ── READY — grouped by order, partial dispatch supported ── */}
        <TabsContent value="ready">
          {isLoading ? (
            <LoadingSkeleton />
          ) : readyGroups.length === 0 ? (
            <EmptyState icon={Package} message="No garments ready for dispatch" />
          ) : (
            <div className="space-y-3">
              {readyGroups.map((group) => (
                <ReadyOrderCard
                  key={group.orderId}
                  group={group}
                  breakdown={breakdowns[group.orderId]}
                  onDispatchGroup={handleDispatchGroup}
                  dispatchPendingIds={dispatchPendingIds}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── HISTORY — dispatched workshop → shop ── */}
        <TabsContent value="history">
          <DispatchHistoryTab />
        </TabsContent>

        {/* ── IN TRANSIT — grouped by order, read-only ── */}
        <TabsContent value="transit">
          {inTransitGarments.length === 0 ? (
            <EmptyState icon={Truck} message="Nothing in transit" />
          ) : (
            <div className="space-y-3">
              {inTransitGroups.map((group) => (
                <InTransitOrderCard key={group.orderId} group={group} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
