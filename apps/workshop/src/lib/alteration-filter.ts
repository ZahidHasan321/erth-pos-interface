import type { GarmentFeedback } from "@repo/database";

/** Section keys used by DishdashaOverlay + TerminalQualityTemplatePrint. */
export type AlterationStyleSection =
  | "frontPocket"
  | "jabzour"
  | "sidePocket"
  | "cuffs"
  | "collar";

/** Fault attribution recorded against each changed measurement at shop feedback.
 * Matches DIFFERENCE_REASONS labels in feedback.$orderId.tsx. */
export type AlterationReason = "Customer Request" | "Workshop Error" | "Shop Error";

export interface AlterationFilter {
  /** measurement column names that actually differ from prior trip */
  measurementKeys: Set<string>;
  /** per-field reason label (only set when the diff row has one) */
  fieldReasons: Map<string, AlterationReason>;
  /** sidebar sections that should render (something changed in them) */
  visibleSections: Set<AlterationStyleSection>;
  /** When true, hide unchanged measurement cells entirely (used when no
   *  baseline measurement is available — only the sparse changes can be shown).
   *  When false, render the full template and only color-flag the changed
   *  cells. Default true preserves alt-in behavior. */
  hideUnchanged?: boolean;
}

const REASON_LABELS: ReadonlySet<AlterationReason> = new Set([
  "Customer Request",
  "Workshop Error",
  "Shop Error",
]);

interface MeasurementDiffEntry {
  field: string;
  original_value: number | null;
  actual_value: number | string | null;
  difference?: number | string | null;
  reason?: string | null;
}

interface OptionChecklistEntry {
  option_name: string;
  rejected?: boolean | null;
  hashwa_rejected?: boolean | null;
}

function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  return raw as T;
}

/** option_name (from feedback page optionRows) → style sections it affects. */
const OPTION_TO_SECTIONS: Record<string, AlterationStyleSection[]> = {
  frontPocket: ["frontPocket"],
  jabzour: ["jabzour"],
  cuff: ["cuffs"],
  collar: ["collar"],
  collarBtn: ["collar"],
  smallTabaggi: ["collar"],
};

/** measurement key → section whose sidebar depends on it. */
const MEASUREMENT_TO_SECTION: Record<string, AlterationStyleSection> = {
  top_pocket_length: "frontPocket",
  top_pocket_width: "frontPocket",
  jabzour_length: "jabzour",
  jabzour_width: "jabzour",
  side_pocket_length: "sidePocket",
  side_pocket_width: "sidePocket",
  collar_height: "collar",
  collar_width: "collar",
};

/**
 * Build the filter set from prior-trip feedback. Returns null if feedback is
 * missing or has no flagged changes — callers should fall back to the full view
 * in that case.
 */
export function buildAlterationFilter(
  feedback: GarmentFeedback | null | undefined,
): AlterationFilter | null {
  if (!feedback) return null;

  const diffs = parseJson<MeasurementDiffEntry[]>(feedback.measurement_diffs) ?? [];
  const options = parseJson<OptionChecklistEntry[]>(feedback.options_checklist) ?? [];

  const measurementKeys = new Set<string>();
  const fieldReasons = new Map<string, AlterationReason>();
  for (const d of diffs) {
    if (!d?.field) continue;
    // Only keep rows where the value actually changed from the prior trip.
    const orig = d.original_value;
    const next = d.actual_value == null || d.actual_value === ""
      ? null
      : Number(d.actual_value);
    if (orig == null || next == null) continue;
    if (Number(orig) !== next) {
      measurementKeys.add(d.field);
      if (d.reason && REASON_LABELS.has(d.reason as AlterationReason)) {
        fieldReasons.set(d.field, d.reason as AlterationReason);
      }
    }
  }

  const visibleSections = new Set<AlterationStyleSection>();
  for (const key of measurementKeys) {
    const sec = MEASUREMENT_TO_SECTION[key];
    if (sec) visibleSections.add(sec);
  }
  for (const opt of options) {
    if (!opt?.option_name) continue;
    if (!opt.rejected && !opt.hashwa_rejected) continue;
    for (const sec of OPTION_TO_SECTIONS[opt.option_name] ?? []) {
      visibleSections.add(sec);
    }
  }

  if (measurementKeys.size === 0 && visibleSections.size === 0) return null;
  return { measurementKeys, fieldReasons, visibleSections, hideUnchanged: true };
}

/** Tailwind classes for the measurement cell tint per fault category. */
export const ALTERATION_REASON_CELL_CLASS: Record<AlterationReason, string> = {
  "Customer Request": "bg-emerald-100 border-emerald-500 text-emerald-900",
  "Workshop Error": "bg-red-100 border-red-500 text-red-900",
  "Shop Error": "bg-zinc-200 border-zinc-500 text-zinc-900",
};

// ── Alt-out (alteration-order garments brought from outside) ─────────────────

/** Style key (alteration_styles JSON) → sections affected. Mirrors the keys
 *  produced by the alteration-garment-form when toggling sparse style fields. */
const STYLE_KEY_TO_SECTIONS: Record<string, AlterationStyleSection[]> = {
  collar_type: ["collar"],
  collar_button: ["collar"],
  collar_position: ["collar"],
  collar_thickness: ["collar"],
  small_tabaggi: ["collar"],
  cuffs_type: ["cuffs"],
  cuffs_thickness: ["cuffs"],
  front_pocket_type: ["frontPocket"],
  front_pocket_thickness: ["frontPocket"],
  wallet_pocket: ["frontPocket"],
  pen_holder: ["frontPocket"],
  mobile_pocket: ["frontPocket"],
  jabzour_1: ["jabzour"],
  jabzour_2: ["jabzour"],
  jabzour_thickness: ["jabzour"],
};

/** Build the filter for an alteration_order garment (garment_type='alteration').
 *  Source of changes: sparse `alteration_measurements` + `alteration_styles`.
 *  All changed cells flagged "Customer Request". Returns null when nothing
 *  changed (which means full_set mode — render the full table without flags).
 *
 *  `hasBaseline` controls whether unchanged cells are hidden (no baseline →
 *  only sparse changes are renderable) or kept visible with just the changed
 *  cells flagged (baseline present → full table with highlights). */
export function buildAltOutFilter(garment: {
  garment_type?: string | null;
  alteration_measurements?: unknown;
  alteration_styles?: unknown;
}, hasBaseline: boolean): AlterationFilter | null {
  if (garment.garment_type !== "alteration") return null;

  const altMeas = parseJson<Record<string, unknown>>(garment.alteration_measurements) ?? {};
  const altStyles = parseJson<Record<string, unknown>>(garment.alteration_styles) ?? {};

  const measurementKeys = new Set<string>();
  const fieldReasons = new Map<string, AlterationReason>();
  for (const k of Object.keys(altMeas)) {
    if (altMeas[k] == null || altMeas[k] === "") continue;
    measurementKeys.add(k);
    fieldReasons.set(k, "Customer Request");
  }

  const visibleSections = new Set<AlterationStyleSection>();
  for (const key of measurementKeys) {
    const sec = MEASUREMENT_TO_SECTION[key];
    if (sec) visibleSections.add(sec);
  }
  for (const k of Object.keys(altStyles)) {
    if (altStyles[k] == null || altStyles[k] === "") continue;
    for (const sec of STYLE_KEY_TO_SECTIONS[k] ?? []) {
      visibleSections.add(sec);
    }
  }

  if (measurementKeys.size === 0 && visibleSections.size === 0) return null;
  return { measurementKeys, fieldReasons, visibleSections, hideUnchanged: !hasBaseline };
}

/**
 * Resolve the measurement record to display for an alt-out garment.
 *  - full_set mode (`full_measurement_set` populated) → that record, as-is.
 *  - changes_only with `original_garment_measurement` → original overlaid with
 *    sparse `alteration_measurements` (changes win).
 *  - changes_only with no link → only sparse fields populated; rest blank.
 *
 * Returns null for non-alteration garments — caller should fall back to
 * `garment.measurement`.
 */
export function getAltOutEffectiveMeasurement<T extends Record<string, unknown>>(garment: {
  garment_type?: string | null;
  alteration_measurements?: unknown;
  full_measurement_set?: T | null;
  original_garment_measurement?: T | null;
}): T | null {
  if (garment.garment_type !== "alteration") return null;
  if (garment.full_measurement_set) return garment.full_measurement_set;

  const altMeas = parseJson<Record<string, unknown>>(garment.alteration_measurements) ?? {};
  const hasOriginal = !!garment.original_garment_measurement;
  const base: Record<string, unknown> = hasOriginal
    ? { ...(garment.original_garment_measurement as Record<string, unknown>) }
    : {};
  let touched = hasOriginal;
  for (const k of Object.keys(altMeas)) {
    if (altMeas[k] == null || altMeas[k] === "") continue;
    base[k] = altMeas[k];
    touched = true;
  }
  return touched ? (base as T) : null;
}
