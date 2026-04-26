import { useEffect, useState } from "react";
import { Loader2, MapPin, Truck } from "lucide-react";
import { Card } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Button } from "@repo/ui/button";
import { Label } from "@repo/ui/label";
import { Textarea } from "@repo/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateCustomer } from "@/api/customers";
import HomeDeliveryIcon from "@/assets/home_delivery.png";
import PickUpIcon from "@/assets/pickup.png";

/**
 * Charge input is fully controlled by the parent so a pending (unsaved) edit
 * can be flushed before submitting a payment.
 */
export function DeliveryAndAddress({
    order, isHomeDelivery, isOrderCompleted, onOptimisticToggle,
    chargeInput, setChargeInput,
}: {
    order: any;
    isHomeDelivery: boolean;
    isOrderCompleted: boolean;
    onOptimisticToggle: (value: boolean) => void;
    chargeInput: string;
    setChargeInput: (v: string) => void;
}) {
    const queryClient = useQueryClient();
    const c = order.customer;
    const [city, setCity] = useState(c?.city || "");
    const [area, setArea] = useState(c?.area || "");
    const [block, setBlock] = useState(c?.block || "");
    const [street, setStreet] = useState(c?.street || "");
    const [houseNo, setHouseNo] = useState(c?.house_no || "");
    const [note, setNote] = useState(c?.address_note || "");

    useEffect(() => {
        setCity(c?.city || "");
        setArea(c?.area || "");
        setBlock(c?.block || "");
        setStreet(c?.street || "");
        setHouseNo(c?.house_no || "");
        setNote(c?.address_note || "");
    }, [c?.city, c?.area, c?.block, c?.street, c?.house_no, c?.address_note]);

    const isDirty = city !== (c?.city || "") || area !== (c?.area || "") ||
        block !== (c?.block || "") || street !== (c?.street || "") ||
        houseNo !== (c?.house_no || "") || note !== (c?.address_note || "");

    const saveMutation = useMutation({
        mutationFn: () => updateCustomer(c?.id, {
            city: city || null, area: area || null, block: block || null,
            street: street || null, house_no: houseNo || null, address_note: note || null,
        } as any),
        onSuccess: (res) => {
            if (res.status === "error") { toast.error(`Failed to save address: ${res.message}`); return; }
            queryClient.invalidateQueries({ queryKey: ["cashier-order"] });
        },
        onError: (err) => toast.error(`Error saving address: ${err.message}`),
    });

    return (
        <Card className="p-3">
            <h3 className="font-semibold flex items-center gap-2 text-sm"><Truck className="h-4 w-4" />Delivery</h3>
            {!isOrderCompleted ? (
                <div className="relative flex rounded-lg bg-muted p-1">
                    <div
                        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md bg-primary shadow-sm transition-transform duration-250 ease-out"
                        style={{ transform: isHomeDelivery ? "translateX(calc(100% + 8px))" : "translateX(0)" }}
                    />
                    {([
                        { value: false, label: "Pick Up", img: PickUpIcon },
                        { value: true, label: "Home Delivery", img: HomeDeliveryIcon },
                    ] as const).map((option) => {
                        const isActive = isHomeDelivery === option.value;
                        return (
                            <button key={option.label} type="button"
                                onClick={() => { if (!isActive) onOptimisticToggle(option.value); }}
                                className="relative z-10 flex-1 flex items-center justify-center gap-2 rounded-md py-2 cursor-pointer select-none touch-manipulation pointer-coarse:active:scale-[0.97] transition-all duration-150">
                                <img src={option.img} alt={option.label} className={`h-7 object-contain transition-all duration-200 ${isActive ? "brightness-0 invert" : ""}`} />
                                <span className={`text-sm font-semibold transition-colors duration-200 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`}>{option.label}</span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50 border border-border">
                    <img src={isHomeDelivery ? HomeDeliveryIcon : PickUpIcon} alt="" className="h-7 object-contain" />
                    <span className="font-semibold text-sm">{isHomeDelivery ? "Home Delivery" : "Pick Up"}</span>
                </div>
            )}
            {isHomeDelivery && (
                <div className="flex items-center gap-2 mt-2">
                    <Label className="text-xs font-medium text-blue-800/70 shrink-0">Charge (KWD)</Label>
                    <Input
                        type="number"
                        step="0.001"
                        min="0"
                        value={chargeInput}
                        onChange={(e) => setChargeInput(e.target.value)}
                        disabled={isOrderCompleted}
                        className="h-8 w-28 text-sm text-right tabular-nums"
                    />
                    <span className="text-[11px] text-muted-foreground">Saved on payment</span>
                </div>
            )}

            <div
                className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
                style={{
                    gridTemplateRows: isHomeDelivery ? "1fr" : "0fr",
                    opacity: isHomeDelivery ? 1 : 0,
                }}
            >
                <div className="overflow-hidden">
                    <div className="mt-3 rounded-lg bg-blue-50/60 border border-blue-200/60 p-3 space-y-2.5">
                        <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Delivery Address</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-blue-800/70">City</Label>
                                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-8 text-sm border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-blue-800/70">Area</Label>
                                <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" className="h-8 text-sm border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-blue-800/70">Block</Label>
                                <Input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="Block" className="h-8 text-sm border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-blue-800/70">Street</Label>
                                <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street" className="h-8 text-sm border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-blue-800/70">House No.</Label>
                                <Input value={houseNo} onChange={(e) => setHouseNo(e.target.value)} placeholder="House" className="h-8 text-sm border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-medium text-blue-800/70">Note</Label>
                            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery instructions..." rows={2} className="text-sm resize-none min-h-0 border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                        </div>
                        {isDirty && (
                            <Button size="sm" className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                                {saveMutation.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving...</> : "Save Address"}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}
