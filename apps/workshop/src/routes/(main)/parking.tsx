import React, { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  useWorkshopGarments,
  useBrovaPlans,
  useBrovaStatus,
} from "@/hooks/useWorkshopGarments";
import {
  useSendToScheduler,
} from "@/hooks/useGarmentMutations";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { PageHeader, GarmentTypeBadge, LoadingSkeleton } from "@/components/shared/PageShell";
import { Button } from "@repo/ui/button";
import { Checkbox } from "@repo/ui/checkbox";
import { Badge } from "@repo/ui/badge";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterChip, FilterChipGroup } from "@/components/shared/FilterChip";
import { matchesGarmentSearch } from "@/lib/garment-search";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import {
  Table,
  TableContainer,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/shared/table";
import { cn, formatDate, getDeliveryUrgency } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  ParkingSquare,
  Clock,
  RotateCcw,
  Scissors,
  Unlock,
  Package,
  Home,
  Droplets,
  Zap,
  Loader2,
} from "lucide-react";
import type { WorkshopGarment } from "@repo/database";

function AltBadge({ trip }: { trip: number }) {
  return (
    <Badge
      variant="outline"
      className="border-transparent bg-[var(--status-warn-bg)] text-[var(--status-warn)] font-medium text-xs"
    >
      Alt {trip - 1}
    </Badge>
  );
}

function AltOutBadge({ trip }: { trip: number }) {
  return (
    <Badge
      variant="outline"
      className="border-transparent bg-[var(--status-warn-bg)] text-[var(--status-warn)] font-medium text-xs"
    >
      {trip >= 2 ? `Alt out ${trip - 1}` : "Alt out"}
    </Badge>
  );
}

// URL is the source of truth for the search box and the Returns sub-filter.
// Defaults (empty search, "all" returns) are omitted to keep a bare URL.
type ParkingSearch = { q?: string; returns?: "express" };

export const Route = createFileRoute("/(main)/parking")({
  component: ParkingPage,
  head: () => ({ meta: [{ title: "Parking" }] }),
  validateSearch: (raw: Record<string, unknown>): ParkingSearch => ({
    q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
    returns: raw.returns === "express" ? "express" : undefined,
  }),
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
  showAlt,
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
  showAlt?: boolean;
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
          <span className="font-mono text-base">
            {garment.garment_id ?? garment.id.slice(0, 8)}
          </span>
          {((!hideExpress && garment.express) || garment.soaking) && (
            <div className="flex items-center gap-1">
              {!hideExpress && garment.express && <ExpressBadge />}
              {garment.soaking && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-muted px-2 py-0.5 rounded-md">
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
      {showAlt && (
        <TableCell className="px-3 py-3">
          <div className="flex flex-col gap-1 items-start">
            {garment.garment_type === "alteration" ? (
              <AltOutBadge trip={garment.trip_number ?? 1} />
            ) : (garment.trip_number ?? 1) >= 2 ? (
              <AltBadge trip={garment.trip_number ?? 1} />
            ) : null}
          </div>
        </TableCell>
      )}
      <TableCell className="px-3 py-3 text-sm">
        <div className="flex flex-col gap-0.5 max-w-[180px]">
          <span className="text-base tracking-tight truncate" title={garment.customer_name ?? undefined}>{garment.customer_name ?? "-"}</span>
          {garment.customer_mobile && (
            <span className="text-sm font-mono text-muted-foreground">
              {garment.customer_mobile}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3 font-mono">
        <div className="flex flex-col gap-0.5">
          <span className="text-base">#{garment.order_id}</span>
          {garment.invoice_number && (
            <span className="text-sm text-muted-foreground">
              INV-{garment.invoice_number}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-3">
        <BrandBadge brand={garment.order_brand} />
      </TableCell>
      <TableCell className="px-3 py-3 text-center">
        <div className="flex flex-col items-center gap-1">
          {garment.delivery_date_order ? (
            <span
              className={cn(
                "text-sm font-medium tabular-nums inline-flex items-center gap-1",
                urgency.text,
              )}
            >
              <Clock className="w-3 h-3" />
              {formatDate(garment.delivery_date_order)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          )}
          {garment.home_delivery && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-muted px-2 py-0.5 rounded-md">
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
              className="text-xs h-7"
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
  showAlt,
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
  showAlt?: boolean;
  readOnly?: boolean;
  hideExpress?: boolean;
}) {
  const allSelected =
    !readOnly &&
    garments.length > 0 &&
    garments.every((g) => selectedIds.has(g.id));

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
            {!readOnly && (
              <TableHead className="w-10 px-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => {
                    for (const g of garments) onToggle(g.id, !!c);
                  }}
                  className="size-4"
                />
              </TableHead>
            )}
            <TableHead className="w-[100px]">Garment</TableHead>
            {showType && <TableHead className="w-[80px]">Type</TableHead>}
            {showAlt && <TableHead className="w-[100px]">Alt</TableHead>}
            <TableHead className="w-[170px]">Customer</TableHead>
            <TableHead className="w-[100px]">Order / Invoice</TableHead>
            <TableHead className="w-[80px]">Brand</TableHead>
            <TableHead
              className={cn("w-[130px]", readOnly ? "" : "text-center")}
            >
              Delivery
            </TableHead>
            {!readOnly && (
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            )}
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
              showAlt={showAlt}
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

function Section({
  title,
  icon: Icon,
  count,
  emptyLabel,
  children,
}: {
  title: string;
  icon: LucideIcon;
  count: number;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  if (count === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border bg-card text-sm">
        <Icon className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        <span className="font-medium text-muted-foreground">{title}</span>
        <span className="text-muted-foreground/70 text-xs ml-auto">
          {emptyLabel ?? "Empty"}
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-3 mt-5">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-medium">{title}</h2>
        <Badge variant="secondary" className="text-xs font-medium">
          {count}
        </Badge>
      </div>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ParkingPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();

  // ── Data slices ──────────────────────────────────────────────────────────
  // Parking active/schedulable garments (excludes locked finals).
  const parked = useMemo(
    () =>
      allGarments.filter(
        (g) =>
          g.location === "workshop" &&
          !g.in_production &&
          g.piece_stage !== "waiting_for_acceptance",
      ),
    [allGarments],
  );
  // Alteration-order garments (garment_type='alteration') get their own section
  // regardless of trip — they don't share the brova/final/returns flow.
  const alterationOutGarments = useMemo(
    () => parked.filter((g) => g.garment_type === "alteration"),
    [parked],
  );
  const workOrderParked = useMemo(
    () => parked.filter((g) => g.garment_type !== "alteration"),
    [parked],
  );
  const trip1 = useMemo(
    () => workOrderParked.filter((g) => (g.trip_number ?? 1) === 1),
    [workOrderParked],
  );
  const returnsGarments = useMemo(
    () =>
      workOrderParked.filter(
        (g) => (g.trip_number ?? 1) > 1 && g.feedback_status !== "accepted",
      ),
    [workOrderParked],
  );

  // Finals still locked at waiting_for_acceptance (trip 1).
  const waitingFinals = useMemo(
    () =>
      allGarments.filter(
        (g) =>
          g.location === "workshop" &&
          !g.in_production &&
          g.garment_type === "final" &&
          g.piece_stage === "waiting_for_acceptance" &&
          (g.trip_number ?? 1) === 1,
      ),
    [allGarments],
  );
  const waitingFinalOrderIds = useMemo(
    () => [...new Set(waitingFinals.map((g) => g.order_id))],
    [waitingFinals],
  );
  const { data: waitingBrovaStatus = {} } =
    useBrovaStatus(waitingFinalOrderIds);
  const isBrovaApprovedForOrder = useMemo(
    () => (orderId: number) => (waitingBrovaStatus[orderId]?.accepted ?? 0) > 0,
    [waitingBrovaStatus],
  );

  // Finals still parked, split by brova acceptance.
  const finalsNotYetApprovedGarments = useMemo(
    () => waitingFinals.filter((g) => !isBrovaApprovedForOrder(g.order_id)),
    [waitingFinals, isBrovaApprovedForOrder],
  );
  const customerApprovedLockedFinals = useMemo(
    () => waitingFinals.filter((g) => isBrovaApprovedForOrder(g.order_id)),
    [waitingFinals, isBrovaApprovedForOrder],
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
    () =>
      new Set(
        allGarments
          .filter((g) => g.garment_type === "brova")
          .map((g) => g.order_id),
      ),
    [allGarments],
  );
  const finalOrderIdsNeedingLookup = useMemo(
    () =>
      [...new Set(releasedFinals.map((g) => g.order_id))].filter(
        (id) => !brovaOrderIdSet.has(id),
      ),
    [releasedFinals, brovaOrderIdSet],
  );
  const { data: brovaPlansMap = {} } = useBrovaPlans(
    finalOrderIdsNeedingLookup,
  );
  const hadBrova = useMemo(
    () => (orderId: number) =>
      brovaOrderIdSet.has(orderId) || !!brovaPlansMap[orderId],
    [brovaOrderIdSet, brovaPlansMap],
  );

  // Express: express brovas + express finals in orders with NO brova (no plan to inherit).
  const expressGarments = useMemo(
    () =>
      trip1.filter(
        (g) =>
          g.express && (g.garment_type === "brova" || !hadBrova(g.order_id)),
      ),
    [trip1, hadBrova],
  );
  // Brova: non-express brovas
  const brovaGarments = useMemo(
    () => trip1.filter((g) => !g.express && g.garment_type === "brova"),
    [trip1],
  );
  // Customer Approved (released): finals already out of waiting_for_acceptance.
  const customerApprovedSchedulableGarments = useMemo(
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
          if (a.garment_type === "brova" && b.garment_type !== "brova")
            return -1;
          if (a.garment_type !== "brova" && b.garment_type === "brova")
            return 1;
          return 0;
        }),
      )
      .flat();
  };

  const sortedExpress = groupByOrderSorted(expressGarments);
  const sortedBrova = groupByOrderSorted(brovaGarments);
  const sortedAlterationOut = groupByOrderSorted(alterationOutGarments);
  const sortedFinalsNotYetApproved = groupByOrderSorted(
    finalsNotYetApprovedGarments,
  );
  const sortedCustomerApprovedLocked = groupByOrderSorted(
    customerApprovedLockedFinals,
  );
  const sortedAllSchedulableFinals = groupByOrderSorted([
    ...directFinalsGarments,
    ...customerApprovedSchedulableGarments,
  ]);

  // ── Search & Returns filter (URL is the source of truth) ───────────────────
  const sp = Route.useSearch();
  const search = sp.q ?? "";
  const returnFilter = sp.returns ?? "all";
  const navigate = Route.useNavigate();
  const setSearch = (value: string) =>
    navigate({ search: (prev) => ({ ...prev, q: value || undefined }), replace: true });
  const setReturnFilter = (value: string) =>
    navigate({ search: (prev) => ({ ...prev, returns: value === "express" ? "express" : undefined }), replace: true });
  const searchFilter = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    return (g: WorkshopGarment) => matchesGarmentSearch(g, q);
  }, [search]);
  const applySearch = <T extends WorkshopGarment>(arr: T[]) =>
    searchFilter ? arr.filter(searchFilter) : arr;

  const returnChips = [
    { label: "All", value: returnsGarments.length, key: "all" },
    {
      label: "Express",
      value: returnsGarments.filter((g) => g.express).length,
      key: "express",
    },
  ];
  const filteredReturns = applySearch(
    returnFilter === "express"
      ? returnsGarments.filter((g) => g.express)
      : returnsGarments,
  );

  // ── Scheduler selection (all schedulable sections) ────────────────────────
  const sendToSchedulerMut = useSendToScheduler();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string, checked: boolean) =>
    setSel((prev) => {
      const n = new Set(prev);
      checked ? n.add(id) : n.delete(id);
      return n;
    });
  const removeFromSelection = (ids: string[]) =>
    setSel((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  const handleSendToScheduler = async (ids: string[]) => {
    if (ids.length === 0) return;
    await sendToSchedulerMut.mutateAsync(ids);
    removeFromSelection(ids);
  };
  const schedulePendingIds = useMemo(
    () =>
      sendToSchedulerMut.isPending && sendToSchedulerMut.variables
        ? new Set(sendToSchedulerMut.variables)
        : new Set<string>(),
    [sendToSchedulerMut.isPending, sendToSchedulerMut.variables],
  );
  const isSchedulePending = (id: string) => schedulePendingIds.has(id);

  // ── Select all (schedulable + releasable rows) ────────────────────────────
  const searchedExpress = applySearch(sortedExpress);
  const searchedBrova = applySearch(sortedBrova);
  const searchedAlterationOut = applySearch(sortedAlterationOut);
  const searchedFinalsNotYetApproved = applySearch(sortedFinalsNotYetApproved);
  const searchedCustomerApprovedLocked = applySearch(
    sortedCustomerApprovedLocked,
  );
  const searchedAllSchedulableFinals = applySearch(sortedAllSchedulableFinals);
  const allSelectable = [
    ...searchedExpress,
    ...searchedBrova,
    ...searchedAlterationOut,
    ...filteredReturns,
    ...searchedAllSchedulableFinals,
    ...searchedCustomerApprovedLocked,
  ];
  const allSelected =
    allSelectable.length > 0 && allSelectable.every((g) => sel.has(g.id));
  const selectAll = () => setSel(new Set(allSelectable.map((g) => g.id)));
  const clearAll = () => setSel(new Set());

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-28 space-y-2">
      <PageHeader
        icon={ParkingSquare}
        title="Order Parking"
      />

      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Customer, order #, invoice, phone…"
          className="max-w-sm flex-1"
        />
        {allSelectable.length > 0 && (
          <Button
            variant={allSelected ? "secondary" : "outline"}
            size="sm"
            onClick={allSelected ? clearAll : selectAll}
            className="shrink-0"
          >
            {allSelected
              ? `Deselect All (${sel.size})`
              : `Select All (${allSelectable.length})`}
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* ── EXPRESS ── */}
          <Section
            title="Express"
            icon={Zap}
            count={searchedExpress.length}
            emptyLabel="No express in parking"
          >
            <ParkingGarmentTable
              garments={searchedExpress}
              selectedIds={sel}
              onToggle={toggle}
              onAction={(g) => handleSendToScheduler([g.id])}
              actionLabel="Schedule"
              getActionVariant={() => "green"}
              isActionPending={isSchedulePending}
              showType
              hideExpress
            />
          </Section>

          {/* ── BROVA ── */}
          <Section
            title="Brova"
            icon={Package}
            count={searchedBrova.length}
            emptyLabel="No brova in parking"
          >
            <ParkingGarmentTable
              garments={searchedBrova}
              selectedIds={sel}
              onToggle={toggle}
              onAction={(g) => handleSendToScheduler([g.id])}
              actionLabel="Schedule"
              getActionVariant={() => "green"}
              isActionPending={isSchedulePending}
            />
          </Section>

          {/* ── ALTERATION ORDERS (OUT) ── */}
          <Section
            title="Alteration orders (out)"
            icon={Scissors}
            count={searchedAlterationOut.length}
            emptyLabel="No alteration orders in parking"
          >
            <ParkingGarmentTable
              garments={searchedAlterationOut}
              selectedIds={sel}
              onToggle={toggle}
              onAction={(g) => handleSendToScheduler([g.id])}
              actionLabel="Schedule"
              getActionVariant={() => "green"}
              isActionPending={isSchedulePending}
              showAlt
            />
          </Section>

          {/* ── RETURNS ── */}
          <Section
            title="Returns"
            icon={RotateCcw}
            count={returnsGarments.length}
            emptyLabel="No returns in parking"
          >
            <FilterChipGroup className="mb-3">
              {returnChips.map((c) => (
                <FilterChip
                  key={c.key}
                  active={returnFilter === c.key}
                  onClick={() => setReturnFilter(c.key)}
                  count={c.value}
                >
                  {c.label}
                </FilterChip>
              ))}
            </FilterChipGroup>
            {filteredReturns.length === 0 ? (
              <p className="text-sm text-muted-foreground px-3 py-2">
                No returns match this filter
              </p>
            ) : (
              <TableContainer>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
                      <TableHead className="w-10 px-3">
                        <Checkbox
                          checked={
                            filteredReturns.length > 0 &&
                            filteredReturns.every((g) => sel.has(g.id))
                          }
                          onCheckedChange={(c) => {
                            for (const g of filteredReturns) toggle(g.id, !!c);
                          }}
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
                      <TableHead className="w-[100px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReturns.map((g) => {
                      const gUrgency = getDeliveryUrgency(
                        g.delivery_date_order,
                      );
                      return (
                        <TableRow key={g.id}>
                          <TableCell className="px-3 py-3">
                            <Checkbox
                              checked={sel.has(g.id)}
                              onCheckedChange={(c) => toggle(g.id, !!c)}
                              className="size-4"
                            />
                          </TableCell>
                          <TableCell>
                            <GarmentTypeBadge
                              type={g.garment_type ?? "final"}
                            />
                          </TableCell>
                          <TableCell className="px-3 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-base">
                                {g.garment_id ?? g.id.slice(0, 8)}
                              </span>
                              {(g.express || g.soaking) && (
                                <div className="flex items-center gap-1">
                                  {g.express && <ExpressBadge />}
                                  {g.soaking && (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-muted px-2 py-0.5 rounded-md">
                                      <Droplets className="w-3 h-3" /> Soak
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex flex-col gap-0.5 max-w-[180px]">
                              <span className="text-base tracking-tight truncate" title={g.customer_name ?? undefined}>
                                {g.customer_name ?? "-"}
                              </span>
                              {g.customer_mobile && (
                                <span className="text-sm font-mono text-muted-foreground">
                                  {g.customer_mobile}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {g.invoice_number ? `#${g.invoice_number}` : "-"}
                          </TableCell>
                          <TableCell>
                            {(g.trip_number ?? 1) >= 2 && (
                              <AltBadge trip={g.trip_number ?? 1} />
                            )}
                          </TableCell>
                          <TableCell className="px-3 py-3">
                            <BrandBadge brand={g.order_brand} />
                          </TableCell>
                          <TableCell className="px-3 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {g.delivery_date_order ? (
                                <span
                                  className={cn(
                                    "text-sm font-medium tabular-nums inline-flex items-center gap-1",
                                    gUrgency.text,
                                  )}
                                >
                                  <Clock className="w-3 h-3" />
                                  {formatDate(g.delivery_date_order)}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  -
                                </span>
                              )}
                              {g.home_delivery && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-muted px-2 py-0.5 rounded-md">
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
                              disabled={isSchedulePending(g.id)}
                              className="text-xs h-7"
                            >
                              {isSchedulePending(g.id) ? (
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

          {/* ── FINALS (schedulable — direct + approved released) ── */}
          <Section
            title="Finals"
            icon={Package}
            count={searchedAllSchedulableFinals.length}
            emptyLabel="No finals ready to schedule"
          >
            <ParkingGarmentTable
              garments={searchedAllSchedulableFinals}
              selectedIds={sel}
              onToggle={toggle}
              onAction={(g) => handleSendToScheduler([g.id])}
              actionLabel="Schedule"
              getActionVariant={() => "green"}
              isActionPending={isSchedulePending}
            />
          </Section>

          {/* ── CUSTOMER APPROVED (brova accepted, finals ready to schedule) ── */}
          <Section
            title="Customer approved"
            icon={Unlock}
            count={searchedCustomerApprovedLocked.length}
            emptyLabel="No customer approved finals"
          >
            <ParkingGarmentTable
              garments={searchedCustomerApprovedLocked}
              selectedIds={sel}
              onToggle={toggle}
              onAction={(g) => handleSendToScheduler([g.id])}
              actionLabel="Schedule"
              getActionVariant={() => "green"}
              isActionPending={isSchedulePending}
            />
          </Section>

          {/* ── FINALS NOT YET APPROVED (brova not done, read-only) ── */}
          <Section
            title="Finals not yet approved"
            icon={Clock}
            count={searchedFinalsNotYetApproved.length}
            emptyLabel="No finals awaiting approval"
          >
            <ParkingGarmentTable
              garments={searchedFinalsNotYetApproved}
              readOnly
            />
          </Section>
        </>
      )}

      <BatchActionBar count={sel.size} onClear={() => setSel(new Set())}>
        <Button
          size="sm"
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
