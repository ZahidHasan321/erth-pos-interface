import { z } from 'zod';

export const orderSchema = z.object({
  id: z.number().optional(),
  invoice_number: z.number().optional(),
  customer_id: z.number().optional(),
  campaign_id: z.number().optional().nullable(),
  order_taker_id: z.string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid Order Taker selection")
    .optional()
    .nullable(),

  order_date: z.string().optional(),
  delivery_date: z.string().optional().nullable(),

  checkout_status: z.enum(['draft', 'confirmed', 'cancelled']),
  production_stage: z.string().optional().nullable(),
  order_type: z.enum(['WORK', 'SALES']).optional().nullable(),

  payment_type: z.enum(['knet', 'cash', 'link_payment', 'installments', 'others'], {
    message: "Please select a payment method",
  }).optional().nullable(),
  payment_ref_no: z.string().optional().nullable(),
  payment_note: z.string().optional().nullable(),
  discount_type: z.enum(['flat', 'referral', 'loyalty', 'by_value']).optional().nullable(),
  discount_value: z.number().optional().nullable(),
  discount_percentage: z.number().optional().nullable(),
  referral_code: z.string().optional().nullable(),
  discount_in_kwd: z.string().optional(), // Non-persisted UI field

  // All charges as numbers (matching database decimal type)
  fabric_charge: z.number().default(0),
  stitching_charge: z.number().default(0),
  style_charge: z.number().default(0),
  delivery_charge: z.number().default(0),
  shelf_charge: z.number().default(0),

  advance: z.number().optional().nullable(),
  paid: z.number().optional().nullable(),
  order_total: z.number().default(0),

  num_of_fabrics: z.number().optional().nullable(),
  home_delivery: z.boolean().default(false),
  notes: z.string().optional().nullable(),
  stitching_price: z.number().default(9),
}).superRefine((data, ctx) => {
  // Only enforce strict validation if we are trying to confirm the order
  if (data.checkout_status === 'confirmed') {
    if (!data.payment_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment type is required to confirm",
        path: ["payment_type"],
      });
    }

    if (data.payment_type && data.payment_type !== 'cash' && !data.payment_ref_no) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reference number is required for non-cash payments",
        path: ["payment_ref_no"],
      });
    }

    if (data.payment_type === 'others' && !data.payment_note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Payment note is required for 'Others' payment method",
        path: ["payment_note"],
      });
    }

    // Overpayment validation
    if (typeof data.paid === 'number' && typeof data.order_total === 'number' && data.order_total > 0) {
      if (data.paid > data.order_total) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Amount paid (${data.paid.toFixed(3)}) exceeds order total (${data.order_total.toFixed(3)})`,
          path: ["paid"],
        });
      }
    }
  }
});

export type OrderSchema = z.infer<typeof orderSchema>;

export const orderDefaults: OrderSchema = {
  id: undefined,
  checkout_status: "draft",
  order_date: new Date().toISOString(),
  delivery_date: new Date().toISOString(),
  production_stage: undefined,
  payment_type: "cash",
  order_type: "WORK",
  home_delivery: false,
  discount_value: undefined,
  discount_percentage: undefined,
  referral_code: undefined,
  stitching_price: 9,

  fabric_charge: 0,
  stitching_charge: 0,
  style_charge: 0,
  delivery_charge: 0,
  shelf_charge: 0,

  advance: undefined,
  paid: undefined,
  order_total: 0,
  num_of_fabrics: 0,
  notes: "",
};