/**
 * Single source of truth for garment measurement fields.
 *
 * Every consumer (POS form, alteration form, workshop add-garment, QC spec,
 * print templates, mapper) MUST derive its list from this file rather than
 * maintaining its own. If you need a new measurement, add it here and the
 * downstream Zod schema / labels / nav order / QC list pick it up.
 *
 * Order in MEASUREMENTS_SPEC matters: it defines display order for any
 * consumer that doesn't impose its own sort. PDF auto-tape entry order is
 * separate (`pdfOrder` field) so the worker's tape sequence stays stable
 * even if visual grouping changes.
 */

export type MeasurementGroup =
  | "collar"
  | "shoulder_arm"
  | "chest"
  | "top_pocket"
  | "side_pocket"
  | "waist_length"
  | "jabzour"
  | "buttons"
  | "basma"
  | "hemming"
  | "pen_pocket"
  | "provision";

export interface MeasurementSpec {
  /** DB column on `measurements` table. */
  key: string;
  /** Default display label (sentence case, used in form UIs). */
  label: string;
  /** Compact label for dense workshop UIs (QC, add-garment). Falls back to label. */
  shortLabel?: string;
  /** Logical grouping for forms that group fields. */
  group: MeasurementGroup;
  /**
   * PDF tape-measure sequence (1-18). Drives auto-navigation on the POS
   * customer-measurements form and the numbered labels on that form. Fields
   * without a number are entered manually outside the tape sequence.
   */
  pdfOrder?: number;
  /**
   * Optional measure — never gates form submission or QC pass. Operator may
   * leave blank without an error.
   */
  optional?: boolean;
  /**
   * Conditional on basma being active. QC group is rendered only when the
   * garment has any basma value on file. Always optional.
   */
  basma?: boolean;
  /**
   * Computed from other measurements (not user-entered). Auto-filled in the
   * POS form, surfaced read-only in workshop. Never appears in QC.
   */
  derived?: boolean;
}

/**
 * Master list. Order = display order in the spec sheet sense.
 * PDF tape-measure order is driven by `pdfOrder` (1-18) — see PDF
 * "MEASURES NAMING.pdf" for source. Labels are spelled out in full (no
 * abbreviations) and are the single naming source every surface follows.
 */
export const MEASUREMENTS_SPEC: readonly MeasurementSpec[] = [
  // Collar
  { key: "collar_width",           label: "Collar Length",      shortLabel: "Collar Len", group: "collar",       pdfOrder: 17 },
  { key: "collar_height",          label: "Collar Height",      shortLabel: "Collar Ht",  group: "collar",       pdfOrder: 18 },

  // Shoulder & arm
  { key: "shoulder",               label: "Shoulder",                                     group: "shoulder_arm", pdfOrder: 2 },
  { key: "armhole_front",          label: "Armhole Front",      shortLabel: "Armhole F",  group: "shoulder_arm", pdfOrder: 6 },
  { key: "sleeve_length",          label: "Sleeve Length",                                group: "shoulder_arm", pdfOrder: 3 },
  { key: "sleeve_width",           label: "Sleeve Width",                                 group: "shoulder_arm", pdfOrder: 4 },
  { key: "elbow",                  label: "Elbow",                                        group: "shoulder_arm", pdfOrder: 5 },

  // Chest
  { key: "chest_upper",            label: "Upper Chest",                                  group: "chest",        pdfOrder: 7 },
  { key: "chest_full",             label: "Full Chest",                                   group: "chest",        pdfOrder: 1 },
  { key: "chest_front",            label: "Front Chest",                                  group: "chest",        pdfOrder: 8 },
  { key: "chest_back",             label: "Back Chest",                                   group: "chest",        pdfOrder: 14 },

  // Top pocket
  { key: "top_pocket_distance",    label: "Top Pocket Distance", shortLabel: "Top Dist",  group: "top_pocket",   pdfOrder: 10 },
  { key: "top_pocket_length",      label: "Top Pocket Length",  shortLabel: "Top L",      group: "top_pocket" },
  { key: "top_pocket_width",       label: "Top Pocket Width",   shortLabel: "Top W",      group: "top_pocket" },

  // Side pocket
  { key: "side_pocket_length",     label: "Side Pocket Length", shortLabel: "Side L",     group: "side_pocket" },
  { key: "side_pocket_width",      label: "Side Pocket Width",  shortLabel: "Side W",     group: "side_pocket" },
  { key: "side_pocket_distance",   label: "Side Pocket Distance", shortLabel: "Side Dist", group: "side_pocket" },
  { key: "side_pocket_opening",    label: "Side Pocket Opening", shortLabel: "Side Open", group: "side_pocket" },

  // Waist & length
  { key: "waist_full",             label: "Waist Full",                                   group: "waist_length" },
  { key: "waist_front",            label: "Front Waist",                                  group: "waist_length", pdfOrder: 9 },
  { key: "waist_back",             label: "Back Waist",                                   group: "waist_length", pdfOrder: 15 },
  { key: "length_front",           label: "Front Length",                                 group: "waist_length", pdfOrder: 12 },
  { key: "length_back",            label: "Back Length",                                  group: "waist_length", pdfOrder: 16 },
  { key: "bottom",                 label: "Bottom",                                       group: "waist_length", pdfOrder: 13 },

  // Jabzour
  { key: "jabzour_length",         label: "Jabzour Length",                               group: "jabzour",      pdfOrder: 11 },
  { key: "jabzour_width",          label: "Jabzour Width",                                group: "jabzour" },

  // Buttons
  { key: "second_button_distance", label: "2nd Button Distance",                          group: "buttons",      optional: true },

  // Basma — all independently optional. Two pieces: the basma trim itself.
  // (sleeve_length / sleeve_width above already apply whether or not basma exists.)
  { key: "basma_length",           label: "Basma Length",                                 group: "basma",        basma: true, optional: true },
  { key: "basma_width",            label: "Basma Width",                                  group: "basma",        basma: true, optional: true },

  // Hemming — always optional
  { key: "sleeve_hemming",         label: "Sleeve Hemming",                               group: "hemming",      optional: true },
  { key: "bottom_hemming",         label: "Bottom Hemming",                               group: "hemming",      optional: true },

  // Pen pocket — optional
  { key: "pen_pocket_length",      label: "Pen Pocket Length",                            group: "pen_pocket",   optional: true },
  { key: "pen_pocket_width",       label: "Pen Pocket Width",                             group: "pen_pocket",   optional: true },

  // Derived (computed, not entered)
  { key: "chest_provision",        label: "Chest Provision",    shortLabel: "Provision",  group: "provision",    derived: true },
  { key: "waist_provision",        label: "Waist Provision",    shortLabel: "Waist Prov.",group: "provision",    derived: true },
];

export type MeasurementKey =
  | "collar_width" | "collar_height"
  | "shoulder" | "armhole_front" | "sleeve_length" | "sleeve_width" | "elbow"
  | "chest_upper" | "chest_full" | "chest_front" | "chest_back"
  | "top_pocket_distance" | "top_pocket_length" | "top_pocket_width"
  | "side_pocket_length" | "side_pocket_width" | "side_pocket_distance" | "side_pocket_opening"
  | "waist_full" | "waist_front" | "waist_back" | "length_front" | "length_back" | "bottom"
  | "jabzour_length" | "jabzour_width"
  | "second_button_distance"
  | "basma_length" | "basma_width"
  | "sleeve_hemming" | "bottom_hemming"
  | "pen_pocket_length" | "pen_pocket_width"
  | "chest_provision" | "waist_provision";

const SPEC_BY_KEY: Record<string, MeasurementSpec> = Object.fromEntries(
  MEASUREMENTS_SPEC.map((s) => [s.key, s]),
);

export function getMeasurementSpec(key: string): MeasurementSpec | undefined {
  return SPEC_BY_KEY[key];
}

/** All measurement keys, in spec order. Includes derived. */
export const ALL_MEASUREMENT_KEYS: readonly string[] =
  MEASUREMENTS_SPEC.map((s) => s.key);

/** User-entered keys (excludes derived). */
export const INPUT_MEASUREMENT_KEYS: readonly string[] =
  MEASUREMENTS_SPEC.filter((s) => !s.derived).map((s) => s.key);

/** Keys flagged optional. */
export const OPTIONAL_MEASUREMENT_KEYS: readonly string[] =
  MEASUREMENTS_SPEC.filter((s) => s.optional).map((s) => s.key);

/** Keys in the basma group (always also optional). */
export const BASMA_MEASUREMENT_KEYS: readonly string[] =
  MEASUREMENTS_SPEC.filter((s) => s.basma).map((s) => s.key);

/** Keys for required (non-optional, non-derived, non-basma) measurements. */
export const REQUIRED_MEASUREMENT_KEYS: readonly string[] =
  MEASUREMENTS_SPEC.filter((s) => !s.optional && !s.basma && !s.derived).map((s) => s.key);

/** PDF tape-measure sequence, ordered by pdfOrder ascending. Drives the
 *  POS auto-navigation flow and the numbered labels on the entry form. */
export const PDF_ORDERED_KEYS: readonly string[] =
  MEASUREMENTS_SPEC
    .filter((s) => typeof s.pdfOrder === "number")
    .slice()
    .sort((a, b) => (a.pdfOrder! - b.pdfOrder!))
    .map((s) => s.key);

/** Build "{pdfOrder}. {label}" — used on POS auto-tape table headers. */
export function getNumberedLabel(key: string): string {
  const s = SPEC_BY_KEY[key];
  if (!s) return key;
  return typeof s.pdfOrder === "number" ? `${s.pdfOrder}. ${s.label}` : s.label;
}

export function getLabel(key: string): string {
  return SPEC_BY_KEY[key]?.label ?? key;
}

export function getShortLabel(key: string): string {
  const s = SPEC_BY_KEY[key];
  return s?.shortLabel ?? s?.label ?? key;
}

/** True when the measurement row has at least one basma value > 0. */
export function hasBasmaMeasurements(
  measurement: Record<string, unknown> | null | undefined,
): boolean {
  if (!measurement) return false;
  for (const key of BASMA_MEASUREMENT_KEYS) {
    const v = measurement[key];
    if (v != null && v !== "" && Number(v) > 0) return true;
  }
  return false;
}

/** Group keys by their `group` field. Spec order preserved within each group. */
export function getKeysByGroup(group: MeasurementGroup): string[] {
  return MEASUREMENTS_SPEC.filter((s) => s.group === group).map((s) => s.key);
}
