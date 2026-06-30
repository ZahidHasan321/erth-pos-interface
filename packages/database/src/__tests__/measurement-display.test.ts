/**
 * measurement-display.test.ts
 *
 * Two concerns, both surfaced by the "points to see" feedback (point 5):
 *
 *  1. Decimal → fraction conversion (parseMeasurementParts / formatMeasurement).
 *     The values shown in the QC "Failed QC — return to production" dialog and
 *     the dishdasha diagram are renderings of stored decimals. This pins the
 *     exact outputs (64.25 → 64¼, 64.5 → 64½, 63 → 63 …) so a future tweak to
 *     the snapping can't silently shift what the workshop reads.
 *
 *  2. isMeasurementFlagged — a measurement surfaces as an alteration/QC item
 *     when its value CHANGED **or** a fault reason was recorded against it,
 *     even with no new value entered (§2.5). Shared by the shop feedback
 *     recorder and the workshop alteration filter.
 *
 * Pure helpers — no DB, no Docker. Runs via `pnpm --filter @repo/database test`.
 */

import { describe, it, expect } from "vitest";
import {
  parseMeasurementParts,
  formatMeasurement,
  isMeasurementFlagged,
} from "../utils";

// ── 1. Fraction conversion — the values the dialog/diagram render ────────────

describe("parseMeasurementParts — quarter parts", () => {
  it("the point-5 values convert exactly", () => {
    expect(parseMeasurementParts(64.25)).toMatchObject({ whole: 64, numerator: 1, denominator: 4, hasDegree: false });
    expect(parseMeasurementParts(64.5)).toMatchObject({ whole: 64, numerator: 1, denominator: 2, hasDegree: false });
    expect(parseMeasurementParts(63.25)).toMatchObject({ whole: 63, numerator: 1, denominator: 4, hasDegree: false });
    expect(parseMeasurementParts(0.75)).toMatchObject({ whole: 0, numerator: 3, denominator: 4 });
  });

  it("a whole number has no fraction part", () => {
    expect(parseMeasurementParts(63)).toMatchObject({ whole: 63, numerator: 0, denominator: 1, hasDegree: false });
    expect(parseMeasurementParts(64)).toMatchObject({ whole: 64, numerator: 0, denominator: 1, hasDegree: false });
  });

  it("snaps to the nearest eighth", () => {
    // 10.3 → nearest eighth is 10 2/8 = 10 1/4
    expect(parseMeasurementParts(10.3)).toMatchObject({ whole: 10, numerator: 1, denominator: 4 });
    // 10.99 → rounds up to 11
    expect(parseMeasurementParts(10.99)).toMatchObject({ whole: 11, numerator: 0 });
  });

  it("an odd eighth sets hasDegree (the ° mark)", () => {
    // 10.125 = 10 1/8 → quarters 0, degree on
    expect(parseMeasurementParts(10.125)).toMatchObject({ whole: 10, numerator: 0, hasDegree: true });
    // 10.375 = 10 3/8 → 10 1/4°
    expect(parseMeasurementParts(10.375)).toMatchObject({ whole: 10, numerator: 1, denominator: 4, hasDegree: true });
  });

  it("negatives keep magnitude + flag sign", () => {
    expect(parseMeasurementParts(-2.5)).toMatchObject({ whole: 2, numerator: 1, denominator: 2, negative: true });
  });

  it("subtracts the degree offset before snapping", () => {
    // 64.25 measured, degree 0.25 → effective 64.0
    expect(parseMeasurementParts(64.25, 0.25)).toMatchObject({ whole: 64, numerator: 0 });
  });

  it("returns null for empty / non-numeric / snaps-to-zero", () => {
    expect(parseMeasurementParts(null)).toBeNull();
    expect(parseMeasurementParts("")).toBeNull();
    expect(parseMeasurementParts("abc")).toBeNull();
    expect(parseMeasurementParts(0)).toBeNull();
    expect(parseMeasurementParts(0.02)).toBeNull(); // rounds to 0 eighths
  });
});

describe("formatMeasurement — plain text fraction string", () => {
  it("renders the point-5 values as the dialog/diagram show them", () => {
    expect(formatMeasurement(64.25)).toBe("64 1/4");
    expect(formatMeasurement(64.5)).toBe("64 1/2");
    expect(formatMeasurement(63)).toBe("63");
    expect(formatMeasurement(63.25)).toBe("63 1/4");
  });

  it("bare fraction has no leading whole when whole is 0", () => {
    expect(formatMeasurement(0.5)).toBe("1/2");
  });

  it("renders the degree mark and sign", () => {
    expect(formatMeasurement(10.375)).toBe("10 1/4°");
    expect(formatMeasurement(-2.5)).toBe("-2 1/2");
  });

  it("empty input → empty string", () => {
    expect(formatMeasurement(null)).toBe("");
    expect(formatMeasurement("")).toBe("");
  });
});

// ── Boundary / degree-convention coverage (audit gaps) ───────────────────────
// The ° means "+1/8 above the printed quarter". These pin every odd-eighth and
// the round-half-up tie-break, so a future change to the snapping can't silently
// shift what the workshop reads off the spec sheet.

describe("formatMeasurement — every eighth in a whole, and whole+degree", () => {
  it("renders all eight eighths of one unit", () => {
    expect(formatMeasurement(1.0)).toBe("1");       // 0/8
    expect(formatMeasurement(1.125)).toBe("1°");    // 1/8  → 0  + °
    expect(formatMeasurement(1.25)).toBe("1 1/4");  // 2/8
    expect(formatMeasurement(1.375)).toBe("1 1/4°"); // 3/8 → 1/4 + °
    expect(formatMeasurement(1.5)).toBe("1 1/2");   // 4/8
    expect(formatMeasurement(1.625)).toBe("1 1/2°"); // 5/8 → 1/2 + °
    expect(formatMeasurement(1.75)).toBe("1 3/4");  // 6/8
    expect(formatMeasurement(1.875)).toBe("1 3/4°"); // 7/8 → 3/4 + °
    expect(formatMeasurement(2.0)).toBe("2");       // 8/8
  });

  it("a bare 1/8 with no whole shows the degree alone", () => {
    expect(formatMeasurement(0.125)).toBe("0°"); // documents the °=+1/8 convention
  });
});

describe("parseMeasurementParts — round-half-up tie-break at the 1/16 midpoint", () => {
  // Math.round rounds the exact midpoint between two eighths UP, symmetric in
  // magnitude for negatives. If this ever changes, these break loudly.
  it("a 1/16 value rounds up to the next eighth", () => {
    expect(parseMeasurementParts(0.0625)).toMatchObject({ whole: 0, numerator: 0, hasDegree: true }); // → 1/8
    expect(parseMeasurementParts(0.1875)).toMatchObject({ whole: 0, numerator: 1, denominator: 4 });  // → 2/8
    expect(parseMeasurementParts(0.9375)).toMatchObject({ whole: 1, numerator: 0, hasDegree: false }); // → 8/8
  });

  it("negatives round by magnitude (also up), keeping the sign", () => {
    expect(parseMeasurementParts(-0.1875)).toMatchObject({ whole: 0, numerator: 1, denominator: 4, negative: true });
    expect(formatMeasurement(-0.1875)).toBe("-1/4");
  });
});

describe("formatMeasurement — large values and real investigation values", () => {
  it("passes large whole numbers through", () => {
    expect(formatMeasurement(1_000_000_000)).toBe("1000000000");
    expect(formatMeasurement("64.25")).toBe("64 1/4"); // string input parses
  });

  it("the order-2523 vs Airtable values render as the surfaces showed them", () => {
    expect(formatMeasurement(5.63)).toBe("5 1/2°");   // really ~5 5/8
    expect(formatMeasurement(13.38)).toBe("13 1/4°"); // really ~13 3/8
    expect(formatMeasurement(49.75)).toBe("49 3/4");
    expect(formatMeasurement(60)).toBe("60");
    expect(formatMeasurement(16.25)).toBe("16 1/4");
  });
});

// ── 2. Flagging — value change OR reason-only (§2.5) ─────────────────────────

describe("isMeasurementFlagged", () => {
  it("a real value change flags (with or without a reason)", () => {
    expect(isMeasurementFlagged({ originalValue: 64.25, newValue: 64, reason: null })).toBe(true);
    expect(isMeasurementFlagged({ originalValue: 64.25, newValue: 64, reason: "Customer Request" })).toBe(true);
    // string-typed value (as stored in measurement_diffs) still compares numerically
    expect(isMeasurementFlagged({ originalValue: 63.25, newValue: "63", reason: null })).toBe(true);
  });

  it("a reason with NO entered value still flags — the point of this change", () => {
    expect(isMeasurementFlagged({ originalValue: 64.25, newValue: null, reason: "Shop Error" })).toBe(true);
    expect(isMeasurementFlagged({ originalValue: 64.25, newValue: "", reason: "Workshop Error" })).toBe(true);
  });

  it("an unchanged value with no reason does NOT flag", () => {
    expect(isMeasurementFlagged({ originalValue: 64.25, newValue: 64.25, reason: null })).toBe(false);
    expect(isMeasurementFlagged({ originalValue: 64.25, newValue: "64.25", reason: null })).toBe(false);
  });

  it("no value and no reason does NOT flag", () => {
    expect(isMeasurementFlagged({ originalValue: 64.25, newValue: null, reason: null })).toBe(false);
    expect(isMeasurementFlagged({ originalValue: 64.25, newValue: "", reason: "" })).toBe(false);
    expect(isMeasurementFlagged({ originalValue: 64.25, newValue: "", reason: "   " })).toBe(false);
  });

  it("a missing original spec can't register a value change, but a reason still flags", () => {
    expect(isMeasurementFlagged({ originalValue: null, newValue: 64, reason: null })).toBe(false);
    expect(isMeasurementFlagged({ originalValue: null, newValue: null, reason: "Shop Error" })).toBe(true);
  });
});
