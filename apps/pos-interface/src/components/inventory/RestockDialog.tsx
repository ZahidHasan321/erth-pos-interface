import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownToLine, ImagePlus, Loader2, Minus, Plus, Store, Hammer, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Textarea } from "@repo/ui/textarea";
import { useAuth } from "@/context/auth";
import { restockItem } from "@/api/stockMovements";
import { uploadRestockInvoice } from "@/lib/storage";
import { formatQty, getQtyStep, getUnitSuffix } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { SupplierCombobox } from "./SupplierCombobox";
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

export function RestockDialog({ open, onClose, itemType, itemId, itemName, defaultLocation, currentStock, unit }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [qty, setQty] = useState("");
  // Fabric + shelf live only in shop stock — the workshop never holds them
  // (SPEC §4). Only accessories cross both sides, so only they get the toggle.
  const crossesSides = itemType === "accessory";
  const [location, setLocation] = useState<StockLocation>(crossesSides ? defaultLocation : "shop");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [invoice, setInvoice] = useState<File | null>(null);
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const invoiceRef = useRef<HTMLInputElement>(null);

  const step = getQtyStep(itemType, unit);
  const suffix = getUnitSuffix(itemType, unit);
  const parsedQty = Number(qty || 0);
  const newTotal = currentStock + (Number.isFinite(parsedQty) ? parsedQty : 0);

  const restockMut = useMutation({
    mutationFn: async () => {
      let imageUrl: string | null = null;
      if (invoice) {
        const up = await uploadRestockInvoice(invoice, itemType, itemId);
        imageUrl = up.url;
      }
      return restockItem({
        itemType,
        itemId,
        location,
        qty: parsedQty,
        supplierId,
        unitCost: unitCost ? Number(unitCost) : null,
        notes: notes.trim() || undefined,
        imageUrl,
        userId: user?.id ?? null,
      });
    },
    onSuccess: (data) => {
      toast.success(`Restocked +${formatQty(itemType, parsedQty, unit)} · ${itemName} now ${formatQty(itemType, data.new_stock, unit)}`);
      qc.invalidateQueries({ queryKey: [itemType === "fabric" ? "fabrics" : itemType === "shelf" ? "shelf" : "accessories"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      reset();
      onClose();
    },
    onError: (err: unknown) => toast.error(`Restock failed: ${err instanceof Error ? err.message : String(err)}`),
  });

  function reset() {
    setQty("");
    setSupplierId(null);
    setUnitCost("");
    setNotes("");
    clearInvoice();
  }

  function onPickInvoice(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (invoicePreview) URL.revokeObjectURL(invoicePreview);
    setInvoice(f);
    setInvoicePreview(URL.createObjectURL(f));
  }

  function clearInvoice() {
    if (invoicePreview) URL.revokeObjectURL(invoicePreview);
    setInvoice(null);
    setInvoicePreview(null);
    if (invoiceRef.current) invoiceRef.current.value = "";
  }

  function bumpQty(direction: 1 | -1) {
    const current = Number.isFinite(parsedQty) ? parsedQty : 0;
    const next = Math.max(0, +(current + direction * step).toFixed(2));
    setQty(next === 0 ? "" : String(next));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsedQty || parsedQty <= 0) {
      toast.error("Enter a positive quantity to restock");
      return;
    }
    restockMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-4 w-4 text-green-600" />
            Restock {itemName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-6">
            {/* Location toggle — accessories only (fabric/shelf are shop-only) */}
            {crossesSides && (
              <Section label="Location">
                <div className="grid grid-cols-2 gap-2">
                  <LocationOption
                    icon={Store}
                    label="Shop"
                    active={location === "shop"}
                    onClick={() => setLocation("shop")}
                  />
                  <LocationOption
                    icon={Hammer}
                    label="Workshop"
                    active={location === "workshop"}
                    onClick={() => setLocation("workshop")}
                  />
                </div>
              </Section>
            )}

            {/* Quantity stepper */}
            <Section label="Quantity received" hint={`Current at ${location}: ${formatQty(itemType, currentStock, unit)}`}>
              <div className="flex items-stretch rounded-lg border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
                <button
                  type="button"
                  className="px-3 hover:bg-muted transition-colors border-r"
                  onClick={() => bumpQty(-1)}
                  aria-label="Decrease"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="flex-1 relative">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={step}
                    min={0}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="h-11 border-0 rounded-none text-center text-lg font-semibold tabular-nums focus-visible:ring-0 pr-12"
                    placeholder="0"
                    autoFocus
                  />
                  {suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                      {suffix}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="px-3 hover:bg-muted transition-colors border-l"
                  onClick={() => bumpQty(1)}
                  aria-label="Increase"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {parsedQty > 0 && (
                <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                  {formatQty(itemType, currentStock, unit)} → <span className="font-semibold text-foreground">{formatQty(itemType, newTotal, unit)}</span>
                  <span className="ml-2 text-green-600 font-medium">+{formatQty(itemType, parsedQty, unit)}</span>
                </p>
              )}
            </Section>

            {/* Supplier */}
            <Section label="Supplier" hint="Optional, skip if delivered internally">
              <SupplierCombobox value={supplierId} onChange={setSupplierId} />
            </Section>

            {/* Optional details */}
            <Section label="Details" hint="Optional">
              <div className="space-y-3">
                <div>
                  <Label htmlFor="rs-cost" className="text-xs text-muted-foreground">Unit cost</Label>
                  <div className="relative mt-1">
                    <Input
                      id="rs-cost"
                      type="number"
                      step="0.001"
                      min="0"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      placeholder="0.000"
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      / {suffix || "unit"}
                    </span>
                  </div>
                </div>
                <div>
                  <Label htmlFor="rs-notes" className="text-xs text-muted-foreground">Reference / notes</Label>
                  <Textarea
                    id="rs-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Invoice #, partial delivery, etc."
                    className="mt-1 resize-none"
                  />
                </div>
              </div>
            </Section>

            {/* Supplier invoice photo */}
            <Section label="Supplier invoice" hint="Optional">
              {invoicePreview ? (
                <div className="relative inline-block">
                  <img
                    src={invoicePreview}
                    alt="Supplier invoice preview"
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-lg border object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearInvoice}
                    aria-label="Remove invoice photo"
                    className="absolute -top-2 -right-2 rounded-full bg-background border p-0.5 text-muted-foreground hover:text-foreground shadow-sm"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => invoiceRef.current?.click()}
                  className="gap-2"
                >
                  <ImagePlus className="h-4 w-4" />
                  Add invoice photo
                </Button>
              )}
              <input
                ref={invoiceRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPickInvoice}
                className="hidden"
                aria-hidden="true"
              />
            </Section>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={restockMut.isPending || !parsedQty}>
              {restockMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Restock {parsedQty > 0 && `+${formatQty(itemType, parsedQty, unit)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-semibold">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function LocationOption({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/5 text-primary"
          : "border-input bg-card hover:bg-muted text-muted-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
