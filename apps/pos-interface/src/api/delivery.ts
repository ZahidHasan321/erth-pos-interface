import type { ApiResponse } from "../types/api";
import { db } from "@/lib/db";
import { getBrand } from "@/api/orders";

/**
 * Home-based brand (SAKKBA/QASS) delivery handover (SPEC §1/§5) — the
 * home-visit equivalent of ERTH's cashier handover. Backed by the live
 * get_delivery_orders / deliver_order RPCs; this client just calls them.
 */

export type DeliveryStatus = "ready" | "delivered";

export interface DeliveryOrder {
    order_id: number;
    invoice_number: number | null;
    customer_name: string;
    customer_phone: string | null;
    order_total: number;
    paid: number;
    total_garments: number;
    active_garments: number;
    ready_garments: number;
    delivery_date: string | null;
    last_delivered_at: string | null;
}

/**
 * Orders for the Delivery page. 'ready' = every non-terminal garment is back
 * at the shop and ready to hand over; 'delivered' = already handed over.
 */
export const getDeliveryOrders = async (
    status: DeliveryStatus,
): Promise<{ status: "success"; data: DeliveryOrder[] }> => {
    const { data, error } = await db.rpc("get_delivery_orders", {
        p_brand: getBrand(),
        p_status: status,
    });
    if (error) {
        console.error("Error fetching delivery orders:", error.message);
        return { status: "success", data: [] };
    }
    return { status: "success", data: (data ?? []) as DeliveryOrder[] };
};

/**
 * Hand the whole order over to the customer in one all-or-nothing action
 * (sets every garment to delivered/completed). Idempotent; raises a
 * human-readable error if not all garments are ready.
 */
export const deliverOrder = async (orderId: number): Promise<ApiResponse<unknown>> => {
    const { data, error } = await db.rpc("deliver_order", {
        p_order_id: orderId,
    });
    if (error) {
        return { status: "error", message: error.message };
    }
    return { status: "success", data };
};
