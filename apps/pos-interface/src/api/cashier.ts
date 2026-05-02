import type { ApiResponse } from "../types/api";
import type { Order } from "@repo/database";
import { db } from "@/lib/db";
import { getLocalDateStr, getLocalTzOffsetMinutes, getKuwaitMidnight } from "@/lib/utils";

/** Cashier is ERTH-only — no SAKKBA or QASS orders */
const CASHIER_BRAND = "ERTH" as const;


const CASHIER_ORDER_QUERY = `
    *,
    workOrder:work_orders!order_id(invoice_number, invoice_revision, order_phase, delivery_date, home_delivery, campaign_id, stitching_charge, fabric_charge, style_charge, campaign:campaigns(name)),
    customer:customers(id, name, phone, country_code, account_type, relation, city, area, block, street, house_no, address_note),
    discount_approver:users!discount_approved_by(id, name),
    garments:garments(id, garment_id, piece_stage, location, garment_type, trip_number, feedback_status, acceptance_status, fabric_id, style, express, soaking, soaking_hours, fabric_price_snapshot, stitching_price_snapshot, style_price_snapshot, refunded_fabric, refunded_stitching, refunded_style, refunded_express, refunded_soaking, collar_type, collar_button, collar_position, cuffs_type, jabzour_1, jabzour_thickness, fabric_length, fabric:fabrics(id, name)),
    shelf_items:order_shelf_items(id, shelf_id, quantity, unit_price, refunded_qty, shelf:shelf(type, brand)),
    payment_transactions:payment_transactions(id, amount, transaction_type, payment_type, payment_ref_no, payment_note, refund_reason, refund_items, created_at, cashier_id, cashier:users(name))
`;

// Same as above but with !inner join on work_orders (for filtering by invoice_number)
const CASHIER_ORDER_QUERY_INNER = CASHIER_ORDER_QUERY.replace(
    'workOrder:work_orders!order_id(',
    'workOrder:work_orders!order_id!inner('
);

function flattenCashierOrder(data: any): Order | null {
    if (!data) return null;
    const { workOrder, customer, taker, ...core } = data;
    const workData = Array.isArray(workOrder) ? workOrder[0] : workOrder;
    const customerData = Array.isArray(customer) ? customer[0] : customer;
    const takerData = Array.isArray(taker) ? taker[0] : taker;
    return {
        ...core,
        ...workData,
        customer: customerData,
        taker: takerData,
    };
}

// Lightweight select for order list (no garments, no transactions)
const CASHIER_ORDER_LIST_QUERY = `
    id, order_type, checkout_status, order_total, paid, order_date, brand, discount_value,
    workOrder:work_orders!order_id(invoice_number, invoice_revision, order_phase, delivery_date, home_delivery),
    customer:customers(name, phone),
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
}

function flattenOrderListItem(data: any): CashierOrderListItem {
    const workData = Array.isArray(data.workOrder) ? data.workOrder[0] : data.workOrder;
    const customerData = Array.isArray(data.customer) ? data.customer[0] : data.customer;
    const garments = Array.isArray(data.garments) ? data.garments : [];
    const readyStages = ["ready_for_pickup", "brova_trialed", "awaiting_trial"];
    return {
        id: data.id,
        order_type: data.order_type,
        checkout_status: data.checkout_status,
        order_total: Number(data.order_total) || 0,
        paid: Number(data.paid) || 0,
        order_date: data.order_date,
        invoice_number: workData?.invoice_number,
        invoice_revision: workData?.invoice_revision ?? 0,
        order_phase: workData?.order_phase,
        delivery_date: workData?.delivery_date,
        home_delivery: workData?.home_delivery,
        customer_name: customerData?.name,
        customer_phone: customerData?.phone,
        garment_total: garments.length,
        garment_ready: garments.filter((g: any) => g.location === "shop" && readyStages.includes(g.piece_stage)).length,
    };
}

export interface CashierSummary {
    all_billed: number;
    all_collected: number;
    all_outstanding: number;
    today_count: number;
    today_billed: number;
    today_paid: number;
    /** Actual cash received today (from payment_transactions) */
    today_collected: number;
    today_refunded: number;
    month_billed: number;
    month_paid: number;
    month_outstanding: number;
    /** Actual cash received this month (from payment_transactions) */
    month_collected: number;
    month_refunded: number;
    work_count: number;
    sales_count: number;
    unpaid_count: number;
    work_billed: number;
    sales_billed: number;
    month_work_billed: number;
    month_sales_billed: number;
}

export const getCashierSummary = async (brand?: string): Promise<{ status: 'success'; data: CashierSummary }> => {
    const currentBrand = brand || CASHIER_BRAND;
    // Pass local date to handle timezone correctly (Supabase runs in UTC)
    const { data, error } = await db.rpc('get_cashier_summary', { p_brand: currentBrand, p_today: getLocalDateStr(), p_tz_offset_minutes: getLocalTzOffsetMinutes() });
    if (error) {
        console.error('Error fetching cashier summary:', error.message);
        return { status: 'success', data: { all_billed: 0, all_collected: 0, all_outstanding: 0, today_count: 0, today_billed: 0, today_paid: 0, today_collected: 0, today_refunded: 0, month_billed: 0, month_paid: 0, month_outstanding: 0, month_collected: 0, month_refunded: 0, work_count: 0, sales_count: 0, unpaid_count: 0, work_billed: 0, sales_billed: 0, month_work_billed: 0, month_sales_billed: 0 } };
    }
    return { status: 'success', data: data as CashierSummary };
};

export type CashierFilter = "all" | "today" | "unpaid" | "paid" | "work" | "sales";

export const getRecentCashierOrders = async (filter: CashierFilter = "all", brand?: string): Promise<{ status: 'success'; data: CashierOrderListItem[] }> => {
    const currentBrand = brand || CASHIER_BRAND;

    const today = new Date();
    // For paid/unpaid: use server-side RPC to get exact IDs (column comparison done in SQL)
    if (filter === "paid" || filter === "unpaid") {
        const { data: ids, error: rpcError } = await db.rpc('get_cashier_order_ids_by_payment', {
            p_brand: currentBrand,
            p_filter: filter,
            p_limit: 30,
        });

        if (rpcError || !ids || ids.length === 0) {
            if (rpcError) console.error('Error fetching paid/unpaid order IDs:', rpcError.message);
            return { status: 'success', data: [] };
        }

        const { data, error } = await db
            .from('orders')
            .select(CASHIER_ORDER_LIST_QUERY)
            .in('id', ids)
            .order('order_date', { ascending: false });

        if (error) {
            console.error('Error fetching paid/unpaid orders:', error.message);
            return { status: 'success', data: [] };
        }

        return { status: 'success', data: (data || []).map(flattenOrderListItem) };
    }

    // For other filters: simple query with limit
    let query = db
        .from('orders')
        .select(CASHIER_ORDER_LIST_QUERY)
        .eq('brand', currentBrand)
        .neq('checkout_status', 'draft');

    switch (filter) {
        case "today": {
            // order_date stores UTC. Convert Kuwait day boundaries to UTC for correct filtering.
            const startOfDay = getKuwaitMidnight(new Date(today));
            const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
            query = query.gte('order_date', startOfDay.toISOString()).lte('order_date', endOfDay.toISOString());
            break;
        }
        case "work":
            query = query.eq('order_type', 'WORK');
            break;
        case "sales":
            query = query.eq('order_type', 'SALES');
            break;
    }

    const { data, error } = await query
        .order('order_date', { ascending: false })
        .limit(30);

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
            return { status: 'success', data: flattenCashierOrder(byId) as Order };
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
            return { status: 'success', data: flattenCashierOrder(byInvoice) as Order };
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
            return { status: 'success', data: flattenCashierOrder(byCustomer) as Order };
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

    const customerIds = (customers || []).map((c: any) => c.id);

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

export interface EodReportSummary {
    total_collected: number;
    total_refunded: number;
    net_revenue: number;
    transaction_count: number;
    order_count: number;
    work_count: number;
    sales_count: number;
    total_billed: number;
    outstanding: number;
    avg_order_value: number;
    by_payment_method: EodPaymentMethodBreakdown[];
    daily: EodDailyData[];
    by_cashier: EodCashierData[];
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
                order_count: 0, work_count: 0, sales_count: 0, total_billed: 0,
                outstanding: 0, avg_order_value: 0, by_payment_method: [],
                daily: [], by_cashier: [],
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

export interface CashMovementData {
    id: number;
    type: "cash_in" | "cash_out";
    amount: number;
    reason: string;
    performed_by_name: string;
    created_at: string;
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
    return { status: 'success' as const, data };
};

export const closeRegister = async (params: {
    sessionId: number;
    userId: string;
    countedCash: number;
    notes?: string;
}) => {
    const { data, error } = await db.rpc('close_register', {
        p_session_id: params.sessionId,
        p_user_id: params.userId,
        p_counted_cash: params.countedCash,
        p_notes: params.notes || null,
        p_tz_offset_minutes: getLocalTzOffsetMinutes(),
    });
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
    return { status: 'success' as const, data };
};

export const addCashMovement = async (params: {
    sessionId: number;
    type: "cash_in" | "cash_out";
    amount: number;
    reason: string;
    userId: string;
}) => {
    const { data, error } = await db.rpc('add_cash_movement', {
        p_session_id: params.sessionId,
        p_type: params.type,
        p_amount: params.amount,
        p_reason: params.reason,
        p_user_id: params.userId,
        p_tz_offset_minutes: getLocalTzOffsetMinutes(),
    });
    if (error) return { status: 'error' as const, message: error.message };
    return { status: 'success' as const, data };
};

