import React, { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { useReceiveGarments, useReceiveAndStart, useMarkLostInTransit } from "@/hooks/useGarmentMutations";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import {
  PageHeader, EmptyState, LoadingSkeleton,
  GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { Button } from "@repo/ui/button";
import { Checkbox } from "@repo/ui/checkbox";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableContainer } from "@repo/ui/table";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { cn, formatDate, getDeliveryUrgency } from "@/lib/utils";
import type { WorkshopGarment } from "@repo/database";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Inbox, Clock, Package, AlertTriangle, CircleX, Zap, Home,
  Droplets, Search, Loader2, Scissors,
} from "lucide-react";

export const Route = createFileRoute("/(main)/receiving")({
  component: ReceivingPage,
  head: () => ({ meta: [{ title: "Receiving" }] }),
});

// ── Alt badge (trip - 1 for brova returns) ──────────────────────────────────

function AltBadge({ trip }: { trip: number }) {
  const alt = trip - 1;
  return (
    <Badge className="bg-orange-500 text-white font-semibold text-xs uppercase tracking-wide border-0">
      Alt {alt}
    </Badge>
  );
}

function AlterationOutBadge() {
  return (
    <Badge className="bg-amber-500 text-white font-semibold text-xs uppercase tracking-wide border-0">
      Alteration Out
    </Badge>
  );
}

// ── Garment table row ────────────────────────────────────────────────────────

type ActionVariant = "receive-start-lost" | "receive-start" | "receive-lost" | "receive-only" | "found";

function GarmentRow({
  garment,
  selected,
  onToggle,
  onReceive,
  onReceiveAndStart,
  onLost,
  receivePending,
  receiveStartPending,
  lostPending,
  actionVariant,
  showType,
  showAlt,
  showAlterationOut,
  hideExpress,
}: {
  garment: WorkshopGarment;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onReceive: () => void;
  onReceiveAndStart?: () => void;
  onLost?: () => void;
  receivePending: boolean;
  receiveStartPending: boolean;
  lostPending: boolean;
  actionVariant: ActionVariant;
  showType?: boolean;
  showAlt?: boolean;
  showAlterationOut?: boolean;
  hideExpress?: boolean;
}) {
  const urgency = getDeliveryUrgency(garment.delivery_date_order);
  const rowBusy = receivePending || receiveStartPending || lostPending;

  return (
    <TableRow className={cn(selected && "bg-primary/5")}>
      <TableCell className="px-3 py-3">
        <Checkbox
          checked={selected}
          onCheckedChange={(c) => onToggle(!!c)}
          aria-label={`Select ${garment.garment_id ?? garment.id.slice(0, 8)}`}
          className="size-4"
        />
      </TableCell>
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
      {showAlt && (
        <TableCell className="px-3 py-3">
          <div className="flex flex-col gap-1 items-start">
            {showAlterationOut && <AlterationOutBadge />}
            {(garment.trip_number ?? 1) >= 2 && <AltBadge trip={garment.trip_number ?? 1} />}
          </div>
        </TableCell>
      )}
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
      <TableCell className="px-3 py-3">
        <div className="flex items-center justify-end gap-1.5">
          {actionVariant === "found" ? (
            <Button size="sm" variant="outline" onClick={onReceive} disabled={rowBusy} className="text-xs h-7">
              {receivePending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Found — Receive
            </Button>
          ) : actionVariant === "receive-only" ? (
            <Button size="sm" variant="outline" onClick={onReceive} disabled={rowBusy} className="text-xs h-7">
              {receivePending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Receive
            </Button>
          ) : actionVariant === "receive-lost" ? (
            <>
              <Button size="sm" variant="outline" onClick={onReceive} disabled={rowBusy} className="text-xs h-7">
                {receivePending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Receive
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onLost}
                disabled={rowBusy}
                className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {lostPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                Lost
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onReceive} disabled={rowBusy} className="text-xs h-7">
                {receivePending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Receive
              </Button>
              <Button size="sm" onClick={onReceiveAndStart} disabled={rowBusy} className="text-xs h-7">
                {receiveStartPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Receive & Start
              </Button>
              {actionVariant === "receive-start-lost" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onLost}
                  disabled={rowBusy}
                  className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {lostPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                  Lost
                </Button>
              )}
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ── Section table ────────────────────────────────────────────────────────────

function SectionTable({
  garments,
  selectedIds,
  onToggle,
  onReceive,
  onReceiveAndStart,
  onLost,
  isReceivePending,
  isReceiveStartPending,
  isLostPending,
  actionVariant,
  showType,
  showAlt,
  showAlterationOut,
  hideExpress,
}: {
  garments: WorkshopGarment[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  onReceive: (id: string) => void;
  onReceiveAndStart?: (id: string) => void;
  onLost?: (id: string) => void;
  isReceivePending: (id: string) => boolean;
  isReceiveStartPending: (id: string) => boolean;
  isLostPending: (id: string) => boolean;
  actionVariant: ActionVariant | ((g: WorkshopGarment) => ActionVariant);
  showType?: boolean;
  showAlt?: boolean;
  showAlterationOut?: boolean;
  hideExpress?: boolean;
}) {
  const allSelected = garments.length > 0 && garments.every((g) => selectedIds.has(g.id));

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
            <TableHead className="w-10 px-3">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(c) => {
                  for (const g of garments) onToggle(g.id, !!c);
                }}
                aria-label="Select all"
                className="size-4"
              />
            </TableHead>
            <TableHead className="w-[100px]">Garment</TableHead>
            {showAlt && <TableHead className="w-[80px]">Alt</TableHead>}
            {showType && <TableHead className="w-[80px]">Type</TableHead>}
            <TableHead className="w-[170px]">Customer</TableHead>
            <TableHead className="w-[100px]">Order / Invoice</TableHead>
            <TableHead className="w-[80px]">Brand</TableHead>
            <TableHead className="w-[130px] text-center">Delivery</TableHead>
            <TableHead className="w-[260px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {garments.map((g) => (
            <GarmentRow
              key={g.id}
              garment={g}
              selected={selectedIds.has(g.id)}
              onToggle={(c) => onToggle(g.id, c)}
              onReceive={() => onReceive(g.id)}
              onReceiveAndStart={onReceiveAndStart ? () => onReceiveAndStart(g.id) : undefined}
              onLost={onLost ? () => onLost(g.id) : undefined}
              receivePending={isReceivePending(g.id)}
              receiveStartPending={isReceiveStartPending(g.id)}
              lostPending={isLostPending(g.id)}
              actionVariant={typeof actionVariant === "function" ? actionVariant(g) : actionVariant}
              showType={showType}
              showAlt={showAlt}
              showAlterationOut={showAlterationOut}
              hideExpress={hideExpress}
            />
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

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

// ── Page ─────────────────────────────────────────────────────────────────────

function ReceivingPage() {
  const { data: allGarments = [], isLoading } = useWorkshopGarments();
  const receiveMut = useReceiveGarments();
  const receiveStartMut = useReceiveAndStart();
  const lostMut = useMarkLostInTransit();

  const pendingIdSet = (mut: { isPending: boolean; variables?: string[] }): Set<string> =>
    mut.isPending && mut.variables ? new Set(mut.variables) : new Set();
  const receivePendingIds = pendingIdSet(receiveMut);
  const receiveStartPendingIds = pendingIdSet(receiveStartMut);
  const lostPendingIds = pendingIdSet(lostMut);
  const isReceivePending = (id: string) => receivePendingIds.has(id);
  const isReceiveStartPending = (id: string) => receiveStartPendingIds.has(id);
  const isLostPending = (id: string) => lostPendingIds.has(id);

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

  // Orders that have at least one brova (finals in these orders must park)
  const orderIdsWithBrova = new Set(
    allGarments.filter((g) => g.garment_type === "brova").map((g) => g.order_id),
  );

  // ── Filter into sections ──────────────────────────────────────────────────
  const inTransit = allGarments
    .filter((g) => g.location === "transit_to_workshop")
    .filter((g, i, arr) => arr.findIndex((x) => x.id === g.id) === i);
  const lostInTransit = allGarments.filter((g) => g.location === "lost_in_transit");

  // Alteration-order garments live in their own section regardless of trip.
  const alterationOut = inTransit.filter((g) => g.garment_type === "alteration");

  // Work-order garments only (brova / final). Initial trip = trip 1; trip 2+
  // returns go to the Work Order Alterations section below.
  const workOrderGarments = inTransit.filter((g) => g.garment_type !== "alteration");
  const initialTrip = workOrderGarments.filter((g) => (g.trip_number ?? 1) === 1);
  const expressGarments = initialTrip.filter((g) => g.express);
  const brovaInitial = initialTrip.filter((g) => !g.express && g.garment_type === "brova");
  const finalsInitial = initialTrip.filter((g) => !g.express && g.garment_type === "final");

  // Work order alterations: brova/final returning (trip >= 2).
  const alterations = workOrderGarments.filter((g) => (g.trip_number ?? 1) >= 2);

  // Group garments by order, sort groups by delivery date, brovas before finals, flatten
  const groupByOrderSorted = (garments: WorkshopGarment[]): WorkshopGarment[] => {
    const groups = new Map<number, WorkshopGarment[]>();
    for (const g of garments) {
      if (!groups.has(g.order_id)) groups.set(g.order_id, []);
      groups.get(g.order_id)!.push(g);
    }
    return [...groups.values()]
      .sort((a, b) => {
        const da = a[0]?.delivery_date_order;
        const db = b[0]?.delivery_date_order;
        if (da && db) return da.localeCompare(db);
        if (da) return -1;
        if (db) return 1;
        return 0;
      })
      .map((group) => group.sort((a, b) => {
        if (a.garment_type === "brova" && b.garment_type !== "brova") return -1;
        if (a.garment_type !== "brova" && b.garment_type === "brova") return 1;
        return 0;
      }))
      .flat();
  };

  const sortedExpress = applySearch(groupByOrderSorted(expressGarments));
  const sortedBrova = applySearch(groupByOrderSorted(brovaInitial));
  const sortedFinals = applySearch(groupByOrderSorted(finalsInitial));
  const sortedAlterations = applySearch(groupByOrderSorted(alterations));
  const sortedAlterationOut = applySearch(groupByOrderSorted(alterationOut));

  // ── Selection state per section ───────────────────────────────────────────
  const [selExpress, setSelExpress] = useState<Set<string>>(new Set());
  const [selBrova, setSelBrova] = useState<Set<string>>(new Set());
  const [selFinals, setSelFinals] = useState<Set<string>>(new Set());
  const [selAlterations, setSelAlterations] = useState<Set<string>>(new Set());
  const [selAlterationOut, setSelAlterationOut] = useState<Set<string>>(new Set());

  const toggle =
    (setFn: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (id: string, checked: boolean) =>
      setFn((prev) => {
        const n = new Set(prev);
        checked ? n.add(id) : n.delete(id);
        return n;
      });

  const allVisible = [...sortedExpress, ...sortedBrova, ...sortedFinals, ...sortedAlterations, ...sortedAlterationOut];
  const totalSelected = selExpress.size + selBrova.size + selFinals.size + selAlterations.size + selAlterationOut.size;
  const allSelected = allVisible.length > 0 && totalSelected === allVisible.length;

  const selectAll = () => {
    setSelExpress(new Set(sortedExpress.map((g) => g.id)));
    setSelBrova(new Set(sortedBrova.map((g) => g.id)));
    setSelFinals(new Set(sortedFinals.map((g) => g.id)));
    setSelAlterations(new Set(sortedAlterations.map((g) => g.id)));
    setSelAlterationOut(new Set(sortedAlterationOut.map((g) => g.id)));
  };
  const clearAll = () => {
    setSelExpress(new Set());
    setSelBrova(new Set());
    setSelFinals(new Set());
    setSelAlterations(new Set());
    setSelAlterationOut(new Set());
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const receive = async (ids: string[]) => receiveMut.mutateAsync(ids);
  const receiveAndStart = async (ids: string[]) => receiveStartMut.mutateAsync(ids);
  const markLost = async (id: string) => {
    await lostMut.mutateAsync([id]);
    toast.warning("Garment marked as lost in transit");
  };

  const totalIncoming = sortedExpress.length + sortedBrova.length + sortedFinals.length + sortedAlterations.length + sortedAlterationOut.length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-28 space-y-8">
      <PageHeader
        icon={Inbox}
        title="Receiving"
        subtitle={`${totalIncoming} garment${totalIncoming !== 1 ? "s" : ""} in transit · ${lostInTransit.length} lost`}
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
        {allVisible.length > 0 && (
          <Button
            variant={allSelected ? "secondary" : "outline"}
            size="sm"
            onClick={allSelected ? clearAll : selectAll}
            className="shrink-0"
          >
            {allSelected ? `Deselect All (${totalSelected})` : `Select All (${allVisible.length})`}
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* ── EXPRESS ── */}
          <Section title="Express" icon={Zap} count={sortedExpress.length}>
            {sortedExpress.length === 0 ? (
              <EmptyState icon={Zap} message="No express garments in transit" />
            ) : (
              <>
                <SectionTable
                  garments={sortedExpress}
                  selectedIds={selExpress}
                  onToggle={toggle(setSelExpress)}
                  onReceive={(id) => receive([id])}
                  onReceiveAndStart={(id) => receiveAndStart([id])}
                  onLost={markLost}
                  isReceivePending={isReceivePending}
                  isReceiveStartPending={isReceiveStartPending}
                  isLostPending={isLostPending}
                  actionVariant={(g) =>
                    g.garment_type === "final" && orderIdsWithBrova.has(g.order_id)
                      ? "receive-lost"
                      : "receive-start-lost"
                  }
                  showType
                  hideExpress
                />
                {(() => {
                  const selectedGarments = sortedExpress.filter((g) => selExpress.has(g.id));
                  const allBrovas = selectedGarments.every(
                    (g) => g.garment_type === "brova" || !orderIdsWithBrova.has(g.order_id),
                  );
                  return (
                    <BatchActionBar count={selExpress.size} onClear={() => setSelExpress(new Set())}>
                      <Button size="sm" variant="secondary" onClick={() => { receive([...selExpress]); setSelExpress(new Set()); }} disabled={receiveMut.isPending}>
                        {receiveMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                        Receive
                      </Button>
                      {allBrovas && (
                        <Button size="sm" onClick={() => { receiveAndStart([...selExpress]); setSelExpress(new Set()); }} disabled={receiveStartMut.isPending}>
                          {receiveStartMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                          Receive & Start
                        </Button>
                      )}
                    </BatchActionBar>
                  );
                })()}
              </>
            )}
          </Section>

          {/* ── BROVA ── */}
          <Section title="Brova" icon={Package} count={sortedBrova.length}>
            {sortedBrova.length === 0 ? (
              <EmptyState icon={Package} message="No brova garments in transit" />
            ) : (
              <>
                <SectionTable
                  garments={sortedBrova}
                  selectedIds={selBrova}
                  onToggle={toggle(setSelBrova)}
                  onReceive={(id) => receive([id])}
                  onReceiveAndStart={(id) => receiveAndStart([id])}
                  onLost={markLost}
                  isReceivePending={isReceivePending}
                  isReceiveStartPending={isReceiveStartPending}
                  isLostPending={isLostPending}
                  actionVariant="receive-start-lost"
                />
                <BatchActionBar count={selBrova.size} onClear={() => setSelBrova(new Set())}>
                  <Button size="sm" variant="secondary" onClick={() => { receive([...selBrova]); setSelBrova(new Set()); }} disabled={receiveMut.isPending}>
                    {receiveMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    Receive
                  </Button>
                  <Button size="sm" onClick={() => { receiveAndStart([...selBrova]); setSelBrova(new Set()); }} disabled={receiveStartMut.isPending}>
                    {receiveStartMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    Receive & Start
                  </Button>
                </BatchActionBar>
              </>
            )}
          </Section>

          {/* ── FINALS ── */}
          <Section title="Finals" icon={Package} count={sortedFinals.length}>
            {sortedFinals.length === 0 ? (
              <EmptyState icon={Package} message="No final garments in transit" />
            ) : (
              <>
                <SectionTable
                  garments={sortedFinals}
                  selectedIds={selFinals}
                  onToggle={toggle(setSelFinals)}
                  onReceive={(id) => receive([id])}
                  onReceiveAndStart={(id) => receiveAndStart([id])}
                  onLost={markLost}
                  isReceivePending={isReceivePending}
                  isReceiveStartPending={isReceiveStartPending}
                  isLostPending={isLostPending}
                  actionVariant={(g) =>
                    orderIdsWithBrova.has(g.order_id) ? "receive-lost" : "receive-start-lost"
                  }
                />
                {(() => {
                  const selectedGarments = sortedFinals.filter((g) => selFinals.has(g.id));
                  const canStart = selectedGarments.every((g) => !orderIdsWithBrova.has(g.order_id));
                  return (
                    <BatchActionBar count={selFinals.size} onClear={() => setSelFinals(new Set())}>
                      <Button size="sm" variant="secondary" onClick={() => { receive([...selFinals]); setSelFinals(new Set()); }} disabled={receiveMut.isPending}>
                        {receiveMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                        Receive
                      </Button>
                      {canStart && (
                        <Button size="sm" onClick={() => { receiveAndStart([...selFinals]); setSelFinals(new Set()); }} disabled={receiveStartMut.isPending}>
                          {receiveStartMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                          Receive & Start
                        </Button>
                      )}
                    </BatchActionBar>
                  );
                })()}
              </>
            )}
          </Section>

          {/* ── WORK ORDER ALTERATIONS ── */}
          <Section title="Work Order Alterations" icon={Package} count={sortedAlterations.length}>
            {sortedAlterations.length === 0 ? (
              <EmptyState icon={Package} message="No alterations in transit" />
            ) : (
              <>
                <SectionTable
                  garments={sortedAlterations}
                  selectedIds={selAlterations}
                  onToggle={toggle(setSelAlterations)}
                  onReceive={(id) => receive([id])}
                  onReceiveAndStart={(id) => receiveAndStart([id])}
                  onLost={markLost}
                  isReceivePending={isReceivePending}
                  isReceiveStartPending={isReceiveStartPending}
                  isLostPending={isLostPending}
                  actionVariant="receive-start-lost"
                  showAlt
                  showType
                />
                <BatchActionBar count={selAlterations.size} onClear={() => setSelAlterations(new Set())}>
                  <Button size="sm" variant="secondary" onClick={() => { receive([...selAlterations]); setSelAlterations(new Set()); }} disabled={receiveMut.isPending}>
                    {receiveMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    Receive
                  </Button>
                  <Button size="sm" onClick={() => { receiveAndStart([...selAlterations]); setSelAlterations(new Set()); }} disabled={receiveStartMut.isPending}>
                    {receiveStartMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    Receive & Start
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { lostMut.mutateAsync([...selAlterations]).then(() => { toast.warning(`${selAlterations.size} garment${selAlterations.size !== 1 ? "s" : ""} marked as lost`); setSelAlterations(new Set()); }); }}
                    disabled={lostMut.isPending}
                    className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {lostMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                    Lost
                  </Button>
                </BatchActionBar>
              </>
            )}
          </Section>

          {/* ── ALTERATION ORDERS (OUT) ── */}
          <Section title="Alteration Orders (Out)" icon={Scissors} count={sortedAlterationOut.length}>
            {sortedAlterationOut.length === 0 ? (
              <EmptyState icon={Scissors} message="No alteration orders in transit" />
            ) : (
              <>
                <SectionTable
                  garments={sortedAlterationOut}
                  selectedIds={selAlterationOut}
                  onToggle={toggle(setSelAlterationOut)}
                  onReceive={(id) => receive([id])}
                  onReceiveAndStart={(id) => receiveAndStart([id])}
                  onLost={markLost}
                  isReceivePending={isReceivePending}
                  isReceiveStartPending={isReceiveStartPending}
                  isLostPending={isLostPending}
                  actionVariant="receive-start-lost"
                  showAlt
                  showAlterationOut
                />
                <BatchActionBar count={selAlterationOut.size} onClear={() => setSelAlterationOut(new Set())}>
                  <Button size="sm" variant="secondary" onClick={() => { receive([...selAlterationOut]); setSelAlterationOut(new Set()); }} disabled={receiveMut.isPending}>
                    {receiveMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    Receive
                  </Button>
                  <Button size="sm" onClick={() => { receiveAndStart([...selAlterationOut]); setSelAlterationOut(new Set()); }} disabled={receiveStartMut.isPending}>
                    {receiveStartMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    Receive & Start
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { lostMut.mutateAsync([...selAlterationOut]).then(() => { toast.warning(`${selAlterationOut.size} garment${selAlterationOut.size !== 1 ? "s" : ""} marked as lost`); setSelAlterationOut(new Set()); }); }}
                    disabled={lostMut.isPending}
                    className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {lostMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                    Lost
                  </Button>
                </BatchActionBar>
              </>
            )}
          </Section>

          {/* ── LOST IN TRANSIT ── */}
          <Section title="Lost in Transit" icon={CircleX} count={lostInTransit.length} accent={lostInTransit.length > 0 ? "bg-red-100 text-red-700" : undefined}>
            {lostInTransit.length === 0 ? (
              <EmptyState icon={CircleX} message="No garments lost in transit" />
            ) : (
              <SectionTable
                garments={lostInTransit}
                selectedIds={new Set()}
                onToggle={() => {}}
                onReceive={(id) => receive([id])}
                isReceivePending={isReceivePending}
                isReceiveStartPending={isReceiveStartPending}
                isLostPending={isLostPending}
                actionVariant="found"
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
