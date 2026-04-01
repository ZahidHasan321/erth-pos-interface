"use client";

import {
  getOrdersForLinking,
  getOrderForLinking,
  updateOrder,
} from "@/api/orders";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { Check, Link as LinkIcon, X, User, Phone, Clock, Crown, Hash, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// UI Components
import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/dialog";
import { Checkbox } from "@repo/ui/checkbox";
import { Badge } from "@repo/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ErrorBoundary } from "../global/error-boundary";
import { SearchCustomer } from "../forms/customer-demographics/search-customer";
import { LinkConfigurationPanel } from "./link-configuration-panel";
import { ORDER_PHASE_LABELS } from "@/lib/constants";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";

import type { Order, Customer } from "@repo/database";

type SelectedOrder = {
  id: number;
  invoiceNumber?: number | null;
  orderDate?: string | Date | null;
  deliveryDate?: string | Date | null;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  orderPhase?: string | null;
  isExistingPrimary?: boolean;
  isExistingChild?: boolean;
};

export default function LinkOrder() {
  const queryClient = useQueryClient();

  // --- Search State ---
  const [quickSearch, setQuickSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // --- Global State ---
  const [selectedOrders, setSelectedOrders] = useState<SelectedOrder[]>([]);
  const [primaryOrderId, setPrimaryOrderId] = useState<number | null>(null);

  // --- Dialog State ---
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [selectedDialogIds, setSelectedDialogIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Helpers ---

  function validateOrder(order: any): boolean {
    if (order.checkout_status !== "confirmed") {
      toast.warning("Only confirmed orders can be linked.");
      return false;
    }
    if (order.order_type !== "WORK") {
      toast.warning("Only work orders can be linked.");
      return false;
    }
    return true;
  }

  function mapOrderToSelected(order: any): SelectedOrder {
    return {
      id: order.id,
      invoiceNumber: order.invoice_number,
      orderDate: order.order_date,
      deliveryDate: order.delivery_date,
      customerId: order.customer_id,
      customerName: order.customer?.name,
      customerPhone: order.customer?.phone ?? undefined,
      orderPhase: order.order_phase,
      isExistingPrimary: order.child_orders && order.child_orders.length > 0,
      isExistingChild: !!order.linked_order_id,
    };
  }

  // --- Search Handlers ---

  const handleCustomerFound = async (customer: Customer) => {
    try {
      const ordersResponse = await getOrdersForLinking(customer.id);
      if (ordersResponse.data && ordersResponse.data.length > 0) {
        setCustomerOrders(ordersResponse.data);
        setSelectedDialogIds([]);
        setIsDialogOpen(true);
      } else {
        toast.info(`No confirmed orders found for ${customer.name}.`);
      }
    } catch {
      toast.error("Failed to fetch customer orders.");
    }
  };

  const handleQuickSearch = async () => {
    const term = quickSearch.trim();
    if (!term) return;

    setIsSearching(true);
    try {
      const numVal = parseInt(term.replace("#", ""));
      if (isNaN(numVal)) {
        toast.warning("Enter a valid Order ID or Invoice Number");
        return;
      }
      const res = await getOrderForLinking(numVal);
      if (res.status === "error" || !res.data) {
        toast.error("Order not found");
      } else {
        const order = res.data;
        if (validateOrder(order)) {
          await addOrdersToSelection([order]);
          setQuickSearch("");
        }
      }
    } catch {
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  // --- Add Orders to Main List ---
  async function addOrdersToSelection(ordersToProcess: any[]) {
    const ordersMap = new Map<number, SelectedOrder>();
    const idsToFetch = new Set<number>();

    for (const order of ordersToProcess) {
      if (selectedOrders.some((o) => o.id === order.id)) continue;

      ordersMap.set(order.id, mapOrderToSelected(order));

      if (order.linked_order_id) idsToFetch.add(order.linked_order_id);
      if (order.child_orders) {
        order.child_orders.forEach((c: any) => idsToFetch.add(c.id || c.order_id));
      }
    }

    // Fetch missing group members
    const finalFetchIds = Array.from(idsToFetch).filter(
      (id) => !ordersMap.has(id) && !selectedOrders.some((o) => o.id === id)
    );

    if (finalFetchIds.length > 0) {
      try {
        const results = await Promise.all(finalFetchIds.map((id) => getOrderForLinking(id)));
        for (const res of results) {
          if (res.status === "success" && res.data) {
            ordersMap.set(res.data.id, mapOrderToSelected(res.data));
          }
        }
      } catch {
        toast.error("Failed to sync some group members");
      }
    }

    const newItems = Array.from(ordersMap.values());
    if (newItems.length > 0) {
      setSelectedOrders((prev) => {
        const existingIds = new Set(prev.map((o) => o.id));
        return [...prev, ...newItems.filter((item) => !existingIds.has(item.id))];
      });

      // Auto-set primary to first order if not set
      if (!primaryOrderId && newItems.length > 0) {
        const existingPrimary = newItems.find((o) => o.isExistingPrimary);
        setPrimaryOrderId(existingPrimary?.id ?? newItems[0].id);
      }
    }
  }

  function removeOrder(id: number) {
    setSelectedOrders((prev) => prev.filter((o) => o.id !== id));
    if (primaryOrderId === id) setPrimaryOrderId(null);
  }

  // --- Dialog ---
  function toggleDialogSelection(id: number) {
    setSelectedDialogIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  function handleDialogConfirm() {
    const ordersToAdd = customerOrders.filter((o) => selectedDialogIds.includes(o.id));
    addOrdersToSelection(ordersToAdd);
    setIsDialogOpen(false);
  }

  // --- Link Orders ---
  async function handleLinkOrders(reviseDate: Date) {
    if (!primaryOrderId) {
      toast.error("Please select a primary order.");
      return;
    }
    if (selectedOrders.length < 2) {
      toast.error("Please select at least 2 orders to link.");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      await Promise.all(
        selectedOrders.map((order) => {
          const isPrimary = order.id === primaryOrderId;
          const updateData: any = {
            delivery_date: reviseDate.toISOString(),
          };
          if (!isPrimary) {
            updateData.linked_order_id = primaryOrderId;
            updateData.linked_date = now.toISOString();
            updateData.unlinked_date = null;
          } else {
            updateData.linked_order_id = null;
            updateData.unlinked_date = null;
          }
          return updateOrder(updateData, order.id);
        })
      );

      toast.success(`Successfully linked ${selectedOrders.length} orders.`);
      handleClear();
      queryClient.invalidateQueries({ queryKey: ["orders"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["order-history"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["showroom-orders"], refetchType: "active" });
    } catch {
      toast.error("Failed to link orders. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClear() {
    setSelectedOrders([]);
    setPrimaryOrderId(null);
    setQuickSearch("");
    setCustomerOrders([]);
    setSelectedDialogIds([]);
  }

  const hasOrders = selectedOrders.length > 0;

  return (
    <ErrorBoundary>
      <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground tracking-tight">Link Orders</h1>
          <p className="text-sm text-muted-foreground">
            Connect orders for synchronized production and delivery
          </p>
        </div>

        {/* Search section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Customer search */}
          <SearchCustomer
            onCustomerFound={handleCustomerFound}
            onHandleClear={() => {}}
            clearOnSelect={true}
          />

          {/* Quick lookup */}
          <div className="bg-muted/40 px-5 py-4 rounded-2xl border border-border/50 shadow-sm flex flex-col justify-center space-y-3">
            <div className="flex items-center gap-3 px-1">
              <div className="p-2 bg-primary/10 rounded-lg text-primary shadow-sm">
                <Hash className="size-4" />
              </div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">
                Quick Add
              </h2>
            </div>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground ml-1">
                  Order ID or Invoice No
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 5021 or #10025"
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  disabled={isSearching}
                  className="h-9 font-bold bg-white rounded-xl border-border shadow-sm"
                  onKeyDown={(e) => e.key === "Enter" && handleQuickSearch()}
                />
              </div>
              <Button
                size="sm"
                onClick={handleQuickSearch}
                disabled={!quickSearch.trim() || isSearching}
                className="h-9 px-5 font-bold uppercase tracking-wide text-xs rounded-xl shadow-sm shrink-0"
              >
                <Search className="size-3.5 mr-1.5" />
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Orders list */}
          <div className="lg:col-span-2">
            <div className="bg-card rounded-xl border shadow-none overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide">
                    Selected Orders
                  </h3>
                  {hasOrders && (
                    <Badge variant="outline" className="font-bold text-xs">
                      {selectedOrders.length}
                    </Badge>
                  )}
                </div>
                {hasOrders && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="h-7 text-xs font-medium text-muted-foreground hover:text-destructive"
                  >
                    Clear all
                  </Button>
                )}
              </div>

              <div className="min-h-[280px] relative">
                <AnimatePresence initial={false}>
                  {!hasOrders ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-6"
                    >
                      <div className="p-4 bg-muted/30 rounded-full border-2 border-dashed border-border mb-3">
                        <LinkIcon className="w-6 h-6 opacity-20" />
                      </div>
                      <p className="text-sm font-medium">No orders selected</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        Search by customer or order ID to add orders
                      </p>
                    </motion.div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {selectedOrders.map((order) => {
                        const isPrimary = order.id === primaryOrderId;

                        return (
                          <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 transition-colors",
                              isPrimary ? "bg-primary/5" : "hover:bg-muted/20"
                            )}
                          >
                            {/* Primary selector */}
                            <button
                              className={cn(
                                "size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                                isPrimary
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground/25 hover:border-primary/50"
                              )}
                              onClick={() => setPrimaryOrderId(order.id)}
                              title="Set as primary"
                            >
                              {isPrimary && <Crown className="size-2.5 text-primary-foreground" />}
                            </button>

                            {/* Order info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm">#{order.id}</span>
                                {order.invoiceNumber && (
                                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    INV {order.invoiceNumber}
                                  </span>
                                )}
                                {isPrimary && (
                                  <Badge className="text-[10px] font-bold h-4 px-1.5 bg-primary text-primary-foreground">
                                    PRIMARY
                                  </Badge>
                                )}
                                {order.isExistingChild && (
                                  <Badge variant="outline" className="text-[10px] font-bold h-4 px-1.5 border-blue-300 text-blue-600">
                                    LINKED
                                  </Badge>
                                )}
                                {order.orderPhase && (
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] font-bold h-4 px-1.5 border-none",
                                      order.orderPhase === "new" && "bg-gray-500/10 text-gray-500",
                                      order.orderPhase === "in_progress" && "bg-amber-500/10 text-amber-600",
                                      order.orderPhase === "completed" && "bg-primary/10 text-primary"
                                    )}
                                  >
                                    {ORDER_PHASE_LABELS[order.orderPhase as keyof typeof ORDER_PHASE_LABELS]}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 md:gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1 font-medium truncate max-w-[120px] md:max-w-none">
                                  <User className="size-2.5 shrink-0" />
                                  {order.customerName || "Unknown"}
                                </span>
                                {order.customerPhone && (
                                  <span className="hidden md:flex items-center gap-1">
                                    <Phone className="size-2.5 shrink-0" />
                                    {order.customerPhone}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Clock className="size-2.5 shrink-0" />
                                  {order.deliveryDate
                                    ? format(new Date(order.deliveryDate), "d MMM")
                                    : "No date"}
                                </span>
                              </div>
                            </div>

                            {/* Remove */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeOrder(order.id)}
                              className="h-7 w-7 shrink-0 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Config panel */}
          <div className="lg:col-span-1">
            <LinkConfigurationPanel
              hasOrders={hasOrders}
              primaryOrderId={primaryOrderId}
              onLinkOrders={handleLinkOrders}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>

        {/* Customer orders dialog */}
        <ErrorBoundary>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="!w-[95vw] sm:!w-[90vw] md:!w-[80vw] !max-w-4xl max-h-[85vh]">
              <DialogHeader className="border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <LinkIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold">
                      Select Orders to Link
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Choose confirmed orders for this customer
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="overflow-auto max-h-[50vh] border rounded-lg">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b">
                    <tr className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <th className="p-3 text-center w-12">
                        <Checkbox
                          checked={
                            customerOrders.length > 0 &&
                            selectedDialogIds.length ===
                              customerOrders.filter((o) => !o.linked_order_id).length
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedDialogIds(
                                customerOrders
                                  .filter((o) => !o.linked_order_id)
                                  .map((o) => o.id)
                              );
                            } else {
                              setSelectedDialogIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="p-3 text-left">Order</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Delivery</th>
                      <th className="p-3 text-left">Phase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {customerOrders.map((order: any) => {
                      const isChild = !!order.linked_order_id;
                      const isPrimary =
                        order.child_orders && order.child_orders.length > 0;
                      const isSelected = selectedDialogIds.includes(order.id);

                      return (
                        <tr
                          key={order.id}
                          className={cn(
                            "transition-colors cursor-pointer",
                            isSelected
                              ? "bg-primary/5 hover:bg-primary/10"
                              : "hover:bg-muted/20"
                          )}
                          onClick={() => toggleDialogSelection(order.id)}
                        >
                          <td className="p-3 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleDialogSelection(order.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-sm">#{order.id}</span>
                            {order.invoice_number && (
                              <span className="text-xs text-muted-foreground ml-2">
                                INV {order.invoice_number}
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {isChild ? (
                              <Badge
                                variant="secondary"
                                className="text-[10px] font-bold h-4 px-1.5"
                              >
                                Linked to #{order.linked_order_id}
                              </Badge>
                            ) : isPrimary ? (
                              <Badge className="text-[10px] font-bold h-4 px-1.5 bg-amber-500/15 text-amber-700 border-none">
                                Primary
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Independent
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {order.delivery_date ? (
                              <span className="text-xs font-medium">
                                {format(new Date(order.delivery_date), "d MMM yyyy")}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Not set
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {order.order_phase ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-bold h-4 px-1.5 border-none",
                                  order.order_phase === "new" && "bg-gray-500/10 text-gray-500",
                                  order.order_phase === "in_progress" && "bg-amber-500/10 text-amber-600",
                                  order.order_phase === "completed" && "bg-primary/10 text-primary"
                                )}
                              >
                                {ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS]}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">N/A</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <DialogFooter className="border-t border-border pt-4">
                <div className="flex justify-between items-center w-full">
                  <p className="text-xs font-medium text-muted-foreground">
                    {selectedDialogIds.length} selected
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleDialogConfirm}
                      disabled={selectedDialogIds.length === 0}
                    >
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Add {selectedDialogIds.length > 0 ? `(${selectedDialogIds.length})` : ""}
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  );
}
