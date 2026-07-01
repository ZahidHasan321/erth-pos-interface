import type { ApiResponse } from "../types/api";
import type { Order } from "@repo/database";
import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";
import { getLocalDateStr, getLocalTzOffsetMinutes } from "@/lib/utils";

/** Cashier is ERTH-only — no SAKKBA or QASS orders */
const CASHIER_BRAND = "ERTH" as const;


const CASHIER_ORDER_QUERY = `
    *,
    workOrder:work_orders!order_id(invoice_number, invoice_revision, order_phase, delivery_date, home_delivery, campaign_id, stitching_charge, fabric_charge, style_charge, campaign:campaigns(name)),
    alterationOrder:alteration_orders!order_id(invoice_number, received_date, comments, order_phase, alteration_total),
    customer:customers(id, name, phone, country_code, account_type, relation, city, area, block, street, house_no, address_note),
    discount_approver:users!discount_approved_by(id, name),
    garments:garments(id, garment_id, piece_stage, location, garment_type, trip_number, feedback_status, acceptance_status, fabric_id, style, express, soaking, soaking_hours, delivery_date, fabric_price_snapshot, stitching_price_snapshot, style_price_snapshot, refunded_fabric, refunded_stitching, refunded_style, refunded_express, refunded_soaking, replaced_by_garment_id, collar_type, collar_button, cuffs_type, jabzour_1, jabzour_thickness, fabric_length, lines, home_delivery, bufi_ext, original_garment_id, notes, alteration_measurements, alteration_styles, measurement:measurements!measurement_id(collar_position), fabric:fabrics(id, name)),
    shelf_items:order_shelf_items(id, shelf_id, quantity, unit_price, refunded_qty, shelf:shelf(type, brand)),
    payment_transactions:payment_transactions(id, amount, transaction_type, payment_type, payment_ref_no, payment_note, refund_reason, refund_items, created_at, cashier_id, cashier:users(name))
`;

// Same as above but with !inner join on work_orders (for filtering by invoice_number)
const CASHIER_ORDER_QUERY_INNER = CASHIER_ORDER_QUERY.replace(
    'workOrder:work_orders!order_id(',
    'workOrder:work_orders!order_id!inner('
);

function flattenCashierOrder(data: Record<string, unknown> | null): Order | null {
    if (!data) return null;
    const { workOrder, alterationOrder, customer, taker, ...core } = data;
    const workData = Array.isArray(workOrder) ? workOrder[0] : workOrder;
    // ALTERATION orders have no work_orders row; their invoice_number / order_phase
    // / received_date / comments live on alteration_orders. Spread it so the
    // cashier sees them the same way it sees work-order fields.
    const altData = Array.isArray(alterationOrder) ? alterationOrder[0] : alterationOrder;
    const customerData = Array.isArray(customer) ? customer[0] : customer;
    const takerData = Array.isArray(taker) ? taker[0] : taker;
    return {
        ...core,
        ...workData,
        ...(altData ?? {}),
        alteration_order: altData,
        customer: customerData,
        taker: takerData,
    };
}

// Lightweight select for order list (no garments, no transactions)
const CASHIER_ORDER_LIST_QUERY = `
    id, order_type, checkout_status, order_total, paid, order_date, brand, discount_value,
    workOrder:work_orders!order_id(invoice_number, invoice_revision, order_phase, delivery_date, home_delivery, linked_order_id),
    alterationOrder:alteration_orders!order_id(invoice_number, order_phase),
    customer:customers(name, phone, account_type, relation, primary:customers!primary_customer_id(name)),
    garments:garments(piece_stage, location)
`;

export interface CashierOrderListItem {
    id: number;
    order_type: string;
    checkout_status: string;
    order_total: number;
    paid: number;
    order_date: string;
    invoice_number?: number;
    invoice_revision?: number;
    order_phase?: string;
    customer_name?: string;
    customer_phone?: string;
    delivery_date?: string;
    home_delivery?: boolean;
    garment_total: number;
    garment_ready: number;
    // §2.13 order linking + §5 customer account, for cashier grouping/badges.
    linked_order_id?: number | null;
    account_type?: string | null;
    relation?: string | null;
    primary_customer_name?: string | null;
}

function flattenOrderListItem(data: Record<string, unknown>): CashierOrderListItem {
    type NestedRow = Record<string, unknown>;
    const workData = (Array.isArray(data.workOrder) ? data.workOrder[0] : data.workOrder) as NestedRow | null | undefined;
    const altData = (Array.isArray(data.alterationOrder) ? data.alterationOrder[0] : data.alterationOrder) as NestedRow | null | undefined;
    const customerData = (Array.isArray(data.customer) ? data.customer[0] : data.customer) as NestedRow | null | undefined;
    const garments = (Array.isArray(data.garments) ? data.garments : []) as NestedRow[];
    const readyStages = ["ready_for_pickup", "brova_trialed", "awaiting_trial"];
    return {
        id: data.id as number,
        order_type: data.order_type as string,
        checkout_status: data.checkout_status as string,
        order_total: Number(data.order_total) || 0,
        paid: Number(data.paid) || 0,
        order_date: data.order_date as string,
        invoice_number: (workData?.invoice_number ?? altData?.invoice_number) as number | undefined,
        invoice_revision: (workData?.invoice_revision as number | undefined) ?? 0,
        order_phase: (workData?.order_phase ?? altData?.order_phase) as string | undefined,
        delivery_date: workData?.delivery_date as string | undefined,
        home_delivery: workData?.home_delivery as boolean | undefined,
        customer_name: customerData?.name as string | undefined,
        customer_phone: customerData?.phone as string | undefined,
        linked_order_id: (workData?.linked_order_id ?? null) as number | null,
        account_type: (customerData?.account_type ?? null) as string | null,
        relation: (customerData?.relation ?? null) as string | null,
        primary_customer_name: (() => {
            const p = customerData?.primary;
            const pRow = (Array.isArray(p) ? p[0] : p) as NestedRow | null | undefined;
            return (pRow?.name ?? null) as string | null;
        })(),
        garment_total: garments.length,
        garment_ready: garments.filter((g) => g.location === "shop" && readyStages.includes(g.piece_stage as string)).length,
    };
}

/**
 * Cashier "All Orders" stats, scoped to the selected period (see getCashierSummary).
 * Billed / collected / outstanding are order-attributed (all reference orders
 * placed in the period) so they form a coherent collection triangle:
 * outstanding = billed − collected. Payment-status buckets are mutually
 * exclusive (unpaid + partial + paid = order_count); owing = unpaid + partial.
 */
export interface CashierSummary {
    billed: number;
    collected: number;
    outstanding: number;
    order_count: number;
    paid_count: number;
    partial_count: number;
    unpaid_count: number;
    owing_count: number;
    /** Amount still owed across partially-paid orders. */
    partial_outstanding: number;
    /** Amount still owed across not-yet-paid orders. */
    unpaid_outstanding: number;
    work_count: number;
    sales_count: number;
    work_billed: number;
    sales_billed: number;
}

export const EMPTY_CASHIER_SUMMARY: CashierSummary = {
    billed: 0, collected: 0, outstanding: 0, order_count: 0,
    paid_count: 0, partial_count: 0, unpaid_count: 0, owing_count: 0,
    partial_outstanding: 0, unpaid_outstanding: 0,
    work_count: 0, sales_count: 0, work_billed: 0, sales_billed: 0,
};

export const getCashierSummary = async (period: CashierPeriod = "all", brand?: string): Promise<{ status: 'success'; data: CashierSummary }> => {
    const currentBrand = brand || CASHIER_BRAND;
    const { data, error } = await db.rpc('get_cashier_summary', { p_brand: currentBrand, p_start_iso: getPeriodStartIso(period) });
    if (error) {
        console.error('Error fetching cashier summary:', error.message);
        return { status: 'success', data: EMPTY_CASHIER_SUMMARY };
    }
    return { status: 'success', data: data as CashierSummary };
};

export type CashierFilter = "all" | "unpaid" | "partial" | "paid" | "owing" | "work" | "sales";

/** Date-range filter for the cashier list, on order_date (Kuwait tz). */
export type CashierPeriod = "all" | "today" | "month" | "last2" | "quarter";

/**
 * UTC ISO start instant for a period, anchored to Kuwait-local "today".
 * Returns null for "all" (no lower bound). End is always "now", so only a
 * `gte` is needed. Windows are increasing: today < month (1) < last2 (2) < quarter (3).
 *   today   = start of the current day
 *   month   = first day of the current calendar month
 *   last2   = first day of the previous month (covers previous + current = 2 months)
 *   quarter = first day of the current calendar quarter
 */
function getPeriodStartIso(period: CashierPeriod): string | null {
    if (period === "all") return null;
    const [y, m, d] = getLocalDateStr().split("-").map(Number); // Kuwait YYYY-MM-DD
    let year = y;
    let month = m; // 1-12
    let day = 1;
    if (period === "today") {
        day = d;
    } else if (period === "last2") {
        month = m - 1;
        if (month < 1) { month += 12; year -= 1; }
    } else if (period === "quarter") {
        month = Math.floor((m - 1) / 3) * 3 + 1;
    }
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return new Date(`${year}-${mm}-${dd}T00:00:00.000+03:00`).toISOString();
}

export const getRecentCashierOrders = async (filter: CashierFilter = "all", brand?: string, period: CashierPeriod = "all"): Promise<{ status: 'success'; data: CashierOrderListItem[] }> => {
    const currentBrand = brand || CASHIER_BRAND;
    const periodStart = getPeriodStartIso(period);
    // A period narrows by order_date in a follow-up query, so widen the pre-limit
    // to avoid date-filtering being starved by the most-recent-N cutoff.
    const listLimit = periodStart ? 500 : 30;

    // For payment-status filters (paid/unpaid/partial/owing): use a server-side
    // RPC to get exact IDs, since PostgREST can't compare paid vs order_total.
    if (filter === "paid" || filter === "unpaid" || filter === "partial" || filter === "owing") {
        const { data: ids, error: rpcError } = await db.rpc('get_cashier_order_ids_by_payment', {
            p_brand: currentBrand,
            p_filter: filter,
            p_limit: listLimit,
        });

        if (rpcError || !ids || ids.length === 0) {
            if (rpcError) console.error('Error fetching payment-status order IDs:', rpcError.message);
            return { status: 'success', data: [] };
        }

        let idQuery = db
            .from('orders')
            .select(CASHIER_ORDER_LIST_QUERY)
            .in('id', ids);
        if (periodStart) idQuery = idQuery.gte('order_date', periodStart);
        const { data, error } = await idQuery.order('order_date', { ascending: false });

        if (error) {
            console.error('Error fetching paid/unpaid orders:', error.message);
            return { status: 'success', data: [] };
        }

        return { status: 'success', data: ((data || []) as Record<string, unknown>[]).map(flattenOrderListItem) };
    }

    // For other filters: simple query with limit
    let query = db
        .from('orders')
        .select(CASHIER_ORDER_LIST_QUERY)
        .eq('brand', currentBrand)
        .neq('checkout_status', 'draft');

    if (periodStart) query = query.gte('order_date', periodStart);

    switch (filter) {
        case "work":
            query = query.eq('order_type', 'WORK');
            break;
        case "sales":
            query = query.eq('order_type', 'SALES');
            break;
    }

    const { data, error } = await query
        .order('order_date', { ascending: false })
        .limit(listLimit);

    if (error) {
        console.error('Error fetching recent orders:', error.message);
        return { status: 'success', data: [] };
    }

    return { status: 'success', data: (data || []).map(flattenOrderListItem) };
};

export const searchOrderForCashier = async (
    query: string,
    brand?: string
): Promise<ApiResponse<Order>> => {
    const currentBrand = brand || CASHIER_BRAND;
    const trimmed = query.trim();

    if (!trimmed) {
        return { status: 'error', message: 'Search query is required' };
    }

    const numericVal = parseInt(trimmed);

    if (!isNaN(numericVal)) {
        // Try by order ID
        const { data: byId } = await db
            .from('orders')
            .select(CASHIER_ORDER_QUERY)
            .eq('id', numericVal)
            .eq('brand', currentBrand)
            .neq('checkout_status', 'draft')
            .maybeSingle();
        if (byId) {
            return { status: 'success', data: flattenCashierOrder(byId as unknown as Record<string, unknown>) as Order };
        }

        // Try by invoice number (needs !inner join)
        const { data: byInvoice } = await db
            .from('orders')
            .select(CASHIER_ORDER_QUERY_INNER)
            .eq('brand', currentBrand)
            .neq('checkout_status', 'draft')
            .eq('workOrder.invoice_number', numericVal)
            .maybeSingle();
        if (byInvoice) {
            return { status: 'success', data: flattenCashierOrder(byInvoice as unknown as Record<string, unknown>) as Order };
        }
    }

    // Try by customer fuzzy search (name, phone, arabic_name, nick_name)
    const { data: fuzzyCustomers } = await db.rpc('search_customers_fuzzy', {
        p_query: trimmed,
        p_limit: 1,
    });

    if (fuzzyCustomers && fuzzyCustomers.length > 0) {
        const { data: byCustomer } = await db
            .from('orders')
            .select(CASHIER_ORDER_QUERY)
            .eq('brand', currentBrand)
            .neq('checkout_status', 'draft')
            .eq('customer_id', fuzzyCustomers[0].id)
            .order('order_date', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (byCustomer) {
            return { status: 'success', data: flattenCashierOrder(byCustomer as unknown as Record<string, unknown>) as Order };
        }
    }

    return { status: 'error', message: 'Order not found' };
};

export const searchCashierOrderList = async (
    query: string,
    brand?: string
): Promise<{ status: 'success'; data: CashierOrderListItem[] }> => {
    const currentBrand = brand || CASHIER_BRAND;
    const trimmed = query.trim();
    if (!trimmed) return { status: 'success', data: [] };

    // Fuzzy search customers by name, phone, arabic_name, nick_name (pg_trgm powered)
    const { data: customers } = await db.rpc('search_customers_fuzzy', {
        p_query: trimmed,
        p_limit: 20,
    });

    const customerIds = (customers || []).map((c: { id: number }) => c.id);

    // Build combined query: by order id, invoice, or matching customer
    let query_ = db
        .from('orders')
        .select(CASHIER_ORDER_LIST_QUERY)
        .eq('brand', currentBrand)
        .neq('checkout_status', 'draft')
        .order('order_date', { ascending: false })
        .limit(30);

    const numericVal = parseInt(trimmed);

    if (!isNaN(numericVal) && customerIds.length > 0) {
        query_ = query_.or(`id.eq.${numericVal},customer_id.in.(${customerIds.join(',')})`);
    } else if (!isNaN(numericVal)) {
        query_ = query_.or(`id.eq.${numericVal}`);
    } else if (customerIds.length > 0) {
        query_ = query_.in('customer_id', customerIds);
    } else {
        return { status: 'success', data: [] };
    }

    const { data, error } = await query_;
    if (error) {
        console.error('Error searching orders:', error.message);
        return { status: 'success', data: [] };
    }
    return { status: 'success', data: (data || []).map(flattenOrderListItem) };
};

export const getPaymentTransactions = async (orderId: number) => {
    const { data, error } = await db
        .from('payment_transactions')
        .select('*, cashier:users(name)')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

    if (error) {
        // Table might not exist yet
        console.error('Error fetching payment transactions:', error.message);
        return { status: 'success' as const, data: [] };
    }
    return { status: 'success' as const, data: data || [] };
};

export interface RefundItem {
    garment_id?: string;
    fabric?: boolean;
    stitching?: boolean;
    style?: boolean;
    express?: boolean;
    soaking?: boolean;
    /** Display metadata: hours soaked (8 or 24). Not used by the RPC; kept on the
     *  saved refund_items JSON so the payment-history view can label which soaking
     *  tier was refunded after prices change. */
    soaking_hours?: number | null;
    shelf_item_id?: number;
    quantity?: number;
    /** Shelf refund only: whether to return units to stock. Defaults to true on the RPC side. */
    restock?: boolean;
    /** Garment refund only: when the cancelled garment fully refunds, optionally
     *  return its uncut fabric to shop stock. Default false (assume cut/started). */
    fabric_restock?: boolean;
    amount: number;
}

export const recordPaymentTransaction = async (params: {
    orderId: number;
    amount: number;
    paymentType: string;
    paymentRefNo?: string;
    paymentNote?: string;
    cashierId?: string;
    transactionType: 'payment' | 'refund';
    refundReason?: string;
    collectGarmentIds?: string[];
    collectFulfillmentOverrides?: Record<string, "collected" | "delivered">;
    refundItems?: RefundItem[];
    /** Client-generated UUID per submit attempt. Lets the RPC return the original
     *  transaction on retry instead of inserting a duplicate (network glitch,
     *  double-click, etc.). Omit to opt out of dedupe. */
    idempotencyKey?: string;
}) => {
    const { data, error } = await db.rpc('record_payment_transaction', {
        p_order_id: params.orderId,
        p_amount: params.amount,
        p_payment_type: params.paymentType,
        p_payment_ref_no: params.paymentRefNo || null,
        p_payment_note: params.paymentNote || null,
        p_cashier_id: params.cashierId || null,
        p_transaction_type: params.transactionType,
        p_refund_reason: params.refundReason || null,
        p_collect_garment_ids: params.collectGarmentIds || null,
        p_refund_items: params.refundItems || null,
        p_local_date: getLocalDateStr(),
        p_fulfillment_overrides: params.collectFulfillmentOverrides ?? null,
        p_idempotency_key: params.idempotencyKey || null,
    });

    if (error) {
        return { status: 'error' as const, message: error.message };
    }
    return { status: 'success' as const, data };
};

// ── §3 cashier-processing gate: Pending queue + bulk processing ───────────────

export interface CashierPendingOrder {
    order_id: number;
    /** 'WORK' | 'ALTERATION' — both share the Pending queue (§3). */
    order_type: string;
    invoice_number: number | null;
    customer_name: string | null;
    customer_phone: string | null;
    order_date: string | null;
    delivery_date: string | null;
    order_total: number;
    paid: number;
    advance: number;
    garment_count: number;
    // §2.13 order linking + §5 customer account, for cashier grouping/badges.
    linked_order_id: number | null;
    account_type: string | null;
    relation: string | null;
    primary_customer_id: number | null;
    primary_customer_name: string | null;
}

/** Pending WORK orders awaiting cashier processing (confirmed, gate still open). */
export const getCashierPendingOrders = async (): Promise<ApiResponse<CashierPendingOrder[]>> => {
    const { data, error } = await db.rpc('get_cashier_pending_orders', {
        p_brand: CASHIER_BRAND,
        p_limit: 200,
    });
    if (error) {
        return { status: 'error', message: error.message, data: [] };
    }
    return { status: 'success', data: (data ?? []) as CashierPendingOrder[] };
};

/** Confirm one or more pending WORK orders WITHOUT taking payment (clears the
 *  §3 gate; no register needed). Idempotent on its key. */
export const cashierConfirmNoPayment = async (params: {
    orderIds: number[];
    cashierId?: string;
    idempotencyKey?: string;
}) => {
    const { data, error } = await withWriteRetry(
        () => db.rpc('cashier_confirm_orders_no_payment', {
            p_order_ids: params.orderIds,
            p_cashier_id: params.cashierId || null,
            p_idempotency_key: params.idempotencyKey || null,
        }),
        (r) => isTransientNetworkError(r.error),
    );
    if (error) {
        return { status: 'error' as const, message: error.message };
    }
    return { status: 'success' as const, data };
};

export interface BulkPaymentItem {
    orderId: number;
    amount: number;
    paymentType: string;
    paymentRefNo?: string;
    paymentNote?: string;
}

/** Atomic bulk payment across several WORK orders (§3). All-or-nothing: any
 *  rejection aborts the whole batch. Idempotent on its key, so a retry of a
 *  lost-response call never double-charges. */
export const recordBulkPayment = async (params: {
    payments: BulkPaymentItem[];
    cashierId?: string;
    idempotencyKey?: string;
}) => {
    const { data, error } = await withWriteRetry(
        () => db.rpc('record_bulk_payment', {
            p_payments: params.payments,
            p_cashier_id: params.cashierId || null,
            p_idempotency_key: params.idempotencyKey || null,
        }),
        (r) => isTransientNetworkError(r.error),
    );
    if (error) {
        return { status: 'error' as const, message: error.message };
    }
    return { status: 'success' as const, data };
};

export const updateOrderDiscount = async (params: {
    orderId: number;
    discountType: string;
    discountValue: number;
    discountPercentage?: number;
    referralCode?: string;
    newOrderTotal?: number;
    approvedBy?: string;
    reason?: string;
}) => {
    const { data, error } = await db.rpc('update_order_discount', {
        p_order_id: params.orderId,
        p_discount_type: params.discountType,
        p_discount_value: params.discountValue,
        p_discount_percentage: params.discountPercentage || null,
        p_referral_code: params.referralCode || null,
        p_new_order_total: params.newOrderTotal || null,
        p_approved_by: params.approvedBy || null,
        p_reason: params.reason || null,
    });

    if (error) {
        return { status: 'error' as const, message: error.message };
    }
    return { status: 'success' as const, data };
};

export const toggleHomeDelivery = async (params: {
    orderId: number;
    homeDelivery: boolean;
}) => {
    const { data, error } = await db.rpc('toggle_home_delivery', {
        p_order_id: params.orderId,
        p_home_delivery: params.homeDelivery,
    });

    if (error) {
        return { status: 'error' as const, message: error.message };
    }
    return { status: 'success' as const, data };
};

export const updateDeliveryCharge = async (params: {
    orderId: number;
    deliveryCharge: number;
}) => {
    const { data, error } = await db.rpc('update_delivery_charge', {
        p_order_id: params.orderId,
        p_delivery_charge: params.deliveryCharge,
    });

    if (error) {
        return { status: 'error' as const, message: error.message };
    }
    return { status: 'success' as const, data };
};

export const collectGarments = async (params: {
    orderId: number;
    garmentIds: string[];
    fulfillmentOverrides?: Record<string, "collected" | "delivered">;
}) => {
    const { data, error } = await db.rpc('collect_garments', {
        p_order_id: params.orderId,
        p_garment_ids: params.garmentIds,
        p_fulfillment_overrides: params.fulfillmentOverrides ?? null,
    });

    if (error) {
        return { status: 'error' as const, message: error.message };
    }
    return { status: 'success' as const, data };
};

// ── End of Day Report ──────────────────────────────────────────────────────

export interface EodPaymentMethodBreakdown {
    payment_type: string;
    total: number;
    count: number;
    refund_total: number;
}

export interface EodDailyData {
    date: string;
    collected: number;
    refunded: number;
    payment_count: number;
    refund_count: number;
}

export interface EodCashierData {
    cashier_name: string | null;
    collected: number;
    refunded: number;
    transaction_count: number;
}

export interface EodPurchaseMethodBreakdown {
    payment_type: string;
    total: number;
    count: number;
}

export interface EodPurchasesSummary {
    total_paid: number;        // Stock-purchase settlements in range (cash + non-cash)
    payment_count: number;
    by_payment_method: EodPurchaseMethodBreakdown[];
}

export interface EodCashFlowCategory {
    type: "cash_in" | "cash_out";
    reason_category: CashMovementReasonCategory;
    total: number;
    count: number;
}

export interface EodCashFlowSummary {
    cash_in_total: number;     // Manual paid-in movements in range (excl. order payments)
    cash_out_total: number;    // Manual paid-out movements in range (excl. order refunds)
    by_category: EodCashFlowCategory[];
}

export interface EodReportSummary {
    // Cash basis — money that actually moved in the range
    total_collected: number;
    total_refunded: number;
    net_revenue: number;
    transaction_count: number;
    deposit_collected: number;       // First payment per order, in range
    balance_collected: number;       // Subsequent payments per order, in range

    // Accrual basis — orders booked in the range
    order_count: number;
    work_count: number;
    sales_count: number;
    gross_sales: number;             // Sum of order_total for confirmed orders in range
    total_billed: number;            // Same as gross_sales — kept for backward-compat
    discount_total: number;          // Sum of orders.discount_value in range
    outstanding: number;             // Unpaid balance for orders BOOKED in range
    avg_order_value: number;

    // Cancellations (excluded from confirmed-only stats above)
    cancelled_count: number;
    cancelled_billed: number;

    // Audit
    invoice_first: number | null;
    invoice_last: number | null;

    // All-time receivables snapshot
    ar_outstanding: number;          // Sum of unpaid balances across ALL open orders

    // Throughput
    delivered_count: number;         // Garments collected/delivered in range

    by_payment_method: EodPaymentMethodBreakdown[];
    daily: EodDailyData[];
    by_cashier: EodCashierData[];

    // Stock-purchase settlements (non-customer expense payables, §3 Purchases tab)
    purchases: EodPurchasesSummary;

    // Manual drawer cash movements (drops/deposits/petty-cash/tip-outs) in range
    cash_flow: EodCashFlowSummary;
}

export interface EodTransaction {
    id: number;
    order_id: number;
    amount: number;
    payment_type: string;
    payment_ref_no: string | null;
    payment_note: string | null;
    transaction_type: 'payment' | 'refund';
    refund_reason: string | null;
    created_at: string;
    cashier_name: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    order_type: string | null;
    order_total: number | null;
    order_paid: number | null;
    invoice_number: number | null;
}

export interface EodTransactionFilters {
    search?: string;
    paymentType?: string;
    transactionType?: string;
    orderType?: string;
    page?: number;
    pageSize?: number;
}

export interface EodTransactionPage {
    transactions: EodTransaction[];
    total_count: number;
    page: number;
    page_size: number;
}

export const getEodReport = async (
    dateFrom: string,
    dateTo: string,
    brand?: string,
): Promise<{ status: 'success'; data: EodReportSummary }> => {
    const currentBrand = brand || CASHIER_BRAND;
    const { data, error } = await db.rpc('get_eod_report', {
        p_brand: currentBrand,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_tz_offset_minutes: getLocalTzOffsetMinutes(),
    });

    if (error) {
        console.error('Error fetching EOD report:', error.message);
        return {
            status: 'success',
            data: {
                total_collected: 0, total_refunded: 0, net_revenue: 0, transaction_count: 0,
                deposit_collected: 0, balance_collected: 0,
                order_count: 0, work_count: 0, sales_count: 0,
                gross_sales: 0, total_billed: 0, discount_total: 0,
                outstanding: 0, avg_order_value: 0,
                cancelled_count: 0, cancelled_billed: 0,
                invoice_first: null, invoice_last: null,
                ar_outstanding: 0, delivered_count: 0,
                by_payment_method: [], daily: [], by_cashier: [],
                purchases: { total_paid: 0, payment_count: 0, by_payment_method: [] },
                cash_flow: { cash_in_total: 0, cash_out_total: 0, by_category: [] },
            },
        };
    }

    return { status: 'success', data: data as EodReportSummary };
};

/** Fetch ALL transactions for print/PDF — uses the paginated RPC with a large page size */
export const getEodTransactions = async (
    dateFrom: string,
    dateTo: string,
    brand?: string,
): Promise<{ status: 'success'; data: EodTransaction[] }> => {
    const currentBrand = brand || CASHIER_BRAND;
    const { data, error } = await db.rpc('get_eod_transactions_paginated', {
        p_brand: currentBrand,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_page: 1,
        p_page_size: 10000,
        p_tz_offset_minutes: getLocalTzOffsetMinutes(),
    });
    if (error) {
        console.error('Error fetching EOD transactions:', error.message);
        return { status: 'success', data: [] };
    }
    return { status: 'success', data: (data as EodTransactionPage).transactions };
};

/** Fetch paginated + filtered transactions for the table view */
export const getEodTransactionsPaginated = async (
    dateFrom: string,
    dateTo: string,
    filters: EodTransactionFilters = {},
    brand?: string,
): Promise<{ status: 'success'; data: EodTransactionPage }> => {
    const currentBrand = brand || CASHIER_BRAND;
    const { data, error } = await db.rpc('get_eod_transactions_paginated', {
        p_brand: currentBrand,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_page: filters.page || 1,
        p_page_size: filters.pageSize || 25,
        p_search: filters.search || null,
        p_payment_type: filters.paymentType || null,
        p_transaction_type: filters.transactionType || null,
        p_order_type: filters.orderType || null,
        p_tz_offset_minutes: getLocalTzOffsetMinutes(),
    });
    if (error) {
        console.error('Error fetching EOD transactions:', error.message);
        return { status: 'success', data: { transactions: [], total_count: 0, page: 1, page_size: 25 } };
    }
    return { status: 'success', data: data as EodTransactionPage };
};

// ── Register Session ──────────────────────────────────────────────────────────

export type CashMovementReasonCategory =
    | "drop"
    | "pickup"
    | "petty_cash"
    | "bank_deposit"
    | "change_refill"
    | "tip_out"
    | "other";

export interface CashMovementData {
    id: number;
    type: "cash_in" | "cash_out";
    reason_category: CashMovementReasonCategory;
    amount: number;
    reason: string;
    performed_by_name: string;
    created_at: string;
}

/** Session-scoped cash transaction tally. Filled in by get_register_session. */
export interface RegisterTxSummary {
    cash_payment_count: number;
    cash_payment_total: number;
    cash_refund_count: number;
    cash_refund_total: number;
    noncash_payment_count: number;
    noncash_payment_total: number;
}

/** Append-only close-event row. One per close (including reclose after reopen). */
export interface CloseEventData {
    id: number;
    closed_by_name: string;
    closed_at: string;
    opening_float: number;
    counted_cash: number;
    expected_cash: number;
    variance: number;
    notes: string | null;
}

export interface RegisterSessionData {
    id: number;
    brand: string;
    date: string;
    status: "open" | "closed";
    opened_by: string;
    opened_by_name: string;
    opened_at: string;
    opening_float: number;
    closed_by: string | null;
    closed_by_name: string | null;
    closed_at: string | null;
    closing_counted_cash: number | null;
    expected_cash: number | null;
    variance: number | null;
    closing_notes: string | null;
    /** Set when a closed session was reopened. Stays populated through subsequent
     *  closes so reconciliation can flag sessions that were reopened. */
    reopened_by: string | null;
    reopened_by_name: string | null;
    reopened_at: string | null;
    cash_movements: CashMovementData[];
    /** Full close history (latest is also reflected in closing_* fields on the row). */
    close_events: CloseEventData[];
    /** Cash/non-cash transaction tally for this session. */
    tx_summary: RegisterTxSummary;
}

export interface CloseRegisterResult {
    status: string;
    opening_float: number;
    cash_payments: number;
    cash_refunds: number;
    cash_in: number;
    cash_out: number;
    expected_cash: number;
    counted_cash: number;
    variance: number;
}

export const getRegisterSession = async (brand?: string, date?: string) => {
    const currentBrand = brand || CASHIER_BRAND;
    const localDate = date || getLocalDateStr();
    const { data, error } = await db.rpc('get_register_session', {
        p_brand: currentBrand,
        p_date: localDate,
    });
    if (error) {
        console.error('Error fetching register session:', error.message);
        return { status: 'success' as const, data: null };
    }
    return { status: 'success' as const, data: data as RegisterSessionData | null };
};

export const openRegister = async (params: {
    userId: string;
    openingFloat: number;
    brand?: string;
}) => {
    const currentBrand = params.brand || CASHIER_BRAND;
    const localDate = getLocalDateStr();
    const { data, error } = await db.rpc('open_register', {
        p_brand: currentBrand,
        p_date: localDate,
        p_user_id: params.userId,
        p_opening_float: params.openingFloat,
    });
    if (error) return { status: 'error' as const, message: error.message };
    return { status: 'success' as const, data: data as RegisterSessionData };
};

export const closeRegister = async (params: {
    sessionId: number;
    userId: string;
    countedCash: number;
    notes?: string;
    /** Caller-stable UUID — must be the SAME across user-visible retries of the
     *  same close attempt. Generating it here would defeat idem (each retry
     *  would get a fresh key and the server would re-insert close events). */
    idempotencyKey: string;
}) => {
    const { data, error } = await withWriteRetry(
        () => db.rpc('close_register', {
            p_session_id: params.sessionId,
            p_user_id: params.userId,
            p_counted_cash: params.countedCash,
            p_notes: params.notes || null,
            p_tz_offset_minutes: getLocalTzOffsetMinutes(),
            p_idempotency_key: params.idempotencyKey,
        }),
        (r) => isTransientNetworkError(r.error),
    );
    if (error) return { status: 'error' as const, message: error.message };
    return { status: 'success' as const, data: data as CloseRegisterResult };
};

export const reopenRegister = async (params: {
    sessionId: number;
    userId: string;
}) => {
    const { data, error } = await db.rpc('reopen_register', {
        p_session_id: params.sessionId,
        p_user_id: params.userId,
    });
    if (error) return { status: 'error' as const, message: error.message };
    return { status: 'success' as const, data: data as RegisterSessionData };
};

export const addCashMovement = async (params: {
    sessionId: number;
    type: "cash_in" | "cash_out";
    reasonCategory: CashMovementReasonCategory;
    amount: number;
    reason: string;
    userId: string;
    /** Caller-stable UUID — same key across user-visible retries of the same
     *  movement. A fresh key per retry would let a lost-response tail land
     *  the original AND the retry, double-crediting the drawer ledger. */
    idempotencyKey: string;
}) => {
    const { data, error } = await withWriteRetry(
        () => db.rpc('add_cash_movement', {
            p_session_id: params.sessionId,
            p_type: params.type,
            p_amount: params.amount,
            p_reason: params.reason,
            p_user_id: params.userId,
            p_tz_offset_minutes: getLocalTzOffsetMinutes(),
            p_reason_category: params.reasonCategory,
            p_idempotency_key: params.idempotencyKey,
        }),
        (r) => isTransientNetworkError(r.error),
    );
    if (error) return { status: 'error' as const, message: error.message };
    return { status: 'success' as const, data };
};

