"use client";

import { getEmployees } from "@/api/employees";
import { getFabrics } from "@/api/fabrics";
import { getPrices } from "@/api/prices";
import { getStyles } from "@/api/styles";
import { getOrderDetails } from "@/api/orders";
import { getMeasurementById, getMeasurementsByCustomerId } from "@/api/measurements";
import { LazySection } from "@/components/global/lazy-section";
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
import {
    orderDefaults,
    orderSchema,
    type OrderSchema,
} from "@/components/forms/order-summary-and-payment/order-form.schema";
import { mapOrderToFormValues } from "@/components/forms/order-summary-and-payment/order-form.mapper";
import { ErrorBoundary } from "@/components/global/error-boundary";
import { FullScreenLoader } from "@/components/global/full-screen-loader";
import { FabricLabel } from "@/components/forms/fabric-selection-and-options/fabric-selection/fabric-print-component";
import { mapToCard2Data, printCard2 } from "@/components/invoice/card2";

import { HorizontalStepper } from "@repo/ui/horizontal-stepper";
import { ScrollProgress } from "@repo/ui/scroll-progress";
import { useStepNavigation } from "@/hooks/useStepNavigation";
import { usePricing } from "@/hooks/usePricing";
import { brandUsesCashier } from "@/lib/constants";
import type { Garment, OrderShelfItem, Shelf } from "@repo/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useReactToPrint } from "react-to-print";
import { toast } from "sonner";
import type { z } from "zod";

type ViewOrderSearch = {
    orderId?: number;
};

export const Route = createFileRoute("/$main/orders/view-work-order")({
    validateSearch: (search: Record<string, unknown>): ViewOrderSearch => ({
        orderId: search.orderId ? Number(search.orderId) : undefined,
    }),
    loader: async ({ context }) => {
        // Same lookup-data prefetch as the editor route — the form components
        // read fabrics/employees/prices/styles from cache.
        const { queryClient } = context;
        await Promise.all([
            queryClient.ensureQueryData({ queryKey: ["fabrics"], queryFn: () => getFabrics(), staleTime: Infinity }),
            queryClient.ensureQueryData({ queryKey: ["employees"], queryFn: getEmployees, staleTime: Infinity }),
            queryClient.ensureQueryData({ queryKey: ["prices"], queryFn: getPrices, staleTime: Infinity }),
            queryClient.ensureQueryData({ queryKey: ["styles"], queryFn: getStyles, staleTime: Infinity }),
        ]);
    },
    component: ViewWorkOrder,
    head: () => ({
        meta: [{ title: "View Work Order" }],
    }),
});

const steps = [
    { title: "Demographics", id: "view-step-0" },
    { title: "Measurement", id: "view-step-1" },
    { title: "Fabric Selection", id: "view-step-2" },
    { title: "Shelf Products", id: "view-step-3" },
    { title: "Review", id: "view-step-4" },
];

const ALL_STEPS = [0, 1, 2, 3, 4];

/**
 * Read-only view of a closed (confirmed/cancelled) work order. Reuses the same
 * form components as the editor in their disabled state, but carries none of the
 * editor's create-flow machinery (store, drafts, stock validation, navigation
 * guards, mutations) — so an old order opens as a clean, warning-free view.
 */
function ViewWorkOrder() {
    const { orderId } = Route.useSearch();
    const { main } = useParams({ strict: false });
    const navigate = useNavigate();
    const cashierHandlesPayment = brandUsesCashier(main);
    const { stitchingAdult, stitchingChild } = usePricing();

    const { data: fabricsResponse } = useQuery({
        queryKey: ["fabrics"],
        queryFn: () => getFabrics(),
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const { data: employeesResponse } = useQuery({
        queryKey: ["employees"],
        queryFn: getEmployees,
        staleTime: Infinity,
        gcTime: Infinity,
    });
    const employees = React.useMemo(() => employeesResponse?.data || [], [employeesResponse]);

    // ── Order fetch ──────────────────────────────────────────────────────────
    const {
        data: orderResponse,
        isLoading: isLoadingOrder,
        isError,
    } = useQuery({
        queryKey: ["order-details", orderId],
        queryFn: () => getOrderDetails(orderId as number, true),
        enabled: !!orderId,
        staleTime: 1000 * 60,
    });

    // ── Forms (read-only; resolvers attached for type parity, never submitted) ─
    const demographicsForm = useForm<z.infer<typeof customerDemographicsSchema>>({
        resolver: zodResolver(customerDemographicsSchema) as Resolver<CustomerDemographicsSchema>,
        defaultValues: customerDemographicsDefaults,
    });
    const measurementsForm = useForm<z.infer<typeof customerMeasurementsSchema>>({
        resolver: zodResolver(customerMeasurementsSchema),
        defaultValues: customerMeasurementsDefaults,
    });
    const fabricSelectionForm = useForm<{ garments: GarmentSchema[]; signature: string }>({
        resolver: zodResolver(
            createFabricSelectionFormSchema(fabricsResponse || [], new Map()),
        ) as Resolver<{ garments: GarmentSchema[]; signature: string }>,
        defaultValues: { garments: [], signature: "" },
    });
    const shelfForm = useForm<ShelfFormValues>({
        resolver: zodResolver(shelfFormSchema),
        defaultValues: { products: [] },
    });
    const OrderForm = useForm<OrderSchema>({
        resolver: zodResolver(orderSchema) as Resolver<OrderSchema>,
        defaultValues: orderDefaults,
    });

    // Reactive snapshots that drive the invoice/print memos below.
    const [customerDemographics, setCustomerDemographics] =
        React.useState<Partial<CustomerDemographicsSchema>>(customerDemographicsDefaults);
    const [order, setOrder] = React.useState<OrderSchema>(orderDefaults as OrderSchema);
    const [fabricSelections, setFabricSelections] = React.useState<GarmentSchema[]>([]);
    const [stitchingPrice, setStitchingPrice] = React.useState<number>(stitchingAdult);

    const populatedRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        if (!orderResponse) return;
        if (orderResponse.status !== "success" || !orderResponse.data) {
            toast.error("Could not load order details");
            return;
        }
        const orderData = orderResponse.data;
        if (populatedRef.current === orderData.id) return;
        populatedRef.current = orderData.id ?? null;

        // 1. Customer
        if (orderData.customer) {
            const customerFormValues = mapCustomerToFormValues(orderData.customer);
            demographicsForm.reset(customerFormValues);
            setCustomerDemographics(customerFormValues);
        }

        // 2. Garments
        if (orderData.garments && orderData.garments.length > 0) {
            const mappedGarments = orderData.garments.map((g: Garment) => mapGarmentToFormValues(g));
            fabricSelectionForm.setValue("garments", mappedGarments);
            setFabricSelections(mappedGarments);
        }

        // Customer signature (order-level) — rehydrate for the read-only display.
        fabricSelectionForm.setValue("signature", orderData.customer_signature_url ?? "");

        // 3. Shelf items
        if (orderData.shelf_items && orderData.shelf_items.length > 0) {
            const mappedShelfProducts = orderData.shelf_items.map(
                (si: OrderShelfItem & { shelf?: Shelf | null }) => ({
                    id: si.shelf_id.toString(),
                    serial_number: si.shelf?.sku || "",
                    product_type: si.shelf?.type || "",
                    brand: si.shelf?.brand || "",
                    quantity: si.quantity ?? 0,
                    stock: si.shelf?.shop_stock || 0,
                    unit_price: Number(si.unit_price),
                }),
            );
            shelfForm.reset({ products: mappedShelfProducts });
        }

        // 4. Order info
        const mappedOrder = mapOrderToFormValues(orderData);
        setStitchingPrice(mappedOrder.stitching_price ?? stitchingAdult);
        OrderForm.reset(mappedOrder);
        setOrder(mappedOrder);
    }, [orderResponse, demographicsForm, fabricSelectionForm, shelfForm, OrderForm, stitchingAdult]);

    const checkoutStatus = order.checkout_status;
    const fatoura = order.invoice_number;

    // ── Stepper (scroll-nav only; every step is "complete" in a view) ─────────
    const [currentStep, setCurrentStep] = React.useState(0);
    const noopSavedStep = React.useCallback(() => {}, []);
    const { setSectionRef, handleStepChange, visibleSteps } = useStepNavigation({
        steps,
        setCurrentStep,
        addSavedStep: noopSavedStep,
    });

    // ── Print: fabric labels ─────────────────────────────────────────────────
    const printLabelsRef = React.useRef<HTMLDivElement>(null);
    const handlePrintLabels = useReactToPrint({
        contentRef: printLabelsRef,
        documentTitle: `Labels-Order-${orderId || "order"}`,
        pageStyle: `
      @page { size: 5in 4in; margin: 16px 0 0 0; }
      @media print {
        html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page-break { page-break-after: always; break-after: page; }
      }
    `,
    });

    // ── Print: card2 invoice ─────────────────────────────────────────────────
    const card2MeasurementId = React.useMemo(() => {
        const found = fabricSelections.find((g) => g.measurement_id);
        return found?.measurement_id ?? null;
    }, [fabricSelections]);

    const { data: card2MeasurementResponse } = useQuery({
        queryKey: ["measurement", card2MeasurementId],
        queryFn: () => getMeasurementById(card2MeasurementId as string),
        enabled: !!card2MeasurementId,
        staleTime: Infinity,
    });

    const { data: card2MeasurementsListResponse } = useQuery({
        queryKey: ["measurements", customerDemographics.id],
        queryFn: () => getMeasurementsByCustomerId(Number(customerDemographics.id)),
        enabled: !!customerDemographics.id,
        staleTime: Infinity,
    });

    const card2MeasurementDisplayById = React.useMemo(() => {
        const list = card2MeasurementsListResponse?.data ?? [];
        const map: Record<string, string> = {};
        for (const m of list) {
            if (m.id && m.measurement_id) map[m.id] = m.measurement_id;
        }
        return map;
    }, [card2MeasurementsListResponse]);

    const card2Data = React.useMemo(() => {
        const orderData = OrderForm.getValues();
        const orderTaker = employees.find((e) => e.id === orderData.order_taker_id);
        return mapToCard2Data({
            invoiceNumber: fatoura ?? orderId,
            customer: { name: customerDemographics.name, phone: customerDemographics.phone },
            orderDate: orderData.order_date ?? null,
            deliveryDate: order.delivery_date ?? null,
            garments: fabricSelections,
            fabrics: fabricsResponse ?? [],
            measurement: card2MeasurementResponse?.data ?? null,
            measurementDisplayById: card2MeasurementDisplayById,
            charges: {
                fabric: orderData.fabric_charge ?? 0,
                stitching: orderData.stitching_charge ?? 0,
                style: orderData.style_charge ?? 0,
                delivery: orderData.delivery_charge ?? 0,
                shelf: orderData.shelf_charge ?? 0,
            },
            orderTotal: orderData.order_total ?? 0,
            paid: orderData.paid ?? 0,
            // Use the actual recorded methods. orders.payment_type is forced to
            // "cash" for ERTH at confirmation (the real method is recorded later
            // at the cashier), so it must not be used as the source here.
            paymentMethods: (orderResponse?.data?.payment_transactions ?? [])
                .filter((t) => t.transaction_type === "payment")
                .map((t) => t.payment_type),
            specialRequest: null,
            orderTakerName: orderTaker?.name ?? null,
            customerSignature: orderResponse?.data?.customer_signature_url ?? null,
        });
    }, [
        OrderForm,
        fatoura,
        orderId,
        customerDemographics,
        order.delivery_date,
        fabricSelections,
        fabricsResponse,
        card2MeasurementResponse,
        card2MeasurementDisplayById,
        employees,
        orderResponse,
    ]);

    const handlePrintCard2 = React.useCallback(() => {
        void printCard2({ data: card2Data }, { documentTitle: `Card2-Order-${orderId || "order"}` });
    }, [card2Data, orderId]);

    // ── Invoice data for the summary section ─────────────────────────────────
    const invoiceData = React.useMemo(() => {
        const orderData = OrderForm.getValues();
        const orderTakerEmployee = employees.find((emp) => emp.id === orderData.order_taker_id);
        return {
            orderId: order.id,
            orderDate: orderData.order_date,
            homeDelivery: orderData.home_delivery,
            checkoutStatus: orderData.checkout_status,
            customerName: customerDemographics.name,
            customerPhone: customerDemographics.phone,
            customerAddress: {
                city: customerDemographics.city ?? undefined,
                area: customerDemographics.area ?? undefined,
                block: customerDemographics.block ?? undefined,
                street: customerDemographics.street ?? undefined,
                house_no: customerDemographics.house_no ?? undefined,
            },
            fabricSelections,
            // collar_position is a body measurement now — from the loaded measurement.
            measurement: { collar_position: card2MeasurementResponse?.data?.collar_position ?? null },
            shelfProducts: shelfForm.getValues().products,
            fabrics: fabricsResponse || [],
            charges: {
                fabric: orderData.fabric_charge ?? 0,
                stitching: orderData.stitching_charge ?? 0,
                style: orderData.style_charge ?? 0,
                delivery: orderData.delivery_charge ?? 0,
                shelf: orderData.shelf_charge ?? 0,
                express: orderData.express_charge ?? 0,
                soaking: orderData.soaking_charge ?? 0,
            },
            discountType: orderData.discount_type ?? undefined,
            discountValue: orderData.discount_value ?? 0,
            advance: orderData.advance ?? 0,
            paid: orderData.paid ?? 0,
            paymentType: orderData.payment_type ?? undefined,
            paymentRefNo: orderData.payment_ref_no ?? undefined,
            orderTaker: orderTakerEmployee?.name,
            customerSignatureUrl: orderResponse?.data?.customer_signature_url ?? undefined,
        };
    }, [OrderForm, employees, order.id, customerDemographics, fabricSelections, card2MeasurementResponse, shelfForm, fabricsResponse, orderResponse]);

    // ── Render ────────────────────────────────────────────────────────────────
    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
                <p className="text-base font-semibold text-foreground">Order not found</p>
                <button
                    type="button"
                    onClick={() => navigate({ to: "/$main/orders/order-history", params: { main: main || "erth" } })}
                    className="text-sm font-medium text-primary hover:text-primary/80"
                >
                    Back to order history
                </button>
            </div>
        );
    }

    return (
        <>
            <ScrollProgress />
            {isLoadingOrder && (
                <FullScreenLoader title="Loading Order" subtitle="Please wait while we load this order..." />
            )}

            {/* Sticky header with stepper */}
            <div className="sticky top-0 z-50 bg-background">
                <HorizontalStepper
                    steps={steps}
                    completedSteps={ALL_STEPS}
                    currentStep={currentStep}
                    activeSteps={visibleSteps}
                    onStepChange={handleStepChange}
                />
            </div>

            <div className="flex flex-col items-center gap-4 md:gap-5 pt-5 pb-8 px-4 md:px-5 max-w-6xl mx-auto w-full">
                {/* Closed-order banner */}
                <div className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-muted/60 border border-border">
                    <div className="flex items-center gap-2 text-sm">
                        <span
                            className={`font-semibold ${checkoutStatus === "confirmed" ? "text-emerald-700" : "text-red-600"}`}
                        >
                            {checkoutStatus === "confirmed" ? "Order Confirmed" : "Order Cancelled"}
                        </span>
                        {order.id && <span className="text-muted-foreground tabular-nums">#{order.id}</span>}
                        {fatoura && <span className="text-muted-foreground tabular-nums">· INV {fatoura}</span>}
                        <span className="text-muted-foreground">· View only</span>
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            navigate({ to: "/$main/orders/new-work-order", params: { main: main || "erth" }, search: {} })
                        }
                        className="text-sm font-semibold text-primary hover:text-primary/80 cursor-pointer touch-manipulation pointer-coarse:active:scale-[0.97]"
                    >
                        + New Order
                    </button>
                </div>

                {/* Hidden print labels container */}
                <div style={{ display: "none" }}>
                    <div ref={printLabelsRef}>
                        {fabricSelections.map((garment, index) => {
                            const fabricData = {
                                orderId: orderId || "N/A",
                                customerId: customerDemographics.id || "N/A",
                                customerName: customerDemographics.nick_name || customerDemographics.name || "N/A",
                                customerMobile: customerDemographics.phone || "N/A",
                                garmentId: garment.garment_id || "N/A",
                                fabricSource: garment.fabric_source || "",
                                fabricId: garment.fabric_id ?? "",
                                fabricLength: garment.fabric_length ?? 0,
                                measurementId: garment.measurement_id || "N/A",
                                garment_type: garment.garment_type ?? ("final" as const),
                                express: garment.express ?? false,
                                soaking: garment.soaking ?? false,
                                soaking_hours: (garment.soaking_hours === 8 || garment.soaking_hours === 24) ? garment.soaking_hours : null,
                                deliveryDate: garment.delivery_date ? new Date(garment.delivery_date) : null,
                                notes: garment.notes || "",
                                invoiceNumber: fatoura ? String(fatoura) : undefined,
                            };
                            return (
                                <div
                                    key={garment.garment_id || index}
                                    className={index < fabricSelections.length - 1 ? "page-break" : ""}
                                >
                                    <FabricLabel fabricData={fabricData} />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* STEP 0: Demographics */}
                <div
                    id={steps[0].id}
                    ref={setSectionRef(0)}
                    className="w-full flex flex-col items-center space-y-6"
                >
                    <CustomerDemographicsForm
                        form={demographicsForm}
                        isOrderClosed
                        initialIsEditing={false}
                        orderId={orderId}
                        hideAddress
                    />
                </div>

                {/* STEP 1: Measurements */}
                <div
                    id={steps[1].id}
                    ref={setSectionRef(1)}
                    className="w-full flex flex-col items-center"
                >
                    <LazySection forceMount>
                        <ErrorBoundary fallback={<div>Customer Measurements crashed</div>}>
                            <CustomerMeasurementsForm
                                form={measurementsForm}
                                isOrderClosed
                                customerId={customerDemographics.id ? Number(customerDemographics.id) : null}
                            />
                        </ErrorBoundary>
                    </LazySection>
                </div>

                {/* STEP 2: Fabric Selection */}
                <div
                    id={steps[2].id}
                    ref={setSectionRef(2)}
                    className="w-full flex flex-col items-center"
                >
                    <LazySection forceMount>
                        <ErrorBoundary fallback={<div>Fabric Selection crashed</div>}>
                            <FabricSelectionForm
                                customerId={customerDemographics.id ? Number(customerDemographics.id) : null}
                                customerName={customerDemographics.nick_name || customerDemographics.name || undefined}
                                customerMobile={customerDemographics.phone ?? undefined}
                                form={fabricSelectionForm}
                                isOrderClosed
                                onSubmit={() => {}}
                                onProceed={() => {}}
                                orderId={orderId}
                                isProceedDisabled
                                checkoutStatus={checkoutStatus}
                                deliveryDate={order.delivery_date ?? undefined}
                                setDeliveryDate={() => {}}
                                homeDelivery={order.home_delivery}
                                fatoura={fatoura}
                                orderDate={order.order_date ?? undefined}
                                stitchingPrice={stitchingPrice}
                                setStitchingPrice={() => {}}
                                stitchingAdult={stitchingAdult}
                                stitchingChild={stitchingChild}
                                onCampaignsChange={() => {}}
                                initialCampaigns={order.campaign_id ? [order.campaign_id.toString()] : []}
                            />
                        </ErrorBoundary>
                    </LazySection>
                </div>

                {/* STEP 3: Shelf Products */}
                <div
                    id={steps[3].id}
                    ref={setSectionRef(3)}
                    className="w-full flex flex-col items-center"
                >
                    <LazySection forceMount>
                        <ErrorBoundary fallback={<div>Shelf Products crashed</div>}>
                            <ShelfForm form={shelfForm} isOrderDisabled hasOrder={!!orderId} />
                        </ErrorBoundary>
                    </LazySection>
                </div>

                {/* STEP 4: Review */}
                <div
                    id={steps[4].id}
                    ref={setSectionRef(4)}
                    className="w-full flex flex-col items-center"
                >
                    <LazySection forceMount>
                        <ErrorBoundary fallback={<div>Order and Payment crashed</div>}>
                            <OrderSummaryAndPaymentForm
                                form={OrderForm}
                                isOrderClosed
                                invoiceData={invoiceData}
                                orderId={orderId}
                                checkoutStatus={checkoutStatus}
                                fatoura={fatoura}
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
                                onPrintLabels={() => handlePrintLabels()}
                                onPrintCard2={() => handlePrintCard2()}
                                cashierHandlesPayment={cashierHandlesPayment}
                                onConfirm={() => {}}
                                onCancel={() => {}}
                            />
                        </ErrorBoundary>
                    </LazySection>
                </div>
            </div>
        </>
    );
}
