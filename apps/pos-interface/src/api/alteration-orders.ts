import type { ApiResponse } from "../types/api";
import type { Order, Measurement } from "@repo/database";
import { db } from "@/lib/db";
import { getBrand } from "./orders";

/**
 * Alteration orders — customers bring garments in from outside.
 *
 * Storage:
 *  - `orders` row with `order_type = 'ALTERATION'`
 *  - `alteration_orders` extension row (invoice_number, received_date, comments, alteration_total, order_phase)
 *  - N `garments` rows with garment_type='alteration', piece_stage='waiting_cut',
 *    location='shop'. Each garment is either:
 *      - changes_only mode: sparse `alteration_measurements` jsonb (field → value),
 *        sparse `alteration_styles` jsonb (field → value), `full_measurement_set_id` null
 *      - full_set mode: `full_measurement_set_id` → existing measurements row,
 *        sparse maps are empty
 *    Optional `original_garment_id` links to a prior garment when "link prior" was used.
 *
 * Customer master measurements are also updated in `measurements` for any field
 * the cashier edited across all changes_only garments (last-write-wins per field).
 *
 * Separate invoice sequence: `alteration_invoice_seq`.
 */

const ALTERATION_DETAILS_QUERY = `
    *,
    alterationOrder:alteration_orders!order_id(*),
    customer:customers(*),
    garments:garments(*)
`;

export type AlterationGarmentInput = {
    mode: "changes_only" | "full_set";
    full_measurement_set_id: string | null;
    original_garment_id: string | null;
    bufi_ext: string | null;
    delivery_date: string | null;
    notes: string | null;
    alteration_measurements: Record<string, number>;
    alteration_styles: Record<string, string | boolean | number>;
};

export type CreateAlterationOrderInput = {
    customer_id: number;
    received_date: string | null;
    comments: string | null;
    home_delivery: boolean;
    order_total: number;
    order_taker_id: string | null;
    /** Master measurement record id to update with the union of all per-garment
     *  edits. Null when the customer has no master record yet — in that case no
     *  master update is performed. */
    master_measurement_id: string | null;
    /** Field → value updates to apply to the master measurement record. Caller
     *  computes this from the dirty fields across all changes_only garments. */
    master_measurement_updates: Partial<Measurement> | null;
    garments: AlterationGarmentInput[];
};

function flattenAlterationOrder<T>(data: T[]): Order[];
function flattenAlterationOrder<T>(data: T): Order;
function flattenAlterationOrder(data: unknown): unknown {
    if (!data) return null;
    if (Array.isArray(data)) return data.map((d) => flattenAlterationOrder(d));
    const row = data as Record<string, unknown>;
    const { alterationOrder, customer, ...core } = row;
    const altData = Array.isArray(alterationOrder) ? alterationOrder[0] : alterationOrder;
    const custData = Array.isArray(customer) ? customer[0] : customer;
    return { ...core, ...(altData ?? {}), customer: custData, alteration_order: altData };
}

async function getNextAlterationInvoice(): Promise<number> {
    const { data, error } = await db.rpc("next_alteration_invoice");
    if (error) {
        throw new Error(`Could not allocate alteration invoice number: ${error.message}`);
    }
    return Number(data);
}

export const createAlterationOrder = async (
    input: CreateAlterationOrderInput,
): Promise<ApiResponse<Order>> => {
    if (!input.garments.length) {
        return { status: "error", message: "At least one garment is required to create an alteration order" };
    }

    const brand = getBrand();
    if (brand !== "ERTH" && brand !== "QASS") {
        return {
            status: "error",
            message: `Alteration orders are only available for ERTH and QASS brands (current: ${brand})`,
        };
    }

    let invoiceNumber: number;
    try {
        invoiceNumber = await getNextAlterationInvoice();
    } catch (err) {
        return {
            status: "error",
            message: err instanceof Error ? err.message : "Failed to allocate alteration invoice number",
        };
    }

    const { data: orderRow, error: orderErr } = await db
        .from("orders")
        .insert({
            customer_id: input.customer_id,
            brand,
            order_type: "ALTERATION",
            checkout_status: "confirmed",
            order_taker_id: input.order_taker_id,
            order_total: input.order_total,
            order_date: new Date().toISOString(),
        })
        .select()
        .single();

    if (orderErr || !orderRow) {
        return {
            status: "error",
            message: `Could not create alteration order row: ${orderErr?.message ?? "unknown error"}`,
        };
    }

    const { error: altErr } = await db.from("alteration_orders").insert({
        order_id: orderRow.id,
        invoice_number: invoiceNumber,
        received_date: input.received_date,
        comments: input.comments,
        order_phase: "new",
        alteration_total: input.order_total,
    });

    if (altErr) {
        await db.from("orders").delete().eq("id", orderRow.id);
        return {
            status: "error",
            message: `Could not create alteration_orders extension: ${altErr.message}`,
        };
    }

    const garmentRows = input.garments.map((g, idx) => ({
        order_id: orderRow.id,
        garment_id: `${invoiceNumber}-${idx + 1}`,
        quantity: 1,
        bufi_ext: g.bufi_ext,
        alteration_measurements: g.mode === "changes_only" ? g.alteration_measurements : null,
        alteration_styles: g.mode === "changes_only" ? g.alteration_styles : null,
        full_measurement_set_id: g.mode === "full_set" ? g.full_measurement_set_id : null,
        original_garment_id: g.original_garment_id,
        delivery_date: g.delivery_date,
        notes: g.notes,
        home_delivery: input.home_delivery,
        garment_type: "alteration" as const,
        piece_stage: "waiting_cut" as const,
        location: "shop" as const,
        trip_number: 0,
        in_production: false,
    }));

    const { error: garmentErr } = await db.from("garments").insert(garmentRows);
    if (garmentErr) {
        await db.from("orders").delete().eq("id", orderRow.id);
        return {
            status: "error",
            message: `Could not create alteration garments: ${garmentErr.message}`,
        };
    }

    if (input.master_measurement_id && input.master_measurement_updates &&
        Object.keys(input.master_measurement_updates).length > 0) {
        const { error: measErr } = await db
            .from("measurements")
            .update(input.master_measurement_updates)
            .eq("id", input.master_measurement_id);
        if (measErr) {
            // Order is already saved. Surface as warning, not failure.
            console.warn("Could not propagate measurement edits to master record:", measErr.message);
        }
    }

    return getAlterationOrderById(orderRow.id);
};

export const getAlterationOrderById = async (
    orderId: number,
): Promise<ApiResponse<Order>> => {
    const { data, error } = await db
        .from("orders")
        .select(ALTERATION_DETAILS_QUERY)
        .eq("id", orderId)
        .eq("brand", getBrand())
        .eq("order_type", "ALTERATION")
        .single();

    if (error) {
        return { status: "error", message: `Could not load alteration order ${orderId}: ${error.message}` };
    }
    return { status: "success", data: flattenAlterationOrder(data) };
};

export const getAlterationOrderByInvoice = async (
    invoiceNumber: number,
): Promise<ApiResponse<Order>> => {
    const { data, error } = await db
        .from("orders")
        .select(ALTERATION_DETAILS_QUERY)
        .eq("brand", getBrand())
        .eq("order_type", "ALTERATION")
        .eq("alterationOrder.invoice_number", invoiceNumber)
        .not("alterationOrder", "is", null)
        .single();

    if (error) {
        return {
            status: "error",
            message: `Could not find alteration order with invoice ${invoiceNumber}: ${error.message}`,
        };
    }
    return { status: "success", data: flattenAlterationOrder(data) };
};

export const listAlterationOrders = async (): Promise<ApiResponse<Order[]>> => {
    const { data, error } = await db
        .from("orders")
        .select(ALTERATION_DETAILS_QUERY)
        .eq("brand", getBrand())
        .eq("order_type", "ALTERATION")
        .order("order_date", { ascending: false })
        .limit(500);

    if (error) {
        return { status: "error", message: `Could not list alteration orders: ${error.message}`, data: [] };
    }
    return { status: "success", data: flattenAlterationOrder(data) };
};

/** Look up alteration garments for a customer to populate the "link prior garment"
 *  picker. Returns garments from any prior order — work or alteration — so the
 *  cashier can seed measurements/style off real history. */
export const getCustomerGarmentsForLink = async (customerId: number) => {
    const { data, error } = await db
        .from("garments")
        .select("id, garment_id, garment_type, alteration_measurements, alteration_styles, full_measurement_set_id, measurement_id, collar_type, collar_button, collar_position, collar_thickness, cuffs_type, cuffs_thickness, front_pocket_type, front_pocket_thickness, wallet_pocket, pen_holder, mobile_pocket, small_tabaggi, jabzour_1, jabzour_2, jabzour_thickness, lines, order_id, orders!inner(customer_id, order_date)")
        .eq("orders.customer_id", customerId)
        .order("order_id", { ascending: false })
        .limit(50);

    if (error) {
        return { status: "error" as const, message: error.message, data: [] as PriorGarmentForLink[] };
    }
    return { status: "success" as const, data: (data ?? []) as PriorGarmentForLink[] };
};

export type PriorGarmentForLink = {
    id: string;
    garment_id: string | null;
    garment_type: string | null;
    alteration_measurements: Record<string, number> | null;
    alteration_styles: Record<string, string | boolean | number> | null;
    full_measurement_set_id: string | null;
    measurement_id: string | null;
    collar_type: string | null;
    collar_button: string | null;
    collar_position: "up" | "down" | null;
    collar_thickness: string | null;
    cuffs_type: string | null;
    cuffs_thickness: string | null;
    front_pocket_type: string | null;
    front_pocket_thickness: string | null;
    wallet_pocket: boolean | null;
    pen_holder: boolean | null;
    mobile_pocket: boolean | null;
    small_tabaggi: boolean | null;
    jabzour_1: string | null;
    jabzour_2: string | null;
    jabzour_thickness: string | null;
    lines: number | null;
    order_id: number;
};
