"use client";

import { getEmployees } from "@/api/employees";
import { CustomerDemographicsForm } from "@/components/forms/customer-demographics";
import {
    customerDemographicsDefaults,
    customerDemographicsSchema,
    type CustomerDemographicsSchema,
} from "@/components/forms/customer-demographics/demographics-form.schema";
import { mapCustomerToFormValues } from "@/components/forms/customer-demographics/demographics-form.mapper";
import { OrderSummaryAndPaymentForm } from "@/components/forms/order-summary-and-payment";
import { ShelfForm } from "@/components/forms/shelf";
import {
    shelfFormSchema,
    type ShelfFormValues,
} from "@/components/forms/shelf/shelf-form.schema";
import { ErrorBoundary } from "@/components/global/error-boundary";
import { FullScreenLoader } from "@/components/global/full-screen-loader";
import { OrderInfoCard } from "@/components/orders-at-showroom/OrderInfoCard";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { HorizontalStepper } from "@/components/ui/horizontal-stepper";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { useConfirmationDialog } from "@/hooks/useConfirmationDialog";
import { useOrderMutations, mapOrderToSchema } from "@/hooks/useOrderMutations";
import { useStepNavigation } from "@/hooks/useStepNavigation";
import { usePricing } from "@/hooks/usePricing";
import {
    orderDefaults,
    orderSchema,
    type OrderSchema,
} from "@/components/forms/order-summary-and-payment/order-form.schema";
import { createSalesOrderStore } from "@/store/current-sales-order";
import type { Customer } from "@repo/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { SearchCustomer } from "@/components/forms/customer-demographics/search-customer";

export const Route = createFileRoute("/$main/orders/new-sales-order")({
    component: NewSalesOrder,
    head: () => ({
        meta: [{ title: "New Sales Order" }],
    }),
});

const steps = [
    { title: "Demographics", id: "step-0" },
    { title: "Shelf Products", id: "step-1" },
    { title: "Review & Payment", id: "step-2" },
];

const useCurrentSalesOrderStore = createSalesOrderStore("main");

function NewSalesOrder() {
    // ============================================================================
    // NAVIGATION
    // ============================================================================
    const navigate = useNavigate();
    const { prices } = usePricing();

    // ============================================================================
    // DATA FETCHING & STORE
    // ============================================================================
    const { data: employeesResponse } = useQuery({
        queryKey: ["employees"],
        queryFn: getEmployees,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const employees = employeesResponse?.data || [];

    // Store selectors
    const currentStep = useCurrentSalesOrderStore((s) => s.currentStep);
    const setCurrentStep = useCurrentSalesOrderStore((s) => s.setCurrentStep);
    const savedSteps = useCurrentSalesOrderStore((s) => s.savedSteps);
    const addSavedStep = useCurrentSalesOrderStore((s) => s.addSavedStep);
    const removeSavedStep = useCurrentSalesOrderStore((s) => s.removeSavedStep);
    const customerDemographics = useCurrentSalesOrderStore(
        (s) => s.customerDemographics,
    );
    const setCustomerDemographics = useCurrentSalesOrderStore(
        (s) => s.setCustomerDemographics,
    );
    const orderId = useCurrentSalesOrderStore((s) => s.orderId);
    const setOrderId = useCurrentSalesOrderStore((s) => s.setOrderId);
    const order = useCurrentSalesOrderStore((s) => s.order);
    const setOrder = useCurrentSalesOrderStore((s) => s.setOrder);
    const resetSalesOrder = useCurrentSalesOrderStore((s) => s.resetSalesOrder);

    // ============================================================================
    // FORMS SETUP
    // ============================================================================
    const demographicsForm = useForm<z.infer<typeof customerDemographicsSchema>>({
        resolver: zodResolver(customerDemographicsSchema) as Resolver<CustomerDemographicsSchema>,
        defaultValues: customerDemographicsDefaults,
    });

    const shelfForm = useForm<ShelfFormValues>({
        resolver: zodResolver(shelfFormSchema),
        defaultValues: { products: [] },
    });

    const OrderForm = useForm<OrderSchema>({
        resolver: zodResolver(orderSchema) as any,
        defaultValues: {
            ...orderDefaults,
            order_type: "SALES",
        },
    });

    // Watch form values
    const checkoutStatus = useWatch({
        control: OrderForm.control,
        name: "checkout_status",
    });

    const [
        delivery_charge, 
        shelf_charge, 
        home_delivery, 
        payment_type, 
        order_total, 
        paid, 
        advance
    ] = useWatch({
        control: OrderForm.control,
        name: ["delivery_charge", "shelf_charge", "home_delivery", "payment_type", "order_total", "paid", "advance"],
    });

    const products = useWatch({
        control: shelfForm.control,
        name: "products",
    });

    const isOrderClosed =
        checkoutStatus === "confirmed" || checkoutStatus === "cancelled";

    const totalShelfAmount =
        products?.reduce(
            (acc, p) => acc + (p.quantity ?? 0) * (p.unit_price ?? 0),
            0,
        ) ?? 0;

    // ============================================================================
    // NAVIGATION & UI HOOKS
    // ============================================================================
    const { dialog, openDialog, closeDialog } = useConfirmationDialog();

    const { sectionRefs, handleStepChange, handleProceed, visibleSteps } = useStepNavigation({
        steps,
        setCurrentStep,
        addSavedStep,
    });

    const fatoura = order.invoice_number;

    // ============================================================================
    // ORDER MUTATIONS
    // ============================================================================
    const {
        createOrder: createOrderMutation,
        completeSalesOrder: completeSalesOrderMutation,
    } = useOrderMutations({
        orderType: "SALES",
        onOrderCreated: (id, formattedOrder) => {
            setOrderId(id || null);
            setOrder(formattedOrder);
            
            // Immediately complete the sales order after creation
            const paymentData = OrderForm.getValues();
            const shelfItems = shelfForm.getValues().products
                .filter(p => p.id && p.quantity)
                .map(p => ({ 
                    id: Number(p.id!), 
                    quantity: p.quantity!, 
                    unitPrice: p.unit_price ?? 0 
                }));

            completeSalesOrderMutation.mutate({
                orderId: id!,
                checkoutDetails: {
                    paymentType: paymentData.payment_type!,
                    paid: paymentData.paid ?? 0,
                    paymentRefNo: paymentData.payment_ref_no ?? undefined,
                    paymentNote: paymentData.payment_note ?? undefined,
                    orderTaker: paymentData.order_taker_id ?? undefined
                },
                shelfItems
            });
        },

        onOrderUpdated: (action, data) => {
            if (action === "updated") {
                if (data) {
                    const updatedOrderSchema = mapOrderToSchema(data);
                    setOrder(updatedOrderSchema);
                    OrderForm.reset(updatedOrderSchema);
                }
                // Mark the final step as completed
                addSavedStep(2);
            }
        },
        onOrderError: () => {
            // Error handling
        },
    });

    // ============================================================================
    // CUSTOMER HANDLERS
    // ============================================================================
    const handleCustomerFound = async (customer: Customer) => {
        const formValues = mapCustomerToFormValues(customer);
        demographicsForm.reset(formValues);
        setCustomerDemographics(formValues);
        toast.success(`Customer loaded: ${customer.name}`);
    };

    // ============================================================================
    // DEMOGRAPHICS FORM HANDLERS
    // ============================================================================
    const handleDemographicsProceed = () => {
        const recordID = demographicsForm.getValues("id");
        const customerData = demographicsForm.getValues();

        if (!recordID) {
            toast.error("Please save customer information first");
            return;
        }

        // Update OrderForm with customer_id
        OrderForm.setValue("customer_id", recordID);

        // Update store with customer demographics
        setCustomerDemographics(customerData);
        
        // Proceed to next step (Shelf Products)
        handleProceed(0);
    };

    // ============================================================================
    // Shelf FORM HANDLERS
    // ============================================================================
    const handleShelfProceed = () => {
        handleProceed(1);
    };

    // ============================================================================
    // ORDER CONFIRMATION
    // ============================================================================
    const handleOrderConfirmation = (data: OrderSchema) => {
        // 1. Create the order as draft first (required by the completeSalesOrder mutation)
        createOrderMutation.mutate({
            ...data,
            order_type: "SALES",
            checkout_status: "draft",
        });
    };

    // ============================================================================
    // SIDE EFFECTS
    // ============================================================================
    // Sync shelf amount to order charges
    React.useEffect(() => {
        OrderForm.setValue("shelf_charge", totalShelfAmount);
    }, [totalShelfAmount]);

    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            resetSalesOrder();
        };
    }, [resetSalesOrder]);

    // ============================================================================
    // INVOICE DATA PREPARATION
    // ============================================================================
    const invoiceData = React.useMemo(() => {
        const demographics = demographicsForm.getValues();
        const orderData = OrderForm.getValues();
        const shelfData = shelfForm.getValues().products;

        // Find employee name
        const orderTakerEmployee = employees.find(
            (emp) => emp.id === orderData.order_taker_id,
        );

        return {
            orderId: order.id,
            orderDate: orderData.order_date,
            homeDelivery: orderData.home_delivery,
            checkoutStatus: orderData.checkout_status,
            customerName: demographics.name,
            customerPhone: demographics.phone,
            customerAddress: {
                city: demographics.city ?? undefined,
                area: demographics.area ?? undefined,
                block: demographics.block ?? undefined,
                street: demographics.street ?? undefined,
                house_no: demographics.house_no ?? undefined,
            },
            fabricSelections: [],
            shelfProducts: shelfData,
            charges: {
                fabric: 0,
                stitching: 0,
                style: 0,
                delivery: orderData.delivery_charge ?? 0,
                shelf: orderData.shelf_charge ?? 0,
            },
            discountType: orderData.discount_type ?? undefined,
            discountValue: orderData.discount_value ?? 0,
            advance: orderData.advance ?? 0,
            paid: orderData.paid ?? 0,
            paymentType: orderData.payment_type ?? undefined,
            paymentRefNo: orderData.payment_ref_no ?? undefined,
            orderTaker: orderTakerEmployee?.name,
        };
    }, [
        demographicsForm,
        OrderForm,
        order,
        shelfForm,
        employees,
    ]);

    // ============================================================================
    // NAVIGATION GUARDS
    // ============================================================================
    const [allowNavigation, setAllowNavigation] = React.useState(false);

    // Prevent browser tab closing/refresh when order is in progress
    React.useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (
                checkoutStatus === "confirmed" ||
                checkoutStatus === "cancelled" ||
                !orderId ||
                allowNavigation
            ) {
                return;
            }

            e.preventDefault();
            e.returnValue = "You have an order in progress. Are you sure you want to leave?";
            return e.returnValue;
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [checkoutStatus, orderId, allowNavigation]);

    // ============================================================================
    // RENDER
    // ============================================================================
    return (
        <>
            <ScrollProgress />
            {(createOrderMutation.isPending || completeSalesOrderMutation.isPending) && (
                <FullScreenLoader 
                    title={
                        createOrderMutation.isPending 
                            ? "Creating Order" 
                            : "Completing Sales Order"
                    }
                    subtitle="Please wait while we process your request..."
                />
            )}
            <ConfirmationDialog
                isOpen={dialog.isOpen}
                onClose={closeDialog}
                onConfirm={dialog.onConfirm}
                title={dialog.title}
                description={dialog.description}
            />

            {/* Sticky Header with Stepper */}
            <div className="sticky top-0 z-50 bg-background">
                <HorizontalStepper
                    steps={steps}
                    completedSteps={savedSteps}
                    currentStep={currentStep}
                    activeSteps={visibleSteps}
                    onStepChange={handleStepChange}
                />
            </div>

            {/* Step Content */}
            <div className="flex flex-col items-center gap-10 md:gap-16 pt-20 pb-12 mx-[5%] md:mx-[10%] 2xl:max-w-screen-2xl 2xl:mx-auto">
                <div className="w-full mt-0">
                    <ErrorBoundary fallback={<div>Search Customer crashed</div>}>
                        <SearchCustomer
                            onCustomerFound={handleCustomerFound}
                            onHandleClear={() => {
                                demographicsForm.reset(customerDemographicsDefaults);
                                setCustomerDemographics(customerDemographicsDefaults);
                            }}
                            checkPendingOrders={false} // No pending orders for sales
                        />
                    </ErrorBoundary>
                </div>

                {/* STEP 0: Demographics */}
                <div
                    id={steps[0].id}
                    ref={(el) => { sectionRefs.current[0] = el; }}
                    className="w-full flex flex-col items-center"
                >
                    <CustomerDemographicsForm
                        form={demographicsForm}
                        isOrderClosed={isOrderClosed}
                        orderId={orderId}
                        onCustomerChange={handleCustomerFound}
                        onSave={(data) => {
                            setCustomerDemographics(data);
                            addSavedStep(0);
                        }}
                        onEdit={() => removeSavedStep(0)}
                        onCancel={() => addSavedStep(0)}
                        onProceed={handleDemographicsProceed}
                        onClear={() => {
                            removeSavedStep(0);
                        }}
                    />
                </div>

                {/* STEP 1: Shelf Products */}
                <div
                    id={steps[1].id}
                    ref={(el) => { sectionRefs.current[1] = el; }}
                    className="w-full flex flex-col items-center"
                >
                    <ErrorBoundary fallback={<div>Shelf Products crashed</div>}>
                        <ShelfForm
                            form={shelfForm}
                            isOrderDisabled={isOrderClosed}
                            onProceed={handleShelfProceed}
                        />
                    </ErrorBoundary>
                </div>

                {/* STEP 2: Review & Payment */}
                <div
                    id={steps[2].id}
                    ref={(el) => { sectionRefs.current[2] = el; }}
                    className="w-full flex flex-col items-center"
                >
                    <ErrorBoundary fallback={<div>Order and Payment crashed</div>}>
                        <OrderSummaryAndPaymentForm
                            form={OrderForm}
                            isOrderClosed={isOrderClosed}
                            invoiceData={invoiceData}
                            orderId={orderId}
                            checkoutStatus={checkoutStatus}
                            fatoura={fatoura}
                            isLoadingFatoura={completeSalesOrderMutation.isPending}
                            customerAddress={{
                                city: customerDemographics?.city ?? undefined,
                                area: customerDemographics?.area ?? undefined,
                                block: customerDemographics?.block ?? undefined,
                                street: customerDemographics?.street ?? undefined,
                                house_no: customerDemographics?.house_no ?? undefined,
                                address_note: customerDemographics?.address_note ?? undefined,
                            }}
                            onConfirm={(data) => {
                                openDialog(
                                    "Confirm Sales Order",
                                    "Do you want to confirm this sales order?",
                                    () => {
                                        handleOrderConfirmation(data);
                                        closeDialog();
                                    },
                                );
                            }}
                            onCancel={() => {
                                // For sales orders, since we don't create it early, 
                                // cancel just resets the state or navigates away
                                navigate({ to: "/orders" });
                            }}
                        />
                    </ErrorBoundary>
                </div>
            </div>
        </>
    );
}
