import type { PieceStage } from "@repo/database";
import {
  MEASUREMENTS_SPEC,
  type MeasurementSpec,
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
 * Measurements treated as optional *for QC only* — a blank cell never blocks
 * QC submission. These stay required on POS entry; the override lives here, not
 * in the central spec, so the rest of the system is unaffected. The override
 * only flips the `optional` flag — it does not move these keys, so their
 * position in QC_MEASUREMENT_GROUPS (the on-screen order) is unchanged.
 *
 * bottom_hemming: required on the POS form (with a predicted default of 4) but
 * not verified at QC (per client spec — the form table marks it YES, the QC
 * table leaves it blank).
 */
const QC_OPTIONAL_OVERRIDE_KEYS = new Set<string>([
  "bottom_hemming",
]);

/**
 * Measurements dropped from QC entirely — the workshop doesn't measure them
 * (per client spec: "you can remove it, we don't measure it at workshop").
 * They remain on the POS measurement form (optional) and still feed the derived
 * provisions, but never appear in the QC list or the on-screen QC groups.
 */
const QC_EXCLUDED_KEYS = new Set<string>([
  "chest_full",
  "waist_full",
]);

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
  const inQc = (s: MeasurementSpec) => !s.derived && !QC_EXCLUDED_KEYS.has(s.key);

  const numbered = MEASUREMENTS_SPEC
    .filter((s) => inQc(s) && typeof s.pdfOrder === "number")
    .slice()
    .sort((a, b) => (a.pdfOrder! - b.pdfOrder!));

  const unnumberedRequired = MEASUREMENTS_SPEC.filter(
    (s) => inQc(s) && s.pdfOrder == null && !s.optional && !s.basma,
  );

  const basma = MEASUREMENTS_SPEC.filter((s) => inQc(s) && s.basma);

  const optional = MEASUREMENTS_SPEC.filter(
    (s) => inQc(s) && s.optional && !s.basma,
  );

  // The override is applied here (not in the partitioning above) so the three
  // keys keep their existing slot — only their `optional` flag flips for QC.
  return [...numbered, ...unnumberedRequired, ...basma, ...optional].map((s) => ({
    key: s.key,
    label: qcLabel(s.label),
    optional: s.optional || QC_OPTIONAL_OVERRIDE_KEYS.has(s.key),
    basma: s.basma,
  }));
}

export const QC_MEASUREMENTS: QcMeasurementSpec[] = buildQcMeasurements();

/** UI grouping for measurement tables. The QC on-screen sequence is its OWN
 *  order — deliberately distinct from the POS / new-work-order tape sequence
 *  (`pdfOrder` in the central spec). It follows the worker's QC spec sheet
 *  ("MEASURES NAMING.pdf", RANGE 1-29): collar -> shoulder/jabzour -> pockets ->
 *  chest/arm -> sleeves -> front -> side pockets -> bottom -> back. Full Chest
 *  and Waist Full are excluded (not measured at workshop, see QC_EXCLUDED_KEYS).
 *  Keys are
 *  split into ~7-col chunks for the table layout; the hemming / pen-pocket /
 *  2nd-button fields stay optional (via the central spec) even though they now
 *  sit inline in the sequence. Basma is carried as a separate conditionally
 *  rendered group. */
export const QC_MEASUREMENT_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: "",
    keys: [
      "collar_width", "collar_height", "second_button_distance", "shoulder",
      "jabzour_length", "jabzour_width", "top_pocket_distance",
    ],
  },
  {
    title: "",
    keys: [
      "top_pocket_length", "top_pocket_width", "pen_pocket_length",
      "pen_pocket_width", "chest_upper", "armhole_front", "elbow",
    ],
  },
  {
    title: "",
    keys: [
      "sleeve_width", "sleeve_length", "sleeve_hemming", "chest_front",
      "waist_front", "side_pocket_distance", "side_pocket_length",
    ],
  },
  {
    title: "",
    keys: [
      "side_pocket_opening", "side_pocket_width", "bottom", "bottom_hemming",
      "length_front", "chest_back", "waist_back",
    ],
  },
  {
    title: "",
    keys: [
      "length_back",
    ],
  },
  // Basma group — rendered only when basma applies (see hasBasmaMeasurements).
  // Keys pulled from the central spec so adding a new basma field surfaces
  // here automatically.
  {
    title: "Basma",
    keys: [...BASMA_MEASUREMENT_KEYS],
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
  // Shoulder slope and collar position are categorical body measurements (stored
  // on the measurement snapshot, not the garment). They ride the option machinery
  // here because QC verifies them by equality "both ways", not numeric tolerance —
  // the expected values are injected from the measurement in deriveExpectedQcOptions.
  { key: "shoulder_slope",         label: "Shoulder Slope",          type: "text" },
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

/** Stages operator can choose from on QC fail. Cutting → Ironing range.
 *  post_cutting is excluded — it's disabled in the production flow (§2.2), and a
 *  garment sent there can't advance (getNextPlanStage returns null for a stage
 *  absent from PRODUCTION_STAGES), stranding it off every worklist. */
export const QC_RETURN_STAGES: PieceStage[] = [
  "cutting", "sewing", "finishing", "ironing",
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

/** Parse a sparse alteration JSON column that may arrive as a string or an
 *  already-parsed object (tolerate both). */
function parseSparseStyles(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }
  return raw as Record<string, unknown>;
}

/**
 * Derive the expected option values QC verifies against. Shared by the QC form
 * (preview) and the server submit so the verdict can never diverge from what
 * the operator saw on screen:
 *  - alt-out (customer-brought, garment_type='alteration'): only the changed
 *    style keys, sourced from the sparse `alteration_styles` JSON (the style
 *    columns are empty); values are already in the QC picker's visual space.
 *  - otherwise: the garment's own style columns, with jabzour enum→visual
 *    normalization, and `shoulder_slope` pulled from the measurement snapshot
 *    (it lives on `measurements`, never on `garments`).
 */
export function deriveExpectedQcOptions(
  garment: Record<string, unknown>,
  expectedMeasurements: Record<string, unknown>,
): Record<string, unknown> {
  const expected: Record<string, unknown> = {};
  if (garment.garment_type === "alteration") {
    const altStyles = parseSparseStyles(garment.alteration_styles);
    for (const k of Object.keys(altStyles)) {
      const v = altStyles[k];
      if (v == null || v === "") continue;
      expected[k] = v;
    }
    return expected;
  }
  for (const o of QC_OPTIONS) expected[o.key] = garment[o.key];
  const j = normalizeExpectedJabzour(expected.jabzour_1, expected.jabzour_2);
  expected.jabzour_1 = j.jabzour_1;
  expected.jabzour_2 = j.jabzour_2;
  // shoulder_slope and collar_position are categorical body measurements — they
  // live on the measurement snapshot, never on the garment. Inject both here.
  expected.shoulder_slope = expectedMeasurements.shoulder_slope ?? null;
  expected.collar_position = expectedMeasurements.collar_position ?? null;
  return expected;
}

/** The three collar positions. `standard` is the neutral choice, stored as the
 *  absence of up/down (null) — see §2.11. */
export type CollarPosition = "up" | "down" | "standard";
export const COLLAR_POSITIONS: { value: CollarPosition; label: string }[] = [
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "standard", label: "Standard" },
];

/** Map any stored/entered collar value to one of the three positions. A
 *  null/empty value (legacy "absence of up/down") reads as Standard. */
export function normalizeCollarPosition(v: unknown): CollarPosition {
  return v === "up" || v === "down" ? v : "standard";
}

/** Serialize a picker choice back to storage: Standard persists as null so the
 *  column stays up/down/null (no migration). Unanswered (undefined) stays
 *  undefined so it can't be saved past the required gate. */
export function serializeCollarPosition(v: unknown): "up" | "down" | null | undefined {
  if (v === "up" || v === "down") return v;
  if (v === "standard") return null;
  return undefined;
}

/** Option keys that are required explicit Yes/No (or Up/Down/Standard) choices
 *  with no silent default — see §2.11. */
export const QC_TOGGLE_OPTION_KEYS = [
  "wallet_pocket",
  "pen_holder",
  "mobile_pocket",
  "small_tabaggi",
  "collar_position",
] as const;

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
      const input = inputs.options[o.key];
      const expected = expectedOptions[o.key];
      // Toggle fields (§2.11): an UNANSWERED input (null/undefined) is
      // incomplete, not a failure — the completeness gate forces an answer
      // before submit, so an untouched control never flashes red (the old
      // false-default-vs-true-spec auto-flag bug). Once answered we compare
      // both directions: Yes-spec built absent OR No-spec built present both fail.
      if (o.type === "boolean") {
        if (input == null) return false;
        return Boolean(input) !== Boolean(expected);
      }
      // collar_position: up / down / standard — 'standard' and a null/'' spec
      // are the same neutral position. Unanswered input is incomplete, not a
      // mismatch; once answered, all three values are checked against the spec.
      if (o.key === "collar_position") {
        if (input == null) return false;
        return normalizeCollarPosition(input) !== normalizeCollarPosition(expected);
      }
      // shoulder_slope: categorical, null-tolerant like collar_position. An
      // unanswered input is incomplete (not a fail); a measurement with no slope
      // on file (legacy) has no spec to verify against. Once both present, equality.
      if (o.key === "shoulder_slope") {
        if (input == null || input === "") return false;
        if (expected == null || expected === "") return false;
        return input !== expected;
      }
      return !optionEquals(o, input, expected);
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
