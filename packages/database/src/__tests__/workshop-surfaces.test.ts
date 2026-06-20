/**
 * Partition invariant — "no garment hides".
 *
 * Enumerates the workshop garment state space and asserts that EVERY garment
 * which is the workshop's responsibility and not in a terminal state appears in
 * at least one actionable surface (receiving / parking / scheduler / a
 * production terminal / soak queue / dispatch). A garment in zero surfaces is a
 * "leak" — invisible, un-actionable.
 *
 * Some field combinations leak but are impossible to reach by construction
 * (e.g. waiting_for_acceptance is a finals-only trip-1 parked state). Those are
 * listed in KNOWN_UNREACHABLE, each with a justification. The test asserts the
 * leaking set is EXACTLY explained by that allowlist:
 *   - an UNexplained leak ⇒ a real reachable hole (test fails — fix the code).
 *   - a dead allowlist entry that matches no leak ⇒ stale rule (test fails).
 *
 * The empirical companion is workflow.no-leak.test.ts, which drives real
 * lifecycles and asserts no live garment ever leaks — that is what actually
 * confirms the "unreachable" justifications below against the running RPCs.
 */
import { describe, it, expect } from "vitest";
import type { WorkshopGarment, PieceStage, Location } from "../index";
import {
  type SurfaceGarment,
  type SurfaceContext,
  isGarmentLeaked,
  isInWorkshopUniverse,
  isTerminalGarmentState,
} from "../workshop-surfaces";

// ── enumerated axes ──────────────────────────────────────────────────────────

const PIECE_STAGES: PieceStage[] = [
  "waiting_for_acceptance",
  "waiting_cut",
  "soaking",
  "cutting",
  "post_cutting",
  "sewing",
  "finishing",
  "ironing",
  "quality_check",
  "ready_for_dispatch",
  "awaiting_trial",
  "ready_for_pickup",
  "brova_trialed",
  "completed",
  "discarded",
];

// 'shop' is included so we confirm shop garments are never flagged (out of the
// workshop universe); the other four are the workshop universe.
const LOCATIONS: Location[] = [
  "shop",
  "workshop",
  "transit_to_workshop",
  "transit_to_shop",
  "lost_in_transit",
];

const GARMENT_TYPES = ["brova", "final", "alteration"] as const;
const TRIPS = [1, 2];
const BOOLS = [true, false];
const SOAK_DONE = [null, "2026-01-01T00:00:00Z"];
const PLANS: Array<SurfaceGarment["production_plan"]> = [null, { cutter: "Unit-A" }];
const FEEDBACKS = [null, "accepted", "needs_repair", "needs_redo"];
const ACCEPTANCE = [null, true, false];
// hadBrova / isBrovaApproved combinations (approved ⇒ hadBrova).
const CTX_OPTIONS: Array<{ hadBrova: boolean; approved: boolean }> = [
  { hadBrova: false, approved: false },
  { hadBrova: true, approved: false },
  { hadBrova: true, approved: true },
];

function ctxFor(o: { hadBrova: boolean; approved: boolean }): SurfaceContext {
  return { hadBrova: () => o.hadBrova, isBrovaApproved: () => o.approved };
}

interface Combo {
  g: SurfaceGarment;
  ctxOpt: { hadBrova: boolean; approved: boolean };
}

function* enumerate(): Generator<Combo> {
  for (const location of LOCATIONS)
    for (const in_production of BOOLS)
      for (const piece_stage of PIECE_STAGES)
        for (const garment_type of GARMENT_TYPES)
          for (const trip_number of TRIPS)
            for (const express of BOOLS)
              for (const soaking of BOOLS)
                for (const soaking_completed_at of SOAK_DONE)
                  for (const production_plan of PLANS)
                    for (const feedback_status of FEEDBACKS)
                      for (const acceptance_status of ACCEPTANCE)
                        for (const ctxOpt of CTX_OPTIONS) {
                          // Keep ctx self-consistent with the garment: a brova in
                          // the order means hadBrova must be true.
                          if (garment_type === "brova" && !ctxOpt.hadBrova) continue;
                          yield {
                            g: {
                              id: "g",
                              order_id: 1,
                              location,
                              in_production,
                              piece_stage,
                              garment_type,
                              trip_number,
                              express,
                              soaking,
                              soaking_completed_at,
                              production_plan,
                              feedback_status,
                              acceptance_status,
                            },
                            ctxOpt,
                          };
                        }
}

// ── allowlist: leaking states that cannot be reached by construction ─────────

interface UnreachableRule {
  id: string;
  why: string;
  match: (g: SurfaceGarment) => boolean;
}

const KNOWN_UNREACHABLE: UnreachableRule[] = [
  {
    id: "waiting_for_acceptance-not-trip1-final",
    why:
      "waiting_for_acceptance is a finals-only, trip-1 parked state produced by " +
      "the brova-parking rule at order creation. The parking page renders every " +
      "such final ('Finals not yet approved' / 'Customer approved'). A wfa " +
      "garment that is a brova, an alteration, a trip>=2 final, or in_production " +
      "is never produced (brovas/alterations start at waiting_cut; finals only " +
      "park at trip 1; releasing/parking toggles in_production accordingly).",
    match: (g) => g.piece_stage === "waiting_for_acceptance",
  },
  {
    id: "waiting_cut-in_production-with-plan",
    why:
      "scheduleGarments writes production_plan AND advances piece_stage off " +
      "waiting_cut in the same statement; an in_production waiting_cut row with a " +
      "plan set is never a persisted/queried state.",
    match: (g) =>
      g.in_production === true &&
      g.piece_stage === "waiting_cut" &&
      g.production_plan != null,
  },
  {
    id: "soaking-stage",
    why:
      "piece_stage='soaking' is only set by the scheduler for a soak-required " +
      "original (soaking flag on, not yet complete, trip 1), which the soak queue " +
      "renders. Soak runs once per lifetime at trip 1, so soaking-stage with the " +
      "flag off/complete or at trip>=2 cannot occur.",
    match: (g) => g.piece_stage === "soaking",
  },
  {
    id: "cutting-soak-gate-trip2",
    why:
      "the cutting soak-gate hides a garment only while its soak is pending; soak " +
      "completes once at trip 1 and soaking_completed_at persists, so a trip>=2 " +
      "garment never has a pending soak — the gate never strands an alteration return.",
    match: (g) =>
      g.piece_stage === "cutting" &&
      g.soaking === true &&
      g.soaking_completed_at == null &&
      (g.trip_number ?? 1) > 1,
  },
  {
    id: "accepted-feedback-back-at-workshop",
    why:
      "an Accepted brova is collected at the shop and never dispatched back to " +
      "the workshop; returning garments carry needs_repair/needs_redo/null " +
      "(feedback_status is reset on workshop receive). So feedback_status='accepted' " +
      "never co-occurs with a workshop garment. Reconfirmed empirically by " +
      "workflow.no-leak.test.ts.",
    match: (g) => g.feedback_status === "accepted" && g.location === "workshop",
  },
  {
    id: "post_cutting-disabled",
    why: "post_cutting is a disabled stage — the scheduler never routes to it and no terminal renders it.",
    match: (g) => g.piece_stage === "post_cutting",
  },
  {
    id: "shop-stage-at-workshop",
    why:
      "awaiting_trial / ready_for_pickup / brova_trialed are shop-side stages; a " +
      "garment physically at the workshop is never in them (workshop receive resets " +
      "a stray brova_trialed back to waiting_cut).",
    match: (g) =>
      g.location === "workshop" &&
      (g.piece_stage === "awaiting_trial" ||
        g.piece_stage === "ready_for_pickup" ||
        g.piece_stage === "brova_trialed"),
  },
];

// ── tests ────────────────────────────────────────────────────────────────────

describe("workshop surface partition — no garment hides", () => {
  it("WorkshopGarment is assignable to SurfaceGarment", () => {
    // compile-time check: a real WorkshopGarment satisfies the structural input.
    const narrow = (g: WorkshopGarment): SurfaceGarment => g;
    expect(typeof narrow).toBe("function");
  });

  it("every reachable non-terminal workshop garment lands in an actionable surface", () => {
    const unexplained: SurfaceGarment[] = [];
    const ruleHits = new Map<string, number>(KNOWN_UNREACHABLE.map((r) => [r.id, 0]));
    let leaks = 0;

    for (const { g, ctxOpt } of enumerate()) {
      if (!isGarmentLeaked(g, ctxFor(ctxOpt))) continue;
      leaks++;
      const rule = KNOWN_UNREACHABLE.find((r) => r.match(g));
      if (!rule) {
        unexplained.push(g);
      } else {
        ruleHits.set(rule.id, (ruleHits.get(rule.id) ?? 0) + 1);
      }
    }

    // Real reachable leaks would show up here — fix the code, don't allowlist them.
    expect(
      unexplained.slice(0, 5),
      `Found ${unexplained.length} UNEXPLAINED leaking garment state(s) — a garment ` +
        `that is the workshop's responsibility, not terminal, yet in no actionable ` +
        `surface. Sample:\n${JSON.stringify(unexplained.slice(0, 5), null, 2)}`,
    ).toEqual([]);

    // Sanity: enumeration actually produced leaking states to classify.
    expect(leaks).toBeGreaterThan(0);

    // No stale allowlist rule (each must explain at least one leaking state).
    const dead = [...ruleHits.entries()].filter(([, n]) => n === 0).map(([id]) => id);
    expect(dead, `Stale KNOWN_UNREACHABLE rule(s) matching no leak: ${dead.join(", ")}`).toEqual([]);
  });

  it("shop-located garments are outside the workshop universe (never flagged)", () => {
    const ctx = ctxFor({ hadBrova: false, approved: false });
    for (const { g } of enumerate()) {
      if (g.location !== "shop") continue;
      expect(isInWorkshopUniverse(g)).toBe(false);
      expect(isGarmentLeaked(g, ctx)).toBe(false);
    }
  });

  it("terminal/discarded garments are exempt from the partition", () => {
    const ctx = ctxFor({ hadBrova: false, approved: false });
    for (const { g } of enumerate()) {
      if (!isTerminalGarmentState(g)) continue;
      expect(isGarmentLeaked(g, ctx)).toBe(false);
    }
  });
});
