import type { PieceStage } from "@repo/database";
import {
  MEASUREMENTS_SPEC,
  BASMA_MEASUREMENT_KEYS,
  hasBasmaMeasurements as specHasBasmaMeasurements,
} from "@repo/database";

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
  /** Basma-only — shown only when garment has basma values. */
  basma?: boolean;
}

/** Operator-facing labels in QC are uppercase. Convert the central spec's
 *  sentence-case label to upper-snake form expected on the spec sheet. */
function qcLabel(label: string): string {
  return label.toUpperCase();
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

/**
 * QC measurement list — derived from the central spec.
 *
 * Order: numbered 1-18 (PDF tape order) first, then unnumbered required,
 * then basma group, then optional fields. The central spec carries the
 * canonical labels; QC just uppercases them to match the operator's spec
 * sheet conventions. Derived (provisions) excluded — workshop doesn't QC
 * computed values.
 */
function buildQcMeasurements(): QcMeasurementSpec[] {
  const numbered = MEASUREMENTS_SPEC
    .filter((s) => !s.derived && typeof s.pdfOrder === "number")
    .slice()
    .sort((a, b) => (a.pdfOrder! - b.pdfOrder!));

  const unnumberedRequired = MEASUREMENTS_SPEC.filter(
    (s) => !s.derived && s.pdfOrder == null && !s.optional && !s.basma,
  );

  const basma = MEASUREMENTS_SPEC.filter((s) => s.basma);

  const optional = MEASUREMENTS_SPEC.filter(
    (s) => !s.derived && s.optional && !s.basma,
  );

  return [...numbered, ...unnumberedRequired, ...basma, ...optional].map((s) => ({
    key: s.key,
    label: qcLabel(s.label),
    optional: s.optional,
    basma: s.basma,
  }));
}

export const QC_MEASUREMENTS: QcMeasurementSpec[] = buildQcMeasurements();

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
      "side_pocket_distance", "side_pocket_opening",
    ],
  },
  // Basma group — rendered only when basma applies (see hasBasmaMeasurements).
  // Keys pulled from the central spec so adding a new basma field surfaces
  // here automatically.
  {
    title: "Basma",
    keys: [...BASMA_MEASUREMENT_KEYS],
  },
  // Optional group — rendered last; never gates completion.
  {
    title: "Optional",
    keys: [
      "second_button_distance",
      "sleeve_hemming", "bottom_hemming", "pen_pocket_length", "pen_pocket_width",
    ],
  },
];

/** Re-exported from the central spec so existing imports keep working. */
export const hasBasmaMeasurements = specHasBasmaMeasurements;

/** Keys hidden when Basma is active. Currently none — sleeve_length /
 *  sleeve_width always apply (whether or not basma is present). Kept for
 *  the call-site signature so consumers don't have to change. */
export const QC_BASMA_HIDDEN_KEYS: Set<string> = new Set();

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
      // Optional fields never fail on a blank cell — operator's observation
      // is "nothing to measure" (e.g. spec had a pen pocket but the actual
      // garment doesn't, or the spec never asked for it). Only fail when both
      // sides are present and out of tolerance.
      if (m.optional) {
        if (!Number.isFinite(expected) || !Number.isFinite(got)) return false;
        return Math.abs(got - expected) > QC_TOLERANCE;
      }
      if (!Number.isFinite(expected) || !Number.isFinite(got)) return true;
      return Math.abs(got - expected) > QC_TOLERANCE;
    })
    .map((m) => m.key);

  const failed_options = QC_OPTIONS
    .filter((o) => enabledKeys.has(o.key))
    .filter((o) => {
      // collar_position: all 3 values matter (up / down / standard). Blank
      // input means "Standard" — compare normally so a spec of "up" with a
      // blank operator entry is flagged as a mismatch (garment likely built
      // as Standard instead of Up).
      if (o.key === "collar_position") {
        const input = inputs.options[o.key] ?? null;
        const exp = expectedOptions[o.key] ?? null;
        return (input || null) !== (exp || null);
      }
      return !optionEquals(o, inputs.options[o.key], expectedOptions[o.key]);
    })
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
