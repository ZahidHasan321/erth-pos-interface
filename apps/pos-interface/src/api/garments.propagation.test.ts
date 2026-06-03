/**
 * Tests for feedback spec-propagation — CLAUDE.md §2.5
 * "Feedback updates the target spec, not just the verdict."
 *
 * The production decision lives in feedback.$orderId.tsx (handleSave), a 1500-line
 * route component not worth rendering in jsdom. Following the same seam strategy as
 * garments.test.ts, the contract is covered at three points:
 *
 *   1. planMeasurementPropagation / planStylePropagation (@/lib/feedback-payload) —
 *      the REAL pure decisions the handler calls. Verified against the §2.5 rules:
 *        • Reason gate: only `customer_request` ("Customer Request") creates a new
 *          measurement row + repoints; `workshop_error`/`shop_error` are audit-only.
 *        • Sibling fan-out: a brova's change fans out to siblings sharing
 *          measurement_id / style_id, unless scoped "this garment only".
 *
 *   2. bulkRepointMeasurement / bulkUpdateStyleFields (API layer) — verifies the
 *      fan-out WHERE scope (order_id + measurement_id / style_id) so the update
 *      lands on exactly the spec's sibling set and nothing else.
 *
 *   3. Static wiring guard — the handler imports and calls the real planners, so a
 *      future inline-revert is caught immediately.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Hoisted Supabase mock — a chainable, thenable query builder ──────────────
// The bulk functions await `from().update().eq().eq().select()` (array result, no
// `.single()`), so the builder itself is thenable and resolves to { data, error }.
const mocks = vi.hoisted(() => {
  const result = { data: [] as unknown, error: null as unknown };
  const builder: Record<string, unknown> = {};
  const updateSpy = vi.fn(() => builder);
  const eqSpy = vi.fn(() => builder);
  const selectSpy = vi.fn(() => builder);
  builder.update = updateSpy;
  builder.eq = eqSpy;
  builder.select = selectSpy;
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve({ data: result.data, error: result.error }).then(resolve, reject);
  const fromSpy = vi.fn(() => builder);
  return { result, fromSpy, updateSpy, eqSpy, selectSpy };
});

vi.mock("@/lib/db", () => ({
  db: { from: mocks.fromSpy },
  isTransientNetworkError: vi.fn(() => false),
  withWriteRetry: vi.fn((attempt: () => Promise<unknown>) => attempt()),
}));

// Import AFTER the mock is registered.
import { bulkRepointMeasurement, bulkUpdateStyleFields } from "./garments";
import {
  planMeasurementPropagation,
  planStylePropagation,
  MEASUREMENT_PROPAGATION_REASON,
} from "@/lib/feedback-payload";

// ─── 1a. Measurement reason gate (R2) ─────────────────────────────────────────
// CLAUDE.md §2.5: customer_request → new row + repoint; workshop/shop_error → audit-only.

describe("planMeasurementPropagation — reason gate (§2.5)", () => {
  const brovaArgs = { garmentType: "brova", prevMeasurementId: "m-old", thisGarmentOnly: false };

  it("a Customer Request row with a value → creates a new measurement row", () => {
    const plan = planMeasurementPropagation({
      ...brovaArgs,
      rows: [{ reason: "Customer Request", hasValue: true }],
    });
    expect(plan.createNewMeasurement).toBe(true);
  });

  it("Workshop Error only → audit-only: no new row, no repoint", () => {
    const plan = planMeasurementPropagation({
      ...brovaArgs,
      rows: [{ reason: "Workshop Error", hasValue: true }],
    });
    expect(plan).toEqual({ createNewMeasurement: false, scope: "none" });
  });

  it("Shop Error only → audit-only: no new row, no repoint", () => {
    const plan = planMeasurementPropagation({
      ...brovaArgs,
      rows: [{ reason: "Shop Error", hasValue: true }],
    });
    expect(plan).toEqual({ createNewMeasurement: false, scope: "none" });
  });

  it("a Customer Request row with NO entered value does not propagate", () => {
    const plan = planMeasurementPropagation({
      ...brovaArgs,
      rows: [{ reason: "Customer Request", hasValue: false }],
    });
    expect(plan.createNewMeasurement).toBe(false);
  });

  it("mixed reasons → the Customer Request row alone triggers propagation", () => {
    const plan = planMeasurementPropagation({
      ...brovaArgs,
      rows: [
        { reason: "Workshop Error", hasValue: true },
        { reason: "Customer Request", hasValue: true },
        { reason: "Shop Error", hasValue: true },
      ],
    });
    expect(plan.createNewMeasurement).toBe(true);
  });

  it("no measurement rows → nothing to propagate", () => {
    const plan = planMeasurementPropagation({ ...brovaArgs, rows: [] });
    expect(plan).toEqual({ createNewMeasurement: false, scope: "none" });
  });

  it("the propagating reason constant matches the shop UI label", () => {
    expect(MEASUREMENT_PROPAGATION_REASON).toBe("Customer Request");
  });
});

// ─── 1b. Measurement sibling fan-out scope (R3) ───────────────────────────────
// CLAUDE.md §2.5: brova feedback fans out to siblings sharing measurement_id,
// unless "this garment only"; finals/alterations repoint only themselves.

describe("planMeasurementPropagation — fan-out scope (§2.5)", () => {
  const customerReqRow = [{ reason: "Customer Request", hasValue: true }];

  it("brova + prior measurement + NOT 'this garment only' → fans out to siblings", () => {
    const plan = planMeasurementPropagation({
      rows: customerReqRow,
      garmentType: "brova",
      prevMeasurementId: "m-old",
      thisGarmentOnly: false,
    });
    expect(plan).toEqual({ createNewMeasurement: true, scope: "siblings" });
  });

  it("brova scoped to 'this garment only' → repoints just this garment", () => {
    const plan = planMeasurementPropagation({
      rows: customerReqRow,
      garmentType: "brova",
      prevMeasurementId: "m-old",
      thisGarmentOnly: true,
    });
    expect(plan).toEqual({ createNewMeasurement: true, scope: "single" });
  });

  it("brova with no prior measurement → repoints just this garment (nothing to fan out from)", () => {
    const plan = planMeasurementPropagation({
      rows: customerReqRow,
      garmentType: "brova",
      prevMeasurementId: null,
      thisGarmentOnly: false,
    });
    expect(plan).toEqual({ createNewMeasurement: true, scope: "single" });
  });

  it("final feedback → repoints only itself (no fan-out from a final)", () => {
    const plan = planMeasurementPropagation({
      rows: customerReqRow,
      garmentType: "final",
      prevMeasurementId: "m-old",
      thisGarmentOnly: false,
    });
    expect(plan).toEqual({ createNewMeasurement: true, scope: "single" });
  });

  it("alteration garment → repoints only itself", () => {
    const plan = planMeasurementPropagation({
      rows: customerReqRow,
      garmentType: "alteration",
      prevMeasurementId: "m-old",
      thisGarmentOnly: false,
    });
    expect(plan).toEqual({ createNewMeasurement: true, scope: "single" });
  });
});

// ─── 1c. Style/option sibling fan-out scope (R3) ──────────────────────────────

describe("planStylePropagation — fan-out scope (§2.5)", () => {
  it("no style changes → nothing to propagate", () => {
    expect(planStylePropagation({ hasStyleChanges: false, garmentType: "brova", styleId: 1 })).toBe("none");
  });

  it("brova with a style_id group → fans out to siblings sharing style_id", () => {
    expect(planStylePropagation({ hasStyleChanges: true, garmentType: "brova", styleId: 1 })).toBe("siblings");
  });

  it("brova with no style_id → updates only itself", () => {
    expect(planStylePropagation({ hasStyleChanges: true, garmentType: "brova", styleId: null })).toBe("single");
  });

  it("final feedback → updates only itself (siblings may be mid-production)", () => {
    expect(planStylePropagation({ hasStyleChanges: true, garmentType: "final", styleId: 1 })).toBe("single");
  });

  it("alteration garment → updates only itself", () => {
    expect(planStylePropagation({ hasStyleChanges: true, garmentType: "alteration", styleId: 1 })).toBe("single");
  });
});

// ─── 2. Bulk API fan-out scope ────────────────────────────────────────────────

describe("bulkRepointMeasurement — scopes the repoint to siblings sharing the old measurement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.result.data = [{ id: "g1" }, { id: "g2" }];
    mocks.result.error = null;
  });

  it("targets garments in THIS order sharing the OLD measurement_id and sets the NEW id", async () => {
    await bulkRepointMeasurement(42, "m-old", "m-new");

    expect(mocks.fromSpy).toHaveBeenCalledWith("garments");
    expect(mocks.updateSpy).toHaveBeenCalledWith({ measurement_id: "m-new" });
    // The fan-out set = same order AND same old measurement (= the brova + its finals).
    expect(mocks.eqSpy).toHaveBeenCalledWith("order_id", 42);
    expect(mocks.eqSpy).toHaveBeenCalledWith("measurement_id", "m-old");
  });

  it("returns the repointed siblings on success", async () => {
    const res = await bulkRepointMeasurement(42, "m-old", "m-new");
    expect(res.status).toBe("success");
    expect(res.data).toEqual([{ id: "g1" }, { id: "g2" }]);
  });
});

describe("bulkUpdateStyleFields — scopes the style change to siblings sharing style_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.result.data = [{ id: "g1" }];
    mocks.result.error = null;
  });

  it("targets garments in THIS order sharing the style_id and applies exactly the given fields", async () => {
    await bulkUpdateStyleFields(42, 3, { collar_type: "JAB_SHAAB" });

    expect(mocks.fromSpy).toHaveBeenCalledWith("garments");
    expect(mocks.updateSpy).toHaveBeenCalledWith({ collar_type: "JAB_SHAAB" });
    expect(mocks.eqSpy).toHaveBeenCalledWith("order_id", 42);
    expect(mocks.eqSpy).toHaveBeenCalledWith("style_id", 3);
  });
});

// ─── 3. Static wiring guard ───────────────────────────────────────────────────

describe("production handler wiring", () => {
  it("feedback.$orderId.tsx imports and calls the real propagation planners", () => {
    const handlerPath = path.resolve(
      process.cwd(),
      "src/routes/$main/orders/order-management/feedback.$orderId.tsx",
    );
    const source = fs.readFileSync(handlerPath, "utf-8");
    expect(source).toContain('from "@/lib/feedback-payload"');
    expect(source).toContain("planMeasurementPropagation(");
    expect(source).toContain("planStylePropagation(");
  });
});
