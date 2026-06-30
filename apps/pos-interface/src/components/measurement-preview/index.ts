import type { Measurement } from "@repo/database";

export { MeasurementPreviewDialog } from "./MeasurementPreviewDialog";
export { MeasurementTerminalPreview } from "./MeasurementTerminalPreview";
export type { PreviewStyleNames } from "./MeasurementPreviewSidePanel";

const normalizeCollarPosition = (v: unknown): "up" | "down" | null =>
  v === "up" || v === "down" ? v : null;

const numEq = (a: unknown, b: unknown): boolean => {
  const na = a == null || a === "" ? null : Number(a);
  const nb = b == null || b === "" ? null : Number(b);
  return na === nb;
};

export interface FeedbackPreviewInput {
  /** Saved measurement row the corrections derive from. */
  base: Partial<Measurement> | null | undefined;
  /** Per-keystroke numeric edits, keyed by measurements column. */
  feedbackMeasurements: Record<string, number | "">;
  shoulderSlopeNew: string;
  collarPositionNew: string;
  /** Per-key difference reason (e.g. "Workshop Error"). */
  differenceReasons: Record<string, string>;
  /** The measurement keys the feedback form edits. */
  measurementKeys: readonly string[];
}

export interface FeedbackPreviewData {
  values: Partial<Measurement>;
  changedKeys: Set<string>;
  reasonByKey: Record<string, string>;
}

/**
 * Build the feedback preview's "only what's wrong" data: overlay the live
 * corrections on the saved measurement, and flag a key as changed when either
 * its value differs from the saved spec OR it carries a difference reason (e.g.
 * a workshop mistake with an unchanged value). Pure — safe to unit test.
 */
export function buildFeedbackPreviewData({
  base,
  feedbackMeasurements,
  shoulderSlopeNew,
  collarPositionNew,
  differenceReasons,
  measurementKeys,
}: FeedbackPreviewInput): FeedbackPreviewData {
  const values: Partial<Measurement> = { ...(base ?? {}) };
  const changedKeys = new Set<string>();

  for (const key of measurementKeys) {
    const fb = feedbackMeasurements[key];
    const hasReason = !!differenceReasons[key];
    if (fb !== "" && fb !== undefined) {
      (values as Record<string, unknown>)[key] = fb;
      if (!numEq(base?.[key as keyof Measurement], fb)) changedKeys.add(key);
    }
    if (hasReason) changedKeys.add(key);
  }

  if (shoulderSlopeNew !== "") {
    (values as Record<string, unknown>).shoulder_slope = shoulderSlopeNew;
    if (shoulderSlopeNew !== (base?.shoulder_slope ?? "")) {
      changedKeys.add("shoulder_slope");
    }
  }
  if (differenceReasons["shoulder_slope"]) changedKeys.add("shoulder_slope");

  if (collarPositionNew !== "") {
    const normalized = collarPositionNew === "standard" ? null : collarPositionNew;
    (values as Record<string, unknown>).collar_position = normalized;
    if (normalized !== normalizeCollarPosition(base?.collar_position)) {
      changedKeys.add("collar_position");
    }
  }
  if (differenceReasons["collar_position"]) changedKeys.add("collar_position");

  return { values, changedKeys, reasonByKey: differenceReasons };
}
