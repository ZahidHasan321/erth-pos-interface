import {
    createOrder,
    updateOrder,
    deleteOrder,
    completeWorkOrder,
    completeSalesOrder,
    createCompleteSalesOrder
} from "@/api/orders";
import { showFatouraNotification } from "@/lib/notifications";
import { type OrderSchema } from "@/components/forms/order-summary-and-payment/order-form.schema";
import { mapOrderToFormValues } from "@/components/forms/order-summary-and-payment/order-form.mapper";
import { useRef } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Order } from "@repo/database";

/**
 * Invalidate order-related queries. Uses a single batch to avoid
 * triggering multiple re-renders.
 */
function invalidateOrderQueries(queryClient: QueryClient, customerId?: number | null) {
  // Batch: mark all as stale but only refetch the ones currently mounted
  queryClient.invalidateQueries({ queryKey: ["orders"], refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["order-history"], refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["showroom-orders"], refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["dispatchOrders"], refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["dashboard-orders"], refetchType: "active" });
  queryClient.invalidateQueries({ queryKey: ["dashboard-customers"], refetchType: "active" });
  if (customerId) {
    queryClient.invalidateQueries({ queryKey: ["customer-orders", customerId], refetchType: "active" });
  }
}

// Re-export for backward compatibility
export const mapOrderToSchema = mapOrderToFormValues;

type UpdateOrderPayload = {
    fields: Partial<OrderSchema>;
    orderId: number;
    onSuccessAction?: "customer" | "payment" | "fabric" | "campaigns" | "updated" | "cancelled" | null;
};

type UseOrderMutationsOptions = {
    onOrderCreated?: (orderId: number | undefined, order: OrderSchema) => void;
    onOrderUpdated?: (action: string | null | undefined, data?: unknown) => void;
    onOrderError?: () => void;
    orderType?: "WORK" | "SALES";
};

/**
 * Maps OrderSchema (form) to Order (API/DB)
 */
function mapSchemaToOrder(schema: Partial<OrderSchema> & Record<string, unknown>): Partial<Order> {
    const order: Partial<Order> = {};
    const cleanValue = (val: unknown) => (val === "" || val === undefined ? null : val);
    const toDate = (val: unknown) => (val ? new Date(val as string) : null);

    if (schema.checkout_status) order.checkout_status = schema.checkout_status;
    if (schema.order_date && schema.order_date !== "") order.order_date = new Date(schema.order_date);
    if (schema.delivery_date && schema.delivery_date !== "") order.delivery_date = new Date(schema.delivery_date);
    if (schema.order_phase) order.order_phase = schema.order_phase as Order["order_phase"];
    if (schema.customer_id) order.customer_id = schema.customer_id;
    if (schema.notes !== undefined) order.notes = cleanValue(schema.notes) as string;
    if (schema.campaign_id) order.campaign_id = schema.campaign_id;
    if (schema.home_delivery !== undefined) order.home_delivery = schema.home_delivery;
    if (schema.order_type) order.order_type = schema.order_type;
    if (schema.payment_type) order.payment_type = schema.payment_type;
    if (schema.payment_ref_no !== undefined) order.payment_ref_no = cleanValue(schema.payment_ref_no) as string;
    if (schema.order_taker_id) order.order_taker_id = schema.order_taker_id;
    if (schema.payment_note !== undefined) order.payment_note = cleanValue(schema.payment_note) as string;
    if (schema.discount_type) order.discount_type = schema.discount_type;
    if (schema.referral_code !== undefined) order.referral_code = cleanValue(schema.referral_code) as string;
    if (schema.discount_value !== undefined) order.discount_value = schema.discount_value;
    if (schema.stitching_price !== undefined) order.stitching_price = schema.stitching_price;

    if (schema.fabric_charge !== undefined) order.fabric_charge = schema.fabric_charge;
    if (schema.stitching_charge !== undefined) order.stitching_charge = schema.stitching_charge;
    if (schema.style_charge !== undefined) order.style_charge = schema.style_charge;
    if (schema.delivery_charge !== undefined) order.delivery_charge = schema.delivery_charge;
    if (schema.express_charge !== undefined) order.express_charge = schema.express_charge;
    if (schema.soaking_charge !== undefined) order.soaking_charge = schema.soaking_charge;
    if (schema.shelf_charge !== undefined) order.shelf_charge = schema.shelf_charge;

    if (schema.advance !== undefined) order.advance = schema.advance;
    // Note: `paid` is managed by the payment_transactions sync trigger, not set directly
    if (schema.order_total !== undefined) order.order_total = schema.order_total;
    if (schema.num_of_fabrics !== undefined) order.num_of_fabrics = schema.num_of_fabrics;

    // Add Linking Fields
    if (schema.linked_order_id !== undefined) order.linked_order_id = schema.linked_order_id as number | null;
    if (schema.linked_date !== undefined) order.linked_date = toDate(schema.linked_date);
    if (schema.unlinked_date !== undefined) order.unlinked_date = toDate(schema.unlinked_date);

    // Add Reminder Fields
    if (schema.r1_date !== undefined) order.r1_date = toDate(schema.r1_date);
    if (schema.r2_date !== undefined) order.r2_date = toDate(schema.r2_date);
    if (schema.r3_date !== undefined) order.r3_date = toDate(schema.r3_date);
    if (schema.call_reminder_date !== undefined) order.call_reminder_date = toDate(schema.call_reminder_date);
    if (schema.escalation_date !== undefined) order.escalation_date = toDate(schema.escalation_date);

    // Add Reminder Notes
    if (schema.r1_notes !== undefined) order.r1_notes = cleanValue(schema.r1_notes) as string;
    if (schema.r2_notes !== undefined) order.r2_notes = cleanValue(schema.r2_notes) as string;
    if (schema.r3_notes !== undefined) order.r3_notes = cleanValue(schema.r3_notes) as string;
    if (schema.call_notes !== undefined) order.call_notes = cleanValue(schema.call_notes) as string;
    if (schema.escalation_notes !== undefined) order.escalation_notes = cleanValue(schema.escalation_notes) as string;
    if (schema.call_status !== undefined) order.call_status = cleanValue(schema.call_status) as string;

    return order;
}

export function useOrderMutations(options: UseOrderMutationsOptions = {}) {
    const queryClient = useQueryClient();

    // Stable idempotency key for the in-flight order. Generated once and
    // reused across failed re-submits (network drop → user clicks Confirm
    // again) so a silently-committed order is recovered instead of duplicated.
    // Cleared only after a confirmed success, so the next order gets a fresh
    // key. The order form is mounted per checkout flow, so the ref is scoped
    // to one logical order.
    const idempotencyKeyRef = useRef<string | undefined>(undefined);

    const createOrderMutation = useMutation({
        mutationFn: (additionalFields?: Partial<OrderSchema>) => {
            const orderType = options.orderType || "WORK";
            if (!idempotencyKeyRef.current) {
                idempotencyKeyRef.current = crypto.randomUUID();
            }
            const order: Partial<Order> = {
                checkout_status: "draft",
                order_date: new Date(),
                order_type: orderType,
                idempotency_key: idempotencyKeyRef.current,
                ...(orderType === "WORK" && { order_phase: "new" }),
            };

            if (additionalFields) {
                Object.assign(order, mapSchemaToOrder(additionalFields));
                // mapSchemaToOrder must not clobber the idempotency key.
                order.idempotency_key = idempotencyKeyRef.current;
            }

            return createOrder(order);
        },
        onSuccess: (response) => {
            if (response.status === "error") {
                toast.error(`Failed to create order: ${response.message || "Unknown error"}`);
                options.onOrderError?.();
                return;
            }

            if (response.data) {
                const order = response.data;
                // Order is committed — retire this key so the next distinct
                // order can't accidentally recover this one.
                idempotencyKeyRef.current = undefined;
                const formattedOrder = mapOrderToFormValues(order);

                invalidateOrderQueries(queryClient, order.customer_id);
                queryClient.invalidateQueries({ queryKey: ["customers"], refetchType: "active" });

                options.onOrderCreated?.(formattedOrder.id, formattedOrder);
            }
        },
        onError: (err) => {
            toast.error(`Could not create new order: ${err instanceof Error ? err.message : String(err)}`);
            options.onOrderError?.();
        },
    });

    const updateOrderMutation = useMutation({
        mutationFn: ({ fields, orderId }: UpdateOrderPayload) => {
            const order = mapSchemaToOrder(fields);
            return updateOrder(order, orderId);
        },
        onSuccess: (response, variables) => {
            if (response.status === "error") {
                toast.error(`Failed to update order: ${response.message || "Unknown error"}`);
                return;
            }

            invalidateOrderQueries(queryClient, response.data?.customer_id);
            const action = variables.onSuccessAction;

            options.onOrderUpdated?.(action);
        },
        onError: (err) => toast.error(`Could not update order: ${err instanceof Error ? err.message : String(err)}`),
    });

    const deleteOrderMutation = useMutation({
        mutationFn: (orderId: number) => {
            return deleteOrder(orderId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["orders"] });
        },
        onError: (err) => {
            toast.error(`Could not delete order: ${err instanceof Error ? err.message : String(err)}`);
        },
    });

    const completeWorkOrderMutation = useMutation({
        mutationFn: ({
            orderId,
            checkoutDetails,
            shelfItems,
            fabricItems,
            idempotencyKey,
        }: {
            orderId: number;
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
                expressCharge?: number;
                soakingCharge?: number;
                shelfCharge?: number;
                homeDelivery?: boolean;
                deliveryDate?: string;
                stitchingPrice?: number;
            };
            shelfItems: { id: number; quantity: number }[];
            fabricItems: { id: number; length: number }[];
            /** Stable per-submit UUID — see completeWorkOrder in api/orders.ts. */
            idempotencyKey: string;
        }) => {
            return completeWorkOrder(orderId, checkoutDetails as unknown as Parameters<typeof completeWorkOrder>[1], shelfItems, fabricItems, idempotencyKey);
        },
        onSuccess: (response) => {
            if (response.status === "error") {
                toast.error(`Failed to complete work order: ${response.message || "Unknown error"}`);
                return;
            }
            if (response.data?.invoice_number) {
                showFatouraNotification(response.data.invoice_number);
            }

            invalidateOrderQueries(queryClient, response.data?.customer_id);
            queryClient.invalidateQueries({ queryKey: ["fabrics"], refetchType: "active" });
            queryClient.invalidateQueries({ queryKey: ["products"], refetchType: "active" });
            options.onOrderUpdated?.("updated", response.data);
        },
        onError: (err) => {
            toast.error(`Could not complete work order: ${err instanceof Error ? err.message : String(err)}`);
        }
    });

        const completeSalesOrderMutation = useMutation({
            mutationFn: ({
                orderId,
                checkoutDetails,
                shelfItems,
                idempotencyKey,
            }: {
                orderId: number;
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
                            };
                shelfItems: { id: number; quantity: number; unitPrice: number }[];
                /** Stable per-submit UUID — see completeSalesOrder in api/orders.ts. */
                idempotencyKey: string;
            }) => {
                return completeSalesOrder(orderId, checkoutDetails, shelfItems, idempotencyKey);
            },
            onSuccess: (response) => {
                if (response.status === "error") {
                    toast.error(`Failed to complete sales order: ${response.message || "Unknown error"}`);
                    return;
                }
                if (response.data?.invoice_number) {
                    showFatouraNotification(response.data.invoice_number);
                }
    
                invalidateOrderQueries(queryClient, response.data?.customer_id);
                queryClient.invalidateQueries({ queryKey: ["products"], refetchType: "active" });
                options.onOrderUpdated?.("updated", response.data);
            },
            onError: (err) => {
                toast.error(`Could not complete sales order: ${err instanceof Error ? err.message : String(err)}`);
            }
        });



        const createCompleteSalesOrderMutation = useMutation({
            mutationFn: ({
                customerId,
                checkoutDetails,
                shelfItems,
                idempotencyKey,
            }: {
                customerId: number;
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
                                };
                shelfItems: { id: number; quantity: number; unitPrice: number }[];
                /** Stable per-submit UUID — see createCompleteSalesOrder in api/orders.ts. */
                idempotencyKey: string;
            }) => {
                return createCompleteSalesOrder(customerId, checkoutDetails, shelfItems, idempotencyKey);
            },
            onSuccess: (response) => {
                if (response.status === "error") {
                    toast.error(`Failed to create sales order: ${response.message || "Unknown error"}`);
                    return;
                }
                if (response.data?.invoice_number) {
                    showFatouraNotification(response.data.invoice_number);
                }
    
                invalidateOrderQueries(queryClient, response.data?.customer_id);
                queryClient.invalidateQueries({ queryKey: ["products"], refetchType: "active" });
                options.onOrderUpdated?.("updated", response.data);
            },
            onError: (err) => {
                toast.error(`Could not create sales order: ${err instanceof Error ? err.message : String(err)}`);
            }
        });



    return {

        createOrder: createOrderMutation,

        updateOrder: updateOrderMutation,

        deleteOrder: deleteOrderMutation,

        completeWorkOrder: completeWorkOrderMutation,

        completeSalesOrder: completeSalesOrderMutation,

        createCompleteSalesOrder: createCompleteSalesOrderMutation,

    };

}


