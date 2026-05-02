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

const QC_OPTION_TO_SECTION: Record<string, AlterationStyleSection> = {
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
  collar_length: "collar",
};

export interface QcFailContext {
  /** key → operator-recorded value that failed tolerance this attempt. */
  actuals: Map<string, number>;
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

  const fieldReasons = new Map(
    [...actuals.keys()].map((k) => [k, "Workshop Error" as const]),
  );

  const visibleSections = new Set<AlterationStyleSection>();
  for (const k of lastFail.failed_options ?? []) {
    const sec = QC_OPTION_TO_SECTION[k];
    if (sec) visibleSections.add(sec);
  }
  for (const k of actuals.keys()) {
    const sec = QC_MEASUREMENT_TO_SECTION[k];
    if (sec) visibleSections.add(sec);
  }

  const measurementKeys = new Set(actuals.keys());
  if (measurementKeys.size === 0 && visibleSections.size === 0) return null;

  return {
    actuals,
    filter: {
      measurementKeys,
      fieldReasons,
      visibleSections,
      hideUnchanged: true,
    },
  };
}
