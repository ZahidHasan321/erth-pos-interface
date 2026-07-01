import { z } from "zod";
import { INPUT_MEASUREMENT_KEYS } from "@repo/database";

/**
 * Alteration measurement fields = every user-entered measurement in the central
 * spec. Sourced from INPUT_MEASUREMENT_KEYS (excludes derived provisions).
 * Cast back to a string-literal tuple so the resulting type is a useful union.
 */
export const ALTERATION_MEASUREMENT_FIELDS = INPUT_MEASUREMENT_KEYS as readonly string[];

export type AlterationMeasurementField = string;

export const ALTERATION_STYLE_FIELDS = [
    "collar_type", "collar_button", "collar_position", "collar_thickness",
    "cuffs_type", "cuffs_thickness",
    "front_pocket_type", "front_pocket_thickness",
    "wallet_pocket", "pen_holder", "mobile_pocket", "small_tabaggi",
    "jabzour_1", "jabzour_2", "jabzour_thickness",
    "lines",
    // Categorical body measurements (§2.12) — kept in the style map so workshop
    // QC picks them up from the sparse change record like any other option.
    "shoulder_slope",
] as const;

export type AlterationStyleField = (typeof ALTERATION_STYLE_FIELDS)[number];

/** Whether the garment being altered is one we made (internal) or one made
 *  elsewhere (external). Internal garments must reference a prior garment. */
export type AlterationGarmentSource = "internal" | "external";

export const alterationGarmentSchema = z.object({
    key: z.string(),
    source: z.enum(["internal", "external"]).nullable(),
    original_garment_id: z.string().uuid().nullable(),
    bufi_ext: z.string().nullable(),
    delivery_date: z.string().nullable(),
    notes: z.string().nullable(),
    // Sparse maps. Empty = no changes. String values for free-form, number for measurements.
    alteration_measurements: z.record(z.string(), z.number()).default({}),
    alteration_styles: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).default({}),
    // Reason/issue matrix (row id → column id → checked). Persisted to
    // garments.alteration_issues and printed on the alteration form PDF.
    alteration_issues: z.record(z.string(), z.record(z.string(), z.boolean())).default({}),
}).superRefine((g, ctx) => {
    if (!g.source) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["source"],
            message: "Choose internal or external for each garment",
        });
        return;
    }
    if (g.source === "internal" && !g.original_garment_id) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["original_garment_id"],
            message: "Pick the original garment for an internal alteration",
        });
    }
    const measurementChanges = Object.keys(g.alteration_measurements ?? {}).length;
    // A present boolean `false` is an explicit "remove this accessory" change,
    // not an empty value — only null/blank/undefined mean "no change".
    const styleChanges = Object.entries(g.alteration_styles ?? {}).filter(
        ([, v]) => v !== null && v !== "" && v !== undefined,
    ).length;
    if (measurementChanges === 0 && styleChanges === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["alteration_measurements"],
            message: "Enter at least one measurement or style change per garment",
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
    source: null,
    original_garment_id: null,
    bufi_ext: null,
    delivery_date: null,
    notes: null,
    alteration_measurements: {},
    alteration_styles: {},
    alteration_issues: {},
});
