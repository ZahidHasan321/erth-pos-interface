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
  /** Optional measure — appended at end of QC list, never gates completion. */
  optional?: boolean;
  /** Basma-only — shown only when garment has basma values, hides sleeve_width. */
  basma?: boolean;
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

/** Measurements in PDF order. Numbered 1-18 first, then unnumbered extras,
 *  conditional basma, then optional measures at end. */
export const QC_MEASUREMENTS: QcMeasurementSpec[] = [
  // 1-18 — numbered standard measures
  { key: "chest_full",             label: "FULL CHEST" },
  { key: "shoulder",               label: "SHOULDER" },
  { key: "sleeve_length",          label: "SLEEVES LEN" },
  { key: "sleeve_width",           label: "SLEEVES W" },
  { key: "elbow",                  label: "ELBOW" },
  { key: "armhole_front",          label: "ARMHOLE F" },
  { key: "chest_upper",            label: "UPPER CHEST" },
  { key: "chest_front",            label: "FRONT CHEST" },
  { key: "waist_front",            label: "FRONT WAIST" },
  { key: "top_pocket_distance",    label: "TOP POCKET DIST" },
  { key: "jabzour_length",         label: "JABZOUR LEN" },
  { key: "length_front",           label: "FRONT LEN" },
  { key: "bottom",                 label: "BOTTOM" },
  { key: "chest_back",             label: "BACK CHEST" },
  { key: "waist_back",             label: "BACK WAIST" },
  { key: "length_back",            label: "BACK LEN" },
  { key: "collar_width",           label: "COLLAR/GALLABI LEN" },
  { key: "collar_height",          label: "COLLAR/GALLABI W" },
  // Unnumbered extras
  { key: "waist_full",             label: "WAIST FULL" },
  { key: "jabzour_width",          label: "JABZOUR W" },
  { key: "top_pocket_length",      label: "TOP PKT LEN" },
  { key: "top_pocket_width",       label: "TOP PKT W" },
  { key: "side_pocket_length",     label: "SIDE PKT LEN" },
  { key: "side_pocket_width",      label: "SIDE PKT W" },
  { key: "side_pocket_distance",   label: "SIDE PKT DIST" },
  { key: "side_pocket_opening",    label: "SIDE PKT OPEN" },
  { key: "second_button_distance", label: "2ND BOTTOM DIST" },
  // Basma — only if garment uses Basma
  { key: "basma_sleeve_length",    label: "BASMA SLEEVE L", basma: true },
  { key: "basma_length",           label: "BASMA LEN",      basma: true },
  { key: "basma_width",            label: "BASMA W",        basma: true },
  // Optional — end of QC, never gates completion
  { key: "sleeve_hemming",         label: "SLEEVE HEM",     optional: true },
  { key: "bottom_hemming",         label: "BOTTOM HEM",     optional: true },
  { key: "pen_pocket_length",      label: "PEN PKT LEN",    optional: true },
  { key: "pen_pocket_width",       label: "PEN PKT W",      optional: true },
];

/** UI grouping for measurement tables. Groups split into ~7-col chunks, with
 *  basma + optional carved off as separate (conditionally rendered) groups. */
export const QC_MEASUREMENT_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: "",
    keys: [
      "chest_full", "shoulder", "sleeve_length", "sleeve_width",
      "elbow", "armhole_front", "chest_upper",
    ],
  },
  {
    title: "",
    keys: [
      "chest_front", "waist_front", "top_pocket_distance", "jabzour_length",
      "length_front", "bottom", "chest_back",
    ],
  },
  {
    title: "",
    keys: [
      "waist_back", "length_back", "collar_width", "collar_height",
      "waist_full", "jabzour_width", "top_pocket_length",
    ],
  },
  {
    title: "",
    keys: [
      "top_pocket_width", "side_pocket_length", "side_pocket_width",
      "side_pocket_distance", "side_pocket_opening", "second_button_distance",
    ],
  },
  // Basma group — rendered only when basma applies (see hasBasmaMeasurements).
  {
    title: "Basma",
    keys: ["basma_sleeve_length", "basma_length", "basma_width"],
  },
  // Optional group — rendered last; never gates completion.
  {
    title: "Optional",
    keys: ["sleeve_hemming", "bottom_hemming", "pen_pocket_length", "pen_pocket_width"],
  },
];

/** True when the garment has any basma measurement on file. Used to gate the
 *  Basma group on QC and to hide sleeve_width (basma_sleeve_length replaces it). */
export function hasBasmaMeasurements(measurement: Record<string, unknown> | null | undefined): boolean {
  if (!measurement) return false;
  for (const k of ["basma_length", "basma_width", "basma_sleeve_length"]) {
    const v = measurement[k];
    if (v != null && v !== "" && Number(v) > 0) return true;
  }
  return false;
}

/** Keys hidden when Basma is active (basma_sleeve_length supersedes sleeve_width). */
export const QC_BASMA_HIDDEN_KEYS = new Set(["sleeve_width"]);

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
      // Optional fields with no expected value are skipped — they don't fail
      // when blank because the spec sheet may not require them.
      if (m.optional && !Number.isFinite(expected)) return false;
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
