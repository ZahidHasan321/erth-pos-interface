import type { MeasurementIssue, TripHistoryEntry, WorkshopGarment } from "@repo/database";
import type { AlterationFilter, AlterationStyleSection } from "./alteration-filter";

/**
 * Aggregate measurement corrections recorded by QC across all trip QC-pass
 * attempts. Later attempts override earlier ones for the same field.
 *
 * Returns a map keyed by measurement field name (e.g. "chest_full").
 */
export function getMeasurementCorrections(
  tripHistory: unknown,
): Map<string, MeasurementIssue> {
  const map = new Map<string, MeasurementIssue>();
  const trips = tripHistory as TripHistoryEntry[] | null | undefined;
  if (!trips) return map;
  for (const trip of trips) {
    for (const att of trip.qc_attempts ?? []) {
      if (att.result !== "pass") continue;
      for (const iss of att.measurement_issues ?? []) {
        map.set(iss.field, iss);
      }
    }
  }
  return map;
}

// Aligned with alteration-filter STYLE_KEY_TO_SECTIONS so the same section a
// shop reports against (e.g. "frontPocket") enables the same option keys here.
export const QC_OPTION_TO_SECTION: Record<string, AlterationStyleSection> = {
  collar_type: "collar",
  collar_button: "collar",
  collar_position: "collar",
  collar_thickness: "collar",
  small_tabaggi: "collar",
  jabzour_1: "jabzour",
  jabzour_2: "jabzour",
  jabzour_thickness: "jabzour",
  cuffs_type: "cuffs",
  cuffs_thickness: "cuffs",
  front_pocket_type: "frontPocket",
  front_pocket_thickness: "frontPocket",
  pen_holder: "frontPocket",
  // Wallet + mobile accessory pills render inside the Side Pocket section in
  // DishdashaOverlay, not Front Pocket — keep the section mapping aligned so
  // QC defects surface next to the visible pill.
  wallet_pocket: "sidePocket",
  mobile_pocket: "sidePocket",
};

const QC_MEASUREMENT_TO_SECTION: Record<string, AlterationStyleSection> = {
  top_pocket_length: "frontPocket",
  top_pocket_width: "frontPocket",
  jabzour_length: "jabzour",
  jabzour_width: "jabzour",
  side_pocket_length: "sidePocket",
  side_pocket_width: "sidePocket",
  collar_height: "collar",
  collar_width: "collar",
};

/** Quality aspects that belong to a visible style section, so a workmanship
 *  fail opens the part it was rated against. seam / ironing / hemming are
 *  whole-garment and map nowhere — they surface in the quality panel only. */
const QC_QUALITY_TO_SECTION: Record<string, AlterationStyleSection> = {
  front_pocket: "frontPocket",
  collar: "collar",
  jabzour: "jabzour",
};

export interface QcFailContext {
  /** Measurement key → operator-recorded value that failed tolerance. */
  actuals: Map<string, number>;
  /** Option key (DB column name) → operator-recorded value that mismatched the spec.
   *  Lets the terminal render a red "QC saw X" badge alongside the expected style. */
  optionActuals: Map<string, unknown>;
  /** Failed options that belong to no style section (lines, shoulder_slope).
   *  Without this they render nowhere and the fail reads as a blank overlay. */
  metaActuals: Map<string, unknown>;
  /** Quality aspect key → the rating it failed on. No spec value to compare
   *  against, so these carry a score rather than a wrong-vs-right pair. */
  failedQuality: Map<string, number>;
  /** Filter reusing the alteration-overlay machinery for style sections. */
  filter: AlterationFilter;
}

/**
 * Build the QC-fail overlay context from the latest fail attempt of the
 * current trip. Returns null when no fail this trip — caller falls back to
 * the regular alteration filter.
 */
export function buildQcFailContext(garment: WorkshopGarment): QcFailContext | null {
  const trip = garment.trip_number ?? 1;
  const hist = garment.trip_history as TripHistoryEntry[] | null;
  const entry = hist?.find((t) => t.trip === trip);
  const lastFail = entry?.qc_attempts
    ?.filter((a) => a.result === "fail")
    .at(-1);
  if (!lastFail) return null;

  const actuals = new Map<string, number>();
  for (const k of lastFail.failed_measurements ?? []) {
    const v = lastFail.measurements?.[k];
    if (typeof v === "number" && Number.isFinite(v)) actuals.set(k, v);
  }

  // A failed option with no style section (lines, shoulder_slope) has nowhere to
  // render beside a garment part — split it out for the meta strip instead of
  // dropping it, which is what made a lines-only fail show an empty overlay.
  const optionActuals = new Map<string, unknown>();
  const metaActuals = new Map<string, unknown>();
  for (const k of lastFail.failed_options ?? []) {
    const v = lastFail.options?.[k];
    if (v === undefined) continue;
    if (QC_OPTION_TO_SECTION[k]) optionActuals.set(k, v);
    else metaActuals.set(k, v);
  }

  const failedQuality = new Map<string, number>();
  for (const k of lastFail.failed_quality ?? []) {
    failedQuality.set(k, Number(lastFail.quality_ratings?.[k] ?? 0));
  }

  const visibleSections = new Set<AlterationStyleSection>();
  for (const k of optionActuals.keys()) {
    const sec = QC_OPTION_TO_SECTION[k];
    if (sec) visibleSections.add(sec);
  }
  for (const k of actuals.keys()) {
    const sec = QC_MEASUREMENT_TO_SECTION[k];
    if (sec) visibleSections.add(sec);
  }
  for (const k of failedQuality.keys()) {
    const sec = QC_QUALITY_TO_SECTION[k];
    if (sec) visibleSections.add(sec);
  }

  const measurementKeys = new Set(actuals.keys());
  if (
    measurementKeys.size === 0 &&
    visibleSections.size === 0 &&
    optionActuals.size === 0 &&
    metaActuals.size === 0 &&
    failedQuality.size === 0
  ) {
    return null;
  }

  return {
    actuals,
    optionActuals,
    metaActuals,
    failedQuality,
    filter: {
      measurementKeys,
      // Cause is uniform for a QC fail and is stated in words, not colour —
      // red is reserved for the wrong value itself (see DishdashaOverlay).
      fieldReasons: new Map(),
      causeLabel: "QC found",
      // The QC-recorded reading IS the wrong value for every flagged field.
      fieldPrevious: new Map<string, unknown>(actuals),
      visibleSections,
      hideUnchanged: true,
    },
  };
}
