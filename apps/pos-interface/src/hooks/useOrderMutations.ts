import { createOrder, updateOrder, deleteOrder, completeWorkOrder, completeSalesOrder } from "@/api/orders";
import { updateShelf } from "@/api/shelf";
import { updateFabric } from "@/api/fabrics";
import { showFatouraNotification } from "@/lib/notifications";
import { type OrderSchema } from "@/components/forms/order-summary-and-payment/order-form.schema";
import { type ShelfFormValues } from "@/components/forms/shelf/shelf-form.schema";
import { type FabricSelectionSchema } from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Order } from "@repo/database";

type UpdateOrderPayload = {
    fields: Partial<OrderSchema>;
    orderId: number;
    onSuccessAction?: "customer" | "payment" | "fabric" | "campaigns" | "updated" | "cancelled" | null;
};

type UseOrderMutationsOptions = {
    onOrderCreated?: (orderId: number | undefined, order: OrderSchema) => void;
    onOrderUpdated?: (action: string | null | undefined, data?: any) => void;
    onOrderError?: () => void;
    orderType?: "WORK" | "SALES";
};

/**
 * Maps OrderSchema (form) to Order (API/DB)
 */
function mapSchemaToOrder(schema: Partial<OrderSchema>): Partial<Order> {
    const order: Partial<Order> = {};
    const cleanValue = (val: any) => (val === "" || val === undefined ? null : val);

    if (schema.checkout_status) order.checkout_status = schema.checkout_status;
    if (schema.order_date && schema.order_date !== "") order.order_date = new Date(schema.order_date);
    if (schema.delivery_date && schema.delivery_date !== "") order.delivery_date = new Date(schema.delivery_date);
    if (schema.production_stage) order.production_stage = schema.production_stage;
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
    if (schema.shelf_charge !== undefined) order.shelf_charge = schema.shelf_charge;

    if (schema.advance !== undefined) order.advance = schema.advance;
    if (schema.paid !== undefined) order.paid = schema.paid;
    if (schema.order_total !== undefined) order.order_total = schema.order_total;
    if (schema.num_of_fabrics !== undefined) order.num_of_fabrics = schema.num_of_fabrics;

    return order;
}

/**
 * Maps Order (API/DB) to OrderSchema (form)
 */
export function mapOrderToSchema(order: Order): OrderSchema {
    const parseNumeric = (val: any) => {
        if (val === null || val === undefined) return undefined;
        const parsed = typeof val === 'string' ? parseFloat(val) : val;
        return isNaN(parsed) ? undefined : parsed;
    };

    return {
        id: order.id,
        invoice_number: order.invoice_number || undefined,
        production_stage: order.production_stage || "order_at_shop",
        customer_id: order.customer_id,
        order_date: order.order_date ? new Date(order.order_date).toISOString() : undefined,
        checkout_status: order.checkout_status || "draft",
        notes: order.notes || undefined,
        campaign_id: order.campaign_id || undefined,
        home_delivery: order.home_delivery ?? false,
        delivery_date: order.delivery_date ? new Date(order.delivery_date).toISOString() : undefined,
        order_type: order.order_type || "WORK",
        payment_type: order.payment_type as any,
        payment_ref_no: order.payment_ref_no || undefined,
        payment_note: order.payment_note || undefined,
        order_taker_id: order.order_taker_id || undefined,
        discount_type: order.discount_type as any,
        referral_code: order.referral_code || undefined,
        discount_value: parseNumeric(order.discount_value),
        stitching_price: parseNumeric(order.stitching_price) ?? 9,
        
        fabric_charge: parseNumeric(order.fabric_charge) ?? 0,
        stitching_charge: parseNumeric(order.stitching_charge) ?? 0,
        style_charge: parseNumeric(order.style_charge) ?? 0,
        delivery_charge: parseNumeric(order.delivery_charge) ?? 0,
        shelf_charge: parseNumeric(order.shelf_charge) ?? 0,

        advance: parseNumeric(order.advance),
        paid: parseNumeric(order.paid),
        order_total: parseNumeric(order.order_total) ?? 0,
        num_of_fabrics: order.num_of_fabrics || 0,
    };
}

export function useOrderMutations(options: UseOrderMutationsOptions = {}) {
    const queryClient = useQueryClient();

    const createOrderMutation = useMutation({
        mutationFn: (additionalFields?: Partial<OrderSchema>) => {
            const order: Partial<Order> = {
                checkout_status: "draft",
                order_date: new Date(),
                order_type: options.orderType || "WORK"
            };

            if (additionalFields) {
                Object.assign(order, mapSchemaToOrder(additionalFields));
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
                const formattedOrder = mapOrderToSchema(order);
                options.onOrderCreated?.(formattedOrder.id, formattedOrder);
                toast.success("New order created successfully!");
            }
        },
        onError: () => {
            toast.error("Failed to create new order.");
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

            const action = variables.onSuccessAction;
            if (action === "customer") {
                toast.success("Customer updated ✅");
            } else if (action === "cancelled") {
                toast.success("Order cancelled");
            }
            options.onOrderUpdated?.(action);
        },
        onError: () => toast.error("Failed to update order"),
    });

    const updateShelfMutation = useMutation({
        mutationFn: (shelfData: ShelfFormValues) => {
            const promises = shelfData.products.map((item) => {
                if (item.id && item.stock !== undefined && item.quantity) {
                    return updateShelf(item.id.toString(), { stock: item.stock - item.quantity });
                }
                return Promise.resolve(null);
            });
            return Promise.all(promises);
        },
        onSuccess: (responses) => {
            const errorResponses = responses.filter(r => r !== null && r.status === "error");

            if (errorResponses.length > 0) {
                const errorMessages = errorResponses.map(r => r !== null ? (r.message || "Unknown error") : "Unknown error").join(", ");
                toast.error(`Failed to update shelf stock: ${errorMessages}`);
                return;
            }

            queryClient.invalidateQueries({ queryKey: ["products"] });
        },
        onError: () => {
            toast.error("Unable to update the shelf stock");
        },
    });

    const updateFabricStockMutation = useMutation({
        mutationFn: async ({
            fabricSelections,
            fabricsData,
        }: {
            fabricSelections: FabricSelectionSchema[];
            fabricsData: any[];
        }) => {
            const internalFabrics = fabricSelections.filter(
                (fabric) => fabric.fabric_source === "IN" && fabric.fabric_id
            );

            if (internalFabrics.length === 0) {
                return Promise.resolve([]);
            }

            const promises = internalFabrics.map((fabricSelection) => {
                const currentFabric = fabricsData.find((f) => f.id.toString() === fabricSelection.fabric_id?.toString());
                const currentId = fabricSelection.fabric_id;

                if (!currentFabric || !currentId) {
                    console.error(`Fabric not found: ${fabricSelection.fabric_id}`);
                    return Promise.resolve(null);
                }

                const currentStock = parseFloat(currentFabric.real_stock?.toString() || "0");
                const usedLength = fabricSelection.fabric_length;

                if (isNaN(usedLength) || usedLength <= 0) {
                    console.error(`Invalid fabric length: ${fabricSelection.fabric_length}`);
                    return Promise.resolve(null);
                }

                const newStock = currentStock - usedLength;

                if (newStock < 0) {
                    console.error(
                        `Insufficient stock for fabric ${fabricSelection.fabric_id}. Current: ${currentStock}, Requested: ${usedLength}`
                    );
                    return Promise.resolve(null);
                }

                return updateFabric(currentId.toString(), {
                    real_stock: newStock.toString(),
                });
            });

            return Promise.all(promises);
        },
        onSuccess: (results) => {
            const errorResponses = results.filter(r => r !== null && r.status === "error");

            if (errorResponses.length > 0) {
                const errorMessages = errorResponses.map(r => r !== null ? (r.message || "Unknown error") : "Unknown error").join(", ");
                toast.error(`Failed to update fabric stock: ${errorMessages}`);
                return;
            }

            const successCount = results.filter((r) => r !== null).length;
            if (successCount > 0) {
                queryClient.invalidateQueries({ queryKey: ["fabrics"] });
            }
        },
        onError: (error) => {
            console.error("Failed to update fabric stock:", error);
            toast.error("Failed to update fabric stock");
        },
    });

    const deleteOrderMutation = useMutation({
        mutationFn: (orderId: number) => {
            return deleteOrder(orderId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["orders"] });
        },
        onError: () => {
            toast.error("Failed to delete order");
        },
    });

    const completeWorkOrderMutation = useMutation({
        mutationFn: ({
            orderId,
            checkoutDetails,
            shelfItems,
            fabricItems
        }: {
            orderId: number;
            checkoutDetails: {
                paymentType: string;
                paid: number | null | undefined;
                paymentRefNo?: string;
                paymentNote?: string;
                orderTaker?: string;
            };
            shelfItems: { id: number; quantity: number }[];
            fabricItems: { id: number; length: number }[];
        }) => {
            return completeWorkOrder(orderId, checkoutDetails as any, shelfItems, fabricItems);
        },
        onSuccess: (response) => {
            if (response.status === "error") {
                toast.error(`Failed to complete work order: ${response.message || "Unknown error"}`);
                return;
            }
            toast.success("Work order completed successfully! ✅");
            
            // Show notification if invoice number was just generated
            if (response.data?.invoice_number) {
                showFatouraNotification(response.data.invoice_number);
            }

            queryClient.invalidateQueries({ queryKey: ["orders"] });
            queryClient.invalidateQueries({ queryKey: ["fabrics"] });
            queryClient.invalidateQueries({ queryKey: ["products"] });
            options.onOrderUpdated?.("updated", response.data);
        },
        onError: () => {
            toast.error("An error occurred while completing the work order");
        }
    });

    const completeSalesOrderMutation = useMutation({
        mutationFn: ({
            orderId,
            checkoutDetails,
            shelfItems
        }: {
            orderId: number;
            checkoutDetails: {
                paymentType: string;
                paid: number | null | undefined;
                paymentRefNo?: string;
                paymentNote?: string;
                orderTaker?: string;
            };
            shelfItems: { id: number; quantity: number; unitPrice: number }[];
        }) => {
            return completeSalesOrder(orderId, checkoutDetails as any, shelfItems);
        },
        onSuccess: (response) => {
            if (response.status === "error") {
                toast.error(`Failed to complete sales order: ${response.message || "Unknown error"}`);
                return;
            }
            toast.success("Sales order completed successfully! ✅");

            // Show notification if invoice number was just generated
            if (response.data?.invoice_number) {
                showFatouraNotification(response.data.invoice_number);
            }

            queryClient.invalidateQueries({ queryKey: ["orders"] });
            queryClient.invalidateQueries({ queryKey: ["products"] });
            options.onOrderUpdated?.("updated", response.data);
        },
        onError: () => {
            toast.error("An error occurred while completing the sales order");
        }
    });

    return {
        createOrder: createOrderMutation,
        updateOrder: updateOrderMutation,
        updateShelf: updateShelfMutation,
        updateFabricStock: updateFabricStockMutation,
        deleteOrder: deleteOrderMutation,
        completeWorkOrder: completeWorkOrderMutation,
        completeSalesOrder: completeSalesOrderMutation,
    };
}