import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { DiscountControls } from "@/components/cashier/discount-controls";
import type { Order } from "@repo/database";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    order: Order;
    orderTotal: number;
    totalPaid: number;
};

export function DiscountDialog({ open, onOpenChange, order, orderTotal, totalPaid }: Props) {
    const discountValue = Number(order?.discount_value) || 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl sm:h-[340px] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-xl">Discount</DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0">
                    <DiscountControls
                        orderId={order.id}
                        currentDiscountType={order.discount_type}
                        currentDiscountValue={discountValue}
                        currentDiscountPercentage={Number(order.discount_percentage) || 0}
                        currentReferralCode={order.referral_code}
                        orderTotal={orderTotal}
                        totalPaid={totalPaid}
                        onSaved={() => onOpenChange(false)}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
