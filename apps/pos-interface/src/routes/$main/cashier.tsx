import { useState, useCallback, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, User, Receipt, Package, CreditCard, Hash, FileText, CheckCircle2, XCircle, Calendar, Shirt, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCashierOrderSearch, usePaymentTransactions } from "@/hooks/useCashier";
import { PaymentForm } from "@/components/cashier/payment-form";
import { PaymentHistory } from "@/components/cashier/payment-history";
import { GarmentCollection } from "@/components/cashier/garment-collection";
import { ORDER_PHASE_LABELS } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/$main/cashier")({
    component: CashierPage,
    head: () => ({
        meta: [{ title: "Cashier" }],
    }),
});

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
    flat: "Flat",
    referral: "Referral",
    loyalty: "Loyalty",
    by_value: "By Value",
};

function CashierPage() {
    const [searchInput, setSearchInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");

    const { data: searchResult, isLoading: isSearching, isFetching } = useCashierOrderSearch(searchQuery);
    const order = searchResult?.status === "success" ? searchResult.data : null;

    const { data: txResult } = usePaymentTransactions(order?.id);
    const transactions = txResult?.status === "success" ? txResult.data : [];

    const handleSearch = useCallback(() => {
        if (searchInput.trim()) {
            setSearchQuery(searchInput.trim());
        }
    }, [searchInput]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleSearch();
    };

    const orderTotal = Number(order?.order_total) || 0;
    const totalPaid = Number(order?.paid) || 0;
    const remainingBalance = orderTotal - totalPaid;
    const discountValue = Number(order?.discount_value) || 0;
    const discountPercentage = Number(order?.discount_percentage) || 0;
    const discountType = (order as any)?.discount_type;
    const deliveryCharge = Number((order as any)?.delivery_charge) || 0;
    const fabricCharge = Number((order as any)?.fabric_charge) || 0;
    const styleCharge = Number((order as any)?.style_charge) || 0;
    const subtotal = orderTotal + discountValue;

    const totalPayments = useMemo(() => {
        return transactions
            .filter((tx: any) => tx.transaction_type === "payment")
            .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0), 0);
    }, [transactions]);

    const totalRefunds = useMemo(() => {
        return transactions
            .filter((tx: any) => tx.transaction_type === "refund")
            .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0), 0);
    }, [transactions]);

    const isCancelled = order?.checkout_status === "cancelled";
    const isOrderCompleted = order?.order_phase === "completed";
    const isFullyPaid = remainingBalance <= 0;
    const allGarmentsCompleted = useMemo(() => {
        if (!order?.garments || order.garments.length === 0) return true;
        return order.garments.every((g) => g.piece_stage === "completed");
    }, [order?.garments]);

    const hasGarments = order?.garments && order.garments.length > 0;
    const hasShelfItems = order?.shelf_items && order.shelf_items.length > 0;

    const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();

    return (
        <div className="p-4 space-y-4 max-w-7xl mx-auto">
            {/* Search Bar */}
            <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold flex items-center gap-2 shrink-0">
                    <CreditCard className="h-5 w-5" />
                    Cashier
                </h1>
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by Order ID, Invoice #, or Phone..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="pl-9"
                    />
                </div>
                <Button onClick={handleSearch} disabled={isSearching || isFetching}>
                    {isFetching ? "Searching..." : "Search"}
                </Button>
            </div>

            {searchQuery && searchResult?.status === "error" && (
                <p className="text-sm text-red-500">{searchResult.message}</p>
            )}

            {/* Loading */}
            {isFetching && !order && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                    <Skeleton className="h-64 md:col-span-2" />
                </div>
            )}

            {/* Order Content */}
            {order && (
                <>
                    {/* Status Banners */}
                    {isCancelled && (
                        <Alert variant="destructive">
                            <XCircle className="h-4 w-4" />
                            <AlertDescription>
                                This order has been <strong>cancelled</strong>. No payments or collections can be made.
                            </AlertDescription>
                        </Alert>
                    )}
                    {isOrderCompleted && allGarmentsCompleted && isFullyPaid && !isCancelled && (
                        <Alert className="bg-green-50 border-green-200">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800">
                                This order is <strong>fully completed</strong> — all garments collected and fully paid.
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Row 1: Customer + Order Info — compact context bar */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="p-4">
                            <div className="flex items-start gap-4">
                                <div className="flex-1">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                        <User className="h-3 w-3" /> Customer
                                    </p>
                                    <p className="font-semibold">{order.customer?.name || "N/A"}</p>
                                    <p className="text-sm text-muted-foreground">{order.customer?.phone || "N/A"}</p>
                                </div>
                                <Separator orientation="vertical" className="h-12" />
                                <div className="flex-1">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                        <Receipt className="h-3 w-3" /> Order
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold flex items-center gap-1">
                                            <Hash className="h-3 w-3 text-muted-foreground" />{order.id}
                                        </span>
                                        {order.invoice_number && (
                                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                                                <FileText className="h-3 w-3" />{order.invoice_number}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <Badge variant="outline" className="text-xs">{order.order_type}</Badge>
                                        {order.order_phase && (
                                            <Badge variant="secondary" className="text-xs">
                                                {ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || order.order_phase}
                                            </Badge>
                                        )}
                                        <Badge variant={isCancelled ? "destructive" : "default"} className={`text-xs ${!isCancelled ? "bg-emerald-600" : ""}`}>
                                            {order.checkout_status}
                                        </Badge>
                                        {order.order_date && (
                                            <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(order.order_date).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Payment Summary — next to customer/order for quick financial glance */}
                        <Card className="p-4">
                            <div className="space-y-1.5 text-sm">
                                {/* Charges breakdown */}
                                {(fabricCharge > 0 || styleCharge > 0 || deliveryCharge > 0) && (
                                    <div className="flex gap-4 text-xs text-muted-foreground pb-1">
                                        {fabricCharge > 0 && <span>Fabric: {fmt(fabricCharge)}</span>}
                                        {styleCharge > 0 && <span>Style: {fmt(styleCharge)}</span>}
                                        {deliveryCharge > 0 && <span>Delivery: {fmt(deliveryCharge)}</span>}
                                    </div>
                                )}

                                {discountValue > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Subtotal</span>
                                        <span>{fmt(subtotal)} KD</span>
                                    </div>
                                )}
                                {discountValue > 0 && (
                                    <div className="flex justify-between text-amber-600">
                                        <span className="flex items-center gap-1">
                                            <Tag className="h-3 w-3" />
                                            Discount
                                            {discountType && <span className="text-xs">({DISCOUNT_TYPE_LABELS[discountType] || discountType})</span>}
                                            {discountPercentage > 0 && <span className="text-xs">{discountPercentage}%</span>}
                                        </span>
                                        <span>-{fmt(discountValue)} KD</span>
                                    </div>
                                )}

                                <div className="flex justify-between font-medium">
                                    <span>Order Total</span>
                                    <span>{fmt(orderTotal)} KD</span>
                                </div>

                                <Separator />

                                <div className="flex justify-between text-green-600">
                                    <span>Payments</span>
                                    <span>{fmt(totalPayments)} KD</span>
                                </div>
                                {totalRefunds > 0 && (
                                    <div className="flex justify-between text-red-600">
                                        <span>Refunds</span>
                                        <span>-{fmt(totalRefunds)} KD</span>
                                    </div>
                                )}

                                <Separator />

                                <div className={`flex justify-between font-bold text-base ${remainingBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                                    <span>{remainingBalance <= 0 ? "Fully Paid" : "Remaining"}</span>
                                    <span>{fmt(Math.max(0, remainingBalance))} KD</span>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Row 2: Items — Garments + Shelf Items side by side */}
                    {(hasGarments || hasShelfItems) && (
                        <div className={`grid grid-cols-1 ${hasGarments && hasShelfItems ? "lg:grid-cols-2" : ""} gap-4`}>
                            {hasGarments && (
                                <Card className="p-4">
                                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                                        <Shirt className="h-4 w-4" />
                                        Garments ({order.garments!.length})
                                        {allGarmentsCompleted && (
                                            <Badge className="bg-green-600 ml-auto text-xs">All Completed</Badge>
                                        )}
                                    </h3>
                                    {isCancelled ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                            Order is cancelled. No collection actions available.
                                        </p>
                                    ) : (
                                        <GarmentCollection
                                            garments={order.garments!}
                                            orderId={order.id}
                                            remainingBalance={remainingBalance}
                                        />
                                    )}
                                </Card>
                            )}

                            {hasShelfItems && (
                                <Card className="p-4">
                                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                                        <Package className="h-4 w-4" />
                                        Shelf Items ({order.shelf_items!.length})
                                    </h3>
                                    <div className="space-y-2">
                                        {order.shelf_items!.map((item: any) => (
                                            <div key={item.id} className="flex justify-between items-center text-sm p-2.5 bg-muted/50 rounded-lg">
                                                <div>
                                                    <span className="font-medium">{item.shelf?.type || `Item #${item.shelf_id}`}</span>
                                                    <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                                                </div>
                                                <span className="font-semibold">{fmt(item.unit_price * item.quantity)} KD</span>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* Row 3: Payment History + Payment Form side by side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card className="p-4">
                            <h3 className="font-semibold flex items-center gap-2 mb-3">
                                <Receipt className="h-4 w-4" />
                                Payment History ({transactions.length})
                            </h3>
                            <PaymentHistory
                                transactions={transactions}
                                orderId={order.id}
                                invoiceNumber={order.invoice_number ?? undefined}
                                customerName={order.customer?.name ?? undefined}
                                customerPhone={order.customer?.phone ?? undefined}
                                orderTotal={orderTotal}
                                totalPaid={totalPaid}
                            />
                        </Card>

                        {!isCancelled ? (
                            <Card className="p-4">
                                <h3 className="font-semibold flex items-center gap-2 mb-3">
                                    <CreditCard className="h-4 w-4" />
                                    {isFullyPaid ? "Refund / Additional Payment" : "Record Payment"}
                                </h3>
                                {isFullyPaid && (
                                    <Alert className="mb-4 bg-green-50 border-green-200">
                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                        <AlertDescription className="text-green-800 text-xs">
                                            Fully paid. You can still record refunds or additional payments.
                                        </AlertDescription>
                                    </Alert>
                                )}
                                <PaymentForm
                                    orderId={order.id}
                                    remainingBalance={remainingBalance}
                                    orderTotal={orderTotal}
                                    totalPaid={totalPaid}
                                />
                            </Card>
                        ) : (
                            <Card className="p-4">
                                <h3 className="font-semibold flex items-center gap-2 mb-3">
                                    <CreditCard className="h-4 w-4" />
                                    Payment
                                </h3>
                                <Alert variant="destructive">
                                    <XCircle className="h-4 w-4" />
                                    <AlertDescription>
                                        Order is cancelled. No new payments can be recorded.
                                        {totalPaid > 0 && " Contact a manager to process refunds."}
                                    </AlertDescription>
                                </Alert>
                            </Card>
                        )}
                    </div>
                </>
            )}

            {/* Empty States */}
            {!order && !isFetching && searchQuery && searchResult?.status !== "error" && (
                <div className="text-center py-16 text-muted-foreground">
                    <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No order found. Try searching by Order ID, Invoice #, or Phone.</p>
                </div>
            )}

            {!searchQuery && (
                <div className="text-center py-16 text-muted-foreground">
                    <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-lg">Search for an order to get started</p>
                    <p className="text-sm mt-1">Enter an Order ID, Invoice Number, or Customer Phone</p>
                </div>
            )}
        </div>
    );
}
