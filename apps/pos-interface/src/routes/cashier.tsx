import { useState, useCallback, useMemo, useEffect } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
    Search, User, Receipt, Package, CreditCard, Hash, FileText,
    CheckCircle2, XCircle, Calendar, Shirt, Tag, LogOut,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCashierOrderSearch, usePaymentTransactions } from "@/hooks/useCashier";
import { PaymentForm } from "@/components/cashier/payment-form";
import { PaymentHistory } from "@/components/cashier/payment-history";
import { PaymentSummary } from "@/components/cashier/payment-summary";
import { DiscountControls } from "@/components/cashier/discount-controls";
import { GarmentCollection } from "@/components/cashier/garment-collection";
import { ORDER_PHASE_LABELS } from "@/lib/constants";
import { useAuth } from "@/context/auth";
import { router } from "@/router";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import ErthLogo from "@/assets/erth-light.svg";
import SakhtbaLogo from "@/assets/Sakkba.png";

export const Route = createFileRoute("/cashier")({
    component: CashierTerminal,
    beforeLoad: ({ context, location }) => {
        if (!context.auth.isAuthenticated) {
            throw redirect({
                to: "/login",
                search: { redirect: location.href },
            });
        }
    },
    head: () => ({
        meta: [{ title: "Cashier Terminal" }],
    }),
});

function CashierTerminal() {
    const [searchInput, setSearchInput] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [showLogoutDialog, setShowLogoutDialog] = useState(false);
    const auth = useAuth();
    const navigate = useNavigate();

    // Apply brand theme
    const brandKey = auth.user?.userType || "erth";
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove("erth", "sakkba");
        root.classList.add(brandKey);
        return () => { root.classList.remove(brandKey); };
    }, [brandKey]);

    const brandLogo = brandKey === "erth" ? ErthLogo : SakhtbaLogo;

    const { data: searchResult, isLoading: isSearching, isFetching } = useCashierOrderSearch(searchQuery);
    const order = searchResult?.status === "success" ? searchResult.data : null;

    const { data: txResult } = usePaymentTransactions(order?.id);
    const txData = txResult?.status === "success" ? txResult.data : [];
    const transactions = Array.isArray(txData) ? txData : [];

    const handleSearch = useCallback(() => {
        if (searchInput.trim()) {
            setSearchQuery(searchInput.trim());
        }
    }, [searchInput]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleSearch();
    };

    const handleLogout = () => {
        auth.logout().then(() => {
            router.invalidate().finally(() => {
                navigate({ to: "/" });
            });
        });
        setShowLogoutDialog(false);
    };

    const orderTotal = Number(order?.order_total) || 0;
    const totalPaid = Number(order?.paid) || 0;
    const remainingBalance = orderTotal - totalPaid;
    const discountValue = Number(order?.discount_value) || 0;

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

    const garments = Array.isArray(order?.garments) ? order.garments : [];
    const shelfItems = Array.isArray(order?.shelf_items) ? order.shelf_items : [];
    const hasGarments = garments.length > 0;
    const hasShelfItems = shelfItems.length > 0;

    const allGarmentsCompleted = useMemo(() => {
        if (garments.length === 0) return true;
        return garments.every((g: any) => g.piece_stage === "completed");
    }, [garments]);

    // Advance = 50% stitching + 100% (fabric + style + delivery + shelf)
    const advance = useMemo(() => {
        if (!order) return 0;
        const stitching = Number((order as any)?.stitching_charge) || 0;
        const fabric = Number((order as any)?.fabric_charge) || 0;
        const style = Number((order as any)?.style_charge) || 0;
        const delivery = Number((order as any)?.delivery_charge) || 0;
        const shelf = Number((order as any)?.shelf_charge) || 0;
        return parseFloat(((stitching * 0.5) + fabric + style + delivery + shelf).toFixed(3));
    }, [order]);

    const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();

    return (
        <div className="h-screen flex flex-col bg-background">
            {/* Top Bar */}
            <header className="flex items-center gap-3 px-4 py-2.5 border-b bg-card shrink-0">
                <div className="flex items-center gap-2 shrink-0">
                    <img src={brandLogo} alt="Logo" className="h-8 w-8 object-contain" />
                    <h1 className="text-lg font-bold hidden sm:block">Cashier Terminal</h1>
                </div>
                <div className="relative flex-1 max-w-xl">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Order ID, Invoice #, or Phone..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="pl-9"
                    />
                </div>
                <Button onClick={handleSearch} disabled={isSearching || isFetching} size="sm">
                    {isFetching ? "..." : "Search"}
                </Button>
                <div className="ml-auto">
                    <Button variant="ghost" size="sm" onClick={() => setShowLogoutDialog(true)}>
                        <LogOut className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline">Logout</span>
                    </Button>
                </div>
            </header>

            {/* Error message */}
            {searchQuery && searchResult?.status === "error" && (
                <p className="text-sm text-red-500 px-4 pt-2">{searchResult.message}</p>
            )}

            {/* Loading */}
            {isFetching && !order && (
                <div className="flex-1 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="md:col-span-3 space-y-4">
                            <Skeleton className="h-24" />
                            <Skeleton className="h-64" />
                        </div>
                        <div className="md:col-span-2 space-y-4">
                            <Skeleton className="h-48" />
                            <Skeleton className="h-48" />
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            {order && (
                <div className="flex-1 overflow-y-auto p-4">
                    {/* Status Banners */}
                    {isCancelled && (
                        <Alert variant="destructive" className="mb-4">
                            <XCircle className="h-4 w-4" />
                            <AlertDescription>
                                This order has been <strong>cancelled</strong>. No payments or collections can be made.
                            </AlertDescription>
                        </Alert>
                    )}
                    {isOrderCompleted && allGarmentsCompleted && isFullyPaid && !isCancelled && (
                        <Alert className="bg-green-50 border-green-200 mb-4">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800">
                                This order is <strong>fully completed</strong> — all garments collected and fully paid.
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        {/* LEFT PANEL (60%) */}
                        <div className="md:col-span-3 space-y-4">
                            {/* Customer & Order Info */}
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

                            {/* Garments & Shelf Items */}
                            {(hasGarments || hasShelfItems) && (
                                <div className={`grid grid-cols-1 ${hasGarments && hasShelfItems ? "xl:grid-cols-2" : ""} gap-4`}>
                                    {hasGarments && (
                                        <Card className="p-4">
                                            <h3 className="font-semibold flex items-center gap-2 mb-3">
                                                <Shirt className="h-4 w-4" />
                                                Garments ({garments.length})
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
                                                    garments={garments}
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
                                                Shelf Items ({shelfItems.length})
                                            </h3>
                                            <div className="space-y-2">
                                                {shelfItems.map((item: any) => (
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

                            {/* Payment History */}
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
                        </div>

                        {/* RIGHT PANEL (40%) */}
                        <div className="md:col-span-2 space-y-4">
                            {/* Payment Summary */}
                            <Card className="p-4">
                                <h3 className="font-semibold flex items-center gap-2 mb-3">
                                    <CreditCard className="h-4 w-4" />
                                    Payment Summary
                                </h3>
                                <PaymentSummary
                                    order={order}
                                    totalPayments={totalPayments}
                                    totalRefunds={totalRefunds}
                                />
                            </Card>

                            {/* Discount Controls */}
                            {!isCancelled && (
                                <Card className="p-4">
                                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                                        <Tag className="h-4 w-4" />
                                        Discount
                                    </h3>
                                    <DiscountControls
                                        orderId={order.id}
                                        currentDiscountType={(order as any).discount_type}
                                        currentDiscountValue={discountValue}
                                        currentDiscountPercentage={Number((order as any).discount_percentage) || 0}
                                        currentReferralCode={(order as any).referral_code}
                                        orderTotal={orderTotal}
                                    />
                                </Card>
                            )}

                            {/* Payment Form */}
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
                                        advance={advance}
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
                    </div>
                </div>
            )}

            {/* Empty States */}
            {!order && !isFetching && searchQuery && searchResult?.status !== "error" && (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                        <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                        <p>No order found. Try searching by Order ID, Invoice #, or Phone.</p>
                    </div>
                </div>
            )}

            {!searchQuery && !isFetching && (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                        <CreditCard className="h-16 w-16 mx-auto mb-4 opacity-20" />
                        <p className="text-lg">Search for an order to get started</p>
                        <p className="text-sm mt-1">Enter an Order ID, Invoice Number, or Customer Phone</p>
                    </div>
                </div>
            )}

            <ConfirmationDialog
                isOpen={showLogoutDialog}
                onClose={() => setShowLogoutDialog(false)}
                onConfirm={handleLogout}
                title="Confirm Logout"
                description="Are you sure you want to logout?"
                confirmText="Logout"
                cancelText="Cancel"
            />
        </div>
    );
}
