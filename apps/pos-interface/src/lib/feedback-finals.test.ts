/**
 * Unit tests for the brova-trial style helpers (SPEC §2.5).
 *
 * These are the REAL pure functions the feedback handler calls. Expected values
 * are derived from domain rules — never copied from the implementation.
 */

import { describe, it, expect } from "vitest";
import type { Garment } from "@repo/database";
import {
  pickStyleFields,
  diffStyleFields,
  buildBrovaStyleUpdates,
} from "./feedback-finals";

let _id = 0;
const g = (partial: Record<string, unknown>): Garment => {
  _id += 1;
  return {
    id: `g-${_id}`,
    garment_type: "final",
    piece_stage: "waiting_for_acceptance",
    style: null,
    style_id: 1,
    measurement_id: "m-1",
    style_price_snapshot: "0",
    collar_type: null,
    ...partial,
  } as unknown as Garment;
};

// ─── pickStyleFields / diffStyleFields ────────────────────────────────────────

describe("pickStyleFields / diffStyleFields", () => {
  it("absent style fields read as null, never undefined", () => {
    const s = pickStyleFields(g({ collar_type: "COL_QALLABI" }));
    expect(s.collar_type).toBe("COL_QALLABI");
    expect(s.cuffs_type).toBeNull();
    expect(s.collar_position).toBeNull();
  });

  it("diff returns only the changed keys (including clears to null)", () => {
    const cur = pickStyleFields(g({ collar_type: "COL_DOWN_COLLAR", collar_position: "up" }));
    const next = pickStyleFields(g({ collar_type: "COL_QALLABI", collar_position: null }));
    expect(diffStyleFields(cur, next)).toEqual({ collar_type: "COL_QALLABI", collar_position: null });
  });

  it("identical style sets diff to nothing", () => {
    const a = pickStyleFields(g({ collar_type: "COL_QALLABI" }));
    const b = pickStyleFields(g({ collar_type: "COL_QALLABI" }));
    expect(diffStyleFields(a, b)).toEqual({});
  });
});

// ─── buildBrovaStyleUpdates (option verdicts → garment fields) ─────────────────

describe("buildBrovaStyleUpdates", () => {
  const base = g({ small_tabaggi: false });

  it("rejected collar with a replacement value sets collar_type", () => {
    const u = buildBrovaStyleUpdates({
      optionIds: ["collar"],
      optionChecks: { "collar-main": false },
      styleChanges: { collar: "COL_QALLABI" },
      hashwaChanges: {},
      garment: base,
    });
    expect(u.collar_type).toBe("COL_QALLABI");
  });

  it("jabzour Shaab → ZIPPER; non-Shaab → BUTTON + jabzour_2", () => {
    const shaab = buildBrovaStyleUpdates({
      optionIds: ["jabzour"],
      optionChecks: { "jabzour-main": false },
      styleChanges: { jabzour: "JAB_SHAAB" },
      hashwaChanges: {},
      garment: base,
    });
    expect(shaab.jabzour_1).toBe("ZIPPER");

    const button = buildBrovaStyleUpdates({
      optionIds: ["jabzour"],
      optionChecks: { "jabzour-main": false },
      styleChanges: { jabzour: "JAB_BAIN_MURABBA" },
      hashwaChanges: {},
      garment: base,
    });
    expect(button.jabzour_1).toBe("BUTTON");
    expect(button.jabzour_2).toBe("JAB_BAIN_MURABBA");
  });

  it("collar position __standard__ sentinel → null", () => {
    const u = buildBrovaStyleUpdates({
      optionIds: ["collarPosition"],
      optionChecks: { "collarPosition-main": false },
      styleChanges: { collarPosition: "__standard__" },
      hashwaChanges: {},
      garment: base,
    });
    expect(u.collar_position).toBeNull();
  });

  it("a rejected boolean toggle flips the current value (first pass, no frozen target)", () => {
    const u = buildBrovaStyleUpdates({
      optionIds: ["smallTabaggi"],
      optionChecks: { "smallTabaggi-main": false },
      styleChanges: {},
      hashwaChanges: {},
      garment: g({ small_tabaggi: false }),
    });
    expect(u.small_tabaggi).toBe(true);
  });

  it("a rejected boolean applies the frozen Yes/No target absolutely, so a re-submit is idempotent", () => {
    // After the first feedback corrected the spec (small_tabaggi now true) and
    // the garment was refetched, re-submitting the SAME rejection must not flip
    // it back. The frozen "Yes" target (persisted as new_value) keeps it true —
    // a relative flip would revert it and re-move money (the §2.5 bug).
    const kept = buildBrovaStyleUpdates({
      optionIds: ["smallTabaggi"],
      optionChecks: { "smallTabaggi-main": false },
      styleChanges: { smallTabaggi: "Yes" },
      hashwaChanges: {},
      garment: g({ small_tabaggi: true }),
    });
    expect(kept.small_tabaggi).toBe(true);

    // A "No" target removes it regardless of the live value.
    const removed = buildBrovaStyleUpdates({
      optionIds: ["smallTabaggi"],
      optionChecks: { "smallTabaggi-main": false },
      styleChanges: { smallTabaggi: "No" },
      hashwaChanges: {},
      garment: g({ small_tabaggi: true }),
    });
    expect(removed.small_tabaggi).toBe(false);
  });

  it("a rejected hashwa sets the thickness field", () => {
    const u = buildBrovaStyleUpdates({
      optionIds: ["collar"],
      optionChecks: { "collar-hashwa": false },
      styleChanges: {},
      hashwaChanges: { collar: "DOUBLE" },
      garment: base,
    });
    expect(u.collar_thickness).toBe("DOUBLE");
  });

  it("no rejections → no updates", () => {
    expect(
      buildBrovaStyleUpdates({
        optionIds: ["collar", "cuff"],
        optionChecks: { "collar-main": true },
        styleChanges: {},
        hashwaChanges: {},
        garment: base,
      }),
    ).toEqual({});
  });
});

