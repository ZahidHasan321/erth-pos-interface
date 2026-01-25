import { z } from 'zod';

export const orderSchema = z.object({
  id: z.number().optional(),
  invoice_number: z.number().optional(),
  customer_id: z.number().optional(),
  campaign_id: z.number().optional().nullable(),
  order_taker_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional().nullable(),

  order_date: z.string().optional(),
  delivery_date: z.string().optional().nullable(),

  checkout_status: z.enum(['draft', 'confirmed', 'cancelled']),
  production_stage: z.string().optional().nullable(),
  order_type: z.enum(['WORK', 'SALES']).optional().nullable(),

  payment_type: z.enum(['knet', 'cash', 'link_payment', 'installments', 'others']).optional().nullable(),
  payment_ref_no: z.string().optional().nullable(),
  discount_type: z.enum(['flat', 'referral', 'loyalty', 'by_value']).optional().nullable(),
  discount_value: z.number().default(0),
  discount_percentage: z.number().default(0),
  discount_in_kwd: z.string().optional(), // Non-persisted UI field

  // All charges as numbers (matching database decimal type)
  fabric_charge: z.number().default(0),
  stitching_charge: z.number().default(0),
  style_charge: z.number().default(0),
  delivery_charge: z.number().default(0),
  shelf_charge: z.number().default(0),

  advance: z.number().default(0),
  paid: z.number().nullish().refine(
    (val) => val !== undefined && val !== null,
    { message: "Payment amount is required" }
  ),
  order_total: z.number().default(0),

  num_of_fabrics: z.number().optional().nullable(),
  home_delivery: z.boolean().default(false),
  notes: z.string().optional().nullable(),
  stitching_price: z.number().default(9),
});

export type OrderSchema = z.infer<typeof orderSchema>;

export const orderDefaults: OrderSchema = {
  id: undefined,
  checkout_status: "draft",
  order_date: new Date().toISOString(),
  delivery_date: new Date().toISOString(),
  production_stage: "order_at_shop",
  payment_type: "cash",
  order_type: "WORK",
  home_delivery: false,
  discount_value: 0,
  discount_percentage: 0,
  stitching_price: 9,

  fabric_charge: 0,
  stitching_charge: 0,
  style_charge: 0,
  delivery_charge: 0,
  shelf_charge: 0,

  advance: 0,
  paid: undefined,
  order_total: 0,
  num_of_fabrics: 0,
  notes: "",
};