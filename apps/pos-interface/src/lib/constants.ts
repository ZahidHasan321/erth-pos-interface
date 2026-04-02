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
    awaiting_trial: "Awaiting Trial",
    ready_for_pickup: "Ready for Pickup",
    brova_trialed: "Brova Trialed",
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
    awaiting_trial: "blue",
    ready_for_pickup: "emerald",
    brova_trialed: "purple",
    completed: "slate",
} as const;

export const FEEDBACK_STATUS_LABELS = {
    accepted: "Accepted",
    needs_repair: "Needs Repair",
    needs_redo: "Needs Redo",
} as const;

export const FEEDBACK_STATUS_COLORS = {
    accepted: "emerald",
    needs_repair: "amber",
    needs_redo: "red",
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

export const PAYMENT_METHOD_COLORS: Record<string, string> = {
    knet: "#3d8b6e",      // teal-green
    cash: "#c2723a",      // warm orange-brown
    link_payment: "#b8982e", // golden
    installments: "#7c5aad", // muted purple
    others: "#c45a4a",    // coral-red
} as const;

export const APPOINTMENT_STATUS_LABELS = {
    scheduled: "Scheduled",
    completed: "Completed",
    cancelled: "Cancelled",
    no_show: "No Show",
} as const;

export const APPOINTMENT_STATUS_COLORS = {
    scheduled: "blue",
    completed: "emerald",
    cancelled: "gray",
    no_show: "red",
} as const;

export const EMPLOYEE_COLORS = [
    { bg: "bg-blue-50", border: "border-l-blue-500", text: "text-blue-900", dot: "bg-blue-500" },
    { bg: "bg-emerald-50", border: "border-l-emerald-500", text: "text-emerald-900", dot: "bg-emerald-500" },
    { bg: "bg-orange-50", border: "border-l-orange-500", text: "text-orange-900", dot: "bg-orange-500" },
    { bg: "bg-purple-50", border: "border-l-purple-500", text: "text-purple-900", dot: "bg-purple-500" },
    { bg: "bg-rose-50", border: "border-l-rose-500", text: "text-rose-900", dot: "bg-rose-500" },
    { bg: "bg-teal-50", border: "border-l-teal-500", text: "text-teal-900", dot: "bg-teal-500" },
    { bg: "bg-amber-50", border: "border-l-amber-500", text: "text-amber-900", dot: "bg-amber-500" },
    { bg: "bg-indigo-50", border: "border-l-indigo-500", text: "text-indigo-900", dot: "bg-indigo-500" },
] as const;

export function getEmployeeColor(employeeId: string) {
    let hash = 0;
    for (let i = 0; i < employeeId.length; i++) {
        hash = ((hash << 5) - hash) + employeeId.charCodeAt(i);
        hash |= 0;
    }
    return EMPLOYEE_COLORS[Math.abs(hash) % EMPLOYEE_COLORS.length];
}
