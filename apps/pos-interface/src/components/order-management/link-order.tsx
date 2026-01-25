import {
  searchOrders,
  getPendingOrdersByCustomer,
  updateOrder,
} from "@/api/orders";
import { searchCustomerByPhone, getCustomerByRecordId } from "@/api/customers";
import { useQuery } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, Link as LinkIcon, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

// UI Components
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { OrderSearchForm } from "./order-search-form";
import { ErrorBoundary } from "../global/error-boundary";

import type { Order } from "@/types/order";
import type { Customer } from "@/types/customer";
import type { ApiResponse } from "@/types/api";
import type { FatouraStage } from "@/types/stages";

type SelectedOrder = {
  id: string;
  orderId?: string;
  orderDate?: string;
  reviseDate?: string;
  fatoura?: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  fatouraStage?: FatouraStage;
};

export default function LinkOrder() {
  // --- Search Inputs ---
  const [orderId, setOrderId] = useState<number | undefined>();
  const [fatoura, setFatoura] = useState<number | undefined>();
  const [customerMobile, setCustomerMobile] = useState<number | undefined>();

  // --- Global State ---
  const [reviseDate, setReviseDate] = useState<Date | undefined>();
  const [selectedOrders, setSelectedOrders] = useState<SelectedOrder[]>([]);
  const [primaryOrderId, setPrimaryOrderId] = useState<string | null>(null);

  // --- Customer Info Map ---
  const [customerInfoMap, setCustomerInfoMap] = useState<
    Record<string, Customer | undefined>
  >({});

  // --- Dialog State ---
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [selectedDialogIds, setSelectedDialogIds] = useState<string[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCustomerInfo, setIsLoadingCustomerInfo] = useState(false);

  // --- Single Order Search Query ---
  const { refetch: searchSingleOrder, isFetching: isSearchingSingle } =
    useQuery<ApiResponse<Order[]>>({
      queryKey: ["searchOrder", orderId, fatoura],
      queryFn: () => {
        if (orderId)
          return searchOrders({
            orderId: orderId.toString(),
            orderStatus: "Completed",
          });
        if (fatoura)
          return searchOrders({
            fatoura: fatoura.toString(),
            orderStatus: "Completed",
          });
        throw new Error("Missing search parameter");
      },
      enabled: false,
    });

  // --- Main Form Submit ---
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (customerMobile) {
      setIsSearchingCustomer(true);
      try {
        const customerResponse = await searchCustomerByPhone(
          customerMobile.toString(),
        );

        if (!customerResponse.data || customerResponse.data.length === 0) {
          toast.error("Customer not found with this phone number.");
          return;
        }

        const customerId = customerResponse.data[0].fields.id;
        if (!customerId) {
          toast.error("Customer ID is missing in the record.");
          return;
        }

        const ordersResponse = await getPendingOrdersByCustomer(
          customerId,
          5,
          "Completed",
        );

        if (ordersResponse.data && ordersResponse.data.length > 0) {
          setCustomerOrders(ordersResponse.data);
          setSelectedDialogIds([]);
          setIsDialogOpen(true);
        } else {
          toast.info("No completed orders found for this customer.");
        }
      } catch (error) {
        console.error("Failed to fetch customer orders", error);
        toast.error("Failed to fetch customer orders.");
      } finally {
        setIsSearchingCustomer(false);
      }
      return;
    }

    if (orderId || fatoura) {
      searchSingleOrder().then(({ data }) => {
        if (!data || !data.data || data.data.length === 0) {
          toast.error("No order found with the provided criteria.");
          return;
        }
        addOrdersToSelection([data.data[0]]);
      });
    }
  }

  // --- Helper: Add Orders to Main List ---
  function addOrdersToSelection(orders: Order[]) {
    // Filter out already linked orders
    const nonLinkedOrders = orders.filter((order) => !order.fields.LinkedOrder);

    // Show warning if some orders were skipped
    if (nonLinkedOrders.length < orders.length) {
      const skippedCount = orders.length - nonLinkedOrders.length;
      toast.warning(
        `${skippedCount} order(s) were already linked and skipped.`,
      );
    }

    if (nonLinkedOrders.length === 0) {
      return;
    }

    setSelectedOrders((prev) => {
      const newOrders = nonLinkedOrders
        .filter((order) => !prev.some((p) => p.id === order.id))
        .map((order) => ({
          id: order.id,
          orderId: order.fields.OrderID,
          deliveryDate: order.fields.DeliveryDate,
          reviseDate: reviseDate ? reviseDate.toISOString() : undefined,
          fatoura: order.fields.Fatoura,
          customerId: order.fields.CustomerID?.[0],
          fatouraStage: order.fields.FatouraStages,
        }));
      return [...prev, ...newOrders];
    });

    // Fetch customer info for new orders
    nonLinkedOrders.forEach((order) => {
      if (order.fields.CustomerID?.[0]) {
        fetchCustomerInfo(order.fields.CustomerID[0], order.id);
      }
    });
  }

  // --- Helper: Remove Order ---
  function removeOrder(id: string) {
    setSelectedOrders((prev) => prev.filter((o) => o.id !== id));
    if (primaryOrderId === id) {
      setPrimaryOrderId(null);
    }
    // Clean up customer info
    setCustomerInfoMap((prev) => {
      const newMap = { ...prev };
      delete newMap[id];
      return newMap;
    });
  }

  // --- Fetch Customer Info ---
  async function fetchCustomerInfo(customerId: string, orderId: string) {
    setIsLoadingCustomerInfo(true);
    try {
      const response = await getCustomerByRecordId(customerId);
      if (response.data) {
        setCustomerInfoMap((prev) => ({
          ...prev,
          [orderId]: response.data,
        }));
      } else {
        // Optionally handle missing data
        setCustomerInfoMap((prev) => ({ ...prev }));
      }
    } catch (error) {
      console.error(
        `Failed to fetch customer info for order ${orderId}`,
        error,
      );
    } finally {
      setIsLoadingCustomerInfo(false);
    }
  }

  // --- Dialog Handlers ---
  function toggleDialogSelection(id: string) {
    setSelectedDialogIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  function handleDialogConfirm() {
    const ordersToAdd = customerOrders.filter((o) =>
      selectedDialogIds.includes(o.id),
    );
    addOrdersToSelection(ordersToAdd);
    setIsDialogOpen(false);
  }

  // --- Revise Date Effect ---
  useEffect(() => {
    if (selectedOrders.length > 0 && reviseDate) {
      setSelectedOrders((prev) =>
        prev.map((order) => ({
          ...order,
          reviseDate: reviseDate.toISOString(),
        })),
      );
    }
  }, [reviseDate]);

  // --- Link Orders Handler ---
  async function handleLinkOrders() {
    if (!reviseDate) {
      toast.error("Please select a revise date.");
      return;
    }

    if (!primaryOrderId) {
      toast.error("Please select a primary order.");
      return;
    }

    if (selectedOrders.length < 2) {
      toast.error("Please select at least 2 orders to link.");
      return;
    }

    // Verify all orders are still valid (not already linked)
    const alreadyLinked = selectedOrders.filter((order) => {
      const originalOrder = customerOrders.find((o) => o.id === order.id);
      return originalOrder?.fields.LinkedOrder;
    });

    if (alreadyLinked.length > 0) {
      toast.error(
        `${alreadyLinked.length} order(s) are already linked. Please refresh and try again.`,
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare all update promises
      const updatePromises = selectedOrders.map((order) => {
        const isPrimary = order.id === primaryOrderId;

        // Base update for delivery date
        const updateData: Partial<Order["fields"]> = {
          DeliveryDate: reviseDate.toISOString(),
        };

        // For linked orders, add linking fields
        if (!isPrimary) {
          updateData.LinkedOrder = true;
          updateData.LinkedDate = new Date().toISOString();
          updateData.LinkedTo = [primaryOrderId];
        }

        return updateOrder(updateData, order.id);
      });

      // Execute all updates
      await Promise.all(updatePromises);

      toast.success(`Successfully linked ${selectedOrders.length} orders.`);

      // Reset form
      handleClear();
    } catch (error) {
      console.error("Failed to link orders", error);
      toast.error("Failed to link orders. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // --- Clear Form ---
  function handleClear() {
    setSelectedOrders([]);
    setPrimaryOrderId(null);
    setReviseDate(undefined);
    setCustomerInfoMap({});
    setOrderId(undefined);
    setFatoura(undefined);
    setCustomerMobile(undefined);
    setCustomerOrders([]);
    setSelectedDialogIds([]);
  }

  const isFetching =
    isSearchingSingle || isSearchingCustomer || isLoadingCustomerInfo;
  const hasOrders = selectedOrders.length > 0;
  const canSubmit =
    hasOrders && !!reviseDate && !!primaryOrderId && !isSubmitting;

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

  function handleClearSearch() {
    setOrderId(undefined);
    setFatoura(undefined);
    setCustomerMobile(undefined);
  }

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 p-6 md:p-10 max-w-7xl mx-auto"
    >
      {/* --- Page Header --- */}
      <motion.div variants={itemVariants} className="space-y-1">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Link Orders
        </h1>
        <p className="text-sm text-muted-foreground">
          Link multiple orders together and set a common revise date
        </p>
      </motion.div>

      {/* --- Search Form --- */}
      <ErrorBoundary
        fallback={
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center">
            <p className="text-destructive font-semibold">
              Failed to load search form
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Please refresh the page to try again
            </p>
          </div>
        }
      >
        <OrderSearchForm
          orderId={orderId}
          fatoura={fatoura}
          customerMobile={customerMobile}
          onOrderIdChange={setOrderId}
          onFatouraChange={setFatoura}
          onCustomerMobileChange={setCustomerMobile}
          onSubmit={onSubmit}
          onClear={handleClearSearch}
          isLoading={isFetching}
        />
      </ErrorBoundary>

      {/* --- Revise Date Picker --- */}
      <ErrorBoundary
        fallback={
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center">
            <p className="text-destructive font-semibold">
              Failed to load date picker
            </p>
          </div>
        }
      >
        <motion.div
          variants={itemVariants}
          className={cn(
            "bg-card p-6 rounded-xl border shadow-sm transition-all",
            hasOrders
              ? "border-primary/30 bg-primary/5"
              : "border-border opacity-60",
          )}
        >
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-semibold text-foreground">
                Set Revise Date <span className="text-destructive">*</span>
              </label>
              <p className="text-xs text-muted-foreground">
                This date will be applied to all selected orders
              </p>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!hasOrders}
                  className={cn(
                    "w-full md:w-[280px] justify-start text-left font-normal",
                    !reviseDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {reviseDate ? (
                    format(reviseDate, "PPP")
                  ) : (
                    <span>Pick a revise date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={reviseDate}
                  onSelect={setReviseDate}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </motion.div>
      </ErrorBoundary>

      {/* --- Orders Table --- */}
      <ErrorBoundary
        fallback={
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center">
            <p className="text-destructive font-semibold">
              Failed to load orders table
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Please try searching again
            </p>
          </div>
        }
      >
        <motion.div
          variants={itemVariants}
          className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
        >
          <div className="bg-primary text-primary-foreground px-6 py-4">
            <h3 className="text-lg font-semibold">Selected Orders</h3>
            <p className="text-sm opacity-90">
              {hasOrders
                ? `${selectedOrders.length} order${selectedOrders.length > 1 ? "s" : ""} selected`
                : "No orders selected yet"}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="p-4 text-left w-10">Primary</th>
                  <th className="p-4 text-left">Order ID</th>
                  <th className="p-4 text-left">Fatoura</th>
                  <th className="p-4 text-left">Stage</th>
                  <th className="p-4 text-left">Customer</th>
                  <th className="p-4 text-left">Delivery Date</th>
                  <th className="p-4 text-left">Revise Date</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {!hasOrders ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-12 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <LinkIcon className="w-12 h-12 opacity-20" />
                        <p className="font-medium">No orders selected</p>
                        <p className="text-xs">
                          Search and add orders to link them together
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  selectedOrders.map((order) => {
                    const isPrimary = order.id === primaryOrderId;

                    return (
                      <tr
                        key={order.id}
                        className={cn(
                          "border-t border-border hover:bg-muted/20 transition-colors",
                          isPrimary &&
                            "bg-primary/10 border-primary/30 hover:bg-primary/15",
                        )}
                      >
                        <td className="p-4">
                          <input
                            type="radio"
                            name="primaryOrder"
                            checked={isPrimary}
                            onChange={() => setPrimaryOrderId(order.id)}
                            className="h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">
                              {order.orderId ?? "-"}
                            </span>
                            {isPrimary && (
                              <Badge variant="default" className="text-xs">
                                Primary
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-4 font-medium">
                          {order.fatoura ?? "-"}
                        </td>
                        <td className="p-4">
                          <Badge variant="outline">
                            {order.fatouraStage ?? "-"}
                          </Badge>
                        </td>
                        <td className="p-4">
                          {order.customerId ? (
                            customerInfoMap[order.id] ? (
                              <div>
                                <div className="font-medium text-sm">
                                  {customerInfoMap[order.id]?.fields.Name ??
                                    "-"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {customerInfoMap[order.id]?.fields.Phone ??
                                    "-"}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Loading...
                              </span>
                            )
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {order.orderDate
                            ? format(new Date(order.orderDate), "PP")
                            : "-"}
                        </td>
                        <td className="p-4">
                          {order.reviseDate ? (
                            <span className="font-medium text-primary">
                              {format(new Date(order.reviseDate), "PP")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">
                              Not set
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeOrder(order.id)}
                            className="hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </ErrorBoundary>

      {/* --- Action Buttons --- */}
      <motion.div
        variants={itemVariants}
        className="flex gap-4 justify-end pt-2"
      >
        <Button onClick={handleLinkOrders} size="lg" disabled={!canSubmit}>
          <Check className="w-4 h-4 mr-2" />
          {isSubmitting ? "Linking Orders..." : "Link Orders"}
        </Button>
      </motion.div>

      {/* --- Customer Selection Dialog --- */}
      <ErrorBoundary
        fallback={
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center">
            <p className="text-destructive font-semibold">
              Failed to load customer dialog
            </p>
          </div>
        }
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="!w-[95vw] sm:!w-[90vw] md:!w-[85vw] lg:!w-[80vw] !max-w-7xl max-h-[85vh]">
            <DialogHeader className="border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <LinkIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl">
                    Select Customer Orders to Link
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Select multiple completed orders from the same customer
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="overflow-auto max-h-[calc(85vh-240px)] border rounded-lg">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10 border-b border-border">
                  <tr>
                    <th className="p-4 text-left w-12">
                      <Checkbox
                        checked={
                          customerOrders.length > 0 &&
                          selectedDialogIds.length === customerOrders.length &&
                          customerOrders.every((o) => !o.fields.LinkedOrder)
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const availableIds = customerOrders
                              .filter((o) => !o.fields.LinkedOrder)
                              .map((o) => o.id);
                            setSelectedDialogIds(availableIds);
                          } else {
                            setSelectedDialogIds([]);
                          }
                        }}
                      />
                    </th>
                    <th className="p-4 text-left font-semibold">Order Info</th>
                    <th className="p-4 text-left font-semibold">
                      Delivery Date
                    </th>
                    <th className="p-4 text-left font-semibold">Stage</th>
                    <th className="p-4 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customerOrders.map((order) => {
                    const isLinked = order.fields.LinkedOrder;
                    const isSelected = selectedDialogIds.includes(order.id);

                    return (
                      <tr
                        key={order.id}
                        className={cn(
                          "border-t border-border transition-colors",
                          isLinked
                            ? "bg-muted/30 opacity-60"
                            : isSelected
                              ? "bg-primary/10 hover:bg-primary/15"
                              : "hover:bg-muted/20",
                        )}
                      >
                        <td className="p-4">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() =>
                              toggleDialogSelection(order.id)
                            }
                            disabled={isLinked}
                          />
                        </td>
                        <td className="p-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">
                                #{order.fields.OrderID}
                              </span>
                              {isLinked && (
                                <Badge variant="secondary" className="text-xs">
                                  Already Linked
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Fatoura: {order.fields.Fatoura ?? "N/A"}
                            </p>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm">
                            {order.fields.DeliveryDate ? (
                              <div className="space-y-1">
                                <p className="font-medium">
                                  {format(
                                    new Date(order.fields.DeliveryDate),
                                    "PPP",
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(
                                    new Date(order.fields.DeliveryDate),
                                    "p",
                                  )}
                                </p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">
                                Not set
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className="font-normal">
                            {order.fields.FatouraStages ?? "N/A"}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <Badge
                            variant={
                              order.fields.OrderStatus === "Completed"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {order.fields.OrderStatus}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <DialogFooter className="border-t border-border pt-4">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
                <p className="text-sm text-muted-foreground">
                  {selectedDialogIds.length > 0
                    ? `${selectedDialogIds.length} order${selectedDialogIds.length > 1 ? "s" : ""} selected`
                    : "No orders selected"}
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDialogConfirm}
                    disabled={selectedDialogIds.length === 0}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Add Selected ({selectedDialogIds.length})
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ErrorBoundary>
    </motion.section>
  );
}
