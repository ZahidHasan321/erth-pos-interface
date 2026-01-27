"use client";

import {
    getMeasurementsByCustomerId,
} from "@/api/measurements";
import { getEmployees } from "@/api/employees";
import { getFabrics } from "@/api/fabrics";
import { getOrderDetails, updateOrder } from "@/api/orders";
import { CustomerDemographicsForm } from "@/components/forms/customer-demographics";
import {
    customerDemographicsDefaults,
    customerDemographicsSchema,
    type CustomerDemographicsSchema,
} from "@/components/forms/customer-demographics/demographics-form.schema";
import { mapCustomerToFormValues } from "@/components/forms/customer-demographics/demographics-form.mapper";
import { CustomerMeasurementsForm } from "@/components/forms/customer-measurements";
import {
    customerMeasurementsDefaults,
    customerMeasurementsSchema,
} from "@/components/forms/customer-measurements/measurement-form.schema";
import { FabricSelectionForm } from "@/components/forms/fabric-selection-and-options";
import {
    type GarmentSchema,
    createFabricSelectionFormSchema,
} from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";
import { mapGarmentToFormValues } from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.mapper";
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
import { calculateGarmentStylePrice } from "@/lib/utils/style-utils";
import { usePricing } from "@/hooks/usePricing";
import {
    orderDefaults,
    orderSchema,
    type OrderSchema,
} from "@/components/forms/order-summary-and-payment/order-form.schema";
import { mapOrderToFormValues } from "@/components/forms/order-summary-and-payment/order-form.mapper";
import { createWorkOrderStore } from "@/store/current-work-order";
import type { Customer, Order } from "@repo/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { SearchCustomer } from "@/components/forms/customer-demographics/search-customer";

type OrderSearch = {
    orderId?: number;
};

export const Route = createFileRoute("/$main/orders/new-work-order")({
    validateSearch: (search: Record<string, unknown>): OrderSearch => {
        return {
            orderId: search.orderId ? Number(search.orderId) : undefined,
        };
    },
    component: NewWorkOrder,
    head: () => ({
        meta: [{ title: "New Work Order" }],
    }),
});

const steps = [
    { title: "Demographics", id: "step-0" },
    { title: "Measurement", id: "step-1" },
    { title: "Fabric Selection", id: "step-2" },
    { title: "Shelf Products", id: "step-3" },
    { title: "Review & Payment", id: "step-4" },
];

const useCurrentWorkOrderStore = createWorkOrderStore("main");

function NewWorkOrder() {
    const { orderId: searchOrderId } = Route.useSearch();
    // ============================================================================
    // NAVIGATION
    // ============================================================================
    const navigate = useNavigate();
    const { prices } = usePricing();

    // ============================================================================
    // DATA FETCHING & STORE
    // ============================================================================
    const { data: fabricsResponse } = useQuery({
        queryKey: ["fabrics"],
        queryFn: getFabrics,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const { data: employeesResponse } = useQuery({
        queryKey: ["employees"],
        queryFn: getEmployees,
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const employees = employeesResponse?.data || [];

    // Store selectors
    const currentStep = useCurrentWorkOrderStore((s) => s.currentStep);
    const setCurrentStep = useCurrentWorkOrderStore((s) => s.setCurrentStep);
    const savedSteps = useCurrentWorkOrderStore((s) => s.savedSteps);
    const addSavedStep = useCurrentWorkOrderStore((s) => s.addSavedStep);
    const removeSavedStep = useCurrentWorkOrderStore((s) => s.removeSavedStep);
    const customerDemographics = useCurrentWorkOrderStore(
        (s) => s.customerDemographics,
    );
    const setCustomerDemographics = useCurrentWorkOrderStore(
        (s) => s.setCustomerDemographics,
    );
    const fabricSelections = useCurrentWorkOrderStore((s) => s.fabricSelections);
    const setFabricSelections = useCurrentWorkOrderStore(
        (s) => s.setFabricSelections,
    );
    const orderId = useCurrentWorkOrderStore((s) => s.orderId);
    const setOrderId = useCurrentWorkOrderStore((s) => s.setOrderId);
    const order = useCurrentWorkOrderStore((s) => s.order);
    const setOrder = useCurrentWorkOrderStore((s) => s.setOrder);
    const stitchingPrice = useCurrentWorkOrderStore((s) => s.stitchingPrice);
    const setStitchPrice = useCurrentWorkOrderStore((s) => s.setStitchingPrice);
    const resetWorkOrder = useCurrentWorkOrderStore((s) => s.resetWorkOrder);
    // Track loading state when fetching order data
    const [isLoadingOrderData, setIsLoadingOrderData] = React.useState(false);
    const loadingOrderIdRef = React.useRef<number | null>(null);
    // ============================================================================
    // FORMS SETUP
    // ============================================================================
    const demographicsForm = useForm<z.infer<typeof customerDemographicsSchema>>({
        resolver: zodResolver(customerDemographicsSchema) as Resolver<CustomerDemographicsSchema>,
        defaultValues: customerDemographicsDefaults,
    });

    const measurementsForm = useForm<z.infer<typeof customerMeasurementsSchema>>({
        resolver: zodResolver(customerMeasurementsSchema),
        mode: "onSubmit",
        defaultValues: {
            ...customerMeasurementsDefaults,
            measurement_date: new Date().toISOString(), // Set to today for new measurements
        },
    });

    const fabricSelectionResolver = React.useMemo(() => {
        return zodResolver(createFabricSelectionFormSchema(fabricsResponse?.data || []));
    }, [fabricsResponse?.data]);

    const fabricSelectionForm = useForm<{
        garments: GarmentSchema[];
        signature: string;
    }>({
        resolver: fabricSelectionResolver as any,
        defaultValues: { garments: [], signature: "" },
    });

    const shelfForm = useForm<ShelfFormValues>({
        resolver: zodResolver(shelfFormSchema),
        defaultValues: { products: [] },
    });

    const OrderForm = useForm<OrderSchema>({
        resolver: zodResolver(orderSchema) as any,
        defaultValues: {
            ...orderDefaults,
            stitching_price: stitchingPrice,
        },
    });

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
        updateOrder: updateOrderMutation,
        completeWorkOrder: completeWorkOrderMutation,
        // deleteOrder: deleteOrderMutation,
    } = useOrderMutations({
        orderType: "WORK",
        onOrderCreated: (id, formattedOrder) => {
            setOrderId(id || null);
            setOrder(formattedOrder);
            // demographicsForm.reset(); // Don't reset demographics as we just filled it
            measurementsForm.reset();
            fabricSelectionForm.reset();
            shelfForm.reset();
            OrderForm.reset();

            // Move to next step (Measurements)
            handleProceed(0);
        },

        onOrderUpdated: (action, data) => {
            if (action === "customer") {
                handleProceed(0);
            } else if (action === "updated") {
                if (data) {
                    const updatedOrderSchema = mapOrderToSchema(data);
                    setOrder(updatedOrderSchema);
                    OrderForm.reset(updatedOrderSchema);
                }
                // Mark the final step as completed
                addSavedStep(4);
            }
        },
        onOrderError: () => {
            resetWorkOrder();
        },
    });

    // ============================================================================
    // PENDING ORDER LOADING
    // ============================================================================
    const handleCustomerFound = async (customer: Customer) => {
        const formValues = mapCustomerToFormValues(customer);
        demographicsForm.reset(formValues);
        setCustomerDemographics(formValues);

        if (orderId) {
            try {
                const response = await updateOrder({ customer_id: customer.id }, orderId);
                if (response.status === "success") {
                    toast.success("Order customer updated successfully");
                    handleProceed(0); // Auto-proceed to next step if order is active
                } else {
                    toast.error("Failed to update order customer: " + response.message);
                }
            } catch (error) {
                console.error("Error updating order customer:", error);
                toast.error("An error occurred while updating order customer");
            }
        } else {
            toast.success(`Customer loaded: ${customer.name}`);
            setCurrentStep(0);
        }
    };

    const handlePendingOrderSelected = async (order: Order) => {
        // Set loading state
        setIsLoadingOrderData(true);
        try {
            if (!order.id) {
                toast.error("Invalid order ID");
                setIsLoadingOrderData(false);
                return;
            }

            // Clear store state first
            resetWorkOrder();

            const response = await getOrderDetails(order.id, true);
            console.log("Work order details response:", response);

            if (response.status === "success" && response.data) {
                const orderData = response.data;
                const isConfirmed = orderData.checkout_status === "confirmed";

                console.log("Work Order Data retrieved:", orderData);

                // 1. Load Customer
                if (orderData.customer) {
                    const customerFormValues = mapCustomerToFormValues(orderData.customer);
                    demographicsForm.reset(customerFormValues);
                    setCustomerDemographics(customerFormValues);
                    addSavedStep(0);

                    // Check if customer has measurements to mark step 1 as complete
                    const measurementsRes = await getMeasurementsByCustomerId(Number(orderData.customer.id));
                    if (measurementsRes.status === "success" && measurementsRes.data && measurementsRes.data.length > 0) {
                        addSavedStep(1);
                    }
                } else {
                    demographicsForm.reset(customerDemographicsDefaults);
                }

                // 2. Load Garments
                if (orderData.garments && orderData.garments.length > 0) {
                    const mappedGarments: GarmentSchema[] = orderData.garments.map((g: any) => mapGarmentToFormValues(g));
                    fabricSelectionForm.setValue("garments", mappedGarments);
                    setFabricSelections(mappedGarments);

                    // Mark as complete if confirmed, or if it's a reload of a draft that had garments saved
                    addSavedStep(2);
                } else {
                    fabricSelectionForm.reset({ garments: [], signature: "" });
                }

                // 3. Load Shelf Items
                if (orderData.shelf_items && orderData.shelf_items.length > 0) {
                    const mappedShelfProducts = orderData.shelf_items.map((si: any) => ({
                        id: si.shelf_id.toString(),
                        serial_number: si.shelf?.serial_number || "",
                        product_type: si.shelf?.type || "",
                        brand: si.shelf?.brand || "",
                        quantity: si.quantity,
                        stock: si.shelf?.stock || 0,
                        unit_price: Number(si.unit_price),
                    }));
                    shelfForm.reset({ products: mappedShelfProducts });

                    // Only mark Shelf step as saved if the order is already confirmed
                    if (isConfirmed) {
                        addSavedStep(3);
                    }
                } else {
                    shelfForm.reset({ products: [] });
                }

                // 4. Load Order Info
                if (orderData) {
                    const mappedOrder = mapOrderToFormValues(orderData);

                    // Sync the stitching price to the store so the UI reflects it
                    const dbStitchingPrice = mappedOrder.stitching_price ?? 9;
                    setStitchPrice(dbStitchingPrice);

                    OrderForm.reset(mappedOrder);
                    setOrder(mappedOrder);
                    setOrderId(orderData.id);

                    // If order is confirmed, ensure every step is marked as complete
                    if (isConfirmed) {
                        addSavedStep(0);
                        addSavedStep(1);
                        addSavedStep(2);
                        addSavedStep(3);
                        addSavedStep(4);
                    }
                } else {
                    OrderForm.reset(orderDefaults);
                }

                // Navigate to review step if confirmed, otherwise to measurements
                setCurrentStep(isConfirmed ? 4 : 1);

                toast.success(`Order loaded successfully`);
            } else {
                toast.error("Failed to load order details");
            }
        } catch (error) {
            console.error("Error loading pending order:", error);
            toast.error("Failed to load order. Please try again.");
        } finally {
            setIsLoadingOrderData(false);
        }
    };

    const loadCustomerFresh = (customer: Customer) => {
        resetWorkOrder();
        resetLocalState();
        const formValues = mapCustomerToFormValues(customer);
        demographicsForm.reset(formValues);
        setCustomerDemographics(formValues);
        toast.success(`Customer loaded: ${customer.name}`);
        setCurrentStep(0);
    };

    const handleTopLevelCustomerFound = (customer: Customer) => {
        if (orderId) {
            openDialog(
                "Start New Order?",
                `You have an order in progress. Discard it and start a new order for ${customer.name}?`,
                () => {
                    loadCustomerFresh(customer);
                    closeDialog();
                }
            );
        } else {
            loadCustomerFresh(customer);
        }
    };

    const handleTopLevelPendingOrderSelected = (order: Order) => {
        if (orderId) {
            openDialog(
                "Switch Order?",
                "You have an order in progress. Discard it and load the selected pending order?",
                () => {
                    handlePendingOrderSelected(order);
                    closeDialog();
                }
            );
        } else {
            handlePendingOrderSelected(order);
        }
    };

    // Load order from search params if provided
    React.useEffect(() => {
        if (searchOrderId && orderId !== searchOrderId && loadingOrderIdRef.current !== searchOrderId) {
            loadingOrderIdRef.current = searchOrderId;
            handlePendingOrderSelected({ id: searchOrderId } as Order);
        }
    }, [searchOrderId, orderId, handlePendingOrderSelected]);

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

        // Update order in backend 
        if (orderId) {
            updateOrderMutation.mutate({
                fields: { customer_id: recordID },
                orderId: orderId,
                onSuccessAction: "customer",
            });
        } else {
            createOrderMutation.mutate({ customer_id: recordID });
        }
    };

    // ============================================================================
    // MEASUREMENTS FORM HANDLERS
    // ============================================================================
    const handleMeasurementsProceed = () => {
        handleProceed(1);
    };

    // ============================================================================
    // FABRIC SELECTION HANDLERS
    // ============================================================================
    /**
     * Calculate stitching price from garments data
     */
    const calculateStitchingPrice = (
        garments: GarmentSchema[],
        stitchingPrice: number = 9.0,
    ) => {
        return garments.reduce((acc, g) => {
            const price = g.style === "design" ? 9 : stitchingPrice;
            return acc + price;
        }, 0);
    };

    /**
     * Calculate style price from garments data
     */
    const calculateStylesPrices = (garments: GarmentSchema[]) => {
        let totalStyle = 0;

        garments.forEach((garment) => {
            totalStyle += calculateGarmentStylePrice(garment, (prices || []) as any);
        });

        return totalStyle;
    };

    const calculateFabricPrice = (garments: GarmentSchema[]) => {
        let fabricPrice = 0;
        garments.forEach((garment) => {
            if (garment.fabric_id) {
                const fabric = fabricsResponse?.data?.find(f => f.id === garment.fabric_id);
                if (fabric) {
                    fabricPrice += (fabric.price_per_meter || 0) * (garment.fabric_length ?? 0);
                }
            }
        });
        return fabricPrice;
    };

    const handleFabricSelectionSubmit = (data: {
        garments: GarmentSchema[];
        signature: string;
    }) => {
        setFabricSelections(data.garments);
        addSavedStep(2);

        // Update number of fabrics
        const numFabrics = data.garments.length;
        OrderForm.setValue("num_of_fabrics", numFabrics);
        setOrder({ ...order, num_of_fabrics: numFabrics });

        // Calculate prices
        const stitchingPrices = calculateStitchingPrice(
            data.garments,
            stitchingPrice,
        );
        const stylePrice = calculateStylesPrices(data.garments);
        const fabricPrice = calculateFabricPrice(data.garments);

        // Update order form with calculated prices
        OrderForm.setValue("fabric_charge", fabricPrice);
        OrderForm.setValue("stitching_charge", stitchingPrices);
        OrderForm.setValue("style_charge", stylePrice);
        OrderForm.setValue("stitching_price", stitchingPrice);
    };

    // ============================================================================
    // Shelf FORM HANDLERS
    // ============================================================================
    const handleShelfProceed = () => {
        handleProceed(3);
    };

    // ============================================================================
    // ORDER & PAYMENT HANDLERS
    // ============================================================================
    // const handleOrderFormSubmit = (data: Partial<OrderSchema>) => {
    //     // Preserve id and order_type when updating order
    //     setOrder({ ...data, id: order.id, order_type: "WORK" });
    //     // Mark step 4 (Order & Payment) as saved when form is submitted
    //     addSavedStep(4);
    // };

    // const handleOrderFormProceed = () => {
    //     handleProceed(4);
    // };

    // ============================================================================
    // ORDER CONFIRMATION & CANCELLATION
    // ============================================================================
    const handleOrderConfirmation = (data: OrderSchema) => {
        if (!orderId) {
            toast.error("Order ID is missing");
            return;
        }

        // Prepare items for deduction
        const shelfItems = shelfForm.getValues().products
            .filter(p => p.id && p.quantity)
            // Fix: Convert p.id to Number and include unitPrice for RPC
            .map(p => ({
                id: Number(p.id!),
                quantity: p.quantity!,
                unitPrice: p.unit_price ?? 0
            }));

        const fabricItems = fabricSelectionForm.getValues().garments
            .filter(g => g.fabric_id && g.fabric_length && g.fabric_source === 'IN')
            .map(g => ({ id: g.fabric_id!, length: g.fabric_length ?? 0 }));

        completeWorkOrderMutation.mutate({
            orderId,
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
                orderTotal: data.order_total ?? 0,
                advance: data.advance ?? undefined,
                fabricCharge: data.fabric_charge ?? 0,
                stitchingCharge: data.stitching_charge ?? 0,
                styleCharge: data.style_charge ?? 0,
                deliveryCharge: data.delivery_charge ?? 0,
                shelfCharge: data.shelf_charge ?? 0,
                homeDelivery: data.home_delivery,
                deliveryDate: order.delivery_date ?? undefined,
            },
            shelfItems,
            fabricItems
        });
    };

    const handleOrderCancellation = () => {
        if (!orderId) return;

        updateOrderMutation.mutate({
            fields: { checkout_status: "cancelled" },
            orderId: orderId,
            onSuccessAction: "cancelled",
        });
    };

    // ============================================================================
    // SIDE EFFECTS
    // ============================================================================
    // Sync shelf amount to order charges (flattened)
    React.useEffect(() => {
        OrderForm.setValue("shelf_charge", totalShelfAmount, { shouldDirty: false });
    }, [totalShelfAmount]);

    // Reset measurements when customer changes
    React.useEffect(() => {
        measurementsForm.reset({
            ...customerMeasurementsDefaults,
            measurement_date: new Date().toISOString(),
        });
    }, [customerDemographics.id]);


    // Cleanup on unmount
    React.useEffect(() => {
        return () => {
            demographicsForm.reset();
            resetWorkOrder();
        };
    }, []);

    // ============================================================================
    // NAVIGATION GUARDS
    // ============================================================================
    const [allowNavigation, setAllowNavigation] = React.useState(false);
    const [pendingNavigationPath, setPendingNavigationPath] = React.useState<
        string | null
    >(null);

    const resetLocalState = () => {
        demographicsForm.reset(customerDemographicsDefaults);
        measurementsForm.reset({
            ...customerMeasurementsDefaults,
            measurement_date: new Date().toISOString(),
        });
        fabricSelectionForm.reset({
            garments: [],
            signature: "",
        });
        shelfForm.reset({ products: [] });
        OrderForm.reset(orderDefaults);
        setIsLoadingOrderData(false);
    };

    // Clear pending navigation when dialog closes without confirming
    React.useEffect(() => {
        if (!dialog.isOpen && pendingNavigationPath) {
            setPendingNavigationPath(null);
        }
    }, [dialog.isOpen, pendingNavigationPath]);

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
            e.returnValue =
                "You have an order in progress. Are you sure you want to leave?";
            return e.returnValue;
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [checkoutStatus, orderId, allowNavigation]);

    // Prevent in-app navigation using link interception
    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (
                checkoutStatus === "confirmed" ||
                checkoutStatus === "cancelled" ||
                !orderId ||
                allowNavigation
            ) {
                return;
            }

            const target = e.target as HTMLElement;
            const link = target.closest("a[href]");

            if (link && link instanceof HTMLAnchorElement) {
                const href = link.getAttribute("href");

                if (href && href.startsWith("/")) {
                    e.preventDefault();
                    e.stopPropagation();

                    setPendingNavigationPath(href);
                    openDialog(
                        "Leave Page?",
                        "You have an order in progress. Leaving this page will not save your changes. Are you sure you want to leave?",
                        () => {
                            setAllowNavigation(true);
                            resetWorkOrder();
                            resetLocalState();
                            navigate({ to: href });
                            setPendingNavigationPath(null);
                            closeDialog();
                        },
                    );
                }
            }
        };

        document.addEventListener("click", handleClick, true);

        return () => {
            document.removeEventListener("click", handleClick, true);
        };
    }, [checkoutStatus, orderId, allowNavigation]);

    // ============================================================================
    // INVOICE DATA PREPARATION
    // ============================================================================
    const invoiceData = React.useMemo(() => {
        const demographics = demographicsForm.getValues();
        const orderData = OrderForm.getValues();
        const garmentsData = fabricSelectionForm.getValues().garments;
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
            fabricSelections: garmentsData,
            shelfProducts: shelfData,
            fabrics: fabricsResponse?.data || [],
            charges: {
                fabric: orderData.fabric_charge ?? 0,
                stitching: orderData.stitching_charge ?? 0,
                style: orderData.style_charge ?? 0,
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
        fabricSelectionForm,
        order,
        shelfForm,
        order.id,
        employees,
        fabricsResponse,
    ]);


    // ============================================================================
    // RENDER
    // ============================================================================
    return (
        <>
            <ScrollProgress />
            {(isLoadingOrderData || createOrderMutation.isPending || completeWorkOrderMutation.isPending) && (
                <FullScreenLoader
                    title={
                        createOrderMutation.isPending
                            ? "Creating Order"
                            : completeWorkOrderMutation.isPending
                                ? "Completing Order"
                                : "Loading Order"
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
                <OrderInfoCard
                    orderID={order.id}
                    fatoura={fatoura}
                    checkoutStatus={order.checkout_status ?? "draft"}
                    customerName={
                        customerDemographics.nick_name ||
                        customerDemographics.name ||
                        undefined
                    }
                    orderType="Work Order"
                    homeDelivery={order.home_delivery}
                    deliveryDate={order.delivery_date}
                    paymentType={order.payment_type ?? undefined}   // <--- Fix: Convert null to undefined
                    numOfFabrics={order.num_of_fabrics ?? 0}        // <--- Fix: Convert null to 0
                    totalAmount={
                        (order.fabric_charge || 0) +
                        (order.stitching_charge || 0) +
                        (order.style_charge || 0) +
                        (order.delivery_charge || 0) +
                        (order.shelf_charge || 0)
                    }
                    advance={order.advance ?? undefined}
                    balance={(order.order_total ?? 0) - (order.paid ?? 0)}
                />
            </div>

            {/* Step Content */}
            <div className="flex flex-col items-center gap-10 md:gap-16 pt-20 pb-12 mx-[5%] md:mx-[10%] 2xl:grid 2xl:grid-cols-2 2xl:items-start 2xl:gap-x-10 2xl:gap-y-12 2xl:max-w-screen-2xl 2xl:mx-auto">
                {!isOrderClosed && (
                    <div className="w-full mt-0 2xl:col-span-2">
                        <ErrorBoundary fallback={<div>Search Customer crashed</div>}>
                            <SearchCustomer
                                onCustomerFound={handleTopLevelCustomerFound}
                                onHandleClear={() => {
                                    if (orderId) {
                                        openDialog(
                                            "Clear Search?",
                                            "This will clear the current customer search and reset the demographics form. Continue?",
                                            () => {
                                                demographicsForm.reset(customerDemographicsDefaults);
                                                setCustomerDemographics(customerDemographicsDefaults);
                                                closeDialog();
                                            }
                                        );
                                    } else {
                                        demographicsForm.reset(customerDemographicsDefaults);
                                        setCustomerDemographics(customerDemographicsDefaults);
                                    }
                                }}
                                checkPendingOrders={true}
                                onPendingOrderSelected={handleTopLevelPendingOrderSelected}
                            />
                        </ErrorBoundary>
                    </div>
                )}

                {/* STEP 0: Demographics */}
                <div
                    id={steps[0].id}
                    ref={(el) => {
                        sectionRefs.current[0] = el;
                    }}
                    className="w-full flex flex-col items-center space-y-6"
                >
                    <CustomerDemographicsForm
                        form={demographicsForm}
                        isOrderClosed={isOrderClosed}
                        orderId={orderId}
                        onCustomerChange={handleCustomerFound}
                        onSave={(data) => {
                            setCustomerDemographics(data);
                            // Only add saved step if we already have an order
                            if (orderId) addSavedStep(0);
                        }}
                        onEdit={() => removeSavedStep(0)}
                        onCancel={() => {
                            if (orderId) addSavedStep(0);
                        }}
                        onProceed={handleDemographicsProceed}
                        onClear={() => {
                            removeSavedStep(0);
                        }}
                    />
                </div>

                {/* STEP 1: Measurements */}
                <div
                    id={steps[1].id}
                    ref={(el) => {
                        sectionRefs.current[1] = el;
                    }}
                    className="w-full flex flex-col items-center"
                >
                    <ErrorBoundary fallback={<div>Customer Measurements crashed</div>}>
                        <CustomerMeasurementsForm
                            form={measurementsForm}
                            isOrderClosed={isOrderClosed}
                            customerId={customerDemographics.id || null}
                            onProceed={handleMeasurementsProceed}
                        />
                    </ErrorBoundary>
                </div>

                {/* STEP 2: Fabric Selection */}
                <div
                    id={steps[2].id}
                    ref={(el) => {
                        sectionRefs.current[2] = el;
                    }}
                    className="w-full flex flex-col items-center 2xl:col-span-2"
                >
                    <ErrorBoundary fallback={<div>Fabric Selection crashed</div>}>
                        <FabricSelectionForm
                            customerId={customerDemographics.id || null}
                            customerName={
                                customerDemographics.nick_name ?? customerDemographics.name ?? undefined
                            }
                            customerMobile={customerDemographics.phone ?? undefined}
                            form={fabricSelectionForm}
                            isOrderClosed={isOrderClosed}
                            onSubmit={handleFabricSelectionSubmit}
                            onProceed={() => handleProceed(2)}
                            orderId={orderId}
                            onCampaignsChange={(campaigns) => {
                                if (orderId) {
                                    OrderForm.setValue("campaign_id", parseInt(campaigns[0]));
                                }
                            }}
                            isProceedDisabled={fabricSelections.length === 0}
                            checkoutStatus={checkoutStatus}
                            deliveryDate={order.delivery_date ?? undefined}
                            setDeliveryDate={(date: string) =>
                                setOrder({ delivery_date: date })
                            }
                            fatoura={fatoura}
                            orderDate={order.order_date ?? undefined}
                            stitchingPrice={stitchingPrice}
                            setStitchingPrice={setStitchPrice}
                            initialCampaigns={order.campaign_id ? [order.campaign_id.toString()] : []}
                        />
                    </ErrorBoundary>
                </div>

                {/* STEP 3: Shelf Products */}
                <div
                    id={steps[3].id}
                    ref={(el) => {
                        sectionRefs.current[3] = el;
                    }}
                    className="w-full flex flex-col items-center 2xl:col-span-2"
                >
                    <ErrorBoundary fallback={<div>Shelf Products crashed</div>}>
                        <ShelfForm
                            form={shelfForm}
                            isOrderDisabled={isOrderClosed}
                            onProceed={handleShelfProceed}
                        />
                    </ErrorBoundary>
                </div>

                {/* STEP 4: Review & Payment */}
                <div
                    id={steps[4].id}
                    ref={(el) => {
                        sectionRefs.current[4] = el;
                    }}
                    className="w-full flex flex-col items-center 2xl:col-span-2"
                >
                    <ErrorBoundary fallback={<div>Order and Payment crashed</div>}>
                        <OrderSummaryAndPaymentForm
                            form={OrderForm}
                            isOrderClosed={isOrderClosed}
                            invoiceData={invoiceData}
                            orderId={orderId}
                            checkoutStatus={checkoutStatus}
                            fatoura={fatoura}
                            isLoadingFatoura={completeWorkOrderMutation.isPending}
                            customerAddress={{
                                city: customerDemographics?.city ?? undefined,
                                area: customerDemographics?.area ?? undefined,
                                block: customerDemographics?.block ?? undefined,
                                street: customerDemographics?.street ?? undefined,
                                house_no: customerDemographics?.house_no ?? undefined,
                                address_note: customerDemographics?.address_note ?? undefined,
                            }}
                            fabricSelections={fabricSelections}
                            deliveryDate={order.delivery_date}
                            orderType="WORK"
                            onConfirm={(data) => {
                                const isZeroPayment = data.paid === 0 || data.paid === undefined || data.paid === null;
                                openDialog(
                                    isZeroPayment ? "Confirm with Zero Payment?" : "Confirm new work order",
                                    isZeroPayment
                                        ? "You are about to confirm this order without any payment. Are you sure you want to proceed?"
                                        : "Do you want to confirm a new work order?",
                                    () => {
                                        handleOrderConfirmation(data);
                                        closeDialog();
                                    },
                                );
                            }}
                            onCancel={() => {
                                openDialog(
                                    "Cancel new work order",
                                    "Do you want to cancel a new work order?",
                                    () => {
                                        handleOrderCancellation();
                                        closeDialog();
                                    },
                                );
                            }}
                        />
                    </ErrorBoundary>
                </div>
            </div>
        </>
    );
}
