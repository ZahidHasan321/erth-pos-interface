import { useState, useMemo, useRef, useLayoutEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useDispatchGarments } from "@/hooks/useGarmentMutations";
import { useIsMobile } from "@/hooks/use-mobile";
import { GarmentCard } from "@/components/shared/GarmentCard";
import { PageHeader, EmptyState, LoadingSkeleton, GarmentTypeBadge } from "@/components/shared/PageShell";
import { StageBadge, ExpressBadge, AlterationBadge } from "@/components/shared/StageBadge";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Checkbox } from "@repo/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@repo/ui/table";
import { Truck, Package, History, Printer, ChevronDown, ChevronRight, Hash, User } from "lucide-react";
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
  onDispatchGroup,
  isPending,
}: {
  group: ReadyOrderGroup;
  onDispatchGroup: (ids: string[]) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  // Per-card local selection, pre-selected to all garments in this order.
  // Matches the POS dispatch pattern — staff can uncheck to partially dispatch.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group.garments.map((g) => g.id)),
  );

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const groupIds = group.garments.map((g) => g.id);
  const allSelected = selected.size === groupIds.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(groupIds) : new Set());
  };

  const handleDispatch = () => {
    if (selected.size === 0) return;
    onDispatchGroup([...selected]);
  };

  const hasExpress = group.garments.some((g) => g.express);
  const urgency = deliveryUrgency(group.deliveryDate);
  const brovaCount = group.garments.filter((g) => g.garment_type === "brova").length;
  const finalCount = group.garments.filter((g) => g.garment_type === "final").length;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden border-l-4",
        hasExpress ? "border-l-orange-500" : "border-l-primary/40",
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/20 border-b">
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={(checked) => toggleAll(!!checked)}
          aria-label={`Select all garments in order ${group.orderId}`}
        />
        <button
          type="button"
          className="flex-1 flex items-center gap-3 text-left min-w-0"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          )}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Hash className="w-3 h-3 text-muted-foreground" />
            <span className="font-bold text-sm">{group.orderId}</span>
            {group.invoiceNumber != null && (
              <span className="text-xs font-bold text-primary/70 ml-1">
                Inv {group.invoiceNumber}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-bold truncate">
              {group.customerName ?? "Unknown"}
            </span>
          </div>
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {brovaCount > 0 && (
            <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 font-black">
              {brovaCount} brova
            </Badge>
          )}
          {finalCount > 0 && (
            <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 font-black">
              {finalCount} final
            </Badge>
          )}
          {hasExpress && <ExpressBadge />}
          {group.deliveryDate && (
            <span className={cn("text-xs font-medium rounded px-1", urgency.className)}>
              {formatDate(group.deliveryDate)}
              {urgency.label && <span className="ml-1 font-bold">{urgency.label}</span>}
            </span>
          )}
          <Button
            size="sm"
            onClick={handleDispatch}
            disabled={isPending || selected.size === 0}
            className="text-xs h-8"
          >
            <Truck className="w-3 h-3 mr-1" />
            Dispatch
            {selected.size > 0 && selected.size < groupIds.length
              ? ` (${selected.size})`
              : ""}
          </Button>
        </div>
      </div>

      {/* Garments */}
      {expanded && (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/10">
              <TableHead className="w-10" />
              <TableHead className="w-20">Type</TableHead>
              <TableHead>Garment</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="w-24">Express</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.garments.map((g) => {
              const isSelected = selected.has(g.id);
              return (
                <TableRow
                  key={g.id}
                  className={cn(
                    g.express && "bg-orange-50/60",
                    isSelected && "bg-primary/5",
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => toggleOne(g.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <GarmentTypeBadge type={g.garment_type ?? "final"} />
                  </TableCell>
                  <TableCell className="font-mono font-bold text-sm">
                    <div className="flex items-center gap-1">
                      <span>{g.garment_id}</span>
                      <AlterationBadge tripNumber={g.trip_number} garmentType={g.garment_type} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={g.piece_stage} />
                  </TableCell>
                  <TableCell>{g.express && <ExpressBadge />}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function InTransitTable({ garments }: { garments: WorkshopGarment[] }) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-20">Type</TableHead>
            <TableHead>Garment</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Order</TableHead>
            <TableHead className="w-24">Express</TableHead>
            <TableHead>Delivery</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {garments.map((g) => {
            const urgency = deliveryUrgency(g.delivery_date_order);
            return (
              <TableRow
                key={g.id}
                className={cn(g.express && "bg-orange-50/60")}
              >
                <TableCell>
                  <GarmentTypeBadge type={g.garment_type ?? "final"} />
                </TableCell>
                <TableCell className="font-mono font-bold text-sm">
                  <div className="flex items-center gap-1">
                    <span>{g.garment_id}</span>
                    <AlterationBadge tripNumber={g.trip_number} garmentType={g.garment_type} />
                  </div>
                </TableCell>
                <TableCell className="text-sm">{g.customer_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{g.order_id}</TableCell>
                <TableCell>
                  {g.express && <ExpressBadge />}
                </TableCell>
                <TableCell>
                  {g.delivery_date_order ? (
                    <span className={cn("text-xs font-medium rounded", urgency.className)}>
                      {formatDate(g.delivery_date_order)}
                      {urgency.label && <span className="ml-1 font-bold">{urgency.label}</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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

const HISTORY_PERIODS: readonly HistoryPeriod[] = ['today', 'week', 'month'] as const;
const PERIOD_LABELS: Record<HistoryPeriod, string> = { today: 'Today', week: 'This Week', month: 'This Month' };

function PeriodPillSwitcher({ period, onChange }: { period: HistoryPeriod; onChange: (p: HistoryPeriod) => void }) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const idx = HISTORY_PERIODS.indexOf(period);
      const btn = buttonsRef.current[idx];
      if (btn) {
        setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [period]);

  return (
    <div className="relative inline-flex items-center border-2 rounded-lg p-0.5">
      {indicator && (
        <div
          className="absolute top-0.5 bottom-0.5 bg-primary rounded-md shadow-sm transition-all duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {HISTORY_PERIODS.map((p, i) => (
        <button
          key={p}
          ref={(el) => { buttonsRef.current[i] = el; }}
          onClick={() => onChange(p)}
          className={cn(
            'relative z-10 text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-md transition-colors duration-300 whitespace-nowrap',
            period === p ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

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
        <PeriodPillSwitcher period={period} onChange={setPeriod} />

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
        <div className="rounded-xl border bg-card overflow-hidden print:border-0 print:shadow-none">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
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
                      <div className="text-xs font-bold">{d.toLocaleDateString()}</div>
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
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function DispatchPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();
  const dispatchMut = useDispatchGarments();
  const isMobile = useIsMobile();

  // Ready garments at workshop — ready_for_dispatch (passed QC) or brova_trialed (accepted, returning with order)
  const DISPATCH_STAGES = new Set(["ready_for_dispatch", "brova_trialed"]);
  const readyGarments = useMemo(
    () => allGarments.filter(
      (g) => g.location === "workshop" && DISPATCH_STAGES.has(g.piece_stage ?? ""),
    ),
    [allGarments],
  );

  // Group by order for partial-dispatch UI (mirrors POS dispatch page).
  const readyGroups = useMemo(() => groupReadyByOrder(readyGarments), [readyGarments]);

  // In transit garments
  const inTransitGarments = useMemo(
    () => allGarments.filter((g) => g.location === "transit_to_shop"),
    [allGarments],
  );

  const handleDispatchGroup = async (ids: string[]) => {
    if (ids.length === 0) return;
    await dispatchMut.mutateAsync(ids);
  };

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
                  onDispatchGroup={handleDispatchGroup}
                  isPending={dispatchMut.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── HISTORY — dispatched workshop → shop ── */}
        <TabsContent value="history">
          <DispatchHistoryTab />
        </TabsContent>

        {/* ── IN TRANSIT — garment level, read-only ── */}
        <TabsContent value="transit">
          {inTransitGarments.length === 0 ? (
            <EmptyState icon={Truck} message="Nothing in transit" />
          ) : isMobile ? (
            <div className="space-y-2">
              {inTransitGarments.map((g) => (
                <GarmentCard
                  key={g.id}
                  garment={g}
                  showPipeline={false}
                  hideStage
                />
              ))}
            </div>
          ) : (
            <InTransitTable garments={inTransitGarments} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
