"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useLayoutEffect, useMemo } from "react";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import {
  RefreshCw,
  PackageCheck,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  MessageSquare,
  Loader2,
  Truck,
  AlertTriangle,
  History,
  Printer,
} from "lucide-react";

// UI Components
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Checkbox } from "@repo/ui/checkbox";
import { Skeleton } from "@repo/ui/skeleton";
import { ErrorBoundary } from "@/components/global/error-boundary";
import * as TabsPrimitive from "@radix-ui/react-tabs";

// API and Types
import { getOrdersForDispatch, dispatchOrder, getInTransitToWorkshopOrders, getDispatchHistory, getBrand, type DispatchHistoryRow } from "@/api/orders";
import { getGarmentsForRedispatch, dispatchGarmentToWorkshop } from "@/api/garments";
import type { Order, Customer, Garment } from "@repo/database";
import type { ApiResponse } from "@/types/api";
import { cn, clickableProps, getKuwaitMidnight, getLocalDateStr, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";

interface GarmentWithFabric extends Garment {
    fabric?: { name: string } | null;
}
interface OrderWithDetails extends Order {
    customer?: Customer;
    garments?: GarmentWithFabric[];
}
interface OrderCardProps {
  order: OrderWithDetails;
  onDispatch: (orderId: number, garmentIds?: string[]) => Promise<void>;
  isUpdating: boolean;
  /** True when this order also has garment(s) waiting in the Return to Workshop tab. */
  hasReturning?: boolean;
  onGoToTab?: (tab: string) => void;
}

// A garment row that's a final still parked on brova acceptance. Never
// auto-selected for dispatch — staff opts in deliberately.
const isParkedFinal = (g: { garment_type?: string | null; piece_stage?: string | null }) =>
    g.garment_type === "final" && g.piece_stage === "waiting_for_acceptance";

// Neutral chrome only. POS direction: neutral base + single brand accent — no
// per-type colour fills. Type is distinguished by its label, not by colour.
const PILL = "inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground";

const TYPE_LABEL: Record<string, string> = {
    brova: "Brova",
    final: "Final",
    alteration: "Alteration",
};

// --- Tab state helpers (shared empty / error / loading) ---

function TabEmptyState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
    return (
        <div className="py-16 text-center">
            <Icon className="w-7 h-7 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-base font-medium text-muted-foreground">{title}</p>
            <p className="text-sm text-muted-foreground/70 mt-1">{subtitle}</p>
        </div>
    );
}

function TabError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
    return (
        <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 text-center space-y-3">
                <p className="font-medium text-destructive">
                    {error instanceof Error ? error.message : "Failed to load"}
                </p>
                <Button variant="outline" size="sm" onClick={onRetry}>
                    Retry
                </Button>
            </CardContent>
        </Card>
    );
}

function TabLoading({ count = 3, height = "h-28" }: { count?: number; height?: string }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: count }).map((_, i) => (
                <Skeleton key={i} className={cn(height, "w-full rounded-lg")} />
            ))}
        </div>
    );
}

// --- Shared OrderCard shell ---

interface OrderHeader {
    orderId: number;
    invoiceNumber?: number | string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    orderDate?: string | Date | null;
    pieceCount: number;
    brovaCount?: number;
    finalCount?: number;
    alterationCount?: number;
    hasExpress?: boolean;
    rightBadges?: React.ReactNode;
    action?: React.ReactNode;
}

interface OrderCardShellProps extends OrderHeader {
    children?: React.ReactNode;
    collapsible?: boolean;
    defaultOpen?: boolean;
    note?: React.ReactNode;
}

function OrderCardShell({
    children,
    collapsible = false,
    defaultOpen = false,
    note,
    ...h
}: OrderCardShellProps) {
    const [isExpanded, setIsExpanded] = useState(defaultOpen);
    const orderDateStr = h.orderDate
        ? parseUtcTimestamp(h.orderDate).toLocaleDateString("en-GB", { timeZone: TIMEZONE })
        : null;
    const toggle = () => setIsExpanded(v => !v);

    const header = (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
            <span className="text-[15px] font-medium text-foreground truncate">
                {h.customerName || "Unknown customer"}
            </span>
            {h.customerPhone && (
                <span className="text-sm text-muted-foreground shrink-0">{h.customerPhone}</span>
            )}
            <span className="text-sm text-muted-foreground shrink-0">#{h.orderId}</span>
            {h.invoiceNumber != null && (
                <span className="text-sm text-muted-foreground shrink-0">INV {h.invoiceNumber}</span>
            )}
            {orderDateStr && <span className="text-sm text-muted-foreground shrink-0">{orderDateStr}</span>}
            <span className="text-sm text-foreground/80 shrink-0">
                {h.pieceCount} {h.pieceCount === 1 ? "piece" : "pieces"}
                {h.brovaCount ? <span className="text-muted-foreground"> · {h.brovaCount} brova</span> : null}
                {h.finalCount ? <span className="text-muted-foreground"> · {h.finalCount} final</span> : null}
                {h.alterationCount ? <span className="text-muted-foreground"> · {h.alterationCount} alteration</span> : null}
                {h.hasExpress && <span className="text-red-700 font-medium"> · Express</span>}
            </span>
            <div className="flex items-center gap-2 ml-auto shrink-0">
                {h.rightBadges}
                {h.action}
                {collapsible && (
                    <ChevronDown
                        className={cn(
                            "size-4 text-muted-foreground transition-transform duration-300",
                            isExpanded && "rotate-180"
                        )}
                    />
                )}
            </div>
        </div>
    );

    return (
        <Card className="overflow-hidden py-0 gap-0 rounded-lg">
            <CardContent className="p-0">
                {collapsible ? (
                    <div
                        className={cn(
                            "cursor-pointer transition-colors",
                            isExpanded ? "bg-muted/30" : "hover:bg-muted/20"
                        )}
                        onClick={toggle}
                        {...clickableProps(toggle)}
                    >
                        {header}
                    </div>
                ) : (
                    <div className="bg-muted/20 border-b border-border/40">{header}</div>
                )}
                {note && (
                    <div className="px-4 py-2 border-t border-border/40 bg-muted/10">{note}</div>
                )}
                {children && (collapsible ? (
                    <div
                        className={cn(
                            "grid transition-[grid-template-rows] duration-300 ease-out",
                            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        )}
                    >
                        <div className="overflow-hidden">
                            <div className="border-t border-border/40">{children}</div>
                        </div>
                    </div>
                ) : (
                    <div>{children}</div>
                ))}
            </CardContent>
        </Card>
    );
}

function GarmentTypeBadge({ type }: { type?: string | null }) {
    if (!type) return null;
    return <span className={PILL}>{TYPE_LABEL[type] ?? type}</span>;
}

function FabricChip({ source, name }: { source?: string | null; name?: string | null }) {
    if (source === "IN") {
        return <span className="text-xs text-muted-foreground">{name || "In-house fabric"}</span>;
    }
    if (source === "OUT") {
        return <span className="text-xs text-muted-foreground">Outside fabric</span>;
    }
    return null;
}

// Trip / alteration label. Brova at trip 4+ counts as alt (legacy threshold);
// finals + alterations at trip 2+. Helper kept inline to preserve current display.
function tripLabel(tripNumber: number | null | undefined, garmentType?: string | null): string {
    const trip = tripNumber || 1;
    if (garmentType === "brova" && trip >= 4) return `Alt ${trip - 3}`;
    if ((garmentType === "final" || garmentType === "alteration") && trip >= 2) return `Alt ${trip - 1}`;
    return trip > 1 ? `Trip ${trip}` : "1st trip";
}

// --- New Orders tab card ---

function OrderListItem({ order, onDispatch, isUpdating, hasReturning, onGoToTab }: OrderCardProps) {
    const garments = order.garments || [];
    const numGarments = garments.length || order.num_of_fabrics || 0;

    // Everything selected by default — parked finals are dispatched
    // alongside brovas and stay parked at the workshop (spec §2.4).
    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        () => new Set(garments.map(g => g.id))
    );

    const toggleGarment = (id: string, checked: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(id); else next.delete(id);
            return next;
        });
    };

    const allSelected = garments.length > 0 && selectedIds.size === garments.length;
    const toggleAll = (checked: boolean) => {
        setSelectedIds(checked ? new Set(garments.map(g => g.id)) : new Set());
    };

    const brovaCount = garments.filter(g => g.garment_type === "brova").length;
    const finalCount = garments.filter(g => g.garment_type === "final").length;
    const alterationCount = garments.filter(g => g.garment_type === "alteration").length;

    const handleDispatch = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isUpdating && selectedIds.size > 0) {
            const ids = [...selectedIds];
            await onDispatch(order.id, ids.length < garments.length ? ids : undefined);
        }
    };

    const dispatchButton = (
        <Button
            size="sm"
            className="h-9"
            onClick={handleDispatch}
            disabled={isUpdating || selectedIds.size === 0}
        >
            {isUpdating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
                <>
                    <span>Dispatch{selectedIds.size < garments.length ? ` (${selectedIds.size})` : ""}</span>
                    <ChevronRight className="w-3 h-3 ml-1" />
                </>
            )}
        </Button>
    );

    return (
        <OrderCardShell
            orderId={order.id}
            invoiceNumber={order.invoice_number}
            customerName={order.customer?.name}
            customerPhone={order.customer?.phone}
            orderDate={order.order_date}
            pieceCount={numGarments}
            brovaCount={brovaCount}
            finalCount={finalCount}
            alterationCount={alterationCount}
            hasExpress={garments.some(g => g.express)}
            action={dispatchButton}
            collapsible
            note={hasReturning ? (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onGoToTab?.("return-workshop"); }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                    <RotateCcw className="w-3 h-3" />
                    This order also has garment(s) returning — see Return to Workshop
                    <ChevronRight className="w-3 h-3" />
                </button>
            ) : undefined}
        >
            {garments.length > 0 && (
                <div className="p-3">
                    <div className="flex items-center gap-2 mb-2 px-1" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={allSelected} onCheckedChange={(checked) => toggleAll(!!checked)} />
                        <span className="text-xs font-medium text-muted-foreground">Select all</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" onClick={(e) => e.stopPropagation()}>
                        {garments.map((g) => {
                            const isSelected = selectedIds.has(g.id);
                            const parked = isParkedFinal(g);
                            return (
                                <div
                                    key={g.id}
                                    className={cn(
                                        "flex items-start gap-2.5 rounded-md border bg-background p-3 cursor-pointer hover:bg-muted/20 transition-colors",
                                        !isSelected && "opacity-50"
                                    )}
                                    onClick={() => toggleGarment(g.id, !isSelected)}
                                >
                                    <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => toggleGarment(g.id, !!checked)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="mt-0.5 shrink-0"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                            <span className="font-medium text-sm">{g.garment_id}</span>
                                            <GarmentTypeBadge type={g.garment_type} />
                                            {g.express && (
                                                <span className="text-xs font-medium text-red-700">Express</span>
                                            )}
                                            {parked && (
                                                <span className="text-xs text-muted-foreground">Parked</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                            <span>{g.style || "Kuwaiti"}</span>
                                            <FabricChip source={g.fabric_source} name={g.fabric?.name} />
                                            {g.notes && <span className="truncate max-w-[120px] italic">"{g.notes}"</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </OrderCardShell>
    );
}

// --- Return to Workshop Tab ---

interface RedispatchGarment extends Garment {
  orders?: {
    id: number;
    customer_id?: number | null;
    customers?: { id: number; name: string; phone?: string | null } | null;
    work_orders?: { invoice_number?: number | null } | null;
  };
  garment_feedback?: Array<{
    id: string;
    action: string;
    satisfaction_level: number | null;
    notes: string | null;
    measurement_diffs: string | null;
    options_checklist: string | null;
    trip_number: number | null;
    created_at: string | null;
  }>;
}

// Count measurement + style changes recorded on a feedback row so the shop
// staff dispatching the return sees the scope of work, matching the workshop
// detail page's "N measurement changes · M style fixes" summary.
function countFeedbackChanges(
  fb: { measurement_diffs: string | null; options_checklist: string | null } | null,
): { measurements: number; styles: number } {
  if (!fb) return { measurements: 0, styles: 0 };
  let measurements = 0;
  let styles = 0;
  try {
    const diffs = fb.measurement_diffs ? JSON.parse(fb.measurement_diffs) : null;
    if (Array.isArray(diffs)) {
      for (const d of diffs) {
        const orig = d?.original_value;
        const next = d?.actual_value == null || d.actual_value === "" ? null : Number(d.actual_value);
        if (orig == null || next == null) continue;
        if (Number(orig) !== next) measurements += 1;
      }
    }
  } catch {
    // malformed JSON — count nothing
  }
  try {
    const checklist = fb.options_checklist ? JSON.parse(fb.options_checklist) : null;
    if (Array.isArray(checklist)) {
      for (const o of checklist) {
        if (o?.rejected === true || o?.hashwa_rejected === true) styles += 1;
      }
    }
  } catch {
    // malformed JSON — count nothing
  }
  return { measurements, styles };
}

function ReturnToWorkshopTab({
  bulkDispatchRef,
  newOrderIds,
  onGoToTab,
}: {
  bulkDispatchRef: React.MutableRefObject<(() => void) | null>;
  newOrderIds: Set<number>;
  onGoToTab?: (tab: string) => void;
}) {
  const queryClient = useQueryClient();
  const [dispatchingIds, setDispatchingIds] = useState<Set<string>>(new Set());
  const [isBulkDispatching, setIsBulkDispatching] = useState(false);

  const {
    data: redispatchResponse,
    isLoading,
    isError,
    error,
  } = useQuery<ApiResponse<RedispatchGarment[]>>({
    queryKey: ["redispatchGarments", getBrand()],
    queryFn: () => getGarmentsForRedispatch() as Promise<ApiResponse<RedispatchGarment[]>>,
    // Realtime invalidates on garment changes (see useRealtimeInvalidation),
    // so navigations don't need a short staleTime.
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const garments = redispatchResponse?.data || [];

  const handleDispatchGarment = async (garment: RedispatchGarment) => {
    setDispatchingIds(prev => new Set(prev).add(garment.id));
    try {
      await dispatchGarmentToWorkshop(garment.id, garment.trip_number || 1);
      await queryClient.invalidateQueries({ queryKey: ["redispatchGarments"] });
    } catch (err) {
      toast.error(`Could not dispatch garment ${garment.garment_id || garment.id}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDispatchingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(garment.id);
        return newSet;
      });
    }
  };

  const handleBulkDispatch = async () => {
    if (garments.length === 0 || isBulkDispatching) return;
    setIsBulkDispatching(true);
    try {
      await Promise.all(
        garments.map(g => dispatchGarmentToWorkshop(g.id, g.trip_number || 1))
      );
      await queryClient.invalidateQueries({ queryKey: ["redispatchGarments"] });
    } catch (err) {
      toast.error(`Bulk dispatch failed for some garments: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBulkDispatching(false);
    }
  };

  const getLatestFeedback = (g: RedispatchGarment) => {
    if (!g.garment_feedback?.length) return null;
    return g.garment_feedback.sort((a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )[0];
  };

  if (isLoading) return <TabLoading height="h-32" />;
  if (isError) return <TabError error={error} onRetry={() => queryClient.invalidateQueries({ queryKey: ["redispatchGarments"] })} />;
  if (garments.length === 0) {
    return <TabEmptyState icon={RotateCcw} title="No returns pending" subtitle="No garments need to be sent back to the workshop" />;
  }

  // Expose bulk dispatch to parent via ref
  bulkDispatchRef.current = handleBulkDispatch;

  return (
    <Card className="overflow-hidden rounded-lg">
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/20">
              <th className="text-left py-2.5 px-4">Garment</th>
              <th className="text-left py-2.5 px-4">Order</th>
              <th className="text-left py-2.5 px-4">Customer</th>
              <th className="text-left py-2.5 px-4">Status</th>
              <th className="text-left py-2.5 px-4">Feedback</th>
              <th className="text-right py-2.5 px-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {garments.map((g) => {
              const feedback = getLatestFeedback(g);
              const isDispatching = dispatchingIds.has(g.id);
              const fbStatus = (g as { feedback_status?: string | null }).feedback_status;
              const orderId = g.orders?.id ?? g.order_id;
              const invoice = g.orders?.work_orders?.invoice_number;
              const customerName = g.orders?.customers?.name || "Unknown customer";
              const customerPhone = g.orders?.customers?.phone;
              const alsoNew = orderId != null && newOrderIds.has(orderId);
              const { measurements, styles } = feedback
                ? countFeedbackChanges(feedback)
                : { measurements: 0, styles: 0 };

              return (
                <tr key={g.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{g.garment_id || g.id.slice(0, 8)}</span>
                      <GarmentTypeBadge type={g.garment_type} />
                    </div>
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <div className="text-sm">{orderId}</div>
                    {invoice != null && (
                      <div className="text-sm text-muted-foreground">INV {invoice}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="text-sm font-medium truncate max-w-[180px]">{customerName}</div>
                    {customerPhone && (
                      <div className="text-sm text-muted-foreground">{customerPhone}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <div className={cn(
                      "text-sm font-medium",
                      fbStatus === "needs_redo" ? "text-destructive" : "text-foreground"
                    )}>
                      {fbStatus === "needs_redo"
                        ? "Needs redo"
                        : fbStatus === "needs_repair"
                          ? "Needs repair"
                          : PIECE_STAGE_LABELS[g.piece_stage as keyof typeof PIECE_STAGE_LABELS] ?? g.piece_stage}
                    </div>
                    <div className="text-sm text-muted-foreground">{tripLabel(g.trip_number, g.garment_type)}</div>
                  </td>
                  <td className="py-2.5 px-4">
                    {feedback ? (
                      <div className="flex items-center gap-2 flex-wrap text-sm text-foreground/80 min-w-0">
                        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="capitalize">{feedback.action?.replace(/_/g, " ")}</span>
                        {measurements > 0 && (
                          <span className="text-muted-foreground">· {measurements} measurement{measurements === 1 ? "" : "s"}</span>
                        )}
                        {styles > 0 && (
                          <span className="text-muted-foreground">· {styles} style fix{styles === 1 ? "" : "es"}</span>
                        )}
                        {feedback.satisfaction_level && (
                          <span className="text-muted-foreground">· Sat {feedback.satisfaction_level}/5</span>
                        )}
                        {feedback.notes && (
                          <span className="text-muted-foreground italic max-w-[180px] truncate">"{feedback.notes}"</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                    {alsoNew && (
                      <button
                        type="button"
                        onClick={() => onGoToTab?.("new-orders")}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                      >
                        Also has new garments
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => handleDispatchGarment(g)}
                      disabled={isDispatching}
                    >
                      {isDispatching ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RotateCcw className="w-3 h-3 mr-1.5" />}
                      Dispatch
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// --- In Transit to Workshop Tab ---

function InTransitOrderRow({ order }: { order: OrderWithDetails }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const garments = order.garments || [];
  const lostCount = garments.filter(g => g.location === "lost_in_transit").length;
  const transitCount = garments.filter(g => g.location === "transit_to_workshop").length;
  const brovaCount = garments.filter(g => g.garment_type === "brova").length;
  const finalCount = garments.filter(g => g.garment_type === "final").length;

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/30 cursor-pointer transition-colors",
          isExpanded ? "bg-muted/30" : "hover:bg-muted/20"
        )}
        onClick={() => setIsExpanded(v => !v)}
      >
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-1.5">
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 shrink-0", isExpanded && "rotate-180")} />
            <span className="font-medium text-sm">{order.id}</span>
          </div>
        </td>
        <td className="py-2.5 px-4 text-sm text-muted-foreground">{(order as any).invoice_number ?? '—'}</td>
        <td className="py-2.5 px-4">
          <div className="font-medium text-sm">{order.customer?.name ?? 'Unknown'}</div>
          {order.customer?.phone && <div className="text-sm text-muted-foreground">{order.customer.phone}</div>}
        </td>
        <td className="py-2.5 px-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-semibold tabular-nums text-foreground">{garments.length}</span>
            <span className="text-sm text-muted-foreground">{garments.length === 1 ? "piece" : "pieces"}</span>
          </div>
          {(brovaCount > 0 || finalCount > 0) && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {brovaCount > 0 && <span>{brovaCount} brova</span>}
              {brovaCount > 0 && finalCount > 0 && <span> · </span>}
              {finalCount > 0 && <span>{finalCount} final</span>}
            </div>
          )}
        </td>
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-3 text-sm">
            {transitCount > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Truck className="w-3.5 h-3.5" />
                {transitCount} in transit
              </span>
            )}
            {lostCount > 0 && (
              <span className="flex items-center gap-1 text-destructive font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                {lostCount} lost
              </span>
            )}
          </div>
        </td>
      </tr>

      <tr className="border-0 hover:bg-transparent">
        <td
          colSpan={5}
          className={cn(
            "p-0 transition-colors",
            isExpanded ? "bg-muted/10 border-b border-border/40" : "border-0"
          )}
        >
          <div className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}>
            <div className="overflow-hidden">
              <div className="p-3 sm:pl-10">
                <h4 className="text-xs font-medium mb-2 text-muted-foreground">
                  Garments ({garments.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {garments.map(g => {
                    const isLost = g.location === "lost_in_transit";
                    return (
                      <div key={g.id} className="p-2.5 bg-background rounded-md border text-sm">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium text-sm truncate">{g.garment_id}</span>
                            <GarmentTypeBadge type={g.garment_type} />
                          </div>
                          {isLost ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-destructive shrink-0">
                              <AlertTriangle className="w-3 h-3" />
                              Lost
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                              <Truck className="w-3 h-3" />
                              In transit
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                          <span>{tripLabel(g.trip_number, g.garment_type)}</span>
                          <span>·</span>
                          <span>{PIECE_STAGE_LABELS[g.piece_stage as keyof typeof PIECE_STAGE_LABELS] ?? g.piece_stage}</span>
                          {(g as any).fabric?.name && (
                            <>
                              <span>·</span>
                              <span className="truncate">{(g as any).fabric.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

function InTransitToWorkshopTab() {
  const queryClient = useQueryClient();

  const {
    data: transitResponse,
    isLoading,
    isError,
    error,
  } = useQuery<ApiResponse<OrderWithDetails[]>>({
    queryKey: ["inTransitToWorkshop", getBrand()],
    queryFn: async () => {
      const response = await getInTransitToWorkshopOrders();
      return response as ApiResponse<OrderWithDetails[]>;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const orders = transitResponse?.data || [];

  if (isLoading) return <TabLoading />;
  if (isError) return <TabError error={error} onRetry={() => queryClient.invalidateQueries({ queryKey: ["inTransitToWorkshop"] })} />;
  if (orders.length === 0) {
    return <TabEmptyState icon={Truck} title="No garments in transit" subtitle="Nothing is currently on its way to the workshop" />;
  }

  return (
    <Card className="overflow-hidden rounded-lg">
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/20">
              <th className="text-left py-2.5 px-4">Order</th>
              <th className="text-left py-2.5 px-4">Invoice</th>
              <th className="text-left py-2.5 px-4">Customer</th>
              <th className="text-left py-2.5 px-4">Pieces</th>
              <th className="text-left py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => <InTransitOrderRow key={order.id} order={order} />)}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// --- Dispatch History Tab ---

type HistoryPeriod = 'today' | 'week' | 'month';

// Compute [from, to) bounds for a given period, in Kuwait time.
// Week starts Sunday (matches Kuwait workweek — Fri/Sat weekend).
function getPeriodRange(period: HistoryPeriod): { from: Date; to: Date; label: string } {
  const [ky, km, kd] = getLocalDateStr().split("-").map(Number) as [number, number, number];
  const startOfDay = getKuwaitMidnight();
  const startOfTomorrow = new Date(startOfDay.getTime() + 86_400_000);
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, ...opts });

  if (period === 'today') {
    return { from: startOfDay, to: startOfTomorrow, label: fmt(startOfDay, { weekday: 'long', day: 'numeric', month: 'long' }) };
  }

  if (period === 'week') {
    const kuwaitWeekday = new Date(Date.UTC(ky, km - 1, kd)).getUTCDay();
    const startOfWeek = new Date(startOfDay.getTime() - kuwaitWeekday * 86_400_000);
    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 86_400_000);
    return {
      from: startOfWeek,
      to: endOfWeek,
      label: `${fmt(startOfWeek, { day: 'numeric', month: 'short' })} – ${fmt(new Date(endOfWeek.getTime() - 1), { day: 'numeric', month: 'short' })}`,
    };
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const startOfMonth = new Date(`${ky}-${pad(km)}-01T00:00:00+03:00`);
  const next = km === 12 ? { y: ky + 1, m: 1 } : { y: ky, m: km + 1 };
  const startOfNextMonth = new Date(`${next.y}-${pad(next.m)}-01T00:00:00+03:00`);
  return { from: startOfMonth, to: startOfNextMonth, label: startOfMonth.toLocaleString("en-GB", { timeZone: TIMEZONE, month: 'long', year: 'numeric' }) };
}

const HISTORY_PERIODS: readonly HistoryPeriod[] = ['today', 'week', 'month'] as const;
const PERIOD_LABELS: Record<HistoryPeriod, string> = { today: 'Today', week: 'This week', month: 'This month' };

const VIEW_MODES: readonly HistoryViewMode[] = ['garment', 'order'] as const;
const VIEW_MODE_LABELS: Record<HistoryViewMode, string> = { garment: 'Garments', order: 'Orders' };

function ViewModeSwitcher({ mode, onChange }: { mode: HistoryViewMode; onChange: (m: HistoryViewMode) => void }) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const idx = VIEW_MODES.indexOf(mode);
      const btn = buttonsRef.current[idx];
      if (btn) setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [mode]);

  return (
    <div className="relative inline-flex items-center border rounded-md p-0.5">
      {indicator && (
        <div
          className="absolute top-0.5 bottom-0.5 bg-primary rounded-sm transition-all duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {VIEW_MODES.map((m, i) => (
        <button
          key={m}
          ref={el => { buttonsRef.current[i] = el; }}
          onClick={() => onChange(m)}
          className={cn(
            'relative z-10 text-sm font-medium px-4 py-1.5 rounded-sm transition-colors duration-300 whitespace-nowrap',
            mode === m ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {VIEW_MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

function PeriodPillSwitcher({ period, onChange }: { period: HistoryPeriod; onChange: (p: HistoryPeriod) => void }) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  // Measure the active button and position the indicator to match.
  // Re-measure on period change and on window resize.
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
    <div className="relative inline-flex items-center border rounded-md p-0.5">
      {/* Sliding indicator — hidden until first measurement to avoid a flash at 0,0 */}
      {indicator && (
        <div
          className="absolute top-0.5 bottom-0.5 bg-primary rounded-sm transition-all duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {HISTORY_PERIODS.map((p, i) => (
        <button
          key={p}
          ref={(el) => { buttonsRef.current[i] = el; }}
          onClick={() => onChange(p)}
          className={cn(
            'relative z-10 text-sm font-medium px-4 py-1.5 rounded-sm transition-colors duration-300 whitespace-nowrap',
            period === p ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

type HistoryViewMode = 'garment' | 'order';

interface HistoryOrderGroup {
  orderId: number;
  invoiceNumber: number | null;
  customerName: string | null;
  customerPhone: string | null;
  rows: DispatchHistoryRow[];
}

function HistoryOrderGroupRows({ group }: { group: HistoryOrderGroup }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const brovaCount = group.rows.filter(r => r.garment_type === 'brova').length;
  const finalCount = group.rows.filter(r => r.garment_type === 'final').length;
  const lastDispatch = new Date(group.rows[0].dispatched_at);

  return (
    <>
      {/* Order summary row */}
      <tr
        className={cn(
          "border-b border-border/30 cursor-pointer transition-colors",
          isExpanded ? "bg-muted/30" : "hover:bg-muted/20"
        )}
        onClick={() => setIsExpanded(v => !v)}
      >
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-1.5">
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 shrink-0", isExpanded && "rotate-180")} />
            <span className="font-medium text-sm">{group.orderId}</span>
          </div>
        </td>
        <td className="py-2.5 px-4 text-xs text-muted-foreground">{group.invoiceNumber ?? '—'}</td>
        <td className="py-2.5 px-4">
          <div className="font-medium text-xs">{group.customerName ?? 'Unknown'}</div>
          {group.customerPhone && <div className="text-[10px] text-muted-foreground">{group.customerPhone}</div>}
        </td>
        <td className="py-2.5 px-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-semibold tabular-nums text-foreground">{group.rows.length}</span>
            <span className="text-sm text-muted-foreground">{group.rows.length === 1 ? "piece" : "pieces"}</span>
          </div>
          {(brovaCount > 0 || finalCount > 0) && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {brovaCount > 0 && <span>{brovaCount} brova</span>}
              {brovaCount > 0 && finalCount > 0 && <span> · </span>}
              {finalCount > 0 && <span>{finalCount} final</span>}
            </div>
          )}
        </td>
        <td className="py-2.5 px-4 whitespace-nowrap">
          <div className="font-medium text-xs">{lastDispatch.toLocaleDateString("en-GB", { timeZone: TIMEZONE })}</div>
          <div className="text-[10px] text-muted-foreground">{lastDispatch.toLocaleTimeString([], { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' })}</div>
        </td>
      </tr>

      {/* Animated expansion row */}
      <tr className="border-0 hover:bg-transparent">
        <td
          colSpan={5}
          className={cn(
            "p-0 transition-colors",
            isExpanded ? "bg-muted/10 border-b border-border/40" : "border-0"
          )}
        >
          <div className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}>
            <div className="overflow-hidden">
              <div className="p-3 sm:pl-10">
                <h4 className="text-xs font-medium mb-2 text-muted-foreground">
                  Garments ({group.rows.length})
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {group.rows.map(r => {
                    const d = new Date(r.dispatched_at);
                    return (
                      <div key={r.id} className="p-2 bg-background rounded-md border text-sm">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="font-mono text-xs text-muted-foreground">{r.garment_code ?? r.garment_id.slice(0, 8)}</span>
                          {r.garment_type && (
                            <span className={PILL}>
                              {TYPE_LABEL[r.garment_type] ?? r.garment_type}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground text-xs">Trip</span>
                            <span className="text-xs">{r.trip_number ?? '—'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground text-xs">Time</span>
                            <span className="text-xs">{d.toLocaleTimeString([], { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

function DispatchHistoryTab() {
  const [period, setPeriod] = useState<HistoryPeriod>('today');
  const [viewMode, setViewMode] = useState<HistoryViewMode>('garment');
  const { from: fromDate, to: toDate, label: periodLabel } = getPeriodRange(period);

  // Shop-side history is always outbound: shop → workshop.
  const { data: historyResp, isLoading, isError, error } = useQuery<ApiResponse<DispatchHistoryRow[]>>({
    queryKey: ['dispatchHistory', getBrand(), fromDate.toISOString(), toDate.toISOString(), 'to_workshop'],
    queryFn: () => getDispatchHistory(fromDate.toISOString(), toDate.toISOString(), 'to_workshop'),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  const rows = historyResp?.data ?? [];

  const orderGroups = useMemo<HistoryOrderGroup[]>(() => {
    const map = new Map<number, HistoryOrderGroup>();
    for (const r of rows) {
      let g = map.get(r.order_id);
      if (!g) {
        g = { orderId: r.order_id, invoiceNumber: r.invoice_number, customerName: r.customer_name, customerPhone: r.customer_phone, rows: [] };
        map.set(r.order_id, g);
      }
      g.rows.push(r);
    }
    return [...map.values()];
  }, [rows]);

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <PeriodPillSwitcher period={period} onChange={setPeriod} />

        <span className="text-xs text-muted-foreground">
          {periodLabel}
        </span>

        <span className="text-xs text-muted-foreground">
          {rows.length} dispatched → workshop
        </span>

        <div className="ml-auto flex items-center gap-2">
          <ViewModeSwitcher mode={viewMode} onChange={setViewMode} />

          <Button
            size="sm"
            className="h-9"
            onClick={handlePrint}
            disabled={rows.length === 0}
          >
            <Printer className="w-3 h-3 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      {/* Print header (only visible when printing) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-medium">Dispatch history — {period === 'today' ? 'Today' : period === 'week' ? 'This week' : 'This month'}</h1>
        <p className="text-sm text-muted-foreground">
          Shop → workshop · {periodLabel} · {rows.length} record{rows.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="font-medium text-destructive">
              {error instanceof Error ? error.message : 'Failed to load'}
            </p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <TabEmptyState icon={History} title="No dispatches this period" subtitle={`Nothing was dispatched in ${periodLabel}`} />
      ) : viewMode === 'order' ? (
        <Card className="overflow-hidden rounded-lg print:border-0">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/20">
                  <th className="text-left py-2.5 px-4">Order</th>
                  <th className="text-left py-2.5 px-4">Invoice</th>
                  <th className="text-left py-2.5 px-4">Customer</th>
                  <th className="text-left py-2.5 px-4">Pieces</th>
                  <th className="text-left py-2.5 px-4">Last dispatch</th>
                </tr>
              </thead>
              <tbody>
                {orderGroups.map(g => <HistoryOrderGroupRows key={g.orderId} group={g} />)}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-lg print:border-0">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/20">
                  <th className="text-left py-2.5 px-4">Date</th>
                  <th className="text-left py-2.5 px-4">Order</th>
                  <th className="text-left py-2.5 px-4">Invoice</th>
                  <th className="text-left py-2.5 px-4">Customer</th>
                  <th className="text-left py-2.5 px-4">Garment</th>
                  <th className="text-left py-2.5 px-4">Type</th>
                  <th className="text-left py-2.5 px-4">Trip</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = parseUtcTimestamp(r.dispatched_at);
                  const dateStr = d.toLocaleDateString("en-GB", { timeZone: TIMEZONE });
                  const timeStr = d.toLocaleTimeString([], { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });
                  return (
                    <tr key={r.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                      <td className="py-2 px-4 whitespace-nowrap">
                        <div className="font-medium text-xs">{dateStr}</div>
                        <div className="text-[10px] text-muted-foreground">{timeStr}</div>
                      </td>
                      <td className="py-2 px-4 font-medium">{r.order_id}</td>
                      <td className="py-2 px-4 text-xs text-muted-foreground">
                        {r.invoice_number ?? '—'}
                      </td>
                      <td className="py-2 px-4">
                        <div className="font-medium text-xs">{r.customer_name ?? 'Unknown'}</div>
                        {r.customer_phone && (
                          <div className="text-[10px] text-muted-foreground">{r.customer_phone}</div>
                        )}
                      </td>
                      <td className="py-2 px-4 font-mono text-xs">{r.garment_code ?? r.garment_id.slice(0, 8)}</td>
                      <td className="py-2 px-4">
                        {r.garment_type && (
                          <span className={PILL}>
                            {TYPE_LABEL[r.garment_type] ?? r.garment_type}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-xs">{r.trip_number ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Main Page ---

export default function DispatchOrderPage() {
  const queryClient = useQueryClient();
  const bulkRedispatchRef = useRef<(() => void) | null>(null);
  const [activeTab, setActiveTab] = useState("new-orders");
  const [updatingOrderIds, setUpdatingOrderIds] = useState<Set<number>>(
    new Set(),
  );
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const {
    data: ordersResponse,
    isLoading,
    isError,
    error,
  } = useQuery<ApiResponse<OrderWithDetails[]>>({
    queryKey: ["dispatchOrders", getBrand()],
    queryFn: async () => {
      const response = await getOrdersForDispatch();
      return response as ApiResponse<OrderWithDetails[]>;
    },
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  // The server-side !inner join on trip_number = 0 means the nested `garments`
  // array already contains only undispatched garments. Still, filter here as a
  // belt-and-braces check so a row with no garments never leaks through.
  const orders = (ordersResponse?.data || [])
    .filter((o) => (o.garments?.length ?? 0) > 0);

  // Count for return tab badge
  const { data: redispatchResponse } = useQuery<ApiResponse<any[]>>({
    queryKey: ["redispatchGarments", getBrand()],
    queryFn: () => getGarmentsForRedispatch(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
  const returnData = redispatchResponse?.data;
  const returnCount = returnData?.length || 0;

  // Cross-link sets: which order ids appear in both queues, so each tab can
  // point staff at the other half of the same order.
  const returningOrderIds = useMemo(() => {
    const s = new Set<number>();
    const items = (returnData ?? []) as Array<{ order_id?: number | null; orders?: { id?: number | null } | null }>;
    for (const g of items) {
      const id = g.orders?.id ?? g.order_id;
      if (id != null) s.add(id);
    }
    return s;
  }, [returnData]);
  const newOrderIds = useMemo(
    () => new Set<number>(orders.map((o) => o.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordersResponse?.data],
  );

  // Count for in-transit tab badge
  const { data: transitResponse } = useQuery<ApiResponse<OrderWithDetails[]>>({
    queryKey: ["inTransitToWorkshop", getBrand()],
    queryFn: async () => {
      const response = await getInTransitToWorkshopOrders();
      return response as ApiResponse<OrderWithDetails[]>;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
  const transitOrders = transitResponse?.data || [];
  const transitGarmentCount = transitOrders.reduce((sum, o) => sum + (o.garments?.length || 0), 0);
  const lostGarmentCount = transitOrders.reduce((sum, o) => sum + (o.garments?.filter(g => g.location === "lost_in_transit").length || 0), 0);

  const handleDispatch = async (orderId: number, garmentIds?: string[]) => {
    setUpdatingOrderIds((prev) => new Set(prev).add(orderId));
    try {
      await dispatchOrder(orderId, garmentIds);
      await queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
      await queryClient.invalidateQueries({ queryKey: ["inTransitToWorkshop"] });
      await queryClient.invalidateQueries({ queryKey: ["dispatchHistory"] });
    } catch (err) {
      console.error("Failed to dispatch order:", err);
      toast.error(`Could not dispatch Order #${orderId}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUpdatingOrderIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const handleBulkDispatch = async () => {
    if (orders.length === 0 || isBulkUpdating) return;
    setIsBulkUpdating(true);
    const orderIds = orders.map(o => o.id);

    try {
      await Promise.all(orderIds.map(id => dispatchOrder(id)));
      await queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
    } catch (err) {
      toast.error(`Bulk dispatch failed for some orders: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return (
    <ErrorBoundary showDetails={true}>
      <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-5">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">
              Dispatch Center
            </h1>
            <p className="text-sm text-muted-foreground">
               Send garments to the workshop
            </p>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === "new-orders" && (
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={handleBulkDispatch}
                disabled={orders.length === 0 || isLoading || isBulkUpdating}
              >
                <PackageCheck className="w-4 h-4 mr-2" />
                Dispatch all
              </Button>
            )}
            {activeTab === "return-workshop" && returnCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => bulkRedispatchRef.current?.()}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Dispatch all ({returnCount})
              </Button>
            )}
          </div>
        </div>

        <TabsPrimitive.Root
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col md:flex-row md:gap-6"
        >
          <DispatchTabsList value={activeTab}>
            <DispatchTab value="new-orders" label="New orders" count={orders.length} />
            <DispatchTab value="return-workshop" label="Return to workshop" count={returnCount} />
            <DispatchTab
              value="in-transit"
              label="In transit"
              count={transitGarmentCount}
              alertCount={lostGarmentCount}
            />
            <DispatchTab value="history" label="History" icon={History} />
          </DispatchTabsList>

          <div className="flex-1 min-w-0 mt-5 md:mt-0">
            <TabsPrimitive.Content value="new-orders" className="outline-none">
              {isLoading ? (
                <TabLoading count={4} />
              ) : isError ? (
                <TabError error={error} onRetry={() => queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] })} />
              ) : orders.length === 0 ? (
                <TabEmptyState icon={PackageCheck} title="Queue is empty" subtitle="No pending dispatches at this time" />
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <OrderListItem
                      key={order.id}
                      order={order}
                      onDispatch={handleDispatch}
                      isUpdating={updatingOrderIds.has(order.id)}
                      hasReturning={returningOrderIds.has(order.id)}
                      onGoToTab={setActiveTab}
                    />
                  ))}
                </div>
              )}
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="return-workshop" className="outline-none">
              <ReturnToWorkshopTab
                bulkDispatchRef={bulkRedispatchRef}
                newOrderIds={newOrderIds}
                onGoToTab={setActiveTab}
              />
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="in-transit" className="outline-none">
              <InTransitToWorkshopTab />
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="history" className="outline-none">
              <DispatchHistoryTab />
            </TabsPrimitive.Content>
          </div>
        </TabsPrimitive.Root>
      </div>
    </ErrorBoundary>
  );
}

// Underline-style tabs with a single sliding indicator. Horizontal underline
// on mobile, vertical left bar on desktop. The indicator is measured against
// the active trigger and animates between positions.
function DispatchTabsList({ value, children }: { value: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<
    | { top: number; left: number; width: number; height: number; vertical: boolean }
    | null
  >(null);

  useLayoutEffect(() => {
    const measure = () => {
      const list = ref.current;
      if (!list) return;
      const active = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!active) {
        setIndicator(null);
        return;
      }
      const vertical = window.matchMedia('(min-width: 768px)').matches;
      const listRect = list.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      setIndicator(
        vertical
          ? {
              vertical: true,
              top: activeRect.top - listRect.top,
              left: 0,
              width: 2,
              height: activeRect.height,
            }
          : {
              vertical: false,
              top: 0,
              left: activeRect.left - listRect.left + list.scrollLeft,
              width: activeRect.width,
              height: 2,
            }
      );
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [value]);

  return (
    <TabsPrimitive.List
      ref={ref}
      className="relative flex md:flex-col md:w-48 shrink-0 border-b md:border-b-0 md:border-r border-border overflow-x-auto md:overflow-visible"
    >
      {indicator && (
        <div
          className="absolute bg-primary transition-all duration-250 ease-out pointer-events-none"
          style={{
            top: indicator.vertical ? indicator.top : 'auto',
            bottom: indicator.vertical ? 'auto' : -1,
            left: indicator.left,
            width: indicator.width,
            height: indicator.height,
          }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  );
}

function DispatchTab({
  value,
  label,
  count,
  alertCount,
  icon: Icon,
}: {
  value: string;
  label: string;
  count?: number;
  alertCount?: number;
  icon?: React.ElementType;
}) {
  const hasAlert = alertCount != null && alertCount > 0;
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        "group inline-flex items-center justify-between gap-3 px-4 py-2.5 text-[15px] font-medium whitespace-nowrap transition-colors outline-none cursor-pointer",
        "text-muted-foreground hover:text-foreground",
        "data-[state=active]:text-foreground"
      )}
    >
      <span className="flex items-center gap-1.5">
        {Icon && <Icon className="w-4 h-4" />}
        {label}
      </span>
      {count != null && count > 0 && (
        <span className={cn(
          "text-sm tabular-nums",
          hasAlert ? "text-destructive font-medium" : "text-muted-foreground group-data-[state=active]:text-foreground/80"
        )}>
          {count}{hasAlert ? ` (${alertCount})` : ""}
        </span>
      )}
    </TabsPrimitive.Trigger>
  );
}
