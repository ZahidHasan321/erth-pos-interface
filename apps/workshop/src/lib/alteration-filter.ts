import type { GarmentFeedback } from "@repo/database";
import { isMeasurementFlagged } from "@repo/database";
import {
  collarTypes,
  collarButtons,
  cuffTypes,
  jabzourTypes,
  topPocketTypes,
  type BaseOption,
} from "@/components/forms/add-garment/constants";

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
  expected_value?: unknown;
  new_value?: unknown;
  rejected?: boolean | null;
  hashwa_rejected?: boolean | null;
  hashwa_new_value?: unknown;
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
  penHolder: ["frontPocket"],
  walletPocket: ["sidePocket"],
  mobilePocket: ["sidePocket"],
  collarPosition: ["collar"],
  // lines is shown in the top meta row (LINE SINGLE/DOUBLE), not in a sidebar
  // section — value updates via propagation; no section to flag.
};

/** measurement key → section whose sidebar depends on it. */
const MEASUREMENT_TO_SECTION: Record<string, AlterationStyleSection> = {
  top_pocket_length: "frontPocket",
  top_pocket_width: "frontPocket",
  top_pocket_distance: "frontPocket",
  jabzour_length: "jabzour",
  jabzour_width: "jabzour",
  second_button_distance: "jabzour",
  side_pocket_length: "sidePocket",
  side_pocket_width: "sidePocket",
  collar_height: "collar",
  collar_width: "collar",
  // Basma renders inside the Cuffs section in DishdashaOverlay — flag it so a
  // customer asking for basma changes lights up the right sidebar group.
  basma_length: "cuffs",
  basma_width: "cuffs",
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
    // Keep a row when its value changed from the prior trip OR a fault reason
    // was recorded against it (even with no new value) — §2.5: a reason-only
    // flag still tells the workshop to re-check that measurement. Shared with
    // the shop feedback recorder via isMeasurementFlagged.
    const flagged = isMeasurementFlagged({
      originalValue: d.original_value,
      newValue: d.actual_value,
      reason: d.reason,
    });
    if (!flagged) continue;
    measurementKeys.add(d.field);
    if (d.reason && REASON_LABELS.has(d.reason as AlterationReason)) {
      fieldReasons.set(d.field, d.reason as AlterationReason);
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

// ── Option change diffs (add/remove/picker change/hashwa change) ──────────
// Surfaces what the sewer must DO this trip, not just the post-change state.
// "Remove Pen Holder" / "Add Small Tabaggi" / "Collar: Round → Japanese".

export type OptionChangeKind = "add" | "remove" | "change" | "hashwa";

export interface OptionChange {
  kind: OptionChangeKind;
  /** Option group label, e.g. "Pen Holder", "Collar Type", "Front Pocket Hashwa". */
  label: string;
  /** "meta" for row-level fields like lines / style; otherwise a sidebar section. */
  section: AlterationStyleSection | "meta";
  /** For kind="change" / "hashwa": display strings of prior and new values. */
  fromText?: string;
  toText?: string;
}

/** option_name → human label for the change banner. */
const OPTION_LABELS: Record<string, string> = {
  collar: "Collar",
  collarBtn: "Collar Button",
  smallTabaggi: "Small Tabaggi",
  jabzour: "Jabzour",
  frontPocket: "Front Pocket",
  cuff: "Cuff",
  walletPocket: "Wallet Pocket",
  penHolder: "Pen Holder",
  mobilePocket: "Mobile Pocket",
  collarPosition: "Collar Position",
  lines: "Lines",
};

/** Picker option lists used to resolve enum value → display name. */
const OPTION_VALUE_LIST: Record<string, BaseOption[]> = {
  collar: collarTypes,
  collarBtn: collarButtons,
  frontPocket: topPocketTypes,
  cuff: cuffTypes,
  jabzour: jabzourTypes,
};

/** Friendly value lookup for picker / sentinel fields. Falls back to raw. */
function resolveValueText(optName: string, value: unknown): string {
  if (value == null || value === "") return "-";
  const list = OPTION_VALUE_LIST[optName];
  if (list) {
    const found = list.find((o) => o.value === value || o.displayText === value);
    if (found) return found.displayText;
  }
  if (optName === "collarPosition") {
    if (value === "up") return "Up";
    if (value === "down") return "Down";
    if (value === "__standard__") return "Standard";
  }
  if (optName === "lines") {
    return value === "1" || value === 1 ? "Single" : value === "2" || value === 2 ? "Double" : String(value);
  }
  return String(value);
}

/**
 * Build the list of changes the sewer must apply this trip, derived from the
 * prior-trip feedback's options_checklist. The post-save garment row already
 * reflects the new state — this list tells the sewer *what to actually do*
 * (remove the pen, add the tabaggi, change the collar) which the post-state
 * alone can't convey.
 */
export function buildOptionChanges(
  feedback: GarmentFeedback | null | undefined,
): OptionChange[] {
  if (!feedback) return [];
  const options = parseJson<OptionChecklistEntry[]>(feedback.options_checklist) ?? [];
  const out: OptionChange[] = [];

  for (const opt of options) {
    if (!opt?.option_name) continue;
    const sections = OPTION_TO_SECTIONS[opt.option_name];
    // Meta-row options (lines) — track as section: "meta".
    const targetSections: Array<AlterationStyleSection | "meta"> = sections && sections.length > 0
      ? sections
      : opt.option_name === "lines" || opt.option_name === "style"
        ? ["meta"]
        : [];
    if (targetSections.length === 0) continue;

    const label = OPTION_LABELS[opt.option_name] ?? opt.option_name;

    // Main rejection — figure out kind from the stored expected_value.
    if (opt.rejected) {
      let change: OptionChange | null = null;
      // Boolean toggle: expected_value is the literal "Yes" / "No" string we
      // wrote at feedback time. Direction of the flip is implicit.
      if (opt.expected_value === "Yes") {
        change = { kind: "remove", label, section: targetSections[0]! };
      } else if (opt.expected_value === "No") {
        change = { kind: "add", label, section: targetSections[0]! };
      } else if (opt.new_value != null && opt.new_value !== "") {
        // Picker / enum change — surface both ends.
        change = {
          kind: "change",
          label,
          section: targetSections[0]!,
          fromText: resolveValueText(opt.option_name, opt.expected_value),
          toText: resolveValueText(opt.option_name, opt.new_value),
        };
      }
      if (change) {
        // Replicate across each affected section so e.g. walletPocket shows on
        // sidePocket even though it only has one section today.
        for (const sec of targetSections) {
          out.push({ ...change, section: sec });
        }
      }
    }

    // Hashwa rejection (thickness change) — separate row in the banner. We
    // only have the new value stored, not the prior, so render "→ TRIPLE".
    if (opt.hashwa_rejected && opt.hashwa_new_value != null && opt.hashwa_new_value !== "") {
      for (const sec of targetSections) {
        out.push({
          kind: "hashwa",
          label: `${label} Hashwa`,
          section: sec,
          toText: String(opt.hashwa_new_value).toUpperCase(),
        });
      }
    }
  }

  return out;
}

/** Tailwind class strings for OptionChange chip rendering — picked to mirror
 *  the feedback-page color language (green = add, red = remove, amber = change). */
export const OPTION_CHANGE_KIND_CLASS: Record<OptionChangeKind, string> = {
  add: "bg-emerald-100 border-emerald-400 text-emerald-900",
  remove: "bg-red-100 border-red-400 text-red-900",
  change: "bg-amber-100 border-amber-400 text-amber-900",
  hashwa: "bg-amber-100 border-amber-400 text-amber-900",
};

/** Symbol prefix for each change kind. Kept ASCII so it prints clean. */
export const OPTION_CHANGE_KIND_SYMBOL: Record<OptionChangeKind, string> = {
  add: "+",
  remove: "−",
  change: "→",
  hashwa: "→",
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
