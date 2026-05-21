import { describe, it, expect } from "vitest";
import {
  isAlteration,
  getAlterationNumber,
  computeOrderPhase,
  getOrderSummary,
  evaluateBrovaFeedback,
  getShowroomStatus,
} from "../utils";
import type { BrovaFeedback } from "../utils";

// ---------------------------------------------------------------------------
// Helpers to build test garment objects
// ---------------------------------------------------------------------------

function garment(overrides: Record<string, unknown> = {}) {
  return {
    piece_stage: "waiting_cut" as string | null,
    garment_type: "brova" as string | null,
    location: "shop" as string | null,
    acceptance_status: null as boolean | null,
    feedback_status: null as string | null,
    trip_number: 1 as number | null,
    ...overrides,
  };
}

function brova(overrides: Record<string, unknown> = {}) {
  return garment({ garment_type: "brova", ...overrides });
}

function final_(overrides: Record<string, unknown> = {}) {
  return garment({ garment_type: "final", ...overrides });
}

function alteration(overrides: Record<string, unknown> = {}) {
  return garment({ garment_type: "alteration", trip_number: 0, ...overrides });
}

// ---------------------------------------------------------------------------
// Group 1: isAlteration + getAlterationNumber
// ---------------------------------------------------------------------------

describe("isAlteration (unified: trip >= 2 for all types)", () => {
  it("trip 1 is not an alteration (brova or final)", () => {
    expect(isAlteration(1, "brova")).toBe(false);
    expect(isAlteration(1, "final")).toBe(false);
  });

  it("trip 2 is the first alteration for both types", () => {
    expect(isAlteration(2, "brova")).toBe(true);
    expect(isAlteration(2, "final")).toBe(true);
  });

  it("trip 4+ still alteration", () => {
    expect(isAlteration(4, "brova")).toBe(true);
    expect(isAlteration(6, "final")).toBe(true);
  });

  it("null/undefined trip defaults to 1 (not alteration)", () => {
    expect(isAlteration(null, "brova")).toBe(false);
    expect(isAlteration(undefined, "final")).toBe(false);
  });
});

describe("getAlterationNumber (unified: trip - 1)", () => {
  it("trip 1 returns null", () => {
    expect(getAlterationNumber(1, "brova")).toBeNull();
    expect(getAlterationNumber(1, "final")).toBeNull();
  });

  it("trip 2 = Alt 1, trip 3 = Alt 2, ...", () => {
    expect(getAlterationNumber(2, "brova")).toBe(1);
    expect(getAlterationNumber(3, "final")).toBe(2);
    expect(getAlterationNumber(6, "brova")).toBe(5);
  });

  it("null/undefined trip returns null", () => {
    expect(getAlterationNumber(null, "brova")).toBeNull();
    expect(getAlterationNumber(undefined, "final")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Group 2: computeOrderPhase
// ---------------------------------------------------------------------------

describe("computeOrderPhase", () => {
  it("empty garments preserves current phase", () => {
    expect(computeOrderPhase([], "new")).toBe("new");
    expect(computeOrderPhase([], "in_progress")).toBe("in_progress");
  });

  it("all completed -> completed", () => {
    const gs = [
      { piece_stage: "completed" },
      { piece_stage: "completed" },
    ];
    expect(computeOrderPhase(gs, "in_progress")).toBe("completed");
  });

  it("all pre-dispatch preserves current phase", () => {
    const gs = [
      { piece_stage: "waiting_for_acceptance" },
      { piece_stage: "waiting_cut" },
    ];
    expect(computeOrderPhase(gs, "new")).toBe("new");
    expect(computeOrderPhase(gs, "in_progress")).toBe("in_progress");
  });

  it("mix of stages -> in_progress", () => {
    const gs = [
      { piece_stage: "completed" },
      { piece_stage: "sewing" },
    ];
    expect(computeOrderPhase(gs, "new")).toBe("in_progress");
  });

  it("one completed + one waiting_cut -> in_progress", () => {
    const gs = [
      { piece_stage: "completed" },
      { piece_stage: "waiting_cut" },
    ];
    expect(computeOrderPhase(gs, "new")).toBe("in_progress");
  });

  it("single garment in production -> in_progress", () => {
    expect(
      computeOrderPhase([{ piece_stage: "ironing" }], "new")
    ).toBe("in_progress");
  });
});

// ---------------------------------------------------------------------------
// Group 3: getOrderSummary
// ---------------------------------------------------------------------------

describe("getOrderSummary", () => {
  it("empty garments returns all zeros and false flags", () => {
    const s = getOrderSummary([]);
    expect(s.totalGarments).toBe(0);
    expect(s.brovaTotal).toBe(0);
    expect(s.finalTotal).toBe(0);
    expect(s.allAtShop).toBe(false);
    expect(s.allCompleted).toBe(false);
    expect(s.someCompleted).toBe(false);
    expect(s.hasBrovaReadyForTrial).toBe(false);
    expect(s.hasBlockedFinals).toBe(false);
    expect(s.allBrovasTrialed).toBe(false);
    expect(s.hasGarmentsNeedingAction).toBe(false);
  });

  it("counts brovas and finals correctly", () => {
    const gs = [
      brova({ piece_stage: "awaiting_trial" }),
      brova({ piece_stage: "sewing" }),
      final_({ piece_stage: "waiting_for_acceptance" }),
      final_({ piece_stage: "cutting" }),
    ];
    const s = getOrderSummary(gs);
    expect(s.totalGarments).toBe(4);
    expect(s.brovaTotal).toBe(2);
    expect(s.brovaAtShop).toBe(1);
    expect(s.brovaInPipeline).toBe(1);
    expect(s.finalTotal).toBe(2);
    expect(s.finalWaiting).toBe(1);
    expect(s.finalInProduction).toBe(1);
  });

  it("brovaAccepted counts accepted + completed brovas", () => {
    const gs = [
      brova({ piece_stage: "brova_trialed", acceptance_status: true }),
      brova({ piece_stage: "completed" }),
      brova({ piece_stage: "awaiting_trial", acceptance_status: null }),
    ];
    const s = getOrderSummary(gs);
    expect(s.brovaAccepted).toBe(2);
  });

  it("brovaNeedsWork counts needs_repair and needs_redo", () => {
    const gs = [
      brova({ piece_stage: "brova_trialed", feedback_status: "needs_repair" }),
      brova({ piece_stage: "brova_trialed", feedback_status: "needs_redo" }),
      brova({ piece_stage: "brova_trialed", feedback_status: "accepted" }),
    ];
    const s = getOrderSummary(gs);
    expect(s.brovaNeedsWork).toBe(2);
  });

  it("hasBrovaReadyForTrial when brova awaiting_trial + final waiting_for_acceptance", () => {
    const gs = [
      brova({ piece_stage: "awaiting_trial" }),
      final_({ piece_stage: "waiting_for_acceptance" }),
    ];
    expect(getOrderSummary(gs).hasBrovaReadyForTrial).toBe(true);
  });

  it("hasBrovaReadyForTrial false when no finals waiting", () => {
    const gs = [
      brova({ piece_stage: "awaiting_trial" }),
      final_({ piece_stage: "sewing" }),
    ];
    expect(getOrderSummary(gs).hasBrovaReadyForTrial).toBe(false);
  });

  it("hasBlockedFinals when finals waiting and no brova accepted", () => {
    const gs = [
      brova({ piece_stage: "awaiting_trial", acceptance_status: null }),
      final_({ piece_stage: "waiting_for_acceptance" }),
    ];
    expect(getOrderSummary(gs).hasBlockedFinals).toBe(true);
  });

  it("hasBlockedFinals false when a brova is accepted", () => {
    const gs = [
      brova({ piece_stage: "brova_trialed", acceptance_status: true }),
      final_({ piece_stage: "waiting_for_acceptance" }),
    ];
    expect(getOrderSummary(gs).hasBlockedFinals).toBe(false);
  });

  it("allBrovasTrialed when all brovas at brova_trialed/completed/needs_work", () => {
    const gs = [
      brova({ piece_stage: "brova_trialed" }),
      brova({ piece_stage: "completed" }),
      brova({ piece_stage: "sewing", feedback_status: "needs_repair" }),
    ];
    expect(getOrderSummary(gs).allBrovasTrialed).toBe(true);
  });

  it("allBrovasTrialed false when a brova is still in production without feedback", () => {
    const gs = [
      brova({ piece_stage: "brova_trialed" }),
      brova({ piece_stage: "sewing", feedback_status: null }),
    ];
    expect(getOrderSummary(gs).allBrovasTrialed).toBe(false);
  });

  it("allAtShop when all garments at shop stages", () => {
    const gs = [
      brova({ piece_stage: "awaiting_trial" }),
      final_({ piece_stage: "ready_for_pickup" }),
    ];
    expect(getOrderSummary(gs).allAtShop).toBe(true);
  });

  it("allCompleted when every garment completed", () => {
    const gs = [
      brova({ piece_stage: "completed" }),
      final_({ piece_stage: "completed" }),
    ];
    const s = getOrderSummary(gs);
    expect(s.allCompleted).toBe(true);
    expect(s.someCompleted).toBe(false); // someCompleted = some but not all
  });

  it("someCompleted when mix of completed and non-completed", () => {
    const gs = [
      brova({ piece_stage: "completed" }),
      final_({ piece_stage: "sewing" }),
    ];
    const s = getOrderSummary(gs);
    expect(s.someCompleted).toBe(true);
    expect(s.allCompleted).toBe(false);
  });

  it("hasGarmentsNeedingAction detects needs_repair on any garment type", () => {
    const gs = [
      final_({ piece_stage: "ready_for_pickup", feedback_status: "needs_repair" }),
    ];
    expect(getOrderSummary(gs).hasGarmentsNeedingAction).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group 4: evaluateBrovaFeedback
// ---------------------------------------------------------------------------

describe("evaluateBrovaFeedback", () => {
  const makeBrova = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    piece_stage: "awaiting_trial" as string | null,
    acceptance_status: null as boolean | null,
    feedback_status: null as string | null,
    ...overrides,
  });

  describe("single brova scenarios", () => {
    const singleBrova = [makeBrova("b1")];

    it("accepted -> releases finals", () => {
      const r = evaluateBrovaFeedback("accepted", singleBrova, "b1");
      expect(r.newStage).toBe("brova_trialed");
      expect(r.feedbackStatus).toBe("accepted");
      expect(r.acceptanceStatus).toBe(true);
      expect(r.releaseFinals).toBe(true);
      expect(r.brovaGoesBack).toBe(false);
    });

    it("needs_repair_accepted -> releases finals, brova stays", () => {
      const r = evaluateBrovaFeedback("needs_repair_accepted", singleBrova, "b1");
      expect(r.feedbackStatus).toBe("needs_repair");
      expect(r.acceptanceStatus).toBe(true);
      expect(r.releaseFinals).toBe(true);
      expect(r.brovaGoesBack).toBe(false);
    });

    it("needs_repair_rejected -> no release, brova goes back", () => {
      const r = evaluateBrovaFeedback("needs_repair_rejected", singleBrova, "b1");
      expect(r.feedbackStatus).toBe("needs_repair");
      expect(r.acceptanceStatus).toBe(false);
      expect(r.releaseFinals).toBe(false);
      expect(r.brovaGoesBack).toBe(true);
    });

    // CLAUDE.md §Branch Tree, Reject-Redo row: original is `discarded`
    // (terminal), acceptance false, finals stay parked, and there is NO return
    // trip — the workshop manually creates a fresh replacement row instead.
    it("needs_redo -> discarded (terminal), no release, no return trip", () => {
      const r = evaluateBrovaFeedback("needs_redo", singleBrova, "b1");
      expect(r.feedbackStatus).toBe("needs_redo");
      expect(r.newStage).toBe("discarded");
      expect(r.acceptanceStatus).toBe(false);
      expect(r.releaseFinals).toBe(false);
      expect(r.brovaGoesBack).toBe(false);
    });
  });

  describe("multi-brova scenarios", () => {
    it("second brova rejected but first already accepted -> releases finals", () => {
      const brovas = [
        makeBrova("b1", { acceptance_status: true, piece_stage: "brova_trialed" }),
        makeBrova("b2"),
      ];
      const r = evaluateBrovaFeedback("needs_repair_rejected", brovas, "b2");
      expect(r.releaseFinals).toBe(true);
      expect(r.brovaGoesBack).toBe(true);
    });

    it("all brovas rejected -> no release", () => {
      const brovas = [
        makeBrova("b1", { acceptance_status: false, piece_stage: "brova_trialed" }),
        makeBrova("b2"),
      ];
      const r = evaluateBrovaFeedback("needs_redo", brovas, "b2");
      expect(r.releaseFinals).toBe(false);
    });

    it("first brova completed, second gets rejected -> still releases", () => {
      const brovas = [
        makeBrova("b1", { piece_stage: "completed", acceptance_status: null }),
        makeBrova("b2"),
      ];
      const r = evaluateBrovaFeedback("needs_repair_rejected", brovas, "b2");
      expect(r.releaseFinals).toBe(true);
    });
  });

  describe("message content", () => {
    const singleBrova = [makeBrova("b1")];

    // CLAUDE.md defines brova *behaviour*, not message copy. Assert the
    // spec vocabulary the message must carry, not exact wording, so a reword
    // doesn't fail the suite while a wrong-outcome message still would.
    it("accepted message conveys acceptance", () => {
      const r = evaluateBrovaFeedback("accepted", singleBrova, "b1");
      expect(r.message.toLowerCase()).toContain("accepted");
    });

    it("needs_repair_accepted message conveys a later send-back to workshop", () => {
      const r = evaluateBrovaFeedback("needs_repair_accepted", singleBrova, "b1");
      expect(r.message.toLowerCase()).toContain("workshop");
    });

    it("needs_repair_rejected with no prior acceptance -> rejection/repair message", () => {
      const r = evaluateBrovaFeedback("needs_repair_rejected", singleBrova, "b1");
      expect(r.message.toLowerCase()).toContain("repair");
    });

    // Reject-Redo: spec says discarded + workshop creates a replacement \u2014
    // the message must carry those two concepts, not "full redo".
    it("needs_redo message conveys discard + replacement", () => {
      const r = evaluateBrovaFeedback("needs_redo", singleBrova, "b1");
      expect(r.message.toLowerCase()).toContain("discarded");
      expect(r.message.toLowerCase()).toContain("replacement");
    });

    it("needs_redo but another brova accepted -> still releases finals", () => {
      const brovas = [
        makeBrova("b1", { acceptance_status: true, piece_stage: "brova_trialed" }),
        makeBrova("b2"),
      ];
      const r = evaluateBrovaFeedback("needs_redo", brovas, "b2");
      // The spec contract here is the behaviour, not the copy: a prior
      // accepted brova means finals release even though this one is redone.
      expect(r.releaseFinals).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Group 5: getShowroomStatus
// ---------------------------------------------------------------------------

describe("getShowroomStatus", () => {
  it("no garments -> null, no physical items", () => {
    const r = getShowroomStatus([]);
    expect(r.label).toBeNull();
    expect(r.hasPhysicalItems).toBe(false);
  });

  it("no shop items, no transit -> null", () => {
    const gs = [
      brova({ location: "workshop", piece_stage: "sewing" }),
    ];
    const r = getShowroomStatus(gs);
    expect(r.label).toBeNull();
    expect(r.hasPhysicalItems).toBe(false);
  });

  it("no shop items but finals in transit -> ready_for_pickup", () => {
    const gs = [
      final_({ location: "transit_to_shop", piece_stage: "ready_for_dispatch" }),
    ];
    const r = getShowroomStatus(gs);
    expect(r.label).toBe("ready_for_pickup");
    expect(r.hasPhysicalItems).toBe(false);
  });

  it("completed garments at shop are excluded from shopItems", () => {
    const gs = [
      brova({ location: "shop", piece_stage: "completed" }),
    ];
    const r = getShowroomStatus(gs);
    expect(r.label).toBeNull();
    expect(r.hasPhysicalItems).toBe(false);
  });

  it("alteration brova (trip 4+) at shop awaiting trial -> alteration_in", () => {
    const gs = [
      brova({
        location: "shop",
        piece_stage: "awaiting_trial",
        trip_number: 4,
        acceptance_status: null,
      }),
    ];
    expect(getShowroomStatus(gs).label).toBe("alteration_in");
  });

  it("alteration final (trip 2+) at shop with needs_repair -> alteration_in", () => {
    const gs = [
      final_({
        location: "shop",
        piece_stage: "ready_for_pickup",
        trip_number: 2,
        acceptance_status: null,
        feedback_status: "needs_repair",
      }),
    ];
    expect(getShowroomStatus(gs).label).toBe("alteration_in");
  });

  it("alteration garment already accepted is NOT alteration_in", () => {
    const gs = [
      brova({
        location: "shop",
        piece_stage: "brova_trialed",
        trip_number: 4,
        acceptance_status: true,
      }),
      // Need another non-completed garment out so we don't hit ready_for_pickup
      final_({ location: "workshop", piece_stage: "sewing" }),
    ];
    expect(getShowroomStatus(gs).label).not.toBe("alteration_in");
  });

  it("alteration order, fresh trip-0 at shop -> alteration_out", () => {
    const gs = [
      alteration({ location: "shop", piece_stage: "waiting_cut", trip_number: 0 }),
    ];
    const r = getShowroomStatus(gs);
    expect(r.label).toBe("alteration_out");
    expect(r.hasPhysicalItems).toBe(true);
  });

  it("alteration order, all garments at workshop -> null", () => {
    const gs = [
      alteration({ location: "workshop", piece_stage: "sewing", trip_number: 1 }),
    ];
    const r = getShowroomStatus(gs);
    expect(r.label).toBeNull();
    expect(r.hasPhysicalItems).toBe(false);
  });

  it("alteration order, returned to shop ready_for_pickup -> alteration_out", () => {
    const gs = [
      alteration({ location: "shop", piece_stage: "ready_for_pickup", trip_number: 1 }),
    ];
    expect(getShowroomStatus(gs).label).toBe("alteration_out");
  });

  it("alteration order, all completed -> null", () => {
    const gs = [
      alteration({ location: "shop", piece_stage: "completed", trip_number: 1 }),
    ];
    const r = getShowroomStatus(gs);
    expect(r.label).toBeNull();
    expect(r.hasPhysicalItems).toBe(false);
  });

  it("alteration order, mix of shop + transit -> alteration_out", () => {
    const gs = [
      alteration({ location: "shop", piece_stage: "waiting_cut", trip_number: 0 }),
      alteration({ location: "transit_to_workshop", piece_stage: "waiting_cut", trip_number: 1 }),
    ];
    expect(getShowroomStatus(gs).label).toBe("alteration_out");
  });

  it("brova at shop awaiting_trial -> brova_trial", () => {
    const gs = [
      brova({ location: "shop", piece_stage: "awaiting_trial", trip_number: 1 }),
    ];
    expect(getShowroomStatus(gs).label).toBe("brova_trial");
  });

  it("garment at shop with needs_repair -> needs_action", () => {
    const gs = [
      brova({
        location: "shop",
        piece_stage: "brova_trialed",
        feedback_status: "needs_repair",
        trip_number: 1,
      }),
    ];
    expect(getShowroomStatus(gs).label).toBe("needs_action");
  });

  it("garment at shop with needs_redo -> needs_action", () => {
    const gs = [
      brova({
        location: "shop",
        piece_stage: "brova_trialed",
        feedback_status: "needs_redo",
        trip_number: 1,
      }),
    ];
    expect(getShowroomStatus(gs).label).toBe("needs_action");
  });

  it("B1 accepted, B2 rejected at shop -> needs_action", () => {
    const gs = [
      brova({
        location: "shop",
        piece_stage: "brova_trialed",
        acceptance_status: true,
        feedback_status: "accepted",
        trip_number: 1,
      }),
      brova({
        location: "shop",
        piece_stage: "brova_trialed",
        acceptance_status: false,
        feedback_status: "needs_repair",
        trip_number: 1,
      }),
    ];
    expect(getShowroomStatus(gs).label).toBe("needs_action");
  });

  it("brovas done at shop, finals still at workshop -> ready_for_pickup", () => {
    const gs = [
      brova({
        location: "shop",
        piece_stage: "brova_trialed",
        acceptance_status: true,
        trip_number: 1,
      }),
      final_({ location: "workshop", piece_stage: "sewing" }),
    ];
    expect(getShowroomStatus(gs).label).toBe("ready_for_pickup");
  });

  it("all shop items done but garments still out -> ready_for_pickup", () => {
    const gs = [
      final_({
        location: "shop",
        piece_stage: "ready_for_pickup",
        acceptance_status: null,
      }),
      brova({ location: "workshop", piece_stage: "sewing" }),
    ];
    expect(getShowroomStatus(gs).label).toBe("ready_for_pickup");
  });

  it("all shop items done and nothing outstanding -> ready_for_pickup", () => {
    const gs = [
      final_({
        location: "shop",
        piece_stage: "ready_for_pickup",
        acceptance_status: null,
      }),
    ];
    expect(getShowroomStatus(gs).label).toBe("ready_for_pickup");
  });

  it("finals ready, one brova still being repaired at workshop -> ready_for_pickup", () => {
    const gs = [
      final_({
        location: "shop",
        piece_stage: "ready_for_pickup",
        acceptance_status: null,
      }),
      brova({ location: "workshop", piece_stage: "sewing" }),
    ];
    expect(getShowroomStatus(gs).label).toBe("ready_for_pickup");
  });

  describe("priority ordering", () => {
    it("alteration_in wins over brova_trial", () => {
      const gs = [
        // alteration garment
        brova({
          location: "shop",
          piece_stage: "awaiting_trial",
          trip_number: 4,
          acceptance_status: null,
        }),
        // regular brova trial
        brova({
          location: "shop",
          piece_stage: "awaiting_trial",
          trip_number: 1,
        }),
      ];
      expect(getShowroomStatus(gs).label).toBe("alteration_in");
    });

    it("brova_trial wins over needs_action", () => {
      const gs = [
        brova({
          location: "shop",
          piece_stage: "awaiting_trial",
          trip_number: 1,
        }),
        brova({
          location: "shop",
          piece_stage: "brova_trialed",
          feedback_status: "needs_repair",
          trip_number: 1,
        }),
      ];
      expect(getShowroomStatus(gs).label).toBe("brova_trial");
    });

    it("needs_action wins over ready_for_pickup", () => {
      const gs = [
        brova({
          location: "shop",
          piece_stage: "brova_trialed",
          feedback_status: "needs_redo",
          trip_number: 1,
        }),
        final_({ location: "workshop", piece_stage: "sewing" }),
      ];
      expect(getShowroomStatus(gs).label).toBe("needs_action");
    });
  });

  it("hasPhysicalItems true when shop items exist", () => {
    const gs = [
      brova({ location: "shop", piece_stage: "awaiting_trial" }),
    ];
    expect(getShowroomStatus(gs).hasPhysicalItems).toBe(true);
  });
});
