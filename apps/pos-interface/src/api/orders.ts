import type { ApiResponse } from "../types/api";
import type { Order } from "@repo/database";
import { supabase } from "../lib/supabase";
import { BRAND_NAMES } from "../lib/constants";

const TABLE_NAME = "orders";

const getBrand = (): "ERTH" | "SAKKBA" => {
    const raw = localStorage.getItem('tanstack.auth.user');
    const user = raw ? JSON.parse(raw) : null;
    return user?.userType === BRAND_NAMES.fromHome ? "SAKKBA" : "ERTH";
};

/**
 * Helper to flatten joined work_orders into the main order object
 */
function flattenOrder<T>(data: T[]): Order[];
function flattenOrder<T>(data: T): Order;
function flattenOrder(data: any): any {
    if (!data) return null;
    if (Array.isArray(data)) return data.map(flattenOrder);

    const { workOrder, customer, taker, ...core } = data;
    
    // Flatten relations that might be returned as single-item arrays
    const workData = Array.isArray(workOrder) ? workOrder[0] : workOrder;
    const customerData = Array.isArray(customer) ? customer[0] : customer;
    const takerData = Array.isArray(taker) ? taker[0] : taker;
    
    return {
        ...core,
        ...workData,
        customer: customerData,
        taker: takerData
    };
}

/**
 * Map of frontend keys to DB paths for filtering
 */
const FILTER_MAP: Record<string, string> = {
    invoice_number: 'workOrder.invoice_number',
    delivery_date: 'workOrder.delivery_date',
    production_stage: 'workOrder.production_stage',
    campaign_id: 'workOrder.campaign_id',
};

export const getOrders = async (): Promise<ApiResponse<Order[]>> => {
    const { data, error, count } = await supabase
        .from(TABLE_NAME)
        .select('*, workOrder:work_orders!order_id(*)', { count: 'exact' })
        .eq('brand', getBrand());

    if (error) {
        console.error('Error fetching orders:', error);
        return { status: 'error', message: error.message, data: [], count: 0 };
    }
    return { status: 'success', data: flattenOrder(data), count: count || 0 };
};

export const searchOrders = async (
    query: Record<string, any>,
): Promise<ApiResponse<Order[]>> => {
    let builder = supabase.from(TABLE_NAME)
        .select('*, workOrder:work_orders!order_id(*)', { count: 'exact' })
        .eq('brand', getBrand());

    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            const dbKey = FILTER_MAP[key] || key;
            builder = builder.eq(dbKey, value);
        }
    });

    const { data, error, count } = await builder;

    if (error) {
        return { status: 'error', message: error.message, data: [], count: 0 };
    }
    return { status: 'success', data: flattenOrder(data), count: count || 0 };
};

const ORDER_DETAILS_QUERY = `
    *,
    workOrder:work_orders!order_id(*),
    customer:customers(*),
    garments:garments(*, fabric:fabrics(*)),
    shelf_items:order_shelf_items(*, shelf:shelf(*))
`;

export const getOrderById = async (id: number, includeRelations: boolean = false): Promise<ApiResponse<Order>> => {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select(includeRelations ? ORDER_DETAILS_QUERY : '*, workOrder:work_orders!order_id(*)')
        .eq('id', id)
        .eq('brand', getBrand())
        .maybeSingle();

    if (error) return { status: 'error', message: error.message };
    return { status: 'success', data: flattenOrder(data) as Order };
};

export const getOrderByInvoice = async (invoiceNumber: number, includeRelations: boolean = false): Promise<ApiResponse<Order>> => {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select(includeRelations ? ORDER_DETAILS_QUERY : '*, workOrder:work_orders!order_id!inner(*)')
        .eq('workOrder.invoice_number', invoiceNumber)
        .eq('brand', getBrand())
        .maybeSingle();

    if (error) return { status: 'error', message: error.message };
    return { status: 'success', data: flattenOrder(data) as Order };
};

/**
 * Specialized fetch for Linking interface. 
 * Includes basic order data plus a check for any child orders.
 */
export const getOrdersForLinking = async (
    customerId: number,
    checkoutStatus: string = "confirmed"
): Promise<ApiResponse<Order[]>> => {
    const { data, error, count } = await supabase
        .from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id(*),
            customer:customers(*),
            child_orders:work_orders!linked_order_id(id:order_id)
        `, { count: 'exact' })
        .eq('customer_id', customerId)
        .eq('checkout_status', checkoutStatus)
        .eq('order_type', 'WORK')
        .eq('brand', getBrand())
        .order('order_date', { ascending: false });

    if (error) {
        return { status: 'error', message: error.message, data: [], count: 0 };
    }

    return {
        status: 'success',
        data: flattenOrder(data),
        count: count || 0,
    };
};

/**
 * Direct lookup specialized for Linking interface.
 */
export const getOrderForLinking = async (idOrInvoice: number): Promise<ApiResponse<Order>> => {
    // 1. Try by ID
    const { data: resId } = await supabase.from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id(*),
            customer:customers(*),
            child_orders:work_orders!linked_order_id(id:order_id)
        `)
        .eq('id', idOrInvoice)
        .eq('brand', getBrand())
        .maybeSingle();
    
    if (resId) return { status: 'success', data: flattenOrder(resId) };
    
    // 2. Try by Invoice Number
    const { data: resInv } = await supabase.from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id!inner(*),
            customer:customers(*),
            child_orders:work_orders!linked_order_id(id:order_id)
        `)
        .eq('workOrder.invoice_number', idOrInvoice)
        .eq('brand', getBrand())
        .maybeSingle();
        
    if (resInv) return { status: 'success', data: flattenOrder(resInv) };
    
    return { status: 'error', message: "Order not found" };
};

export const createOrder = async (
    order: Partial<Order>,
): Promise<ApiResponse<Order>> => {
    const WORK_FIELDS = [
        'invoice_number', 'delivery_date', 'advance', 'stitching_price', 
        'fabric_charge', 'stitching_charge', 'style_charge', 'campaign_id', 
        'num_of_fabrics', 'home_delivery', 'production_stage', 'call_status', 
        'linked_order_id', 'linked_date', 'unlinked_date',
        'r1_date', 'r2_date', 'r3_date', 'call_reminder_date', 'escalation_date',
        'r1_notes', 'r2_notes', 'r3_notes', 'call_notes', 'escalation_notes'
    ];
    
    const coreFields: any = { ...order, brand: getBrand() };
    const workFields: any = {};
    
    WORK_FIELDS.forEach(f => {
        if (f in coreFields) {
            workFields[f] = coreFields[f];
            delete coreFields[f];
        }
    });

    const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert(coreFields)
        .select()
        .single();

    if (error) {
        console.error('Error creating order:', error);
        return { status: 'error', message: error.message };
    }

    if (Object.keys(workFields).length > 0 || order.order_type === 'WORK') {
        const { error: workError } = await supabase
            .from('work_orders')
            .insert({ order_id: data.id, ...workFields });
        
        if (workError) {
            console.error('Error creating work order extension:', workError);
        }
    }

    return getOrderById(data.id);
};

export const updateOrder = async (
    order: Partial<Order>,
    orderId: number,
): Promise<ApiResponse<Order>> => {
    const WORK_FIELDS = [
        'invoice_number', 'delivery_date', 'advance', 'stitching_price', 
        'fabric_charge', 'stitching_charge', 'style_charge', 'campaign_id', 
        'num_of_fabrics', 'home_delivery', 'production_stage', 'call_status', 
        'linked_order_id', 'linked_date', 'unlinked_date',
        'r1_date', 'r2_date', 'r3_date', 'call_reminder_date', 'escalation_date',
        'r1_notes', 'r2_notes', 'r3_notes', 'call_notes', 'escalation_notes'
    ];
    
    const coreUpdates: any = { ...order };
    const workUpdates: any = {};
    
    WORK_FIELDS.forEach(f => {
        if (f in coreUpdates) {
            workUpdates[f] = coreUpdates[f];
            delete coreUpdates[f];
        }
    });

    if (Object.keys(coreUpdates).length > 0) {
        const { error } = await supabase
            .from(TABLE_NAME)
            .update(coreUpdates)
            .eq('id', orderId)
            .eq('brand', getBrand());

        if (error) {
            console.error('Error updating order core:', error);
            return { status: 'error', message: error.message };
        }
    }

    if (Object.keys(workUpdates).length > 0) {
        const { error } = await supabase
            .from('work_orders')
            .upsert({ order_id: orderId, ...workUpdates });
        
        if (error) {
            console.error('Error updating work order extension:', error);
            return { status: 'error', message: error.message };
        }
    }

    return getOrderById(orderId);
};

export const deleteOrder = async (
    orderId: number,
): Promise<ApiResponse<void>> => {
    const { error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('id', orderId)
        .eq('brand', getBrand());

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
    includeRelations: boolean = false
): Promise<ApiResponse<Order[]>> => {
    const selectString = includeRelations ? ORDER_DETAILS_QUERY : '*, workOrder:work_orders!order_id(*)';

    const { data, error, count } = await supabase
        .from(TABLE_NAME)
        .select(selectString, { count: 'exact' })
        .eq('customer_id', customerId)
        .eq('checkout_status', checkoutStatus)
        .or('order_type.eq.WORK,order_type.is.null')
        .eq('brand', getBrand())
        .order('order_date', { ascending: false })
        .limit(limit);


    if (error) {
        return { status: 'error', message: error.message, data: [], count: 0 };
    }

    return {
        status: 'success',
        data: flattenOrder(data),
        count: count || 0,
    };
};

/**
 * Get detailed order information including customer and garments.
 */
export const getOrderDetails = async (idOrInvoice: string | number, includeRelations: boolean = false): Promise<ApiResponse<Order>> => {
    const numericVal = typeof idOrInvoice === 'string' ? parseInt(idOrInvoice) : idOrInvoice;

    if (isNaN(numericVal)) {
        return { status: 'error', message: "Invalid ID or Invoice Number" };
    }

    // Try ID first
    const resId = await getOrderById(numericVal, includeRelations);
    if (resId.status === 'success' && resId.data) return resId as ApiResponse<Order>;

    // Try Invoice Number
    const resInv = await getOrderByInvoice(numericVal, includeRelations);
    if (resInv.status === 'success' && resInv.data) return resInv as ApiResponse<Order>;
    
    return { status: 'error', message: "Order not found" };
};

/**
 * Get filtered list of orders with details.
 */
export const getOrdersList = async (filters: Record<string, any>): Promise<ApiResponse<Order[]>> => {
    const hasWorkOrderFilter = Object.keys(filters).some(key => key in FILTER_MAP);
    
    let builder = supabase.from(TABLE_NAME).select(`
        *,
        workOrder:work_orders!order_id${hasWorkOrderFilter ? '!inner' : ''}(*),
        customer:customers(*),
        garments:garments(*)
    `).eq('brand', getBrand());

    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
            const dbKey = FILTER_MAP[key] || key;
            builder = builder.eq(dbKey, value);
        }
    });

    const { data, error } = await builder;
    if (error) return { status: 'error', message: error.message, data: [] };
    return { status: 'success', data: flattenOrder(data) };
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
        deliveryDate?: string;
        stitchingPrice?: number;
    },
    shelfItems: { id: number; quantity: number }[],
    fabricItems: { id: number; length: number }[]
): Promise<ApiResponse<Order>> => {
    // We check for brand but complete_work_order RPC doesn't take brand yet, 
    // it updates existing order. We should ensure we only update OUR brand order.
    const check = await getOrderById(orderId);
    if (check.status !== 'success' || !check.data) {
        return { status: 'error', message: "Order not found or access denied" };
    }

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
        total: number;
        shelfCharge: number;
        deliveryCharge?: number;
    },
    shelfItems: { id: number; quantity: number; unitPrice: number }[]
): Promise<ApiResponse<Order>> => {
    const check = await getOrderById(orderId);
    if (check.status !== 'success' || !check.data) {
        return { status: 'error', message: "Order not found or access denied" };
    }

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
        deliveryCharge?: number;
        brand?: string;
    },
    shelfItems: { id: number; quantity: number; unitPrice: number }[]
): Promise<ApiResponse<Order>> => {
    const { data, error } = await supabase.rpc('create_complete_sales_order', {
        p_customer_id: customerId,
        p_checkout_details: { ...checkoutDetails, brand: getBrand() },
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
        home_delivery?: boolean;
    }
): Promise<ApiResponse<any>> => {
    const check = await getOrderById(orderId);
    if (check.status !== 'success' || !check.data) {
        return { status: 'error', message: "Order not found or access denied" };
    }

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

/**
 * Fetch all orders that are currently linked to another order.
 * Returns the child orders with their primary order information.
 */
export const getLinkedOrders = async (): Promise<ApiResponse<Order[]>> => {
    // First, get all linked orders (children)
    const { data, error, count } = await supabase
        .from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id!inner(*),
            customer:customers!customer_id(*)
        `)
        .not('workOrder.linked_order_id', 'is', null)
        .eq('brand', getBrand());

    if (error) {
        console.error('Error fetching linked orders:', error);
        return { status: 'error', message: error.message, data: [], count: 0 };
    }

    if (!data || data.length === 0) {
        return { status: 'success', data: [], count: 0 };
    }

    const flattened = flattenOrder(data);

    // Get unique primary IDs
    const primaryIds = [...new Set(flattened.map(o => o.linked_order_id).filter(Boolean))];

    // Fetch primary details separately
    if (primaryIds.length > 0) {
        const { data: primaries } = await supabase
            .from(TABLE_NAME)
            .select(`
                *,
                customer:customers!customer_id(name, phone),
                workOrder:work_orders!order_id(invoice_number, delivery_date, production_stage)
            `)
            .in('id', primaryIds);

        if (primaries) {
            // Attach primary details to each child order
            flattened.forEach((order: any) => {
                const primaryRaw = primaries.find(p => p.id === order.linked_order_id);
                if (primaryRaw) {
                    // Flatten the primary data correctly
                    const { workOrder, customer, ...core } = primaryRaw;
                    const workData = Array.isArray(workOrder) ? workOrder[0] : workOrder;
                    const customerData = Array.isArray(customer) ? customer[0] : customer;
                    order.linkedTo = {
                        ...core,
                        ...workData,
                        customer: customerData
                    };
                }
            });
        }
    }

    return { status: 'success', data: flattened, count: count || 0 };
};