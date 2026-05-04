import type { PieceStage } from "@repo/database";

/** Tolerance in inches for measurement comparison. */
export const QC_TOLERANCE = 0.125;

/** Quality rating threshold — score >= this passes. */
export const QC_QUALITY_THRESHOLD = 4;

export interface QcMeasurementSpec {
  /** Column name on the `measurements` table. */
  key: string;
  /** Display label, uppercase to match operator's spec sheet. */
  label: string;
}

export interface QcOptionSpec {
  /** Column name on the `garments` table. */
  key: string;
  label: string;
  /** "boolean" options compare via !!a === !!b (false vs null treated equal). */
  type: "text" | "boolean" | "number";
}

export interface QcQualitySpec {
  key: string;
  label: string;
}

/** 28 measurements in operator-defined order. Grouped by table for the UI. */
export const QC_MEASUREMENTS: QcMeasurementSpec[] = [
  // Group 1 — Jabzour & Bottom Distance
  { key: "jabzour_length",         label: "JABZOUR LENGTH" },
  { key: "jabzour_width",          label: "JABZOUR WIDTH" },
  { key: "second_button_distance", label: "2ND BOTTOM DISTANCE" },
  // Group 2 — Pockets
  { key: "side_pocket_length",     label: "SIDE POCKET HEIGHT" },
  { key: "side_pocket_width",      label: "SIDE POCKET WIDTH" },
  { key: "side_pocket_distance",   label: "DISTANCE TO SIDE POCKET" },
  { key: "side_pocket_opening",    label: "SIDE POCKET OPENING" },
  { key: "top_pocket_length",      label: "FRNT POCKET HEIGHT" },
  { key: "top_pocket_width",       label: "FRNT POCKET WIDTH" },
  { key: "top_pocket_distance",    label: "DISTANCE TO FRONT POCKET" },
  // Group 3 — Body Lengths & Collar
  { key: "length_front",           label: "FRONT LENGTH" },
  { key: "length_back",            label: "BACK LENGTH" },
  { key: "collar_length",          label: "COLLAR LENGTH/GALLABI LENGTH" },
  { key: "collar_height",          label: "COLLAR/GALLABI HEIGHT" },
  { key: "shoulder",               label: "SHOULDER" },
  { key: "armhole",                label: "ARMHOLE" },
  // Group 4 — Sleeves & Basma
  { key: "sleeve_length",          label: "SLEEVES LENGTH" },
  { key: "basma_sleeve_length",    label: "BASMA SLEEVES LENGTH" },
  { key: "elbow",                  label: "ELBOW" },
  { key: "sleeve_width",           label: "SLEEVES WIDTH" },
  { key: "basma_length",           label: "BASMA LENGTH" },
  { key: "basma_width",            label: "BASMA WIDTH" },
  // Group 5 — Chest, Waist, Bottom
  { key: "chest_upper",            label: "UPPER CHEST" },
  { key: "chest_front",            label: "FRONT CHEST" },
  { key: "waist_front",            label: "FRONT WAIST" },
  { key: "chest_back",             label: "BACK CHEST" },
  { key: "waist_back",             label: "BACK WAIST" },
  { key: "bottom",                 label: "BOTTOM" },
];

/** UI grouping for measurement tables — flat serial split into ~equal chunks. */
export const QC_MEASUREMENT_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: "",
    keys: [
      "jabzour_length", "jabzour_width", "second_button_distance",
      "side_pocket_length", "side_pocket_width", "side_pocket_distance", "side_pocket_opening",
    ],
  },
  {
    title: "",
    keys: [
      "top_pocket_length", "top_pocket_width", "top_pocket_distance",
      "length_front", "length_back", "collar_length", "collar_height",
    ],
  },
  {
    title: "",
    keys: [
      "shoulder", "armhole",
      "sleeve_length", "basma_sleeve_length", "elbow", "sleeve_width", "basma_length",
    ],
  },
  {
    title: "",
    keys: [
      "basma_width",
      "chest_upper", "chest_front", "waist_front", "chest_back", "waist_back", "bottom",
    ],
  },
];

/** 14 garment option fields. */
export const QC_OPTIONS: QcOptionSpec[] = [
  { key: "collar_type",            label: "Collar Type",             type: "text" },
  { key: "collar_button",          label: "Collar Button",           type: "text" },
  { key: "collar_position",        label: "Collar Position",         type: "text" },
  { key: "collar_thickness",       label: "Collar Thickness",        type: "text" },
  { key: "cuffs_type",             label: "Cuffs Type",              type: "text" },
  { key: "cuffs_thickness",        label: "Cuffs Thickness",         type: "text" },
  { key: "front_pocket_type",      label: "Front Pocket Type",       type: "text" },
  { key: "front_pocket_thickness", label: "Front Pocket Thickness",  type: "text" },
  { key: "wallet_pocket",          label: "Wallet Pocket",           type: "boolean" },
  { key: "pen_holder",             label: "Pen Holder",              type: "boolean" },
  { key: "mobile_pocket",          label: "Mobile Pocket",           type: "boolean" },
  { key: "small_tabaggi",          label: "Small Tabaggi",           type: "boolean" },
  { key: "jabzour_1",              label: "Jabzour 1",               type: "text" },
  { key: "jabzour_2",              label: "Jabzour 2",               type: "text" },
  { key: "jabzour_thickness",      label: "Jabzour Thickness",       type: "text" },
  { key: "lines",                  label: "Lines",                   type: "number" },
];

/** 6 quality aspects, scored 1-5. */
export const QC_QUALITY: QcQualitySpec[] = [
  { key: "seam",         label: "Rating Seam" },
  { key: "ironing",      label: "Rating Ironing" },
  { key: "front_pocket", label: "Rating Front Pocket" },
  { key: "collar",       label: "Rating Collar" },
  { key: "jabzour",      label: "Rating Jabzour" },
  { key: "hemming",      label: "Rating Hemming" },
];

/** Stages operator can choose from on QC fail. Cutting → Ironing range. */
export const QC_RETURN_STAGES: PieceStage[] = [
  "cutting", "post_cutting", "sewing", "finishing", "ironing",
];

/**
 * Translate raw garment jabzour fields into the value space the QC picker uses.
 * DB stores `jabzour_1` as the enum `BUTTON|ZIPPER` with `jabzour_2` holding
 * the visual style (e.g. `JAB_BAIN_MURABBA`). The picker shows visual styles
 * directly with `JAB_SHAAB` standing in for the zipper case. Without this
 * translation, operator picks ("JAB_BAIN_MURABBA") never match the raw enum
 * ("BUTTON") and QC always reports a mismatch.
 */
export function normalizeExpectedJabzour(
  rawJ1: unknown,
  rawJ2: unknown,
): { jabzour_1: string | null; jabzour_2: string | null } {
  if (rawJ1 === "BUTTON") {
    return { jabzour_1: (rawJ2 as string | null) ?? null, jabzour_2: null };
  }
  if (rawJ1 === "ZIPPER") {
    return { jabzour_1: "JAB_SHAAB", jabzour_2: (rawJ2 as string | null) ?? null };
  }
  return { jabzour_1: null, jabzour_2: null };
}

/** Compare option values. Booleans treat false === null === undefined. */
export function optionEquals(spec: QcOptionSpec, a: unknown, b: unknown): boolean {
  if (spec.type === "boolean") return Boolean(a) === Boolean(b);
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a === b;
}

export interface QcInputs {
  measurements: Record<string, number>;
  options: Record<string, string | boolean | number | null>;
  quality_ratings: Record<string, number>;
}

export interface QcEvaluation {
  failed_measurements: string[];
  failed_options: string[];
  failed_quality: string[];
  result: "pass" | "fail";
}

/** Evaluate operator inputs against expected (measurement snapshot + garment record). */
export function evaluateQc(
  expectedMeasurements: Record<string, unknown>,
  expectedOptions: Record<string, unknown>,
  inputs: QcInputs,
  enabledKeys: Set<string>,
): QcEvaluation {
  const failed_measurements = QC_MEASUREMENTS
    .filter((m) => enabledKeys.has(m.key))
    .filter((m) => {
      const expected = Number(expectedMeasurements[m.key]);
      const got = Number(inputs.measurements[m.key]);
      if (!Number.isFinite(expected) || !Number.isFinite(got)) return true;
      return Math.abs(got - expected) > QC_TOLERANCE;
    })
    .map((m) => m.key);

  const failed_options = QC_OPTIONS
    .filter((o) => enabledKeys.has(o.key))
    .filter((o) => !optionEquals(o, inputs.options[o.key], expectedOptions[o.key]))
    .map((o) => o.key);

  const failed_quality = QC_QUALITY
    .filter((q) => enabledKeys.has(q.key))
    .filter((q) => (inputs.quality_ratings[q.key] ?? 0) < QC_QUALITY_THRESHOLD)
    .map((q) => q.key);

  const result =
    failed_measurements.length + failed_options.length + failed_quality.length === 0
      ? "pass"
      : "fail";

  return { failed_measurements, failed_options, failed_quality, result };
}
