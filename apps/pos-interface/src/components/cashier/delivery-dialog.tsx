import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Textarea } from "@repo/ui/textarea";
import { toast } from "sonner";
import { updateCustomer } from "@/api/customers";
import {
    useToggleHomeDeliveryMutation,
    useUpdateDeliveryChargeMutation,
} from "@/hooks/useCashier";
import { usePricing } from "@/hooks/usePricing";
import HomeDeliveryIcon from "@/assets/home_delivery.png";
import PickUpIcon from "@/assets/pickup.png";
import type { Order } from "@repo/database";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    order: Order;
    isOrderCompleted: boolean;
};

export function DeliveryDialog({ open, onOpenChange, order, isOrderCompleted }: Props) {
    const queryClient = useQueryClient();
    const toggleMutation = useToggleHomeDeliveryMutation();
    const chargeMutation = useUpdateDeliveryChargeMutation();
    const { getPrice } = usePricing();
    const defaultCharge = getPrice("HOME_DELIVERY") || 0;

    const serverHomeDelivery = !!order?.home_delivery;
    const serverCharge = Number(order?.delivery_charge) || 0;
    const customer = order?.customer;

    const [homeDelivery, setHomeDelivery] = useState(serverHomeDelivery);
    const [chargeInput, setChargeInput] = useState(serverCharge.toString());
    const [city, setCity] = useState(customer?.city || "");
    const [area, setArea] = useState(customer?.area || "");
    const [block, setBlock] = useState(customer?.block || "");
    const [street, setStreet] = useState(customer?.street || "");
    const [houseNo, setHouseNo] = useState(customer?.house_no || "");
    const [note, setNote] = useState(customer?.address_note || "");
    const [saving, setSaving] = useState(false);

    // Reset draft to server state every time the dialog opens.
    useEffect(() => {
        if (!open) return;
        setHomeDelivery(serverHomeDelivery);
        setChargeInput(serverCharge.toString());
        setCity(customer?.city || "");
        setArea(customer?.area || "");
        setBlock(customer?.block || "");
        setStreet(customer?.street || "");
        setHouseNo(customer?.house_no || "");
        setNote(customer?.address_note || "");
    }, [open, serverHomeDelivery, serverCharge, customer?.city, customer?.area,
        customer?.block, customer?.street, customer?.house_no, customer?.address_note]);

    const onToggle = (value: boolean) => {
        setHomeDelivery(value);
        // Prefill default charge when switching ON and the field is empty/zero.
        if (value) {
            const current = Number(chargeInput);
            if (!chargeInput || isNaN(current) || current === 0) {
                setChargeInput(defaultCharge.toString());
            }
        }
    };

    const parsedCharge = chargeInput === "" ? 0 : Number(chargeInput);
    const chargeValid = !isNaN(parsedCharge) && parsedCharge >= 0;

    const homeDeliveryDirty = homeDelivery !== serverHomeDelivery;
    const chargeDirty = homeDelivery && chargeValid
        && Math.abs(parsedCharge - serverCharge) > 0.0005;
    const addressDirty = city !== (customer?.city || "")
        || area !== (customer?.area || "")
        || block !== (customer?.block || "")
        || street !== (customer?.street || "")
        || houseNo !== (customer?.house_no || "")
        || note !== (customer?.address_note || "");
    const isDirty = homeDeliveryDirty || chargeDirty || addressDirty;

    const onSave = async () => {
        if (!chargeValid) {
            toast.error("Enter a valid delivery charge");
            return;
        }
        setSaving(true);
        try {
            const ops: Array<Promise<{ status: string; message?: string }>> = [];
            if (homeDeliveryDirty) {
                ops.push(toggleMutation.mutateAsync({ orderId: order.id, homeDelivery }));
            }
            if (chargeDirty) {
                ops.push(chargeMutation.mutateAsync({ orderId: order.id, deliveryCharge: parsedCharge }));
            }
            if (addressDirty && customer?.id) {
                ops.push(
                    updateCustomer(customer.id, {
                        city: city || null, area: area || null, block: block || null,
                        street: street || null, house_no: houseNo || null, address_note: note || null,
                    })
                );
            }
            const results = await Promise.all(ops);
            const failed = results.find((r) => r?.status === "error");
            if (failed) {
                toast.error(`Could not save changes: ${failed.message || "unknown error"}`);
                return;
            }
            await queryClient.invalidateQueries({ queryKey: ["cashier-order"] });
            onOpenChange(false);
        } catch (err: unknown) {
            toast.error(`Could not save changes: ${err instanceof Error ? err.message : "unknown error"}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Fulfillment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    {!isOrderCompleted ? (
                        <div className="relative flex rounded-lg bg-muted p-1">
                            <div
                                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md bg-primary shadow-sm transition-transform duration-250 ease-out"
                                style={{ transform: homeDelivery ? "translateX(calc(100% + 8px))" : "translateX(0)" }}
                            />
                            {([
                                { value: false, label: "Pick Up", img: PickUpIcon },
                                { value: true, label: "Home Delivery", img: HomeDeliveryIcon },
                            ] as const).map((option) => {
                                const isActive = homeDelivery === option.value;
                                return (
                                    <button
                                        key={option.label}
                                        type="button"
                                        onClick={() => { if (!isActive) onToggle(option.value); }}
                                        disabled={saving}
                                        className="relative z-10 flex-1 flex items-center justify-center gap-2 rounded-md py-3 cursor-pointer select-none touch-manipulation pointer-coarse:active:scale-[0.97] disabled:cursor-not-allowed"
                                    >
                                        <img src={option.img} alt="" className={`h-7 object-contain transition-all ${isActive ? "brightness-0 invert" : ""}`} />
                                        <span className={`text-sm font-semibold ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`}>{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50 border border-border">
                            <img src={homeDelivery ? HomeDeliveryIcon : PickUpIcon} alt="" className="h-7 object-contain" />
                            <span className="font-semibold text-sm">{homeDelivery ? "Home Delivery" : "Pick Up"}</span>
                        </div>
                    )}

                    {/* Reserved space — keeps dialog shape stable when not home delivery */}
                    <div
                        className="space-y-1 transition-opacity duration-150"
                        style={{ visibility: homeDelivery ? "visible" : "hidden" }}
                        aria-hidden={!homeDelivery}
                    >
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Delivery charge (KWD)</Label>
                        <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={chargeInput}
                            onChange={(e) => setChargeInput(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            disabled={isOrderCompleted || !homeDelivery || saving}
                            tabIndex={homeDelivery ? 0 : -1}
                            className="h-11 text-base text-right tabular-nums max-w-[160px]"
                        />
                    </div>

                    <AddressEditor
                        city={city} setCity={setCity}
                        area={area} setArea={setArea}
                        block={block} setBlock={setBlock}
                        street={street} setStreet={setStreet}
                        houseNo={houseNo} setHouseNo={setHouseNo}
                        note={note} setNote={setNote}
                        disabled={saving}
                    />
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={saving}
                        className="h-10"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={onSave}
                        disabled={!isDirty || saving || !chargeValid}
                        className="h-10 min-w-[120px]"
                    >
                        {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Saving...</> : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

type AddressProps = {
    city: string; setCity: (v: string) => void;
    area: string; setArea: (v: string) => void;
    block: string; setBlock: (v: string) => void;
    street: string; setStreet: (v: string) => void;
    houseNo: string; setHouseNo: (v: string) => void;
    note: string; setNote: (v: string) => void;
    disabled: boolean;
};

function AddressEditor({
    city, setCity, area, setArea, block, setBlock,
    street, setStreet, houseNo, setHouseNo, note, setNote, disabled,
}: AddressProps) {
    return (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2.5">
            <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Address</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <Label className="text-xs">City</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} onFocus={(e) => e.target.select()} disabled={disabled} className="h-10 text-sm" />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Area</Label>
                    <Input value={area} onChange={(e) => setArea(e.target.value)} onFocus={(e) => e.target.select()} disabled={disabled} className="h-10 text-sm" />
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                    <Label className="text-xs">Block</Label>
                    <Input value={block} onChange={(e) => setBlock(e.target.value)} onFocus={(e) => e.target.select()} disabled={disabled} className="h-10 text-sm" />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Street</Label>
                    <Input value={street} onChange={(e) => setStreet(e.target.value)} onFocus={(e) => e.target.select()} disabled={disabled} className="h-10 text-sm" />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">House</Label>
                    <Input value={houseNo} onChange={(e) => setHouseNo(e.target.value)} onFocus={(e) => e.target.select()} disabled={disabled} className="h-10 text-sm" />
                </div>
            </div>
            <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} onFocus={(e) => e.target.select()} rows={2} disabled={disabled} className="text-sm resize-none min-h-0" />
            </div>
        </div>
    );
}
