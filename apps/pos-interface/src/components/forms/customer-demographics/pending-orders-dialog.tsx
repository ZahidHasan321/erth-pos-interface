"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { Order } from "@repo/database";
import { Calendar, Package, Trash2, Loader2, Banknote, Truck, Scissors } from "lucide-react";
import { ErrorBoundary } from "@/components/global/error-boundary";
import { cn } from "@/lib/utils";
import { softDeleteOrder } from "@/api/orders";
import { toast } from "sonner";

interface PendingOrdersDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    orders: Order[];
    onSelectOrder: (order: Order) => void;
    onCreateNewOrder?: () => void;
    onOrderDeleted?: () => void; // Added callback
    customerName?: string;
    isLoading?: boolean;
}

const SKELETON_COUNT = 2;

/**
 * Skeleton loader for order cards
 */
const OrderCardSkeleton = () => (
    <div className="p-4 border rounded-xl animate-pulse bg-card">
        <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-muted rounded" />
                <div className="h-6 w-32 bg-muted rounded" />
            </div>
            <div className="h-4 w-24 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="h-4 w-24 bg-muted rounded" />
            ))}
        </div>
    </div>
);

/**
 * Individual order card component
 */
interface OrderCardProps {
    order: Order;
    isSelected: boolean;
    onSelect: (order: Order) => void;
    onDelete?: (orderId: number) => void; // Added
    isDeleting?: boolean; // Added
    formatDate: (dateString?: string) => string;
}

const OrderCard = React.memo<OrderCardProps>(
    ({ order, isSelected, onSelect, onDelete, isDeleting, formatDate }) => {
        const handleClick = React.useCallback(() => {
            if (isDeleting) return;
            onSelect(order);
        }, [order, onSelect, isDeleting]);

        const handleDelete = React.useCallback((e: React.MouseEvent) => {
            e.stopPropagation();
            if (onDelete && order.id) {
                onDelete(order.id);
            }
        }, [order.id, onDelete]);

        const totalAmount = (
            Number(order.fabric_charge || 0) +
            Number(order.stitching_charge || 0) +
            Number(order.style_charge || 0) +
            Number(order.delivery_charge || 0) +
            Number(order.shelf_charge || 0)
        );

        return (
            <div
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={handleClick}
                className={cn(
                    "p-4 border rounded-xl cursor-pointer transition-all relative",
                    isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:bg-muted/30",
                    isDeleting && "opacity-50 pointer-events-none"
                )}
            >
                <div className="flex justify-between items-start mb-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-lg text-foreground">
                                Order #{order.id}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 font-bold uppercase">
                                Draft
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="size-3" />
                            {formatDate(order.order_date || undefined)}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground">Total Due</div>
                            <div className="font-bold text-primary">
                                {totalAmount.toFixed(3)} KWD
                            </div>
                        </div>
                        
                        {order.checkout_status === "draft" && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={handleDelete}
                                disabled={isDeleting}
                            >
                                {isDeleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm border-t border-border/50 pt-3">
                    <div className="flex items-center gap-2">
                        <Scissors className="size-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Fabrics:</span>
                        <span className="font-semibold">{order.num_of_fabrics || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Scissors className="size-3.5 text-muted-foreground opacity-50" />
                        <span className="text-muted-foreground">Rate:</span>
                        <span className="font-semibold">{Number(order.stitching_price || 0).toFixed(0)} KWD</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Truck className="size-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Delivery:</span>
                        <span className="font-semibold capitalize">
                            {order.home_delivery ? "Home" : "Pickup"}
                        </span>
                    </div>
                </div>

                {order.notes && (
                    <div className="mt-3 text-xs text-muted-foreground line-clamp-1 italic">
                        Note: {order.notes}
                    </div>
                )}
            </div>
        );
    },
);

OrderCard.displayName = "OrderCard";

export function PendingOrdersDialog({
    isOpen,
    onOpenChange,
    orders,
    onSelectOrder,
    onCreateNewOrder,
    onOrderDeleted,
    customerName,
    isLoading = false,
}: PendingOrdersDialogProps) {
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const [deletingOrderId, setDeletingOrderId] = React.useState<number | null>(null);
    const [orderToDelete, setOrderToDelete] = React.useState<number | null>(null);

    const handleDeleteOrder = React.useCallback((orderId: number) => {
        setOrderToDelete(orderId);
    }, []);

    const confirmDelete = React.useCallback(async () => {
        if (!orderToDelete) return;
        
        const orderId = orderToDelete;
        setOrderToDelete(null);
        setDeletingOrderId(orderId);
        try {
            const res = await softDeleteOrder(orderId);
            if (res.status === "success") {
                toast.success("Order removed from list");
                onOrderDeleted?.();
            } else {
                toast.error(res.message || "Failed to remove order");
            }
        } catch (error) {
            console.error("Error removing order:", error);
            toast.error("Failed to remove order");
        } finally {
            setDeletingOrderId(null);
        }
    }, [orderToDelete, onOrderDeleted]);

    React.useEffect(() => {
        if (isOpen && orders.length > 0) {
            setSelectedIndex(0);
        }
    }, [isOpen, orders.length]);

    const formatDate = React.useCallback((dateString?: string) => {
        if (!dateString) return "No date";
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
        } catch {
            return "Invalid date";
        }
    }, []);

    const handleSelectOrder = React.useCallback(
        (order: Order) => {
            onSelectOrder(order);
            onOpenChange(false);
        },
        [onSelectOrder, onOpenChange],
    );

    React.useEffect(() => {
        if (!isOpen || isLoading || orders.length === 0) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setSelectedIndex((prev) => (prev + 1) % orders.length);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setSelectedIndex(
                        (prev) => (prev - 1 + orders.length) % orders.length,
                    );
                    break;
                case "Enter":
                    e.preventDefault();
                    if (orders[selectedIndex]) {
                        handleSelectOrder(orders[selectedIndex]);
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    onOpenChange(false);
                    break;
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [
        isOpen,
        isLoading,
        orders,
        selectedIndex,
        handleSelectOrder,
        onOpenChange,
    ]);

    const hasOrders = orders.length > 0;

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent
                    className="max-w-3xl max-h-[80vh] overflow-y-auto"
                    aria-describedby="pending-orders-description"
                >
                    <ErrorBoundary
                        fallback={
                            <div className="p-4 text-destructive">
                                Failed to load pending orders dialog
                            </div>
                        }
                    >
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold">
                                Pending Orders Found
                            </DialogTitle>
                            <DialogDescription id="pending-orders-description">
                                {customerName ? `${customerName} has ` : "This customer has "}
                                {isLoading ? "..." : orders.length} pending{" "}
                                {orders.length === 1 ? "order" : "orders"}. Would you like to
                                continue an existing order?
                            </DialogDescription>
                        </DialogHeader>

                        <div
                            className="space-y-3 my-4 min-h-50"
                            role="listbox"
                            aria-label="Pending orders list"
                        >
                            {isLoading ? (
                                [...Array(SKELETON_COUNT)].map((_, index) => (
                                    <OrderCardSkeleton key={`skeleton-${index}`} />
                                ))
                            ) : hasOrders ? (
                                orders.map((order, index) => (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        isSelected={selectedIndex === index}
                                        onSelect={handleSelectOrder}
                                        onDelete={handleDeleteOrder}
                                        isDeleting={deletingOrderId === order.id}
                                        formatDate={formatDate}
                                    />
                                ))
                            ) : (
                                <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                                    <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                    <p>No pending orders found</p>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="flex justify-end gap-4">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            {onCreateNewOrder && (
                                <Button
                                    onClick={onCreateNewOrder}
                                    disabled={isLoading}
                                >
                                    Create New Order
                                </Button>
                            )}
                        </DialogFooter>
                    </ErrorBoundary>
                </DialogContent>
            </Dialog>

            <ConfirmationDialog
                isOpen={orderToDelete !== null}
                onClose={() => setOrderToDelete(null)}
                onConfirm={confirmDelete}
                title="Remove Pending Order"
                description="Are you sure you want to remove this pending order? This action cannot be undone."
                confirmText="Remove"
            />
        </>
    );
}
