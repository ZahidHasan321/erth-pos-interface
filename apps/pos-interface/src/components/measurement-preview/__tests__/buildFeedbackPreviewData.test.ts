import { describe, it, expect } from "vitest";
import { buildFeedbackPreviewData } from "../index";

const KEYS = ["shoulder", "collar_width", "bottom"] as const;

const base = {
  shoulder: 20,
  collar_width: 15,
  bottom: 60,
  shoulder_slope: "straight",
  collar_position: null,
} as never;

describe("buildFeedbackPreviewData", () => {
  it("flags a key whose value differs from the saved spec", () => {
    const { values, changedKeys } = buildFeedbackPreviewData({
      base,
      feedbackMeasurements: { shoulder: 22 },
      shoulderSlopeNew: "",
      collarPositionNew: "",
      differenceReasons: {},
      measurementKeys: KEYS,
    });
    expect(changedKeys.has("shoulder")).toBe(true);
    expect(changedKeys.has("collar_width")).toBe(false);
    expect((values as Record<string, unknown>).shoulder).toBe(22);
  });

  it("does NOT flag a re-entered value equal to the saved spec", () => {
    const { changedKeys } = buildFeedbackPreviewData({
      base,
      feedbackMeasurements: { collar_width: 15 },
      shoulderSlopeNew: "",
      collarPositionNew: "",
      differenceReasons: {},
      measurementKeys: KEYS,
    });
    expect(changedKeys.has("collar_width")).toBe(false);
  });

  it("flags a reason-only field even when the value is unchanged (workshop mistake)", () => {
    const { changedKeys, reasonByKey } = buildFeedbackPreviewData({
      base,
      feedbackMeasurements: {},
      shoulderSlopeNew: "",
      collarPositionNew: "",
      differenceReasons: { bottom: "Workshop Error" },
      measurementKeys: KEYS,
    });
    expect(changedKeys.has("bottom")).toBe(true);
    expect(reasonByKey.bottom).toBe("Workshop Error");
  });

  it("tracks categorical changes (shoulder slope, collar position)", () => {
    const { values, changedKeys } = buildFeedbackPreviewData({
      base,
      feedbackMeasurements: {},
      shoulderSlopeNew: "both_down",
      collarPositionNew: "up",
      differenceReasons: {},
      measurementKeys: KEYS,
    });
    expect(changedKeys.has("shoulder_slope")).toBe(true);
    expect(changedKeys.has("collar_position")).toBe(true);
    expect((values as Record<string, unknown>).shoulder_slope).toBe("both_down");
    expect((values as Record<string, unknown>).collar_position).toBe("up");
  });

  it("collar_position 'standard' normalizes to null and is unchanged vs a null base", () => {
    const { values, changedKeys } = buildFeedbackPreviewData({
      base,
      feedbackMeasurements: {},
      shoulderSlopeNew: "",
      collarPositionNew: "standard",
      differenceReasons: {},
      measurementKeys: KEYS,
    });
    expect((values as Record<string, unknown>).collar_position).toBeNull();
    expect(changedKeys.has("collar_position")).toBe(false);
  });

  it("no changes → empty changedKeys", () => {
    const { changedKeys } = buildFeedbackPreviewData({
      base,
      feedbackMeasurements: {},
      shoulderSlopeNew: "",
      collarPositionNew: "",
      differenceReasons: {},
      measurementKeys: KEYS,
    });
    expect(changedKeys.size).toBe(0);
  });
});
