import { Package, CreditCard, TrendingUp, Wallet, ChevronDown, CalendarDays } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type OrderInfoCardProps = {
  orderID?: string | number;
  fatoura?: number;
  checkoutStatus?: string;
  customerName?: string;
  orderType: "Work Order" | "Sales Order";
  homeDelivery?: boolean;
  paymentType?: string;
  numOfFabrics?: number;
  totalAmount?: number;
  advance?: number;
  balance?: number;
  deliveryDate?: string | null;
  initialExpanded?: boolean;
};

export function OrderInfoCard({
  orderID,
  fatoura,
  checkoutStatus,
  customerName,
  orderType,
  homeDelivery,
  paymentType,
  numOfFabrics,
  totalAmount,
  advance,
  balance,
  deliveryDate,
  initialExpanded = false,
}: OrderInfoCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const getStatusColor = (status?: string) => {
    switch (status) {
      case "confirmed":
        return "text-primary font-semibold";
      case "cancelled":
        return "text-destructive font-semibold";
      case "draft":
        return "text-secondary font-semibold";
      default:
        return "text-muted-foreground font-medium";
    }
  };

  const formatStatus = (status?: string) => {
    switch (status) {
      case "confirmed":
        return "Confirmed";
      case "cancelled":
        return "Cancelled";
      case "draft":
        return "Draft";
      default:
        return status ?? "Draft";
    }
  };

  const formatPaymentType = (type?: string) => {
    if (!type) return "Not set";
    const formatted = type.replace(/-/g, " ");
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  return (
    <div className="absolute right-2.5 flex justify-end mt-2">
      <div className={cn(
        "bg-linear-to-br from-card to-accent/20 px-4 pt-3 shadow-lg rounded-xl z-10 border border-border/60 w-72 mr-4 backdrop-blur-sm overflow-hidden transition-all duration-200",
        isExpanded ? "pb-4" : "pb-3"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between gap-2",
          isExpanded && "pb-1.5 border-b border-border/50"
        )}>
          <h2 className="text-base font-bold tracking-tight text-primary">
            {orderType} <span className="text-secondary">#{orderID || "New"}</span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 w-6 p-0 hover:bg-accent/30"
          >
            <motion.div
              animate={{ rotate: isExpanded ? 0 : 180 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.div>
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 6 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
              className="space-y-1.5 overflow-hidden"
            >
              {/* Status */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground min-w-16">Status:</span>
                <span className={cn("text-xs", getStatusColor(checkoutStatus))}>
                  {formatStatus(checkoutStatus)}
                </span>
              </div>

              {/* Customer */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground min-w-16">Customer:</span>
                <span className="text-xs font-semibold text-foreground truncate">
                  {customerName || "No customer yet"}
                </span>
              </div>

              {/* Fatoura Number */}
              {fatoura && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground min-w-16">Invoice #:</span>
                  <span className="text-xs font-bold text-primary">
                    {fatoura}
                  </span>
                </div>
              )}

              {/* Delivery Type */}
              {homeDelivery !== undefined && (
                <div className="flex items-center gap-2">
                  <Package className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground min-w-16">Delivery:</span>
                  <span className="text-xs font-medium text-foreground">
                    {homeDelivery ? "Home Delivery" : "Pick Up"}
                  </span>
                </div>
              )}

              {/* Delivery Date */}
              {deliveryDate && (
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground min-w-16">Delivery:</span>
                  <span className="text-xs font-medium text-foreground">
                    {new Date(deliveryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              )}

              {/* Payment Type */}
              {paymentType && (
                <div className="flex items-center gap-2">
                  <CreditCard className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground min-w-16">Payment:</span>
                  <span className="text-xs font-medium text-foreground truncate">{formatPaymentType(paymentType)}</span>
                </div>
              )}

              {/* Number of Fabrics (Work Orders only) */}
              {orderType === "Work Order" && numOfFabrics !== undefined && numOfFabrics > 0 && (
                <div className="flex items-center gap-2">
                  <Package className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground min-w-16">Fabrics:</span>
                  <span className="text-xs font-medium text-foreground">{numOfFabrics || 0}</span>
                </div>
              )}

              {/* Financial Info */}
              {(totalAmount !== undefined && totalAmount > 0) || (advance !== undefined && advance > 0) || (balance !== undefined && balance > 0) ? (
                <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                  {totalAmount !== undefined && totalAmount > 0 && (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-3 h-3 text-primary" />
                      <span className="text-xs text-muted-foreground min-w-16">Total:</span>
                      <span className="text-xs font-bold text-primary">{totalAmount.toFixed(2)} KWD</span>
                    </div>
                  )}
                  {advance !== undefined && advance > 0 && (
                    <div className="flex items-center gap-2">
                      <Wallet className="w-3 h-3 text-secondary" />
                      <span className="text-xs text-muted-foreground min-w-16">Advance:</span>
                      <span className="text-xs font-semibold text-secondary">{advance.toFixed(2)} KWD</span>
                    </div>
                  )}
                  {balance !== undefined && balance > 0 && (
                    <div className="flex items-center gap-2">
                      <Wallet className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground min-w-16">Balance:</span>
                      <span className="text-sm font-medium text-foreground">{balance.toFixed(2)} KWD</span>
                    </div>
                  )}
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
