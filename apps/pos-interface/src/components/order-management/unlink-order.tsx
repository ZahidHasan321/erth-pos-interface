import {
  searchOrders,
  getPendingOrdersByCustomer,
  updateOrder,
  getOrderById,
} from "@/api/orders";
import { searchCustomerByPhone, getCustomerByRecordId } from "@/api/customers";
import { useQuery } from "@tanstack/react-query";
import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Unlink,
  Calendar as CalendarIcon,
  AlertCircle,
  User,
  Package,
  Check,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// UI Components
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import { toast } from "sonner";
import { OrderSearchForm } from "./order-search-form";
import { ErrorBoundary } from "../global/error-boundary";

import type { Order } from "@/types/order";
import type { Customer } from "@/types/customer";
import type { ApiResponse } from "@/types/api";
import { DatePicker } from "../ui/date-picker";
import { cn } from "@/lib/utils";

export default function UnlinkOrder() {
  // --- Search Inputs ---
  const [orderId, setOrderId] = useState<number | undefined>();
  const [fatoura, setFatoura] = useState<number | undefined>();
  const [customerMobile, setCustomerMobile] = useState<number | undefined>();
  const [reviseDate, setReviseDate] = useState<Date | null>(null);

  // --- Order & Customer State ---
  const [foundOrder, setFoundOrder] = useState<Order | null>(null);
  const [customerInfo, setCustomerInfo] = useState<Customer | null>(null);
  const [linkedOrdersDetails, setLinkedOrdersDetails] = useState<Order[]>([]);

  // --- Loading States ---
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);
  const [isLoadingLinkedOrders, setIsLoadingLinkedOrders] = useState(false);

  // --- Dialog State ---
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [selectedDialogOrderId, setSelectedDialogOrderId] = useState<
    string | null
  >(null);

  // --- Single Order Search Query ---
  const { refetch: searchSingleOrder, isFetching: isSearchingSingle } =
    useQuery<ApiResponse<Order[]>>({
      queryKey: ["searchOrderForUnlink", orderId, fatoura],
      queryFn: () => {
        if (orderId) return searchOrders({ orderId: orderId.toString() });
        if (fatoura) return searchOrders({ fatoura: fatoura.toString() });
        throw new Error("Missing search parameter");
      },
      enabled: false,
    });

  // --- Fetch Customer Info when order is found ---
  useEffect(() => {
    async function fetchCustomerInfo() {
      if (!foundOrder?.fields.CustomerID?.[0]) {
        setCustomerInfo(null);
        return;
      }

      setIsLoadingCustomer(true);
      try {
        const response = await getCustomerByRecordId(
          foundOrder.fields.CustomerID[0],
        );
        if (response.data) {
          setCustomerInfo(response.data);
        } else {
          setCustomerInfo(null);
        }
      } catch (error) {
        console.error("Failed to fetch customer info", error);
        setCustomerInfo(null);
      } finally {
        setIsLoadingCustomer(false);
      }
    }

    fetchCustomerInfo();
  }, [foundOrder]);

  // --- Fetch Linked Order Details ---
  useEffect(() => {
    async function fetchLinkedOrders() {
      if (
        !foundOrder?.fields.LinkedTo ||
        !Array.isArray(foundOrder.fields.LinkedTo) ||
        foundOrder.fields.LinkedTo.length === 0
      ) {
        setLinkedOrdersDetails([]);
        return;
      }

      setIsLoadingLinkedOrders(true);
      try {
        const promises = foundOrder.fields.LinkedTo.map((id) =>
          getOrderById(id),
        );
        const responses = await Promise.all(promises);
        const orders = responses
          .map((res) => res.data)
          .filter(Boolean) as Order[];
        setLinkedOrdersDetails(orders);
      } catch (error) {
        console.error("Failed to fetch linked orders", error);
        toast.error("Failed to load linked order details");
        setLinkedOrdersDetails([]);
      } finally {
        setIsLoadingLinkedOrders(false);
      }
    }

    fetchLinkedOrders();
  }, [foundOrder]);

  // --- Main Form Submit ---
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 1. Handle Customer Search
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
          setSelectedDialogOrderId(null);
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

    // 2. Handle Single Order Search
    if (orderId || fatoura) {
      searchSingleOrder()
        .then(({ data }) => {
          if (!data || !data.data || data.data.length === 0) {
            toast.error("No order found with the provided criteria.");
            return;
          }
          const order = data.data[0];
          setFoundOrder(order);

          // Show info about the order's link status
          if (order.fields.UnlinkedOrder) {
            toast.info("This order was previously unlinked.");
          } else if (!order.fields.LinkedOrder) {
            toast.warning("This order is not linked to any other orders.");
          }
        })
        .catch((error) => {
          console.error("Failed to search order", error);
          toast.error("Failed to search for order. Please try again.");
        });
    }
  }

  // --- Dialog Handlers ---
  function handleDialogConfirm() {
    if (!selectedDialogOrderId) {
      toast.error("Please select an order.");
      return;
    }
    const order = customerOrders.find((o) => o.id === selectedDialogOrderId);
    if (order) {
      setFoundOrder(order);
      setIsDialogOpen(false);
    }
  }

  // --- Unlink Handler ---
  async function handleUnlink() {
    if (!foundOrder) {
      toast.error("No order selected to unlink.");
      return;
    }

    if (foundOrder.fields.UnlinkedOrder) {
      toast.info("This order is already unlinked.");
      return;
    }

    if (!foundOrder.fields.LinkedOrder) {
      toast.info("This order was never linked.");
      return;
    }

    if (!reviseDate) {
      toast.error("Please select a new delivery date.");
      return;
    }

    setIsSubmitting(true);
    try {
      const updateData: Partial<Order["fields"]> = {
        LinkedOrder: false,
        UnlinkedOrder: true,
        UnlinkedDate: new Date().toISOString(),
        DeliveryDate: reviseDate.toISOString(),
      };

      await updateOrder(updateData, foundOrder.id);

      toast.success("Order unlinked successfully! Delivery date updated.");
      setTimeout(() => handleClear(), 2000);
    } catch (error) {
      console.error("Unlink failed", error);
      toast.error("Failed to unlink order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }
  function getOrderStatusBadge() {
    if (foundOrder?.fields.UnlinkedOrder)
      return { label: "Unlinked", variant: "secondary" as const };
    if (foundOrder?.fields.LinkedOrder)
      return { label: "Linked", variant: "default" as const };
    return { label: "Not Linked", variant: "outline" as const };
  }
  // --- Clear/Search Again Handler ---
  function handleClear() {
    setFoundOrder(null);
    setCustomerInfo(null);
    setLinkedOrdersDetails([]);
    setReviseDate(null); // NEW
    setOrderId(undefined);
    setFatoura(undefined);
    setCustomerMobile(undefined);
    setCustomerOrders([]);
    setSelectedDialogOrderId(null);
  }

  const isFetching =
    isSearchingSingle ||
    isSearchingCustomer ||
    isLoadingCustomer ||
    isLoadingLinkedOrders;

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
      className="space-y-8 p-6 md:p-10 max-w-5xl mx-auto"
    >
      {/* --- Page Header --- */}
      <motion.div variants={itemVariants} className="space-y-1">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          Unlink Order
        </h1>
        <p className="text-sm text-muted-foreground">
          Remove link from an order and set a new delivery date
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

      {/* --- Order Display Card --- */}
      <AnimatePresence mode="wait">
        {foundOrder && (
          <ErrorBoundary
            fallback={
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center">
                <p className="text-destructive font-semibold">
                  Failed to load order details
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Please try searching again
                </p>
              </div>
            }
          >
            <div className="space-y-6">
              <motion.div
                variants={itemVariants}
                initial="hidden"
                animate="visible"
              >
                <Card className="shadow-sm">
                  <CardHeader className="bg-card border-b border-border">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Package className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-xl">
                            Order Details
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            Order #{foundOrder.fields.OrderID ?? "-"}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={getOrderStatusBadge().variant}
                        className="w-fit"
                      >
                        {getOrderStatusBadge().label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    {/* Order Information */}
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Order Information
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-xs">
                            Order ID
                          </span>
                          <p className="font-semibold text-base">
                            {foundOrder.fields.OrderID ?? "-"}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-xs">
                            Fatoura Number
                          </span>
                          <p className="font-semibold text-base">
                            {foundOrder.fields.Fatoura ?? "-"}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-xs">
                            Current Delivery Date
                          </span>
                          <p className="font-semibold text-base">
                            {foundOrder.fields.DeliveryDate
                              ? format(
                                  new Date(foundOrder.fields.DeliveryDate),
                                  "PPP",
                                )
                              : "-"}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-xs">
                            Order Status
                          </span>
                          <p className="font-semibold text-base">
                            {foundOrder.fields.OrderStatus}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-xs">
                            Linked Status
                          </span>
                          <p className="font-semibold text-base">
                            {foundOrder.fields.LinkedOrder ? "Yes" : "No"}
                          </p>
                        </div>
                        {foundOrder.fields.LinkedDate && (
                          <div className="space-y-1">
                            <span className="text-muted-foreground text-xs">
                              Linked Date
                            </span>
                            <p className="font-semibold text-base">
                              {format(
                                new Date(foundOrder.fields.LinkedDate),
                                "PPP",
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* New Delivery Date Picker */}
                    <div className="pt-4 border-t border-border">
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4" />
                          Set New Delivery Date{" "}
                          {!foundOrder.fields.UnlinkedOrder && (
                            <span className="text-destructive">*</span>
                          )}
                        </Label>
                        <DatePicker
                          value={reviseDate}
                          onChange={setReviseDate}
                          placeholder="Pick new delivery date"
                          className="w-full"
                          disabled={foundOrder.fields.UnlinkedOrder}
                        />
                        {foundOrder.fields.UnlinkedOrder ? (
                          <p className="text-xs text-destructive">
                            This order is already unlinked. Delivery date cannot
                            be changed.
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            This will replace the current delivery date
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Linked Orders Details */}
                    {isLoadingLinkedOrders ? (
                      <div className="pt-4 border-t border-border">
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          Loading linked orders...
                        </div>
                      </div>
                    ) : (
                      linkedOrdersDetails.length > 0 && (
                        <div className="pt-4 border-t border-border">
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Unlink className="w-4 h-4" />
                            Linked Orders
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {linkedOrdersDetails.map((linkedOrder) => (
                              <div
                                key={linkedOrder.id}
                                className="text-sm p-4 bg-muted/30 rounded-lg border border-border space-y-2"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground text-xs">
                                    Order ID
                                  </span>
                                  <span className="font-semibold">
                                    {linkedOrder.fields.OrderID ?? "-"}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground text-xs">
                                    Fatoura
                                  </span>
                                  <span className="font-semibold">
                                    {linkedOrder.fields.Fatoura ?? "-"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}

                    {/* Customer Information */}
                    {isLoadingCustomer ? (
                      <div className="pt-4 border-t border-border">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          Loading customer info...
                        </div>
                      </div>
                    ) : customerInfo ? (
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Customer Information
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div className="space-y-1">
                            <span className="text-muted-foreground text-xs">
                              Name
                            </span>
                            <p className="font-semibold">
                              {customerInfo.fields.Name}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-muted-foreground text-xs">
                              Phone
                            </span>
                            <p className="font-semibold">
                              {customerInfo.fields.Phone}
                            </p>
                          </div>
                          {customerInfo.fields.NickName && (
                            <div className="space-y-1">
                              <span className="text-muted-foreground text-xs">
                                Nickname
                              </span>
                              <p className="font-semibold">
                                {customerInfo.fields.NickName}
                              </p>
                            </div>
                          )}
                          {customerInfo.fields.Email && (
                            <div className="space-y-1">
                              <span className="text-muted-foreground text-xs">
                                Email
                              </span>
                              <p className="font-semibold">
                                {customerInfo.fields.Email}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-border text-sm text-muted-foreground">
                        Customer information not available.
                      </div>
                    )}

                    {/* --- Action Buttons --- */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-border">
                      <Button
                        onClick={handleUnlink}
                        variant="destructive"
                        className="flex-1"
                        disabled={
                          isSubmitting ||
                          !foundOrder.fields.LinkedOrder ||
                          foundOrder.fields.UnlinkedOrder ||
                          !reviseDate
                        }
                      >
                        <Unlink className="w-4 h-4 mr-2" />
                        {isSubmitting ? "Unlinking..." : "Unlink Order"}
                      </Button>
                      <Button
                        onClick={() => setFoundOrder(null)}
                        variant="outline"
                        className="flex-1"
                      >
                        Clear Order
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* --- Info Alert --- */}
              <motion.div
                variants={itemVariants}
                initial="hidden"
                animate="visible"
              >
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">
                          Important Note
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          This will mark the order as unlinked and update the
                          delivery date. The original linked IDs and date will
                          be preserved for audit purposes. Orders that were
                          never linked cannot be unlinked.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </ErrorBoundary>
        )}
      </AnimatePresence>

      {/* --- Customer Order Selection Dialog --- */}
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
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <Unlink className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <DialogTitle className="text-xl">
                    Select Order to Unlink
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Only linked orders can be selected for unlinking
                  </p>
                </div>
              </div>
            </DialogHeader>

            <RadioGroup
              value={selectedDialogOrderId ?? undefined}
              onValueChange={setSelectedDialogOrderId}
              className="overflow-y-auto max-h-[calc(85vh-240px)]"
            >
              <div className="border rounded-lg overflow-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10 border-b border-border">
                    <tr>
                      <th className="p-4 text-left w-12"></th>
                      <th className="p-4 text-left font-semibold">
                        Order Info
                      </th>
                      <th className="p-4 text-left font-semibold">
                        Delivery Date
                      </th>
                      <th className="p-4 text-left font-semibold">
                        Linked To Orders
                      </th>
                      <th className="p-4 text-left font-semibold">Stage</th>
                      <th className="p-4 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerOrders.map((order) => {
                      const isSelected = selectedDialogOrderId === order.id;
                      const isLinked = Boolean(order.fields.LinkedOrder);
                      const isUnlinked = Boolean(order.fields.UnlinkedOrder);
                      const linkedToCount = Array.isArray(order.fields.LinkedTo)
                        ? order.fields.LinkedTo.length
                        : 0;
                      const canSelect = isLinked && !isUnlinked;

                      return (
                        <tr
                          key={order.id}
                          className={cn(
                            "border-t border-border transition-colors",
                            !canSelect && "opacity-50 cursor-not-allowed",
                            canSelect && "cursor-pointer",
                            canSelect && isSelected
                              ? "bg-primary/10 hover:bg-primary/15"
                              : canSelect && "hover:bg-muted/20",
                          )}
                          onClick={() =>
                            canSelect && setSelectedDialogOrderId(order.id)
                          }
                        >
                          <td className="p-4">
                            <RadioGroupItem
                              value={order.id}
                              id={order.id}
                              disabled={!canSelect}
                            />
                          </td>
                          <td className="p-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Label
                                  htmlFor={order.id}
                                  className="font-semibold text-foreground cursor-pointer"
                                >
                                  #{order.fields.OrderID}
                                </Label>
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
                            <div className="space-y-1.5">
                              {isUnlinked ? (
                                <>
                                  <Badge variant="outline" className="bg-muted">
                                    Previously Unlinked
                                  </Badge>
                                  {order.fields.UnlinkedDate && (
                                    <p className="text-xs text-muted-foreground">
                                      On{" "}
                                      {format(
                                        new Date(order.fields.UnlinkedDate),
                                        "PP",
                                      )}
                                    </p>
                                  )}
                                  <p className="text-xs text-destructive font-medium">
                                    Cannot be unlinked again
                                  </p>
                                </>
                              ) : isLinked ? (
                                <>
                                  {linkedToCount > 0 ? (
                                    <>
                                      <div className="flex flex-wrap gap-1.5">
                                        {order.fields.LinkedTo?.slice(0, 3).map(
                                          (linkedId, idx) => {
                                            // Try to find the order in customerOrders to show OrderID
                                            const linkedOrderData =
                                              customerOrders.find(
                                                (o) => o.id === linkedId,
                                              );
                                            return (
                                              <Badge
                                                key={idx}
                                                variant="secondary"
                                                className="text-xs"
                                              >
                                                #
                                                {linkedOrderData?.fields
                                                  .OrderID ??
                                                  linkedId.slice(-4)}
                                              </Badge>
                                            );
                                          },
                                        )}
                                        {linkedToCount > 3 && (
                                          <Badge
                                            variant="secondary"
                                            className="text-xs"
                                          >
                                            +{linkedToCount - 3} more
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        Linked to {linkedToCount} order
                                        {linkedToCount > 1 ? "s" : ""}
                                      </p>
                                    </>
                                  ) : (
                                    <>
                                      <Badge variant="default">
                                        Primary Order
                                      </Badge>
                                      <p className="text-xs text-muted-foreground">
                                        Other orders are linked to this one
                                      </p>
                                    </>
                                  )}
                                  {order.fields.LinkedDate && (
                                    <p className="text-xs text-muted-foreground">
                                      Since{" "}
                                      {format(
                                        new Date(order.fields.LinkedDate),
                                        "PP",
                                      )}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Badge variant="outline">Not Linked</Badge>
                                  <p className="text-xs text-destructive font-medium">
                                    Cannot unlink - not linked
                                  </p>
                                </>
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
            </RadioGroup>

            <DialogFooter className="border-t border-border pt-4">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
                <div className="text-sm">
                  {(() => {
                    const linkedOrders = customerOrders.filter(
                      (o) => o.fields.LinkedOrder && !o.fields.UnlinkedOrder,
                    );
                    const linkedCount = linkedOrders.length;
                    return (
                      <div className="space-y-1">
                        <p className="text-muted-foreground">
                          {selectedDialogOrderId
                            ? "Order selected for unlinking"
                            : "No order selected"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {linkedCount} of {customerOrders.length} order
                          {customerOrders.length !== 1 ? "s" : ""} can be
                          unlinked
                        </p>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDialogConfirm}
                    disabled={!selectedDialogOrderId}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Select Order
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
