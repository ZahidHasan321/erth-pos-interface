"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CheckIcon,
  AlertCircle,
  CalendarDays,
  Check,
  Printer,
  X,
  Receipt,
  Loader2,
  StickyNote,
} from "lucide-react";
import React from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useReactToPrint } from "react-to-print";
import { toast } from "sonner";

import { Button } from "@repo/ui/button";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@repo/ui/form";
import { Input } from "@repo/ui/input";
import { Textarea } from "@repo/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@repo/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/alert";
import { Combobox } from "@repo/ui/combobox";
import { cn } from "@/lib/utils";
import { getEmployees } from "@/api/employees";
import { OrderInvoice, SalesInvoice, type InvoiceData } from "@/components/invoice";
import { FullScreenLoader } from "@/components/global/full-screen-loader";
import { usePricing } from "@/hooks/usePricing";

import HomeDeliveryIcon from "@/assets/home_delivery.png";
import PickUpIcon from "@/assets/pickup.png";
import KNetLogo from "@/assets/payment-assets/knet.png";
import CashIcon from "@/assets/payment-assets/cash.png";
import LinkPaymentIcon from "@/assets/payment-assets/linkPayment.png";
import InstallmentsIcon from "@/assets/payment-assets/installments.png";

import { orderSchema } from "./order-form.schema";
import type { FabricSelectionSchema } from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";
import { PAGE_VARIANTS, TRANSITIONS } from "@/lib/constants/animations";

// ---------------- Constants ----------------
const discountOptions = [
  { value: "flat", label: "Flat" },
  { value: "by_value", label: "Cash" },
  { value: "referral", label: "Referral" },
  { value: "loyalty", label: "Loyalty" },
] as const;

const smoothTransition = TRANSITIONS.default;

const paymentOptions = [
  { value: "knet", label: "K-Net", img: KNetLogo },
  { value: "cash", label: "Cash", img: CashIcon },
  { value: "link_payment", label: "Link Payment", img: LinkPaymentIcon },
  { value: "installments", label: "Installments", img: InstallmentsIcon },
  {
    value: "others",
    label: "Others",
    icon: <Receipt className="w-8 h-8" />,
  },
];

const deliveryOptions = [
  { value: false, label: "Pick Up", img: PickUpIcon },
  { value: true, label: "Home Delivery", img: HomeDeliveryIcon },
];

// ---------------- Component ----------------
type OrderSchemaType = z.infer<typeof orderSchema>;

interface OrderSummaryAndPaymentFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<OrderSchemaType, any, any>;
  onConfirm: (values: OrderSchemaType) => void;
  onCancel: () => void;
  isOrderClosed?: boolean;
  invoiceData?: InvoiceData;
  orderId?: number | null;
  checkoutStatus?: "draft" | "confirmed" | "cancelled";
  customerAddress?: {
    city?: string;
    area?: string;
    block?: string;
    street?: string;
    house_no?: string;
    address_note?: string;
  };
  fabricSelections?: FabricSelectionSchema[];
  fatoura?: number;
  isLoadingFatoura?: boolean;
  orderType?: "WORK" | "SALES";
  deliveryDate?: string | null;
  /** When true, hides payment/discount controls and shows a confirmation-only summary (ERTH brand) */
  cashierHandlesPayment?: boolean;
  onPrintLabels?: () => void;
}

export function OrderSummaryAndPaymentForm({
  form,
  onConfirm,
  onCancel,
  isOrderClosed,
  invoiceData,
  orderId: _orderId,
  checkoutStatus: _checkoutStatus,
  customerAddress,
  fabricSelections = [],
  fatoura,
  isLoadingFatoura,
  orderType,
  deliveryDate,
  cashierHandlesPayment,
  onPrintLabels,
}: OrderSummaryAndPaymentFormProps) {
  const invoiceRef = React.useRef<HTMLDivElement>(null);
  const { getPrice } = usePricing();

  // Watch form values
  const [
    fabric_charge,
    stitching_charge,
    style_charge,
    delivery_charge,
    shelf_charge,
    discount_value,
    discount_type,
    discount_percentage,
    home_delivery = false,
    paid,
    payment_type,
    order_type,
  ] = useWatch({
    control: form.control,
    name: [
      "fabric_charge",
      "stitching_charge",
      "style_charge",
      "delivery_charge",
      "shelf_charge",
      "discount_value",
      "discount_type",
      "discount_percentage",
      "home_delivery",
      "paid",
      "payment_type",
      "order_type",
    ],
  });

  const effectiveOrderType = orderType || order_type || "WORK";

  // Fetch employees data
  const { data: employeesResponse } = useQuery({
    queryKey: ["employees"],
    queryFn: getEmployees,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const employees = employeesResponse?.data || [];

  // Print handler
  const handlePrint = useReactToPrint({
    contentRef: invoiceRef,
    documentTitle: `Invoice-${invoiceData?.orderId || "Draft"}`,
  });

  // Delivery logic
  const expressGarmentCount = React.useMemo(() => {
    return fabricSelections.filter((fabric) => fabric.express).length;
  }, [fabricSelections]);

  const soakingGarmentCount = React.useMemo(() => {
    return fabricSelections.filter((fabric) => fabric.soaking).length;
  }, [fabricSelections]);

  React.useEffect(() => {
    const newDeliveryCharge = home_delivery ? (getPrice("HOME_DELIVERY") || 5) : 0;
    const newExpressCharge = expressGarmentCount * (getPrice("EXPRESS_SURCHARGE") || 2);
    const newSoakingCharge = soakingGarmentCount * (getPrice("SOAKING_CHARGE") || 0);

    form.setValue("delivery_charge", newDeliveryCharge, { shouldDirty: false });
    form.setValue("express_charge", newExpressCharge, { shouldDirty: false });
    form.setValue("soaking_charge", newSoakingCharge, { shouldDirty: false });
  }, [home_delivery, expressGarmentCount, soakingGarmentCount, form, getPrice]);

  // Pricing logic
  const express_charge = useWatch({ control: form.control, name: "express_charge" });
  const soaking_charge = useWatch({ control: form.control, name: "soaking_charge" });

  const totalDue = (Number(fabric_charge) || 0) +
                   (Number(stitching_charge) || 0) +
                   (Number(style_charge) || 0) +
                   (Number(delivery_charge) || 0) +
                   (Number(express_charge) || 0) +
                   (Number(soaking_charge) || 0) +
                   (Number(shelf_charge) || 0);

  const toggleDiscountType = (type: OrderSchemaType["discount_type"]) => {
    if (isOrderClosed) return;
    
    const currentType = form.getValues("discount_type");
    const newType = currentType === type ? undefined : type;
    
    form.setValue("discount_type", newType, { shouldDirty: true });
    
    // Explicitly reset values ONLY when the user clicks to change/disable the type
    if (newType !== currentType) {
      form.setValue("discount_value", undefined, { shouldDirty: true });
      form.setValue("discount_percentage", undefined, { shouldDirty: true });
      form.setValue("discount_in_kwd", undefined, { shouldDirty: false });
      form.setValue("referral_code", null, { shouldDirty: true });
    }
  };

  React.useEffect(() => {
    if (
      (discount_type === "flat" || discount_type === "referral" || discount_type === "loyalty") &&
      discount_percentage !== undefined && discount_percentage !== null &&
      totalDue > 0
    ) {
      const discount = parseFloat(
        (totalDue * (Number(discount_percentage) / 100)).toFixed(3)
      );
      // Only set if different to avoid render loops
      if (form.getValues("discount_value") !== discount) {
        form.setValue("discount_value", discount, { shouldDirty: false });
        form.setValue("discount_in_kwd", discount.toFixed(3), { shouldDirty: false });
      }
    }
  }, [discount_percentage, totalDue, discount_type, form]);

  React.useEffect(() => {
    if (discount_type === "by_value" && discount_value !== undefined && discount_value !== null) {
      const valStr = Number(discount_value).toFixed(3);
      if (form.getValues("discount_in_kwd") !== valStr) {
        form.setValue("discount_in_kwd", valStr, { shouldDirty: false });
      }
    }
  }, [discount_value, discount_type, form]);

  const safeDiscountValue = typeof discount_value === 'number' ? discount_value : 0;
  const safePaid = typeof paid === 'number' ? paid : 0;
  const finalAmount = totalDue - safeDiscountValue;
  const balance = finalAmount - safePaid;

  // Advance = 50% of stitching charge + full fabric + full shelf + full style + full delivery + full express + full soaking
  const advance = React.useMemo(() => {
    const halfStitching = (Number(stitching_charge) || 0) * 0.5;
    const fullFabric = Number(fabric_charge) || 0;
    const fullShelf = Number(shelf_charge) || 0;
    const fullStyle = Number(style_charge) || 0;
    const fullDelivery = Number(delivery_charge) || 0;
    const fullExpress = Number(express_charge) || 0;
    const fullSoaking = Number(soaking_charge) || 0;
    return parseFloat((halfStitching + fullFabric + fullShelf + fullStyle + fullDelivery + fullExpress + fullSoaking).toFixed(3));
  }, [stitching_charge, fabric_charge, shelf_charge, style_charge, delivery_charge, express_charge, soaking_charge]);

  React.useEffect(() => {
    if (form.getValues("advance") !== advance) {
      form.setValue("advance", advance, { shouldDirty: false });
    }
  }, [advance, form]);

  React.useEffect(() => {
    const validTotal = finalAmount < 0 ? 0 : finalAmount;
    if (form.getValues("order_total") !== validTotal) {
      form.setValue("order_total", validTotal, { shouldDirty: false });
    }
  }, [finalAmount, form]);

  // Address validation
  const hasAddress = React.useMemo(() => {
    if (!customerAddress) return false;
    const hasContent = (value: string | undefined) => value && value.trim().length > 0;
    return (
      hasContent(customerAddress.city) ||
      hasContent(customerAddress.area) ||
      hasContent(customerAddress.block) ||
      hasContent(customerAddress.street) ||
      hasContent(customerAddress.house_no)
    );
  }, [customerAddress]);

  const showAddressWarning = home_delivery && !hasAddress;

  // For ERTH: ensure payment_type is set so schema validation passes
  React.useEffect(() => {
    if (cashierHandlesPayment) {
      const currentType = form.getValues("payment_type");
      if (!currentType) {
        form.setValue("payment_type", "cash", { shouldDirty: false });
      }
    }
  }, [cashierHandlesPayment, form]);

  const handleSubmit = (data: z.infer<typeof orderSchema>) => {
    if (!cashierHandlesPayment && showAddressWarning) {
      toast.error("Address Required", {
        description: "Please add the customer's address in Demographics before selecting Home Delivery."
      });
      return;
    }
    onConfirm(data);
  };

  const onInvalid = (errors: any) => {
    console.error("Order Form Validation Errors:", errors);
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      const firstKey = errorKeys[0];
      const error = errors[firstKey];
      const message = error?.message || `Invalid value for ${firstKey}`;
      toast.error(message);
    }
  };

  // Count garments and shelf items for ERTH summary
  const garmentCount = fabricSelections.length;
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit, onInvalid)}
        className="space-y-4 w-full"
      >
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-foreground">
              {cashierHandlesPayment ? "Review & Confirm" : "Review & Payment"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {cashierHandlesPayment
                ? "Review your order details and confirm — payment will be handled at the cashier"
                : "Review your order, apply discounts, and select payment method"}
            </p>
          </div>
        </div>

        {/* ── ERTH Confirmation Summary ─────────────────────────────────── */}
        {cashierHandlesPayment ? (
          <motion.div
            variants={PAGE_VARIANTS}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            <div className="space-y-3">
              {/* ── Garment cards grid ──────────────────────────────────── */}
              {garmentCount > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {fabricSelections.map((g, i) => {
                    const fabric = invoiceData?.fabrics?.find(f => f.id === g.fabric_id);
                    const fabricName = fabric?.name || (g.fabric_source === "OUT" ? `External (${g.shop_name || "—"})` : `Fabric #${g.fabric_id || "—"}`);

                    return (
                      <div key={g.garment_id || i} className="bg-card rounded-lg border border-border p-2.5 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] shrink-0 ${g.garment_type === "brova" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                            {g.garment_type === "brova" ? "B" : "F"}
                          </span>
                          <span className="text-xs font-semibold truncate">{fabricName}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {[
                            g.style && <span key="style" className="capitalize">{g.style}</span>,
                            fabric?.color,
                            g.fabric_length ? `${g.fabric_length}m` : null,
                          ].filter(Boolean).map((item, idx) => (
                            <React.Fragment key={idx}>{idx > 0 && " · "}{item}</React.Fragment>
                          ))}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {g.express && (
                            <span className="text-[9px] font-semibold px-1 py-px rounded-full bg-red-100 text-red-600">Express</span>
                          )}
                          {g.soaking && (
                            <span className="text-[9px] font-semibold px-1 py-px rounded-full bg-sky-100 text-sky-600">Soak</span>
                          )}
                          {g.delivery_date && (
                            <span className="text-[9px] px-1 py-px rounded-full bg-muted text-muted-foreground">
                              {new Date(g.delivery_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                          )}
                        </div>
                        {g.notes && (
                          <p className="text-[10px] text-muted-foreground italic truncate">
                            <StickyNote className="w-2.5 h-2.5 inline mr-0.5 -mt-px" />{g.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Shelf Items grid */}
              {invoiceData?.shelfProducts && invoiceData.shelfProducts.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {invoiceData.shelfProducts.map((p, i) => (
                    <div key={i} className="bg-card rounded-lg border border-border p-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{p.product_type || `Item ${i + 1}`}</p>
                        {p.brand && <p className="text-[10px] text-muted-foreground">{p.brand}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold tabular-nums">{((p.unit_price ?? 0) * (p.quantity ?? 0)).toFixed(3)}</p>
                        <p className="text-[10px] text-muted-foreground">x{p.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Two columns: Prices (left) | Notes + Order Taker (right) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* LEFT: Price breakdown */}
                <section className="bg-card rounded-xl border border-border shadow-sm p-3 flex flex-col">
                  {deliveryDate && (
                    <div className="flex items-center gap-2 p-1.5 rounded-md bg-muted/40 mb-2 text-xs">
                      <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-muted-foreground">Delivery</span>
                      <span className="font-semibold ml-auto tabular-nums">
                        {new Date(deliveryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1 text-sm flex-1">
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">Fabric</span>
                      <span className="font-medium tabular-nums">{Number(fabric_charge || 0).toFixed(3)} KWD</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-muted-foreground">Stitching</span>
                      <span className="font-medium tabular-nums">{Number(stitching_charge || 0).toFixed(3)} KWD</span>
                    </div>
                    {Number(style_charge) > 0 && (
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">Style</span>
                        <span className="font-medium tabular-nums">{Number(style_charge).toFixed(3)} KWD</span>
                      </div>
                    )}
                    {Number(delivery_charge) > 0 && (
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">Delivery</span>
                        <span className="font-medium tabular-nums">{Number(delivery_charge).toFixed(3)} KWD</span>
                      </div>
                    )}
                    {Number(express_charge) > 0 && (
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">Express{expressGarmentCount > 1 ? ` (${expressGarmentCount})` : ""}</span>
                        <span className="font-medium tabular-nums">{Number(express_charge).toFixed(3)} KWD</span>
                      </div>
                    )}
                    {Number(soaking_charge) > 0 && (
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">Soaking{soakingGarmentCount > 1 ? ` (${soakingGarmentCount})` : ""}</span>
                        <span className="font-medium tabular-nums">{Number(soaking_charge).toFixed(3)} KWD</span>
                      </div>
                    )}
                    {Number(shelf_charge) > 0 && (
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">Shelf</span>
                        <span className="font-medium tabular-nums">{Number(shelf_charge).toFixed(3)} KWD</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-2 mt-2 flex justify-between items-baseline">
                    <div>
                      <span className="text-sm font-bold">Order Total</span>
                      <p className="text-[11px] text-muted-foreground">Discounts & payment at the cashier</p>
                    </div>
                    <span className="text-lg font-bold text-primary tabular-nums">{finalAmount.toFixed(3)} KWD</span>
                  </div>
                </section>

                {/* RIGHT: Notes (flex-grows) + Order Taker */}
                <div className="bg-card rounded-xl border border-border shadow-sm p-3 flex flex-col gap-2">
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem className="flex-1 flex flex-col">
                        <FormLabel className="text-xs font-semibold">Order Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Special instructions or internal notes..."
                            className="flex-1 min-h-[60px] resize-none"
                            disabled={isOrderClosed}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="order_taker_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold">Order Taker</FormLabel>
                        <FormControl>
                          <Combobox
                            options={employees.map((emp) => ({ value: emp.id, label: emp.name }))}
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            placeholder="Select order taker..."
                            disabled={isOrderClosed}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Confirmed state */}
              {isOrderClosed && _checkoutStatus === "confirmed" && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-emerald-700">Order Confirmed</p>
                    <p className="text-xs text-emerald-600">Proceed to cashier for payment & invoicing</p>
                  </div>
                  {onPrintLabels && fabricSelections.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onPrintLabels}
                      className="h-9 shrink-0"
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Print Labels
                    </Button>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              {!isOrderClosed && (
                <div className="flex gap-3">
                  <Button type="button" variant="destructive" onClick={onCancel} className="h-12">
                    <X className="w-5 h-5 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    className="flex-1 h-12 text-base font-semibold"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : (
                      <Check className="w-5 h-5 mr-2" />
                    )}
                    {form.formState.isSubmitting ? "Processing..." : "Confirm Order"}
                  </Button>
                </div>
              )}
            </div>

          </motion.div>
        ) : (
        /* ── Standard Payment Flow (non-ERTH) ───────────────────────────── */
        <motion.div
          variants={PAGE_VARIANTS}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          {/* LEFT COLUMN: Delivery & Discounts */}
          <div className="space-y-4">
            {/* Delivery Section - Hidden for Sales Orders */}
            {effectiveOrderType !== "SALES" && (
              <motion.section
                className="bg-card rounded-xl border border-border shadow-sm p-4"
              >
                <h3 className="text-base font-semibold mb-2">Delivery Option</h3>
                <FormField
                  control={form.control}
                  name="home_delivery"
                  render={({ field }) => (
                    <RadioGroup
                      onValueChange={(value) => field.onChange(value === "true")}
                      value={field.value ? "true" : "false"}
                      className="grid grid-cols-2 gap-4"
                      disabled={isOrderClosed}
                    >
                      {deliveryOptions.map((option) => {
                        const isDisabled = isOrderClosed;
                        const isSelected = field.value === option.value;
                        return (
                          <label
                            key={option.value.toString()}
                            htmlFor={option.value.toString()}
                            className={cn(
                              "flex flex-col items-center justify-center rounded-lg p-3 border-2 transition-all relative",
                              !isDisabled && "cursor-pointer hover:border-primary hover:shadow-md",
                              isDisabled && "opacity-50 cursor-not-allowed",
                              isSelected
                                ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-lg"
                                : "border-border bg-background"
                            )}
                          >
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                                <CheckIcon className="w-4 h-4 text-primary-foreground" />
                              </div>
                            )}
                            <img
                              src={option.img}
                              alt={option.label}
                              className={cn(
                                "h-10 object-contain transition-all",
                                isSelected && "scale-110"
                              )}
                            />
                            <FormLabel className={cn(
                              "mt-2 text-base cursor-pointer transition-all",
                              isSelected ? "font-bold text-primary" : "font-medium text-foreground"
                            )}>
                              {option.label}
                            </FormLabel>
                            <RadioGroupItem id={option.value.toString()} value={option.value.toString()} className="sr-only" />
                          </label>
                        );
                      })}
                    </RadioGroup>
                  )}
                />
                <AnimatePresence>
                  {showAddressWarning && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={smoothTransition}
                      className="overflow-hidden"
                    >
                      <div className="pt-4">
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Address Required</AlertTitle>
                          <AlertDescription>
                            Please add the customer's address in Demographics.
                          </AlertDescription>
                        </Alert>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>
            )}

            {/* Discount Section */}
            <motion.section
              className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
            >
              <header className="bg-primary text-primary-foreground px-4 py-2">
                <h3 className="text-base font-semibold">Discounts</h3>
              </header>
              <div className="p-4 space-y-3">
                <FormField
                  control={form.control}
                  name="discount_type"
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2">
                      {discountOptions.map((opt) => {
                        const active = field.value === opt.value;
                        return (
                          <div key={opt.value}>
                            <button
                              type="button"
                              onClick={() => toggleDiscountType(opt.value)}
                              className={cn(
                                "flex items-center justify-between rounded-lg border p-3 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 w-full select-none touch-manipulation",
                                "pointer-coarse:active:scale-[0.97] active:brightness-[0.97]",
                                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background hover:bg-accent/30 hover:border-primary/30",
                                isOrderClosed ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                              )}
                            >
                              <span className="font-medium text-sm">{opt.label}</span>
                              {active && <CheckIcon className="w-4 h-4 text-primary" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                />

                <AnimatePresence mode="wait">
                  {discount_type && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden px-1 -mx-1 pb-1"
                    >
                      <div className="pt-3 space-y-3 border-t border-border mt-2">
                        {discount_type === "flat" || discount_type === "referral" || discount_type === "loyalty" ? (
                          <div className="flex gap-3">
                            <FormField
                              control={form.control}
                              name="discount_percentage"
                              render={({ field }) => (
                                <FormItem className="flex-1">
                                  <FormLabel>Percentage (%)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      {...field}
                                      value={field.value ?? ""}
                                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                                      onFocus={(e) => e.target.select()}
                                      disabled={isOrderClosed}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="discount_in_kwd"
                              render={({ field }) => (
                                <FormItem className="flex-1">
                                  <FormLabel>Value (KWD)</FormLabel>
                                  <FormControl>
                                    <Input {...field} readOnly className="bg-muted" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        ) : (
                          <FormField
                            control={form.control}
                            name="discount_value"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Discount Value (KWD)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="0.000"
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                                    onFocus={(e) => e.target.select()}
                                    disabled={isOrderClosed}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        )}
                        {discount_type === "referral" && (
                          <FormField
                            control={form.control}
                            name="referral_code"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Referral Code</FormLabel>
                                <FormControl>
                                  <Input {...field} disabled={isOrderClosed} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.section>

            {/* Notes Section */}
            <motion.section
              className="bg-card rounded-xl border border-border shadow-sm p-4"
            >
              <h3 className="text-base font-semibold mb-2">Order Notes</h3>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea 
                        placeholder="Add any special instructions or internal notes for this order..."
                        className="min-h-[80px] resize-none"
                        disabled={isOrderClosed}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </motion.section>
          </div>

          {/* RIGHT COLUMN: Payment Method & Summary */}
          <div className="space-y-4">
            {/* Payment Method */}
            <motion.section
              className="bg-card rounded-xl border border-border shadow-sm p-4"
            >
              <h3 className="text-base font-semibold mb-2">Payment Method</h3>
              <FormField
                control={form.control}
                name="payment_type"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isOrderClosed}
                        className="grid grid-cols-3 gap-2"
                      >
                        {paymentOptions.map((option) => (
                          <label
                            key={option.value}
                            className={cn(
                              "flex flex-col items-center justify-center rounded-lg p-2 border-2 transition-all cursor-pointer relative text-center",
                              field.value === option.value ? "border-primary bg-primary/5" : "border-border bg-background"
                            )}
                          >
                            <div className="h-8 w-8 flex items-center justify-center mb-1">
                              {option.img ? (
                                <img src={option.img} alt={option.label} className="max-h-full object-contain" />
                              ) : option.icon}
                            </div>
                            <span className="text-xs font-medium">{option.label}</span>
                            <RadioGroupItem value={option.value} className="sr-only" />
                          </label>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="payment_ref_no"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ref. No {payment_type !== "cash" && "*"}</FormLabel>
                        <FormControl><Input placeholder="Enter reference no." {...field} disabled={isOrderClosed} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="order_taker_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order Taker</FormLabel>
                        <FormControl>
                          <Combobox
                            options={employees.map((emp) => ({ value: emp.id, label: emp.name }))}
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            placeholder="Select..."
                            disabled={isOrderClosed}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <AnimatePresence>
                  {payment_type === "others" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={smoothTransition}
                      className="overflow-hidden px-1 -mx-1 pb-1"
                    >
                      <FormField
                        control={form.control}
                        name="payment_note"
                        render={({ field }) => (
                          <FormItem className="pt-2">
                            <FormLabel>Payment Note *</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="Specify other payment method..." 
                                disabled={isOrderClosed} 
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Sales Order specific totals and buttons */}
              {effectiveOrderType === "SALES" && (
                <div className="mt-4 pt-3 border-t border-border space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between font-semibold text-sm">
                      <span>Total</span>
                      <span>{totalDue.toFixed(3)} KWD</span>
                    </div>
                    <div className="flex justify-between text-secondary text-sm">
                      <span>Discount</span>
                      <span>-{safeDiscountValue.toFixed(3)} KWD</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                      <span>Net Total</span>
                      <span className="text-primary">{finalAmount.toFixed(3)} KWD</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <FormField
                      control={form.control}
                      name="paid"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex justify-between items-center">
                            <FormLabel className="text-base font-bold">Amount Paid</FormLabel>
                            <div className="flex items-center gap-2">
                              {!isOrderClosed && finalAmount > 0 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs font-semibold"
                                  onClick={() => field.onChange(parseFloat(finalAmount.toFixed(3)))}
                                >
                                  Pay Full
                                </Button>
                              )}
                              <FormControl>
                                <Input
                                  type="number"
                                  className={cn(
                                    "w-32 text-right font-bold text-lg h-10",
                                    balance < 0 && "border-destructive focus-visible:ring-destructive/20"
                                  )}
                                  placeholder="0.000"
                                  {...field}
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                                  onFocus={(e) => e.target.select()}
                                  disabled={isOrderClosed}
                                />
                              </FormControl>
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-between items-center mt-2 text-sm">
                      {balance < 0 ? (
                        <>
                          <span className="text-destructive font-semibold">Overpayment:</span>
                          <span className="font-bold text-destructive">
                            {Math.abs(balance).toFixed(3)} KWD
                          </span>
                        </>
                      ) : balance === 0 && safePaid > 0 ? (
                        <>
                          <span className="text-emerald-600 font-semibold">Paid in Full</span>
                          <span className="font-bold text-emerald-600">0.000 KWD</span>
                        </>
                      ) : balance > 0 ? (
                        <>
                          <span className="text-muted-foreground">Remaining:</span>
                          <span className="font-semibold text-destructive">
                            {balance.toFixed(3)} KWD
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {!isOrderClosed && (
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full h-11 text-lg"
                        disabled={form.formState.isSubmitting}
                      >
                        {form.formState.isSubmitting ? (
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        ) : (
                          <Check className="w-5 h-5 mr-2" />
                        )}
                        Confirm & Complete
                      </Button>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePrint}
                        disabled={!isOrderClosed || isLoadingFatoura}
                        className="h-10"
                      >
                        {isLoadingFatoura ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                        Invoice
                      </Button>

                      {!isOrderClosed && (
                        <Button type="button" variant="destructive" onClick={onCancel} className="h-10">
                          <X className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.section>

            {/* Charges Summary - Hidden for Sales Orders */}
            {effectiveOrderType !== "SALES" && (
              <motion.section
                className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-3"
              >
                <h3 className="text-base font-semibold mb-2">Summary</h3>
                {deliveryDate && (
                  <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-muted/50 border border-border">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">Delivery Date:</span>
                    <span className="text-sm font-semibold text-foreground">
                      {new Date(deliveryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                )}
                <div className="space-y-2 text-sm border-b border-border pb-4">
                  {(order_type === "WORK" || Number(fabric_charge) > 0) && (
                    <div className="flex justify-between"><span>Fabric</span><span>{Number(fabric_charge || 0).toFixed(3)} KWD</span></div>
                  )}
                  {(order_type === "WORK" || Number(stitching_charge) > 0) && (
                    <div className="flex justify-between"><span>Stitching</span><span>{Number(stitching_charge || 0).toFixed(3)} KWD</span></div>
                  )}
                  {(order_type === "WORK" || Number(style_charge) > 0) && (
                    <div className="flex justify-between"><span>Style</span><span>{Number(style_charge || 0).toFixed(3)} KWD</span></div>
                  )}
                  <div className="flex justify-between">
                    <span>Home Delivery</span>
                    <span>{Number(delivery_charge || 0).toFixed(3)} KWD</span>
                  </div>
                  {Number(express_charge) > 0 && (
                    <div className="flex justify-between">
                      <span>Express{expressGarmentCount > 1 ? ` (${expressGarmentCount})` : ""}</span>
                      <span>{Number(express_charge).toFixed(3)} KWD</span>
                    </div>
                  )}
                  {Number(soaking_charge) > 0 && (
                    <div className="flex justify-between">
                      <span>Soaking{soakingGarmentCount > 1 ? ` (${soakingGarmentCount})` : ""}</span>
                      <span>{Number(soaking_charge).toFixed(3)} KWD</span>
                    </div>
                  )}
                  <div className="flex justify-between"><span>Shelf</span><span>{Number(shelf_charge || 0).toFixed(3)} KWD</span></div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between font-semibold"><span>Total Due</span><span>{totalDue.toFixed(3)} KWD</span></div>
                  <div className="flex justify-between text-secondary"><span>Discount</span><span>-{safeDiscountValue.toFixed(3)} KWD</span></div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                    <span>Final Total</span>
                    <span className="text-primary">{finalAmount.toFixed(3)} KWD</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium text-muted-foreground pt-1">
                    <span>Advance (min. required)</span>
                    <span>{advance.toFixed(3)} KWD</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border">
                  <FormField
                    control={form.control}
                    name="paid"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center">
                          <FormLabel className="text-base font-bold">Amount Paid (KWD)</FormLabel>
                          <div className="flex items-center gap-2">
                            {!isOrderClosed && finalAmount > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-semibold"
                                onClick={() => field.onChange(parseFloat(finalAmount.toFixed(3)))}
                              >
                                Pay Full
                              </Button>
                            )}
                            <FormControl>
                              <Input
                                type="number"
                                className={cn(
                                  "w-32 text-right font-bold text-lg h-10",
                                  balance < 0 && "border-destructive focus-visible:ring-destructive/20"
                                )}
                                placeholder="0.000"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                                onFocus={(e) => e.target.select()}
                                disabled={isOrderClosed}
                              />
                            </FormControl>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-between items-center mt-2 text-sm">
                    {balance < 0 ? (
                      <>
                        <span className="text-destructive font-semibold">Overpayment:</span>
                        <span className="font-bold text-destructive">
                          {Math.abs(balance).toFixed(3)} KWD
                        </span>
                      </>
                    ) : balance === 0 && safePaid > 0 ? (
                      <span className="text-emerald-600 font-semibold">Paid in Full</span>
                    ) : (
                      <>
                        <span className="text-muted-foreground">Remaining Balance:</span>
                        <span className={cn("font-semibold", balance > 0 ? "text-destructive" : "text-primary")}>
                          {balance.toFixed(3)} KWD
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 pt-3">
                  {!isOrderClosed && (
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full h-11 text-lg"
                      disabled={form.formState.isSubmitting || showAddressWarning}
                    >
                      {form.formState.isSubmitting ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-5 h-5 mr-2" />
                      )}
                      {form.formState.isSubmitting ? "Processing..." : "Confirm & Complete Order"}
                    </Button>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePrint}
                      disabled={!isOrderClosed || (isLoadingFatoura)}
                      className="h-10"
                    >
                      {isLoadingFatoura ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                      Print Invoice
                    </Button>

                    {isOrderClosed && onPrintLabels && fabricSelections.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onPrintLabels}
                        className="h-10"
                      >
                        <Printer className="w-4 h-4 mr-2" />
                        Print Labels
                      </Button>
                    )}

                    {!isOrderClosed && (
                      <Button type="button" variant="destructive" onClick={onCancel} className="h-10">
                        <X className="w-4 h-4 mr-2" />
                        Cancel Order
                      </Button>
                    )}
                  </div>
                </div>
              </motion.section>
            )}
          </div>
        </motion.div>
        )}

        {/* Hidden Invoice Component */}
        <div style={{ display: 'none' }}>
          <div ref={invoiceRef}>
            {invoiceData && (
              effectiveOrderType === "SALES" ? (
                <SalesInvoice data={{ ...invoiceData, fatoura }} />
              ) : (
                <OrderInvoice data={{ ...invoiceData, fatoura }} />
              )
            )}
          </div>
        </div>

        {/* Loading Overlay */}
        {isOrderClosed && isLoadingFatoura && (
          <FullScreenLoader 
            title="Generating Invoice" 
            subtitle="Please wait while we finalize the records..." 
          />
        )}
      </form>
    </Form>
  );
}
