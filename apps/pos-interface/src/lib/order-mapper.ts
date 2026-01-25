import type { Order, ProductionStage, OrderType, PaymentType, DiscountType } from "@/types";
import type { OrderSchema } from "@/components/forms/order-summary-and-payment/order-form.schema";

export function mapApiOrderToFormOrder(apiOrder: Order): OrderSchema {
  return {
    // Fields from API
    orderID: apiOrder.id.toString(),
    fatoura: apiOrder.invoice_number ?? undefined,
    fatouraStages:
      (apiOrder.production_stage as ProductionStage) ||
      "order_at_shop",
    customerID: apiOrder.customer_id ? [apiOrder.customer_id.toString()] : undefined, // Schema expects string[]
    orderDate: apiOrder.order_date ? new Date(apiOrder.order_date).toISOString() : undefined,
    orderStatus: apiOrder.checkout_status === "confirmed" ? "Completed" : apiOrder.checkout_status === "cancelled" ? "Cancelled" : "Pending",
    // orderTotal: apiOrder.order_total,
    deliveryDate: apiOrder.delivery_date ? new Date(apiOrder.delivery_date).toISOString() : undefined,
    notes: apiOrder.notes || undefined,
    homeDelivery: apiOrder.home_delivery ?? false,
    campaigns: apiOrder.campaign_id ? [apiOrder.campaign_id.toString()] : undefined,
    orderType: (apiOrder.order_type as any) || "WORK",
    paymentType: (apiOrder.payment_type as any) || undefined,
    paymentRefNo: apiOrder.payment_ref_no || undefined,
    orderTaker: apiOrder.order_taker_id || undefined,
    discountType: (apiOrder.discount_type as any) || undefined,
    referralCode: apiOrder.referral_code || undefined,
    discountValue: apiOrder.discount_value ? Number(apiOrder.discount_value) : undefined,
    stitchingPrice: apiOrder.stitching_price ? Number(apiOrder.stitching_price) : undefined,
    charges: {
      fabric: apiOrder.fabric_charge ? Number(apiOrder.fabric_charge) : 0,
      stitching: apiOrder.stitching_charge ? Number(apiOrder.stitching_charge) : 0,
      style: apiOrder.style_charge ? Number(apiOrder.style_charge) : 0,
      delivery: apiOrder.delivery_charge ? Number(apiOrder.delivery_charge) : 0,
      shelf: apiOrder.shelf_charge ? Number(apiOrder.shelf_charge) : 0,
    },
    advance: apiOrder.advance ? Number(apiOrder.advance) : undefined,
    paid: apiOrder.paid ? Number(apiOrder.paid) : 0,
    orderTotal: apiOrder.order_total ? Number(apiOrder.order_total) : 0,
    numOfFabrics: apiOrder.num_of_fabrics ?? 0,
  };
}

export function mapFormOrderToApiOrder(
  formOrder: Partial<OrderSchema>,
  orderId?: number,
): Partial<Order> {
  // Build fields object and filter out undefined values to avoid overwriting existing data
  const fields: Partial<Order> = {};

  // Only include fields that are actually provided
  if (formOrder.customerID !== undefined && formOrder.customerID.length > 0)
    fields.customer_id = parseInt(formOrder.customerID[0]);
    
  if (formOrder.deliveryDate !== undefined && formOrder.deliveryDate)
      fields.delivery_date = new Date(formOrder.deliveryDate);
      
  if (formOrder.orderDate !== undefined && formOrder.orderDate) 
      fields.order_date = new Date(formOrder.orderDate);
      
  if (formOrder.orderStatus !== undefined)
    fields.checkout_status = formOrder.orderStatus === "Completed" ? "confirmed" : formOrder.orderStatus === "Cancelled" ? "cancelled" : "draft";
    
  if (formOrder.orderType === "WORK" && formOrder.fatouraStages !== undefined) {
    fields.production_stage = formOrder.fatouraStages as ProductionStage;
  }
  
  if (formOrder.homeDelivery !== undefined)
    fields.home_delivery = formOrder.homeDelivery;
    
  if (formOrder.notes !== undefined) fields.notes = formOrder.notes;
  
  if (formOrder.campaigns !== undefined && formOrder.campaigns.length > 0) 
      fields.campaign_id = parseInt(formOrder.campaigns[0]);
      
  if (formOrder.orderType !== undefined) fields.order_type = formOrder.orderType as OrderType;
  
  if (formOrder.paymentType !== undefined)
    fields.payment_type = formOrder.paymentType as PaymentType;
    
  if (formOrder.paymentRefNo !== undefined)
    fields.payment_ref_no = formOrder.paymentRefNo;
    
  if (formOrder.orderTaker !== undefined)
    fields.order_taker_id = formOrder.orderTaker;
    
  if (formOrder.discountType !== undefined)
    fields.discount_type = formOrder.discountType as DiscountType;
    
  if (formOrder.referralCode !== undefined)
    fields.referral_code = formOrder.referralCode;
    
  if (formOrder.discountValue !== undefined)
    fields.discount_value = formOrder.discountValue.toString();
    
  if (formOrder.stitchingPrice !== undefined)
    fields.stitching_price = formOrder.stitchingPrice.toString();

  // Handle charges object
  if (formOrder.charges?.fabric !== undefined)
    fields.fabric_charge = formOrder.charges.fabric.toString();
  if (formOrder.charges?.stitching !== undefined)
    fields.stitching_charge = formOrder.charges.stitching.toString();
  if (formOrder.charges?.style !== undefined)
    fields.style_charge = formOrder.charges.style.toString();
  if (formOrder.charges?.delivery !== undefined)
    fields.delivery_charge = formOrder.charges.delivery.toString();
  if (formOrder.charges?.shelf !== undefined)
    fields.shelf_charge = formOrder.charges.shelf.toString();

  if (formOrder.advance !== undefined) fields.advance = formOrder.advance.toString();
  if (formOrder.paid !== undefined) fields.paid = formOrder.paid.toString();
  if (formOrder.orderTotal !== undefined) fields.order_total = formOrder.orderTotal.toString();
  if (formOrder.numOfFabrics !== undefined)
    fields.num_of_fabrics = formOrder.numOfFabrics;

  if (orderId) {
    fields.id = orderId;
  }
  return fields;
}
