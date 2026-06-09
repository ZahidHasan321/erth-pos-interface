/**
 * Tests for brova-trial style reprice — SPEC §2.5
 * "A style change reprices the order on feedback submit."
 *
 * Oracle, not mirror: the expected deltas come from the spec's pricing rules
 * (flat-override styles keep their fixed price; everything else is additive),
 * NOT from the implementation. The key invariant under test: tweaking options
 * on a flat-priced garment (qallabi collar / designer) moves nothing; only a
 * flip into or out of a flat style changes its price.
 */

import { describe, it, expect } from "vitest";
import type { Style, StylePricingRule } from "@repo/database";
import { calculateGarmentStylePrice } from "@/lib/utils/style-utils";
import { computeStyleReprice } from "@/lib/feedback-reprice";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// rate_per_item is typed `number` but Supabase returns numeric columns as
// strings at runtime; calculateGarmentStylePrice does Number(...) on it, so the
// fixtures mirror the real string shape and cast through unknown.
const style = (code: string, rate: string): Style =>
  ({
    id: 1,
    name: code,
    type: null,
    rate_per_item: rate,
    image_url: null,
    code,
    component: null,
    brand: "ERTH",
  }) as unknown as Style;

// STY_KUWAITI is free; collars A/B are additive; COL_QALLABI + STY_DESIGNER are
// flat-priced via the rules below.
const STYLES: Style[] = [
  style("STY_KUWAITI", "0"),
  style("STY_DESIGNER", "6"),
  style("COL_A", "2"),
  style("COL_B", "5"),
  style("COL_QALLABI", "5"),
  style("STY_LINE", "1"),
  style("STY_LINE_2", "1"),
];

const flat = (code: string, rate: string): StylePricingRule =>
  ({
    id: 1,
    brand: "ERTH",
    style_code: code,
    rule_type: "flat_override",
    flat_rate: rate,
    priority: 10,
    active: true,
    description: null,
    created_at: null,
    updated_at: null,
  }) as unknown as StylePricingRule;

const RULES: StylePricingRule[] = [flat("COL_QALLABI", "5"), flat("STY_DESIGNER", "6")];

// Cast a plain object into the style-spec the pricer reads.
const spec = (o: Record<string, unknown>) =>
  o as unknown as Parameters<typeof calculateGarmentStylePrice>[0];

const reprice = (
  garments: { garmentId: string; oldSpec: Record<string, unknown>; newSpec: Record<string, unknown> }[],
  currentOrderTotal = 45,
  currentStyleCharge = 10,
) =>
  computeStyleReprice({
    garments: garments.map(g => ({ garmentId: g.garmentId, oldSpec: spec(g.oldSpec), newSpec: spec(g.newSpec) })),
    styles: STYLES,
    rules: RULES,
    currentOrderTotal,
    currentStyleCharge,
  });

// ─── Additive (the common case) ─────────────────────────────────────────────

describe("computeStyleReprice — additive styles", () => {
  it("a collar upgrade (COL_A 2 -> COL_B 5) adds the delta to the order total", () => {
    const r = reprice([
      { garmentId: "g1", oldSpec: { style: "kuwaiti", collar_type: "COL_A" }, newSpec: { style: "kuwaiti", collar_type: "COL_B" } },
    ]);
    expect(r.delta).toBe(3);
    expect(r.newStyleCharge).toBe(13);
    expect(r.newOrderTotal).toBe(48);
    expect(r.snapshots).toEqual([{ garment_id: "g1", style_price_snapshot: 5 }]);
    expect(r.changed).toBe(true);
  });

  it("a downgrade (COL_B 5 -> COL_A 2) drops the total by the delta", () => {
    const r = reprice([
      { garmentId: "g1", oldSpec: { style: "kuwaiti", collar_type: "COL_B" }, newSpec: { style: "kuwaiti", collar_type: "COL_A" } },
    ]);
    expect(r.delta).toBe(-3);
    expect(r.newOrderTotal).toBe(42);
  });

  it("no priced field moved -> no reprice (changed false, empty snapshots)", () => {
    const r = reprice([
      { garmentId: "g1", oldSpec: { style: "kuwaiti", collar_type: "COL_A" }, newSpec: { style: "kuwaiti", collar_type: "COL_A" } },
    ]);
    expect(r.delta).toBe(0);
    expect(r.changed).toBe(false);
    expect(r.snapshots).toEqual([]);
    expect(r.newOrderTotal).toBe(45);
  });
});

// ─── Flat-override styles keep their fixed price ────────────────────────────

describe("computeStyleReprice — flat-override styles (qallabi / designer)", () => {
  it("tweaking options on a QALLABI garment moves nothing (flat absorbs it)", () => {
    const r = reprice([
      { garmentId: "g1", oldSpec: { style: "kuwaiti", collar_type: "COL_QALLABI", lines: 1 }, newSpec: { style: "kuwaiti", collar_type: "COL_QALLABI", lines: 2 } },
    ]);
    expect(r.delta).toBe(0);
    expect(r.changed).toBe(false);
  });

  it("tweaking options on a DESIGNER garment moves nothing (flat absorbs it)", () => {
    const r = reprice([
      { garmentId: "g1", oldSpec: { style: "design", collar_type: "COL_A" }, newSpec: { style: "design", collar_type: "COL_B" } },
    ]);
    expect(r.delta).toBe(0);
    expect(r.changed).toBe(false);
  });

  it("flipping INTO qallabi reprices to the flat rate (COL_A 2 -> flat 5)", () => {
    const r = reprice([
      { garmentId: "g1", oldSpec: { style: "kuwaiti", collar_type: "COL_A" }, newSpec: { style: "kuwaiti", collar_type: "COL_QALLABI" } },
    ]);
    expect(r.delta).toBe(3);
    expect(r.snapshots).toEqual([{ garment_id: "g1", style_price_snapshot: 5 }]);
  });

  it("flipping OUT of qallabi reprices to additive (flat 5 -> COL_A 2)", () => {
    const r = reprice([
      { garmentId: "g1", oldSpec: { style: "kuwaiti", collar_type: "COL_QALLABI" }, newSpec: { style: "kuwaiti", collar_type: "COL_A" } },
    ]);
    expect(r.delta).toBe(-3);
    expect(r.snapshots).toEqual([{ garment_id: "g1", style_price_snapshot: 2 }]);
  });
});

// ─── Multiple garments (active brova + propagated finals) ───────────────────

describe("computeStyleReprice — multiple changed garments", () => {
  it("sums the delta across all changed garments and snapshots each", () => {
    const r = reprice([
      { garmentId: "brova", oldSpec: { style: "kuwaiti", collar_type: "COL_A" }, newSpec: { style: "kuwaiti", collar_type: "COL_B" } },
      { garmentId: "final1", oldSpec: { style: "kuwaiti", collar_type: "COL_A" }, newSpec: { style: "kuwaiti", collar_type: "COL_B" } },
    ]);
    expect(r.delta).toBe(6);
    expect(r.newOrderTotal).toBe(51);
    expect(r.snapshots).toHaveLength(2);
  });

  it("only snapshots the garments whose price actually changed", () => {
    const r = reprice([
      { garmentId: "changed", oldSpec: { style: "kuwaiti", collar_type: "COL_A" }, newSpec: { style: "kuwaiti", collar_type: "COL_B" } },
      // unchanged spec — no snapshot, no delta contribution
      { garmentId: "unchanged", oldSpec: { style: "kuwaiti", collar_type: "COL_A" }, newSpec: { style: "kuwaiti", collar_type: "COL_A" } },
      // qallabi option tweak — flat absorbs, no snapshot
      { garmentId: "qallabi", oldSpec: { collar_type: "COL_QALLABI", lines: 1 }, newSpec: { collar_type: "COL_QALLABI", lines: 2 } },
    ]);
    expect(r.delta).toBe(3);
    expect(r.snapshots).toEqual([{ garment_id: "changed", style_price_snapshot: 5 }]);
  });
});
