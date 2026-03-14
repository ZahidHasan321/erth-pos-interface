"use client";

import { getEmployees } from "@/api/employees";
import {
    customerDemographicsDefaults,
    customerDemographicsSchema,
    type CustomerDemographicsSchema,
} from "@/components/forms/customer-demographics/demographics-form.schema";
import { mapCustomerToFormValues } from "@/components/forms/customer-demographics/demographics-form.mapper";
import { OrderSummaryAndPaymentForm } from "@/components/forms/order-summary-and-payment";
import { ShelfForm } from "@/components/forms/shelf";
import { shelfFormSchema, type ShelfFormValues } from "@/components/forms/shelf/shelf-form.schema";
import { ErrorBoundary } from "@/components/global/error-boundary";
import { FullScreenLoader } from "@/components/global/full-screen-loader";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ScrollProgress } from "@/components/ui/scroll-progress";
import { useConfirmationDialog } from "@/hooks/useConfirmationDialog";
import { useOrderMutations, mapOrderToSchema } from "@/hooks/useOrderMutations";
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
import { getOrderDetails } from "@/api/orders";
import { SimplifiedCustomerForm } from "@/components/forms/customer-demographics/simplified-customer-form";

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
    pendingComponent: () => (
        <FullScreenLoader
            title="Initializing Sales Order"
            subtitle="Preparing order forms..."
        />
    ),
    pendingMs: 0,
    pendingMinMs: 500,
    head: () => ({
        meta: [{ title: "New Sales Order" }],
    }),
});

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
    usePricing();

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

            const response = await getOrderDetails(orderIdToLoad, true);
            if (response.status === "success" && response.data) {
                const orderData = response.data;

                // 1. Load Customer
                if (orderData.customer) {
                    const customerFormValues = mapCustomerToFormValues(orderData.customer);
                    demographicsForm.reset(customerFormValues);
                    setCustomerDemographics(customerFormValues);
                }

                // 2. Load Shelf Items
                let mappedShelfProducts: any[] = [];
                if (orderData.shelf_items && orderData.shelf_items.length > 0) {
                    mappedShelfProducts = orderData.shelf_items.map((si: any) => ({
                        id: si.shelf_id.toString(),
                        serial_number: si.shelf?.serial_number || "",
                        product_type: si.shelf?.type || "",
                        brand: si.shelf?.brand || "",
                        quantity: si.quantity,
                        stock: si.shelf?.stock || 0,
                        unit_price: Number(si.unit_price),
                    }));
                    shelfForm.reset({ products: mappedShelfProducts });
                } else {
                    shelfForm.reset({ products: [] });
                }

                // 3. Load Order Info
                const mappedOrder = mapOrderToSchema(orderData);
                OrderForm.reset(mappedOrder);
                setOrderId(orderData.id);
                setOrder(mappedOrder);

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
    }, [setOrderId, setCustomerDemographics, setOrder, demographicsForm, shelfForm, OrderForm, resetSalesOrder]);

    // Load order from search params if provided
    React.useEffect(() => {
        if (searchOrderId && orderId !== searchOrderId && loadingOrderIdRef.current !== searchOrderId) {
            loadingOrderIdRef.current = searchOrderId;
            handleLoadOrder(searchOrderId);
        }
    }, [searchOrderId, orderId, handleLoadOrder]);

    // Watch form values
    const checkoutStatus = useWatch({
        control: OrderForm.control,
        name: "checkout_status",
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
    // UI HOOKS
    // ============================================================================
    const { dialog, openDialog, closeDialog } = useConfirmationDialog();

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
        OrderForm.setValue("customer_id", customer.id);
        toast.success(`Customer loaded: ${customer.name}`);
    };

    const handleClearCustomer = () => {
        demographicsForm.reset(customerDemographicsDefaults);
        setCustomerDemographics(customerDemographicsDefaults);
        OrderForm.setValue("customer_id", undefined as any);
    };

    // ============================================================================
    // ORDER CONFIRMATION
    // ============================================================================
    const handleOrderConfirmation = (data: OrderSchema) => {
        const customerId = OrderForm.getValues("customer_id");
        if (!customerId) {
            toast.error("Please select a customer first");
            document.getElementById("customer-section")?.scrollIntoView({ behavior: "smooth" });
            return;
        }

        const shelfItems = shelfForm.getValues().products
            .filter(p => p.id && p.quantity)
            .map(p => ({
                id: Number(p.id!),
                quantity: p.quantity!,
                unitPrice: p.unit_price ?? 0
            }));

        if (shelfItems.length === 0) {
            toast.error("Please add at least one item to the order");
            document.getElementById("items-section")?.scrollIntoView({ behavior: "smooth" });
            return;
        }

        const checkoutDetails = {
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
            shelf_charge: data.shelf_charge,
            deliveryCharge: data.delivery_charge
        };

        if (orderId) {
            completeSalesOrderMutation.mutate({
                orderId,
                checkoutDetails: {
                    ...checkoutDetails,
                    shelfCharge: data.shelf_charge
                },
                shelfItems
            });
        } else {
            createCompleteSalesOrderMutation.mutate({
                customerId,
                checkoutDetails: {
                    ...checkoutDetails,
                    shelfCharge: data.shelf_charge
                },
                shelfItems
            });
        }
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

            {/* Main Content Flow */}
            <div className="flex flex-col gap-12 pt-10 pb-20 mx-[5%] md:mx-[10%]">

                {/* Step 1: Shelf Products */}
                <section id="items-section" className="w-full">
                    <ErrorBoundary fallback={<div>Shelf Products crashed</div>}>
                        <ShelfForm
                            form={shelfForm}
                            isOrderDisabled={isOrderClosed}
                        />
                    </ErrorBoundary>
                </section>

                {/* Step 2: Customer */}
                <section id="customer-section" className="w-full">
                    <ErrorBoundary fallback={<div>Customer selection crashed</div>}>
                        <SimplifiedCustomerForm
                            form={demographicsForm}
                            onCustomerFound={handleCustomerFound}
                            onClear={handleClearCustomer}
                            isOrderClosed={isOrderClosed}
                        />
                    </ErrorBoundary>
                </section>

                {/* Step 3: Payment & Review */}
                <section id="payment-section" className="w-full">
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
                                city: demographicsForm.getValues("city") ?? undefined,
                                area: demographicsForm.getValues("area") ?? undefined,
                                block: demographicsForm.getValues("block") ?? undefined,
                                street: demographicsForm.getValues("street") ?? undefined,
                                house_no: demographicsForm.getValues("house_no") ?? undefined,
                                address_note: demographicsForm.getValues("address_note") ?? undefined,
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
                                navigate({ to: "/orders" });
                            }}
                        />
                    </ErrorBoundary>
                </section>
            </div>
        </>
    );
}
