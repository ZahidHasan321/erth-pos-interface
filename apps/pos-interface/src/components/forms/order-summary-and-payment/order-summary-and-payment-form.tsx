"use client";

import { AnimatePresence, motion, type Transition } from "framer-motion";
import { 
  CheckIcon, 
  AlertCircle, 
  Check, 
  Printer, 
  X, 
  Receipt, 
  Loader2,
  ArrowRight
} from "lucide-react";
import React from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useReactToPrint } from "react-to-print";

import { Button } from "@/components/ui/button";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { getEmployees } from "@/api/employees";
import { OrderInvoice, type InvoiceData } from "@/components/invoice";
import { useFatouraPolling } from "@/hooks/useFatouraPolling";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

import HomeDeliveryIcon from "@/assets/home_delivery.png";
import PickUpIcon from "@/assets/pickup.png";
import KNetLogo from "@/assets/payment-assets/knet.png";
import CashIcon from "@/assets/payment-assets/cash.png";
import LinkPaymentIcon from "@/assets/payment-assets/linkPayment.png";
import InstallmentsIcon from "@/assets/payment-assets/installments.png";

import { orderSchema } from "./order-form.schema";
import type { FabricSelectionSchema } from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";

// ---------------- Constants ----------------
const discountOptions = [
  { value: "flat", label: "Flat" },
  { value: "by_value", label: "Cash" },
  { value: "referral", label: "Referral" },
  { value: "loyalty", label: "Loyalty" },
] as const;

const smoothTransition: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 28,
};

const paymentOptions = [
  { value: "knet", label: "K-Net", img: KNetLogo },
  { value: "cash", label: "Cash", img: CashIcon },
  { value: "link_payment", label: "Link Payment", img: LinkPaymentIcon },
  { value: "installments", label: "Installments", img: InstallmentsIcon },
  {
    value: "others",
    label: "Others",
    icon: <Receipt className="w-10 h-10" />,
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
}

export function OrderSummaryAndPaymentForm({
  form,
  onConfirm,
  onCancel,
  isOrderClosed,
  invoiceData,
  orderId,
  checkoutStatus,
  customerAddress,
  fabricSelections = [],
}: OrderSummaryAndPaymentFormProps) {
  const invoiceRef = React.useRef<HTMLDivElement>(null);
  const [showZeroPaymentDialog, setShowZeroPaymentDialog] = React.useState(false);

  // Watch form values
  const [
    fabric_charge,
    stitching_charge,
    style_charge,
    delivery_charge,
    shelf_charge,
    discount_value = 0,
    discount_type,
    discount_percentage = 0,
    home_delivery = false,
    paid = 0,
    payment_type,
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
    ],
  });

  // Poll for fatoura number when order is completed
  const { fatoura, isLoadingFatoura, hasFatoura } = useFatouraPolling(
    orderId,
    checkoutStatus === "confirmed",
  );

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
  const hasAnyHomeDelivery = React.useMemo(() => {
    return fabricSelections.some((fabric) => fabric.home_delivery);
  }, [fabricSelections]);

  const hasAnyExpressDelivery = React.useMemo(() => {
    return fabricSelections.some((fabric) => fabric.express);
  }, [fabricSelections]);

  React.useEffect(() => {
    if (hasAnyHomeDelivery && !home_delivery) {
      form.setValue("home_delivery", true);
    }
  }, [hasAnyHomeDelivery, home_delivery, form]);

  React.useEffect(() => {
    let newDeliveryCharge = 0;
    if (hasAnyHomeDelivery || home_delivery) {
      newDeliveryCharge = 5; 
      if (hasAnyExpressDelivery) {
        newDeliveryCharge += 2; 
      }
    }
    form.setValue("delivery_charge", newDeliveryCharge);
  }, [home_delivery, hasAnyHomeDelivery, hasAnyExpressDelivery, form]);

  // Pricing logic
  const totalDue = (Number(fabric_charge) || 0) + 
                   (Number(stitching_charge) || 0) + 
                   (Number(style_charge) || 0) + 
                   (Number(delivery_charge) || 0) + 
                   (Number(shelf_charge) || 0);

  const previousDiscountType = React.useRef(discount_type);
  React.useEffect(() => {
    if (previousDiscountType.current !== discount_type) {
      form.setValue("discount_value", 0);
      form.setValue("discount_percentage", 0);
      form.setValue("discount_in_kwd", undefined);
      form.setValue("referral_code", null);
      previousDiscountType.current = discount_type;
    }
  }, [discount_type, form]);

  React.useEffect(() => {
    if (
      (discount_type === "flat" || discount_type === "referral" || discount_type === "loyalty") &&
      discount_percentage
    ) {
      const discount = parseFloat(
        (totalDue * (discount_percentage / 100)).toFixed(2)
      );
      form.setValue("discount_value", discount);
      form.setValue("discount_in_kwd", discount.toFixed(2));
    }
  }, [discount_percentage, totalDue, discount_type, form]);

  React.useEffect(() => {
    if (discount_type === "by_value" && discount_value !== undefined) {
      form.setValue("discount_in_kwd", Number(discount_value).toFixed(2));
    }
  }, [discount_value, discount_type, form]);

  const safeDiscountValue = Number(discount_value) || 0;
  const safePaid = Number(paid) || 0;
  const finalAmount = totalDue - safeDiscountValue;
  const balance = finalAmount - safePaid;

  React.useEffect(() => {
    const validTotal = finalAmount < 0 ? 0 : finalAmount;
    if (form.getValues("order_total") !== validTotal) {
      form.setValue("order_total", validTotal);
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

  const handleSubmit = (data: z.infer<typeof orderSchema>) => {
    if (showAddressWarning) return;

    if (!data.paid || data.paid === 0) {
      setShowZeroPaymentDialog(true);
    } else {
      onConfirm(data);
    }
  };

  const handleConfirmOrder = () => {
    const data = form.getValues();
    onConfirm(data);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-8 w-full"
      >
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">
              Review & Payment
            </h1>
            <p className="text-sm text-muted-foreground">
              Review your order, apply discounts, and select payment method
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* LEFT COLUMN: Delivery & Discounts */}
          <div className="space-y-6">
            {/* Delivery Section */}
            <motion.section
              layout
              transition={smoothTransition}
              className="bg-card rounded-xl border border-border shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold mb-4">Delivery Option</h3>
              {hasAnyHomeDelivery && (
                <Alert className="mb-4 border-primary/50 bg-primary/5">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <AlertTitle className="text-primary font-semibold">Home Delivery Required</AlertTitle>
                  <AlertDescription>
                    One or more fabrics have home delivery selected.
                  </AlertDescription>
                </Alert>
              )}
              <FormField
                control={form.control}
                name="home_delivery"
                render={({ field }) => (
                  <RadioGroup
                    onValueChange={(value) => field.onChange(value === "true")}
                    value={field.value ? "true" : "false"}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                    disabled={isOrderClosed || hasAnyHomeDelivery}
                  >
                    {deliveryOptions.map((option) => {
                      const isDisabled = isOrderClosed || (hasAnyHomeDelivery && !option.value);
                      const isSelected = field.value === option.value;
                      return (
                        <label
                          key={option.value.toString()}
                          htmlFor={option.value.toString()}
                          className={cn(
                            "flex flex-col items-center justify-center rounded-lg p-6 border-2 transition-all relative",
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
                              "h-16 object-contain transition-all",
                              isSelected && "scale-110"
                            )}
                          />
                          <FormLabel className={cn(
                            "mt-3 text-base cursor-pointer transition-all",
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
                    className="overflow-hidden mt-4"
                  >
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Address Required</AlertTitle>
                      <AlertDescription>
                        Please add the customer's address in Demographics.
                      </AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>

            {/* Discount Section */}
            <motion.section
              layout
              transition={smoothTransition}
              className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
            >
              <header className="bg-primary text-primary-foreground px-6 py-4">
                <h3 className="text-lg font-semibold">Discounts</h3>
              </header>
              <div className="p-6 space-y-4">
                <FormField
                  control={form.control}
                  name="discount_type"
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-4">
                      {discountOptions.map((opt) => {
                        const active = field.value === opt.value;
                        return (
                          <div key={opt.value}>
                            <button
                              type="button"
                              onClick={() => !isOrderClosed && field.onChange(active ? undefined : opt.value)}
                              className={cn(
                                "flex items-center justify-between rounded-lg border p-4 transition-all w-full",
                                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background",
                                isOrderClosed && "opacity-50 cursor-not-allowed"
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
                      className="overflow-hidden"
                    >
                      <div className="pt-4 space-y-4 border-t border-border mt-2">
                        {discount_type === "flat" || discount_type === "referral" || discount_type === "loyalty" ? (
                          <div className="flex gap-4">
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
          </div>

          {/* RIGHT COLUMN: Payment Method & Summary */}
          <div className="space-y-6">
            {/* Payment Method */}
            <motion.section
              layout
              transition={smoothTransition}
              className="bg-card rounded-xl border border-border shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold mb-4">Payment Method</h3>
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
                        className="grid grid-cols-3 gap-4"
                      >
                        {paymentOptions.map((option) => (
                          <label
                            key={option.value}
                            className={cn(
                              "flex flex-col items-center justify-center rounded-lg p-3 border-2 transition-all cursor-pointer relative text-center",
                              field.value === option.value ? "border-primary bg-primary/5" : "border-border bg-background"
                            )}
                          >
                            <div className="h-10 w-10 flex items-center justify-center mb-2">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                <FormField
                  control={form.control}
                  name="payment_ref_no"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ref. No {payment_type !== "cash" && "*"}</FormLabel>
                      <FormControl><Input {...field} disabled={isOrderClosed} /></FormControl>
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
            </motion.section>

            {/* Charges Summary */}
            <motion.section
              layout
              transition={smoothTransition}
              className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-4"
            >
              <h3 className="text-lg font-semibold mb-2">Summary</h3>
              <div className="space-y-2 text-sm border-b border-border pb-4">
                <div className="flex justify-between"><span>Fabric</span><span>{Number(fabric_charge || 0).toFixed(3)} KWD</span></div>
                <div className="flex justify-between"><span>Stitching</span><span>{Number(stitching_charge || 0).toFixed(3)} KWD</span></div>
                <div className="flex justify-between"><span>Style</span><span>{Number(style_charge || 0).toFixed(3)} KWD</span></div>
                <div className="flex justify-between"><span>Delivery</span><span>{Number(delivery_charge || 0).toFixed(3)} KWD</span></div>
                <div className="flex justify-between"><span>Shelf</span><span>{Number(shelf_charge || 0).toFixed(3)} KWD</span></div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between font-semibold"><span>Total Due</span><span>{totalDue.toFixed(3)} KWD</span></div>
                <div className="flex justify-between text-secondary"><span>Discount</span><span>-{safeDiscountValue.toFixed(3)} KWD</span></div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                  <span>Final Total</span>
                  <span className="text-primary">{finalAmount.toFixed(3)} KWD</span>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <FormField
                  control={form.control}
                  name="paid"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center">
                        <FormLabel className="text-base font-bold">Amount Paid (KWD)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            className="w-32 text-right font-bold text-lg h-12" 
                            placeholder="0.000"
                            {...field} 
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                            onFocus={(e) => e.target.select()}
                            disabled={isOrderClosed}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-between items-center mt-2 text-sm">
                  <span className="text-muted-foreground">Remaining Balance:</span>
                  <span className={cn("font-semibold", balance > 0 ? "text-destructive" : "text-primary")}>
                    {Math.max(0, balance).toFixed(3)} KWD
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 pt-6">
                {!isOrderClosed && (
                  <Button type="submit" size="lg" className="w-full h-14 text-lg">
                    <Check className="w-5 h-5 mr-2" />
                    Confirm & Complete Order
                  </Button>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePrint}
                    disabled={!isOrderClosed || (isLoadingFatoura)}
                    className="h-12"
                  >
                    {isLoadingFatoura ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                    Print Invoice
                  </Button>

                  {!isOrderClosed && (
                    <Button type="button" variant="destructive" onClick={onCancel} className="h-12">
                      <X className="w-4 h-4 mr-2" />
                      Cancel Order
                    </Button>
                  )}
                </div>
              </div>
            </motion.section>
          </div>
        </div>

        {/* Hidden Invoice Component */}
        <div className="hidden">
          <div ref={invoiceRef}>
            {invoiceData && (isOrderClosed && hasFatoura) && (
              <OrderInvoice data={{ ...invoiceData, fatoura }} />
            )}
          </div>
        </div>

        {/* Loading Overlay */}
        {isOrderClosed && isLoadingFatoura && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-card p-8 rounded-xl border border-border shadow-lg flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <h3 className="text-lg font-semibold">Generating Invoice...</h3>
            </div>
          </div>
        )}

        <ConfirmationDialog
          isOpen={showZeroPaymentDialog}
          onClose={() => setShowZeroPaymentDialog(false)}
          onConfirm={() => {
            setShowZeroPaymentDialog(false);
            handleConfirmOrder();
          }}
          title="Zero Payment"
          description="Are you sure you want to complete this order without any payment?"
          confirmText="Yes, Complete Order"
        />
      </form>
    </Form>
  );
}
