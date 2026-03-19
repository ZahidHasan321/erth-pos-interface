import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { updateCustomer } from "@/api/customers";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface AddressDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerId: number;
    currentAddress?: {
        city?: string;
        area?: string;
        block?: string;
        street?: string;
        house_no?: string;
        address_note?: string;
    };
}

export function AddressDialog({ open, onOpenChange, customerId, currentAddress }: AddressDialogProps) {
    const [city, setCity] = useState(currentAddress?.city || "");
    const [area, setArea] = useState(currentAddress?.area || "");
    const [block, setBlock] = useState(currentAddress?.block || "");
    const [street, setStreet] = useState(currentAddress?.street || "");
    const [houseNo, setHouseNo] = useState(currentAddress?.house_no || "");
    const [note, setNote] = useState(currentAddress?.address_note || "");

    const queryClient = useQueryClient();

    useEffect(() => {
        if (open) {
            setCity(currentAddress?.city || "");
            setArea(currentAddress?.area || "");
            setBlock(currentAddress?.block || "");
            setStreet(currentAddress?.street || "");
            setHouseNo(currentAddress?.house_no || "");
            setNote(currentAddress?.address_note || "");
        }
    }, [open, currentAddress]);

    const mutation = useMutation({
        mutationFn: () => updateCustomer(customerId, {
            city: city || null,
            area: area || null,
            block: block || null,
            street: street || null,
            house_no: houseNo || null,
            address_note: note || null,
        } as any),
        onSuccess: (res) => {
            if (res.status === "error") {
                toast.error(`Failed: ${res.message}`);
                return;
            }
            toast.success("Address updated");
            queryClient.invalidateQueries({ queryKey: ["cashier-order"] });
            onOpenChange(false);
        },
        onError: (err) => toast.error(`Error: ${err.message}`),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Customer Address</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs">City</Label>
                            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kuwait City" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Area</Label>
                            <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Salmiya" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs">Block</Label>
                            <Input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="4" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Street</Label>
                            <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="12" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">House No.</Label>
                            <Input value={houseNo} onChange={(e) => setHouseNo(e.target.value)} placeholder="5" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Note</Label>
                        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery instructions..." rows={2} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                        {mutation.isPending ? "Saving..." : "Save Address"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
