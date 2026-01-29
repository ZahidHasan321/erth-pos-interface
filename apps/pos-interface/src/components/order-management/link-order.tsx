"use client";

import {
  getOrdersForLinking,
  getOrderForLinking,
  updateOrder,
} from "@/api/orders";
import { getCustomerById } from "@/api/customers";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, Link as LinkIcon, Trash2, Hash, User, Phone, Clock, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DirectLookupCard } from "./order-search-form";
import { ErrorBoundary } from "../global/error-boundary";
import { Separator } from "../ui/separator";
import { SearchCustomer } from "../forms/customer-demographics/search-customer";

import type { Order, Customer } from "@repo/database";

type SelectedOrder = {
  id: number;
  invoiceNumber?: number | null;
  orderDate?: string | Date | null;
  deliveryDate?: string | Date | null;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  productionStage?: string | null;
  isExistingPrimary?: boolean;
};

export default function LinkOrder() {
  const queryClient = useQueryClient();

  // --- Search Inputs ---
  const [orderIdSearch, setOrderIdSearch] = useState<number | undefined>();
  const [fatouraSearch, setFatouraSearch] = useState<number | undefined>();
  
  // --- Loading & Error States ---
  const [isSearchingId, setIsSearchingId] = useState(false);
  const [isSearchingFatoura, setIsSearchingFatoura] = useState(false);
  const [idError, setIdError] = useState<string | undefined>();
  const [fatouraError, setFatouraError] = useState<string | undefined>();

  // --- Global State ---
  const [reviseDate, setReviseDate] = useState<Date | undefined>();
  const [selectedOrders, setSelectedOrders] = useState<SelectedOrder[]>([]);
  const [primaryOrderId, setPrimaryOrderId] = useState<number | null>(null);

  // --- Dialog State ---
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [selectedDialogIds, setSelectedDialogIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Input Change Handlers (Clear errors on type) ---
  const handleOrderIdChange = (val: number | undefined) => {
    setOrderIdSearch(val);
    if (idError) setIdError(undefined);
  };

  const handleFatouraChange = (val: number | undefined) => {
    setFatouraSearch(val);
    if (fatouraError) setFatouraError(undefined);
  };

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
    } catch (error) {
      console.error("Failed to fetch customer orders", error);
      toast.error("Failed to fetch customer orders.");
    }
  };

  const handleIdSearch = async () => {
    if (!orderIdSearch) return;
    
    setIdError(undefined);
    setIsSearchingId(true);
    
    try {
        const res = await getOrderForLinking(orderIdSearch);
        if (res.status === "error" || !res.data) {
            setIdError("Order ID not found");
            toast.error("Order ID not found");
        } else {
            const order = res.data;
            if (validateOrder(order)) {
                addOrdersToSelection([order]);
                setOrderIdSearch(undefined);
            }
        }
    } catch (err) {
        toast.error("Search failed");
    } finally {
        setIsSearchingId(false);
    }
  };

  const handleFatouraSearch = async () => {
    if (!fatouraSearch) return;
    
    setFatouraError(undefined);
    setIsSearchingFatoura(true);
    
    try {
        const res = await getOrderForLinking(fatouraSearch);
        if (res.status === "error" || !res.data) {
            setFatouraError("Invoice No not found");
            toast.error("Invoice Number not found");
        } else {
            const order = res.data;
            if (validateOrder(order)) {
                addOrdersToSelection([order]);
                setFatouraSearch(undefined);
            }
        }
    } catch (err) {
        toast.error("Search failed");
    } finally {
        setIsSearchingFatoura(false);
    }
  };

  const validateOrder = (order: any) => {
    if (order.checkout_status !== "confirmed") {
        toast.warning("Only confirmed orders can be linked.");
        return false;
    }
    if (order.order_type !== "WORK") {
        toast.warning("Only work orders can be linked.");
        return false;
    }
    return true;
  };

  // --- Helper: Add Orders to Main List ---
  async function addOrdersToSelection(orders: any[]) {
    const newSelectedOrders: SelectedOrder[] = [];
    const childrenToFetch: number[] = [];
    const primariesToFetch: number[] = [];

    // 1. Process passed orders
    for (const order of orders) {
        if (selectedOrders.some(p => p.id === order.id)) continue;

        // If it's a child, we MUST fetch its primary and all siblings to keep things in sync
        if (order.linked_order_id) {
            primariesToFetch.push(order.linked_order_id);
            continue; // Skip adding directly, let the recursive fetch handle the whole group
        }

        let customerName = order.customer?.name;
        let customerPhone = order.customer?.phone;

        // If customer data is not present, fetch it (fallback)
        if (!customerName && order.customer_id) {
            const custRes = await getCustomerById(order.customer_id);
            if (custRes.data) {
                customerName = custRes.data.name;
                customerPhone = custRes.data.phone;
            }
        }

        const isExistingPrimary = order.child_orders && order.child_orders.length > 0;

        newSelectedOrders.push({
            id: order.id,
            invoiceNumber: order.invoice_number,
            orderDate: order.order_date,
            deliveryDate: order.delivery_date,
            customerId: order.customer_id,
            customerName,
            customerPhone,
            productionStage: order.production_stage,
            isExistingPrimary: isExistingPrimary
        });

        // Collect child IDs to fetch their details
        if (isExistingPrimary) {
            const childIds = order.child_orders.map((c: any) => c.id || c.order_id).filter(Boolean);
            childrenToFetch.push(...childIds);
        }
    }

    // 2. Identify missing group members (Children of selected primaries OR Primaries of selected children)
    const existingIds = new Set([...selectedOrders.map(o => o.id), ...newSelectedOrders.map(o => o.id)]);
    const finalFetchIds = [...new Set([...childrenToFetch, ...primariesToFetch])].filter(id => !existingIds.has(id));

    // Update state with what we have so far
    if (newSelectedOrders.length > 0) {
        setSelectedOrders((prev) => [...prev, ...newSelectedOrders]);
    }

    // 3. Fetch and add missing group members recursively
    if (finalFetchIds.length > 0) {
        toast.info(`Syncing linked group members...`);
        
        try {
            const promises = finalFetchIds.map(id => getOrderForLinking(id));
            const results = await Promise.all(promises);
            const validOrders = results
                .filter(res => res.status === "success" && res.data)
                .map(res => res.data);
            
            if (validOrders.length > 0) {
                // Recursively call addOrdersToSelection with the newly fetched group members
                await addOrdersToSelection(validOrders);
            }
        } catch (error) {
            console.error("Failed to sync group", error);
            toast.error("Some linked group members could not be loaded.");
        }
    }
  }

  // --- Helper: Remove Order ---
  function removeOrder(id: number) {
    setSelectedOrders((prev) => prev.filter((o) => o.id !== id));
    if (primaryOrderId === id) {
      setPrimaryOrderId(null);
    }
  }

  // --- Dialog Handlers ---
  function toggleDialogSelection(id: number) {
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

    setIsSubmitting(true);

    try {
      const now = new Date();
      const updatePromises = selectedOrders.map((order) => {
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
      });

      await Promise.all(updatePromises);
      toast.success(`Successfully linked ${selectedOrders.length} orders.`);
      handleClear();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
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
    setOrderIdSearch(undefined);
    setFatouraSearch(undefined);
    setIdError(undefined);
    setFatouraError(undefined);
    setCustomerOrders([]);
    setSelectedDialogIds([]);
  }

  const hasOrders = selectedOrders.length > 0;
  const canSubmit = hasOrders && !!reviseDate && !!primaryOrderId && !isSubmitting;

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
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto"
    >
      {/* --- Page Header --- */}
      <motion.div variants={itemVariants} className="space-y-1 border-b border-border pb-4">
        <h1 className="text-3xl font-bold text-foreground">
          Link <span className="text-primary">Orders</span>
        </h1>
        <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
          Connect multiple orders for synchronized production and delivery
        </p>
      </motion.div>

      {/* --- Search Section --- */}
      <ErrorBoundary>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* 1. Customer Search (Fuzzy) */}
            <div className="lg:col-span-6 h-full min-h-[120px]">
                <SearchCustomer 
                    onCustomerFound={handleCustomerFound}
                    onHandleClear={() => {}}
                />
            </div>
            
            {/* 2. Direct Lookups (Exact) */}
            <div className="lg:col-span-6 h-full min-h-[120px]">
                <DirectLookupCard 
                    orderId={orderIdSearch}
                    fatoura={fatouraSearch}
                    onOrderIdChange={handleOrderIdChange}
                    onFatouraChange={handleFatouraChange}
                    onOrderIdSubmit={handleIdSearch}
                    onFatouraSubmit={handleFatouraSearch}
                    isSearchingId={isSearchingId}
                    isSearchingFatoura={isSearchingFatoura}
                    idError={idError}
                    fatouraError={fatouraError}
                />
            </div>
        </div>
      </ErrorBoundary>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* --- LEFT: Orders List --- */}
        <div className="lg:col-span-8 space-y-4">
          <motion.div
            variants={itemVariants}
            className="bg-card rounded-xl border border-border shadow-sm overflow-hidden h-full flex flex-col py-0 gap-0"
          >
            <div className="bg-muted/30 px-5 py-3 border-b border-border flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Selected Orders</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">
                    {selectedOrders.length} Orders Ready to Link
                </p>
              </div>
              {hasOrders && (
                <Button variant="ghost" size="sm" onClick={handleClear} className="h-8 text-[10px] font-black uppercase tracking-tighter text-muted-foreground hover:text-destructive transition-colors">
                    Clear Selection
                </Button>
              )}
            </div>

            <div className="divide-y divide-border flex-1 overflow-y-auto min-h-[300px]">
              {!hasOrders ? (
                <div className="p-12 text-center text-muted-foreground h-full flex flex-col items-center justify-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-muted/50 rounded-full border-2 border-dashed border-border">
                        <LinkIcon className="w-8 h-8 opacity-20" />
                    </div>
                    <div>
                        <p className="text-sm font-black uppercase tracking-tight">No orders selected</p>
                        <p className="text-xs font-medium mt-1">Search and add orders to build your link group</p>
                    </div>
                  </div>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {selectedOrders.map((order) => {
                    const isPrimary = order.id === primaryOrderId;

                    return (
                      <motion.div
                        key={order.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                          "flex flex-col sm:flex-row items-stretch sm:items-center p-3 transition-all border-l-4",
                          isPrimary 
                            ? "border-l-primary bg-primary/5 shadow-inner" 
                            : "border-l-transparent hover:bg-muted/20"
                        )}
                      >
                        {/* Radio Checkbox */}
                        <div className="flex items-center justify-center px-2 mr-2">
                           <div 
                             className={cn(
                               "w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all",
                               isPrimary ? "border-primary bg-primary" : "border-muted-foreground/30 hover:border-primary/50"
                             )}
                             onClick={() => setPrimaryOrderId(order.id)}
                           >
                             {isPrimary && <div className="w-2 h-2 rounded-full bg-white" />}
                           </div>
                        </div>

                        {/* Order Identity */}
                        <div className="flex-1 min-w-[150px] space-y-1">
                           <div className="flex items-center gap-2">
                              <h4 className="text-xs font-black uppercase tracking-tighter">Order #{order.id}</h4>
                              {isPrimary && (
                                <Badge variant="default" className="text-[8px] font-black h-4 px-1 rounded-sm">PRIMARY</Badge>
                              )}
                              {order.isExistingPrimary && !isPrimary && (
                                <Badge variant="outline" className="text-[8px] font-black h-4 px-1 rounded-sm border-amber-500 text-amber-700">EXISTING PRIMARY</Badge>
                              )}
                              {!order.isExistingPrimary && !isPrimary && order.id !== primaryOrderId && (
                                <Badge variant="outline" className="text-[8px] font-black h-4 px-1 rounded-sm border-blue-400 text-blue-600 opacity-60">EXISTING CHILD</Badge>
                              )}
                           </div>
                           <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                              <Hash className="w-2.5 h-2.5" />
                              <span>Inv: {order.invoiceNumber || "—"}</span>
                           </div>
                        </div>

                        {/* Customer Info */}
                        <div className="flex-[1.5] py-2 sm:py-0 border-t sm:border-t-0 sm:border-l border-border/40 px-4 space-y-1">
                            <div className="flex items-center gap-1.5">
                                <User className="w-3 h-3 text-primary" />
                                <span className="text-xs font-bold truncate">{order.customerName}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Phone className="w-2.5 h-2.5 text-muted-foreground" />
                                <span className="text-[10px] font-medium text-muted-foreground">{order.customerPhone || "N/A"}</span>
                            </div>
                        </div>

                        {/* Delivery Info */}
                        <div className="flex-1 py-2 sm:py-0 border-t sm:border-t-0 sm:border-l border-border/40 px-4 space-y-1">
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-[10px] font-black text-muted-foreground uppercase">Current Delivery</span>
                            </div>
                            <span className="text-[11px] font-bold block">
                                {order.deliveryDate ? format(new Date(order.deliveryDate), "PP") : "Not Set"}
                            </span>
                        </div>

                        {/* Action */}
                        <div className="flex items-center justify-end px-2 ml-auto">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeOrder(order.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </div>

        {/* --- RIGHT: Link Configuration Panel --- */}
        <div className="lg:col-span-4 space-y-4">
           {/* Date Picker Card */}
           <motion.div
            variants={itemVariants}
            className={cn(
              "bg-card p-5 rounded-xl border-2 shadow-sm transition-all sticky top-24 py-0 gap-0",
              hasOrders ? "border-primary/30" : "border-border opacity-60"
            )}
          >
            <div className="space-y-3 py-5">
              <div className="flex items-center gap-3 border-b border-border pb-3">
                 <div className="p-2 bg-primary/10 rounded-lg">
                    <CalendarIcon className="w-4 h-4 text-primary" />
                 </div>
                 <div>
                    <h3 className="text-xs font-black uppercase tracking-widest">Global Revise Date</h3>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">Sync all delivery dates</p>
                 </div>
              </div>

              <div className="space-y-3">
                 <Calendar
                  mode="single"
                  selected={reviseDate}
                  onSelect={setReviseDate}
                  className="rounded-md border-2 border-border/40 w-full"
                  disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                />

                <div className="space-y-2.5 pt-1">
                   <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                      <span className="text-muted-foreground">Primary Order</span>
                      <span className={cn(primaryOrderId ? "text-primary" : "text-destructive")}>
                         {primaryOrderId ? `Order #${primaryOrderId}` : "Required"}
                      </span>
                   </div>
                   <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                      <span className="text-muted-foreground">Revise Date</span>
                      <span className={cn(reviseDate ? "text-primary" : "text-destructive")}>
                         {reviseDate ? format(reviseDate, "PP") : "Required"}
                      </span>
                   </div>

                   <Separator />

                   <Button 
                    className="w-full h-11 font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                    onClick={handleLinkOrders} 
                    disabled={!canSubmit}
                   >
                     {isSubmitting ? (
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                     ) : (
                        <LinkIcon className="w-4 h-4 mr-2" />
                     )}
                     Link & Update Group
                   </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* --- Customer Selection Dialog --- */}
      <ErrorBoundary>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="!w-[95vw] sm:!w-[90vw] md:!w-[85vw] lg:!w-[80vw] !max-w-5xl max-h-[85vh]">
            <DialogHeader className="border-b border-border pb-4 px-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl">
                  <LinkIcon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tight">
                    Select Orders to Link
                  </DialogTitle>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-1">
                    Choose multiple confirmed orders for this customer
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="overflow-auto max-h-[50vh] border rounded-xl bg-muted/5">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b-2 border-border/60">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="p-4 text-left w-12">
                      <div className="flex items-center justify-center">
                         <Checkbox
                          checked={
                            customerOrders.length > 0 &&
                            selectedDialogIds.length === customerOrders.filter(o => !o.linked_order_id).length
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              const availableIds = customerOrders
                                .filter((o) => !o.linked_order_id)
                                .map((o) => o.id);
                              setSelectedDialogIds(availableIds);
                            } else {
                              setSelectedDialogIds([]);
                            }
                          }}
                        />
                      </div>
                    </th>
                    <th className="p-4 text-left">Identity</th>
                    <th className="p-4 text-left">Link Status</th>
                    <th className="p-4 text-left">Current Delivery</th>
                    <th className="p-4 text-left">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customerOrders.map((order: any) => {
                    const isChild = !!order.linked_order_id;
                    const isPrimary = order.child_orders && order.child_orders.length > 0;
                    const isSelected = selectedDialogIds.includes(order.id);

                    return (
                      <tr
                        key={order.id}
                        className={cn(
                          "transition-colors group cursor-pointer",
                          isSelected
                              ? "bg-primary/5 hover:bg-primary/10"
                              : "hover:bg-muted/20",
                        )}
                        onClick={() => toggleDialogSelection(order.id)}
                      >
                        <td className="p-4">
                          <div className="flex items-center justify-center">
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleDialogSelection(order.id)}
                                onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="space-y-1">
                            <h4 className="font-black text-xs uppercase">
                                #{order.id}
                            </h4>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">
                              Inv: {order.invoice_number ?? "—"}
                            </p>
                          </div>
                        </td>
                        <td className="p-4">
                           {isChild ? (
                             <Badge variant="secondary" className="text-[8px] font-black h-4 px-1 rounded-sm whitespace-nowrap">
                                LINKED TO #{order.linked_order_id}
                             </Badge>
                           ) : isPrimary ? (
                             <Badge variant="secondary" className="text-[8px] font-black h-4 px-1 rounded-sm whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200">
                                PRIMARY OF GROUP
                             </Badge>
                           ) : (
                             <span className="text-[10px] font-bold text-muted-foreground uppercase">Independent</span>
                           )}
                        </td>
                        <td className="p-4">
                           {order.delivery_date ? (
                             <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs font-bold">{format(new Date(order.delivery_date), "PP")}</span>
                             </div>
                           ) : (
                             <span className="text-[10px] font-bold text-muted-foreground uppercase">Not set</span>
                           )}
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider h-5 px-2">
                            {order.production_stage?.replace(/_/g, " ") ?? "N/A"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <DialogFooter className="border-t border-border pt-6 px-2">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
                <div className="flex items-center gap-2">
                   <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                   <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {selectedDialogIds.length} Orders Selected
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    className="font-black uppercase tracking-widest text-[10px]"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDialogConfirm}
                    disabled={selectedDialogIds.length === 0}
                    className="font-black uppercase tracking-widest h-10 px-6 shadow-lg shadow-primary/20"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Add Selection
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