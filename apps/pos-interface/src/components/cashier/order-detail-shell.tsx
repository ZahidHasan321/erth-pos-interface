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
import { PaymentMode } from "@/components/cashier/payment-mode";
import { HandoverMode } from "@/components/cashier/handover-mode";
import { RefundMode } from "@/components/cashier/refund-mode";
import { ORDER_PHASE_LABELS } from "@/lib/constants";
import type { Order, Garment, OrderShelfItem } from "@repo/database";
import "./cashier-keyframes";

type GarmentWithFabric = Garment & { fabric?: { id: number; name: string } | null };
type ShelfItemWithShelf = OrderShelfItem & { shelf?: { type: string; brand: string } | null };

type Mode = "payment" | "handover" | "refund";


const shortDateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

export function OrderDetailShell({ orderId, onBack }: { orderId: string; onBack: () => void }) {
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
    const isHomeDelivery = !!order?.home_delivery;
    const serverDeliveryCharge = Number(order?.delivery_charge) || 0;

    const remainingBalance = orderTotal - totalPaid;
    const isFullyPaid = remainingBalance <= 0;

    const garments = Array.isArray(order?.garments) ? order.garments : [];
    const shelfItems = Array.isArray(order?.shelf_items) ? order.shelf_items : [];

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
    useEffect(() => {
        setHistoryOpen(false);
        if (isFullyPaid && eligibleGarments.length > 0 && showHandoverTab) {
            setMode("handover");
        } else if (cancelledWithPayments) {
            setMode("refund");
        } else {
            setMode("payment");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

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
                )}
                {mode === "handover" && showHandoverTab && (
                    <HandoverMode
                        order={order}
                        garments={garments}
                        isHomeDelivery={isHomeDelivery}
                    />
                )}
                {mode === "refund" && showRefundTab && (
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
                            orderId={order.id}
                            invoiceNumber={order.invoice_number ?? undefined}
                            invoiceRevision={order.invoice_revision ?? 0}
                            orderType={order.order_type as "WORK" | "SALES"}
                            homeDelivery={isHomeDelivery}
                            customerName={order.customer?.name ?? undefined}
                            customerPhone={order.customer?.phone ?? undefined}
                            orderTotal={orderTotal}
                            totalPaid={totalPaid}
                            discountValue={discountValue}
                            garments={(garments as GarmentWithFabric[]).map((g) => ({
                                garment_type: g.garment_type, style: g.style,
                                collar_type: g.collar_type, collar_button: g.collar_button, collar_position: g.collar_position, cuffs_type: g.cuffs_type,
                                jabzour_1: g.jabzour_1, jabzour_thickness: g.jabzour_thickness,
                                fabric_length: Number(g.fabric_length) || 0,
                                fabric_name: g.fabric?.name, express: g.express,
                                soaking: g.soaking, soaking_hours: g.soaking_hours,
                                fabric_price_snapshot: Number(g.fabric_price_snapshot) || 0,
                                stitching_price_snapshot: Number(g.stitching_price_snapshot) || 0,
                                style_price_snapshot: Number(g.style_price_snapshot) || 0,
                            })) as Parameters<typeof PaymentHistory>[0]["garments"]}
                            shelfItems={(shelfItems as ShelfItemWithShelf[]).map((i) => ({
                                name: i.shelf?.type || `Item #${i.shelf_id}`,
                                brand: i.shelf?.brand, quantity: i.quantity, unit_price: i.unit_price,
                            })) as Parameters<typeof PaymentHistory>[0]["shelfItems"]}
                        />
                    </div>
                </SheetContent>
            </Sheet>
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
                    {phone ? `${countryCode} ${phone}` : "—"}
                </span>
            </div>
            <span className="font-bold text-base tabular-nums shrink-0">#{order.id}</span>
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md border border-border shrink-0">
                {order.order_type === "WORK" ? "Work" : "Sales"}
            </span>
            {isCancelled && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive shrink-0">
                    Cancelled
                </span>
            )}
            {order.delivery_date && (
                <span className="text-[11px] tabular-nums shrink-0 flex items-center gap-0.5 font-semibold text-foreground">
                    <CalendarDays className="h-3 w-3" />Due {shortDateFmt.format(new Date(order.delivery_date.toString()))}
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
