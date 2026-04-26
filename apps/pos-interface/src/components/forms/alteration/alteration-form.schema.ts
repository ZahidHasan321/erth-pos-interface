import { z } from "zod";

export const ALTERATION_MEASUREMENT_FIELDS = [
    "collar_width", "collar_height", "shoulder", "armhole",
    "chest_upper", "chest_full", "chest_front", "chest_back",
    "sleeve_length", "sleeve_width", "elbow", "armhole_front",
    "top_pocket_length", "top_pocket_width", "top_pocket_distance",
    "side_pocket_length", "side_pocket_width", "side_pocket_distance", "side_pocket_opening",
    "waist_full", "waist_front", "waist_back",
    "length_front", "length_back", "bottom",
    "jabzour_width", "jabzour_length",
    "collar_length", "second_button_distance",
    "basma_length", "basma_width", "basma_sleeve_length",
    "sleeve_hemming", "bottom_hemming",
    "pen_pocket_length", "pen_pocket_width",
] as const;

export type AlterationMeasurementField = (typeof ALTERATION_MEASUREMENT_FIELDS)[number];

export const ALTERATION_STYLE_FIELDS = [
    "collar_type", "collar_button",
    "cuffs_type", "cuffs_thickness",
    "front_pocket_type", "front_pocket_thickness",
    "wallet_pocket", "pen_holder", "mobile_pocket", "small_tabaggi",
    "jabzour_1", "jabzour_2", "jabzour_thickness",
    "lines",
] as const;

export type AlterationStyleField = (typeof ALTERATION_STYLE_FIELDS)[number];

export const alterationGarmentSchema = z.object({
    key: z.string(),
    mode: z.enum(["changes_only", "full_set"]),
    full_measurement_set_id: z.string().uuid().nullable(),
    original_garment_id: z.string().uuid().nullable(),
    bufi_ext: z.string().nullable(),
    delivery_date: z.string().nullable(),
    notes: z.string().nullable(),
    // Sparse maps. Empty = no changes. String values for free-form, number for measurements.
    alteration_measurements: z.record(z.string(), z.number()).default({}),
    alteration_styles: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).default({}),
}).superRefine((g, ctx) => {
    if (g.mode === "full_set" && !g.full_measurement_set_id) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["full_measurement_set_id"],
            message: "Pick a measurement record",
        });
    }
});

export type AlterationGarmentSchema = z.infer<typeof alterationGarmentSchema>;

export const alterationOrderSchema = z.object({
    customer_id: z.number().int().positive(),
    received_date: z.string().nullable(),
    comments: z.string().nullable(),
    home_delivery: z.boolean().default(false),
    order_total: z.number().min(0).default(0),
    garments: z.array(alterationGarmentSchema).min(1, "Add at least one garment"),
});

export type AlterationOrderSchema = z.infer<typeof alterationOrderSchema>;

export const createEmptyAlterationGarment = (): AlterationGarmentSchema => ({
    key: crypto.randomUUID(),
    mode: "changes_only",
    full_measurement_set_id: null,
    original_garment_id: null,
    bufi_ext: null,
    delivery_date: null,
    notes: null,
    alteration_measurements: {},
    alteration_styles: {},
});
