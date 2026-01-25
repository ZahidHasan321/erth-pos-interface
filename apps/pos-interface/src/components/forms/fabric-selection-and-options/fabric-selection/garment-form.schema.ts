import { z } from 'zod';

export const garmentSchema = z.object({
  id: z.string().uuid().optional(),
  garment_id: z.string().optional().nullable(),
  order_id: z.number().optional(),
  fabric_id: z.number().optional().nullable(),
  fabric_amount: z.number().default(0),
  stitching_price_snapshot: z.number().default(0),
  style_price_snapshot: z.number().default(0),
  style_id: z.number().optional().nullable(),
  style: z.string().optional().default('kuwaiti'),
  measurement_id: z.string().uuid().nullable().refine(val => val !== null, {
    message: "Measurement ID is required"
  }),

  fabric_source: z.enum(['IN', 'OUT'], {
    required_error: "Fabric source is required"
  }),
  color: z.string().optional().nullable(),
  shop_name: z.string().optional().nullable(),
  home_delivery: z.boolean().default(false),
  fabric_length: z.number({
    invalid_type_error: "Fabric length must be a number"
  })
    .nullish()
    .refine((val) => val !== null && val !== undefined && val > 0, {
      message: "Fabric length is required and must be greater than 0"
    }),
  quantity: z.number().default(1),

  // Style options
  collar_type: z.string().optional().nullable(),
  collar_button: z.string().optional().nullable(),
  cuffs_type: z.string().optional().nullable(),
  cuffs_thickness: z.string().optional().nullable(),
  front_pocket_type: z.string().optional().nullable(),
  front_pocket_thickness: z.string().optional().nullable(),
  wallet_pocket: z.boolean().optional().nullable(),
  pen_holder: z.boolean().optional().nullable(),
  small_tabaggi: z.boolean().optional().nullable(),
  jabzour_1: z.string().optional().nullable(),
  jabzour_2: z.string().optional().nullable(),
  jabzour_thickness: z.string().optional().nullable(),

  lines: z.number().default(1),

  express: z.boolean().default(false),
  brova: z.boolean().default(false),
  piece_stage: z.string().optional().nullable(),
  delivery_date: z.string().nullable().refine(val => val !== null && val !== "", {
    message: "Delivery date is required"
  }),
  notes: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  // Conditional: Fabric ID required if source is IN
  if (data.fabric_source === 'IN' && !data.fabric_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Fabric selection is required for internal source",
      path: ["fabric_id"]
    });
  }

  // Conditional: Shop Name required if source is OUT
  if (data.fabric_source === 'OUT' && (!data.shop_name || data.shop_name.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Shop name is required for external source",
      path: ["shop_name"]
    });
  }
});

export type GarmentSchema = z.infer<typeof garmentSchema>;

export const garmentDefaults: GarmentSchema = {
  garment_id: '',
  order_id: 0,
  fabric_id: null,
  style_id: null,
  style: 'kuwaiti',
  measurement_id: null,
  fabric_source: 'IN',
  color: '',
  shop_name: '',
  home_delivery: false,
  fabric_length: undefined,
  quantity: 1,
  collar_type: 'COL_DOWN_COLLAR',
  collar_button: 'COL_TABBAGI',
  cuffs_type: 'CUF_NO_CUFF',
  cuffs_thickness: 'NO HASHWA',
  front_pocket_type: 'FRO_MUDAWWAR_FRONT_POCKET',
  front_pocket_thickness: 'DOUBLE',
  wallet_pocket: false,
  pen_holder: true,
  small_tabaggi: false,
  jabzour_1: 'JAB_BAIN_MURABBA',
  jabzour_2: null,
  jabzour_thickness: 'SINGLE',
  lines: 1,
  express: false,
  brova: false,
  piece_stage: 'order_at_shop',
  delivery_date: new Date().toISOString(),
  notes: '',
};

/**
 * Creates a schema for the entire fabric selection form, 
 * optionally including stock validation if fabrics data is provided.
 */
export const createFabricSelectionFormSchema = (fabrics: any[] = []) => {
  return z.object({
    garments: z.array(garmentSchema).min(1, "At least one garment is required"),
    signature: z.string().min(1, "Customer signature is required"),
  }).superRefine((data, ctx) => {
    if (!fabrics || fabrics.length === 0) return;

    // Aggregate stock check
    const usage = new Map<number, number>();
    data.garments.forEach((g) => {
      if (g.fabric_source === 'IN' && g.fabric_id) {
        usage.set(g.fabric_id, (usage.get(g.fabric_id) || 0) + (g.fabric_length || 0));
      }
    });

    usage.forEach((totalUsed, fabricId) => {
      const fabric = fabrics.find(f => f.id === fabricId);
      if (fabric) {
        const available = parseFloat(fabric.real_stock?.toString() || "0");
        if (totalUsed > available) {
          // Find all rows using this fabric to mark them
          data.garments.forEach((g, index) => {
            if (g.fabric_source === 'IN' && g.fabric_id === fabricId) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Insufficient stock for ${fabric.name}. Total requested: ${totalUsed.toFixed(2)}m, Available: ${available.toFixed(2)}m`,
                path: ["garments", index, "fabric_length"]
              });
            }
          });
        }
      }
    });
  });
};

// Base schema for initial setup
export const fabricSelectionFormSchema = z.object({
  garments: z.array(garmentSchema).min(1, "At least one garment is required"),
  signature: z.string().min(1, "Customer signature is required"),
});

export type FabricSelectionFormSchema = z.infer<typeof fabricSelectionFormSchema>;

// Aliases for compatibility
export const fabricSelectionSchema = garmentSchema;
export type FabricSelectionSchema = GarmentSchema;
export const fabricSelectionDefaults = garmentDefaults;