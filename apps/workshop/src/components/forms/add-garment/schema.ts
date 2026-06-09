import { z } from "zod";
import { SHOULDER_SLOPE_VALUES } from "@repo/database";
import { ALL_MEASUREMENT_KEYS } from "./constants";

// Flat schema for the single-garment Add Garment form. Each section is a
// sibling on the root object — no nested shapes, so react-hook-form
// register paths stay shallow and DB mapping is 1:1.
//
// Measurement fields are modelled as optional numbers; the form allows
// saving partial measurements (workshop might want to get a garment into
// production before every dimension is filled in). Required-ness is
// enforced at the UI level where needed.

const optionalDecimal = z
  .union([z.number(), z.nan()])
  .nullish()
  .transform((v) => (v === null || v === undefined || Number.isNaN(v) ? null : v));

const measurementSchemaShape: Record<string, typeof optionalDecimal> = {};
for (const key of ALL_MEASUREMENT_KEYS) {
  measurementSchemaShape[key] = optionalDecimal;
}

export const addGarmentSchema = z.object({
  // Meta
  garment_type: z.enum(["brova", "final"]),
  delivery_date: z.string().min(1, "Delivery date is required"),
  assigned_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),

  // Fabric
  fabric_source: z.enum(["IN", "OUT"]),
  fabric_id: z.number().nullable(),
  shop_name: z.string().nullable(),
  color: z.string().nullable(),
  fabric_length: z
    .number({ message: "Fabric length must be a number" })
    .nullable()
    .refine((v) => v === null || v > 0, {
      message: "Fabric length must be greater than 0",
    }),
  soaking: z.boolean(),
  express: z.boolean(),

  // Style + options
  style: z.string(),
  lines: z.number().int().min(1).max(2).nullable(),
  collar_type: z.string().nullable(),
  collar_button: z.string().nullable(),
  // §2.11 toggles — start unselected (undefined = "not filled"), required via
  // superRefine below. collar 'standard' serializes back to null on save.
  collar_position: z.enum(["up", "down", "standard"]).optional(),
  collar_thickness: z.string().nullable(),
  small_tabaggi: z.boolean().optional(),
  jabzour_1: z.string().nullable(),
  jabzour_2: z.string().nullable(),
  jabzour_thickness: z.string().nullable(),
  front_pocket_type: z.string().nullable(),
  front_pocket_thickness: z.string().nullable(),
  wallet_pocket: z.boolean().optional(),
  pen_holder: z.boolean().optional(),
  mobile_pocket: z.boolean().optional(),
  cuffs_type: z.string().nullable(),
  cuffs_thickness: z.string().nullable(),

  // Shoulder slope — categorical body measurement, persisted to the measurements
  // row (not the garment). Sibling field here (like collar_position) because the
  // numeric `measurements` object can't hold an enum. Required via superRefine.
  shoulder_slope: z.enum(SHOULDER_SLOPE_VALUES).optional(),

  // Measurements (flat — keys from ALL_MEASUREMENT_KEYS)
  measurements: z.object(measurementSchemaShape),
})
  .superRefine((data, ctx) => {
    if (data.fabric_source === "IN" && data.fabric_id == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fabric_id"],
        message: "Pick a fabric from inventory",
      });
    }
    if (data.fabric_source === "OUT" && (!data.shop_name || data.shop_name.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shop_name"],
        message: "Shop name is required for external fabric",
      });
    }
    if (data.jabzour_1 === "JAB_SHAAB" && !data.jabzour_2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jabzour_2"],
        message: "Jabzour 2 is required when Shaab is selected",
      });
    }
    // §2.11 — every toggle must be answered, no silent default.
    for (const key of ["wallet_pocket", "pen_holder", "mobile_pocket", "small_tabaggi"] as const) {
      if (data[key] == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "Choose Yes or No",
        });
      }
    }
    if (data.collar_position == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["collar_position"],
        message: "Pick a collar position",
      });
    }
    if (data.shoulder_slope == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shoulder_slope"],
        message: "Pick a shoulder slope",
      });
    }
  });

export type AddGarmentFormValues = z.infer<typeof addGarmentSchema>;

export const addGarmentDefaults: AddGarmentFormValues = {
  garment_type: "final",
  delivery_date: "",
  assigned_date: "",
  notes: "",
  fabric_source: "IN",
  fabric_id: null,
  shop_name: "",
  color: "",
  fabric_length: null,
  soaking: false,
  express: false,
  style: "kuwaiti",
  lines: 1,
  collar_type: "COL_DOWN_COLLAR",
  collar_button: "COL_TABBAGI",
  // §2.11 toggles start unselected — the user must make a deliberate choice.
  collar_position: undefined,
  collar_thickness: "DOUBLE",
  small_tabaggi: undefined,
  jabzour_1: "JAB_BAIN_MURABBA",
  jabzour_2: null,
  jabzour_thickness: "SINGLE",
  front_pocket_type: "FRO_MUDAWWAR_FRONT_POCKET",
  front_pocket_thickness: "DOUBLE",
  wallet_pocket: undefined,
  pen_holder: undefined,
  mobile_pocket: undefined,
  cuffs_type: "CUF_NO_CUFF",
  cuffs_thickness: "NO HASHWA",
  // Categorical body measurement — starts unfilled; required choice (no default).
  shoulder_slope: undefined,
  measurements: Object.fromEntries(
    ALL_MEASUREMENT_KEYS.map((k) => [k, null as number | null]),
  ) as AddGarmentFormValues["measurements"],
};
