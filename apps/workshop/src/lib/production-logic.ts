/**
 * production-logic.ts — Pure state-machine functions for garment lifecycle decisions.
 *
 * Pattern mirrors evaluateQc (qc-spec.ts) and buildFinalGarmentPayload
 * (pos-interface/src/lib/feedback-payload.ts): pure, typed, importable by callers
 * and test drivers without touching any DB or I/O.
 *
 * All functions here encode rules from CLAUDE.md's Order Lifecycle section.
 * No `db`, no `Date.now()` side-effects as arguments — all time values are
 * passed in as ISO strings by the caller.
 */

// Type-only imports + relative qc-spec import keep this module free of any
// runtime "@/" alias dependency, so the workflow-test driver can import it
// directly (cross-package) without the workshop path alias being configured.
import type { TripHistoryEntry, QcAttempt, QcDefectAttribution, PieceStage } from "@repo/database";
import type { QcInputs, QcEvaluation } from "./qc-spec";

// ── scheduleGarments helpers ─────────────────────────────────────────────────

/**
 * Build the trip_history entry that scheduleGarments pushes onto a garment's
 * trip_history array when it is assigned to production.
 *
 * CLAUDE.md: "Scheduler assigns date + plan; garment moves waiting_cut → cutting →
 * sewing → finishing → ironing → quality_check → ready_for_dispatch".
 */
export function buildScheduleTripHistoryEntry({
  tripNumber,
  plan,
  assignedDate,
  reentryStage,
}: {
  tripNumber: number;
  plan: Record<string, string>;
  assignedDate: string;
  reentryStage?: PieceStage | null;
}): TripHistoryEntry {
  return {
    trip: tripNumber,
    reentry_stage: reentryStage ?? null,
    production_plan: plan,
    worker_history: null,
    assigned_date: assignedDate,
    completed_date: null,
    qc_attempts: [],
  };
}

/**
 * Resolve the first production stage for a newly scheduled garment.
 *
 * CLAUDE.md: "Soaking is a parallel track now — never set piece_stage='soaking' here.
 * First production stage is always cutting; cutting terminal gates on
 * soaking_completed_at so soak-pending garments wait there."
 * reentryStage overrides to support QC-fail rework that re-enters at a mid-pipeline stage.
 */
export function resolveFirstScheduleStage(reentryStage?: PieceStage | null): PieceStage {
  return reentryStage ?? ("cutting" as PieceStage);
}

// ── completeAndAdvance helpers ───────────────────────────────────────────────

/**
 * Validate that a garment is actually at the stage a terminal worker claims it
 * is before advancing it. Throws with the exact error wording garments.ts uses
 * (callers depend on this message for display).
 *
 * CLAUDE.md: garments track piece_stage; terminals should only advance their own stage.
 */
export function validateStageAdvance(currentStage: string | undefined | null, claimedStage: string): void {
  if (currentStage !== claimedStage) {
    throw new Error(`Cannot advance: garment is at "${currentStage}", not "${claimedStage}"`);
  }
}

/** Map piece_stage → worker_history role key. Mirrors HISTORY_KEY_MAP in garments.ts. */
const HISTORY_KEY_MAP: Record<string, string> = {
  soaking: "soaker",
  cutting: "cutter",
  post_cutting: "post_cutter",
  sewing: "sewer",
  finishing: "finisher",
  ironing: "ironer",
  quality_check: "quality_checker",
};

/**
 * Apply a worker's name to the correct key in worker_history for the completed stage.
 * Returns a new record (does not mutate the input).
 *
 * CLAUDE.md: "worker_history already uses role keys (soaker, cutter, …) per
 * HISTORY_KEY_MAP".
 */
export function mergeWorkerHistory(
  history: Record<string, string>,
  stage: string,
  workerName: string,
): Record<string, string> {
  const historyKey = HISTORY_KEY_MAP[stage] ?? stage;
  return { ...history, [historyKey]: workerName };
}

// ── QC iterative-loop helpers ────────────────────────────────────────────────

/**
 * Derive the enabledKeys set for a QC rework round from the most-recent fail
 * attempt in the current trip.
 *
 * CLAUDE.md §QC Fail rework: "Round 2 must re-check ONLY the fields that
 * failed in round 1. Fields that PASSED in round 1 are NOT re-checked."
 * The caller (QualityCheckForm) passes this set to evaluateQc and submitQc;
 * keys absent from the set are never evaluated and cannot regress.
 *
 * Returns an empty Set when `lastAttempt` is null/undefined or has no
 * failed fields — treated as a clean pass (no rework needed).
 *
 * Jabzour coupling (jabzour_1 ↔ jabzour_2) is NOT handled here — the UI
 * layer applies that rule on top of the returned set because it depends on
 * domain-specific garment constraints that belong in the form, not in the
 * pure loop logic.
 */
export function deriveReworkEnabledKeys(
  lastAttempt:
    | {
        failed_measurements?: string[] | null;
        failed_options?: string[] | null;
        failed_quality?: string[] | null;
      }
    | null
    | undefined,
): Set<string> {
  if (!lastAttempt) return new Set();
  return new Set<string>([
    ...(lastAttempt.failed_measurements ?? []),
    ...(lastAttempt.failed_options ?? []),
    ...(lastAttempt.failed_quality ?? []),
  ]);
}

// ── submitQc helpers ─────────────────────────────────────────────────────────

/**
 * Compute the sequential QC attempt number within the current trip.
 * Counts attempts already recorded for currentTrip (trip field may be absent
 * on legacy entries — those fall through to length+1).
 *
 * CLAUDE.md: "trip_history[current_trip].qc_attempts containing a result:\"fail\" entry"
 */
export function computeQcAttemptNumber(
  tripEntry: TripHistoryEntry,
  currentTrip: number,
): number {
  return (
    tripEntry.qc_attempts.filter(
      (a) => a.trip === currentTrip || a.trip == null,
    ).length + 1
  );
}

/**
 * Sort the operator-chosen return stages by their order in the production pipeline.
 * Returns null when returnStages is null or empty (pass case — no rework needed).
 *
 * CLAUDE.md: "qc_rework_stages breadcrumb routes it back to QC; attempt logged in
 * trip_history[trip].qc_attempts".
 */
export function orderQcReturnStages(
  returnStages: PieceStage[] | null,
  productionStages: readonly string[],
): PieceStage[] | null {
  if (!returnStages || returnStages.length === 0) return null;
  return [...returnStages].sort(
    (a, b) => productionStages.indexOf(a) - productionStages.indexOf(b),
  );
}

/**
 * Build the QcAttempt record to push into trip_history[trip].qc_attempts.
 *
 * CLAUDE.md: "System computes pass/fail; operator does not choose the verdict."
 */
export function buildQcAttempt({
  inspector,
  date,
  result,
  trip,
  attemptNumber,
  inputs,
  evalResult,
  orderedStages,
  defectAttributions,
}: {
  inspector: string;
  date: string;
  result: "pass" | "fail";
  trip: number;
  attemptNumber: number;
  inputs: QcInputs;
  evalResult: QcEvaluation;
  orderedStages: PieceStage[] | null;
  defectAttributions?: QcDefectAttribution[] | null;
}): QcAttempt {
  return {
    inspector,
    date,
    result,
    trip,
    attempt_number: attemptNumber,
    measurements: inputs.measurements,
    options: inputs.options,
    quality_ratings: inputs.quality_ratings,
    failed_measurements: evalResult.failed_measurements,
    failed_options: evalResult.failed_options,
    failed_quality: evalResult.failed_quality,
    return_stages: orderedStages,
    defect_attributions: defectAttributions ?? null,
  };
}

/**
 * Derive the next piece_stage and qc_rework_stages value from the QC evaluation.
 *
 * Pass: piece_stage → ready_for_dispatch, qc_rework_stages → null.
 * Fail: piece_stage → first rework stage (orderedStages[0]),
 *       qc_rework_stages → full orderedStages list (drives plan-aware pipeline navigation).
 *
 * CLAUDE.md: "pass → ready_for_dispatch / null; fail → orderedStages[0] / orderedStages".
 */
export function resolveQcOutcome(
  evalResult: { result: "pass" | "fail" },
  orderedStages: PieceStage[] | null,
): { piece_stage: PieceStage; qc_rework_stages: PieceStage[] | null } {
  if (evalResult.result === "pass") {
    return {
      piece_stage: "ready_for_dispatch" as PieceStage,
      qc_rework_stages: null,
    };
  }
  // Caller already validated returnStages is non-empty before we reach here.
  return {
    piece_stage: orderedStages![0]!,
    qc_rework_stages: orderedStages,
  };
}
