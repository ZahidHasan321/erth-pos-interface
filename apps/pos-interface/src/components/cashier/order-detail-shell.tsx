import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Info, Receipt, User, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Separator } from "@repo/ui/separator";
import { Skeleton } from "@repo/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@repo/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/popover";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import {
    useCashierOrderSearch,
    usePaymentTransactions,
} from "@/hooks/useCashier";
import { PaymentHistory } from "@/components/cashier/payment-history";
import type { InvoiceData, AlterationInvoiceData } from "@/components/invoice";
import { formatAlterationChanges } from "@/lib/alteration-changes";
import { PaymentMode } from "@/components/cashier/payment-mode";
import { HandoverMode } from "@/components/cashier/handover-mode";
import { RefundMode } from "@/components/cashier/refund-mode";
import { ORDER_PHASE_LABELS } from "@/lib/constants";
import { parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import type { Order, Garment, OrderShelfItem } from "@repo/database";
import "./cashier-keyframes";

// collar_position lives on the linked measurement now (see cashier query join).
type GarmentWithFabric = Garment & {
    fabric?: { id: number; name: string } | null;
    measurement?: { collar_position: "up" | "down" | null } | null;
};
type ShelfItemWithShelf = OrderShelfItem & { shelf?: { type: string; brand: string } | null };

type Mode = "payment" | "handover" | "refund";


const shortDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, day: "2-digit", month: "short" });

export function OrderDetailShell({ orderId, onBack, canTakeMoney = true }: { orderId: string; onBack: () => void; canTakeMoney?: boolean }) {
    const { data: searchResult, isFetching: isOrderLoading } = useCashierOrderSearch(orderId);
    const order = searchResult?.status === "success" ? searchResult.data : null;

    const { data: txResult } = usePaymentTransactions(order?.id);
    const txData = txResult?.status === "success" ? txResult.data : [];
    const transactions = Array.isArray(txData) ? txData : [];

    const orderTotal = Number(order?.order_total) || 0;
    const totalPaid = Number(order?.paid) || 0;
    const discountValue = Number(order?.discount_value) || 0;

    const totalPayments = useMemo(() => transactions
        .filter((tx) => tx.transaction_type === "payment")
        .reduce((sum: number, tx) => sum + Math.abs(Number(tx.amount) || 0), 0), [transactions]);
    const totalRefunds = useMemo(() => transactions
        .filter((tx) => tx.transaction_type === "refund")
        .reduce((sum: number, tx) => sum + Math.abs(Number(tx.amount) || 0), 0), [transactions]);

    const isCancelled = order?.checkout_status === "cancelled";
    const isOrderCompleted = order?.order_phase === "completed";
    const cancelledWithPayments = isCancelled && totalPaid > 0;
    const isSalesOrder = order?.order_type === "SALES";
    const isAlteration = order?.order_type === "ALTERATION";
    const serverDeliveryCharge = Number(order?.delivery_charge) || 0;

    const remainingBalance = orderTotal - totalPaid;
    const isFullyPaid = remainingBalance <= 0;

    const garments = Array.isArray(order?.garments) ? order.garments : [];
    const shelfItems = Array.isArray(order?.shelf_items) ? order.shelf_items : [];

    // ALTERATION orders have no work_orders row; home delivery is recorded on
    // each garment instead of order-level. Treat the order as home-delivery if
    // any of its pieces is, so handover offers the Deliver action.
    const isHomeDelivery = !!order?.home_delivery
        || (isAlteration && (garments as GarmentWithFabric[]).some((g) => g.home_delivery));

    const advance = useMemo(() => {
        if (!order) return 0;
        const stitching = Number(order?.stitching_charge) || 0;
        const fabric = Number(order?.fabric_charge) || 0;
        const style = Number(order?.style_charge) || 0;
        const express = Number(order?.express_charge) || 0;
        const soaking = Number(order?.soaking_charge) || 0;
        const shelf = Number(order?.shelf_charge) || 0;
        return parseFloat(((stitching * 0.5) + fabric + style + serverDeliveryCharge + express + soaking + shelf).toFixed(3));
    }, [order, serverDeliveryCharge]);

    // The proper signed invoice (SPEC §3) reprinted from the payment history —
    // the same OrderInvoice/SalesInvoice document used at order-taking, at the
    // order's current revision. Static here; PaymentHistory overrides paid +
    // payment method per printed transaction.
    const invoiceData = useMemo<InvoiceData>(() => {
        if (!order) return { paid: 0 };
        const gs = garments as GarmentWithFabric[];
        // The collar Up/Down note is a single order-level annotation on the
        // invoice; only show it when all garments agree, else omit it (printing
        // one garment's collar on every row would be wrong info).
        const collars = gs.map((g) => g.measurement?.collar_position ?? null);
        const uniformCollar = collars.every((c) => c === collars[0]) ? collars[0] ?? null : null;
        const fabrics = Array.from(
            new Map(
                gs.filter((g) => g.fabric_id != null && g.fabric)
                    .map((g) => [g.fabric_id, { id: g.fabric_id, name: g.fabric!.name }])
            ).values()
        );
        return {
            orderId: order.id,
            fatoura: order.invoice_number ?? undefined,
            invoiceRevision: order.invoice_revision ?? 0,
            orderDate: order.order_date ? String(order.order_date) : undefined,
            homeDelivery: isHomeDelivery,
            customerName: order.customer?.name ?? undefined,
            customerPhone: order.customer?.phone ?? undefined,
            measurement: { collar_position: uniformCollar },
            fabricSelections: gs.map((g) => ({
                style: g.style,
                collar_type: g.collar_type,
                jabzour_1: g.jabzour_1,
                cuffs_type: g.cuffs_type,
                jabzour_thickness: g.jabzour_thickness,
                lines: g.lines ?? 1,
                fabric_id: g.fabric_id,
                fabric_length: Number(g.fabric_length) || 0,
                garment_type: g.garment_type,
                express: g.express,
                soaking: g.soaking,
                soaking_hours: g.soaking_hours,
                stitching_price_snapshot: Number(g.stitching_price_snapshot) || 0,
                fabric_amount: Number(g.fabric_price_snapshot) || 0,
                style_price_snapshot: Number(g.style_price_snapshot) || 0,
            })) as InvoiceData["fabricSelections"],
            fabrics: fabrics as InvoiceData["fabrics"],
            shelfProducts: (shelfItems as ShelfItemWithShelf[]).map((i) => ({
                product_type: i.shelf?.type ?? `Item #${i.shelf_id}`,
                brand: i.shelf?.brand ?? "",
                quantity: i.quantity,
                unit_price: i.unit_price,
            })) as InvoiceData["shelfProducts"],
            charges: {
                fabric: Number(order.fabric_charge) || 0,
                stitching: Number(order.stitching_charge) || 0,
                style: Number(order.style_charge) || 0,
                delivery: serverDeliveryCharge,
                shelf: Number(order.shelf_charge) || 0,
                express: Number(order.express_charge) || 0,
                soaking: Number(order.soaking_charge) || 0,
            },
            discountValue,
            paid: totalPaid,
            customerSignatureUrl: order.customer_signature_url ?? undefined,
        };
    }, [order, garments, shelfItems, isHomeDelivery, serverDeliveryCharge, discountValue, totalPaid]);

    // ALTERATION invoice (SPEC §2.14 / §3): the recorded per-garment changes +
    // the manually-entered total. OrderInvoice can't represent this (no
    // fabric/style charges, separate invoice sequence), so it gets its own doc.
    const alterationInvoiceData = useMemo<AlterationInvoiceData | undefined>(() => {
        if (!order || !isAlteration) return undefined;
        return {
            orderId: order.id,
            invoiceNumber: order.alteration_order?.invoice_number ?? null,
            orderDate: order.order_date ? String(order.order_date) : undefined,
            receivedDate: order.alteration_order?.received_date ? String(order.alteration_order.received_date) : null,
            comments: order.alteration_order?.comments ?? null,
            customerName: order.customer?.name ?? undefined,
            customerPhone: order.customer?.phone ?? undefined,
            garments: (garments as GarmentWithFabric[]).map((g, i) => ({
                index: i + 1,
                source: g.original_garment_id ? "internal" : "external",
                changes: formatAlterationChanges(
                    g.alteration_measurements as Record<string, unknown> | null,
                    g.alteration_styles as Record<string, unknown> | null,
                ),
                notes: g.notes ?? null,
            })),
            total: orderTotal,
            discountValue,
            paid: totalPaid,
        };
    }, [order, isAlteration, garments, orderTotal, discountValue, totalPaid]);

    // Eligible-for-handover garments (shop + ready stages)
    const eligibleGarments = useMemo(() => isSalesOrder
        ? []
        : (garments as GarmentWithFabric[]).filter((g) =>
            g.location === "shop" && ["ready_for_pickup", "brova_trialed", "awaiting_trial"].includes(g.piece_stage ?? "")
          ),
        [garments, isSalesOrder]);

    // Tab visibility rules
    const showHandoverTab = !isSalesOrder && !isCancelled;
    const showRefundTab = totalPaid > 0;

    const modeOptions = useMemo(() => {
        const opts: Array<{ value: Mode; label: string }> = [{ value: "payment", label: "Payment" }];
        if (showHandoverTab) opts.push({ value: "handover", label: "Handover" });
        if (showRefundTab) opts.push({ value: "refund", label: "Refund" });
        return opts;
    }, [showHandoverTab, showRefundTab]);

    const [mode, setMode] = useState<Mode>("payment");
    const [historyOpen, setHistoryOpen] = useState(false);

    // Default-mode-on-order-switch logic: if fully paid + ready garments → handover, else payment.
    // When the register can't take money (closed/stale), prefer handover — it's
    // ungated — so a customer can still collect. Re-runs when the session resolves.
    useEffect(() => {
        setHistoryOpen(false);
        if (!canTakeMoney && showHandoverTab) {
            setMode("handover");
        } else if (isFullyPaid && eligibleGarments.length > 0 && showHandoverTab) {
            setMode("handover");
        } else if (cancelledWithPayments && canTakeMoney) {
            setMode("refund");
        } else {
            setMode("payment");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId, canTakeMoney]);

    // If current mode tab disappears (e.g. handover finishes), fall back to payment.
    useEffect(() => {
        if (!modeOptions.some((o) => o.value === mode)) setMode("payment");
    }, [mode, modeOptions]);

    if (isOrderLoading && !order) return <DetailSkeleton onBack={onBack} />;

    if (!order) {
        const errorMessage = searchResult?.status === "error" ? searchResult.message : "Order not found";
        return (
            <div className="p-4">
                <Alert variant="destructive" className="py-2 mb-4">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                        {errorMessage}
                        <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={onBack}>Back to list</Button>
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col" style={{ animation: "cashier-focus-in 250ms cubic-bezier(0.2, 0, 0, 1) both" }}>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30 shrink-0">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Orders
                </Button>
                <CustomerHeaderInline order={order} isCancelled={!!isCancelled} />
                <div className="flex-1" />
                {modeOptions.length > 1 && (
                    <SlidingPillSwitcher
                        value={mode}
                        options={modeOptions}
                        onChange={(v) => setMode(v)}
                        size="lg"
                    />
                )}
            </div>

            {/* Banners */}
            <div className="px-4 pt-3 max-w-[1400px] mx-auto w-full">
                {isCancelled && (
                    <Alert variant="destructive" className="mb-3">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>This order has been <strong>cancelled</strong>.</AlertDescription>
                    </Alert>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 lg:overflow-hidden overflow-y-auto px-4 pb-4 max-w-[1400px] mx-auto w-full">
                {mode === "payment" && (
                    canTakeMoney ? (
                        <PaymentMode
                            order={order}
                            orderTotal={orderTotal}
                            totalPaid={totalPaid}
                            advance={advance}
                            remainingBalance={remainingBalance}
                            isFullyPaid={isFullyPaid}
                            transactionsCount={transactions.length}
                            totalPayments={totalPayments}
                            totalRefunds={totalRefunds}
                            onOpenHistory={() => setHistoryOpen(true)}
                            isHomeDelivery={isHomeDelivery}
                            isOrderCompleted={!!isOrderCompleted}
                        />
                    ) : (
                        <RegisterRequiredNotice action="record a payment" onBack={onBack} />
                    )
                )}
                {mode === "handover" && showHandoverTab && (
                    <HandoverMode
                        order={order}
                        garments={garments}
                        isHomeDelivery={isHomeDelivery}
                    />
                )}
                {mode === "refund" && showRefundTab && (
                    canTakeMoney ? (
                        <RefundMode
                            order={order}
                            garments={garments}
                            shelfItems={shelfItems}
                            orderTotal={orderTotal}
                            totalPaid={totalPaid}
                            advance={advance}
                            remainingBalance={remainingBalance}
                            cancelledWithPayments={cancelledWithPayments}
                        />
                    ) : (
                        <RegisterRequiredNotice action="process a refund" onBack={onBack} />
                    )
                )}
            </div>

            {/* Payment history sheet */}
            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
                <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Payment history ({transactions.length})</SheetTitle>
                    </SheetHeader>
                    <div className="px-4 pb-6">
                        <PaymentHistory
                            transactions={transactions}
                            orderType={order.order_type as "WORK" | "SALES" | "ALTERATION"}
                            invoiceData={invoiceData}
                            alterationData={isAlteration ? alterationInvoiceData : undefined}
                        />
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

// Shown in the payment/refund modes when the register can't take money (no open
// session for today). Handover stays available — only money is gated (SPEC §3).
function RegisterRequiredNotice({ action, onBack }: { action: string; onBack: () => void }) {
    return (
        <div className="h-full flex items-center justify-center p-6">
            <Card className="max-w-md w-full p-6 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                    <Info className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="text-base font-semibold">Register not open</h3>
                <p className="text-sm text-muted-foreground">
                    Open today's register to {action}. You can still hand over or
                    deliver this order without an open register.
                </p>
                <Button variant="outline" size="sm" onClick={onBack}>
                    Go to register
                </Button>
            </Card>
        </div>
    );
}

function CustomerHeaderInline({ order, isCancelled }: { order: Order; isCancelled: boolean }) {
    const phone = order.customer?.phone;
    const countryCode = order.customer?.country_code || "+965";
    const phaseLabel = order.order_phase
        ? ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || order.order_phase
        : null;

    return (
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex flex-col leading-tight">
                <span className="font-bold text-lg truncate">{order.customer?.name || "N/A"}</span>
                <span className="text-xs text-muted-foreground tabular-nums truncate">
                    {phone ? `${countryCode} ${phone}` : "-"}
                </span>
            </div>
            <span className="font-bold text-base tabular-nums shrink-0">#{order.id}</span>
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md border border-border shrink-0">
                {order.order_type === "WORK" ? "Work" : order.order_type === "ALTERATION" ? "Alteration" : "Sales"}
            </span>
            {isCancelled && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive shrink-0">
                    Cancelled
                </span>
            )}
            {order.delivery_date && (
                <span className="text-[11px] tabular-nums shrink-0 flex items-center gap-0.5 font-semibold text-foreground">
                    <CalendarDays className="h-3 w-3" />Due {shortDateFmt.format(parseUtcTimestamp(order.delivery_date.toString()))}
                </span>
            )}
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0 text-muted-foreground hover:text-foreground">
                        <Info className="h-3.5 w-3.5 mr-1" />Details
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-3">
                    <div className="space-y-2.5 text-sm">
                        {order.invoice_number && (
                            <DetailRow icon={<Receipt className="h-3.5 w-3.5" />} label="Invoice">
                                <span className="tabular-nums">INV {order.invoice_number}</span>
                            </DetailRow>
                        )}
                        {phaseLabel && (
                            <DetailRow label="Phase">
                                <span>{phaseLabel}</span>
                            </DetailRow>
                        )}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

function DetailRow({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0">
                {icon}
                {label}
            </span>
            <span className="text-sm text-right min-w-0 truncate">{children}</span>
        </div>
    );
}

function DetailSkeleton({ onBack }: { onBack: () => void }) {
    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Orders
                </Button>
                <div className="flex-1" />
                <Skeleton className="h-4 w-12 rounded" />
            </div>
            <div className="flex-1 p-4 max-w-[1400px] mx-auto w-full">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="md:col-span-3 space-y-3">
                        <Card className="p-5 space-y-4">
                            <Skeleton className="h-4 w-24 rounded" />
                            <Skeleton className="h-12 w-48 rounded" />
                            <Separator />
                            <Skeleton className="h-3 w-full rounded" />
                            <Skeleton className="h-3 w-full rounded" />
                        </Card>
                        <Card className="p-4 space-y-3">
                            <Skeleton className="h-4 w-20 rounded" />
                            <Skeleton className="h-14 rounded-lg" />
                        </Card>
                        <Skeleton className="h-14 rounded-lg" />
                    </div>
                    <div className="md:col-span-2 space-y-3">
                        <Skeleton className="h-64 rounded-lg" />
                        <Skeleton className="h-14 rounded-lg" />
                    </div>
                </div>
            </div>
        </div>
    );
}
