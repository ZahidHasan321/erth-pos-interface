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
import { getOrderDetails } from "@/api/orders";

type OrderSearch = {
    orderId?: number;
};

export const Route = createFileRoute("/$main/orders/new-sales-order")({
    validateSearch: (search: Record<string, unknown>): OrderSearch => {
        return {
            orderId: search.orderId ? Number(search.orderId) : undefined,
        };
    },
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

    const { orderId: searchOrderId } = Route.useSearch();
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

    const [isLoadingOrderData, setIsLoadingOrderData] = React.useState(false);
    const loadingOrderIdRef = React.useRef<number | null>(null);

    const handleLoadOrder = React.useCallback(async (orderIdToLoad: number) => {
        setIsLoadingOrderData(true);
        try {
            // Clear store state first
            resetSalesOrder();

            const response = await getOrderDetails(orderIdToLoad);
            console.log("Order details response:", response);
            if (response.status === "success" && response.data) {
                const orderData = response.data;
                console.log("Order Data retrieved:", orderData);

                // 1. Load Customer
                if (orderData.customer) {
                    const customerFormValues = mapCustomerToFormValues(orderData.customer);
                    demographicsForm.reset(customerFormValues);
                    setCustomerDemographics(customerFormValues);
                    addSavedStep(0);
                }

                // 2. Load Shelf Items
                let mappedShelfProducts: any[] = [];
                if (orderData.shelf_items && orderData.shelf_items.length > 0) {
                    console.log("Found shelf items:", orderData.shelf_items);
                    mappedShelfProducts = orderData.shelf_items.map((si: any) => ({
                        id: si.shelf_id.toString(),
                        serial_number: si.shelf?.serial_number || "",
                        product_type: si.shelf?.type || "",
                        brand: si.shelf?.brand || "",
                        quantity: si.quantity,
                        stock: si.shelf?.stock || 0,
                        unit_price: Number(si.unit_price),
                    }));
                    console.log("Mapped shelf products for reset:", mappedShelfProducts);
                    shelfForm.reset({ products: mappedShelfProducts });
                    addSavedStep(1);
                } else {
                    console.log("No shelf items found in orderData");
                    shelfForm.reset({ products: [] });
                }

                // 3. Load Order Info
                const mappedOrder = mapOrderToSchema(orderData);
                OrderForm.reset(mappedOrder);
                setOrderId(orderData.id);
                setOrder(mappedOrder);
                addSavedStep(2);

                toast.success("Order loaded successfully");
            } else {
                toast.error("Order not found");
            }
        } catch (error) {
            console.error("Error loading order:", error);
            toast.error("Failed to load order");
        } finally {
            setIsLoadingOrderData(false);
        }
    }, [setOrderId, setCustomerDemographics, addSavedStep, setOrder, demographicsForm, shelfForm, OrderForm, resetSalesOrder]);

    // Load order from search params if provided
    React.useEffect(() => {
        if (searchOrderId && !orderId && loadingOrderIdRef.current !== searchOrderId) {
            loadingOrderIdRef.current = searchOrderId;
            handleLoadOrder(searchOrderId);
        }
    }, [searchOrderId, orderId, handleLoadOrder]);

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
        completeSalesOrder: completeSalesOrderMutation,
        createCompleteSalesOrder: createCompleteSalesOrderMutation,
    } = useOrderMutations({
        orderType: "SALES",
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
        const customerId = OrderForm.getValues("customer_id");
        if (!customerId) {
            toast.error("No customer selected");
            return;
        }

        const shelfItems = shelfForm.getValues().products
            .filter(p => p.id && p.quantity)
            .map(p => ({
                id: Number(p.id!),
                quantity: p.quantity!,
                unitPrice: p.unit_price ?? 0
            }));

        createCompleteSalesOrderMutation.mutate({
            customerId,
            checkoutDetails: {
                paymentType: data.payment_type!,
                paid: data.paid ?? 0,
                paymentRefNo: data.payment_ref_no ?? undefined,
                paymentNote: data.payment_note ?? undefined,
                orderTaker: data.order_taker_id ?? undefined,
                discountType: data.discount_type ?? undefined,
                discountValue: data.discount_value ?? undefined,
                discountPercentage: data.discount_percentage ?? undefined,
                referralCode: data.referral_code ?? undefined,
                notes: data.notes ?? undefined,
                total: data.order_total,
                shelfCharge: data.shelf_charge
            },
            shelfItems
        });
    };

    // ============================================================================
    // SIDE EFFECTS
    // ============================================================================
    // Sync shelf amount to order charges
    React.useEffect(() => {
        OrderForm.setValue("shelf_charge", totalShelfAmount, { shouldDirty: false });
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
            {(isLoadingOrderData || createCompleteSalesOrderMutation.isPending || completeSalesOrderMutation.isPending) && (
                <FullScreenLoader
                    title={
                        isLoadingOrderData
                            ? "Loading Order"
                            : createCompleteSalesOrderMutation.isPending
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
                {!isOrderClosed && (
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
                )}

                {/* STEP 0: Demographics */}
                <div
                    id={steps[0].id}
                    ref={(el) => { sectionRefs.current[0] = el; }}
                    className="w-full flex flex-col items-center"
                >
                    <CustomerDemographicsForm
                        form={demographicsForm}
                        isOrderClosed={isOrderClosed}
                        orderId={null} // Pass null to hide "Change Customer" and show "Proceed" instead
                        onCustomerChange={handleCustomerFound}
                        onSave={(data) => {
                            setCustomerDemographics(data);
                        }}
                        onEdit={() => removeSavedStep(0)}
                        onCancel={() => { }}
                        onProceed={handleDemographicsProceed}
                        onClear={() => {
                            removeSavedStep(0);
                        }}
                        proceedButtonText="Continue to Products"
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
                            orderType="SALES"
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
