/**
 * option-required.test.ts — entry-form defaults & required-choice gates.
 *
 * Proves two §2.11/§2.12 rules on the POS work-order forms: the four §2.11
 * toggle options are a tick mark that **defaults to No** on the shop garment
 * form (no forced choice, never a save blocker — QC keeps the blank-until-chosen
 * requirement, exercised elsewhere); and the measurement schema **requires**
 * collar_position (a body measurement now, §2.12 — not a garment style option).
 * Also covers the collar Standard ⇄ null storage round-trip.
 *
 * Pure schema/helper checks — no DB, no Docker.
 * Runs via `pnpm --filter @repo/database test`.
 */

import { describe, it, expect } from "vitest";
import {
  garmentSchema,
  garmentDefaults,
} from "../../../../apps/pos-interface/src/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";
import { customerMeasurementsSchema } from "../../../../apps/pos-interface/src/components/forms/customer-measurements/measurement-form.schema";
import {
  normalizeCollarPosition,
  serializeCollarPosition,
} from "../../../../apps/workshop/src/lib/qc-spec";

const TOGGLE_KEYS = ["wallet_pocket", "pen_holder", "mobile_pocket", "small_tabaggi"];

// A garment valid in every respect, with the toggles at their form default
// (No / false from garmentDefaults). Fills the unrelated required fields so the
// only errors we could assert on would come from the toggles, not fabric/measurement.
const validGarmentBase = {
  ...garmentDefaults,
  measurement_id: "00000000-0000-0000-0000-000000000000",
  fabric_id: 1,
  fabric_length: 3,
  delivery_date: new Date().toISOString(),
};

const issuePaths = (data: unknown) => {
  const r = garmentSchema.safeParse(data);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("§2.11 shop work-order garment schema — toggles default to No (tick mark)", () => {
  it("garmentDefaults set all four toggles to No (false), not unfilled", () => {
    for (const k of TOGGLE_KEYS) {
      expect((garmentDefaults as Record<string, unknown>)[k]).toBe(false);
    }
  });

  it("collar_position is no longer a garment style option (it moved to measurements)", () => {
    expect(Object.keys(garmentDefaults)).not.toContain("collar_position");
  });

  it("a default (all-No) garment saves — the toggles no longer gate confirmation", () => {
    const paths = issuePaths(validGarmentBase);
    for (const k of TOGGLE_KEYS) {
      expect(paths).not.toContain(k);
    }
  });

  it("ticked (Yes) and un-ticked (No) are both accepted toggle values", () => {
    const r = garmentSchema.safeParse({
      ...validGarmentBase,
      wallet_pocket: true,
      pen_holder: false,
      mobile_pocket: true,
      small_tabaggi: false,
    });
    expect(r.success).toBe(true);
  });

  it("a legacy null toggle does not block save (reads as No on this form)", () => {
    const paths = issuePaths({
      ...validGarmentBase,
      wallet_pocket: null,
      pen_holder: null,
      mobile_pocket: null,
      small_tabaggi: null,
    });
    for (const k of TOGGLE_KEYS) {
      expect(paths).not.toContain(k);
    }
  });
});

describe("§2.12 collar position is a required measurement (no silent default)", () => {
  const measIssuePaths = (data: unknown) => {
    const r = customerMeasurementsSchema.safeParse(data);
    return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
  };

  it("an unanswered collar_position is flagged on the measurement form", () => {
    expect(measIssuePaths({})).toContain("collar_position");
  });

  it("a chosen collar_position (Standard or up/down) clears the gate", () => {
    expect(measIssuePaths({ collar_position: "standard" })).not.toContain("collar_position");
    expect(measIssuePaths({ collar_position: "up" })).not.toContain("collar_position");
    expect(measIssuePaths({ collar_position: "down" })).not.toContain("collar_position");
  });
});

describe("collar position storage round-trip (Standard ⇄ null, no migration)", () => {
  it("normalize: stored null/'' reads as Standard; up/down preserved", () => {
    expect(normalizeCollarPosition(null)).toBe("standard");
    expect(normalizeCollarPosition(undefined)).toBe("standard");
    expect(normalizeCollarPosition("")).toBe("standard");
    expect(normalizeCollarPosition("up")).toBe("up");
    expect(normalizeCollarPosition("down")).toBe("down");
  });

  it("serialize: Standard persists as null; up/down preserved; unanswered stays undefined", () => {
    expect(serializeCollarPosition("standard")).toBeNull();
    expect(serializeCollarPosition("up")).toBe("up");
    expect(serializeCollarPosition("down")).toBe("down");
    expect(serializeCollarPosition(undefined)).toBeUndefined();
  });
});
