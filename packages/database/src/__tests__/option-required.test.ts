/**
 * option-required.test.ts — §2.11 toggle options are REQUIRED to save.
 *
 * Proves the "cannot save without filling it up" gate: the POS work-order
 * garment schema rejects a garment whose five toggle options are unfilled,
 * and accepts it once every one is answered. Also covers the collar
 * Standard ⇄ null storage round-trip.
 *
 * Pure schema/helper checks — no DB, no Docker.
 * Runs via `pnpm --filter @repo/database test`.
 */

import { describe, it, expect } from "vitest";
import {
  garmentSchema,
  garmentDefaults,
} from "../../../../apps/pos-interface/src/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";
import {
  normalizeCollarPosition,
  serializeCollarPosition,
} from "../../../../apps/workshop/src/lib/qc-spec";

const TOGGLE_KEYS = ["wallet_pocket", "pen_holder", "mobile_pocket", "small_tabaggi", "collar_position"];

// A garment that is valid in every respect EXCEPT the toggles (which start
// unfilled in garmentDefaults). Fills the unrelated required fields so the only
// errors we assert on come from the §2.11 gate, not from fabric/measurement.
const validBaseSansToggles = {
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

describe("§2.11 save gate — POS work-order garment schema", () => {
  it("garmentDefaults leave all five toggles unfilled (no silent default)", () => {
    for (const k of TOGGLE_KEYS) {
      expect((garmentDefaults as Record<string, unknown>)[k]).toBeUndefined();
    }
  });

  it("an unfilled garment CANNOT be saved — every toggle is flagged", () => {
    const paths = issuePaths(validBaseSansToggles);
    for (const k of TOGGLE_KEYS) {
      expect(paths).toContain(k);
    }
  });

  it("answering only some toggles still blocks save (the rest stay flagged)", () => {
    const paths = issuePaths({
      ...validBaseSansToggles,
      wallet_pocket: true,
      collar_position: "standard",
    });
    expect(paths).not.toContain("wallet_pocket");
    expect(paths).not.toContain("collar_position");
    expect(paths).toContain("pen_holder");
    expect(paths).toContain("mobile_pocket");
    expect(paths).toContain("small_tabaggi");
  });

  it("a fully-answered garment passes (Standard + explicit No are real answers)", () => {
    const r = garmentSchema.safeParse({
      ...validBaseSansToggles,
      wallet_pocket: false,
      pen_holder: true,
      mobile_pocket: false,
      small_tabaggi: false,
      collar_position: "standard",
    });
    expect(r.success).toBe(true);
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
