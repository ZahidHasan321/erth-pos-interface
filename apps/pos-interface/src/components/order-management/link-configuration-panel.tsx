"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Link as LinkIcon, RefreshCw } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Calendar } from "@repo/ui/calendar";
import { cn, getKuwaitMidnight } from "@/lib/utils";

type LinkConfigurationPanelProps = {
  hasOrders: boolean;
  primaryOrderId: number | null;
  onLinkOrders: (reviseDate: Date) => Promise<void>;
  isSubmitting: boolean;
};

export function LinkConfigurationPanel({
  hasOrders,
  primaryOrderId,
  onLinkOrders,
  isSubmitting,
}: LinkConfigurationPanelProps) {
  const [reviseDate, setReviseDate] = useState<Date | undefined>();

  const canSubmit = hasOrders && !!reviseDate && !!primaryOrderId && !isSubmitting;

  const handleLinkClick = async () => {
    if (reviseDate) {
      await onLinkOrders(reviseDate);
    }
  };

  return (
    <div className={cn(
      "bg-card rounded-xl border shadow-none transition-all sticky top-20",
      hasOrders ? "border-primary/20" : "border-border opacity-60"
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b">
        <div className="p-2 bg-primary/10 rounded-lg">
          <CalendarIcon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold">Revised Delivery Date</h3>
          <p className="text-xs text-muted-foreground">Applied to all linked orders</p>
        </div>
      </div>

      {/* Calendar */}
      <div className="px-2 py-3 flex justify-center">
        <Calendar
          mode="single"
          selected={reviseDate}
          onSelect={setReviseDate}
          className="rounded-lg border border-border/40 p-2 [--cell-size:--spacing(8)] w-full"
          disabled={(date) => date < getKuwaitMidnight()}
        />
      </div>

      {/* Summary + action */}
      <div className="px-5 pb-5 space-y-3">
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="font-medium text-muted-foreground">Primary Order</span>
            <span className={cn("font-bold", primaryOrderId ? "text-foreground" : "text-destructive")}>
              {primaryOrderId ? `#${primaryOrderId}` : "Not set"}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-medium text-muted-foreground">Delivery Date</span>
            <span className={cn("font-bold", reviseDate ? "text-foreground" : "text-destructive")}>
              {reviseDate ? format(reviseDate, "d MMM yyyy") : "Not set"}
            </span>
          </div>
        </div>

        <Button
          className="w-full h-10 font-bold"
          onClick={handleLinkClick}
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <LinkIcon className="w-4 h-4 mr-2" />
          )}
          Link Orders
        </Button>
      </div>
    </div>
  );
}
