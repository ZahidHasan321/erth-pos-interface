/**
 * Unit tests for feedback-overrides.ts helpers (SPEC §2.5).
 *
 * Expected values are derived from the documented §2.5 contract, NOT from the
 * implementation. These tests are an independent oracle: if the implementation
 * disagrees with the behavior described here, the test intentionally stays red
 * and the discrepancy must be reported.
 */

import { describe, it, expect } from "vitest";
import type { Garment } from "@repo/database";
import {
  computeOverrideTargets,
  computeSharedMeasurementGroup,
  defaultMeasurementAssignments,
  computeMeasurementsInPlay,
  resolveFinalStyle,
  brovaResultingStyle,
  styleApplyToAllNeedsConfirm,
  measurementReassignNeedsConfirm,
  orderFinalsInProduction,
  brovaEditable,
  type StagedMeasurement,
} from "./feedback-overrides";

// ─── Fixture factory ──────────────────────────────────────────────────────────

let _seq = 0;

/**
 * Garment fixture factory. Defaults:
 *   garment_type: "final"
 *   piece_stage:  "waiting_for_acceptance"   (parked)
 *   measurement_id: "m-default"
 *   location:     "shop"
 */
const g = (partial: Record<string, unknown> = {}): Garment => {
  _seq += 1;
  return {
    id: `g-${_seq}`,
    garment_type: "final",
    piece_stage: "waiting_for_acceptance",
    measurement_id: "m-default",
    location: "shop",
    collar_type: null,
    style: null,
    style_id: 1,
    style_price_snapshot: "0",
    ...partial,
  } as unknown as Garment;
};

/** Convenience brova fixture. */
const brova = (partial: Record<string, unknown> = {}): Garment =>
  g({ garment_type: "brova", ...partial });

/** Convenience staged measurement. */
const staged = (
  localId: string,
  derivedFromMeasurementId: string | null = "m-default",
): StagedMeasurement => ({
  localId,
  derivedFromMeasurementId,
  correctedFields: { length: 150 },
});

// ─── computeOverrideTargets ───────────────────────────────────────────────────

describe("computeOverrideTargets", () => {
  it("includes a parked final (waiting_for_acceptance)", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const f1 = g({ id: "f1", piece_stage: "waiting_for_acceptance", measurement_id: "m-1" });
    const f2 = g({ id: "f2", piece_stage: "waiting_for_acceptance", measurement_id: "m-other" });
    const result = computeOverrideTargets({ allGarments: [activeBrova, f1, f2], brova: activeBrova });
    expect(result.map((x) => x.id).sort()).toEqual(["f1", "f2"]);
  });

  it("includes a workshop-side final at waiting_cut (location irrelevant — only gate is production)", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const waitingCut = g({ id: "f1", piece_stage: "waiting_cut", location: "workshop" });
    const result = computeOverrideTargets({
      allGarments: [activeBrova, waitingCut],
      brova: activeBrova,
    });
    expect(result.map((x) => x.id)).toEqual(["f1"]);
  });

  it("excludes a final at cutting (production started)", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const cutting = g({ id: "f1", piece_stage: "cutting" });
    const result = computeOverrideTargets({
      allGarments: [activeBrova, cutting],
      brova: activeBrova,
    });
    expect(result).toEqual([]);
  });

  it("excludes finals at later production stages (sewing, completed)", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const sewing = g({ id: "f1", piece_stage: "sewing" });
    const completed = g({ id: "f2", piece_stage: "completed" });
    const result = computeOverrideTargets({
      allGarments: [activeBrova, sewing, completed],
      brova: activeBrova,
    });
    expect(result).toEqual([]);
  });

  it("includes waiting_cut final and excludes cutting final in the same list", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const waitingCut = g({ id: "f1", piece_stage: "waiting_cut", location: "workshop" });
    const cutting = g({ id: "f2", piece_stage: "cutting" });
    const parked = g({ id: "f3", piece_stage: "waiting_for_acceptance" });
    const result = computeOverrideTargets({
      allGarments: [activeBrova, waitingCut, cutting, parked],
      brova: activeBrova,
    });
    expect(result.map((x) => x.id)).toEqual(["f1", "f3"]);
  });

  it("includes a sibling brova that shares the active brova's measurement_id and is not in production", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-shared" });
    const siblingBrova = brova({ id: "b2", measurement_id: "m-shared", piece_stage: "waiting_for_acceptance" });
    const result = computeOverrideTargets({
      allGarments: [activeBrova, siblingBrova],
      brova: activeBrova,
    });
    expect(result.map((x) => x.id)).toEqual(["b2"]);
  });

  it("excludes a sibling brova that shares measurement_id but is at cutting (in production)", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-shared" });
    const siblingInProd = brova({ id: "b2", measurement_id: "m-shared", piece_stage: "cutting" });
    const result = computeOverrideTargets({
      allGarments: [activeBrova, siblingInProd],
      brova: activeBrova,
    });
    expect(result).toEqual([]);
  });

  it("excludes the active brova itself", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const result = computeOverrideTargets({ allGarments: [activeBrova], brova: activeBrova });
    expect(result).toEqual([]);
  });

  it("excludes a sibling brova that does NOT share the measurement_id", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const otherBrova = brova({ id: "b2", measurement_id: "m-other" });
    const result = computeOverrideTargets({
      allGarments: [activeBrova, otherBrova],
      brova: activeBrova,
    });
    expect(result).toEqual([]);
  });

  it("excludes sibling brovas when the active brova's measurement_id is null", () => {
    const activeBrova = brova({ id: "b1", measurement_id: null });
    // Even if sibling has null too — null != null sharing is not allowed per spec
    const siblingNullMeasurement = brova({ id: "b2", measurement_id: null });
    const siblingRealMeasurement = brova({ id: "b3", measurement_id: "m-1" });
    const result = computeOverrideTargets({
      allGarments: [activeBrova, siblingNullMeasurement, siblingRealMeasurement],
      brova: activeBrova,
    });
    expect(result).toEqual([]);
  });

  it("preserves input order of matching garments", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const f1 = g({ id: "f-first", measurement_id: "m-1" });
    const f2 = g({ id: "f-second", measurement_id: "m-2" });
    const f3 = g({ id: "f-third", measurement_id: "m-1" });
    const result = computeOverrideTargets({
      allGarments: [activeBrova, f1, f2, f3],
      brova: activeBrova,
    });
    expect(result.map((x) => x.id)).toEqual(["f-first", "f-second", "f-third"]);
  });
});

// ─── computeSharedMeasurementGroup ───────────────────────────────────────────

describe("computeSharedMeasurementGroup", () => {
  it("returns only targets that share the brova's measurement_id", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-shared" });
    const sameM = g({ id: "f1", measurement_id: "m-shared" });
    const diffM = g({ id: "f2", measurement_id: "m-other" });
    const result = computeSharedMeasurementGroup({
      allGarments: [activeBrova, sameM, diffM],
      brova: activeBrova,
    });
    expect(result.map((x) => x.id)).toEqual(["f1"]);
  });

  it("includes a sibling brova sharing the measurement_id in the group", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-shared" });
    const siblingBrova = brova({ id: "b2", measurement_id: "m-shared" });
    const result = computeSharedMeasurementGroup({
      allGarments: [activeBrova, siblingBrova],
      brova: activeBrova,
    });
    expect(result.map((x) => x.id)).toContain("b2");
  });

  it("returns [] when brova.measurement_id is null", () => {
    const activeBrova = brova({ id: "b1", measurement_id: null });
    const f1 = g({ id: "f1", measurement_id: null });
    const f2 = g({ id: "f2", measurement_id: "m-1" });
    const result = computeSharedMeasurementGroup({
      allGarments: [activeBrova, f1, f2],
      brova: activeBrova,
    });
    expect(result).toEqual([]);
  });
});

// ─── defaultMeasurementAssignments ────────────────────────────────────────────

describe("defaultMeasurementAssignments", () => {
  it("returns {} when stagedLocalId is null — nothing staged means no changes", () => {
    const f1 = g({ id: "f1" });
    const f2 = g({ id: "f2" });
    const result = defaultMeasurementAssignments({
      targets: [f1, f2],
      sharedGroup: [f1],
      stagedLocalId: null,
    });
    expect(result).toEqual({});
  });

  it("shared-group targets get stagedLocalId; non-shared targets get null", () => {
    const f1 = g({ id: "f1", measurement_id: "m-shared" });
    const f2 = g({ id: "f2", measurement_id: "m-other" });
    const stagedId = "staged:abc-123";
    const result = defaultMeasurementAssignments({
      targets: [f1, f2],
      sharedGroup: [f1],
      stagedLocalId: stagedId,
    });
    expect(result).toEqual({
      "f1": stagedId,  // in shared group → adopt staged
      "f2": null,       // not in shared group → keep own
    });
  });

  it("every target has an entry — no garment is omitted", () => {
    const targets = [
      g({ id: "f1", measurement_id: "m-1" }),
      g({ id: "f2", measurement_id: "m-1" }),
      g({ id: "f3", measurement_id: "m-other" }),
    ];
    const sharedGroup = targets.slice(0, 2); // f1, f2 share
    const stagedId = "staged:xyz";
    const result = defaultMeasurementAssignments({
      targets,
      sharedGroup,
      stagedLocalId: stagedId,
    });
    expect(Object.keys(result).sort()).toEqual(["f1", "f2", "f3"]);
    expect(result["f1"]).toBe(stagedId);
    expect(result["f2"]).toBe(stagedId);
    expect(result["f3"]).toBeNull();
  });

  it("when all targets are in the shared group, all get stagedLocalId", () => {
    const f1 = g({ id: "f1", measurement_id: "m-shared" });
    const f2 = g({ id: "f2", measurement_id: "m-shared" });
    const stagedId = "staged:all";
    const result = defaultMeasurementAssignments({
      targets: [f1, f2],
      sharedGroup: [f1, f2],
      stagedLocalId: stagedId,
    });
    expect(result).toEqual({ f1: stagedId, f2: stagedId });
  });
});

// ─── computeMeasurementsInPlay ────────────────────────────────────────────────

describe("computeMeasurementsInPlay", () => {
  it("staged measurement is always present even with zero followers", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const f1 = g({ id: "f1", measurement_id: "m-1" });
    const stagedM = staged("staged:new", "m-1");

    const result = computeMeasurementsInPlay({
      allGarments: [activeBrova, f1],
      staged: stagedM,
      assignments: {}, // nobody assigned to staged yet
      brova: activeBrova,
    });

    const stagedEntry = result.find((m) => m.id === "staged:new");
    expect(stagedEntry).toBeDefined();
    expect(stagedEntry!.isNew).toBe(true);
    expect(stagedEntry!.derivedFromId).toBe("m-1");
    expect(stagedEntry!.followerIds).toEqual([]);
  });

  it("staged measurement appears last (real ids come first)", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const f1 = g({ id: "f1", measurement_id: "m-2" });
    const stagedM = staged("staged:last", "m-1");

    const result = computeMeasurementsInPlay({
      allGarments: [activeBrova, f1],
      staged: stagedM,
      assignments: {},
      brova: activeBrova,
    });

    const ids = result.map((m) => m.id);
    expect(ids[ids.length - 1]).toBe("staged:last");
  });

  it("isNew and derivedFromId are only set on the staged entry", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const f1 = g({ id: "f1", measurement_id: "m-1" });
    const stagedM = staged("staged:s1", "m-1");

    const result = computeMeasurementsInPlay({
      allGarments: [activeBrova, f1],
      staged: stagedM,
      assignments: {},
      brova: activeBrova,
    });

    for (const entry of result) {
      if (entry.id !== "staged:s1") {
        expect(entry.isNew).toBe(false);
        expect(entry.derivedFromId).toBeNull();
      }
    }
    const stagedEntry = result.find((m) => m.id === "staged:s1")!;
    expect(stagedEntry.isNew).toBe(true);
    expect(stagedEntry.derivedFromId).toBe("m-1");
  });

  it("followerIds lists garments whose effective measurement matches", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const f1 = g({ id: "f1", measurement_id: "m-1" });
    const f2 = g({ id: "f2", measurement_id: "m-2" });

    const result = computeMeasurementsInPlay({
      allGarments: [activeBrova, f1, f2],
      staged: null,
      assignments: {},
      brova: activeBrova,
    });

    const m1Entry = result.find((m) => m.id === "m-1")!;
    expect(m1Entry.followerIds.sort()).toEqual(["b1", "f1"]);

    const m2Entry = result.find((m) => m.id === "m-2")!;
    expect(m2Entry.followerIds).toEqual(["f2"]);
  });

  it("an assignment overrides a garment onto the staged id — garment appears as staged follower, not original", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const f1 = g({ id: "f1", measurement_id: "m-1" }); // overridden to staged
    const f2 = g({ id: "f2", measurement_id: "m-1" }); // not overridden

    const stagedM = staged("staged:override-test", "m-1");

    const result = computeMeasurementsInPlay({
      allGarments: [activeBrova, f1, f2],
      staged: stagedM,
      assignments: { f1: "staged:override-test" },
      brova: activeBrova,
    });

    // f1 was reassigned to staged → should NOT appear as follower of m-1
    const m1Entry = result.find((m) => m.id === "m-1")!;
    expect(m1Entry.followerIds).not.toContain("f1");

    // f1 should appear as follower of the staged entry
    const stagedEntry = result.find((m) => m.id === "staged:override-test")!;
    expect(stagedEntry.followerIds).toContain("f1");
  });

  it("real measurement ids maintain first-seen order across allGarments", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-beta" });
    const f1 = g({ id: "f1", measurement_id: "m-alpha" }); // f1 comes first → m-alpha first
    const f2 = g({ id: "f2", measurement_id: "m-beta" });

    const result = computeMeasurementsInPlay({
      allGarments: [f1, activeBrova, f2],
      staged: null,
      assignments: {},
      brova: activeBrova,
    });

    const ids = result.map((m) => m.id);
    expect(ids.indexOf("m-alpha")).toBeLessThan(ids.indexOf("m-beta"));
  });

  it("no staged → no staged entry in result", () => {
    const activeBrova = brova({ id: "b1", measurement_id: "m-1" });
    const f1 = g({ id: "f1", measurement_id: "m-1" });

    const result = computeMeasurementsInPlay({
      allGarments: [activeBrova, f1],
      staged: null,
      assignments: {},
      brova: activeBrova,
    });

    expect(result.every((m) => !m.isNew)).toBe(true);
  });
});

// ─── resolveFinalStyle ────────────────────────────────────────────────────────

describe("resolveFinalStyle", () => {
  it("null override → keep_own, styleFields is the final's own style", () => {
    const f = g({ id: "f1", collar_type: "COL_QALLABI", collar_button: "COL_TABBAGI" });
    const result = resolveFinalStyle({ final: f, override: null });
    expect(result.mode).toBe("keep_own");
    // styleFields should reflect the final's own collar_type
    expect(result.styleFields.collar_type).toBe("COL_QALLABI");
    expect(result.styleFields.collar_button).toBe("COL_TABBAGI");
  });

  it("non-null override → override mode with the provided styleFields", () => {
    const f = g({ id: "f1", collar_type: "COL_QALLABI" });
    const overrideFields = { collar_type: "COL_DOWN_COLLAR" as const };
    const result = resolveFinalStyle({ final: f, override: overrideFields });
    expect(result.mode).toBe("override");
    expect(result.styleFields.collar_type).toBe("COL_DOWN_COLLAR");
  });

  it("keep_own styleFields does not bleed override values", () => {
    const f = g({ id: "f1", collar_type: "COL_JAPANESE" });
    const result = resolveFinalStyle({ final: f, override: null });
    expect(result.styleFields.collar_type).toBe("COL_JAPANESE");
  });
});

// ─── brovaResultingStyle ──────────────────────────────────────────────────────

describe("brovaResultingStyle", () => {
  it("returns the brova's current style fields when no updates", () => {
    const b = brova({ id: "b1", collar_type: "COL_QALLABI", collar_button: "COL_TABBAGI" });
    const result = brovaResultingStyle({ brova: b, activeStyleUpdates: {} });
    expect(result.collar_type).toBe("COL_QALLABI");
    expect(result.collar_button).toBe("COL_TABBAGI");
  });

  it("activeStyleUpdates win over the current brova style", () => {
    const b = brova({ id: "b1", collar_type: "COL_QALLABI", collar_button: "COL_TABBAGI" });
    const result = brovaResultingStyle({
      brova: b,
      activeStyleUpdates: { collar_type: "COL_DOWN_COLLAR" },
    });
    expect(result.collar_type).toBe("COL_DOWN_COLLAR");
    // unaffected field still from brova
    expect(result.collar_button).toBe("COL_TABBAGI");
  });

  it("updates setting a value to null override the original", () => {
    const b = brova({ id: "b1", collar_button: "COL_TABBAGI" });
    const result = brovaResultingStyle({
      brova: b,
      activeStyleUpdates: { collar_button: null },
    });
    expect(result.collar_button).toBeNull();
  });

  it("does not mutate the original brova fields", () => {
    const b = brova({ id: "b1", collar_type: "COL_QALLABI" });
    brovaResultingStyle({ brova: b, activeStyleUpdates: { collar_type: "COL_DOWN_COLLAR" } });
    // brova itself should be unchanged
    expect(b.collar_type).toBe("COL_QALLABI");
  });
});

// ─── styleApplyToAllNeedsConfirm ──────────────────────────────────────────────

describe("styleApplyToAllNeedsConfirm", () => {
  it("needsConfirm is false when all finals share the brova's collar_type", () => {
    const finals = [
      g({ id: "f1", collar_type: "COL_QALLABI" }),
      g({ id: "f2", collar_type: "COL_QALLABI" }),
    ];
    const brovaStyle = { collar_type: "COL_QALLABI" };
    const result = styleApplyToAllNeedsConfirm({ finals, brovaStyle });
    expect(result.needsConfirm).toBe(false);
    expect(result.sameCollarFinalIds.sort()).toEqual(["f1", "f2"]);
    expect(result.differentCollarFinalIds).toEqual([]);
  });

  it("needsConfirm is true when at least one final has a different collar_type", () => {
    const finals = [
      g({ id: "f1", collar_type: "COL_QALLABI" }),    // same
      g({ id: "f2", collar_type: "COL_DOWN_COLLAR" }), // different
    ];
    const brovaStyle = { collar_type: "COL_QALLABI" };
    const result = styleApplyToAllNeedsConfirm({ finals, brovaStyle });
    expect(result.needsConfirm).toBe(true);
    expect(result.sameCollarFinalIds).toEqual(["f1"]);
    expect(result.differentCollarFinalIds).toEqual(["f2"]);
  });

  it("null collar values on both sides are treated as equal (null == null)", () => {
    const finals = [
      g({ id: "f1", collar_type: null }),
      g({ id: "f2", collar_type: null }),
    ];
    const brovaStyle = { collar_type: null };
    const result = styleApplyToAllNeedsConfirm({ finals, brovaStyle });
    expect(result.needsConfirm).toBe(false);
    expect(result.sameCollarFinalIds.sort()).toEqual(["f1", "f2"]);
    expect(result.differentCollarFinalIds).toEqual([]);
  });

  it("null brova collar vs non-null final collar → different (needsConfirm true)", () => {
    const finals = [
      g({ id: "f1", collar_type: "COL_QALLABI" }),
    ];
    const brovaStyle = { collar_type: null };
    const result = styleApplyToAllNeedsConfirm({ finals, brovaStyle });
    expect(result.needsConfirm).toBe(true);
    expect(result.differentCollarFinalIds).toEqual(["f1"]);
    expect(result.sameCollarFinalIds).toEqual([]);
  });

  it("sameCollarFinalIds excludes different-collar finals", () => {
    const finals = [
      g({ id: "f1", collar_type: "COL_QALLABI" }),     // same
      g({ id: "f2", collar_type: "COL_QALLABI" }),     // same
      g({ id: "f3", collar_type: "COL_DOWN_COLLAR" }), // different
    ];
    const brovaStyle = { collar_type: "COL_QALLABI" };
    const result = styleApplyToAllNeedsConfirm({ finals, brovaStyle });
    expect(result.sameCollarFinalIds.sort()).toEqual(["f1", "f2"]);
    expect(result.differentCollarFinalIds).toEqual(["f3"]);
  });

  it("empty finals list → needsConfirm false", () => {
    const result = styleApplyToAllNeedsConfirm({
      finals: [],
      brovaStyle: { collar_type: "COL_QALLABI" },
    });
    expect(result.needsConfirm).toBe(false);
    expect(result.sameCollarFinalIds).toEqual([]);
    expect(result.differentCollarFinalIds).toEqual([]);
  });
});

// ─── measurementReassignNeedsConfirm ─────────────────────────────────────────

describe("measurementReassignNeedsConfirm", () => {
  const stagedA = "staged:aaa";
  const stagedB = "staged:bbb";
  const realId = "m-real-1";

  it("true ONLY when both current and next are staged and differ", () => {
    expect(
      measurementReassignNeedsConfirm({
        currentAssignment: stagedA,
        nextAssignment: stagedB,
        stagedLocalIds: new Set([stagedA, stagedB]),
      }),
    ).toBe(true);
  });

  it("false when staged→same-staged (not actually changing)", () => {
    expect(
      measurementReassignNeedsConfirm({
        currentAssignment: stagedA,
        nextAssignment: stagedA,
        stagedLocalIds: new Set([stagedA]),
      }),
    ).toBe(false);
  });

  it("false when staged→real (no confirm needed)", () => {
    expect(
      measurementReassignNeedsConfirm({
        currentAssignment: stagedA,
        nextAssignment: realId,
        stagedLocalIds: new Set([stagedA]),
      }),
    ).toBe(false);
  });

  it("false when real→staged (no confirm needed)", () => {
    expect(
      measurementReassignNeedsConfirm({
        currentAssignment: realId,
        nextAssignment: stagedA,
        stagedLocalIds: new Set([stagedA]),
      }),
    ).toBe(false);
  });

  it("false when currentAssignment is null", () => {
    expect(
      measurementReassignNeedsConfirm({
        currentAssignment: null,
        nextAssignment: stagedA,
        stagedLocalIds: new Set([stagedA]),
      }),
    ).toBe(false);
  });

  it("false when nextAssignment is null", () => {
    expect(
      measurementReassignNeedsConfirm({
        currentAssignment: stagedA,
        nextAssignment: null,
        stagedLocalIds: new Set([stagedA]),
      }),
    ).toBe(false);
  });

  it("false when both are null", () => {
    expect(
      measurementReassignNeedsConfirm({
        currentAssignment: null,
        nextAssignment: null,
        stagedLocalIds: new Set([stagedA]),
      }),
    ).toBe(false);
  });

  it("false when real→real", () => {
    const realId2 = "m-real-2";
    expect(
      measurementReassignNeedsConfirm({
        currentAssignment: realId,
        nextAssignment: realId2,
        stagedLocalIds: new Set([stagedA]),
      }),
    ).toBe(false);
  });
});

// ─── orderFinalsInProduction ──────────────────────────────────────────────────

describe("orderFinalsInProduction", () => {
  it("false when all finals are parked (waiting_for_acceptance)", () => {
    const activeBrova = brova({ id: "b1", piece_stage: "waiting_for_acceptance" });
    const f1 = g({ id: "f1", piece_stage: "waiting_for_acceptance" });
    const f2 = g({ id: "f2", piece_stage: "waiting_for_acceptance" });
    expect(orderFinalsInProduction([activeBrova, f1, f2])).toBe(false);
  });

  it("true when any final is at cutting", () => {
    const activeBrova = brova({ id: "b1", piece_stage: "waiting_for_acceptance" });
    const f1 = g({ id: "f1", piece_stage: "waiting_for_acceptance" });
    const f2 = g({ id: "f2", piece_stage: "cutting" }); // in production
    expect(orderFinalsInProduction([activeBrova, f1, f2])).toBe(true);
  });

  it("true when a final is at sewing (later than cutting)", () => {
    const f1 = g({ id: "f1", piece_stage: "sewing" });
    expect(orderFinalsInProduction([f1])).toBe(true);
  });

  it("true when a released final is in_production while still waiting_cut", () => {
    // "Receive & Start" sets in_production=true before cutting — the workshop has
    // begun, so the page locks even though piece_stage is still waiting_cut.
    const f1 = g({ id: "f1", piece_stage: "waiting_cut", in_production: true });
    expect(orderFinalsInProduction([f1])).toBe(true);
  });

  it("false when a released final is waiting_cut but NOT yet in production", () => {
    // Brova acceptance released the final to waiting_cut, but the workshop has not
    // started it — editing stays open (in_production absent/false).
    const f1 = g({ id: "f1", piece_stage: "waiting_cut", in_production: false });
    expect(orderFinalsInProduction([f1])).toBe(false);
  });

  it("false when a BROVA is at cutting but all finals are parked", () => {
    // Only finals trigger the gate — brovas do not count
    const activeBrova = brova({ id: "b1", piece_stage: "cutting" });
    const f1 = g({ id: "f1", piece_stage: "waiting_for_acceptance" });
    const f2 = g({ id: "f2", piece_stage: "waiting_for_acceptance" });
    expect(orderFinalsInProduction([activeBrova, f1, f2])).toBe(false);
  });

  it("true for every production stage: finishing, ironing, quality_check, completed", () => {
    const productionStages: Garment["piece_stage"][] = [
      "finishing",
      "ironing",
      "quality_check",
      "completed",
    ];
    for (const stage of productionStages) {
      const f = g({ id: `f-${stage}`, piece_stage: stage });
      expect(orderFinalsInProduction([f])).toBe(true);
    }
  });

  it("false for an empty list", () => {
    expect(orderFinalsInProduction([])).toBe(false);
  });
});

// ─── brovaEditable ────────────────────────────────────────────────────────────

describe("brovaEditable", () => {
  // Table-driven: [description, garment-partial, expected]
  const cases: Array<[string, Record<string, unknown>, boolean]> = [
    ["shop + waiting_for_acceptance → editable", { location: "shop", piece_stage: "waiting_for_acceptance" }, true],
    ["shop + brova_trialed → editable (not terminal)", { location: "shop", piece_stage: "brova_trialed" }, true],
    ["shop + ready_for_pickup → editable", { location: "shop", piece_stage: "ready_for_pickup" }, true],
    ["shop + completed → NOT editable (terminal)", { location: "shop", piece_stage: "completed" }, false],
    ["shop + discarded → NOT editable (terminal)", { location: "shop", piece_stage: "discarded" }, false],
    // Acceptance does NOT lock: an accepted brova stays correctable while still at
    // the shop (the production boundaries are the order-wide finals gate and this
    // brova leaving the shop for its own fix — not acceptance_status).
    ["shop + brova_trialed + accepted (Accept) → editable (acceptance does not lock)", { location: "shop", piece_stage: "brova_trialed", acceptance_status: true }, true],
    ["shop + brova_trialed + Accept-with-Fix (needs_repair, accepted) → editable", { location: "shop", piece_stage: "brova_trialed", feedback_status: "needs_repair", acceptance_status: true }, true],
    ["transit_to_workshop + waiting_for_acceptance → NOT editable (not at shop)", { location: "transit_to_workshop", piece_stage: "waiting_for_acceptance" }, false],
    ["workshop + waiting_for_acceptance → NOT editable (not at shop)", { location: "workshop", piece_stage: "waiting_for_acceptance" }, false],
    ["transit_to_shop + waiting_for_acceptance → NOT editable", { location: "transit_to_shop", piece_stage: "waiting_for_acceptance" }, false],
  ];

  for (const [description, partial, expected] of cases) {
    it(description, () => {
      const garment = g(partial);
      expect(brovaEditable(garment)).toBe(expected);
    });
  }
});
