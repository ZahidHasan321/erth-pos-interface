// schema/styleOptionsSchema.ts
import { z } from "zod";
import {
  collarTypes,
  collarButtons,
  jabzourTypes,
  topPocketTypes,
  cuffTypes,
  thicknessOptions,
} from "../constants";

/* ---------- Derive valid string literal arrays ---------- */
const collarTypeValues = collarTypes.map(i => i.value) as [string, ...string[]];
const collarButtonValues = collarButtons.map(i => i.value) as [string, ...string[]];
const jabzourTypeValues = jabzourTypes.map(i => i.value) as [string, ...string[]];
const topPocketTypeValues = topPocketTypes.map(i => i.value) as [string, ...string[]];
const cuffTypeValues = cuffTypes.map(i => i.value) as [string, ...string[]];
const thicknessValues = thicknessOptions.map(i => i.value) as [string, ...string[]];

/* ---------- Schema Definition ---------- */

export const styleOptionsSchema = z.object({
  style_option_id: z.string().optional(),
  garment_id: z.string().optional(),
  style: z.string().optional(),
  lines: z
    .object({
      line1: z.boolean().optional(),
      line2: z.boolean().optional(),
    })
    .optional(),
  collar: z
    .object({
      collar_type: z.enum(collarTypeValues).optional(),
      collar_button: z.enum(collarButtonValues).optional(),
      small_tabaggi: z.boolean().optional(),
    })
    .optional(),

  jabzour: z
    .object({
      jabzour_1: z.enum(jabzourTypeValues).optional(),
      jabzour_2: z.enum(jabzourTypeValues).nullable().optional(),
      jabzour_thickness: z.enum(thicknessValues).optional(),
    })
    .optional(),

  front_pocket: z
    .object({
      front_pocket_type: z.enum(topPocketTypeValues).optional(),
      front_pocket_thickness: z.enum(thicknessValues).optional(),
    })
    .optional(),
  accessories: z
    .object({
      phone: z.boolean().optional(),
      wallet: z.boolean().optional(),
      pen_holder: z.boolean().optional(),
    })
    .optional(),
  cuffs: z
    .object({
      has_cuffs: z.boolean().optional(),
      cuffs_type: z.enum(cuffTypeValues).optional(),
      cuffs_thickness: z.enum(thicknessValues).optional(),
    })
    .optional(),

  extra_amount: z.number().optional(),
}).refine(
  (data) => {
    // If jabzour_1 is "JAB_SHAAB", jabzour_2 must be selected
    if (data.jabzour?.jabzour_1 === "JAB_SHAAB") {
      return data.jabzour?.jabzour_2 !== null && data.jabzour?.jabzour_2 !== undefined;
    }
    return true;
  },
  {
    message: "Jabzour 2 is required when Shaab is selected",
    path: ["jabzour", "jabzour_2"],
  }
);

export type StyleOptionsSchema = z.infer<typeof styleOptionsSchema>;

export const styleOptionsDefaults: StyleOptionsSchema = {
  style_option_id: "",
  garment_id: "",
  style: "kuwaiti",
  lines: {
    line1: true,
    line2: false,
  },
  collar: {
    collar_type: "COL_DOWN_COLLAR",
    collar_button: "COL_TABBAGI",
    small_tabaggi: false,
  },
  jabzour: {
    jabzour_1: "JAB_BAIN_MURABBA",
    jabzour_2: undefined,
    jabzour_thickness: "SINGLE",
  },
  front_pocket: {
    front_pocket_type: "FRO_MUDAWWAR_FRONT_POCKET",
    front_pocket_thickness: "DOUBLE",
  },
  accessories: {
    phone: true,
    wallet: false,
    pen_holder: false,
  },
  cuffs: {
    has_cuffs: false,
    cuffs_type: "CUF_NO_CUFF",
    cuffs_thickness: "NO HASHWA",
  },
};