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
  return { measurementKeys, fieldReasons, visibleSections };
}

/** Tailwind classes for the measurement cell tint per fault category. */
export const ALTERATION_REASON_CELL_CLASS: Record<AlterationReason, string> = {
  "Customer Request": "bg-emerald-100 border-emerald-500 text-emerald-900",
  "Workshop Error": "bg-red-100 border-red-500 text-red-900",
  "Shop Error": "bg-zinc-200 border-zinc-500 text-zinc-900",
};
