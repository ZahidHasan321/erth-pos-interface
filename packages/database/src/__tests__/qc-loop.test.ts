/**
 * qc-loop.test.ts — Unit tests for the iterative QC rework loop.
 *
 * Tests two complementary pure modules:
 *   - deriveReworkEnabledKeys (production-logic.ts): narrowing derivation
 *   - evaluateQc (qc-spec.ts): respects enabledKeys — out-of-scope keys
 *     cannot fail regardless of input
 *
 * No DB, no Docker required. Runs via `pnpm --filter @repo/database test`.
 */

import { describe, it, expect } from "vitest";
import { deriveReworkEnabledKeys } from "../../../../apps/workshop/src/lib/production-logic";
import { evaluateQc } from "../../../../apps/workshop/src/lib/qc-spec";

// ─── deriveReworkEnabledKeys ────────────────────────────────────────────────

describe("deriveReworkEnabledKeys (CLAUDE.md §QC Fail rework: narrowing derivation)", () => {
  it("returns empty set for null/undefined (no previous fail)", () => {
    expect(deriveReworkEnabledKeys(null).size).toBe(0);
    expect(deriveReworkEnabledKeys(undefined).size).toBe(0);
  });

  it("returns empty set when all failed_* arrays are empty", () => {
    expect(
      deriveReworkEnabledKeys({
        failed_measurements: [],
        failed_options: [],
        failed_quality: [],
      }).size,
    ).toBe(0);
  });

  it("returns empty set when all failed_* are null", () => {
    expect(
      deriveReworkEnabledKeys({
        failed_measurements: null,
        failed_options: null,
        failed_quality: null,
      }).size,
    ).toBe(0);
  });

  it("collects exactly the union of failed_measurements ∪ failed_options ∪ failed_quality", () => {
    const result = deriveReworkEnabledKeys({
      failed_measurements: ["shoulder", "chest_full"],
      failed_options: ["collar_type"],
      failed_quality: ["seam"],
    });
    expect(result).toEqual(new Set(["shoulder", "chest_full", "collar_type", "seam"]));
  });

  it("handles missing sub-arrays (partial object)", () => {
    const result = deriveReworkEnabledKeys({
      failed_measurements: ["sleeve_length"],
    });
    expect(result).toEqual(new Set(["sleeve_length"]));
  });

  it("returns a Set (not an array) and is mutable — jabzour coupling can add to it", () => {
    const result = deriveReworkEnabledKeys({
      failed_measurements: ["jabzour_length"],
      failed_options: ["jabzour_1"],
    });
    // Simulate the UI jabzour coupling rule
    if (result.has("jabzour_1") || result.has("jabzour_2")) {
      result.add("jabzour_1");
      result.add("jabzour_2");
    }
    expect(result.has("jabzour_2")).toBe(true);
  });

  it("deduplicates when the same key appears in multiple arrays", () => {
    const result = deriveReworkEnabledKeys({
      failed_measurements: ["collar_height"],
      failed_options: ["collar_height"], // same key (hypothetically)
    });
    // A Set deduplicates — size should be 1 not 2
    expect(result.size).toBe(1);
    expect(result.has("collar_height")).toBe(true);
  });
});

// ─── evaluateQc × enabledKeys — out-of-scope keys are immune ──────────────

describe("evaluateQc × enabledKeys (CLAUDE.md §QC Fail: passed keys cannot regress)", () => {
  // Minimal expected data: shoulder = 20"
  const expectedMeasurements = { shoulder: 20 };
  const expectedOptions = {};

  it("Round 1 — all keys: wrong shoulder and wrong seam_quality both fail", () => {
    const enabledKeys = new Set(["shoulder", "seam"]);
    const result = evaluateQc(
      expectedMeasurements,
      expectedOptions,
      {
        measurements: { shoulder: 21 }, // > 0.125" tolerance → fail
        options: {},
        quality_ratings: { seam: 2 }, // < 4 threshold → fail
      },
      enabledKeys,
    );
    expect(result.result).toBe("fail");
    expect(result.failed_measurements).toContain("shoulder");
    expect(result.failed_quality).toContain("seam");
  });

  it("Round 2 — narrow to only the failed keys: deliberately wrong out-of-scope key is ignored", () => {
    // Round 1 failed: shoulder (measurement) and seam (quality).
    // Round 2: operator fixes seam (score=5) but shoulder is still wrong.
    //   Additionally, set "ironing" quality to a failing value (1) — but ironing
    //   was NOT in round 1's failed keys, so it must NOT appear in round 2's failures.
    const narrowedKeys = new Set(["shoulder", "seam"]);
    const result = evaluateQc(
      expectedMeasurements,
      expectedOptions,
      {
        measurements: { shoulder: 21 }, // still wrong
        options: {},
        quality_ratings: { seam: 5, ironing: 1 }, // ironing deliberately wrong but out of scope
      },
      narrowedKeys,
    );
    expect(result.result).toBe("fail");
    expect(result.failed_measurements).toContain("shoulder");
    expect(result.failed_quality).not.toContain("seam"); // fixed
    // The critical assertion: ironing is wrong but NOT in enabledKeys → must NOT fail
    expect(result.failed_quality).not.toContain("ironing");
    expect(result.failed_measurements).not.toContain("ironing");
    expect(result.failed_options).not.toContain("ironing");
  });

  it("Round 3 — fix the last failing key: zero failures → pass", () => {
    const narrowedKeys = new Set(["shoulder"]);
    const result = evaluateQc(
      expectedMeasurements,
      expectedOptions,
      {
        measurements: { shoulder: 20.05 }, // within ±0.125" tolerance
        options: {},
        quality_ratings: {},
      },
      narrowedKeys,
    );
    expect(result.result).toBe("pass");
    expect(result.failed_measurements).toHaveLength(0);
    expect(result.failed_options).toHaveLength(0);
    expect(result.failed_quality).toHaveLength(0);
  });

  it("an empty enabledKeys set → pass (nothing to evaluate)", () => {
    const result = evaluateQc(
      expectedMeasurements,
      expectedOptions,
      { measurements: { shoulder: 99 }, options: {}, quality_ratings: {} },
      new Set(),
    );
    expect(result.result).toBe("pass");
  });

  it("optional measurement in enabledKeys with blank input does NOT fail (evaluateQc §optional)", () => {
    // Optional measurements: blank input on either side → no failure.
    // Confirm this also holds when the optional key is the only one in enabledKeys.
    const result = evaluateQc(
      { pen_pocket_length: 5 }, // expected present
      {},
      { measurements: {}, options: {}, quality_ratings: {} }, // blank operator input
      new Set(["pen_pocket_length"]),
    );
    // pen_pocket_length is optional → blank must not fail
    expect(result.failed_measurements).not.toContain("pen_pocket_length");
  });
});

// ─── §2.11 toggle options — explicit, checked both directions ────────────────

describe("evaluateQc × §2.11 toggle options (explicit Yes/No, both directions)", () => {
  const evalOpt = (
    expectedOptions: Record<string, unknown>,
    options: Record<string, unknown>,
    keys: string[],
  ) =>
    evaluateQc({}, expectedOptions, { measurements: {}, options, quality_ratings: {} }, new Set(keys));

  it("No-spec boolean: inspector records Yes → fail (No must be absent)", () => {
    const r = evalOpt({ wallet_pocket: false }, { wallet_pocket: true }, ["wallet_pocket"]);
    expect(r.result).toBe("fail");
    expect(r.failed_options).toContain("wallet_pocket");
  });

  it("No-spec boolean: inspector records No → pass", () => {
    const r = evalOpt({ wallet_pocket: false }, { wallet_pocket: false }, ["wallet_pocket"]);
    expect(r.failed_options).not.toContain("wallet_pocket");
    expect(r.result).toBe("pass");
  });

  it("Yes-spec boolean: inspector records No → fail (Yes must be present)", () => {
    const r = evalOpt({ pen_holder: true }, { pen_holder: false }, ["pen_holder"]);
    expect(r.result).toBe("fail");
    expect(r.failed_options).toContain("pen_holder");
  });

  it("UNANSWERED boolean does NOT auto-fail even against a Yes-spec (point-2 fix)", () => {
    // The whole bug: a Yes-spec field with an untouched (undefined) input used to
    // flag red the instant the dialog opened. It must stay un-failed until the
    // inspector answers (the completeness gate in the form forces an answer).
    const r = evalOpt({ wallet_pocket: true }, {}, ["wallet_pocket"]);
    expect(r.failed_options).not.toContain("wallet_pocket");
    expect(r.result).toBe("pass");
  });

  it("collar_position: spec Up, inspector Standard → fail", () => {
    const r = evalOpt({ collar_position: "up" }, { collar_position: "standard" }, ["collar_position"]);
    expect(r.failed_options).toContain("collar_position");
  });

  it("collar_position: spec Standard (stored null), inspector Standard → pass", () => {
    const r = evalOpt({ collar_position: null }, { collar_position: "standard" }, ["collar_position"]);
    expect(r.failed_options).not.toContain("collar_position");
  });

  it("collar_position: spec Standard (stored null), inspector Up → fail", () => {
    const r = evalOpt({ collar_position: null }, { collar_position: "up" }, ["collar_position"]);
    expect(r.failed_options).toContain("collar_position");
  });

  it("collar_position: unanswered input does NOT auto-fail", () => {
    const r = evalOpt({ collar_position: "up" }, {}, ["collar_position"]);
    expect(r.failed_options).not.toContain("collar_position");
  });
});
