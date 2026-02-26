"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Link as LinkIcon, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Separator } from "../ui/separator";
import { cn } from "@/lib/utils";

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
      "bg-card p-5 rounded-xl border-2 shadow-sm transition-all sticky top-24 py-0 gap-0",
      hasOrders ? "border-primary/30" : "border-border opacity-60"
    )}>
      <div className="space-y-3 py-5">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <CalendarIcon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest">Global Revise Date</h3>
            <p className="text-[9px] font-bold text-muted-foreground uppercase">Sync all delivery dates</p>
          </div>
        </div>

        <div className="space-y-3">
          <Calendar
            mode="single"
            selected={reviseDate}
            onSelect={setReviseDate}
            className="rounded-md border-2 border-border/40 w-full"
            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
          />

          <div className="space-y-2.5 pt-1">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
              <span className="text-muted-foreground">Primary Order</span>
              <span className={cn(primaryOrderId ? "text-primary" : "text-destructive")}>
                {primaryOrderId ? `Order #${primaryOrderId}` : "Required"}
              </span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
              <span className="text-muted-foreground">Revise Date</span>
              <span className={cn(reviseDate ? "text-primary" : "text-destructive")}>
                {reviseDate ? format(reviseDate, "PP") : "Required"}
              </span>
            </div>

            <Separator />

            <Button
              className="w-full h-11 font-black uppercase tracking-widest shadow-lg shadow-primary/20"
              onClick={handleLinkClick}
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <LinkIcon className="w-4 h-4 mr-2" />
              )}
              Link & Update Group
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
