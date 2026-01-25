import type { Order } from "@repo/database";
import { type OrderSchema } from "./order-form.schema";

/**
 * Direct mapping from Order (DB) to Form Values
 */
export function mapOrderToFormValues(o: Order): Partial<OrderSchema> {
    if (!o) return {};
    return {
        id: o.id,
        invoice_number: o.invoice_number ?? undefined,
        customer_id: o.customer_id,
        campaign_id: o.campaign_id,
        order_taker_id: o.order_taker_id,
        order_date: o.order_date ?? undefined,
        delivery_date: o.delivery_date,
        checkout_status: o.checkout_status as any,
        production_stage: o.production_stage,
        order_type: o.order_type as any,
        fabric_charge: o.fabric_charge,
        stitching_charge: o.stitching_charge,
        style_charge: o.style_charge,
        delivery_charge: o.delivery_charge,
        shelf_charge: o.shelf_charge,
        advance: o.advance,
        paid: o.paid,
        order_total: o.order_total,
        num_of_fabrics: o.num_of_fabrics,
        payment_type: o.payment_type as any,
        payment_ref_no: o.payment_ref_no ?? undefined,
        payment_note: o.payment_note ?? undefined,
        discount_type: o.discount_type as any,
        discount_value: o.discount_value,
        notes: o.notes,
        home_delivery: o.home_delivery,
        stitching_price: o.stitching_price,
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
