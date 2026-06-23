import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Hammer, Loader2, Minus, Plus, Settings2, Store } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Textarea } from "@repo/ui/textarea";
import { useAuth } from "@/context/auth";
import { adjustStock } from "@/api/stockMovements";
import {
  ADJUSTMENT_REASONS_ADD,
  ADJUSTMENT_REASONS_REMOVE,
  formatQty,
  getQtyStep,
  getReasonLabel,
  getUnitSuffix,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { Field, LocationOption } from "./dialog-bits";
import type { StockItemType, StockLocation, UnitOfMeasure } from "@repo/database";

type Props = {
  open: boolean;
  onClose: () => void;
  itemType: StockItemType;
  itemId: number;
  itemName: string;
  defaultLocation: StockLocation;
  currentStock: number;
  unit?: UnitOfMeasure | null;
};

export function AdjustStockDialog({ open, onClose, itemType, itemId, itemName, defaultLocation, currentStock, unit }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  // Fabric + shelf live only in shop stock — the workshop never holds them
  // (SPEC §4). Only accessories cross both sides, so only they get the toggle.
  const crossesSides = itemType === "accessory";
  const [location, setLocation] = useState<StockLocation>(crossesSides ? defaultLocation : "shop");
  const [delta, setDelta] = useState(0);
  const [deltaInput, setDeltaInput] = useState("0");
  const [reasonValue, setReasonValue] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Reset delta when item or location changes (current stock context shifts)
  useEffect(() => {
    if (open) {
      setDelta(0);
      setDeltaInput("0");
      setReasonValue("");
      setNotes("");
    }
  }, [open, itemId, location]);

  const step = getQtyStep(itemType, unit);
  const suffix = getUnitSuffix(itemType, unit);
  const direction: "add" | "remove" | "none" = delta > 0 ? "add" : delta < 0 ? "remove" : "none";
  const newQty = +(currentStock + delta).toFixed(2);
  const reasons = direction === "add" ? ADJUSTMENT_REASONS_ADD : direction === "remove" ? ADJUSTMENT_REASONS_REMOVE : [];
  const isOtherReason = reasonValue === "other_add" || reasonValue === "other_remove";

  const adjustMut = useMutation({
    mutationFn: () => {
      const reason = isOtherReason ? notes.trim() : getReasonLabel(reasonValue);
      return adjustStock({
        itemType,
        itemId,
        location,
        newQty,
        reason,
        notes: isOtherReason ? undefined : notes.trim() || undefined,
        userId: user?.id ?? null,
      });
    },
    onSuccess: (data) => {
      const diff = data.new_stock - data.old_stock;
      const sign = diff > 0 ? "+" : "";
      toast.success(`Adjusted ${sign}${formatQty(itemType, diff, unit)} · ${itemName} now ${formatQty(itemType, data.new_stock, unit)}`);
      qc.invalidateQueries({ queryKey: [itemType === "fabric" ? "fabrics" : itemType === "shelf" ? "shelf" : "accessories"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      onClose();
    },
    onError: (err: unknown) => toast.error(`Adjustment failed: ${err instanceof Error ? err.message : String(err)}`),
  });

  function bumpDelta(direction: 1 | -1) {
    const next = +(delta + direction * step).toFixed(2);
    if (currentStock + next < 0) return; // can't go below zero
    setDelta(next);
    setDeltaInput(String(next));
  }

  function commitInput(raw: string) {
    setDeltaInput(raw);
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const clamped = currentStock + n < 0 ? -currentStock : n;
      setDelta(+clamped.toFixed(2));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (delta === 0) {
      toast.error("Use + or − to change the stock");
      return;
    }
    if (newQty < 0) {
      toast.error("Cannot reduce below zero");
      return;
    }
    if (!reasonValue) {
      toast.error("Choose a reason for the adjustment");
      return;
    }
    if (isOtherReason && !notes.trim()) {
      toast.error("Describe the reason");
      return;
    }
    adjustMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-amber-600" />
            Adjust stock: {itemName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-6">
            {crossesSides && (
              <Field label="Location">
                <div className="grid grid-cols-2 gap-2">
                  <LocationOption icon={Store} label="Shop" active={location === "shop"} onClick={() => setLocation("shop")} />
                  <LocationOption icon={Hammer} label="Workshop" active={location === "workshop"} onClick={() => setLocation("workshop")} />
                </div>
              </Field>
            )}

            <Field label="Change" hint={`Current: ${formatQty(itemType, currentStock, unit)}`}>
              <div className="flex items-stretch rounded-lg border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
                <button
                  type="button"
                  className="px-3 hover:bg-red-50 text-red-600 transition-colors border-r"
                  onClick={() => bumpDelta(-1)}
                  aria-label="Remove stock"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="flex-1 relative">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={step}
                    value={deltaInput}
                    onChange={(e) => commitInput(e.target.value)}
                    onBlur={() => setDeltaInput(String(delta))}
                    className={cn(
                      "h-12 border-0 rounded-none text-center text-xl font-bold tabular-nums focus-visible:ring-0 pr-12",
                      direction === "add" && "text-green-700",
                      direction === "remove" && "text-red-700",
                    )}
                    placeholder="0"
                  />
                  {suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                      {suffix}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="px-3 hover:bg-green-50 text-green-600 transition-colors border-l"
                  onClick={() => bumpDelta(1)}
                  aria-label="Add stock"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2.5 text-sm tabular-nums rounded-lg bg-muted/40 px-3 py-2">
                <span className="text-muted-foreground">{formatQty(itemType, currentStock, unit)}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold">{formatQty(itemType, newQty, unit)}</span>
                {direction !== "none" && (
                  <span
                    className={cn(
                      "ml-auto font-semibold text-xs px-2 py-0.5 rounded-md",
                      direction === "add" && "bg-green-100 text-green-700",
                      direction === "remove" && "bg-red-100 text-red-700",
                    )}
                  >
                    {delta > 0 ? "+" : ""}
                    {formatQty(itemType, delta, unit)}
                  </span>
                )}
              </div>
            </Field>

            <Field label="Reason" hint={direction === "none" ? "Set a change first" : "Required"}>
              <Select value={reasonValue} onValueChange={setReasonValue} disabled={direction === "none"}>
                <SelectTrigger>
                  <SelectValue placeholder={direction === "none" ? "-" : "Choose a reason"} />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={isOtherReason ? "Describe reason" : "Notes"} hint={isOtherReason ? "Required" : "Optional"}>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isOtherReason ? "What happened?" : "Any extra detail"}
                className="resize-none"
                required={isOtherReason}
              />
            </Field>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={adjustMut.isPending || direction === "none"}
              className={cn(
                direction === "remove" && "bg-red-600 hover:bg-red-700",
                direction === "add" && "bg-green-600 hover:bg-green-700",
              )}
            >
              {adjustMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {direction === "none"
                ? "Apply adjustment"
                : `${direction === "add" ? "Add" : "Remove"} ${formatQty(itemType, Math.abs(delta), unit)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
