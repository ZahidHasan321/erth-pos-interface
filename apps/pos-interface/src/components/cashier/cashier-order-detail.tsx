import { useEffect, useMemo, useState } from "react";
import "./cashier-keyframes";
import {
    ArrowLeft, CalendarDays, CheckCircle2, CreditCard, Hash, Loader2, Package,
    Receipt, Tag, User, XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Separator } from "@repo/ui/separator";
import { Skeleton } from "@repo/ui/skeleton";
import {
    useCashierOrderSearch,
    usePaymentTransactions,
    useCollectGarmentsMutation,
} from "@/hooks/useCashier";
import { useDeliveryEditor } from "@/hooks/useDeliveryEditor";
import { useGarmentCollection } from "@/hooks/useGarmentCollection";
import { PaymentHistory } from "@/components/cashier/payment-history";
import { PaymentSummary } from "@/components/cashier/payment-summary";
import { DiscountControls } from "@/components/cashier/discount-controls";
import { DeliveryAndAddress } from "@/components/cashier/delivery-and-address";
import { OrderItemsSection } from "@/components/cashier/order-items-section";
import { PaymentActionCard } from "@/components/cashier/payment-action-card";
import type { RefundItem } from "@/api/cashier";
import { ORDER_PHASE_LABELS } from "@/lib/constants";

const shortDateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

export function CashierOrderDetailView({ orderId, onBack }: { orderId: string; onBack: () => void }) {
    const { data: searchResult, isFetching: isOrderLoading } = useCashierOrderSearch(orderId);
    const order = searchResult?.status === "success" ? searchResult.data : null;

    const { data: txResult } = usePaymentTransactions(order?.id);
    const txData = txResult?.status === "success" ? txResult.data : [];
    const transactions = Array.isArray(txData) ? txData : [];

    const serverOrderTotal = Number(order?.order_total) || 0;
    const totalPaid = Number(order?.paid) || 0;
    const discountValue = Number(order?.discount_value) || 0;

    const totalPayments = useMemo(() => transactions
        .filter((tx: any) => tx.transaction_type === "payment")
        .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0), 0), [transactions]);
    const totalRefunds = useMemo(() => transactions
        .filter((tx: any) => tx.transaction_type === "refund")
        .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0), 0), [transactions]);

    const isCancelled = order?.checkout_status === "cancelled";
    const isOrderCompleted = order?.order_phase === "completed";
    const cancelledWithPayments = isCancelled && totalPaid > 0;
    const isSalesOrder = order?.order_type === "SALES";
    const serverHomeDelivery = !!(order as any)?.home_delivery;
    const serverDeliveryCharge = Number((order as any)?.delivery_charge) || 0;

    const delivery = useDeliveryEditor({
        orderId: order?.id ?? null,
        serverHomeDelivery,
        serverDeliveryCharge,
    });
    const {
        isHomeDelivery, chargeInput, setChargeInput, optimisticDeliveryCharge,
        isAnyPending, setOptimisticDelivery, toggleDeliveryPending, saveDeliveryPendingIfAny,
        reset: resetDelivery,
    } = delivery;

    const orderTotal = isAnyPending
        ? parseFloat((serverOrderTotal - serverDeliveryCharge + optimisticDeliveryCharge).toFixed(3))
        : serverOrderTotal;
    const remainingBalance = orderTotal - totalPaid;
    const isFullyPaid = remainingBalance <= 0;

    const effectiveOrder = isAnyPending && order
        ? { ...(order as any), order_total: orderTotal, delivery_charge: optimisticDeliveryCharge }
        : order;

    const garments = Array.isArray(order?.garments) ? order.garments : [];
    const shelfItems = Array.isArray(order?.shelf_items) ? order.shelf_items : [];

    // Sales orders never have garments → skip the collection scaffolding entirely
    // so the right-column "Collect Only" card and the "Pay & Collect N" button
    // variant don't ghost-render on sales-order details.
    const eligibleGarments = useMemo(() => isSalesOrder
        ? []
        : garments.filter((g: any) =>
            g.location === "shop" && ["ready_for_pickup", "brova_trialed", "awaiting_trial"].includes(g.piece_stage)
          ),
        [garments, isSalesOrder]);

    const collection = useGarmentCollection({ orderId, eligibleGarments, isHomeDelivery });

    const [isRefundMode, setIsRefundMode] = useState(false);
    const [refundItems, setRefundItems] = useState<RefundItem[]>([]);
    const [refundTotal, setRefundTotal] = useState(0);

    useEffect(() => {
        resetDelivery();
        setIsRefundMode(false);
        setRefundItems([]);
        setRefundTotal(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    const handleRefundModeChange = (val: boolean) => {
        setIsRefundMode(val);
        if (!val) {
            setRefundItems([]);
            setRefundTotal(0);
        }
    };

    const collectGarmentsMutation = useCollectGarmentsMutation();

    const allGarmentsCompleted = useMemo(() => {
        if (garments.length === 0) return true;
        return garments.every((g: any) => g.piece_stage === "completed");
    }, [garments]);

    const advance = useMemo(() => {
        if (!order) return 0;
        const stitching = Number((order as any)?.stitching_charge) || 0;
        const fabric = Number((order as any)?.fabric_charge) || 0;
        const style = Number((order as any)?.style_charge) || 0;
        const express = Number((order as any)?.express_charge) || 0;
        const soaking = Number((order as any)?.soaking_charge) || 0;
        const shelf = Number((order as any)?.shelf_charge) || 0;
        return parseFloat(((stitching * 0.5) + fabric + style + optimisticDeliveryCharge + express + soaking + shelf).toFixed(3));
    }, [order, optimisticDeliveryCharge]);

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

    const showRefundUI = isRefundMode || (isFullyPaid && allGarmentsCompleted) || cancelledWithPayments;

    return (
        <div className="h-full flex flex-col" style={{ animation: "cashier-focus-in 250ms cubic-bezier(0.2, 0, 0, 1) both" }}>
            <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Orders
                </Button>
                <div className="flex-1" />
                <span className="text-sm font-bold tabular-nums text-muted-foreground">#{order.id}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 max-w-[1400px] mx-auto w-full will-change-scroll [transform:translateZ(0)]">
                {isCancelled && (
                    <Alert variant="destructive" className="mb-4">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>This order has been <strong>cancelled</strong>.</AlertDescription>
                    </Alert>
                )}
                {/* For sales orders, "completed" = fully paid; no garment-tracking nuance. */}
                {isSalesOrder && isFullyPaid && !isCancelled && (
                    <Alert className="bg-green-50 border-green-200 mb-4">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">Sale completed — fully paid.</AlertDescription>
                    </Alert>
                )}
                {!isSalesOrder && isOrderCompleted && allGarmentsCompleted && isFullyPaid && !isCancelled && (
                    <Alert className="bg-green-50 border-green-200 mb-4">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">Fully completed — all garments collected and paid.</AlertDescription>
                    </Alert>
                )}

                <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                    <div className="md:col-span-3 space-y-2">
                        <CustomerHeader order={order} isCancelled={isCancelled} />

                        {order.order_type === "WORK" && !isCancelled && (
                            <DeliveryAndAddress
                                order={order}
                                isHomeDelivery={isHomeDelivery}
                                isOrderCompleted={isOrderCompleted}
                                onOptimisticToggle={setOptimisticDelivery}
                                chargeInput={chargeInput}
                                setChargeInput={setChargeInput}
                            />
                        )}

                        <OrderItemsSection
                            order={order}
                            garments={garments}
                            shelfItems={shelfItems}
                            isCancelled={isCancelled}
                            isRefundMode={isRefundMode}
                            showRefundUI={showRefundUI}
                            allGarmentsCompleted={allGarmentsCompleted}
                            isHomeDelivery={isHomeDelivery}
                            totalPaid={totalPaid}
                            selectedIds={collection.selectedIds}
                            fulfillmentModes={collection.fulfillmentModes}
                            onToggle={collection.toggle}
                            onToggleAll={collection.toggleAll}
                            onFulfillmentModeChange={collection.setMode}
                            onRefundItemsChange={(items, total) => { setRefundItems(items); setRefundTotal(total); }}
                        />

                        <Card className="p-3">
                            <h3 className="font-semibold flex items-center gap-2 mb-1.5 text-sm">
                                <Receipt className="h-4 w-4" />Payment History ({transactions.length})
                            </h3>
                            <PaymentHistory transactions={transactions} orderId={order.id}
                                invoiceNumber={order.invoice_number ?? undefined}
                                invoiceRevision={order.invoice_revision ?? 0}
                                orderType={order.order_type as "WORK" | "SALES"}
                                homeDelivery={isHomeDelivery}
                                customerName={order.customer?.name ?? undefined}
                                customerPhone={order.customer?.phone ?? undefined}
                                orderTotal={orderTotal} totalPaid={totalPaid}
                                discountValue={discountValue}
                                garments={garments.map((g: any) => ({
                                    garment_type: g.garment_type, style: g.style,
                                    collar_type: g.collar_type, collar_button: g.collar_button, collar_position: g.collar_position, cuffs_type: g.cuffs_type,
                                    jabzour_1: g.jabzour_1, jabzour_thickness: g.jabzour_thickness,
                                    fabric_length: Number(g.fabric_length) || 0,
                                    fabric_name: g.fabric?.name, express: g.express,
                                    soaking: g.soaking, soaking_hours: g.soaking_hours,
                                    fabric_price_snapshot: Number(g.fabric_price_snapshot) || 0,
                                    stitching_price_snapshot: Number(g.stitching_price_snapshot) || 0,
                                    style_price_snapshot: Number(g.style_price_snapshot) || 0,
                                }))}
                                shelfItems={shelfItems.map((i: any) => ({
                                    name: i.shelf?.type || `Item #${i.shelf_id}`,
                                    brand: i.shelf?.brand, quantity: i.quantity, unit_price: i.unit_price,
                                }))} />
                        </Card>
                    </div>

                    <div className="md:col-span-2 space-y-2.5">
                        <Card className="p-3">
                            <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm">
                                <CreditCard className="h-4 w-4" />Payment Summary
                            </h3>
                            <PaymentSummary order={effectiveOrder} totalPayments={totalPayments} totalRefunds={totalRefunds} />
                        </Card>
                        {!isCancelled && (
                            <Card className={`p-3 ${discountValue > 0 ? "bg-green-50 border-green-300" : ""}`}>
                                <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm">
                                    <Tag className="h-4 w-4" />Discount
                                </h3>
                                <DiscountControls orderId={order.id}
                                    currentDiscountType={(order as any).discount_type}
                                    currentDiscountValue={discountValue}
                                    currentDiscountPercentage={Number((order as any).discount_percentage) || 0}
                                    currentReferralCode={(order as any).referral_code}
                                    orderTotal={orderTotal} totalPaid={totalPaid} />
                            </Card>
                        )}
                        {!isCancelled && !isSalesOrder && collection.selectedIds.size > 0 && (
                            <CollectOnlyCard
                                selectedCount={collection.selectedIds.size}
                                actionLabel={collection.actionLabel}
                                pending={collectGarmentsMutation.isPending || toggleDeliveryPending}
                                onClick={async () => {
                                    try { await saveDeliveryPendingIfAny(); } catch { return; }
                                    collectGarmentsMutation.mutate(
                                        {
                                            orderId: order.id,
                                            garmentIds: Array.from(collection.selectedIds),
                                            fulfillmentOverrides: Object.fromEntries(collection.fulfillmentModes),
                                        },
                                        {
                                            onSuccess: (res) => {
                                                if (res.status === "success") collection.clear();
                                            },
                                        }
                                    );
                                }}
                            />
                        )}
                        <PaymentActionCard
                            orderId={order.id}
                            isCancelled={isCancelled}
                            cancelledWithPayments={cancelledWithPayments}
                            isFullyPaid={isFullyPaid}
                            allGarmentsCompleted={allGarmentsCompleted}
                            isRefundMode={isRefundMode}
                            onRefundModeChange={handleRefundModeChange}
                            orderTotal={orderTotal}
                            totalPaid={totalPaid}
                            advance={advance}
                            remainingBalance={remainingBalance}
                            refundItems={refundItems}
                            refundTotal={refundTotal}
                            selectedCollectIds={isSalesOrder ? new Set() : collection.selectedIds}
                            fulfillmentOverrides={isSalesOrder ? {} : Object.fromEntries(collection.fulfillmentModes)}
                            collectActionLabel={collection.actionLabel}
                            onCollected={collection.clear}
                            onBeforeSubmit={saveDeliveryPendingIfAny}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function CustomerHeader({ order, isCancelled }: { order: any; isCancelled: boolean }) {
    return (
        <div className="bg-card border rounded-xl p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-3 w-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                        <p className="font-bold text-sm truncate leading-tight">{order.customer?.name || "N/A"}</p>
                        <span className="text-[11px] text-muted-foreground shrink-0">{order.customer?.country_code || "+965"} {order.customer?.phone || "—"}</span>
                    </div>
                </div>
                {order.customer?.account_type && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${order.customer.account_type === "Secondary" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-primary/30 bg-primary/5 text-primary"}`}>
                        {order.customer.account_type}
                        {order.customer.account_type === "Secondary" && order.customer.relation && <span className="font-normal"> · {order.customer.relation}</span>}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2.5 flex-wrap text-xs bg-muted/40 rounded-md px-2.5 py-1.5">
                <span className="flex items-center gap-1 font-bold tabular-nums"><Hash className="h-3 w-3 text-muted-foreground" />{order.id}</span>
                {order.invoice_number && <span className="flex items-center gap-1 tabular-nums text-muted-foreground"><Receipt className="h-3 w-3" />INV {order.invoice_number}</span>}
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-border">{order.order_type === "WORK" ? "Work" : "Sales"}</span>
                {order.order_phase && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary/10 text-secondary">{ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || order.order_phase}</span>}
                {isCancelled && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">Cancelled</span>}
                {(order as any).campaign?.name && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">{(order as any).campaign.name}</span>}
                {order.delivery_date && <span className="flex items-center gap-1 text-muted-foreground ml-auto tabular-nums"><CalendarDays className="h-3 w-3" />{shortDateFmt.format(new Date(order.delivery_date))}</span>}
            </div>
        </div>
    );
}

function CollectOnlyCard({ selectedCount, actionLabel, pending, onClick }: {
    selectedCount: number; actionLabel: string; pending: boolean; onClick: () => void;
}) {
    return (
        <Card className="p-3 bg-emerald-50 border-emerald-300">
            <div className="flex items-center justify-between mb-1.5">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                    <Package className="h-4 w-4" />{actionLabel} Only
                </h3>
                <span className="text-xs text-emerald-700 font-medium">
                    {selectedCount} garment{selectedCount !== 1 ? "s" : ""}
                </span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Hand over garments without recording a payment.</p>
            <Button size="sm" className="w-full h-9 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700"
                disabled={pending} onClick={onClick}>
                {pending
                    ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Processing...</>
                    : `${actionLabel} ${selectedCount} Garment${selectedCount !== 1 ? "s" : ""}`}
            </Button>
        </Card>
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
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                    <div className="md:col-span-3 space-y-2">
                        <Card className="p-3 space-y-3">
                            <div className="flex items-center gap-2.5">
                                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton className="h-4 w-36 rounded" />
                                    <Skeleton className="h-3 w-28 rounded" />
                                </div>
                                <Skeleton className="h-5 w-16 rounded shrink-0" />
                            </div>
                            <Separator />
                            <div className="grid grid-cols-4 gap-3">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="space-y-1">
                                        <Skeleton className="h-2.5 w-10 rounded" />
                                        <Skeleton className="h-4 w-14 rounded" />
                                    </div>
                                ))}
                            </div>
                        </Card>
                        <Card className="p-3 space-y-2.5">
                            <Skeleton className="h-4 w-24 rounded" />
                            <div className="grid grid-cols-2 gap-3">
                                <Skeleton className="h-16 rounded-lg" />
                                <Skeleton className="h-16 rounded-lg" />
                            </div>
                        </Card>
                        <Card className="p-4 space-y-3">
                            <Skeleton className="h-4 w-28 rounded" />
                            <Skeleton className="h-12 rounded-lg" />
                            <Skeleton className="h-12 rounded-lg" />
                        </Card>
                    </div>
                    <div className="md:col-span-2 space-y-2.5">
                        <Card className="p-3 space-y-2">
                            <Skeleton className="h-4 w-32 rounded" />
                            <Skeleton className="h-3 w-full rounded" />
                            <Skeleton className="h-3 w-full rounded" />
                            <Skeleton className="h-3 w-3/4 rounded" />
                            <Skeleton className="h-5 w-full rounded mt-1" />
                        </Card>
                        <Card className="p-3 space-y-2">
                            <Skeleton className="h-4 w-20 rounded" />
                            <Skeleton className="h-8 w-full rounded" />
                        </Card>
                        <Card className="p-3 space-y-2">
                            <Skeleton className="h-4 w-28 rounded" />
                            <Skeleton className="h-9 w-full rounded" />
                            <Skeleton className="h-9 w-full rounded" />
                            <Skeleton className="h-10 w-full rounded" />
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
