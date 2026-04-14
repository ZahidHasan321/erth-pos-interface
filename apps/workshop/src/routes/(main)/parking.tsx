import React, { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments, useBrovaPlans } from "@/hooks/useWorkshopGarments";
import { useSendToScheduler } from "@/hooks/useGarmentMutations";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { PageHeader, GarmentTypeBadge } from "@/components/shared/PageShell";
import { Button } from "@repo/ui/button";
import { Checkbox } from "@repo/ui/checkbox";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { Table, TableContainer, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@repo/ui/table";
import { cn, formatDate, getDeliveryUrgency } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  ParkingSquare, Clock, RotateCcw, Unlock, Package, Home, Droplets, Zap, Search, Loader2,
} from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

function AltBadge({ trip }: { trip: number }) {
  return (
    <Badge className="bg-orange-500 text-white font-semibold text-xs uppercase tracking-wide border-0">
      Alt {trip - 1}
    </Badge>
  );
}

export const Route = createFileRoute("/(main)/parking")({
  component: ParkingPage,
  head: () => ({ meta: [{ title: "Parking" }] }),
});

// ── Garment row ───────────────────────────────────────────────────────────────

type ActionVariant = "outline" | "green" | "amber" | "red";

function ParkingGarmentRow({
  garment,
  selected,
  onToggle,
  onAction,
  actionLabel,
  actionVariant = "outline",
  actionPending,
  showType,
  readOnly,
  hideExpress,
}: {
  garment: WorkshopGarment;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onAction: () => void;
  actionLabel: string;
  actionVariant?: ActionVariant;
  actionPending: boolean;
  showType?: boolean;
  readOnly?: boolean;
  hideExpress?: boolean;
}) {
  const urgency = getDeliveryUrgency(garment.delivery_date_order);

  return (
    <TableRow>
      {!readOnly && (
        <TableCell className="px-3 py-3">
          <Checkbox
            checked={selected}
            onCheckedChange={(c) => onToggle(!!c)}
            className="size-4"
          />
        </TableCell>
      )}
      <TableCell className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-sm font-bold">{garment.garment_id ?? garment.id.slice(0, 8)}</span>
          {((!hideExpress && garment.express) || garment.soaking) && (
            <div className="flex items-center gap-1">
              {!hideExpress && garment.express && <ExpressBadge />}
              {garment.soaking && (
                <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full">
                  <Droplets className="w-3 h-3" /> Soak
                </span>
              )}
            </div>
          )}
        </div>
      </TableCell>
      {showType && (
        <TableCell className="px-3 py-3">
          <GarmentTypeBadge type={garment.garment_type ?? "final"} />
        </TableCell>
      )}
      <TableCell className="px-3 py-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{garment.customer_name ?? "—"}</span>
          {garment.customer_mobile && (
            <span className="text-xs font-mono text-muted-foreground">{garment.customer_mobile}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3 font-mono">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold">#{garment.order_id}</span>
          {garment.invoice_number && (
            <span className="text-xs text-muted-foreground">INV-{garment.invoice_number}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3">
        <BrandBadge brand={garment.order_brand} />
      </TableCell>
      <TableCell className="px-3 py-3 text-center">
        <div className="flex flex-col items-center gap-1">
          {garment.delivery_date_order ? (
            <span className={cn("text-xs font-bold tabular-nums inline-flex items-center gap-1", urgency.text)}>
              <Clock className="w-3 h-3" />
              {formatDate(garment.delivery_date_order)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {garment.home_delivery && (
            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-violet-600 px-2 py-0.5 rounded-full">
              <Home className="w-3 h-3" /> Home
            </span>
          )}
        </div>
      </TableCell>
      {!readOnly && (
        <TableCell className="px-3 py-3">
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              variant={actionVariant === "outline" ? "outline" : "default"}
              onClick={onAction}
              disabled={actionPending}
              className={cn(
                "text-xs h-7",
                actionVariant === "green" && "bg-green-600 hover:bg-green-700",
                actionVariant === "amber" && "bg-amber-600 hover:bg-amber-700",
                actionVariant === "red" && "bg-red-600 hover:bg-red-700",
              )}
            >
              {actionPending ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : actionVariant === "green" ? (
                <Unlock className="w-3 h-3 mr-1" />
              ) : null}
              {actionLabel}
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

// ── Section table ─────────────────────────────────────────────────────────────

function ParkingGarmentTable({
  garments,
  selectedIds = new Set(),
  onToggle = () => {},
  onAction = () => {},
  actionLabel = "",
  getActionVariant,
  isActionPending = () => false,
  showType,
  readOnly,
  hideExpress,
}: {
  garments: WorkshopGarment[];
  selectedIds?: Set<string>;
  onToggle?: (id: string, checked: boolean) => void;
  onAction?: (g: WorkshopGarment) => void;
  actionLabel?: string;
  getActionVariant?: (g: WorkshopGarment) => ActionVariant;
  isActionPending?: (id: string) => boolean;
  showType?: boolean;
  readOnly?: boolean;
  hideExpress?: boolean;
}) {
  const allSelected = !readOnly && garments.length > 0 && garments.every((g) => selectedIds.has(g.id));

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
            {!readOnly && (
              <TableHead className="w-10 px-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => { for (const g of garments) onToggle(g.id, !!c); }}
                  className="size-4"
                />
              </TableHead>
            )}
            <TableHead className="w-[100px]">Garment</TableHead>
            {showType && <TableHead className="w-[80px]">Type</TableHead>}
            <TableHead className="w-[170px]">Customer</TableHead>
            <TableHead className="w-[100px]">Order / Invoice</TableHead>
            <TableHead className="w-[80px]">Brand</TableHead>
            <TableHead className={cn("w-[130px]", readOnly ? "" : "text-center")}>Delivery</TableHead>
            {!readOnly && <TableHead className="w-[120px] text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {garments.map((g) => (
            <ParkingGarmentRow
              key={g.id}
              garment={g}
              selected={selectedIds.has(g.id)}
              onToggle={(c) => onToggle(g.id, c)}
              onAction={() => onAction(g)}
              actionLabel={actionLabel}
              actionVariant={getActionVariant ? getActionVariant(g) : "outline"}
              actionPending={isActionPending(g.id)}
              showType={showType}
              readOnly={readOnly}
              hideExpress={hideExpress}
            />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-2xl">
      <Icon className="w-8 h-8 text-muted-foreground/30 mb-2" />
      <p className="font-semibold text-muted-foreground">{message}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  accent,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-base text-foreground">{title}</h2>
        <Badge variant="secondary" className={cn("text-xs", accent)}>
          {count}
        </Badge>
      </div>
      {children}
    </div>
  );
}

function FilterChips({
  chips,
  active,
  onFilter,
}: {
  chips: { label: string; value: number; key: string }[];
  active: string;
  onFilter: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => onFilter(c.key)}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors",
            active === c.key
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/60 text-muted-foreground hover:bg-muted",
          )}
        >
          {c.label}
          <span className={cn(
            "tabular-nums font-bold px-1.5 py-0.5 rounded-full text-[10px] leading-none",
            active === c.key
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-background text-foreground/60",
          )}>
            {c.value}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ParkingPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();

  // ── Data slices ──────────────────────────────────────────────────────────
  // Parking = active, schedulable garments at workshop. Finals locked on
  // brova approval are blocked — not schedulable — so we exclude them.
  const parked = useMemo(
    () => allGarments.filter(
      (g) =>
        g.location === "workshop" &&
        !g.in_production &&
        g.piece_stage !== "waiting_for_acceptance",
    ),
    [allGarments],
  );
  const trip1 = useMemo(() => parked.filter((g) => (g.trip_number ?? 1) === 1), [parked]);
  const returnsGarments = useMemo(
    () => parked.filter((g) => (g.trip_number ?? 1) > 1 && g.feedback_status !== "accepted"),
    [parked],
  );

  // Released finals (non-express AND express both allowed here — we split below).
  // waiting_for_acceptance is already excluded from `parked`.
  const releasedFinals = useMemo(
    () => trip1.filter((g) => g.garment_type === "final"),
    [trip1],
  );

  // Any brova currently in the workshop ecosystem proves the order had a brova.
  // allGarments covers workshop + transit_to_* + lost_in_transit, not shop. For
  // brovas already fully dispatched back & trialed (at shop) we fall back to
  // the DB lookup via useBrovaPlans.
  const brovaOrderIdSet = useMemo(
    () => new Set(allGarments.filter((g) => g.garment_type === "brova").map((g) => g.order_id)),
    [allGarments],
  );
  const finalOrderIdsNeedingLookup = useMemo(
    () => [...new Set(releasedFinals.map((g) => g.order_id))].filter((id) => !brovaOrderIdSet.has(id)),
    [releasedFinals, brovaOrderIdSet],
  );
  const { data: brovaPlansMap = {} } = useBrovaPlans(finalOrderIdsNeedingLookup);
  const hadBrova = useMemo(
    () => (orderId: number) => brovaOrderIdSet.has(orderId) || !!brovaPlansMap[orderId],
    [brovaOrderIdSet, brovaPlansMap],
  );

  // Express: express brovas + express finals in orders with NO brova (no plan to inherit).
  const expressGarments = useMemo(
    () => trip1.filter(
      (g) => g.express && (g.garment_type === "brova" || !hadBrova(g.order_id)),
    ),
    [trip1, hadBrova],
  );
  // Brova: non-express brovas
  const brovaGarments = useMemo(
    () => trip1.filter((g) => !g.express && g.garment_type === "brova"),
    [trip1],
  );
  // Customer Approved: any released final (express or not) whose order had brova.
  const customerApprovedGarments = useMemo(
    () => releasedFinals.filter((g) => hadBrova(g.order_id)),
    [releasedFinals, hadBrova],
  );
  // Finals: non-express released finals in orders with no brova — direct finals.
  const directFinalsGarments = useMemo(
    () => releasedFinals.filter((g) => !g.express && !hadBrova(g.order_id)),
    [releasedFinals, hadBrova],
  );
  // Group by order, sort groups by delivery date, brovas before finals within group, then flatten.
  const groupByOrderSorted = (arr: WorkshopGarment[]): WorkshopGarment[] => {
    const groups = new Map<number, WorkshopGarment[]>();
    for (const g of arr) {
      if (!groups.has(g.order_id)) groups.set(g.order_id, []);
      groups.get(g.order_id)!.push(g);
    }
    return [...groups.values()]
      .sort((a, b) => {
        const da = a[0]?.delivery_date_order;
        const db = b[0]?.delivery_date_order;
        if (da && db) return da.localeCompare(db);
        return da ? -1 : db ? 1 : 0;
      })
      .map((group) =>
        group.sort((a, b) => {
          if (a.garment_type === "brova" && b.garment_type !== "brova") return -1;
          if (a.garment_type !== "brova" && b.garment_type === "brova") return 1;
          return 0;
        }),
      )
      .flat();
  };

  const sortedExpress = groupByOrderSorted(expressGarments);
  const sortedBrova = groupByOrderSorted(brovaGarments);
  const sortedCustomerApproved = groupByOrderSorted(customerApprovedGarments);
  const sortedDirectFinals = groupByOrderSorted(directFinalsGarments);

  // ── Search ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const searchFilter = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return (g: WorkshopGarment) =>
      (g.customer_name ?? "").toLowerCase().includes(q) ||
      String(g.order_id).includes(q) ||
      (g.invoice_number != null && String(g.invoice_number).includes(q)) ||
      (g.customer_mobile ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ||
      (g.garment_id ?? "").toLowerCase().includes(q);
  }, [search]);
  const applySearch = <T extends WorkshopGarment>(arr: T[]) =>
    searchFilter ? arr.filter(searchFilter) : arr;

  // ── Returns filter ────────────────────────────────────────────────────────
  const [returnFilter, setReturnFilter] = useState("all");
  const returnChips = [
    { label: "All", value: returnsGarments.length, key: "all" },
    { label: "Express", value: returnsGarments.filter((g) => g.express).length, key: "express" },
  ];
  const filteredReturns = applySearch(
    returnFilter === "express" ? returnsGarments.filter((g) => g.express) : returnsGarments,
  );

  // ── Scheduler selection (all schedulable sections) ────────────────────────
  const sendToSchedulerMut = useSendToScheduler();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string, checked: boolean) =>
    setSel((prev) => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n; });
  const handleSendToScheduler = async (ids: string[]) => {
    await sendToSchedulerMut.mutateAsync(ids);
    setSel(new Set());
  };
  const schedulePendingIds = useMemo(
    () =>
      sendToSchedulerMut.isPending && sendToSchedulerMut.variables
        ? new Set(sendToSchedulerMut.variables)
        : new Set<string>(),
    [sendToSchedulerMut.isPending, sendToSchedulerMut.variables],
  );
  const isActionPending = (id: string) => schedulePendingIds.has(id);

  // ── Select all (schedulable sections only) ────────────────────────────────
  const searchedExpress = applySearch(sortedExpress);
  const searchedBrova = applySearch(sortedBrova);
  const searchedCustomerApproved = applySearch(sortedCustomerApproved);
  const searchedDirectFinals = applySearch(sortedDirectFinals);
  const allSchedulable = [
    ...searchedExpress,
    ...searchedBrova,
    ...filteredReturns,
    ...searchedDirectFinals,
    ...searchedCustomerApproved,
  ];
  const allSelected = allSchedulable.length > 0 && allSchedulable.every((g) => sel.has(g.id));
  const selectAll = () => setSel(new Set(allSchedulable.map((g) => g.id)));
  const clearAll = () => setSel(new Set());

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-28 space-y-8">
      <PageHeader
        icon={ParkingSquare}
        title="Order Parking"
        subtitle="Received orders awaiting scheduling"
      />

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Customer, order #, invoice, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {allSchedulable.length > 0 && (
          <Button
            variant={allSelected ? "secondary" : "outline"}
            size="sm"
            onClick={allSelected ? clearAll : selectAll}
            className="shrink-0"
          >
            {allSelected ? `Deselect All (${sel.size})` : `Select All (${allSchedulable.length})`}
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* ── EXPRESS ── */}
          <Section title="Express" icon={Zap} count={searchedExpress.length} accent="bg-orange-100 text-orange-700">
            {searchedExpress.length === 0 ? (
              <EmptyState icon={Zap} message="No express garments in parking" />
            ) : (
              <ParkingGarmentTable
                garments={searchedExpress}
                selectedIds={sel}
                onToggle={toggle}
                onAction={(g) => handleSendToScheduler([g.id])}
                actionLabel="Schedule"
                getActionVariant={() => "green"}
                isActionPending={isActionPending}
                showType
                hideExpress
              />
            )}
          </Section>

          {/* ── BROVA ── */}
          <Section title="Brova" icon={Package} count={searchedBrova.length} accent="bg-amber-100 text-amber-700">
            {searchedBrova.length === 0 ? (
              <EmptyState icon={Package} message="No brova garments in parking" />
            ) : (
              <ParkingGarmentTable
                garments={searchedBrova}
                selectedIds={sel}
                onToggle={toggle}
                onAction={(g) => handleSendToScheduler([g.id])}
                actionLabel="Schedule"
                getActionVariant={() => "green"}
                isActionPending={isActionPending}
              />
            )}
          </Section>

          {/* ── RETURNS ── */}
          <Section title="Returns" icon={RotateCcw} count={returnsGarments.length}>
            <FilterChips chips={returnChips} active={returnFilter} onFilter={setReturnFilter} />
            {filteredReturns.length === 0 ? (
              <EmptyState icon={RotateCcw} message={returnFilter === "all" ? "No returns in parking" : "No returns match this filter"} />
            ) : (
              <TableContainer>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
                      <TableHead className="w-10 px-3">
                        <Checkbox
                          checked={filteredReturns.length > 0 && filteredReturns.every((g) => sel.has(g.id))}
                          onCheckedChange={(c) => { for (const g of filteredReturns) toggle(g.id, !!c); }}
                          className="size-4"
                        />
                      </TableHead>
                      <TableHead className="w-[80px]">Type</TableHead>
                      <TableHead className="w-[100px]">Garment</TableHead>
                      <TableHead className="w-[170px]">Customer</TableHead>
                      <TableHead className="w-[90px]">Invoice</TableHead>
                      <TableHead className="w-[100px]">Alt</TableHead>
                      <TableHead className="w-[80px]">Brand</TableHead>
                      <TableHead className="w-[130px]">Delivery</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReturns.map((g) => {
                      const gUrgency = getDeliveryUrgency(g.delivery_date_order);
                      return (
                        <TableRow key={g.id}>
                          <TableCell className="px-3 py-3">
                            <Checkbox
                              checked={sel.has(g.id)}
                              onCheckedChange={(c) => toggle(g.id, !!c)}
                              className="size-4"
                            />
                          </TableCell>
                          <TableCell><GarmentTypeBadge type={g.garment_type ?? "final"} /></TableCell>
                          <TableCell className="px-3 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-sm font-bold">{g.garment_id ?? g.id.slice(0, 8)}</span>
                              {(g.express || g.soaking) && (
                                <div className="flex items-center gap-1">
                                  {g.express && <ExpressBadge />}
                                  {g.soaking && (
                                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full">
                                      <Droplets className="w-3 h-3" /> Soak
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold">{g.customer_name ?? "—"}</span>
                              {g.customer_mobile && (
                                <span className="text-xs font-mono text-muted-foreground">{g.customer_mobile}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{g.invoice_number ? `#${g.invoice_number}` : "—"}</TableCell>
                          <TableCell>{(g.trip_number ?? 1) >= 2 && <AltBadge trip={g.trip_number ?? 1} />}</TableCell>
                          <TableCell className="px-3 py-3">
                            <BrandBadge brand={g.order_brand} />
                          </TableCell>
                          <TableCell className="px-3 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {g.delivery_date_order ? (
                                <span className={cn("text-xs font-bold tabular-nums inline-flex items-center gap-1", gUrgency.text)}>
                                  <Clock className="w-3 h-3" />
                                  {formatDate(g.delivery_date_order)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                              {g.home_delivery && (
                                <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-violet-600 px-2 py-0.5 rounded-full">
                                  <Home className="w-3 h-3" /> Home
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right px-3 py-3">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleSendToScheduler([g.id])}
                              disabled={isActionPending(g.id)}
                              className="text-xs h-7 bg-green-600 hover:bg-green-700"
                            >
                              {isActionPending(g.id) ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Unlock className="w-3 h-3 mr-1" />
                              )}
                              Schedule
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Section>

          {/* ── FINALS (direct — no brova in order) ── */}
          {searchedDirectFinals.length > 0 && (
            <Section title="Finals" icon={Package} count={searchedDirectFinals.length} accent="bg-blue-100 text-blue-700">
              <ParkingGarmentTable
                garments={searchedDirectFinals}
                selectedIds={sel}
                onToggle={toggle}
                onAction={(g) => handleSendToScheduler([g.id])}
                actionLabel="Schedule"
                getActionVariant={() => "green"}
                isActionPending={isActionPending}
              />
            </Section>
          )}

          {/* ── CUSTOMER APPROVED (finals whose order had brova, express + non-express) ── */}
          <Section title="Customer Approved" icon={Unlock} count={searchedCustomerApproved.length} accent="bg-emerald-100 text-emerald-700">
            {searchedCustomerApproved.length === 0 ? (
              <EmptyState icon={Unlock} message="No customer approved finals in parking" />
            ) : (
              <ParkingGarmentTable
                garments={searchedCustomerApproved}
                selectedIds={sel}
                onToggle={toggle}
                onAction={(g) => handleSendToScheduler([g.id])}
                actionLabel="Schedule"
                getActionVariant={() => "green"}
                isActionPending={isActionPending}
              />
            )}
          </Section>

        </>
      )}

      <BatchActionBar count={sel.size} onClear={() => setSel(new Set())}>
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700"
          onClick={() => handleSendToScheduler([...sel])}
          disabled={sendToSchedulerMut.isPending}
        >
          {sendToSchedulerMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Unlock className="w-3.5 h-3.5 mr-1" />
          )}
          Send to Scheduler
        </Button>
      </BatchActionBar>

    </div>
  );
}
