"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useLayoutEffect, useMemo } from "react";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import {
  RefreshCw,
  PackageCheck,
  User,
  Phone,
  Hash,
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
import { Badge } from "@repo/ui/badge";
import { Checkbox } from "@repo/ui/checkbox";
import { Skeleton } from "@repo/ui/skeleton";
import { ErrorBoundary } from "@/components/global/error-boundary";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";

// API and Types
import { getOrdersForDispatch, dispatchOrder, getInTransitToWorkshopOrders, getDispatchHistory, getBrand, type DispatchHistoryRow } from "@/api/orders";
import { getGarmentsForRedispatch, dispatchGarmentToWorkshop } from "@/api/garments";
import type { Order, Customer, Garment } from "@repo/database";
import type { ApiResponse } from "@/types/api";
import { cn, clickableProps } from "@/lib/utils";

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
}

const PHASE_STYLE: Record<string, string> = {
    new: "bg-gray-100 text-gray-700",
    in_progress: "bg-amber-100 text-amber-700",
    completed: "bg-emerald-100 text-emerald-700",
};

function OrderListItem({ order, onDispatch, isUpdating }: OrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const garments = order.garments || [];
  const numGarments = garments.length || order.num_of_fabrics || 0;

  // All garments pre-selected by default
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(garments.map(g => g.id))
  );

  const toggleGarment = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  };

  const allSelected = garments.length > 0 && selectedIds.size === garments.length;
  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(garments.map(g => g.id)) : new Set());
  };

  const brovaCount = garments.filter(g => g.garment_type === "brova").length;
  const finalCount = garments.filter(g => g.garment_type === "final").length;

  const handleDispatch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isUpdating && selectedIds.size > 0) {
      const ids = [...selectedIds];
      // Pass garment IDs only if not all are selected
      await onDispatch(order.id, ids.length < garments.length ? ids : undefined);
    }
  };

  const orderDate = order.order_date ? new Date(order.order_date).toLocaleDateString() : "No Date";

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-300 border-l-4 py-0 gap-0",
      isExpanded ? "border-l-primary shadow-md" : "border-l-transparent hover:border-l-primary/40 hover:bg-muted/30"
    )}>
      <CardContent className="p-0">
        <div
          className="cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
          {...clickableProps(() => setIsExpanded(!isExpanded))}
        >
          {/* Desktop (lg+): single row */}
          <div className="hidden lg:flex items-center min-h-[64px]">
            <div className="flex-1 px-4 py-2.5 border-r border-border/40 min-w-[180px]">
              <div className="flex items-center gap-2.5 mb-0.5">
                <div className="p-1 rounded-md bg-primary/10 text-primary">
                  <Hash className="w-3 h-3" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Order {order.id}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                    <span className="text-primary/80">Inv {order.invoice_number || "—"}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span>{orderDate}</span>
                  </div>
                </div>
              </div>
              {order.order_phase && (
                <Badge variant="outline" className={cn("text-[10px] uppercase font-black px-1.5 py-0 h-4 border-none shadow-xs", PHASE_STYLE[order.order_phase as string] || "bg-muted text-muted-foreground")}>
                  {order.order_phase === "new" ? "New" : order.order_phase === "in_progress" ? "In Progress" : order.order_phase === "completed" ? "Completed" : order.order_phase}
                </Badge>
              )}
            </div>
            <div className="flex-[1.5] px-4 py-2.5 border-r border-border/40 bg-muted/10">
              <div className="flex items-center gap-2">
                <User className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-sm font-bold truncate">{order.customer?.name || "Unknown Customer"}</span>
                {order.customer?.phone && <span className="text-xs text-muted-foreground font-medium shrink-0">{order.customer.phone}</span>}
              </div>
            </div>
            <div className="flex-[1.2] px-4 py-2.5 border-r border-border/40">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="font-black text-xs px-2 py-0 h-5">{numGarments} Pcs</Badge>
                {brovaCount > 0 && <span className="text-[11px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{brovaCount} Brova</span>}
                {finalCount > 0 && <span className="text-[11px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{finalCount} Final</span>}
                {garments.some(g => g.express) && <span className="text-[11px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Express</span>}
              </div>
            </div>
            <div className="w-[210px] px-4 py-2.5 flex items-center gap-2 bg-muted/5">
              <Button className="flex-1 h-9 font-bold uppercase tracking-wider text-xs shadow-sm" onClick={handleDispatch} disabled={isUpdating || selectedIds.size === 0}>
                {isUpdating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><span>Dispatch{selectedIds.size < garments.length ? ` (${selectedIds.size})` : ""}</span><ChevronRight className="w-3 h-3 ml-1" /></>}
              </Button>
              <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0" aria-label={isExpanded ? "Collapse" : "Expand"} aria-expanded={isExpanded}>
                <ChevronDown className={cn("size-4 text-muted-foreground", isExpanded && "rotate-180")} />
              </button>
            </div>
          </div>

          {/* Tablet + Mobile (<lg): compact 2-row grid */}
          <div className="lg:hidden px-3 sm:px-4 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold shrink-0">#{order.id}</span>
                <span className="text-[11px] text-primary/80 font-medium shrink-0">Inv {order.invoice_number || "—"}</span>
                {order.order_phase && (
                  <Badge variant="outline" className={cn("text-[10px] uppercase font-black px-1.5 py-0 h-4 border-none shadow-xs", PHASE_STYLE[order.order_phase as string] || "bg-muted text-muted-foreground")}>
                    {order.order_phase === "new" ? "New" : order.order_phase === "in_progress" ? "In Progress" : "Completed"}
                  </Badge>
                )}
                <div className="w-px h-3.5 bg-border/40 shrink-0" />
                <User className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-sm font-bold truncate">{order.customer?.name || "Unknown"}</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="p-1.5 hover:bg-muted rounded-md transition-colors shrink-0" aria-expanded={isExpanded}>
                <ChevronDown className={cn("size-4 text-muted-foreground", isExpanded && "rotate-180")} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground">{orderDate}</span>
                {order.customer?.phone && <span className="text-[11px] text-muted-foreground font-medium">{order.customer.phone}</span>}
                <Badge variant="secondary" className="font-black text-[11px] px-1.5 py-0 h-4">{numGarments} Pcs</Badge>
                {brovaCount > 0 && <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{brovaCount}B</span>}
                {finalCount > 0 && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{finalCount}F</span>}
                {garments.some(g => g.express) && <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Exp</span>}
              </div>
              <Button className="h-8 px-4 font-bold uppercase tracking-wider text-xs shadow-sm shrink-0" onClick={handleDispatch} disabled={isUpdating || selectedIds.size === 0}>
                {isUpdating ? <RefreshCw className="w-3 h-3 animate-spin" /> : `Dispatch${selectedIds.size < garments.length ? ` (${selectedIds.size})` : ""}`}
              </Button>
            </div>
          </div>
        </div>

        {/* Expanded garment cards */}
        {garments.length > 0 && isExpanded && (
          <div className="border-t-2 border-border/40 bg-muted/5 p-3">
            <div className="flex items-center gap-2 mb-2 px-1">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => toggleAll(!!checked)}
              />
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Select All</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {garments.map((g) => {
                const isSelected = selectedIds.has(g.id);
                return (
                  <div
                    key={g.id}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border border-border/50 bg-background p-3 cursor-pointer hover:bg-muted/20 transition-colors",
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
                        <span className="font-black text-sm">{g.garment_id}</span>
                        <span className={cn(
                          "text-xs font-black uppercase px-1.5 py-0.5 rounded",
                          g.garment_type === "brova" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
                        )}>
                          {g.garment_type}
                        </span>
                        {g.express && (
                          <span className="text-xs font-black uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">Express</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                        <span>{g.style || "Kuwaiti"}</span>
                        {g.fabric_source === "IN" ? (
                          <span className="font-bold text-emerald-700">{g.fabric?.name || "IN"}</span>
                        ) : g.fabric_source === "OUT" ? (
                          <span className="font-bold text-amber-700">OUT</span>
                        ) : null}
                        {g.notes && <span className="truncate max-w-[120px] italic">"{g.notes}"</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
    trip_number: number | null;
    created_at: string | null;
  }>;
}

interface OrderGroup {
  orderId: number;
  invoiceNumber: string | null;
  customerName: string;
  customerPhone: string | null;
  garments: RedispatchGarment[];
}

function ReturnToWorkshopTab({ bulkDispatchRef }: { bulkDispatchRef: React.MutableRefObject<(() => void) | null> }) {
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

  // Group garments by order
  const orderGroups: OrderGroup[] = garments.reduce<OrderGroup[]>((groups, g) => {
    const orderId = g.orders?.id || g.order_id;
    let group = groups.find(gr => gr.orderId === orderId);
    if (!group) {
      group = {
        orderId,
        invoiceNumber: g.orders?.work_orders?.invoice_number != null ? String(g.orders.work_orders.invoice_number) : null,
        customerName: g.orders?.customers?.name || "Unknown Customer",
        customerPhone: g.orders?.customers?.phone || null,
        garments: [],
      };
      groups.push(group);
    }
    group.garments.push(g);
    return groups;
  }, []);

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-4 text-center">
          <p className="font-bold text-destructive uppercase tracking-widest mb-3">
            Error: {error instanceof Error ? error.message : "Fetch Failed"}
          </p>
          <Button variant="outline" className="font-bold" onClick={() => queryClient.invalidateQueries({ queryKey: ["redispatchGarments"] })}>
            Retry Connection
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (orderGroups.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="inline-flex p-6 bg-muted/30 rounded-full mb-3 border-2 border-dashed border-border">
          <RotateCcw className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <h2 className="text-base font-bold text-muted-foreground">No Returns Pending</h2>
        <p className="text-sm text-muted-foreground/60 font-medium mt-1 uppercase tracking-wider">
          No garments need to be sent back to workshop
        </p>
      </div>
    );
  }

  // Expose bulk dispatch to parent via ref
  bulkDispatchRef.current = handleBulkDispatch;

  return (
    <div className="space-y-4">
      {orderGroups.map((group) => (
        <Card key={group.orderId} className="overflow-hidden border-l-4 border-l-amber-500 py-0 gap-0">
          <CardContent className="p-0">
            {/* Order header */}
            <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-muted/20 border-b border-border/40">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">Order {group.orderId}</span>
                {group.invoiceNumber && (
                  <span className="text-xs font-bold text-primary/70">Inv {group.invoiceNumber}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <User className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm font-bold">{group.customerName}</span>
                {group.customerPhone && (
                  <>
                    <Phone className="w-2.5 h-2.5 text-muted-foreground ml-2" />
                    <span className="text-xs text-muted-foreground">{group.customerPhone}</span>
                  </>
                )}
              </div>
            </div>

            {/* Garment rows */}
            <div className="divide-y divide-border/30">
              {group.garments.map((g) => {
                const feedback = getLatestFeedback(g);
                const isDispatching = dispatchingIds.has(g.id);

                return (
                  <div key={g.id} className="px-5 py-3 hover:bg-muted/10 transition-colors">
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Garment identity */}
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <span className="font-black text-sm">{g.garment_id || g.id.slice(0, 8)}</span>
                        <Badge className={cn(
                          "text-xs font-black uppercase border-none h-4 px-1.5",
                          g.garment_type === "brova" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                        )}>
                          {g.garment_type}
                        </Badge>
                      </div>

                      {/* Feedback status */}
                      <Badge className={cn(
                        "text-xs font-black uppercase border-none",
                        (g as any).feedback_status === "needs_redo" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {(g as any).feedback_status === "needs_redo" ? "Needs Redo" : (g as any).feedback_status === "needs_repair" ? "Needs Repair" : PIECE_STAGE_LABELS[g.piece_stage as keyof typeof PIECE_STAGE_LABELS] ?? g.piece_stage}
                      </Badge>

                      {/* Trip label */}
                      <span className="text-xs font-bold text-muted-foreground">
                        {(() => {
                          const trip = g.trip_number || 1;
                          const altNum = g.garment_type === "final" && trip >= 2
                            ? trip - 1
                            : g.garment_type === "brova" && trip >= 4
                              ? trip - 3
                              : null;
                          return altNum !== null ? `Alt ${altNum}` : "1st trip";
                        })()}
                      </span>

                      {/* Feedback context */}
                      {feedback && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MessageSquare className="w-3 h-3" />
                          <span className="font-bold capitalize">{feedback.action?.replace(/_/g, " ")}</span>
                          {feedback.satisfaction_level && (
                            <span>Sat: {feedback.satisfaction_level}/5</span>
                          )}
                          {feedback.notes && (
                            <span className="max-w-[200px] truncate italic">"{feedback.notes}"</span>
                          )}
                        </div>
                      )}

                      {/* Dispatch button */}
                      <div className="ml-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-black uppercase tracking-widest text-xs h-8 border-2 border-amber-500/50 hover:bg-amber-50 hover:border-amber-500"
                          onClick={() => handleDispatchGarment(g)}
                          disabled={isDispatching}
                        >
                          {isDispatching ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                          ) : (
                            <RotateCcw className="w-3 h-3 mr-1.5" />
                          )}
                          Dispatch
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// --- In Transit to Workshop Tab ---

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-4 text-center">
          <p className="font-bold text-destructive uppercase tracking-widest mb-3">
            Error: {error instanceof Error ? error.message : "Fetch Failed"}
          </p>
          <Button variant="outline" className="font-bold" onClick={() => queryClient.invalidateQueries({ queryKey: ["inTransitToWorkshop"] })}>
            Retry Connection
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="inline-flex p-6 bg-muted/30 rounded-full mb-3 border-2 border-dashed border-border">
          <Truck className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <h2 className="text-base font-bold text-muted-foreground">No Garments In Transit</h2>
        <p className="text-sm text-muted-foreground/60 font-medium mt-1 uppercase tracking-wider">
          Nothing is currently on its way to the workshop
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => {
        const garments = order.garments || [];
        const lostCount = garments.filter(g => g.location === "lost_in_transit").length;
        const transitCount = garments.filter(g => g.location === "transit_to_workshop").length;
        const orderDate = order.order_date ? new Date(order.order_date).toLocaleDateString() : "No Date";

        return (
          <Card key={order.id} className={cn(
            "overflow-hidden border-l-4 py-0 gap-0",
            lostCount > 0 ? "border-l-red-500" : "border-l-cyan-500"
          )}>
            <CardContent className="p-0">
              {/* Order header */}
              <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-muted/20 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Hash className="w-3 h-3 text-muted-foreground" />
                  <span className="font-bold text-sm">Order {order.id}</span>
                  {(order as any).invoice_number && (
                    <span className="text-xs font-bold text-primary/70">Inv {(order as any).invoice_number}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{orderDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm font-bold">{(order as any).customer?.name || "Unknown Customer"}</span>
                  {(order as any).customer?.phone && (
                    <>
                      <Phone className="w-2.5 h-2.5 text-muted-foreground ml-2" />
                      <span className="text-xs text-muted-foreground">{(order as any).customer.phone}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  {transitCount > 0 && (
                    <Badge className="bg-cyan-100 text-cyan-700 font-black text-xs border-none">
                      <Truck className="w-3 h-3 mr-1" />
                      {transitCount} In Transit
                    </Badge>
                  )}
                  {lostCount > 0 && (
                    <Badge className="bg-red-100 text-red-700 font-black text-xs border-none">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {lostCount} Lost
                    </Badge>
                  )}
                </div>
              </div>

              {/* Garment table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border/40">
                    <th className="text-left py-2.5 px-5">Garment</th>
                    <th className="text-left py-2.5 px-5">Type</th>
                    <th className="text-left py-2.5 px-5">Stage</th>
                    <th className="text-left py-2.5 px-5">Fabric</th>
                    <th className="text-left py-2.5 px-5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {garments.map((g) => {
                    const isLost = g.location === "lost_in_transit";
                    const trip = g.trip_number || 1;

                    return (
                      <tr key={g.id} className={cn(
                        "border-b border-border/20 last:border-b-0 hover:bg-muted/30 transition-colors",
                        isLost && "bg-red-50/50"
                      )}>
                        <td className="py-2.5 px-5 font-bold">{g.garment_id}</td>
                        <td className="py-2.5 px-5">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "inline-block text-xs font-black uppercase px-2 py-0.5 rounded",
                              g.garment_type === "brova" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
                            )}>
                              {g.garment_type}
                            </span>
                            {trip > 1 && (
                              <span className="text-xs font-bold text-muted-foreground">
                                Trip {trip}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-5 text-xs text-muted-foreground">
                          {PIECE_STAGE_LABELS[g.piece_stage as keyof typeof PIECE_STAGE_LABELS] ?? g.piece_stage}
                        </td>
                        <td className="py-2.5 px-5">
                          {g.fabric_source === "IN" ? (
                            <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                              {(g as any).fabric?.name || "IN"}
                            </span>
                          ) : g.fabric_source === "OUT" ? (
                            <span className="text-xs font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded">OUT</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-5">
                          {isLost ? (
                            <Badge className="bg-red-100 text-red-700 font-black text-xs border-none">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Lost in Transit
                            </Badge>
                          ) : (
                            <Badge className="bg-cyan-100 text-cyan-700 font-black text-xs border-none">
                              <Truck className="w-3 h-3 mr-1" />
                              In Transit
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// --- Dispatch History Tab ---

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
    // Sunday = 0
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
    <div className="relative inline-flex items-center border-2 rounded-lg p-0.5">
      {indicator && (
        <div
          className="absolute top-0.5 bottom-0.5 bg-primary rounded-md shadow-sm transition-all duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {VIEW_MODES.map((m, i) => (
        <button
          key={m}
          ref={el => { buttonsRef.current[i] = el; }}
          onClick={() => onChange(m)}
          className={cn(
            'relative z-10 text-xs font-black uppercase tracking-wider px-4 py-1.5 rounded-md transition-colors duration-300 whitespace-nowrap',
            mode === m ? 'text-white' : 'text-muted-foreground hover:text-foreground'
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
    <div className="relative inline-flex items-center border-2 rounded-lg p-0.5">
      {/* Sliding indicator — hidden until first measurement to avoid a flash at 0,0 */}
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
            'relative z-10 text-xs font-black uppercase tracking-wider px-4 py-1.5 rounded-md transition-colors duration-300 whitespace-nowrap',
            period === p ? 'text-white' : 'text-muted-foreground hover:text-foreground'
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
          isExpanded ? "bg-primary/5" : "hover:bg-muted/20"
        )}
        onClick={() => setIsExpanded(v => !v)}
      >
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-1.5">
            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-300 shrink-0", isExpanded && "rotate-180")} />
            <span className="font-bold text-sm">#{group.orderId}</span>
          </div>
        </td>
        <td className="py-2.5 px-4 text-xs text-muted-foreground">{group.invoiceNumber ?? '—'}</td>
        <td className="py-2.5 px-4">
          <div className="font-bold text-xs">{group.customerName ?? 'Unknown'}</div>
          {group.customerPhone && <div className="text-[10px] text-muted-foreground">{group.customerPhone}</div>}
        </td>
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="font-black text-xs px-2 py-0 h-5">{group.rows.length} Pcs</Badge>
            {brovaCount > 0 && <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{brovaCount}B</span>}
            {finalCount > 0 && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{finalCount}F</span>}
          </div>
        </td>
        <td className="py-2.5 px-4 whitespace-nowrap">
          <div className="font-bold text-xs">{lastDispatch.toLocaleDateString()}</div>
          <div className="text-[10px] text-muted-foreground">{lastDispatch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </td>
      </tr>

      {/* Animated expansion row */}
      <tr className="border-0 hover:bg-transparent">
        <td
          colSpan={5}
          className={cn(
            "p-0 transition-colors",
            isExpanded ? "bg-muted/10 border-b border-border/40 shadow-inner" : "border-0"
          )}
        >
          <div className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}>
            <div className="overflow-hidden">
              <div className="p-3 sm:pl-10">
                <h4 className="text-xs font-bold mb-2 text-foreground flex items-center gap-2">
                  Garments
                  <span className="bg-muted px-1.5 py-0.5 rounded-full text-xs font-black">{group.rows.length}</span>
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {group.rows.map(r => {
                    const d = new Date(r.dispatched_at);
                    return (
                      <div key={r.id} className="p-2 bg-background rounded-lg border border-border/60 text-sm shadow-sm">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="font-mono font-medium text-xs text-muted-foreground">{r.garment_code ?? r.garment_id.slice(0, 8)}</span>
                          {r.garment_type && (
                            <span className={cn(
                              'inline-flex items-center rounded border px-1 py-0 text-xs font-bold',
                              r.garment_type === 'brova'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            )}>
                              {r.garment_type === 'brova' ? 'Brova' : 'Final'}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground text-xs uppercase font-bold">Trip</span>
                            <span className="font-bold text-xs bg-muted px-1.5 py-0.5 rounded">{r.trip_number ?? '—'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground text-xs uppercase font-bold">Time</span>
                            <span className="font-bold text-xs">{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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

        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
          {periodLabel}
        </span>

        <Badge className="bg-cyan-100 text-cyan-700 font-black text-xs border-none">
          {rows.length} dispatched → Workshop
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <ViewModeSwitcher mode={viewMode} onChange={setViewMode} />

          <Button
            size="sm"
            className="font-black uppercase tracking-widest text-xs h-9 bg-primary hover:bg-primary/90"
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
        <h1 className="text-xl font-bold">Dispatch History — {period === 'today' ? 'Today' : period === 'week' ? 'This Week' : 'This Month'}</h1>
        <p className="text-sm text-muted-foreground">
          Shop → Workshop · {periodLabel} · {rows.length} record{rows.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="font-bold text-destructive uppercase tracking-widest mb-3">
              Error: {error instanceof Error ? error.message : 'Fetch Failed'}
            </p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center">
          <div className="inline-flex p-6 bg-muted/30 rounded-full mb-3 border-2 border-dashed border-border">
            <History className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <h2 className="text-base font-bold text-muted-foreground">No Dispatches This Period</h2>
          <p className="text-sm text-muted-foreground/60 font-medium mt-1 uppercase tracking-wider">
            Nothing was dispatched in {periodLabel}
          </p>
        </div>
      ) : viewMode === 'order' ? (
        <Card className="overflow-hidden print:border-0 print:shadow-none">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b-2 border-border bg-muted/20">
                  <th className="text-left py-2.5 px-4">Order</th>
                  <th className="text-left py-2.5 px-4">Invoice</th>
                  <th className="text-left py-2.5 px-4">Customer</th>
                  <th className="text-left py-2.5 px-4">Pieces</th>
                  <th className="text-left py-2.5 px-4">Last Dispatch</th>
                </tr>
              </thead>
              <tbody>
                {orderGroups.map(g => <HistoryOrderGroupRows key={g.orderId} group={g} />)}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden print:border-0 print:shadow-none">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b-2 border-border bg-muted/20">
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
                  const d = new Date(r.dispatched_at);
                  const dateStr = d.toLocaleDateString();
                  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <tr key={r.id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                      <td className="py-2 px-4 whitespace-nowrap">
                        <div className="font-bold text-xs">{dateStr}</div>
                        <div className="text-[10px] text-muted-foreground">{timeStr}</div>
                      </td>
                      <td className="py-2 px-4 font-bold">#{r.order_id}</td>
                      <td className="py-2 px-4 text-xs text-muted-foreground">
                        {r.invoice_number ?? '—'}
                      </td>
                      <td className="py-2 px-4">
                        <div className="font-bold text-xs">{r.customer_name ?? 'Unknown'}</div>
                        {r.customer_phone && (
                          <div className="text-[10px] text-muted-foreground">{r.customer_phone}</div>
                        )}
                      </td>
                      <td className="py-2 px-4 font-mono text-xs">{r.garment_code ?? r.garment_id.slice(0, 8)}</td>
                      <td className="py-2 px-4">
                        {r.garment_type && (
                          <span className={cn(
                            'inline-block text-[10px] font-black uppercase px-1.5 py-0.5 rounded',
                            r.garment_type === 'brova'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-emerald-50 text-emerald-700'
                          )}>
                            {r.garment_type}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-xs font-bold">{r.trip_number ?? '—'}</td>
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
  const returnCount = redispatchResponse?.data?.length || 0;

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
      <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b-2 border-border pb-6">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              Dispatch Center
            </h1>
            <p className="text-sm text-muted-foreground">
               Workshop Transmission Hub
            </p>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === "new-orders" && (
              <Button
                size="sm"
                className="font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white h-10 px-6 shadow-md"
                onClick={handleBulkDispatch}
                disabled={orders.length === 0 || isLoading || isBulkUpdating}
              >
                <PackageCheck className="w-4 h-4 mr-2" />
                Dispatch All
              </Button>
            )}
            {activeTab === "return-workshop" && returnCount > 0 && (
              <Button
                size="sm"
                className="font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-700 text-white h-10 px-6 shadow-md"
                onClick={() => bulkRedispatchRef.current?.()}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Dispatch All ({returnCount})
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="h-auto p-1 rounded-xl w-full md:w-auto">
            <TabsTrigger
              value="new-orders"
              className="font-bold uppercase tracking-wide text-xs px-6 py-2.5 rounded-lg"
            >
              New Orders
              {orders.length > 0 && (
                <Badge className="ml-2 bg-primary/20 text-primary font-bold text-xs h-5 px-1.5">
                  {orders.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="return-workshop"
              className="font-bold uppercase tracking-wide text-xs px-6 py-2.5 rounded-lg"
            >
              Return to Workshop
              {returnCount > 0 && (
                <Badge className="ml-2 bg-amber-500 text-white font-bold text-xs h-5 px-1.5">
                  {returnCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="in-transit"
              className="font-bold uppercase tracking-wide text-xs px-6 py-2.5 rounded-lg"
            >
              In Transit
              {transitGarmentCount > 0 && (
                <Badge className={cn(
                  "ml-2 font-bold text-xs h-5 px-1.5",
                  lostGarmentCount > 0 ? "bg-red-500 text-white" : "bg-cyan-500 text-white"
                )}>
                  {transitGarmentCount}{lostGarmentCount > 0 ? ` (${lostGarmentCount} lost)` : ""}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="font-bold uppercase tracking-wide text-xs px-6 py-2.5 rounded-lg"
            >
              <History className="w-3 h-3 mr-1.5" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new-orders" className="mt-6">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-xl" />
                ))}
              </div>
            ) : isError ? (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="p-4 text-center">
                   <p className="font-bold text-destructive uppercase tracking-widest mb-3">Error: {error instanceof Error ? error.message : "Fetch Failed"}</p>
                   <Button variant="outline" className="font-bold" onClick={() => queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] })}>
                      Retry Connection
                   </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {orders.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="inline-flex p-6 bg-muted/30 rounded-full mb-3 border-2 border-dashed border-border">
                      <PackageCheck className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                    <h2 className="text-base font-bold text-muted-foreground">Queue is Empty</h2>
                    <p className="text-sm text-muted-foreground/60 font-medium mt-1 uppercase tracking-wider">No pending dispatches at this time</p>
                  </div>
                ) : (
                  orders.map((order) => (
                    <OrderListItem
                      key={order.id}
                      order={order}
                      onDispatch={handleDispatch}
                      isUpdating={updatingOrderIds.has(order.id)}
                    />
                  ))
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="return-workshop" className="mt-6">
            <ReturnToWorkshopTab bulkDispatchRef={bulkRedispatchRef} />
          </TabsContent>

          <TabsContent value="in-transit" className="mt-6">
            <InTransitToWorkshopTab />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <DispatchHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
}
