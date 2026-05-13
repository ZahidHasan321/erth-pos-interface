import type { CashMovementReasonCategory } from "@/api/cashier";

export const CASH_MOVEMENT_CATEGORY_LABEL: Record<CashMovementReasonCategory, string> = {
    drop: "Drop to safe",
    pickup: "Pickup from safe",
    petty_cash: "Petty cash",
    bank_deposit: "Bank deposit",
    change_refill: "Change refill",
    tip_out: "Tip out",
    other: "Other",
};
