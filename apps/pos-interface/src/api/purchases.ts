import type { ApiResponse } from "../types/api";
import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";
import type { StockItemType, StockPurchaseStatus, PurchasePaymentType } from "@repo/database";

/** Stock purchases are ERTH-only (fabric/shelf live in ERTH's shop pool). */
const PURCHASE_BRAND = "ERTH" as const;

export type StockPurchaseFilter = "open" | "paid" | "all";

export interface StockPurchaseListItem {
    id: number;
    item_type: StockItemType;
    item_id: number;
    item_name: string | null;
    brand: string;
    qty: number;
    unit_cost: number;
    total_cost: number;
    amount_paid: number;
    remaining: number;
    status: StockPurchaseStatus;
    supplier_id: number | null;
    supplier_name: string | null;
    invoice_image_url: string | null;
    notes: string | null;
    created_at: string;
    created_by_name: string | null;
}

function normalizePurchase(r: Record<string, unknown>): StockPurchaseListItem {
    return {
        id: Number(r.id),
        item_type: r.item_type as StockItemType,
        item_id: Number(r.item_id),
        item_name: (r.item_name as string | null) ?? null,
        brand: String(r.brand),
        qty: Number(r.qty),
        unit_cost: Number(r.unit_cost),
        total_cost: Number(r.total_cost),
        amount_paid: Number(r.amount_paid),
        remaining: Number(r.remaining),
        status: r.status as StockPurchaseStatus,
        supplier_id: r.supplier_id == null ? null : Number(r.supplier_id),
        supplier_name: (r.supplier_name as string | null) ?? null,
        invoice_image_url: (r.invoice_image_url as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
        created_at: String(r.created_at),
        created_by_name: (r.created_by_name as string | null) ?? null,
    };
}

/** Stock-purchase payables for the cashier. 'open' = unpaid + partially_paid
 *  (the settlement queue); 'paid' = settled; 'all' = everything. */
export const getStockPurchases = async (
    filter: StockPurchaseFilter = "open",
    brand?: string,
): Promise<ApiResponse<StockPurchaseListItem[]>> => {
    const { data, error } = await db.rpc("get_stock_purchases", {
        p_brand: brand || PURCHASE_BRAND,
        p_filter: filter,
        p_limit: 200,
    });
    if (error) return { status: "error", message: error.message, data: [] };
    const rows = (data ?? []) as Record<string, unknown>[];
    return { status: "success", data: rows.map(normalizePurchase) };
};

export interface PayStockPurchaseResult {
    purchase_id: number;
    amount_paid: number;
    total_cost: number;
    status: StockPurchaseStatus;
    cash_movement_id: number | null;
}

/** Settle (fully or partially) a stock purchase. Cash settlements post a drawer
 *  cash_out and require an open register; non-cash leave the drawer untouched. */
export const payStockPurchase = async (params: {
    purchaseId: number;
    amount: number;
    paymentType: PurchasePaymentType;
    registerSessionId?: number | null;
    paymentRefNo?: string | null;
    note?: string | null;
    userId: string;
    /** Caller-stable UUID — the SAME across user-visible retries of one payment,
     *  so a lost-response tail doesn't double-settle (and, for cash, double the
     *  drawer cash_out). */
    idempotencyKey: string;
}): Promise<ApiResponse<PayStockPurchaseResult>> => {
    const { data, error } = await withWriteRetry(
        () => db.rpc("pay_stock_purchase", {
            p_purchase_id: params.purchaseId,
            p_amount: params.amount,
            p_payment_type: params.paymentType,
            p_register_session_id: params.registerSessionId ?? null,
            p_payment_ref_no: params.paymentRefNo ?? null,
            p_note: params.note ?? null,
            p_user_id: params.userId,
            p_idempotency_key: params.idempotencyKey,
        }),
        (r) => isTransientNetworkError(r.error),
    );
    if (error) return { status: "error", message: error.message };
    return { status: "success", data: data as PayStockPurchaseResult };
};
