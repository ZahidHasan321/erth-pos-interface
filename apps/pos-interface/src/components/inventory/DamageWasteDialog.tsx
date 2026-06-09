import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ImagePlus, Loader2, Minus, Plus, ShieldAlert, X } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Textarea } from "@repo/ui/textarea";
import { useAuth } from "@/context/auth";
import { isAdmin, isManager } from "@/lib/rbac";
import { recordWaste } from "@/api/stockMovements";
import { uploadWastePhoto } from "@/lib/storage";
import {
  WASTE_REASONS,
  WASTE_APPROVAL_THRESHOLD,
  formatQty,
  getQtyStep,
  getUnitSuffix,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";
import type { StockItemType, StockLocation, UnitOfMeasure } from "@repo/database";

type Props = {
  open: boolean;
  onClose: () => void;
  itemType: StockItemType;
  itemId: number;
  itemName: string;
  location: StockLocation;
  currentStock: number;
  unit?: UnitOfMeasure | null;
  /** Per-unit cost basis (item price). Drives the cost impact + manager gate. */
  unitCost?: number | null;
};

export function DamageWasteDialog({
  open,
  onClose,
  itemType,
  itemId,
  itemName,
  location,
  currentStock,
  unit,
  unitCost,
}: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isMgr = isManager(user) || isAdmin(user);

  const [qty, setQty] = useState(0);
  const [qtyInput, setQtyInput] = useState("0");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQty(0);
      setQtyInput("0");
      setReason("");
      setNote("");
      setPhoto(null);
      setPhotoPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open, itemId]);

  const step = getQtyStep(itemType, unit);
  const suffix = getUnitSuffix(itemType, unit);
  const isOther = reason === "other";
  const cost = +(qty * Number(unitCost ?? 0)).toFixed(3);
  const overThreshold = cost >= WASTE_APPROVAL_THRESHOLD;
  const blockedByApproval = overThreshold && !isMgr;
  const newQty = +(currentStock - qty).toFixed(2);

  const mut = useMutation({
    mutationFn: async () => {
      let imageUrl: string | null = null;
      if (photo) {
        const up = await uploadWastePhoto(photo, itemType, itemId);
        imageUrl = up.url;
      }
      return recordWaste({
        itemType,
        itemId,
        location,
        qty,
        reason,
        note: note.trim() || undefined,
        imageUrl,
        unitCost: unitCost ?? null,
        userId: user?.id ?? null,
      });
    },
    onSuccess: (data) => {
      toast.success(
        `Wasted ${formatQty(itemType, qty, unit)} · ${itemName} now ${formatQty(itemType, data.new_stock, unit)}`,
      );
      qc.invalidateQueries({
        queryKey: [itemType === "fabric" ? "fabrics" : itemType === "shelf" ? "shelf" : "accessories"],
      });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      onClose();
    },
    onError: (err: unknown) => toast.error(`Damage/Waste failed: ${err instanceof Error ? err.message : String(err)}`),
  });

  function bump(dir: 1 | -1) {
    const next = +(qty + dir * step).toFixed(2);
    if (next < 0 || next > currentStock) return;
    setQty(next);
    setQtyInput(String(next));
  }

  function commitInput(raw: string) {
    setQtyInput(raw);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) setQty(+Math.min(n, currentStock).toFixed(2));
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  function clearPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (qty <= 0) {
      toast.error("Enter a quantity to waste");
      return;
    }
    if (qty > currentStock) {
      toast.error("Cannot waste more than on hand");
      return;
    }
    if (!reason) {
      toast.error("Choose a reason");
      return;
    }
    if (isOther && !note.trim()) {
      toast.error("Describe the reason");
      return;
    }
    if (blockedByApproval) {
      toast.error("This waste is above the approval threshold. A manager must record it");
      return;
    }
    mut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span className="min-w-0 truncate">Damage / waste: {itemName}</span>
          </DialogTitle>
          <DialogDescription>
            Write off stock that is physically lost or unusable. For count corrections, use Adjust instead.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-6">
            <Field label="Quantity wasted" hint={`On hand: ${formatQty(itemType, currentStock, unit)}`}>
              <div className="flex items-stretch rounded-lg border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
                <button
                  type="button"
                  className="px-3 hover:bg-muted text-muted-foreground transition-colors border-r"
                  onClick={() => bump(-1)}
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="flex-1 relative">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={step}
                    min={0}
                    value={qtyInput}
                    onChange={(e) => commitInput(e.target.value)}
                    onBlur={() => setQtyInput(String(qty))}
                    className="h-12 border-0 rounded-none text-center text-xl font-bold tabular-nums text-red-700 focus-visible:ring-0 pr-12"
                    placeholder="0"
                    aria-label="Quantity wasted"
                  />
                  {suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                      {suffix}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="px-3 hover:bg-red-50 text-red-600 transition-colors border-l"
                  onClick={() => bump(1)}
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {qty > 0 && (
                <div className="flex items-center justify-between gap-2 mt-2.5 text-sm tabular-nums rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-muted-foreground">
                    {formatQty(itemType, currentStock, unit)} → <span className="font-semibold text-foreground">{formatQty(itemType, newQty, unit)}</span>
                  </span>
                  {Number(unitCost ?? 0) > 0 && (
                    <span className={cn("font-semibold", overThreshold ? "text-red-700" : "text-muted-foreground")}>
                      Cost ≈ {cost.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </Field>

            <Field label="Reason" hint="Required">
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="What happened?" />
                </SelectTrigger>
                <SelectContent>
                  {WASTE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={isOther ? "Describe reason" : "Notes"} hint={isOther ? "Required" : "Optional"}>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={isOther ? "What happened?" : "Any extra detail…"}
                className="resize-none"
                required={isOther}
              />
            </Field>

            <Field label="Photo" hint="Optional">
              {photoPreview ? (
                <div className="relative inline-block">
                  <img
                    src={photoPreview}
                    alt="Damage evidence preview"
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-lg border object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    aria-label="Remove photo"
                    className="absolute -top-2 -right-2 rounded-full bg-background border p-0.5 text-muted-foreground hover:text-foreground shadow-sm"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="gap-2"
                >
                  <ImagePlus className="h-4 w-4" />
                  Add photo
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPickPhoto}
                className="hidden"
                aria-hidden="true"
              />
            </Field>

            {blockedByApproval && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" aria-live="polite">
                <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <span>
                  This is over the {WASTE_APPROVAL_THRESHOLD} cost threshold, so a manager needs to record it. Ask a manager to sign in and complete this write-off.
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/30 gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={mut.isPending || qty <= 0 || blockedByApproval}
              className="bg-red-600 hover:bg-red-700"
            >
              {mut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {mut.isPending ? "Recording…" : qty > 0 ? `Waste ${formatQty(itemType, qty, unit)}` : "Record waste"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
