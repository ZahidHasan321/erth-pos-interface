import type { ApiResponse } from "../types/api";
import type { Order } from "@repo/database";
import { computeStyleGroups } from "@repo/database";
import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";
import { BRAND_NAMES } from "../lib/constants";

const TABLE_NAME = "orders";

// Bounded replay for write paths that the generic fetch layer refuses to
// retry (it only auto-retries idempotent GET/HEAD — see lib/db.ts). Safe to
// call ONLY when the operation is idempotent: either keyed by an
// idempotency_key/unique constraint, or a server-side idempotent RPC.
const WRITE_RETRY_ATTEMPTS = 3;
const WRITE_RETRY_BASE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Brand is set by the $main route loader before any queries fire.
// This avoids localStorage and keeps brand derived from the URL.
let _currentBrand: "ERTH" | "SAKKBA" | "QASS" = "ERTH";

export const setCurrentBrand = (brand: string): void => {
    if (brand === 'qass') { _currentBrand = "QASS"; return; }
    if (brand === BRAND_NAMES.fromHome) { _currentBrand = "SAKKBA"; return; }
    _currentBrand = "ERTH";
};

export const getBrand = (): "ERTH" | "SAKKBA" | "QASS" => _currentBrand;

/**
 * Helper to flatten joined work_orders into the main order object
 */
function flattenOrder(data: null): null;
function flattenOrder(data: unknown[]): Order[];
function flattenOrder(data: unknown): Order;
function flattenOrder(data: unknown): Order | Order[] | null {
    if (!data) return null;
    if (Array.isArray(data)) return data.map(flattenOrder);

    const { workOrder, alterationOrder, customer, taker, ...core } = data as Record<string, unknown>;

    // Flatten relations that might be returned as single-item arrays
    const workData = Array.isArray(workOrder) ? workOrder[0] : workOrder;
    const altData = Array.isArray(alterationOrder) ? alterationOrder[0] : alterationOrder;
    const customerData = Array.isArray(customer) ? customer[0] : customer;
    const takerData = Array.isArray(taker) ? taker[0] : taker;

    return {
        ...core,
        ...workData,
        ...(altData ?? {}),
        customer: customerData,
        taker: takerData,
    };
}

/**
 * Map of frontend keys to DB paths for filtering
 */
const FILTER_MAP: Record<string, string> = {
    invoice_number: 'workOrder.invoice_number',
    delivery_date: 'workOrder.delivery_date',
    order_phase: 'workOrder.order_phase',
    campaign_id: 'workOrder.campaign_id',
};

export const getOrders = async (): Promise<ApiResponse<Order[]>> => {
    const { data, error } = await db
        .from(TABLE_NAME)
        .select('*, workOrder:work_orders!order_id(*)')
        .eq('brand', getBrand());

    if (error) {
        console.error('Error fetching orders:', error);
        return { status: 'error', message: error.message, data: [] };
    }
    return { status: 'success', data: flattenOrder(data) };
};

export const searchOrders = async (
    query: Record<string, string | number | boolean | undefined>,
): Promise<ApiResponse<Order[]>> => {
    let builder = db.from(TABLE_NAME)
        .select('*, workOrder:work_orders!order_id(*)')
        .eq('brand', getBrand());

    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            const dbKey = FILTER_MAP[key] || key;
            builder = builder.eq(dbKey, value);
        }
    });

    const { data, error } = await builder.limit(500);

    if (error) {
        return { status: 'error', message: error.message, data: [] };
    }
    return { status: 'success', data: flattenOrder(data) };
};

const ORDER_DETAILS_QUERY = `
    *,
    workOrder:work_orders!order_id(*),
    customer:customers(*),
    garments:garments(*, fabric:fabrics(name, color)),
    shelf_items:order_shelf_items(*, shelf:shelf(type, brand))
`;

export const getOrderById = async (id: number, includeRelations: boolean = false): Promise<ApiResponse<Order>> => {
    const { data, error } = await db
        .from(TABLE_NAME)
        .select(includeRelations ? ORDER_DETAILS_QUERY : '*, workOrder:work_orders!order_id(*)')
        .eq('id', id)
        .eq('brand', getBrand())
        .maybeSingle();

    if (error) return { status: 'error', message: error.message };
    return { status: 'success', data: flattenOrder(data) as Order };
};

export const getOrderByInvoice = async (invoiceNumber: number, includeRelations: boolean = false): Promise<ApiResponse<Order>> => {
    const { data, error } = await db
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
    const { data, error, count } = await db
        .from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id!inner(*),
            customer:customers(id, name, nick_name, phone, country_code),
            child_orders:work_orders!linked_order_id(id:order_id)
        `, { count: 'exact' })
        .eq('customer_id', customerId)
        .eq('checkout_status', checkoutStatus)
        .eq('order_type', 'WORK')
        .eq('brand', getBrand())
        .neq('workOrder.order_phase', 'completed')
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
    const { data: resId } = await db.from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id(*),
            customer:customers(id, name, nick_name, phone, country_code),
            child_orders:work_orders!linked_order_id(id:order_id)
        `)
        .eq('id', idOrInvoice)
        .eq('brand', getBrand())
        .eq('order_type', 'WORK')
        .eq('checkout_status', 'confirmed')
        .maybeSingle();

    if (resId) return { status: 'success', data: flattenOrder(resId) };

    // 2. Try by Invoice Number
    const { data: resInv } = await db.from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id!inner(*),
            customer:customers(id, name, nick_name, phone, country_code),
            child_orders:work_orders!linked_order_id(id:order_id)
        `)
        .eq('workOrder.invoice_number', idOrInvoice)
        .eq('brand', getBrand())
        .eq('order_type', 'WORK')
        .eq('checkout_status', 'confirmed')
        .maybeSingle();

    if (resInv) return { status: 'success', data: flattenOrder(resInv) };

    return { status: 'error', message: "Order not found" };
};

/**
 * Fetch orders that have garments in transit to shop or lost in transit.
 */
export const getInTransitToWorkshopOrders = async (): Promise<ApiResponse<Order[]>> => {
    const { data, error, count } = await db
        .from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id(*),
            alterationOrder:alteration_orders!order_id(*),
            customer:customers(id, name, nick_name, phone, country_code),
            garments:garments!inner(*, fabric:fabrics(name, color))
            `, { count: 'exact' })
            .in('garments.location', ['transit_to_workshop', 'lost_in_transit'])
            .eq('brand', getBrand())
            .eq('checkout_status', 'confirmed')
            .in('order_type', ['WORK', 'ALTERATION'])
            .limit(500);

    if (error) {
        console.error('Error fetching in-transit to workshop orders:', error);
        return { status: 'error', message: error.message, data: [], count: 0 };
    }
    return { status: 'success', data: flattenOrder(data), count: count || 0 };
};

export const getDispatchedOrders = async (): Promise<ApiResponse<Order[]>> => {
    const { data, error, count } = await db
        .from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id(*),
            alterationOrder:alteration_orders!order_id(*),
            customer:customers(id, name, nick_name, phone, country_code),
            garments:garments!inner(*, fabric:fabrics(name, color))
            `, { count: 'exact' })
            .in('garments.location', ['transit_to_shop', 'lost_in_transit'])
            .eq('brand', getBrand())
            .eq('checkout_status', 'confirmed')
            .in('order_type', ['WORK', 'ALTERATION'])
            .limit(500);

    if (error) {
        console.error('Error fetching dispatched orders:', error);
        return { status: 'error', message: error.message, data: [], count: 0 };
    }
    return { status: 'success', data: flattenOrder(data), count: count || 0 };
};

export const dispatchOrder = async (orderId: number, garmentIds?: string[]): Promise<ApiResponse<Order>> => {
    // Single atomic RPC (dispatch_order, triggers.sql). It does what the old
    // client-side orchestration did — garment flip (gated by trip_number = 0
    // so returning garments are untouched), append-only dispatch_log audit,
    // and the order_phase → in_progress flip routed to work_orders or
    // alteration_orders by order_type — but in one transaction, so a partial
    // failure can't leave a half-dispatched order. The trip_number = 0 gate
    // keeps it idempotent for retries.
    const { error } = await db.rpc('dispatch_order', {
        p_order_id: orderId,
        p_garment_ids: garmentIds ?? null,
    });
    if (error) {
        return { status: 'error', message: `Failed to dispatch order ${orderId}: ${error.message}` };
    }
    return getOrderById(orderId);
};

// ── Dispatch History ──────────────────────────────────────────────────────
// Rows from dispatch_log joined with order/customer/garment context for the
// "Dispatch History" tab on the dispatch page. Filtered to current brand and
// to a date range (defaults to the current month from the caller).
export interface DispatchHistoryRow {
    id: number;
    dispatched_at: string;
    direction: 'to_workshop' | 'to_shop';
    trip_number: number | null;
    garment_id: string;
    order_id: number;
    garment_code: string | null;
    garment_type: string | null;
    invoice_number: number | null;
    customer_name: string | null;
    customer_phone: string | null;
}

export const getDispatchHistory = async (
    fromIso: string,
    toIso: string,
    direction?: 'to_workshop' | 'to_shop'
): Promise<ApiResponse<DispatchHistoryRow[]>> => {
    let query = db
        .from('dispatch_log')
        .select(`
            id,
            dispatched_at,
            direction,
            trip_number,
            garment_id,
            order_id,
            garments!inner(garment_id, garment_type),
            orders!inner(
                brand,
                work_orders!work_orders_order_id_orders_id_fk(invoice_number),
                customers(name, phone)
            )
        `)
        .gte('dispatched_at', fromIso)
        .lt('dispatched_at', toIso)
        .eq('orders.brand', getBrand())
        .order('dispatched_at', { ascending: false })
        .limit(2000);

    if (direction) query = query.eq('direction', direction);

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching dispatch history:', error);
        return { status: 'error', message: error.message, data: [], count: 0 };
    }

    type DispatchRaw = {
        id: number; dispatched_at: string; direction: string; trip_number: number | null;
        garment_id: string; order_id: number;
        garments?: { garment_id: string | null; garment_type: string | null } | Array<{ garment_id: string | null; garment_type: string | null }> | null;
        orders?: {
            work_orders?: { invoice_number: number | null } | Array<{ invoice_number: number | null }> | null;
            customers?: { name: string | null; phone: string | null } | Array<{ name: string | null; phone: string | null }> | null;
        } | Array<{
            work_orders?: { invoice_number: number | null } | Array<{ invoice_number: number | null }> | null;
            customers?: { name: string | null; phone: string | null } | Array<{ name: string | null; phone: string | null }> | null;
        }> | null;
    };
    const rows: DispatchHistoryRow[] = ((data ?? []) as DispatchRaw[]).map((r) => {
        const g = Array.isArray(r.garments) ? r.garments[0] : r.garments;
        const o = Array.isArray(r.orders) ? r.orders[0] : r.orders;
        const wo = o ? (Array.isArray(o.work_orders) ? o.work_orders[0] : o.work_orders) : null;
        const cust = o ? (Array.isArray(o.customers) ? o.customers[0] : o.customers) : null;
        return {
            id: r.id,
            dispatched_at: r.dispatched_at,
            direction: r.direction as 'to_workshop' | 'to_shop',
            trip_number: r.trip_number,
            garment_id: r.garment_id,
            order_id: r.order_id,
            garment_code: g?.garment_id ?? null,
            garment_type: g?.garment_type ?? null,
            invoice_number: wo?.invoice_number ?? null,
            customer_name: cust?.name ?? null,
            customer_phone: cust?.phone ?? null,
        };
    });

    return { status: 'success', data: rows, count: rows.length };
};

export const createOrder = async (
    order: Partial<Order>,
): Promise<ApiResponse<Order>> => {
    const WORK_FIELDS = [
        'invoice_number', 'delivery_date', 'advance', 'stitching_price', 
        'fabric_charge', 'stitching_charge', 'style_charge', 'campaign_id', 
        'num_of_fabrics', 'home_delivery', 'order_phase', 'call_status', 
        'linked_order_id', 'linked_date', 'unlinked_date',
        'r1_date', 'r2_date', 'r3_date', 'call_reminder_date', 'escalation_date',
        'r1_notes', 'r2_notes', 'r3_notes', 'call_notes', 'escalation_notes'
    ];
    
    const coreFields: Record<string, unknown> = { ...order, brand: getBrand() };
    const workFields: Record<string, unknown> = {};

    WORK_FIELDS.forEach(f => {
        if (f in coreFields) {
            workFields[f] = coreFields[f];
            delete coreFields[f];
        }
    });

    // Idempotency key makes the insert safe to replay: a network drop that
    // loses the response after the row committed (Firefox/HTTP-3 QUIC) would
    // otherwise duplicate the order on retry / manual re-click. Caller
    // (useOrderMutations) supplies a stable key; fall back to a per-call one
    // so direct callers still get within-call protection.
    const idempotencyKey: string =
        (coreFields.idempotency_key as string | undefined) ?? crypto.randomUUID();
    coreFields.idempotency_key = idempotencyKey;

    let data: { id: number } | null = null;
    for (let attempt = 1; ; attempt++) {
        const res = await db
            .from(TABLE_NAME)
            .insert(coreFields)
            .select()
            .single();

        if (!res.error) {
            data = res.data;
            break;
        }

        // 23505 on the idempotency index = a prior attempt's response was lost
        // but the row DID commit. Recover the original instead of duplicating.
        if (res.error.code === '23505') {
            const recovered = await db
                .from(TABLE_NAME)
                .select()
                .eq('idempotency_key', idempotencyKey)
                .single();
            if (!recovered.error && recovered.data) {
                data = recovered.data;
                break;
            }
        }

        // Transient connection failure (swallowed by supabase-js into `error`):
        // replay is safe because the unique key dedupes a silent commit above.
        if (isTransientNetworkError(res.error) && attempt < WRITE_RETRY_ATTEMPTS) {
            await sleep(WRITE_RETRY_BASE_MS * attempt);
            continue;
        }

        console.error('Error creating order:', res.error);
        return { status: 'error', message: res.error.message };
    }

    if (!data) {
        return { status: 'error', message: 'Order creation failed: insert returned no row and no error' };
    }

    if (Object.keys(workFields).length > 0 || order.order_type === 'WORK') {
        // Upsert (not insert): work_orders.order_id is the PK, so a recovered /
        // replayed createOrder must not error on a pre-existing extension row.
        const { error: workError } = await db
            .from('work_orders')
            .upsert({ order_id: data.id, ...workFields }, { onConflict: 'order_id' });

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
        'num_of_fabrics', 'home_delivery', 'order_phase', 'call_status', 
        'linked_order_id', 'linked_date', 'unlinked_date',
        'r1_date', 'r2_date', 'r3_date', 'call_reminder_date', 'escalation_date',
        'r1_notes', 'r2_notes', 'r3_notes', 'call_notes', 'escalation_notes'
    ];
    
    const coreUpdates: Record<string, unknown> = { ...order };
    const workUpdates: Record<string, unknown> = {};
    
    WORK_FIELDS.forEach(f => {
        if (f in coreUpdates) {
            workUpdates[f] = coreUpdates[f];
            delete coreUpdates[f];
        }
    });

    if (Object.keys(coreUpdates).length > 0) {
        const { error } = await withWriteRetry(
            () => db
                .from(TABLE_NAME)
                .update(coreUpdates)
                .eq('id', orderId)
                .eq('brand', getBrand()),
            (r) => isTransientNetworkError(r.error),
        );

        if (error) {
            console.error('Error updating order core:', error);
            return { status: 'error', message: error.message };
        }
    }

    if (Object.keys(workUpdates).length > 0) {
        const { error } = await withWriteRetry(
            () => db
                .from('work_orders')
                .upsert({ order_id: orderId, ...workUpdates }),
            (r) => isTransientNetworkError(r.error),
        );

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
    const { error } = await db
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

    const { data, error, count } = await db
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
export const getOrdersList = async (filters: Record<string, string | number | boolean | undefined>): Promise<ApiResponse<Order[]>> => {
    const hasWorkOrderFilter = Object.keys(filters).some(key => key in FILTER_MAP);
    
    let builder = db.from(TABLE_NAME).select(`
        *,
        workOrder:work_orders!order_id${hasWorkOrderFilter ? '!inner' : ''}(*),
        customer:customers(id, name, nick_name, phone, country_code),
        garments:garments(*, fabric:fabrics(name))
    `).eq('brand', getBrand());

    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
            const dbKey = FILTER_MAP[key] || key;
            builder = builder.eq(dbKey, value);
        }
    });

    const { data, error } = await builder.limit(2000);
    if (error) return { status: 'error', message: error.message, data: [] };
    return { status: 'success', data: flattenOrder(data) };
};

/**
 * Orders to show on the POS dispatch page. Returns confirmed WORK orders that
 * have at least one garment still awaiting its first dispatch (trip_number = 0).
 *
 * The server-side `!inner` join on garments with `garments.trip_number = 0`
 * filters out orders whose garments have all been dispatched already. Orders
 * flip to `order_phase: in_progress` on the first garment dispatch, so we no
 * longer use phase as a scope — the trip number is the "never sent" signal.
 *
 * The nested garments array returned by PostgREST contains ONLY the trip-0
 * rows (that's how PostgREST materializes `!inner` filters), which is exactly
 * what the dispatch page wants to render.
 */
export const getOrdersForDispatch = async (): Promise<ApiResponse<Order[]>> => {
    const { data, error } = await db
        .from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id(*),
            alterationOrder:alteration_orders!order_id(*),
            customer:customers(id, name, nick_name, phone, country_code),
            garments:garments!inner(*, fabric:fabrics(name))
        `)
        .eq('brand', getBrand())
        .eq('checkout_status', 'confirmed')
        .in('order_type', ['WORK', 'ALTERATION'])
        .eq('garments.trip_number', 0)
        // A terminal garment is never dispatchable. trip_number=0 alone is not a
        // safe "never sent" signal: imported historical garments land completed
        // at trip 0 (they were never dispatched through this system), so without
        // this guard the settled archive floods the queue.
        .not('garments.piece_stage', 'in', '("completed","discarded")')
        .limit(2000);

    if (error) {
        console.error('Error fetching orders for dispatch:', error);
        return { status: 'error', message: error.message, data: [] };
    }

    // §3 cashier-processing gate: hide WORK orders still pending cashier
    // processing (work_orders.cashier_processed_at IS NULL) — they cannot be
    // dispatched until the cashier processes them (dispatch_order also rejects
    // them server-side). ALTERATION has no work_orders row and is never gated.
    // Filtered client-side because a PostgREST embed filter would need an inner
    // join on work_orders, which would wrongly drop ALTERATION rows.
    type DispatchRow = {
        order_type?: string | null;
        workOrder?: { cashier_processed_at?: string | null } | null;
    };
    const visible = (data ?? []).filter((row) => {
        const r = row as DispatchRow;
        if (r.order_type !== 'WORK') return true;
        return r.workOrder?.cashier_processed_at != null;
    });

    return { status: 'success', data: flattenOrder(visible) };
};


/**
 * Lightweight query for dashboard stats. Only fetches confirmed orders
 * with minimal columns needed for stat computation. No fabric joins.
 */
export const getDashboardOrders = async (): Promise<ApiResponse<Order[]>> => {
    const { data, error } = await db
        .from(TABLE_NAME)
        .select(`
            id, checkout_status, order_type, order_date, paid, order_total, discount_value,
            workOrder:work_orders!order_id(order_phase, delivery_date),
            customer:customers(id, name),
            garments:garments(piece_stage, location, garment_type, feedback_status, acceptance_status, trip_number)
        `)
        .eq('brand', getBrand())
        .eq('checkout_status', 'confirmed')
        .limit(2000);

    if (error) {
        console.error('Error fetching dashboard orders:', error);
        return { status: 'error', message: error.message, data: [] };
    }
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
        /** §3: ERTH defers payment, so the order stays pending cashier
         *  processing and cannot dispatch until processed. Inline-payment
         *  brands pass false and are processed at confirmation. */
        deferToCashier?: boolean;
    },
    shelfItems: { id: number; quantity: number }[],
    fabricItems: { id: number; length: number }[],
    /** Caller-stable UUID — must be the SAME across user-visible retries of
     *  the same checkout attempt. A fresh key per click would let a lost-
     *  response tail land the original AND the retry, double-decrementing
     *  stock, double-issuing the invoice number, and double-paying the order. */
    idempotencyKey: string,
): Promise<ApiResponse<Order>> => {
    const { data, error } = await withWriteRetry(
        () => db.rpc('complete_work_order', {
            p_order_id: orderId,
            p_checkout_details: checkoutDetails,
            p_shelf_items: shelfItems,
            p_fabric_items: fabricItems,
            p_idempotency_key: idempotencyKey,
        }),
        (r) => isTransientNetworkError(r.error),
    );

    if (error) {
        console.error('Error completing work order:', error);
        return { status: 'error', message: error.message };
    }
    return { status: 'success', data: data as unknown as Order };
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
    shelfItems: { id: number; quantity: number; unitPrice: number }[],
    /** Caller-stable UUID — see completeWorkOrder. */
    idempotencyKey: string,
): Promise<ApiResponse<Order>> => {
    const { data, error } = await withWriteRetry(
        () => db.rpc('complete_sales_order', {
            p_order_id: orderId,
            p_checkout_details: checkoutDetails,
            p_shelf_items: shelfItems,
            p_idempotency_key: idempotencyKey,
        }),
        (r) => isTransientNetworkError(r.error),
    );

    if (error) {
        console.error('Error completing sales order:', error);
        return { status: 'error', message: error.message };
    }
    return { status: 'success', data: data as unknown as Order };
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
    shelfItems: { id: number; quantity: number; unitPrice: number }[],
    /** Caller-stable UUID — see completeWorkOrder. */
    idempotencyKey: string,
): Promise<ApiResponse<Order>> => {
    const { data, error } = await withWriteRetry(
        () => db.rpc('create_complete_sales_order', {
            p_customer_id: customerId,
            p_checkout_details: { ...checkoutDetails, brand: getBrand() },
            p_shelf_items: shelfItems,
            p_idempotency_key: idempotencyKey,
        }),
        (r) => isTransientNetworkError(r.error),
    );

    if (error) {
        console.error('Error creating complete sales order:', error);
        return { status: 'error', message: error.message };
    }
    return { status: 'success', data: data as unknown as Order };
};

export const saveWorkOrderGarments = async (
    orderId: number,
    garments: Record<string, unknown>[],
    orderUpdates: {
        num_of_fabrics: number;
        fabric_charge: number;
        stitching_charge: number;
        style_charge: number;
        stitching_price: number;
        delivery_date?: string;
        home_delivery?: boolean;
    }
): Promise<ApiResponse<unknown>> => {
    computeStyleGroups(garments);

    // save_work_order_garments is idempotent server-side (serializes on the
    // order row, upserts work_orders ON CONFLICT, deletes-then-upserts
    // garments) — same input always converges to the same state. So a replay
    // after a dropped response can never duplicate rows, which makes a bounded
    // retry on transient connection failure provably safe. This is the actual
    // "Confirm order" button that fails 2-3 times on Firefox/HTTP-3.
    for (let attempt = 1; ; attempt++) {
        const { data, error } = await db.rpc('save_work_order_garments', {
            p_order_id: orderId,
            p_garments: garments,
            p_order_updates: orderUpdates
        });

        if (!error) return { status: 'success', data };

        if (isTransientNetworkError(error) && attempt < WRITE_RETRY_ATTEMPTS) {
            await sleep(WRITE_RETRY_BASE_MS * attempt);
            continue;
        }

        console.error('Error saving work order garments:', error);
        return { status: 'error', message: error.message };
    }
};

/**
 * Persist a brova-trial per-final style reprice (SPEC §2.5). The client has
 * already recomputed each changed garment's `style_price_snapshot` with the same
 * `calculateGarmentStylePrice` used at order creation; this RPC just writes the
 * absolute snapshots + the new aggregate `style_charge` + new `order_total`
 * atomically (serialized on the order row), never touching `orders.paid`.
 *
 * Idempotent server-side (absolute assignment + idem key), so the same bounded
 * write-retry as saveWorkOrderGarments is safe on a dropped response.
 */
export const repriceOrderStyles = async (params: {
    orderId: number;
    garments: { garment_id: string; style_price_snapshot: number }[];
    newStyleCharge: number;
    newOrderTotal: number;
    actor?: string | null;
    reason?: string | null;
    idempotencyKey?: string | null;
}): Promise<ApiResponse<unknown>> => {
    for (let attempt = 1; ; attempt++) {
        const { data, error } = await db.rpc('reprice_order_styles', {
            p_order_id: params.orderId,
            p_garments: params.garments,
            p_new_style_charge: params.newStyleCharge,
            p_new_order_total: params.newOrderTotal,
            p_actor: params.actor ?? null,
            p_reason: params.reason ?? null,
            p_idempotency_key: params.idempotencyKey ?? null,
        });

        if (!error) return { status: 'success', data };

        if (isTransientNetworkError(error) && attempt < WRITE_RETRY_ATTEMPTS) {
            await sleep(WRITE_RETRY_BASE_MS * attempt);
            continue;
        }

        console.error('repriceOrderStyles: failed to reprice order styles:', error);
        return { status: 'error', message: error.message };
    }
};

/**
 * Mint a new invoice revision for a confirmed order WITHOUT moving the total
 * (SPEC §3). Used when a brova-trial style change rewrites the printed style
 * line items but the reprice found no price delta ("revised invoice, no price
 * delta"). Idempotent on its key; a no-op for SALES/ALTERATION (no work order).
 */
export const bumpInvoiceRevision = async (params: {
    orderId: number;
    reason?: string | null;
    idempotencyKey?: string | null;
}): Promise<ApiResponse<unknown>> => {
    for (let attempt = 1; ; attempt++) {
        const { data, error } = await db.rpc('bump_invoice_revision', {
            p_order_id: params.orderId,
            p_reason: params.reason ?? null,
            p_idempotency_key: params.idempotencyKey ?? null,
        });

        if (!error) return { status: 'success', data };

        if (isTransientNetworkError(error) && attempt < WRITE_RETRY_ATTEMPTS) {
            await sleep(WRITE_RETRY_BASE_MS * attempt);
            continue;
        }

        console.error('bumpInvoiceRevision: failed to bump invoice revision:', error);
        return { status: 'error', message: error.message };
    }
};

/**
 * Fetch all orders that are currently linked to another order.
 * Returns the child orders with their primary order information.
 */
export const getLinkedOrders = async (): Promise<ApiResponse<Order[]>> => {
    // First, get all linked orders (children)
    const { data, error, count } = await db
        .from(TABLE_NAME)
        .select(`
            *,
            workOrder:work_orders!order_id!inner(*),
            customer:customers!customer_id(id, name, nick_name, phone, country_code)
        `)
        .not('workOrder.linked_order_id', 'is', null)
        .eq('brand', getBrand())
        .limit(500);

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
        const { data: primaries } = await db
            .from(TABLE_NAME)
            .select(`
                *,
                customer:customers!customer_id(name, phone),
                workOrder:work_orders!order_id(invoice_number, delivery_date, order_phase)
            `)
            .in('id', primaryIds);

        if (primaries) {
            // Attach primary details to each child order
            flattened.forEach((order: Order & { linkedTo?: unknown }) => {
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