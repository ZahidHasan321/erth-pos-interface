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
import type { Order } from "@repo/database";
import { Calendar, Package } from "lucide-react";
import { ErrorBoundary } from "@/components/global/error-boundary";
import { cn } from "@/lib/utils";

interface PendingOrdersDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    orders: Order[];
    onSelectOrder: (order: Order) => void;
    onCreateNewOrder?: () => void;
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
    formatDate: (dateString?: string) => string;
}

const OrderCard = React.memo<OrderCardProps>(
    ({ order, isSelected, onSelect, formatDate }) => {
        const handleClick = React.useCallback(() => {
            onSelect(order);
        }, [order, onSelect]);

        return (
            <div
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={handleClick}
                className={cn(
                    "p-4 border rounded-xl cursor-pointer transition-all duration-200",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isSelected
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border hover:border-primary/50 hover:bg-accent/10",
                )}
            >
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                        <Package className="w-5 h-5 text-primary" />
                        <span className="font-semibold text-lg text-foreground">
                            Order #{order.id}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {formatDate(order.order_date || undefined)}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    {order.num_of_fabrics !== undefined && (
                        <div className="flex gap-1">
                            <span className="font-medium text-foreground">Fabrics:</span>
                            <span className="text-muted-foreground">
                                {order.num_of_fabrics}
                            </span>
                        </div>
                    )}
                    {order.advance !== undefined && (
                        <div className="flex gap-1">
                            <span className="font-medium text-foreground">Advance:</span>
                            <span className="text-muted-foreground">
                                {order.advance} KWD
                            </span>
                        </div>
                    )}
                    {order.payment_type && (
                        <div className="flex gap-1">
                            <span className="font-medium text-foreground">Payment:</span>
                            <span className="text-muted-foreground">
                                {order.payment_type}
                            </span>
                        </div>
                    )}
                    {order.home_delivery !== undefined && (
                        <div className="flex gap-1">
                            <span className="font-medium text-foreground">Delivery:</span>
                            <span className="text-muted-foreground">
                                {order.home_delivery ? "Home" : "Pickup"}
                            </span>
                        </div>
                    )}
                </div>

                {order.notes && (
                    <div className="mt-2 pt-2 border-t border-border/60">
                        <span className="text-xs font-medium text-foreground">Notes:</span>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {order.notes}
                        </p>
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
    customerName,
    isLoading = false,
}: PendingOrdersDialogProps) {
    const [selectedIndex, setSelectedIndex] = React.useState(0);

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
    );
}
