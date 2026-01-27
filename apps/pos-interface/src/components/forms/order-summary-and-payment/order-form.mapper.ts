import type { Order } from "@repo/database";
import { type OrderSchema } from "./order-form.schema";

/**
 * Safely parse numeric values (Supabase may return numbers as strings)
 */
const parseNumeric = (val: unknown): number | undefined => {
    if (val === null || val === undefined) return undefined;
    const parsed = typeof val === 'string' ? parseFloat(val) : val as number;
    return isNaN(parsed) ? undefined : parsed;
};

/**
 * Convert date to ISO string for form inputs
 */
const toISOString = (date: Date | string | null | undefined): string | undefined => {
    if (!date) return undefined;
    return new Date(date).toISOString();
};

/**
 * Maps Order (DB) to Form Values (OrderSchema)
 * - Converts dates to ISO strings for HTML date inputs
 * - Provides default values for numeric fields
 * - Handles Supabase returning numbers as strings
 */
export function mapOrderToFormValues(order: Order): OrderSchema {
    if (!order) return {} as OrderSchema;

    return {
        id: order.id,
        invoice_number: order.invoice_number ?? undefined,
        customer_id: order.customer_id,
        campaign_id: order.campaign_id ?? undefined,
        order_taker_id: order.order_taker_id ?? undefined,
        order_date: toISOString(order.order_date),
        delivery_date: toISOString(order.delivery_date),
        checkout_status: order.checkout_status ?? "draft",
        production_stage: order.production_stage ?? (order.order_type === "WORK" ? "order_at_shop" : undefined),
        order_type: order.order_type ?? "WORK",
        fabric_charge: parseNumeric(order.fabric_charge) ?? 0,
        stitching_charge: parseNumeric(order.stitching_charge) ?? 0,
        style_charge: parseNumeric(order.style_charge) ?? 0,
        delivery_charge: parseNumeric(order.delivery_charge) ?? 0,
        shelf_charge: parseNumeric(order.shelf_charge) ?? 0,
        advance: parseNumeric(order.advance),
        paid: parseNumeric(order.paid),
        order_total: parseNumeric(order.order_total),
        num_of_fabrics: order.num_of_fabrics ?? undefined,
        payment_type: order.payment_type ?? undefined,
        payment_ref_no: order.payment_ref_no ?? undefined,
        payment_note: order.payment_note ?? undefined,
        discount_type: order.discount_type ?? undefined,
        discount_value: parseNumeric(order.discount_value),
        discount_percentage: parseNumeric(order.discount_percentage),
        referral_code: order.referral_code ?? undefined,
        notes: order.notes ?? undefined,
        home_delivery: order.home_delivery ?? false,
        stitching_price: parseNumeric(order.stitching_price) ?? 9,
    };
}

/**
 * Direct mapping from Form Values to Order (DB)
 */
export function mapFormValuesToOrder(formValues: OrderSchema): Partial<Order> {
    return {
        ...formValues,
        checkout_status: formValues.checkout_status as any,
        order_type: formValues.order_type as any,
        payment_type: formValues.payment_type as any,
        discount_type: formValues.discount_type as any,
    };
}
