"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Package,
  Send,
  RefreshCw,
  CheckCircle2,
  PackageCheck,
  Inbox,
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/global/error-boundary";

// API and Types
import { searchOrders, updateOrder } from "@/api/orders";
import type { Order } from "@/types/order";
import type { ApiResponse } from "@/types/api";
import { FatouraStage } from "@/types/stages";

interface OrderCardProps {
  order: Order;
  onDispatch: (orderId: string) => Promise<void>;
  isUpdating: boolean;
}

function OrderCard({ order, onDispatch, isUpdating }: OrderCardProps) {
  const numFabrics = order.fields.NumOfFabrics ?? 0;
  const [checkedStates, setCheckedStates] = useState<boolean[]>(
    Array.from({ length: numFabrics }, () => false),
  );

  const allChecked = numFabrics === 0 || checkedStates.every(Boolean);
  const orderId = order.fields.OrderID ?? "N/A";
  const fatoura = order.fields.Fatoura ?? "N/A";

  const handleCheckboxChange = (index: number, checked: boolean) => {
    setCheckedStates((prev) => {
      const newStates = [...prev];
      newStates[index] = checked;
      return newStates;
    });
  };

  const handleDispatch = async () => {
    if (allChecked && !isUpdating) {
      await onDispatch(order.id);
      // Reset checkboxes after successful dispatch
      setCheckedStates(Array.from({ length: numFabrics }, () => false));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="w-full h-full flex flex-col transition-all hover:shadow-lg hover:border-primary/30">
        <CardHeader className="pb-3 bg-card border-b border-border">
          <div className="flex justify-between items-start gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg font-semibold text-foreground">
                  Order #{orderId}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Fatoura: <span className="font-medium">{fatoura}</span>
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">
              {order.fields.FatouraStages}
            </Badge>
          </div>
        </CardHeader>

        {/* uniform body: grows and scrolls if needed */}
        <CardContent className="flex-1 flex flex-col space-y-4">
          <div className="flex-1 flex flex-col space-y-3 min-h-0">
            <div className="flex items-center gap-2 shrink-0">
              <PackageCheck className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">
                Piece Check ({numFabrics}{" "}
                {numFabrics === 1 ? "piece" : "pieces"})
              </p>
            </div>

            {numFabrics > 0 ? (
              <div className="flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Array.from({ length: numFabrics }).map((_, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className={`flex items-center space-x-2 p-3 rounded-lg border transition-all ${
                        checkedStates[index]
                          ? "bg-primary/10 border-primary/30"
                          : "bg-muted/20 border-border hover:bg-muted/40"
                      }`}
                    >
                      <Checkbox
                        id={`${order.id}-piece-${index}`}
                        checked={checkedStates[index]}
                        onCheckedChange={(checked) =>
                          handleCheckboxChange(index, checked as boolean)
                        }
                        disabled={isUpdating}
                      />
                      <label
                        htmlFor={`${order.id}-piece-${index}`}
                        className="text-sm font-medium cursor-pointer select-none flex items-center gap-1.5"
                      >
                        {checkedStates[index] && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                        )}
                        Piece {index + 1}
                      </label>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-4 bg-muted/20 rounded-lg border border-border">
                <Inbox className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No pieces to check (0 fabrics)
                </p>
              </div>
            )}
          </div>

          <Button
            className="self-end"
            onClick={handleDispatch}
            disabled={!allChecked || isUpdating}
            variant={allChecked ? "default" : "secondary"}
          >
            <Send className="w-4 h-4 mr-2" />
            {isUpdating ? "Dispatching..." : "Dispatch"}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ----------  Page remains untouched  ---------- */
export default function DispatchOrderPage() {
  const queryClient = useQueryClient();
  const [updatingOrderIds, setUpdatingOrderIds] = useState<Set<string>>(
    new Set(),
  );

  const {
    data: ordersResponse,
    isLoading,
    isError,
    error,
  } = useQuery<ApiResponse<Order[]>>({
    queryKey: ["dispatchOrders"],
    queryFn: async () => {
      const response = await searchOrders({
        FatouraStages: FatouraStage.OrderAtShop as string,
        OrderStatus: "Completed",
      });
      return response;
    },
  });

  const orders = ordersResponse?.data || [];

  const handleDispatch = async (orderId: string) => {
    setUpdatingOrderIds((prev) => new Set(prev).add(orderId));
    try {
      await updateOrder(
        { FatouraStages: FatouraStage.SentToWorkshop },
        orderId,
      );
      toast.success(`Order dispatched successfully!`);
      await queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] });
    } catch (error) {
      console.error("Failed to dispatch order:", error);
      toast.error("Failed to dispatch order. Please try again.");
    } finally {
      setUpdatingOrderIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <ErrorBoundary showDetails={true}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="container mx-auto p-6 md:p-10 space-y-8 max-w-7xl"
      >
        <motion.div
          variants={itemVariants}
          className="flex flex-col md:flex-row md:justify-between md:items-center gap-4"
        >
          <div className="space-y-1">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Dispatch Orders
            </h1>
            {isLoading ? (
              <Skeleton className="h-5 w-48" />
            ) : (
              <p className="text-sm text-muted-foreground">
                Ready to send {orders.length} order
                {orders.length !== 1 ? "s" : ""} to production
              </p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] })
            }
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-8">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-destructive/10 rounded-lg">
                  <Package className="w-6 h-6 text-destructive" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="font-semibold text-destructive text-lg">
                      Error loading orders
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {error?.message}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["dispatchOrders"] })}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {orders.length === 0 ? (
              <div className="col-span-full">
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-12">
                    <div className="text-center space-y-4">
                      <div className="flex justify-center">
                        <div className="p-4 bg-primary/10 rounded-full">
                          <CheckCircle2 className="w-12 h-12 text-primary" />
                        </div>
                      </div>
                      <div>
                        <p className="text-xl font-semibold text-foreground mb-2">
                          All caught up!
                        </p>
                        <p className="text-sm text-muted-foreground">
                          No orders with "Fatoura Received" and "Completed" status
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              orders.map((order) => (
                <ErrorBoundary
                  key={order.id}
                  fallback={
                    <Card className="border-destructive/30 bg-destructive/5">
                      <CardContent className="p-6 text-center">
                        <p className="text-destructive font-semibold text-sm">
                          Failed to load order
                        </p>
                      </CardContent>
                    </Card>
                  }
                >
                  <OrderCard
                    order={order}
                    onDispatch={handleDispatch}
                    isUpdating={updatingOrderIds.has(order.id)}
                  />
                </ErrorBoundary>
              ))
            )}
          </motion.div>
        )}
      </motion.div>
    </ErrorBoundary>
  );
}
