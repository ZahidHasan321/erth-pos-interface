import type { MeasurementIssue, TripHistoryEntry } from "@repo/database";

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
