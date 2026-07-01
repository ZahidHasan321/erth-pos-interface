/**
 * QC scoping — what each QC round actually re-checks. Pure tests over the REAL
 * shared functions (evaluateQc + deriveReworkEnabledKeys), the same ones
 * QualityCheckForm.tsx feeds. (Named workflow.* so it runs under the workflow
 * config, which already resolves the cross-package apps/workshop imports — like
 * the driver's qc-spec import. No DB is touched.)
 *
 * Encodes (CLAUDE.md §2.3 / §2.14):
 *  - evaluateQc ONLY evaluates keys in enabledKeys — a field outside the set is
 *    never checked, so it can never fail. This is the mechanism behind every
 *    QC-scope behaviour below.
 *  - Second QC on the SAME trip re-checks ONLY the fields that failed in the
 *    previous attempt (deriveReworkEnabledKeys), never newly-different fields.
 *  - Alteration QC checks ONLY the changed/flagged fields (the shop's fixes),
 *    never the full template.
 *  - An alteration's second QC narrows to the failed subset of its fixes.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateQc,
  QC_MEASUREMENTS,
} from "../../../../apps/workshop/src/lib/qc-spec";
import { deriveReworkEnabledKeys } from "../../../../apps/workshop/src/lib/production-logic";

// Three distinct REQUIRED (non-optional) numeric measurements, taken from the
// real spec so the test tracks the template, not hardcoded keys.
const reqKeys = QC_MEASUREMENTS.filter((m) => !m.optional).map((m) => m.key);
const [A, B, C] = reqKeys;

if (!A || !B || !C) {
  throw new Error("QC_MEASUREMENTS must expose >= 3 required keys for this test");
}

// Spec target: every field expects 10; >0.125 off fails (QC_TOLERANCE).
const expected = { [A]: 10, [B]: 10, [C]: 10 };
const inputs = (m: Record<string, number>) => ({
  measurements: m,
  options: {},
  quality_ratings: {},
});

describe("QC scope: evaluateQc only checks enabled keys (CLAUDE.md §2.3/§2.14)", () => {
  it("a wrong field OUTSIDE enabledKeys is never flagged (the scope mechanism)", () => {
    // A correct, B wrong, C wrong — but only B is enabled.
    const res = evaluateQc(expected, {}, inputs({ [A]: 10, [B]: 20, [C]: 20 }), new Set([B]));
    expect(res.failed_measurements).toEqual([B]); // C is wrong but unchecked
    expect(res.result).toBe("fail");
  });

  it("deriveReworkEnabledKeys = exactly the previous attempt's failed fields", () => {
    expect(
      deriveReworkEnabledKeys({
        failed_measurements: [A, B],
        failed_options: ["collar_type"],
        failed_quality: ["seam"],
      }),
    ).toEqual(new Set([A, B, "collar_type", "seam"]));
    // Null/empty attempt → nothing to re-check.
    expect(deriveReworkEnabledKeys(null)).toEqual(new Set());
  });

  it("second QC on the same trip re-checks ONLY the prior fails — a NEW defect is invisible", () => {
    // Round 1: full check; A and B are out of spec, C is fine.
    const round1 = evaluateQc(expected, {}, inputs({ [A]: 20, [B]: 20, [C]: 10 }), new Set([A, B, C]));
    expect(round1.failed_measurements.slice().sort()).toEqual([A, B].slice().sort());

    // Round 2 re-checks only what failed in round 1.
    const round2Keys = deriveReworkEnabledKeys(round1);
    expect(round2Keys).toEqual(new Set([A, B]));

    // The shop fixed A, B still wrong, and C drifted out of spec since round 1.
    // The second QC must see ONLY B — C is not re-checked (not in the fix set).
    const round2 = evaluateQc(expected, {}, inputs({ [A]: 10, [B]: 20, [C]: 20 }), round2Keys);
    expect(round2.failed_measurements).toEqual([B]);
    expect(round2.result).toBe("fail");
  });

  it("alteration QC checks ONLY the changed fields — an unchanged wrong field is ignored", () => {
    // The shop only flagged A as needing alteration; B was not touched.
    const alterationFixes = new Set([A]);
    // Garment happens to be wrong on BOTH A and the unchanged B.
    const res = evaluateQc(expected, {}, inputs({ [A]: 20, [B]: 20 }), alterationFixes);
    expect(res.failed_measurements).toEqual([A]); // B (unchanged) is never QC'd
  });

  it("a required field with NO expected value on file is observational, not an auto-fail", () => {
    // Historical/imported snapshots may lack a required measurement (e.g.
    // sleeve_hemming was captured only after it became required). A missing spec
    // value has nothing to verify against — the operator's reading is recorded,
    // never failed. Regression guard: Number(null) === 0 previously compared the
    // reading against a phantom 0 and failed every non-zero value.
    const noExpected = { [A]: null, [B]: undefined, [C]: "" } as Record<string, unknown>;
    const res = evaluateQc(noExpected, {}, inputs({ [A]: 4, [B]: 4, [C]: 4 }), new Set([A, B, C]));
    expect(res.failed_measurements).toEqual([]);
    expect(res.result).toBe("pass");
  });

  it("alteration's second QC is a SUBSET of its fixes", () => {
    // Alteration scoped to three fixes A, B, C.
    const fixes = new Set([A, B, C]);
    // First alteration QC: A and B fail, C is fine.
    const first = evaluateQc(expected, {}, inputs({ [A]: 20, [B]: 20, [C]: 10 }), fixes);
    expect(first.failed_measurements.slice().sort()).toEqual([A, B].slice().sort());
    // The second QC narrows to {A, B} — a strict subset of the original fixes.
    const second = deriveReworkEnabledKeys(first);
    expect([...second].every((k) => fixes.has(k))).toBe(true);
    expect(second.size).toBeLessThan(fixes.size);
  });
});
