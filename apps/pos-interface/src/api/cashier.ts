import type { ApiResponse } from "../types/api";
import type { Order } from "@repo/database";
import { db } from "@/lib/db";
import { getBrand } from "./orders";


const CASHIER_ORDER_QUERY = `
    *,
    workOrder:work_orders!order_id(invoice_number, order_phase, delivery_date, home_delivery, campaign_id, campaign:campaigns(name)),
    customer:customers(id, name, phone, country_code, account_type, relation, city, area, block, street, house_no, address_note),
    garments:garments(id, garment_id, piece_stage, location, garment_type, trip_number, feedback_status, acceptance_status, fabric_id, style, express),
    shelf_items:order_shelf_items(id, shelf_id, quantity, unit_price, shelf:shelf(type)),
    payment_transactions:payment_transactions(id, amount, transaction_type, payment_type, payment_ref_no, payment_note, created_at, cashier_id, cashier:users(name))
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
    workOrder:work_orders!order_id(invoice_number, order_phase, delivery_date, home_delivery),
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
    const currentBrand = brand || getBrand();
    // Pass local date to handle timezone correctly (Supabase runs in UTC)
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const { data, error } = await db.rpc('get_cashier_summary', { p_brand: currentBrand, p_today: localToday });
    if (error) {
        console.error('Error fetching cashier summary:', error.message);
        return { status: 'success', data: { all_billed: 0, all_collected: 0, all_outstanding: 0, today_count: 0, today_billed: 0, today_paid: 0, today_collected: 0, today_refunded: 0, month_billed: 0, month_paid: 0, month_outstanding: 0, month_collected: 0, month_refunded: 0, work_count: 0, sales_count: 0, unpaid_count: 0, work_billed: 0, sales_billed: 0, month_work_billed: 0, month_sales_billed: 0 } };
    }
    return { status: 'success', data: data as CashierSummary };
};

export type CashierFilter = "all" | "today" | "unpaid" | "paid" | "work" | "sales";

export const getRecentCashierOrders = async (filter: CashierFilter = "all", brand?: string): Promise<{ status: 'success'; data: CashierOrderListItem[] }> => {
    const currentBrand = brand || getBrand();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
        case "today":
            query = query.gte('order_date', `${todayStr}T00:00:00`).lte('order_date', `${todayStr}T23:59:59`);
            break;
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
    const currentBrand = brand || getBrand();
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
    const currentBrand = brand || getBrand();
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
}) => {
    const { data, error } = await db.rpc('update_order_discount', {
        p_order_id: params.orderId,
        p_discount_type: params.discountType,
        p_discount_value: params.discountValue,
        p_discount_percentage: params.discountPercentage || null,
        p_referral_code: params.referralCode || null,
        p_new_order_total: params.newOrderTotal || null,
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

