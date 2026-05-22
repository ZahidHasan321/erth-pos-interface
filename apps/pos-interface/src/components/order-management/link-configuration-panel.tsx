"use client";

import { useState } from "react";
import { CalendarDays, Link as LinkIcon, RefreshCw } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Calendar } from "@repo/ui/calendar";
import { getKuwaitMidnight } from "@/lib/utils";

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

  if (!hasOrders) {
    return (
      <div className="rounded-lg border bg-card sticky top-20">
        <div className="py-12 text-center px-4">
          <CalendarDays className="w-6 h-6 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            Revised delivery date
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add orders to choose a shared delivery date
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card sticky top-20">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-foreground">Revised delivery date</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Applied to all linked orders
        </p>
      </div>

      <div className="px-2 py-3 flex justify-center">
        <Calendar
          mode="single"
          selected={reviseDate}
          onSelect={setReviseDate}
          className="rounded-md border border-border/40 p-2 [--cell-size:--spacing(8)] w-full"
          disabled={(date) => date < getKuwaitMidnight()}
        />
      </div>

      <div className="px-4 pb-4">
        <Button className="w-full h-9" onClick={handleLinkClick} disabled={!canSubmit}>
          {isSubmitting ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
          ) : (
            <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
          )}
          Link orders
        </Button>
      </div>
    </div>
  );
}
