import type { ApiResponse } from "../types/api";
import type { Order } from "@repo/database";
import { supabase } from "../lib/supabase";

const TABLE_NAME = "orders";

export const getOrders = async (): Promise<ApiResponse<Order[]>> => {
    const { data, error, count } = await supabase
        .from(TABLE_NAME)
        .select('*', { count: 'exact' });

    if (error) {
        console.error('Error fetching orders:', error);
        return { status: 'error', message: error.message, data: [], count: 0 };
    }
    return { status: 'success', data: data as any, count: count || 0 };
};

export const searchOrders = async (
    query: Record<string, any>,
): Promise<ApiResponse<Order[]>> => {
    // Basic implementation of search - Supabase doesn't support generic object search easily like Airtable wrapper
    // We'll implement basic equality checks for provided keys
    let builder = supabase.from(TABLE_NAME).select('*', { count: 'exact' });

    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            builder = builder.eq(key, value);
        }
    });

    const { data, error, count } = await builder;

    if (error) {
        return { status: 'error', message: error.message, data: [], count: 0 };
    }
    return { status: 'success', data: data as any, count: count || 0 };
};

export const getOrderById = async (id: number): Promise<ApiResponse<Order>> => {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        return { status: 'error', message: error.message };
    }
    return { status: 'success', data: data as any };
};

export const createOrder = async (
    order: Partial<Order>,
): Promise<ApiResponse<Order>> => {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert(order)
        .select()
        .single();

    if (error) {
        console.error('Error creating order:', error);
        return { status: 'error', message: error.message };
    }
    return { status: 'success', data: data as any };
};

export const updateOrder = async (
    order: Partial<Order>,
    orderId: number,
): Promise<ApiResponse<Order>> => {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .update(order)
        .eq('id', orderId)
        .select()
        .single();

    if (error) {
        console.error('Error updating order:', error);
        return { status: 'error', message: error.message };
    }
    return { status: 'success', data: data as any };
};

export const deleteOrder = async (
    orderId: number,
): Promise<ApiResponse<void>> => {
    const { error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('id', orderId);

    if (error) {
        throw new Error(`Failed to delete order ${orderId}: ${error.message}`);
    }

    return { status: 'success' };
};

/**
 * Fetch pending work orders for a specific customer
 */
export const getPendingOrdersByCustomer = async (
    customerId: number | string,
    limit: number = 5,
    checkoutStatus: string = "draft",
): Promise<ApiResponse<Order[]>> => {
    const { data, error, count } = await supabase
        .from(TABLE_NAME)
        .select('*', { count: 'exact' })
        .eq('customer_id', customerId)
        .eq('checkout_status', checkoutStatus)
        .eq('order_type', 'WORK')
        .order('order_date', { ascending: false })
        .limit(limit);

    if (error) {
        return { status: 'error', message: error.message, data: [], count: 0 };
    }

    return {
        status: 'success',
        data: data as any,
        count: count || 0,
    };
};

/**
 * Get detailed order information including customer and garments.
 */
export const getOrderDetails = async (idOrInvoice: string | number): Promise<ApiResponse<any>> => {
    let builder = supabase.from(TABLE_NAME).select(`
    *,
    customer:customers(*),
    garments:garments(*),
    shelf_items:order_shelf_items(*, shelf:shelf(*))
  `);

    const numericVal = typeof idOrInvoice === 'string' ? parseInt(idOrInvoice) : idOrInvoice;

    if (isNaN(numericVal)) {
        return { status: 'error', message: "Invalid ID or Invoice Number" };
    }

    // Try ID first
    const { data: byId, error: errorId } = await builder.eq('id', numericVal).single();
    if (!errorId) return { status: 'success', data: byId };

    // Try Invoice Number
    const { data: byInvoice, error: errorInvoice } = await builder.eq('invoice_number', numericVal).single();
    if (errorInvoice) return { status: 'error', message: errorInvoice.message };
    
    return { status: 'success', data: byInvoice };
};

/**
 * Get filtered list of orders with details.
 */
export const getOrdersList = async (filters: Record<string, any>): Promise<ApiResponse<any[]>> => {
    let builder = supabase.from(TABLE_NAME).select(`
    *,
    customer:customers(*),
    garments:garments(*)
  `);

    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
            builder = builder.eq(key, value);
        }
    });

    const { data, error } = await builder;
    if (error) return { status: 'error', message: error.message, data: [] };
    return { status: 'success', data: data as any[] };
};

export const completeWorkOrder = async (
    orderId: number,
    checkoutDetails: {
        paymentType: string;
        paid: number | null | undefined;
        paymentRefNo?: string;
        paymentNote?: string;
        orderTaker?: string;
        discountType?: string;
        discountValue?: number;
        discountPercentage?: number;
        referralCode?: string;
        orderTotal?: number;
        advance?: number;
        fabricCharge?: number;
        stitchingCharge?: number;
        styleCharge?: number;
        deliveryCharge?: number;
        shelfCharge?: number;
        homeDelivery?: boolean;
    },
    shelfItems: { id: number; quantity: number }[],
    fabricItems: { id: number; length: number }[]
): Promise<ApiResponse<Order>> => {
    const { data, error } = await supabase.rpc('complete_work_order', {
        p_order_id: orderId,
        p_checkout_details: checkoutDetails,
        p_shelf_items: shelfItems,
        p_fabric_items: fabricItems
    });

    if (error) {
        console.error('Error completing work order:', error);
        return { status: 'error', message: error.message };
    }
    return { status: 'success', data: data as any };
};

export const completeSalesOrder = async (
    orderId: number,
    checkoutDetails: {
        paymentType: string;
        paid: number | null | undefined;
        paymentRefNo?: string;
        paymentNote?: string;
        orderTaker?: string;
        discountType?: string;
        discountValue?: number;
        discountPercentage?: number;
        referralCode?: string;
    },
    shelfItems: { id: number; quantity: number; unitPrice: number }[]
): Promise<ApiResponse<Order>> => {
    const { data, error } = await supabase.rpc('complete_sales_order', {
        p_order_id: orderId,
        p_checkout_details: checkoutDetails,
        p_shelf_items: shelfItems
    });

    if (error) {
        console.error('Error completing sales order:', error);
        return { status: 'error', message: error.message };
    }
    return { status: 'success', data: data as any };
};

export const createCompleteSalesOrder = async (
    customerId: number,
    checkoutDetails: {
        paymentType: string;
        paid: number | null | undefined;
        paymentRefNo?: string;
        paymentNote?: string;
        orderTaker?: string;
        discountType?: string;
        discountValue?: number;
        discountPercentage?: number;
        referralCode?: string;
        notes?: string;
        total: number;
        shelfCharge: number;
    },
    shelfItems: { id: number; quantity: number; unitPrice: number }[]
): Promise<ApiResponse<Order>> => {
    const { data, error } = await supabase.rpc('create_complete_sales_order', {
        p_customer_id: customerId,
        p_checkout_details: checkoutDetails,
        p_shelf_items: shelfItems
    });

    if (error) {
        console.error('Error creating complete sales order:', error);
        return { status: 'error', message: error.message };
    }
    return { status: 'success', data: data as any };
};

export const saveWorkOrderGarments = async (
    orderId: number,
    garments: any[],
    orderUpdates: {
        num_of_fabrics: number;
        fabric_charge: number;
        stitching_charge: number;
        style_charge: number;
        stitching_price: number;
        delivery_date?: string;
    }
): Promise<ApiResponse<any>> => {
    const { data, error } = await supabase.rpc('save_work_order_garments', {
        p_order_id: orderId,
        p_garments: garments,
        p_order_updates: orderUpdates
    });

    if (error) {
        console.error('Error saving work order garments:', error);
        return { status: 'error', message: error.message };
    }
    return { status: 'success', data };
};

