import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import {
    customerDemographicsDefaults,
    customerDemographicsSchema,
    type CustomerDemographicsSchema,
} from "@/components/forms/customer-demographics/demographics-form.schema";
import { mapCustomerToFormValues } from "@/components/forms/customer-demographics/demographics-form.mapper";
import { CustomerDemographicsForm } from "@/components/forms/customer-demographics";
import { SearchCustomer } from "@/components/forms/customer-demographics/search-customer";
import { ErrorBoundary } from "@/components/global/error-boundary";
import { TIMEZONE } from "@/lib/utils";
import { DatePicker } from "@repo/ui/date-picker";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Switch } from "@repo/ui/switch";
import { Textarea } from "@repo/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@repo/ui/select";
import {
    AlterationGarmentForm,
} from "@/components/forms/alteration/alteration-garment-form";
import {
    createEmptyAlterationGarment,
    alterationOrderSchema,
    type AlterationGarmentSchema,
    type AlterationOrderSchema,
} from "@/components/forms/alteration/alteration-form.schema";
import { useAlterationOrderMutations } from "@/hooks/useAlterationOrderMutations";
import { useAuth } from "@/context/auth";
import { getMeasurementsByCustomerId } from "@/api/measurements";
import { getAlterationOrderById } from "@/api/alteration-orders";
import type { Customer, Garment, Measurement } from "@repo/database";

type AlterationOrderSearch = { orderId?: number };

export const Route = createFileRoute("/$main/orders/new-alteration-order")({
    validateSearch: (search: Record<string, unknown>): AlterationOrderSearch => ({
        orderId: search.orderId ? Number(search.orderId) : undefined,
    }),
    component: NewAlterationOrder,
    head: () => ({ meta: [{ title: "New Alteration Order" }] }),
});

function NewAlterationOrder() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { createAlterationOrder, isCreating } = useAlterationOrderMutations();
    const { orderId } = Route.useSearch();
    const isViewMode = orderId != null;

    const demographicsForm = useForm<CustomerDemographicsSchema>({
        resolver: zodResolver(customerDemographicsSchema) as never,
        defaultValues: customerDemographicsDefaults,
    });

    const [selectedCustomer, setSelectedCustomer] = React.useState<Customer | null>(null);
    const [garments, setGarments] = React.useState<AlterationGarmentSchema[]>(() => [createEmptyAlterationGarment()]);
    const [activeTab, setActiveTab] = React.useState(0);
    const [requestedDeliveryDate, setRequestedDeliveryDate] = React.useState<Date | null>(null);
    const [comments, setComments] = React.useState("");
    const [homeDelivery, setHomeDelivery] = React.useState(false);
    const [orderTotalRaw, setOrderTotalRaw] = React.useState("");
    const [masterMeasurementId, setMasterMeasurementId] = React.useState<string | null>(null);

    const { data: existingOrderRes } = useQuery({
        queryKey: ["alteration-order", orderId],
        queryFn: () => (orderId ? getAlterationOrderById(orderId) : Promise.resolve(null)),
        enabled: !!orderId,
        staleTime: 30_000,
    });

    const existingOrder = existingOrderRes?.status === "success" ? existingOrderRes.data : null;
    const hydratedOrderIdRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        if (!existingOrder || hydratedOrderIdRef.current === existingOrder.id) return;
        hydratedOrderIdRef.current = existingOrder.id;

        const order = existingOrder as typeof existingOrder & {
            customer: Customer | null;
            garments: Garment[] | null;
            comments: string | null;
        };

        if (order.customer) {
            setSelectedCustomer(order.customer);
            demographicsForm.reset(mapCustomerToFormValues(order.customer));
        }

        const rows = order.garments ?? [];
        if (rows.length > 0) {
            setGarments(rows.map((g) => ({
                key: g.id,
                mode: g.full_measurement_set_id ? "full_set" : "changes_only",
                full_measurement_set_id: g.full_measurement_set_id,
                original_garment_id: g.original_garment_id,
                bufi_ext: g.bufi_ext,
                delivery_date: g.delivery_date ? new Date(g.delivery_date).toISOString() : null,
                notes: g.notes,
                alteration_measurements: (g.alteration_measurements ?? {}) as Record<string, number>,
                alteration_styles: (g.alteration_styles ?? {}) as Record<string, string | boolean | number>,
            })));
            setActiveTab(0);

            const firstDate = rows[0]?.delivery_date;
            setRequestedDeliveryDate(firstDate ? new Date(firstDate) : null);
            setHomeDelivery(!!rows[0]?.home_delivery);

            const fullSetGarment = rows.find((g) => g.full_measurement_set_id);
            if (fullSetGarment?.full_measurement_set_id) {
                setMasterMeasurementId(fullSetGarment.full_measurement_set_id);
            }
        }

        setComments(order.comments ?? "");
        const total = (order as { order_total?: number | null }).order_total;
        setOrderTotalRaw(total != null ? String(total) : "");
    }, [existingOrder, demographicsForm]);

    const customerId = selectedCustomer?.id ?? null;

    const { data: measurementsRes } = useQuery({
        queryKey: ["measurements", customerId],
        queryFn: () => (customerId ? getMeasurementsByCustomerId(customerId) : Promise.resolve(null)),
        enabled: !!customerId,
        staleTime: Infinity,
    });
    const customerMeasurements = React.useMemo(() => measurementsRes?.data ?? [], [measurementsRes]);

    React.useEffect(() => {
        if (!masterMeasurementId && customerMeasurements.length > 0) {
            setMasterMeasurementId(customerMeasurements[0]!.id);
        }
    }, [customerMeasurements, masterMeasurementId]);

    const masterMeasurement: Measurement | null = React.useMemo(() => {
        if (!masterMeasurementId) return null;
        return customerMeasurements.find((m) => m.id === masterMeasurementId) ?? null;
    }, [customerMeasurements, masterMeasurementId]);

    const handleCustomerFound = React.useCallback((customer: Customer) => {
        setSelectedCustomer(customer);
        demographicsForm.reset(mapCustomerToFormValues(customer));
        setMasterMeasurementId(null);
    }, [demographicsForm]);

    const handleCustomerClear = React.useCallback(() => {
        setSelectedCustomer(null);
        demographicsForm.reset(customerDemographicsDefaults);
        setMasterMeasurementId(null);
    }, [demographicsForm]);

    const updateGarment = (idx: number, next: AlterationGarmentSchema) => {
        setGarments((cur) => cur.map((g, i) => (i === idx ? next : g)));
    };

    const addGarment = () => {
        setGarments((cur) => {
            const next = [...cur, createEmptyAlterationGarment()];
            setActiveTab(next.length - 1);
            return next;
        });
    };

    const removeGarment = (idx: number) => {
        if (garments.length === 1) return;
        setGarments((cur) => cur.filter((_, i) => i !== idx));
        setActiveTab((t) => Math.max(0, Math.min(t, garments.length - 2)));
    };

    const orderTotal = React.useMemo(() => {
        const n = parseFloat(orderTotalRaw);
        return Number.isFinite(n) ? n : 0;
    }, [orderTotalRaw]);

    const handleSave = async () => {
        if (!selectedCustomer) {
            toast.error("Select or create a customer first");
            return;
        }
        if (!requestedDeliveryDate) {
            toast.error("Pick a requested delivery date");
            return;
        }

        const deliveryIso = requestedDeliveryDate.toISOString();
        const garmentsWithDelivery = garments.map((g) => ({ ...g, delivery_date: deliveryIso }));

        const parsed = alterationOrderSchema.safeParse({
            customer_id: selectedCustomer.id,
            received_date: new Date().toISOString(),
            comments: comments || null,
            home_delivery: homeDelivery,
            order_total: orderTotal,
            garments: garmentsWithDelivery,
        });

        if (!parsed.success) {
            const first = parsed.error.issues[0];
            toast.error(first?.message ?? "Invalid alteration order");
            return;
        }

        const data: AlterationOrderSchema = parsed.data;

        try {
            const order = await createAlterationOrder({
                customer_id: data.customer_id,
                received_date: data.received_date,
                comments: data.comments,
                home_delivery: data.home_delivery,
                order_total: data.order_total,
                order_taker_id: user?.id ?? null,
                master_measurement_id: null,
                master_measurement_updates: null,
                garments: data.garments.map((g) => ({
                    mode: g.mode,
                    full_measurement_set_id: g.full_measurement_set_id,
                    original_garment_id: g.original_garment_id,
                    bufi_ext: g.bufi_ext,
                    delivery_date: g.delivery_date,
                    notes: g.notes,
                    alteration_measurements: g.alteration_measurements,
                    alteration_styles: g.alteration_styles,
                })),
            });

            navigate({
                to: "/$main/orders/order-history",
                params: (prev: Record<string, string>) => prev,
            });
            void order;
        } catch {
            // toast already shown in hook
        }
    };

    const active = garments[activeTab] ?? garments[0]!;

    const customerLabel = selectedCustomer
        ? `${selectedCustomer.name ?? "—"}`
        : "No customer selected";

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#e9eef7_58%,#dce4f2_100%)] px-4 py-6">
            <div className="mx-auto w-full max-w-[1320px] space-y-4">
                <header className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-semibold text-slate-900">
                                {isViewMode ? "Alteration Order" : "New Alteration Order"}
                            </h1>
                            {isViewMode && existingOrder && (
                                <>
                                    <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-purple-800">
                                        #{(existingOrder as { invoice_number?: number | null }).invoice_number ?? existingOrder.id}
                                    </span>
                                    {(existingOrder as { order_phase?: string | null }).order_phase && (
                                        <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                                            {(existingOrder as { order_phase?: string | null }).order_phase}
                                        </span>
                                    )}
                                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                        Read only
                                    </span>
                                </>
                            )}
                        </div>
                        <p className="text-sm text-slate-600">
                            {isViewMode
                                ? "Existing alteration order details."
                                : "Customer-brought garments. Per-garment changes or full new measurement set."}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
                        <p className="text-2xl font-bold text-slate-900">{orderTotal.toFixed(3)} KWD</p>
                    </div>
                </header>

                {!isViewMode && (
                    <section className="relative z-30 rounded-xl border border-slate-300/80 bg-white/80 p-4 shadow-sm">
                        <ErrorBoundary fallback={<div>Search Customer crashed</div>}>
                            <SearchCustomer
                                onCustomerFound={handleCustomerFound}
                                onHandleClear={handleCustomerClear}
                            />
                        </ErrorBoundary>
                    </section>
                )}

                <fieldset disabled={isViewMode} className="contents">
                <section className="rounded-xl border border-slate-300/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
                    <CustomerDemographicsForm
                        form={demographicsForm}
                        onCustomerChange={handleCustomerFound}
                        header="Customer Details"
                        subheader={isViewMode ? "Customer on file" : "Required before saving"}
                        proceedButtonText="Confirm Customer"
                    />
                </section>
                </fieldset>

                <section className="rounded-xl border border-slate-300/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
                    <div className="mb-3 flex items-center gap-3">
                        <h2 className="text-sm font-semibold text-slate-800">Master Measurement Record</h2>
                        <Select
                            value={masterMeasurementId ?? ""}
                            onValueChange={(v) => setMasterMeasurementId(v || null)}
                            disabled={isViewMode || !customerId || customerMeasurements.length === 0}
                        >
                            <SelectTrigger className="ml-auto w-80 bg-background">
                                <SelectValue placeholder={
                                    !customerId
                                        ? "Select customer first"
                                        : customerMeasurements.length === 0
                                            ? "No measurement records — create one in Measurements"
                                            : "Pick reference record"
                                } />
                            </SelectTrigger>
                            <SelectContent>
                                {customerMeasurements.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.measurement_id ?? m.id.slice(0, 8)} · {m.type ?? "—"} · {m.reference ?? "—"}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-slate-500">
                        Reference record used to seed full-set picker and show baseline values for changes-only fields.
                    </p>
                </section>

                <section className="rounded-xl border border-slate-300/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-800">Garments</h2>
                        {!isViewMode && (
                            <div className="ml-auto flex gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={addGarment}>
                                    + Add Garment
                                </Button>
                                {garments.length > 1 && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => removeGarment(activeTab)}
                                    >
                                        Remove Garment {activeTab + 1}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2">
                        {garments.map((g, idx) => (
                            <button
                                key={g.key}
                                type="button"
                                onClick={() => setActiveTab(idx)}
                                className={
                                    "rounded-md border px-3 py-1 text-sm transition " +
                                    (activeTab === idx
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
                                }
                            >
                                Garment {idx + 1}/{garments.length}
                                <span className="ml-2 text-[10px] opacity-70">
                                    {g.mode === "changes_only" ? "Changes" : "Full"}
                                </span>
                            </button>
                        ))}
                    </div>

                    <fieldset disabled={isViewMode} className="contents">
                        <AlterationGarmentForm
                            index={activeTab}
                            customerId={customerId}
                            value={active}
                            onChange={(next) => updateGarment(activeTab, next)}
                            masterMeasurement={masterMeasurement}
                        />
                    </fieldset>
                </section>

                {/* Order summary + payment / delivery */}
                <fieldset disabled={isViewMode} className="contents">
                <section className="rounded-xl border border-slate-300/80 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">Order Summary</h2>
                            <p className="text-xs text-slate-500">Review details before confirming.</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">Customer</p>
                            <p className="text-sm font-medium text-slate-800">{customerLabel}</p>
                        </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                        {/* Garments breakdown */}
                        <div>
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Garments ({garments.length})
                            </h3>
                            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/40">
                                {garments.map((g, idx) => (
                                    <GarmentSummaryRow
                                        key={g.key}
                                        index={idx}
                                        garment={g}
                                        onClick={() => setActiveTab(idx)}
                                    />
                                ))}
                            </ul>
                        </div>

                        {/* Order details + payment */}
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label>
                                        Requested Delivery <span className="text-red-500">*</span>
                                    </Label>
                                    <DatePicker
                                        value={requestedDeliveryDate}
                                        onChange={setRequestedDeliveryDate}
                                        clearable
                                        displayFormat="dd/MM/yyyy"
                                        placeholder="Pick delivery date"
                                    />
                                    <p className="text-[11px] text-slate-500">
                                        Applies to all garments in this order.
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="alt-total">Order Total (KWD)</Label>
                                    <Input
                                        id="alt-total"
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step="0.001"
                                        value={orderTotalRaw}
                                        onChange={(e) => setOrderTotalRaw(e.target.value)}
                                        placeholder="0.000"
                                        className="text-right font-semibold"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <div>
                                    <Label htmlFor="alt-home-delivery" className="cursor-pointer text-sm font-medium text-slate-800">
                                        Home delivery
                                    </Label>
                                    <p className="text-[11px] text-slate-500">Toggle if customer wants delivery to address.</p>
                                </div>
                                <Switch
                                    id="alt-home-delivery"
                                    checked={homeDelivery}
                                    onCheckedChange={setHomeDelivery}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="alt-comments">Order Notes</Label>
                                <Textarea
                                    id="alt-comments"
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    placeholder="Order-level notes (optional)"
                                    rows={3}
                                />
                            </div>

                            <div className="rounded-lg border border-slate-300 bg-gradient-to-br from-slate-900 to-slate-700 p-4 text-white shadow-inner">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs uppercase tracking-wide text-slate-300">
                                        Total Payable
                                    </span>
                                    <span className="text-2xl font-bold">{orderTotal.toFixed(3)} <span className="text-sm opacity-80">KWD</span></span>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-300">
                                    <span>{garments.length} garment(s)</span>
                                    <span>{homeDelivery ? "Home delivery" : "Pickup"}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                </fieldset>

                <section className="sticky bottom-0 flex items-center justify-end gap-3 rounded-xl border border-slate-300/80 bg-white/95 p-3 shadow-lg backdrop-blur">
                    <div className="mr-auto text-sm text-slate-700">
                        <span className="font-semibold">{garments.length}</span> garment(s) ·{" "}
                        <span className="font-semibold">{orderTotal.toFixed(3)} KWD</span>
                        {requestedDeliveryDate && (
                            <span className="ml-3 text-xs text-slate-500">
                                delivery {requestedDeliveryDate.toLocaleDateString("en-GB", {
                                    timeZone: TIMEZONE,
                                    day: "2-digit",
                                    month: "short",
                                    year: "2-digit",
                                })}
                            </span>
                        )}
                        {!isViewMode && !selectedCustomer && (
                            <span className="ml-3 text-xs text-amber-600">Select a customer first</span>
                        )}
                        {!isViewMode && selectedCustomer && !requestedDeliveryDate && (
                            <span className="ml-3 text-xs text-amber-600">Pick a delivery date</span>
                        )}
                    </div>
                    {isViewMode ? (
                        <Button
                            type="button"
                            size="lg"
                            variant="outline"
                            onClick={() => navigate({ to: "/$main/orders/order-history", params: (prev: Record<string, string>) => prev })}
                        >
                            Back to History
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            size="lg"
                            onClick={handleSave}
                            disabled={isCreating || !selectedCustomer || !requestedDeliveryDate}
                            title={
                                !selectedCustomer
                                    ? "Select a customer first"
                                    : !requestedDeliveryDate
                                        ? "Pick a delivery date"
                                        : undefined
                            }
                        >
                            {isCreating ? "Confirming…" : "Confirm Order"}
                        </Button>
                    )}
                </section>
            </div>
        </div>
    );
}

function GarmentSummaryRow({
    index,
    garment,
    onClick,
}: {
    index: number;
    garment: AlterationGarmentSchema;
    onClick: () => void;
}) {
    const measurementCount = Object.keys(garment.alteration_measurements ?? {}).length;
    const styleCount = Object.entries(garment.alteration_styles ?? {}).filter(
        ([, v]) => v !== false && v !== null && v !== "" && v !== undefined,
    ).length;

    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                className="group flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white"
            >
                <div className="flex size-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    {index + 1}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">
                            {garment.bufi_ext ?? "Garment"}
                        </span>
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                            {garment.mode === "changes_only" ? "Changes" : "Full set"}
                        </span>
                        {garment.original_garment_id && (
                            <span className="text-[10px] text-slate-500">linked</span>
                        )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-slate-500">
                        <span>{measurementCount} measurement change{measurementCount === 1 ? "" : "s"}</span>
                        <span>{styleCount} style change{styleCount === 1 ? "" : "s"}</span>
                    </div>
                </div>
                <span className="text-xs text-slate-400 group-hover:text-slate-700">Edit →</span>
            </button>
        </li>
    );
}
