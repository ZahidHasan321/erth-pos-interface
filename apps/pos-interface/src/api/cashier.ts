import type { ApiResponse } from "../types/api";
import type { Order } from "@repo/database";
import { supabase } from "../lib/supabase";
import { getBrand } from "./orders";

const CASHIER_ORDER_QUERY = `
    *,
    workOrder:work_orders!order_id(*, campaign:campaigns(name)),
    customer:customers(*),
    garments:garments(*, fabric:fabrics(*)),
    shelf_items:order_shelf_items(*, shelf:shelf(*)),
    payment_transactions:payment_transactions(*, cashier:users(name))
`;

const CASHIER_ORDER_QUERY_FALLBACK = `
    *,
    workOrder:work_orders!order_id(*, campaign:campaigns(name)),
    customer:customers(*),
    garments:garments(*, fabric:fabrics(*)),
    shelf_items:order_shelf_items(*, shelf:shelf(*))
`;

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

/**
 * Try a query with the full select (including payment_transactions).
 * If it 400s (table doesn't exist), retry with fallback select.
 */
async function queryWithFallback(
    buildQuery: (selectStr: string) => any
): Promise<any> {
    const { data, error } = await buildQuery(CASHIER_ORDER_QUERY);
    if (error) {
        // Table might not exist yet — retry without payment_transactions
        const fallback = await buildQuery(CASHIER_ORDER_QUERY_FALLBACK);
        if (fallback.error) {
            console.error('Cashier query fallback error:', fallback.error.message);
            return null;
        }
        return fallback.data;
    }
    return data;
}

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
        const byId = await queryWithFallback((sel) =>
            supabase
                .from('orders')
                .select(sel)
                .eq('id', numericVal)
                .eq('brand', currentBrand)
                .neq('checkout_status', 'draft')
                .maybeSingle()
        );
        if (byId) {
            return { status: 'success', data: flattenCashierOrder(byId) as Order };
        }

        // Try by invoice number (needs !inner join)
        const byInvoice = await queryWithFallback((sel) => {
            const invoiceSel = sel.replace(
                'workOrder:work_orders!order_id(*)',
                'workOrder:work_orders!order_id!inner(*)'
            );
            return supabase
                .from('orders')
                .select(invoiceSel)
                .eq('brand', currentBrand)
                .neq('checkout_status', 'draft')
                .eq('workOrder.invoice_number', numericVal)
                .maybeSingle();
        });
        if (byInvoice) {
            return { status: 'success', data: flattenCashierOrder(byInvoice) as Order };
        }
    }

    // Try by customer phone (two-step: find customer, then their latest order)
    const { data: customers } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', trimmed)
        .limit(1);

    if (customers && customers.length > 0) {
        const byPhone = await queryWithFallback((sel) =>
            supabase
                .from('orders')
                .select(sel)
                .eq('brand', currentBrand)
                .neq('checkout_status', 'draft')
                .eq('customer_id', customers[0].id)
                .order('order_date', { ascending: false })
                .limit(1)
                .maybeSingle()
        );
        if (byPhone) {
            return { status: 'success', data: flattenCashierOrder(byPhone) as Order };
        }
    }

    return { status: 'error', message: 'Order not found' };
};

export const getPaymentTransactions = async (orderId: number) => {
    const { data, error } = await supabase
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
}) => {
    const { data, error } = await supabase.rpc('record_payment_transaction', {
        p_order_id: params.orderId,
        p_amount: params.amount,
        p_payment_type: params.paymentType,
        p_payment_ref_no: params.paymentRefNo || null,
        p_payment_note: params.paymentNote || null,
        p_cashier_id: params.cashierId || null,
        p_transaction_type: params.transactionType,
        p_refund_reason: params.refundReason || null,
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
    const { data, error } = await supabase.rpc('update_order_discount', {
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

export const collectGarments = async (params: {
    orderId: number;
    garmentIds: string[];
    fulfillmentType: string;
    updateHomeDelivery?: boolean;
    homeDelivery?: boolean;
}) => {
    const { data, error } = await supabase.rpc('collect_garments', {
        p_order_id: params.orderId,
        p_garment_ids: params.garmentIds,
        p_fulfillment_type: params.fulfillmentType,
        p_update_home_delivery: params.updateHomeDelivery || false,
        p_home_delivery: params.homeDelivery || false,
    });

    if (error) {
        return { status: 'error' as const, message: error.message };
    }
    return { status: 'success' as const, data };
};
