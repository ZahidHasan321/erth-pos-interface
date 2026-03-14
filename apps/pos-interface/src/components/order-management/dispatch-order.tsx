"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
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
  Clock,
  RotateCcw,
  MessageSquare,
  Loader2,
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/global/error-boundary";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// API and Types
import { getOrdersList, dispatchOrder } from "@/api/orders";
import { getGarmentsForRedispatch, dispatchGarmentToWorkshop } from "@/api/garments";
import type { Order, Customer, Garment } from "@repo/database";
import type { ApiResponse } from "@/types/api";
import { cn } from "@/lib/utils";

interface OrderWithDetails extends Order {
    customer?: Customer;
    garments?: Garment[];
}
interface OrderCardProps {
  order: OrderWithDetails;
  onDispatch: (orderId: number) => Promise<void>;
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

  const brovaCount = garments.filter(g => g.garment_type === "brova").length;
  const finalCount = garments.filter(g => g.garment_type === "final").length;

  const handleDispatch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isUpdating) {
      await onDispatch(order.id);
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
          className="flex flex-col md:flex-row items-stretch md:items-center min-h-[80px] cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >

          {/* 1. Identification Segment */}
          <div className="flex-1 px-5 py-3 border-r border-border/40 min-w-[200px]">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-1.5 rounded-lg transition-colors bg-primary/10 text-primary">
                <Hash className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold">
                  Order {order.id}
                </h3>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium mt-0.5">
                  <span className="text-primary/80">Inv {order.invoice_number || "—"}</span>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                  <Clock className="w-2.5 h-2.5" />
                  <span>{orderDate}</span>
                </div>
              </div>
            </div>
            {order.order_phase && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] uppercase font-black px-2 py-0.5 border-none shadow-xs",
                  PHASE_STYLE[order.order_phase as string] || "bg-muted text-muted-foreground"
                )}
              >
                {order.order_phase === "new" ? "New" : order.order_phase === "in_progress" ? "In Progress" : order.order_phase === "completed" ? "Completed" : order.order_phase}
              </Badge>
            )}
          </div>

          {/* 2. Customer Info Segment */}
          <div className="flex-[1.5] px-5 py-3 border-r border-border/40 bg-muted/10">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <div className="p-1 bg-background rounded-full border border-border">
                  <User className="w-3 h-3 text-muted-foreground" />
                </div>
                <span className="text-sm font-bold text-foreground truncate">
                  {order.customer?.name || "Unknown Customer"}
                </span>
              </div>
              {order.customer?.phone && (
                <div className="flex items-center gap-2.5 ml-1">
                  <Phone className="w-2.5 h-2.5 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground">{order.customer.phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* 3. Pieces Info Segment */}
          <div className="flex-[1.2] px-5 py-3 border-r border-border/40">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Workload</span>
                <Badge variant="secondary" className="font-black text-[10px] px-2 py-0.5">{numGarments} Pieces</Badge>
              </div>
              <div className="flex items-center gap-2">
                {brovaCount > 0 && (
                  <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                    {brovaCount} Brova
                  </span>
                )}
                {finalCount > 0 && (
                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                    {finalCount} Final
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 4. Action Segment */}
          <div className="w-full md:w-[200px] md:ml-auto px-5 py-3 flex items-center justify-center gap-3 bg-muted/5">
            <Button
              className="w-full h-10 md:h-11 font-bold uppercase tracking-wider shadow-md hover:scale-[1.02] transition-transform"
              onClick={handleDispatch}
              disabled={isUpdating}
            >
              {isUpdating ? (
                 <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <span>Dispatch</span>
                  <ChevronRight className="w-3.5 h-3.5 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-2 hover:bg-muted rounded-lg transition-colors shrink-0"
            >
              <ChevronDown className={cn(
                "size-4 text-muted-foreground transition-transform duration-300",
                isExpanded && "rotate-180"
              )} />
            </button>
          </div>
        </div>

        {/* Expanded garment table */}
        {isExpanded && garments.length > 0 && (
          <div className="border-t-2 border-border/40 bg-muted/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/40">
                  <th className="text-left py-2.5 px-5">Garment</th>
                  <th className="text-left py-2.5 px-5">Type</th>
                  <th className="text-left py-2.5 px-5">Style</th>
                  <th className="text-left py-2.5 px-5">Stage</th>
                  <th className="text-left py-2.5 px-5">Location</th>
                </tr>
              </thead>
              <tbody>
                {garments.map((g) => (
                  <tr key={g.id} className="border-b border-border/20 last:border-b-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-5 font-bold">{g.garment_id}</td>
                    <td className="py-2.5 px-5">
                      <span className={cn(
                        "inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded",
                        g.garment_type === "brova"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-emerald-50 text-emerald-700"
                      )}>
                        {g.garment_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-5 text-muted-foreground">{g.style || "Kuwaiti"}</td>
                    <td className="py-2.5 px-5">
                      <span className="text-[10px] font-bold bg-muted px-2 py-0.5 rounded capitalize">
                        {PIECE_STAGE_LABELS[g.piece_stage as keyof typeof PIECE_STAGE_LABELS] ?? g.piece_stage ?? "—"}
                      </span>
                    </td>
                    <td className="py-2.5 px-5">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded capitalize",
                        g.location === "shop" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"
                      )}>
                        {g.location?.replace(/_/g, " ") || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    queryKey: ["redispatchGarments"],
    queryFn: () => getGarmentsForRedispatch() as Promise<ApiResponse<RedispatchGarment[]>>,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
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
      toast.success(`Garment ${garment.garment_id || garment.id} dispatched to workshop`);
      await queryClient.invalidateQueries({ queryKey: ["redispatchGarments"] });
    } catch {
      toast.error(`Failed to dispatch garment ${garment.garment_id || garment.id}`);
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
      toast.success(`All ${garments.length} garment(s) dispatched to workshop!`);
      await queryClient.invalidateQueries({ queryKey: ["redispatchGarments"] });
    } catch {
      toast.error("Bulk dispatch failed for some garments.");
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
        <CardContent className="p-8 text-center">
          <p className="font-bold text-destructive uppercase tracking-widest mb-4">
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
      <div className="py-20 text-center">
        <div className="inline-flex p-6 bg-muted/30 rounded-full mb-6 border-2 border-dashed border-border">
          <RotateCcw className="w-12 h-12 text-muted-foreground/40" />
        </div>
        <h2 className="text-xl font-bold text-muted-foreground">No Returns Pending</h2>
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
                  <span className="text-[10px] font-bold text-primary/70">Inv {group.invoiceNumber}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <User className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm font-bold">{group.customerName}</span>
                {group.customerPhone && (
                  <>
                    <Phone className="w-2.5 h-2.5 text-muted-foreground ml-2" />
                    <span className="text-[11px] text-muted-foreground">{group.customerPhone}</span>
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
                          "text-[8px] font-black uppercase border-none h-4 px-1.5",
                          g.garment_type === "brova" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                        )}>
                          {g.garment_type}
                        </Badge>
                      </div>

                      {/* Stage */}
                      <Badge className={cn(
                        "text-[9px] font-black uppercase border-none",
                        g.piece_stage === "needs_redo" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {PIECE_STAGE_LABELS[g.piece_stage as keyof typeof PIECE_STAGE_LABELS] ?? g.piece_stage}
                      </Badge>

                      {/* Trip number */}
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {(g.trip_number || 1) > 1 ? `Alt ${(g.trip_number || 1) - 1}` : "1st trip"}
                      </span>

                      {/* Feedback context */}
                      {feedback && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
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
                          className="font-black uppercase tracking-widest text-[10px] h-8 border-2 border-amber-500/50 hover:bg-amber-50 hover:border-amber-500"
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
    queryKey: ["dispatchOrders"],
    queryFn: async () => {
      const response = await getOrdersList({
        order_phase: "new",
        checkout_status: "confirmed",
        order_type: "WORK"
      });
      return response as ApiResponse<OrderWithDetails[]>;
    },
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  const orders = ordersResponse?.data || [];

  // Count for return tab badge
  const { data: redispatchResponse } = useQuery<ApiResponse<any[]>>({
    queryKey: ["redispatchGarments"],
    queryFn: () => getGarmentsForRedispatch(),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  });
  const returnCount = redispatchResponse?.data?.length || 0;

  const handleDispatch = async (orderId: number) => {
    setUpdatingOrderIds((prev) => new Set(prev).add(orderId));
    try {
      await dispatchOrder(orderId);
      toast.success(`Order #${orderId} dispatched successfully!`);
      await queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
    } catch (error) {
      console.error("Failed to dispatch order:", error);
      toast.error(`Failed to dispatch Order #${orderId}`);
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
      toast.promise(
        Promise.all(orderIds.map(id => dispatchOrder(id))),
        {
          loading: `Dispatching ${orders.length} orders to workshop...`,
          success: () => {
             queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
             return `All ${orders.length} orders dispatched successfully!`;
          },
          error: "Bulk dispatch failed for some orders."
        }
      );
    } catch (error) {
      console.error("Bulk dispatch error:", error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  return (
    <ErrorBoundary showDetails={true}>
      <div className="container mx-auto p-4 md:p-8 space-y-8 max-w-6xl">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b-2 border-border pb-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">
              Dispatch Center
            </h1>
            <p className="text-sm text-muted-foreground">
               Workshop Transmission Hub
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="font-black uppercase tracking-widest border-2 hover:bg-primary hover:text-white transition-colors h-10 px-6"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
                queryClient.invalidateQueries({ queryKey: ["redispatchGarments"] });
              }}
              disabled={isLoading}
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isLoading && "animate-spin")} />
              Sync
            </Button>
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
          <TabsList className="h-auto bg-muted/50 p-1 rounded-xl">
            <TabsTrigger
              value="new-orders"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm font-black uppercase tracking-widest text-xs px-6 py-2.5 rounded-lg"
            >
              New Orders
              {orders.length > 0 && (
                <Badge className="ml-2 bg-primary text-primary-foreground font-black text-[10px] h-5 px-1.5">
                  {orders.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="return-workshop"
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm font-black uppercase tracking-widest text-xs px-6 py-2.5 rounded-lg"
            >
              Return to Workshop
              {returnCount > 0 && (
                <Badge className="ml-2 bg-amber-500 text-white font-black text-[10px] h-5 px-1.5">
                  {returnCount}
                </Badge>
              )}
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
                <CardContent className="p-8 text-center">
                   <p className="font-bold text-destructive uppercase tracking-widest mb-4">Error: {error instanceof Error ? error.message : "Fetch Failed"}</p>
                   <Button variant="outline" className="font-bold" onClick={() => queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] })}>
                      Retry Connection
                   </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {orders.length === 0 ? (
                  <div className="py-20 text-center">
                    <div className="inline-flex p-6 bg-muted/30 rounded-full mb-6 border-2 border-dashed border-border">
                      <PackageCheck className="w-12 h-12 text-muted-foreground/40" />
                    </div>
                    <h2 className="text-xl font-bold text-muted-foreground">Queue is Empty</h2>
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
        </Tabs>
      </div>
    </ErrorBoundary>
  );
}
