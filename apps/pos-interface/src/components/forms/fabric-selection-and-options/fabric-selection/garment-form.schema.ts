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
  measurement_id: z.string().uuid().optional().nullable(),

  fabric_source: z.enum(['IN', 'OUT']).optional().nullable(),
  color: z.string().optional().nullable(),
  shop_name: z.string().optional().nullable(),
  home_delivery: z.boolean().default(false),
  fabric_length: z.number().nullish().refine(
    (val) => val !== undefined && val !== null && val > 0,
    { message: "Fabric length is required" }
  ),
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
  delivery_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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

// Aliases for compatibility
export const fabricSelectionSchema = garmentSchema;
export type FabricSelectionSchema = GarmentSchema;
export const fabricSelectionDefaults = garmentDefaults;