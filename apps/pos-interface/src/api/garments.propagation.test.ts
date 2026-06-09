/**
 * Tests for feedback spec-propagation — SPEC §2.5
 * "Feedback updates the target spec, not just the verdict."
 *
 * The production decision lives in feedback.$orderId.tsx (handleSave), a large
 * route component not worth rendering in jsdom. The contract is covered at two
 * seams:
 *
 *   1. planMeasurementPropagation (@/lib/feedback-payload) — the REAL reason gate
 *      the handler calls: a spec-correcting reason (`customer_request` OR
 *      `shop_error`) creates a new measurement row + repoints; `workshop_error`
 *      is audit-only.
 *
 *   2. Static wiring guard — the handler imports and calls the real planner +
 *      the override helpers, so a future inline-revert is caught.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  planMeasurementPropagation,
  MEASUREMENT_PROPAGATION_REASONS,
  reasonPropagates,
} from "@/lib/feedback-payload";

// ─── 1. Measurement reason gate (§2.5) ────────────────────────────────────────
// customer_request + shop_error → new row + repoint (recorded spec was wrong);
// workshop_error → audit-only (built wrong, spec was right).

describe("planMeasurementPropagation — reason gate (§2.5)", () => {
  it("a Customer Request row with a value → creates a new measurement row", () => {
    const plan = planMeasurementPropagation({
      rows: [{ reason: "Customer Request", hasValue: true }],
    });
    expect(plan).toEqual({ createNewMeasurement: true });
  });

  it("Shop Error with a value → creates a new measurement row (recorded spec was wrong)", () => {
    const plan = planMeasurementPropagation({
      rows: [{ reason: "Shop Error", hasValue: true }],
    });
    expect(plan).toEqual({ createNewMeasurement: true });
  });

  it("Workshop Error only → audit-only: no new row", () => {
    const plan = planMeasurementPropagation({
      rows: [{ reason: "Workshop Error", hasValue: true }],
    });
    expect(plan).toEqual({ createNewMeasurement: false });
  });

  it("a Customer Request row with NO entered value does not create a new row", () => {
    const plan = planMeasurementPropagation({
      rows: [{ reason: "Customer Request", hasValue: false }],
    });
    expect(plan).toEqual({ createNewMeasurement: false });
  });

  it("mixed reasons → a spec-correcting row triggers creation", () => {
    const plan = planMeasurementPropagation({
      rows: [
        { reason: "Workshop Error", hasValue: true },
        { reason: "Customer Request", hasValue: true },
        { reason: "Shop Error", hasValue: true },
      ],
    });
    expect(plan).toEqual({ createNewMeasurement: true });
  });

  it("Workshop Error alone never triggers creation, even alongside an empty Shop Error", () => {
    const plan = planMeasurementPropagation({
      rows: [
        { reason: "Workshop Error", hasValue: true },
        { reason: "Shop Error", hasValue: false },
      ],
    });
    expect(plan).toEqual({ createNewMeasurement: false });
  });

  it("no measurement rows → nothing to create", () => {
    expect(planMeasurementPropagation({ rows: [] })).toEqual({ createNewMeasurement: false });
  });

  it("the propagating reasons match the shop UI labels (customer_request + shop_error)", () => {
    expect([...MEASUREMENT_PROPAGATION_REASONS]).toEqual(["Customer Request", "Shop Error"]);
    expect(reasonPropagates("Customer Request")).toBe(true);
    expect(reasonPropagates("Shop Error")).toBe(true);
    expect(reasonPropagates("Workshop Error")).toBe(false);
    expect(reasonPropagates(null)).toBe(false);
  });
});

// ─── 2. Static wiring guard ───────────────────────────────────────────────────

describe("production handler wiring", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/routes/$main/orders/order-management/feedback.$orderId.tsx"),
    "utf-8",
  );

  it("imports and calls the real measurement reason gate", () => {
    expect(source).toContain('from "@/lib/feedback-payload"');
    expect(source).toContain("planMeasurementPropagation(");
  });

  it("drives garment overrides through the real override helpers", () => {
    expect(source).toContain('from "@/lib/feedback-overrides"');
    expect(source).toContain("computeOverrideTargets");
    expect(source).toContain("garmentOverrides");
  });

  it("reprices style changes on submit through the real reprice helpers (§2.5)", () => {
    expect(source).toContain('from "@/lib/feedback-reprice"');
    expect(source).toContain("computeStyleReprice");
    expect(source).toContain("repriceOrderStyles(");
  });

  it("no longer references the removed blanket fan-out (bulk repoint / style / planStylePropagation)", () => {
    expect(source).not.toContain("bulkRepointMeasurement(");
    expect(source).not.toContain("bulkUpdateStyleFields(");
    expect(source).not.toContain("planStylePropagation");
  });
});
