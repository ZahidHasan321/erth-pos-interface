/**
 * Tests for the cashier lump-sum distributor (§3 bulk payment) and linking
 * helpers (§2.13 order linking / §5 customer accounts).
 *
 * Oracle, not mirror: the expected amounts come from the agreed rules — pay
 * advances first, then split the remainder by open balance (never an equal
 * split), and never seed more than an order owes — plus a hard conservation
 * invariant: the seeded amounts sum to EXACTLY min(lump, total remaining).
 */

import { describe, it, expect } from "vitest";
import { distributeAdvanceFirst, clusterByGroup, groupKeyOf, relationLabel } from "@/lib/cashier-grouping";

const sum = (m: Record<number, number>) =>
    Object.values(m).reduce((s, v) => s + v, 0);
// Compare KWD amounts within half a fil.
const near = (a: number, b: number) => Math.abs(a - b) < 0.0005;

describe("distributeAdvanceFirst", () => {
    it("pays each order's advance when the lump exactly covers all advances", () => {
        // Two orders, 50 each, advance 25 each. Customer pays 50 -> each advance.
        const orders = [
            { order_id: 1, remaining: 50, advance: 25 },
            { order_id: 2, remaining: 50, advance: 25 },
        ];
        const d = distributeAdvanceFirst(orders, 50);
        expect(near(d[1], 25)).toBe(true);
        expect(near(d[2], 25)).toBe(true);
        expect(near(sum(d), 50)).toBe(true);
    });

    it("covers advances first, then spreads the rest by open balance (not equally)", () => {
        // Order A is bigger. advances 25+25=50 paid first; leftover 30 split over
        // the open balances (75 vs 25 = 3:1), so A gets more -> NOT an even split.
        const orders = [
            { order_id: 1, remaining: 100, advance: 25 },
            { order_id: 2, remaining: 50, advance: 25 },
        ];
        const d = distributeAdvanceFirst(orders, 80); // 50 advances + 30 leftover
        // open balances: A=75, B=25 -> leftover 30 splits 22.5 / 7.5
        expect(near(d[1], 25 + 22.5)).toBe(true);
        expect(near(d[2], 25 + 7.5)).toBe(true);
        expect(near(sum(d), 80)).toBe(true);
        expect(d[1]).toBeGreaterThan(d[2]); // heavier order gets more
    });

    it("when the lump can't cover all advances, splits it across advances proportionally", () => {
        const orders = [
            { order_id: 1, remaining: 100, advance: 30 },
            { order_id: 2, remaining: 100, advance: 10 },
        ];
        // lump 20 < total advances 40 -> split 3:1 by advance -> 15 / 5
        const d = distributeAdvanceFirst(orders, 20);
        expect(near(d[1], 15)).toBe(true);
        expect(near(d[2], 5)).toBe(true);
        expect(near(sum(d), 20)).toBe(true);
    });

    it("never seeds more than an order owes; caps the total at outstanding", () => {
        const orders = [
            { order_id: 1, remaining: 50, advance: 25 },
            { order_id: 2, remaining: 50, advance: 25 },
        ];
        const d = distributeAdvanceFirst(orders, 999); // way over
        expect(near(d[1], 50)).toBe(true);
        expect(near(d[2], 50)).toBe(true);
        expect(near(sum(d), 100)).toBe(true); // == total remaining, not 999
    });

    it("conserves to the fil under awkward thirds (no money lost or invented)", () => {
        const orders = [
            { order_id: 1, remaining: 10, advance: 0 },
            { order_id: 2, remaining: 10, advance: 0 },
            { order_id: 3, remaining: 10, advance: 0 },
        ];
        const d = distributeAdvanceFirst(orders, 10); // 10/3 each, must still sum to 10
        expect(near(sum(d), 10)).toBe(true);
    });

    it("returns all-zero for a zero lump", () => {
        const d = distributeAdvanceFirst([{ order_id: 1, remaining: 50, advance: 25 }], 0);
        expect(near(d[1], 0)).toBe(true);
    });
});

describe("clusterByGroup", () => {
    it("keeps linked siblings adjacent while preserving group anchor order", () => {
        // Primary 1 (linked=null), child 3 (linked=1), unrelated 2 (linked=null).
        // Input order: 1, 2, 3 -> 3 should move up next to its primary 1.
        const items = [
            { id: 1, linked_order_id: null },
            { id: 2, linked_order_id: null },
            { id: 3, linked_order_id: 1 },
        ];
        const out = clusterByGroup(items, (o) => o.id, (o) => o.linked_order_id);
        expect(out.map((o) => o.id)).toEqual([1, 3, 2]);
    });

    it("groupKeyOf folds a child onto its primary", () => {
        expect(groupKeyOf(3, 1)).toBe(1);
        expect(groupKeyOf(1, null)).toBe(1);
    });
});

describe("relationLabel", () => {
    it("reads a Secondary as '<relation> of <Primary>'", () => {
        expect(relationLabel({ account_type: "Secondary", relation: "son", primary_customer_name: "Ahmed" }))
            .toBe("son of Ahmed");
    });
    it("is null for a Primary account", () => {
        expect(relationLabel({ account_type: "Primary", relation: null, primary_customer_name: null })).toBeNull();
    });
});
