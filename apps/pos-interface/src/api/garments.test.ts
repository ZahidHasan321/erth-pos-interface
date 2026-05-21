/**
 * Tests for the updateGarment API and the final-garment feedback payload rules.
 *
 * The production logic lives in feedback.$orderId.tsx (handleSave).
 * That route component is 2 500 lines, uses TanStack Router createFileRoute, and
 * requires a full router tree to render in jsdom — not worth the setup cost for
 * unit-level logic coverage.
 *
 * Instead the contract is covered at two seams:
 *
 *   1. updateGarment (API layer) — verifies the function forwards the exact payload
 *      to db.from('garments').update(…) so nothing is dropped/mutated in transit.
 *
 *   2. buildFinalGarmentPayload (shared logic) — the REAL production function from
 *      @/lib/feedback-payload, verified against the CLAUDE.md §Branch Tree
 *      "Final Collection" contract. The production handler calls this same function.
 *
 *   3. Static wiring guard — asserts the production handler imports and calls
 *      buildFinalGarmentPayload, so a future inline-revert is caught immediately.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Hoisted values so they exist before vi.mock is executed ──────────────────
const mocks = vi.hoisted(() => {
  // Mutable result container shared across tests
  const result = { data: null as unknown, error: null as unknown };

  // Spy handles we expose so tests can assert on calls
  const updateSpy = vi.fn().mockReturnThis();
  const eqSpy = vi.fn().mockReturnThis();
  const selectSpy = vi.fn().mockReturnThis();
  const singleSpy = vi.fn(() => Promise.resolve({ data: result.data, error: result.error }));

  // db.from() returns a chainable builder
  const fromSpy = vi.fn(() => ({
    update: updateSpy,
    eq: eqSpy,
    select: selectSpy,
    single: singleSpy,
  }));

  return { result, fromSpy, updateSpy, eqSpy, selectSpy, singleSpy };
});

vi.mock("@/lib/db", () => ({
  db: {
    from: mocks.fromSpy,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: { signOut: vi.fn(() => Promise.resolve({ error: null })) },
  },
  isTransientNetworkError: vi.fn(() => false),
  // Thin passthrough — just calls the attempt fn once
  withWriteRetry: vi.fn(async (attempt: () => Promise<unknown>) => attempt()),
}));

// Import AFTER mock is registered
import { updateGarment } from "./garments";
import { buildFinalGarmentPayload } from "@/lib/feedback-payload";

// ─── updateGarment API tests ──────────────────────────────────────────────────

describe("updateGarment API", () => {
  const GARMENT_ID = "garment-abc-123";

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset each spy's mockReturnThis behaviour after clearAllMocks
    mocks.updateSpy.mockReturnThis();
    mocks.eqSpy.mockReturnThis();
    mocks.selectSpy.mockReturnThis();
    mocks.singleSpy.mockImplementation(() =>
      Promise.resolve({ data: mocks.result.data, error: mocks.result.error }),
    );
    mocks.fromSpy.mockImplementation(() => ({
      update: mocks.updateSpy,
      eq: mocks.eqSpy,
      select: mocks.selectSpy,
      single: mocks.singleSpy,
    }));
    // Default: success
    mocks.result.data = { id: GARMENT_ID, piece_stage: "completed" };
    mocks.result.error = null;
  });

  it("calls db.from('garments') and .update() with the given payload", async () => {
    const payload = { piece_stage: "completed" as const };
    await updateGarment(GARMENT_ID, payload);

    expect(mocks.fromSpy).toHaveBeenCalledWith("garments");
    expect(mocks.updateSpy).toHaveBeenCalledWith(payload);
  });

  it("scopes the update by garment id via .eq('id', garmentId)", async () => {
    await updateGarment(GARMENT_ID, { piece_stage: "completed" });
    expect(mocks.eqSpy).toHaveBeenCalledWith("id", GARMENT_ID);
  });

  it("returns { status: 'success', data: <garment> } on success", async () => {
    const fakeGarment = { id: GARMENT_ID, piece_stage: "completed" };
    mocks.result.data = fakeGarment;
    mocks.result.error = null;

    const result = await updateGarment(GARMENT_ID, { piece_stage: "completed" });
    expect(result.status).toBe("success");
    expect(result.data).toEqual(fakeGarment);
  });

  it("throws when db returns an error", async () => {
    mocks.result.data = null;
    mocks.result.error = { message: "db error" };

    await expect(updateGarment(GARMENT_ID, { piece_stage: "completed" })).rejects.toEqual({
      message: "db error",
    });
  });
});

// ─── Final garment payload logic tests ────────────────────────────────────────
// Covers CLAUDE.md §Branch Tree "Final Collection" via the REAL shared function.

describe("final garment feedback payload logic", () => {
  describe("Accept — in-shop pickup (collected)", () => {
    it("sets piece_stage=completed, fulfillment_type=collected, acceptance_status=true, feedback_status=accepted", () => {
      expect(buildFinalGarmentPayload({ feedbackAction: "accepted", isAlterationGarment: false, isHomeDelivery: false })).toMatchObject({
        piece_stage: "completed",
        fulfillment_type: "collected",
        acceptance_status: true,
        feedback_status: "accepted",
      });
    });
  });

  describe("Accept — home delivery", () => {
    it("sets fulfillment_type=delivered when isHomeDelivery=true", () => {
      expect(buildFinalGarmentPayload({ feedbackAction: "accepted", isAlterationGarment: false, isHomeDelivery: true })).toMatchObject({
        piece_stage: "completed",
        fulfillment_type: "delivered",
        acceptance_status: true,
        feedback_status: "accepted",
      });
    });

    it("works for alteration garment accepted with home delivery", () => {
      expect(buildFinalGarmentPayload({ feedbackAction: "accepted", isAlterationGarment: true, isHomeDelivery: true })).toMatchObject({
        piece_stage: "completed",
        fulfillment_type: "delivered",
        acceptance_status: true,
        feedback_status: "accepted",
      });
    });
  });

  describe("Needs Redo — non-alteration garment (discard path)", () => {
    it("discards: piece_stage=discarded, feedback_status=needs_redo, acceptance_status=false", () => {
      expect(buildFinalGarmentPayload({ feedbackAction: "needs_redo", isAlterationGarment: false, isHomeDelivery: false })).toMatchObject({
        piece_stage: "discarded",
        feedback_status: "needs_redo",
        acceptance_status: false,
      });
    });

    it("piece_stage is discarded — not completed", () => {
      const payload = buildFinalGarmentPayload({ feedbackAction: "needs_redo", isAlterationGarment: false, isHomeDelivery: false });
      expect(payload.piece_stage).toBe("discarded");
      expect(payload.piece_stage).not.toBe("completed");
    });
  });

  describe("Needs Redo — ALTERATION garment (customer property, never discarded)", () => {
    it("sets piece_stage=brova_trialed (NOT discarded), feedback_status=needs_redo, acceptance_status=false", () => {
      expect(buildFinalGarmentPayload({ feedbackAction: "needs_redo", isAlterationGarment: true, isHomeDelivery: false })).toMatchObject({
        piece_stage: "brova_trialed",
        feedback_status: "needs_redo",
        acceptance_status: false,
      });
    });

    it("piece_stage is brova_trialed, never discarded, for alteration needs_redo", () => {
      const payload = buildFinalGarmentPayload({ feedbackAction: "needs_redo", isAlterationGarment: true, isHomeDelivery: false });
      expect(payload.piece_stage).toBe("brova_trialed");
      expect(payload.piece_stage).not.toBe("discarded");
    });
  });

  describe("Needs Repair — any garment type", () => {
    it("non-alteration: piece_stage=brova_trialed, feedback_status=needs_repair, acceptance_status=false", () => {
      expect(buildFinalGarmentPayload({ feedbackAction: "needs_repair", isAlterationGarment: false, isHomeDelivery: false })).toMatchObject({
        piece_stage: "brova_trialed",
        feedback_status: "needs_repair",
        acceptance_status: false,
      });
    });

    it("alteration: piece_stage=brova_trialed, feedback_status=needs_repair, acceptance_status=false", () => {
      expect(buildFinalGarmentPayload({ feedbackAction: "needs_repair", isAlterationGarment: true, isHomeDelivery: false })).toMatchObject({
        piece_stage: "brova_trialed",
        feedback_status: "needs_repair",
        acceptance_status: false,
      });
    });
  });
});

// ─── Static wiring guard ──────────────────────────────────────────────────────
// Asserts that the production handler actually imports and calls buildFinalGarmentPayload.
// If someone inlines the logic again, this test fails immediately.

describe("production handler wiring", () => {
  it("feedback.$orderId.tsx imports and calls buildFinalGarmentPayload", () => {
    // process.cwd() is apps/pos-interface in the vitest run context.
    const handlerPath = path.resolve(
      process.cwd(),
      "src/routes/$main/orders/order-management/feedback.$orderId.tsx",
    );
    const source = fs.readFileSync(handlerPath, "utf-8");
    expect(source).toContain('from "@/lib/feedback-payload"');
    expect(source).toContain("buildFinalGarmentPayload(");
  });
});
