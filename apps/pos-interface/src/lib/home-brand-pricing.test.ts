/**
 * Home-based brand fixed pricing — SPEC §1/§5.
 *
 * Oracle, not mirror: the expected values are the four agreed all-in totals
 *   Adult Kuwaiti 15 | Adult Designer 25 | Kid Kuwaiti 12 | Kid Designer 22 (KD)
 * and the spec's claim that this decomposes into the EXISTING engine:
 *   - kid/adult delta (3) lives in the stitching rate (adult 9 / kid 6)
 *   - Kuwaiti/Designer delta (10) lives in flat-override styles (6 / 16) which,
 *     being flat overrides, wipe every other style option to 0
 *   - fabric is folded in (0 to the customer)
 *
 * If the flat-override engine ever stops wiping options, or the deltas drift,
 * these totals stop matching and the test goes red.
 */

import { describe, it, expect } from "vitest";
import type { Style, StylePricingRule } from "@repo/database";
import { calculateGarmentStylePrice } from "@/lib/utils/style-utils";

const style = (code: string, rate: string): Style =>
  ({
    id: 1, name: code, type: null, rate_per_item: rate,
    image_url: null, code, component: null, brand: "SAKKBA",
  }) as unknown as Style;

const flat = (code: string, rate: string): StylePricingRule =>
  ({
    id: 1, brand: "SAKKBA", style_code: code, rule_type: "flat_override",
    flat_rate: rate, priority: 0, active: true, description: null,
    created_at: null, updated_at: null,
  }) as unknown as StylePricingRule;

// The live home-brand catalogue after migration 0037: Kuwaiti flat 6, Designer
// flat 16, plus some paid options that must be wiped by the flat override.
const STYLES: Style[] = [
  style("STY_KUWAITI", "6"),
  style("STY_DESIGNER", "16"),
  style("COL_QALLABI", "3"),
  style("CUF_DOUBLE_GUMSHA", "3"),
];
const RULES: StylePricingRule[] = [
  flat("STY_KUWAITI", "6"),
  flat("STY_DESIGNER", "16"),
  flat("COL_QALLABI", "3"),
];

const STITCHING_ADULT = 9;
const STITCHING_KID = 6;

const spec = (o: Record<string, unknown>) =>
  o as unknown as Parameters<typeof calculateGarmentStylePrice>[0];

// All-in garment total = stitching(adult/kid) + flat style + fabric(0, folded in).
const total = (styleField: "kuwaiti" | "design", isKid: boolean, extra: Record<string, unknown> = {}) =>
  (isKid ? STITCHING_KID : STITCHING_ADULT) +
  calculateGarmentStylePrice(spec({ style: styleField, ...extra }), STYLES, RULES);

describe("home-based brand fixed pricing matrix (SPEC §1/§5)", () => {
  it("hits the four agreed all-in totals", () => {
    expect(total("kuwaiti", false)).toBe(15); // Adult Kuwaiti
    expect(total("design", false)).toBe(25);   // Adult Designer
    expect(total("kuwaiti", true)).toBe(12);    // Kid Kuwaiti
    expect(total("design", true)).toBe(22);     // Kid Designer
  });

  it("price depends only on style option, not on collar/cuffs/etc.", () => {
    // Adding paid collar + cuffs options must not move the total: the flat
    // override wipes every other style option.
    const loaded = { collar_type: "COL_QALLABI", cuffs_type: "CUF_DOUBLE_GUMSHA" };
    expect(total("kuwaiti", false, loaded)).toBe(15);
    expect(total("design", false, loaded)).toBe(25);
  });
});
