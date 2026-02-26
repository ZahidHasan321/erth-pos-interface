"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  PackageCheck,
  User,
  Phone,
  Hash,
  ChevronRight,
  Clock,
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/global/error-boundary";

// API and Types
import { getOrdersList, updateOrder } from "@/api/orders";
import type { Order, Customer, Garment } from "@repo/database";
import type { ApiResponse } from "@/types/api";
import { cn } from "@/lib/utils";

import { PAGE_VARIANTS, ITEM_VARIANTS } from "@/lib/constants/animations";

interface OrderWithDetails extends Order {
    customer?: Customer;
    garments?: Garment[];
}
interface OrderCardProps {
  order: OrderWithDetails;
  onDispatch: (orderId: number) => Promise<void>;
  isUpdating: boolean;
}

function OrderListItem({ order, onDispatch, isUpdating }: OrderCardProps) {
  const numGarments = order.garments?.length || order.num_of_fabrics || 0;
  
  const handleDispatch = async () => {
    if (!isUpdating) {
      await onDispatch(order.id);
    }
  };

  const orderDate = order.order_date ? new Date(order.order_date).toLocaleDateString() : "No Date";

  return (
    <motion.div
      layout
      variants={ITEM_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="group"
    >
      <Card className={cn(
        "relative overflow-hidden transition-all duration-300 border-l-4 py-0 gap-0 border-l-transparent hover:border-l-primary/40 hover:bg-muted/30"
      )}>
        <CardContent className="p-0">
          <div className="flex flex-col md:flex-row items-stretch md:items-center min-h-[80px]">
            
            {/* 1. Identification Segment */}
            <div className="flex-1 px-5 py-3 border-r border-border/40 min-w-[200px]">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-1.5 rounded-lg transition-colors bg-primary/10 text-primary">
                  <Hash className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    Order #{order.id}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium mt-0.5">
                    <span className="text-primary/80">Inv #{order.invoice_number || "—"}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <Clock className="w-2.5 h-2.5" />
                    <span>{orderDate}</span>
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="text-[9px] uppercase font-bold px-1.5 py-0 border-primary/20 bg-primary/5 text-primary">
                {order.production_stage?.replace(/_/g, " ") || "No Stage"}
              </Badge>
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
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Workload</span>
                <Badge variant="secondary" className="font-black text-[10px] px-2 py-0.5">{numGarments} Pieces</Badge>
              </div>
            </div>

            {/* 4. Action Segment */}
            <div className="w-full md:w-[160px] md:ml-auto px-5 py-3 flex items-center justify-center bg-muted/5">
              <Button
                className={cn(
                  "w-full h-10 md:h-11 font-bold uppercase tracking-wider shadow-md group-hover:scale-[1.02] transition-transform"
                )}
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
            </div>

          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function DispatchOrderPage() {
  const queryClient = useQueryClient();
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
        production_stage: "order_at_shop",
        checkout_status: "confirmed",
        order_type: "WORK"
      });
      return response as ApiResponse<OrderWithDetails[]>;
    },
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  const orders = ordersResponse?.data || [];

  const handleDispatch = async (orderId: number) => {
    setUpdatingOrderIds((prev) => new Set(prev).add(orderId));
    try {
      await updateOrder(
        { production_stage: "sent_to_workshop" },
        orderId,
      );
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
        Promise.all(orderIds.map(id => updateOrder({ production_stage: "sent_to_workshop" }, id))),
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
      <motion.div
        variants={PAGE_VARIANTS}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="container mx-auto p-4 md:p-8 space-y-8 max-w-6xl"
      >
        <motion.div
          variants={ITEM_VARIANTS}
          className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b-2 border-border pb-6"
        >
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">
              Dispatch Center
            </h1>
            <p className="text-sm text-muted-foreground">
               Waiting for Workshop Transmission • {orders.length} ACTIVE ORDERS
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="font-black uppercase tracking-widest border-2 hover:bg-primary hover:text-white transition-colors h-10 px-6"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] })
              }
              disabled={isLoading}
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isLoading && "animate-spin")} />
              Sync
            </Button>
            <Button
              size="sm"
              className="font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white h-10 px-6 shadow-md"
              onClick={handleBulkDispatch}
              disabled={orders.length === 0 || isLoading || isBulkUpdating}
            >
              <PackageCheck className="w-4 h-4 mr-2" />
              Dispatch All
            </Button>
          </div>
        </motion.div>

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
            <AnimatePresence mode="popLayout">
              {orders.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-20 text-center"
                >
                  <div className="inline-flex p-6 bg-muted/30 rounded-full mb-6 border-2 border-dashed border-border">
                    <PackageCheck className="w-12 h-12 text-muted-foreground/40" />
                  </div>
                  <h2 className="text-xl font-bold text-muted-foreground">Queue is Empty</h2>
                  <p className="text-sm text-muted-foreground/60 font-medium mt-1 uppercase tracking-wider">No pending dispatches at this time</p>
                </motion.div>
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
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </ErrorBoundary>
  );
}
