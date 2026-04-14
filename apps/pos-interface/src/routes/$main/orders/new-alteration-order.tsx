import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { pdf } from "@react-pdf/renderer";
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
import { DatePicker } from "@repo/ui/date-picker";
import { SvgFormOverlay } from "@/components/alteration/svg-form-overlay";
import { AlterationCheckboxMatrix } from "@/components/alteration/alteration-checkbox-matrix";
import {
    createInitialAlterationIssueMatrixValues,
    type AlterationIssueMatrixValues,
} from "@/components/alteration/alteration-checkbox-matrix-config";
import { AlterationPdfDocument } from "@/components/alteration/alteration-pdf-document";
import { defaultTemplateFieldLayout } from "@/components/alteration/field-layout";
import { useAlterationOrderMutations } from "@/hooks/useAlterationOrderMutations";
import { useAuth } from "@/context/auth";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import type { Customer } from "@repo/database";

export const Route = createFileRoute("/$main/orders/new-alteration-order")({
    component: NewAlterationOrder,
    head: () => ({
        meta: [{ title: "New Alteration Order" }],
    }),
});

type GarmentDraft = {
    key: string;
    bufi_ext: string;
    custom_price: string;
    delivery_date: Date | null;
    notes: string;
    measurements: Record<string, string>;
    issues: AlterationIssueMatrixValues;
};

const createEmptyGarment = (): GarmentDraft => ({
    key: crypto.randomUUID(),
    bufi_ext: "",
    custom_price: "",
    delivery_date: null,
    notes: "",
    measurements: Object.fromEntries(defaultTemplateFieldLayout.map((f) => [f.id, ""])),
    issues: createInitialAlterationIssueMatrixValues(),
});

const parsePrice = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
};

const BUFI_OPTIONS = ["Brova", "Final", "External"] as const;

const dateToIso = (d: Date | null) => (d ? d.toISOString() : null);

const formatDateGB = (d: Date | null) => (d ? d.toLocaleDateString("en-GB") : "");

function NewAlterationOrder() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { createAlterationOrder, isCreating } = useAlterationOrderMutations();

    const demographicsForm = useForm<CustomerDemographicsSchema, any, any>({
        resolver: zodResolver(customerDemographicsSchema) as any,
        defaultValues: customerDemographicsDefaults,
    });

    const [selectedCustomer, setSelectedCustomer] = React.useState<Customer | null>(null);
    const [garments, setGarments] = React.useState<GarmentDraft[]>(() => [createEmptyGarment()]);
    const [receivedDate, setReceivedDate] = React.useState<Date | null>(() => new Date());
    const [comments, setComments] = React.useState<string>("");
    const [activeTab, setActiveTab] = React.useState<number>(0);

    const handleCustomerFound = React.useCallback((customer: Customer) => {
        setSelectedCustomer(customer);
        demographicsForm.reset(mapCustomerToFormValues(customer));
    }, [demographicsForm]);

    const handleCustomerClear = React.useCallback(() => {
        setSelectedCustomer(null);
        demographicsForm.reset(customerDemographicsDefaults);
    }, [demographicsForm]);

    const updateGarment = <K extends keyof GarmentDraft>(idx: number, field: K, value: GarmentDraft[K]) => {
        setGarments((current) => current.map((g, i) => (i === idx ? { ...g, [field]: value } : g)));
    };

    const updateMeasurement = (idx: number, fieldId: string, value: string) => {
        setGarments((current) =>
            current.map((g, i) => (i === idx ? { ...g, measurements: { ...g.measurements, [fieldId]: value } } : g)),
        );
    };

    const updateIssue = (idx: number, rowId: string, columnId: string, checked: boolean) => {
        setGarments((current) =>
            current.map((g, i) =>
                i === idx
                    ? {
                          ...g,
                          issues: {
                              ...g.issues,
                              [rowId]: { ...(g.issues[rowId] ?? {}), [columnId]: checked },
                          },
                      }
                    : g,
            ),
        );
    };

    const addGarment = () => {
        setGarments((current) => {
            const next = [...current, createEmptyGarment()];
            setActiveTab(next.length - 1);
            return next;
        });
    };

    const removeGarment = (idx: number) => {
        if (garments.length === 1) return;
        setGarments((current) => current.filter((_, i) => i !== idx));
        setActiveTab((t) => Math.max(0, Math.min(t, garments.length - 2)));
    };

    const total = garments.reduce((sum, g) => sum + parsePrice(g.custom_price), 0);

    const validate = (): string | null => {
        if (!selectedCustomer) return "Select or create a customer first";
        if (garments.length === 0) return "Add at least one garment";
        for (let i = 0; i < garments.length; i++) {
            const g = garments[i]!;
            if (parsePrice(g.custom_price) < 0) return `Garment ${i + 1}: price cannot be negative`;
        }
        return null;
    };

    const handleSave = async (opts: { andPrint: boolean }) => {
        const err = validate();
        if (err) {
            toast.error(err);
            return;
        }

        // Snapshot the customer so it can't go null between save and print
        const customer = selectedCustomer;
        if (!customer) {
            toast.error("Select or create a customer first");
            return;
        }

        try {
            const order = await createAlterationOrder({
                customer_id: customer.id,
                received_date: dateToIso(receivedDate),
                comments: comments || null,
                order_taker_id: user?.id ?? null,
                garments: garments.map((g) => ({
                    quantity: 1,
                    bufi_ext: g.bufi_ext || null,
                    custom_price: parsePrice(g.custom_price),
                    alteration_measurements: g.measurements,
                    alteration_issues: g.issues as Record<string, Record<string, boolean>>,
                    delivery_date: dateToIso(g.delivery_date),
                    notes: g.notes || null,
                })),
            });

            if (opts.andPrint) {
                await openPrintForOrder(order, customer);
            }

            navigate({ to: "/$main/orders/order-history", params: (prev: any) => prev });
        } catch {
            // toast already shown in hook
        }
    };

    const openPrintForOrder = async (order: any, customer: Customer) => {
        const invoiceNumber = order.invoice_number ?? order.alteration_order?.invoice_number ?? "";
        const orderGarments: any[] = order.garments ?? [];
        const total = orderGarments.length;

        for (let idx = 0; idx < orderGarments.length; idx++) {
            const g = orderGarments[idx]!;
            const meta = {
                nFat: String(invoiceNumber),
                qty: `${idx + 1}/${total}`,
                customerName: customer.name ?? "",
                customerPhone: `${customer.country_code ?? ""}${customer.phone ?? ""}`,
                bufiExt: g.bufi_ext ?? "",
                receivedDate: formatDateGB(receivedDate),
                requestedDate: g.delivery_date ? new Date(g.delivery_date).toLocaleDateString("en-GB") : "",
                comments: g.notes ?? comments ?? "",
            };

            const blob = await pdf(
                <AlterationPdfDocument
                    measurementValues={(g.alteration_measurements ?? {}) as Record<string, string>}
                    reasonValues={(g.alteration_issues ?? {}) as AlterationIssueMatrixValues}
                    meta={meta}
                />,
            ).toBlob();

            const url = URL.createObjectURL(blob);
            const w = window.open(url, "_blank");
            if (w) {
                w.addEventListener("load", () => w.print(), { once: true });
            }
        }
    };

    const active = garments[activeTab] ?? garments[0]!;

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#e9eef7_58%,#dce4f2_100%)] px-4 py-6">
            <div className="mx-auto w-full max-w-[1320px] space-y-4">
                <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold text-slate-900">New Alteration Order</h1>
                        <p className="text-sm text-slate-600">
                            Customer-brought garments from outside. Cashier-invisible.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
                        <p className="text-2xl font-bold text-slate-900">{total.toFixed(3)} KWD</p>
                    </div>
                </header>

                {/* Customer search */}
                <section className="rounded-xl border border-slate-300/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
                    <ErrorBoundary fallback={<div>Search Customer crashed</div>}>
                        <SearchCustomer
                            onCustomerFound={handleCustomerFound}
                            onHandleClear={handleCustomerClear}
                        />
                    </ErrorBoundary>
                </section>

                {/* Full customer demographics */}
                <section className="rounded-xl border border-slate-300/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
                    <CustomerDemographicsForm
                        form={demographicsForm}
                        onCustomerChange={handleCustomerFound}
                        header="Customer Details"
                        subheader="Full demographics — required before saving the alteration order"
                        proceedButtonText="Confirm Customer"
                    />
                </section>

                {/* Order meta */}
                <section className="rounded-xl border border-slate-300/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
                    <h2 className="mb-3 text-sm font-semibold text-slate-800">Order Details</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="received-date">Received Date</Label>
                            <DatePicker
                                value={receivedDate}
                                onChange={setReceivedDate}
                                clearable
                                displayFormat="dd/MM/yyyy"
                                placeholder="Received date"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="comments">Comments</Label>
                            <Input
                                id="comments"
                                value={comments}
                                onChange={(e) => setComments(e.target.value)}
                                placeholder="Order-level notes"
                            />
                        </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                        Each garment gets its own requested delivery date below.
                    </p>
                </section>

                {/* Garment tabs */}
                <section className="rounded-xl border border-slate-300/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-800">Garments</h2>
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
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                        {garments.map((g, idx) => (
                            <button
                                type="button"
                                key={g.key}
                                onClick={() => setActiveTab(idx)}
                                className={
                                    "rounded-md border px-3 py-1 text-sm transition " +
                                    (activeTab === idx
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
                                }
                            >
                                Garment {idx + 1}/{garments.length}
                                {parsePrice(g.custom_price) > 0 && (
                                    <span className="ml-2 text-xs opacity-75">
                                        {parsePrice(g.custom_price).toFixed(3)}
                                    </span>
                                )}
                                {g.delivery_date && (
                                    <span className="ml-2 text-[10px] opacity-60">
                                        {g.delivery_date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Garment header */}
                    <div className="mb-4 grid gap-4 sm:grid-cols-4">
                        <div className="space-y-1.5">
                            <Label>Serial</Label>
                            <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-900">
                                {activeTab + 1}/{garments.length}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Type</Label>
                            <div className="flex h-9 overflow-hidden rounded-md border border-slate-300">
                                {BUFI_OPTIONS.map((opt) => {
                                    const selected = active.bufi_ext === opt;
                                    return (
                                        <button
                                            key={opt}
                                            type="button"
                                            onClick={() =>
                                                updateGarment(activeTab, "bufi_ext", selected ? "" : opt)
                                            }
                                            className={
                                                "flex-1 text-xs font-semibold transition border-r border-slate-300 last:border-r-0 " +
                                                (selected
                                                    ? "bg-slate-900 text-white"
                                                    : "bg-white text-slate-700 hover:bg-slate-50")
                                            }
                                        >
                                            {opt}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`price-${activeTab}`}>Price (KWD)</Label>
                            <Input
                                id={`price-${activeTab}`}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.001"
                                value={active.custom_price}
                                onChange={(e) => updateGarment(activeTab, "custom_price", e.target.value)}
                                placeholder="0.000"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Requested delivery</Label>
                            <DatePicker
                                value={active.delivery_date}
                                onChange={(d) => updateGarment(activeTab, "delivery_date", d)}
                                clearable
                                displayFormat="dd/MM/yyyy"
                                placeholder="Pick date"
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
                        <SvgFormOverlay
                            className="mx-0 max-w-[620px]"
                            values={active.measurements}
                            onValueChange={(fieldId, value) => updateMeasurement(activeTab, fieldId, value)}
                        />

                        <AlterationCheckboxMatrix
                            className="mx-0 max-w-none"
                            values={active.issues}
                            onValueChange={(rowId, columnId, checked) =>
                                updateIssue(activeTab, rowId, columnId, checked)
                            }
                        />
                    </div>

                    <div className="mt-4 space-y-1.5">
                        <Label htmlFor={`notes-${activeTab}`}>Garment notes</Label>
                        <Input
                            id={`notes-${activeTab}`}
                            value={active.notes}
                            onChange={(e) => updateGarment(activeTab, "notes", e.target.value)}
                            placeholder="Per-garment comments"
                        />
                    </div>
                </section>

                {/* Actions */}
                <section className="sticky bottom-0 flex items-center justify-end gap-2 rounded-xl border border-slate-300/80 bg-white/95 p-3 shadow-lg backdrop-blur">
                    <div className="mr-auto text-sm text-slate-700">
                        <span className="font-semibold">{garments.length}</span> garment(s) ·{" "}
                        <span className="font-semibold">{total.toFixed(3)} KWD</span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleSave({ andPrint: false })}
                        disabled={isCreating || !selectedCustomer}
                        title={!selectedCustomer ? "Select a customer first" : undefined}
                    >
                        {isCreating ? "Confirming…" : "Confirm Order"}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => handleSave({ andPrint: true })}
                        disabled={isCreating || !selectedCustomer}
                        title={!selectedCustomer ? "Select a customer first" : undefined}
                    >
                        {isCreating ? "Confirming…" : "Confirm & Print"}
                    </Button>
                </section>
            </div>
        </div>
    );
}
