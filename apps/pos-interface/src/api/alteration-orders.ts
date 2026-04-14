import type { ApiResponse } from "../types/api";
import type { Order, Garment } from "@repo/database";
import { db } from "@/lib/db";
import { getBrand } from "./orders";

/**
 * Alteration (OUT) orders — customers bring garments in from outside.
 *
 * Storage:
 *  - `orders` row with `order_type = 'ALTERATION'`
 *  - `alteration_orders` extension row (invoice_number, received_date, requested_date, comments, order_phase, alteration_total)
 *  - N `garments` rows with alteration-specific fields populated
 *    (alteration_measurements, alteration_issues, custom_price, bufi_ext)
 *    — fabric/style fields remain NULL. Standard lifecycle fields
 *    (piece_stage, location, trip_number) behave like work-order garments.
 *
 * Separate invoice sequence: `alteration_invoice_seq` (see triggers.sql).
 */

const ALTERATION_DETAILS_QUERY = `
    *,
    alterationOrder:alteration_orders!order_id(*),
    customer:customers(id, name, nick_name, phone, country_code),
    garments:garments(*)
`;

type AlterationGarmentInput = {
    quantity: number;
    bufi_ext: string | null;
    custom_price: number;
    alteration_measurements: Record<string, string>;
    alteration_issues: Record<string, Record<string, boolean>>;
    delivery_date: string | null; // ISO — per-garment requested date
    notes?: string | null;
};

export type CreateAlterationOrderInput = {
    customer_id: number;
    received_date: string | null; // ISO
    comments: string | null;
    order_taker_id?: string | null;
    garments: AlterationGarmentInput[];
};

function flattenAlterationOrder<T>(data: T[]): Order[];
function flattenAlterationOrder<T>(data: T): Order;
function flattenAlterationOrder(data: any): any {
    if (!data) return null;
    if (Array.isArray(data)) return data.map(flattenAlterationOrder);

    const { alterationOrder, customer, ...core } = data;
    const altData = Array.isArray(alterationOrder) ? alterationOrder[0] : alterationOrder;
    const custData = Array.isArray(customer) ? customer[0] : customer;

    return {
        ...core,
        ...altData,
        customer: custData,
        alteration_order: altData,
    };
}

async function getNextAlterationInvoice(): Promise<number> {
    // Supabase exposes sequences only through RPC. We expose a lightweight
    // RPC `next_alteration_invoice` that calls nextval('alteration_invoice_seq').
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

    const alterationTotal = input.garments.reduce(
        (sum, g) => sum + (g.custom_price ?? 0) * (g.quantity ?? 1),
        0,
    );

    // 1. Allocate invoice number from the dedicated sequence
    let invoiceNumber: number;
    try {
        invoiceNumber = await getNextAlterationInvoice();
    } catch (err) {
        return {
            status: "error",
            message: err instanceof Error ? err.message : "Failed to allocate alteration invoice number",
        };
    }

    // 2. Insert parent order
    const { data: orderRow, error: orderErr } = await db
        .from("orders")
        .insert({
            customer_id: input.customer_id,
            brand,
            order_type: "ALTERATION",
            checkout_status: "confirmed",
            order_taker_id: input.order_taker_id ?? null,
            order_total: alterationTotal,
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

    // 3. Insert alteration_orders extension
    const { error: altErr } = await db.from("alteration_orders").insert({
        order_id: orderRow.id,
        invoice_number: invoiceNumber,
        received_date: input.received_date,
        comments: input.comments,
        order_phase: "new",
        alteration_total: alterationTotal,
    });

    if (altErr) {
        await db.from("orders").delete().eq("id", orderRow.id);
        return {
            status: "error",
            message: `Could not create alteration_orders extension: ${altErr.message}`,
        };
    }

    // 4. Insert garments
    const garmentRows = input.garments.map((g, idx) => ({
        order_id: orderRow.id,
        garment_id: `${invoiceNumber}-${idx + 1}`,
        quantity: g.quantity,
        bufi_ext: g.bufi_ext,
        custom_price: g.custom_price,
        alteration_measurements: g.alteration_measurements,
        alteration_issues: g.alteration_issues,
        delivery_date: g.delivery_date,
        notes: g.notes ?? null,
        // Lifecycle defaults — enter production pipeline like finals
        garment_type: "final" as const,
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

/** Used by the print button on the new-alteration-order page — pulls the
 * garments and invoice number in the exact shape the PDF component expects. */
export type AlterationPrintPayload = {
    invoice_number: number;
    customer_name: string;
    customer_phone: string;
    received_date: string | null;
    requested_date: string | null;
    comments: string | null;
    garments: Garment[];
};
