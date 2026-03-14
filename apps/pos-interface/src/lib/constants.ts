export const BRAND_NAMES = {
  showroom: "erth",
  fromHome: "sakkba",
} as const;

export const ORDER_PHASE_LABELS = {
    new: "New",
    in_progress: "In Progress",
    completed: "Completed",
} as const;

export const ORDER_PHASE_COLORS = {
    new: "gray",
    in_progress: "amber",
    completed: "emerald",
} as const;

export const PIECE_STAGE_LABELS = {
    waiting_for_acceptance: "Waiting for Acceptance",
    waiting_cut: "Waiting for Cut",
    soaking: "Soaking",
    cutting: "Cutting",
    post_cutting: "Post-Cutting",
    sewing: "Sewing",
    finishing: "Finishing",
    ironing: "Ironing",
    quality_check: "Quality Check",
    ready_for_dispatch: "Ready for Dispatch",
    at_shop: "At Shop",
    accepted: "Accepted",
    needs_repair: "Needs Repair",
    needs_redo: "Needs Redo",
    completed: "Completed",
} as const;

export const PIECE_STAGE_COLORS = {
    waiting_for_acceptance: "gray",
    waiting_cut: "gray",
    soaking: "blue",
    cutting: "amber",
    post_cutting: "amber",
    sewing: "amber",
    finishing: "amber",
    ironing: "amber",
    quality_check: "amber",
    ready_for_dispatch: "green",
    at_shop: "green",
    accepted: "emerald",
    needs_repair: "red",
    needs_redo: "red",
    completed: "slate",
} as const;

export const LOCATION_LABELS = {
    shop: "At Shop",
    workshop: "At Workshop",
    transit_to_shop: "In Transit to Shop",
    transit_to_workshop: "In Transit to Workshop",
} as const;

export const TRANSACTION_TYPE_LABELS = {
    payment: "Payment",
    refund: "Refund",
} as const;

export const PAYMENT_TYPE_LABELS = {
    knet: "K-Net",
    cash: "Cash",
    link_payment: "Link Payment",
    installments: "Installments",
    others: "Others",
} as const;
