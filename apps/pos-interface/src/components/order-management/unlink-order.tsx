"use client";

import {
  getPendingOrdersByCustomer,
  updateOrder,
  getOrderById,
  getOrderByInvoice,
} from "@/api/orders";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import {
  Unlink,
  Calendar as CalendarIcon,
  AlertCircle,
  User,
  Package,
  Check,
  Clock,
  RefreshCw
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
import { DirectLookupCard } from "./order-search-form";
import { ErrorBoundary } from "../global/error-boundary";
import { DatePicker } from "../ui/date-picker";
import { cn } from "@/lib/utils";
import { SearchCustomer } from "../forms/customer-demographics/search-customer";
import { Separator } from "../ui/separator";

import type { Customer } from "@repo/database";

export default function UnlinkOrder() {
  const queryClient = useQueryClient();

  // Search State
  const [orderIdSearch, setOrderIdSearch] = useState<number | undefined>();
  const [fatouraSearch, setFatouraSearch] = useState<number | undefined>();
  const [idError, setIdError] = useState<string | undefined>();
  const [fatouraError, setFatouraError] = useState<string | undefined>();
  
  const [isSearchingId, setIsSearchingId] = useState(false);
  const [isSearchingFatoura, setIsSearchingFatoura] = useState(false);

  // Global State
  const [foundOrder, setFoundOrder] = useState<any | null>(null);
  const [reviseDate, setReviseDate] = useState<Date | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [selectedDialogOrderId, setSelectedDialogOrderId] = useState<number | null>(null);

  // Input Handlers
  const handleOrderIdChange = (val: number | undefined) => {
    setOrderIdSearch(val);
    if (idError) setIdError(undefined);
  };

  const handleFatouraChange = (val: number | undefined) => {
    setFatouraSearch(val);
    if (fatouraError) setFatouraError(undefined);
  };

  // Search Handlers
  const handleCustomerFound = async (customer: Customer) => {
    try {
      const ordersResponse = await getPendingOrdersByCustomer(
        customer.id,
        20,
        "confirmed",
        true // Include relations
      );

      if (ordersResponse.data && ordersResponse.data.length > 0) {
        setCustomerOrders(ordersResponse.data);
        setSelectedDialogOrderId(null);
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
        const res = await getOrderById(orderIdSearch, true);
        if (res.status === "error" || !res.data) {
            setIdError("Order not found");
            toast.error("Order ID not found");
        } else {
            setFoundOrder(res.data);
            setOrderIdSearch(undefined);
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
        const res = await getOrderByInvoice(fatouraSearch, true);
        if (res.status === "error" || !res.data) {
            setFatouraError("Invoice not found");
            toast.error("Invoice Number not found");
        } else {
            setFoundOrder(res.data);
            setFatouraSearch(undefined);
        }
    } catch (err) {
        toast.error("Search failed");
    } finally {
        setIsSearchingFatoura(false);
    }
  };

  // Dialog Handlers
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

  // Unlink Handler
  async function handleUnlink() {
    if (!foundOrder) return;

    if (!foundOrder.linked_order_id) {
      toast.info("This order is not currently linked.");
      return;
    }

    if (!reviseDate) {
      toast.error("Please select a new delivery date.");
      return;
    }

    setIsSubmitting(true);
    try {
      const updateData: any = {
        linked_order_id: null,
        unlinked_date: new Date().toISOString(),
        delivery_date: reviseDate.toISOString(),
      };

      await updateOrder(updateData, foundOrder.id);

      toast.success("Order unlinked successfully! Delivery date updated.");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setTimeout(() => handleClear(), 1500);
    } catch (error) {
      console.error("Unlink failed", error);
      toast.error("Failed to unlink order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Clear/Search Again Handler
  function handleClear() {
    setFoundOrder(null);
    setReviseDate(null);
    setOrderIdSearch(undefined);
    setFatouraSearch(undefined);
    setIdError(undefined);
    setFatouraError(undefined);
    setCustomerOrders([]);
    setSelectedDialogOrderId(null);
  }

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
      className="space-y-8 p-6 md:p-10 max-w-6xl mx-auto"
    >
      {/* --- Page Header --- */}
      <motion.div variants={itemVariants} className="space-y-1 border-b border-border pb-6">
        <h1 className="text-3xl font-bold text-foreground">
          Unlink Order
        </h1>
        <p className="text-sm text-muted-foreground">
          Disconnect an order from its group and reschedule delivery
        </p>
      </motion.div>

      {/* --- Search Section --- */}
      <AnimatePresence mode="wait">
        {!foundOrder ? (
          <motion.div
            key="search-mode"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
          >
            <div className="lg:col-span-7">
                <SearchCustomer 
                    onCustomerFound={handleCustomerFound}
                    onHandleClear={() => {}}
                />
            </div>
            <div className="lg:col-span-5">
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
          </motion.div>
        ) : (
          <motion.div
            key="display-mode"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <Card className="overflow-hidden border-2 border-primary/20 shadow-xl">
              <CardHeader className="bg-muted/30 border-b border-border p-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 text-primary rounded-xl shadow-sm">
                      <Package className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold text-foreground">Order #{foundOrder.id}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Inv: {foundOrder.invoice_number || "—"}
                      </p>
                    </div>
                  </div>
                  <Badge 
                    variant={foundOrder.linked_order_id ? "default" : "outline"}
                    className={cn(
                        "h-7 px-3 font-semibold text-[10px]",
                        !foundOrder.linked_order_id && "text-muted-foreground opacity-50"
                    )}
                  >
                    {foundOrder.linked_order_id ? `Linked to #${foundOrder.linked_order_id}` : "Not Linked"}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-12 items-stretch">
                  <div className="md:col-span-7 p-8 space-y-8 border-r border-border/60">
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Production Stage</Label>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" />
                                <span className="font-bold text-sm text-foreground uppercase">{foundOrder.production_stage?.replace(/_/g, " ")}</span>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Delivery</Label>
                            <div className="flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4 text-primary" />
                                <span className="font-bold text-sm text-foreground">
                                    {foundOrder.delivery_date ? format(new Date(foundOrder.delivery_date), "PPP") : "Not Set"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <Separator className="opacity-50" />

                    <div className="space-y-4">
                        <Label className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
                            <User className="w-3.5 h-3.5" /> Customer Details
                        </Label>
                        <div className="bg-muted/30 rounded-xl p-4 border border-border grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-muted-foreground block uppercase tracking-tight">Name</span>
                                <span className="font-bold text-sm text-foreground truncate block">{foundOrder.customer?.name || "N/A"}</span>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-muted-foreground block uppercase tracking-tight">Phone</span>
                                <span className="font-bold text-sm text-foreground block">{foundOrder.customer?.phone || "N/A"}</span>
                            </div>
                        </div>
                    </div>
                  </div>

                  <div className="md:col-span-5 p-8 bg-muted/5 space-y-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 border-b border-border pb-2">
                            <Unlink className="w-4 h-4 text-destructive" />
                            <h4 className="text-sm font-bold text-foreground">Unlink Configuration</h4>
                        </div>
                        
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">New Delivery Date</Label>
                            <DatePicker 
                                value={reviseDate || undefined}
                                onChange={(date) => setReviseDate(date || null)}
                                placeholder="Select New Date"
                                className="w-full h-12 border-2 font-semibold"
                            />
                            <p className="text-[10px] text-muted-foreground font-medium px-1 italic">
                                Required to mark the order as independent
                            </p>
                        </div>
                    </div>

                    <div className="pt-4 space-y-3">
                        <Button
                            onClick={handleUnlink}
                            variant="destructive"
                            className="w-full h-12 font-bold uppercase tracking-wider shadow-sm transition-all active:scale-[0.98]"
                            disabled={isSubmitting || !foundOrder.linked_order_id || !reviseDate}
                        >
                            {isSubmitting ? (
                                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                            ) : (
                                <Unlink className="w-5 h-5 mr-2" />
                            )}
                            Unlink & Update
                        </Button>
                        <Button
                            onClick={handleClear}
                            variant="ghost"
                            className="w-full font-bold uppercase tracking-widest text-[10px] text-muted-foreground hover:bg-background"
                        >
                            Cancel and Search Again
                        </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <motion.div variants={itemVariants} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-tight text-amber-900">System Note</p>
                    <p className="text-[11px] font-medium text-amber-800 leading-relaxed uppercase tracking-wide">
                        Unlinking an order will remove its relationship with other orders in the workshop group. 
                        A new delivery date must be set to ensure proper scheduling.
                    </p>
                </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ErrorBoundary>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="!w-[95vw] sm:!w-[90vw] md:!w-[85vw] lg:!w-[80vw] !max-w-5xl max-h-[85vh]">
            <DialogHeader className="border-b border-border pb-4 px-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-destructive/10 rounded-xl text-destructive">
                  <Unlink className="w-6 h-6" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold uppercase tracking-tight text-foreground">
                    Select Order to Unlink
                  </DialogTitle>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-1">
                    Choose a linked order to disconnect from its group
                  </p>
                </div>
              </div>
            </DialogHeader>

            <RadioGroup
              value={selectedDialogOrderId?.toString()}
              onValueChange={(val) => setSelectedDialogOrderId(parseInt(val))}
              className="overflow-y-auto max-h-[50vh] px-1"
            >
              <div className="border rounded-xl bg-muted/5 overflow-hidden">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b-2 border-border/60">
                    <tr className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      <th className="p-4 w-12 text-center">Select</th>
                      <th className="p-4 text-left">Identity</th>
                      <th className="p-4 text-left">Link Status</th>
                      <th className="p-4 text-left">Delivery Date</th>
                      <th className="p-4 text-left">Stage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {customerOrders.map((order) => {
                      const isLinked = !!order.linked_order_id;
                      const isSelected = selectedDialogOrderId === order.id;
                      const canSelect = isLinked;

                      return (
                        <tr
                          key={order.id}
                          className={cn(
                            "transition-colors group",
                            !canSelect
                              ? "bg-muted/30 opacity-60 grayscale cursor-not-allowed"
                              : isSelected
                                ? "bg-primary/5 hover:bg-primary/10"
                                : "hover:bg-muted/20",
                          )}
                          onClick={() => canSelect && setSelectedDialogOrderId(order.id)}
                        >
                          <td className="p-4">
                            <div className="flex items-center justify-center">
                                <RadioGroupItem
                                    value={order.id.toString()}
                                    id={`dialog-order-${order.id}`}
                                    disabled={!canSelect}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="space-y-1">
                              <h4 className="font-bold text-xs uppercase text-foreground">
                                  #{order.id}
                              </h4>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase">
                                Inv: {order.invoice_number ?? "—"}
                              </p>
                            </div>
                          </td>
                          <td className="p-4">
                             {isLinked ? (
                                <Badge variant="secondary" className="text-[8px] font-bold h-4 px-1 rounded-sm whitespace-nowrap">
                                    LINKED TO #{order.linked_order_id}
                                </Badge>
                             ) : (
                                <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-40">Independent</span>
                             )}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs font-bold whitespace-nowrap text-foreground">
                                    {order.delivery_date ? format(new Date(order.delivery_date), "PP") : "Not Set"}
                                </span>
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider h-5 px-2">
                              {order.production_stage?.replace(/_/g, " ") ?? "N/A"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </RadioGroup>

            <DialogFooter className="border-t border-border pt-6 px-2">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
                <div className="flex items-center gap-2">
                   <div className={cn("h-2 w-2 rounded-full bg-primary", selectedDialogOrderId && "animate-pulse")} />
                   <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {selectedDialogOrderId ? `Order #${selectedDialogOrderId} Selected` : "Select a linked order"}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    className="font-bold uppercase tracking-widest text-[10px]"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDialogConfirm}
                    disabled={!selectedDialogOrderId}
                    className="font-bold uppercase tracking-widest h-10 px-6 shadow-lg shadow-primary/20"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Load for Unlinking
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