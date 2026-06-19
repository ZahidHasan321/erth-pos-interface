import type { Garment } from "@repo/database";
import { type StyleFields, pickStyleFields } from "./feedback-finals";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A measurement correction staged locally before submission (§2.5).
 * Many corrected fields collapse into ONE new derived measurement record;
 * the `localId` is used as the `idempotency_key` when `createMeasurement` is
 * called on save, and as a pointer key in `GarmentOverride.measurementAssignment`
 * while the form is open.
 */
export type StagedMeasurement = {
  localId: string;                          // e.g. "staged:<uuid>" — never a real DB id
  derivedFromMeasurementId: string | null;  // lineage = the brova's current measurement_id
  // measurement field key -> corrected value. Numeric for the tape dimensions;
  // a string for the categorical `shoulder_slope` enum. The override/lineage
  // helpers key off the measurement id, never these values, so the union is safe.
  correctedFields: Record<string, number | string>;
};

/**
 * Display tag for a garment in the override UI: its human-readable per-order
 * code (e.g. "12-1") plus its type, rendered as code + a small type badge.
 */
export type GarmentTag = {
  code: string;
  type: "Final" | "Brova" | "Alteration";
};

/**
 * Per-garment override state captured in the override grid (§2.5).
 * Keyed by garment id in `garmentOverrides` on the page state.
 * `null` assignment = keep the garment's own measurement (no write).
 * `null` styleOverride = keep the final's own style (no write).
 */
export type GarmentOverride = {
  measurementAssignment: string | null;     // real measurement uuid | StagedMeasurement.localId | null (= keep own)
  styleOverride: StyleFields | null;        // finals only; null = keep own
};

/**
 * One measurement "in play" for a dropdown option or the lineage sheet (§2.5).
 * Includes the staged measurement (if any) so staff can see it before submit.
 */
export type MeasurementInPlay = {
  id: string;            // a real measurement uuid OR the staged localId
  isNew: boolean;        // true only for the staged measurement
  derivedFromId: string | null;  // lineage parent; only meaningful when isNew
  followerIds: string[]; // garment ids whose EFFECTIVE measurement is this id
};

/**
 * The resolved style a final will carry after this feedback is saved (§2.5).
 * `keep_own` → no write; `override` → diff and write only changed fields.
 */
export type StyleResolution =
  | { mode: "keep_own"; styleFields: StyleFields }
  | { mode: "override"; styleFields: StyleFields };

// ---------------------------------------------------------------------------
// Production gate (used by override target computation and locking gates)
// ---------------------------------------------------------------------------

/**
 * The `piece_stage` values at which production has started (≥ `cutting`) — the
 * boundary used by override target filtering and the order-level read-only lock
 * (§2.5 / plan "Locking" gate 2). Once any final reaches one of these stages,
 * the whole feedback page is read-only.
 */
export const PRODUCTION_STARTED_STAGES = [
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
] as const satisfies readonly Garment["piece_stage"][];

// ---------------------------------------------------------------------------
// Override target computation
// ---------------------------------------------------------------------------

/**
 * The garments a brova's feedback may assign (§2.5):
 *  - Any final (`garment_type === "final"`) that has NOT started production
 *    (i.e. `piece_stage` is NOT in `PRODUCTION_STARTED_STAGES`). This includes
 *    parked finals (`waiting_for_acceptance`) AND workshop-side finals (e.g.
 *    `waiting_cut`) — location is irrelevant; the only gate is production (≥ cutting).
 *  - Any sibling brova (`garment_type === "brova"`, different id) that shares
 *    this brova's `measurement_id` (only when `brova.measurement_id` is non-null)
 *    AND has also not started production.
 * The active brova itself is excluded. Stable order: preserves input order.
 */
export function computeOverrideTargets({
  allGarments,
  brova,
}: {
  allGarments: Garment[];
  brova: Garment;
}): Garment[] {
  return allGarments.filter((g) => {
    if (g.id === brova.id) return false;
    if (g.piece_stage != null && (PRODUCTION_STARTED_STAGES as readonly Garment["piece_stage"][]).includes(g.piece_stage)) return false; // in production → locked, not assignable
    if (g.garment_type === "final") return true;
    if (g.garment_type === "brova" && brova.measurement_id != null && g.measurement_id === brova.measurement_id) return true;
    return false;
  });
}

/**
 * The subset of override targets that share the brova's `measurement_id` (§2.5).
 * These are the garments that will default to adopting the staged measurement
 * when `defaultMeasurementAssignments` is called.
 * Returns `[]` when `brova.measurement_id` is null (nothing shareable).
 */
export function computeSharedMeasurementGroup({
  allGarments,
  brova,
}: {
  allGarments: Garment[];
  brova: Garment;
}): Garment[] {
  if (brova.measurement_id == null) return [];
  return computeOverrideTargets({ allGarments, brova }).filter(
    (g) => g.measurement_id === brova.measurement_id,
  );
}

// ---------------------------------------------------------------------------
// Default assignments
// ---------------------------------------------------------------------------

/**
 * Seed the override grid with QOL defaults (§2.5).
 * Garments in the shared measurement group default to adopting `stagedLocalId`;
 * garments outside the group default to `null` (keep own).
 * Returns `{}` when `stagedLocalId` is null — nothing staged means no changes.
 */
export function defaultMeasurementAssignments({
  targets,
  sharedGroup,
  stagedLocalId,
}: {
  targets: Garment[];
  sharedGroup: Garment[];
  stagedLocalId: string | null;
}): Record<string, string | null> {
  if (stagedLocalId == null) return {};
  const sharedIds = new Set(sharedGroup.map((g) => g.id));
  const result: Record<string, string | null> = {};
  for (const g of targets) {
    result[g.id] = sharedIds.has(g.id) ? stagedLocalId : null;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Measurements in play
// ---------------------------------------------------------------------------

/**
 * Derive every measurement currently "in play" across the full garment list,
 * accounting for override assignments (§2.5). Used to populate the measurement
 * dropdown and the right-side lineage sheet.
 *
 * Effective measurement for a garment:
 *   `assignments[g.id] != null ? assignments[g.id] : g.measurement_id`
 *
 * The staged measurement is always included (with zero followers if nobody has
 * been assigned to it yet) so staff can see it in the dropdown immediately.
 * Order: real ids first (first-seen across allGarments), staged last.
 */
export function computeMeasurementsInPlay({
  allGarments,
  staged,
  assignments,
  brova: _brova,
}: {
  allGarments: Garment[];
  staged: StagedMeasurement | null;
  assignments: Record<string, string | null>;
  brova: Garment;
}): MeasurementInPlay[] {
  // Compute the effective measurement id for each garment.
  const effective = (g: Garment): string | null => {
    const override = assignments[g.id];
    if (override != null) return override;
    return g.measurement_id ?? null;
  };

  // Collect distinct real ids in first-seen order.
  const realIds: string[] = [];
  const seen = new Set<string>();
  for (const g of allGarments) {
    const id = effective(g);
    if (id == null) continue;
    if (staged != null && id === staged.localId) continue; // staged handled separately
    if (!seen.has(id)) {
      seen.add(id);
      realIds.push(id);
    }
  }

  const result: MeasurementInPlay[] = realIds.map((id) => ({
    id,
    isNew: false,
    derivedFromId: null,
    followerIds: allGarments.filter((g) => effective(g) === id).map((g) => g.id),
  }));

  // Append the staged measurement last, even if it has no followers yet.
  if (staged != null) {
    result.push({
      id: staged.localId,
      isNew: true,
      derivedFromId: staged.derivedFromMeasurementId,
      followerIds: allGarments.filter((g) => effective(g) === staged.localId).map((g) => g.id),
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Style resolution helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a single final's resulting style for the override section (§2.5).
 * `null` override → keep the final's own style (no write on save).
 * Non-null override → the caller diffs with `diffStyleFields` before writing.
 */
export function resolveFinalStyle({
  final,
  override,
}: {
  final: Garment;
  override: StyleFields | null;
}): StyleResolution {
  if (override == null) {
    return { mode: "keep_own", styleFields: pickStyleFields(final) };
  }
  return { mode: "override", styleFields: override };
}

/**
 * The brova's full resulting style = its current style merged with the
 * in-progress option-flow edits (§2.5). Used to seed "apply brova style to
 * all finals" so the target is always the corrected style, not the original.
 */
export function brovaResultingStyle({
  brova,
  activeStyleUpdates,
}: {
  brova: Garment;
  activeStyleUpdates: StyleFields;
}): StyleFields {
  return { ...pickStyleFields(brova), ...activeStyleUpdates };
}

/**
 * Determine whether "apply brova style to all finals" needs a 3-way confirmation
 * (§2.5). If any final has a different `collar_type` from the brova's resulting
 * style, staff must choose: apply to ALL (overwrite different-collar finals too),
 * apply to SAME-COLLAR finals only, or cancel.
 * Both null/undefined collar values are treated as equal.
 */
export function styleApplyToAllNeedsConfirm({
  finals,
  brovaStyle,
}: {
  finals: Garment[];
  brovaStyle: StyleFields;
}): {
  needsConfirm: boolean;
  sameCollarFinalIds: string[];
  differentCollarFinalIds: string[];
} {
  const brovaCollar = brovaStyle.collar_type ?? null;
  const sameCollarFinalIds: string[] = [];
  const differentCollarFinalIds: string[] = [];

  for (const f of finals) {
    const finalCollar = f.collar_type ?? null;
    if (finalCollar === brovaCollar) {
      sameCollarFinalIds.push(f.id);
    } else {
      differentCollarFinalIds.push(f.id);
    }
  }

  return {
    needsConfirm: differentCollarFinalIds.length > 0,
    sameCollarFinalIds,
    differentCollarFinalIds,
  };
}

/**
 * Guard for the measurement dropdown: reassigning a garment from one STAGED
 * measurement to a DIFFERENT staged measurement is a risky action and requires
 * confirmation (§2.5). Reassigning to/from a real measurement does not.
 */
export function measurementReassignNeedsConfirm({
  currentAssignment,
  nextAssignment,
  stagedLocalIds,
}: {
  currentAssignment: string | null;
  nextAssignment: string | null;
  stagedLocalIds: Set<string>;
}): boolean {
  return (
    currentAssignment != null &&
    nextAssignment != null &&
    stagedLocalIds.has(currentAssignment) &&
    stagedLocalIds.has(nextAssignment) &&
    currentAssignment !== nextAssignment
  );
}

// ---------------------------------------------------------------------------
// Locking gates
// ---------------------------------------------------------------------------

/**
 * True if any final in the order is in production, locking the feedback page to
 * read-only (§2.5 gate 2). "In production" = the workshop has started the final
 * (`in_production: true`, which the "Receive & Start" step sets while the piece
 * is still `waiting_cut`) OR the final has reached `cutting`/later. Note the
 * earlier `in_production` flag: a brova's acceptance releases parked finals to
 * `waiting_cut` but does NOT itself lock the page — editing stays open until the
 * workshop actually starts a final.
 */
export function orderFinalsInProduction(allGarments: Garment[]): boolean {
  const stageSet = new Set<Garment["piece_stage"]>(PRODUCTION_STARTED_STAGES);
  return allGarments.some(
    (g) =>
      g.garment_type === "final" &&
      (g.in_production === true ||
        (g.piece_stage != null && stageSet.has(g.piece_stage))),
  );
}

/**
 * True when the brova is editable: it must be in the shop and not yet in a
 * terminal stage (§2.5 gate 1). Dispatched-to-workshop or collected/delivered
 * brovas are read-only (show history only).
 *
 * Acceptance does NOT lock the brova: after Accept or Accept-with-Fix the
 * feedback stays correctable while the brova is still at the shop and finals
 * have not started production. The two production boundaries are covered without
 * an acceptance check — this brova entering its own fix/alteration production
 * means it has left the shop (`location !== "shop"`), and finals entering
 * production is the order-wide gate (`orderFinalsInProduction`).
 */
export function brovaEditable(g: Garment): boolean {
  return (
    g.location === "shop" &&
    g.piece_stage !== "completed" &&
    g.piece_stage !== "discarded"
  );
}

/**
 * True when a garment is a feedback subject — i.e. it should appear on the brova
 * trial feedback page and surface a feedback action at the showroom (§2.5).
 *
 * Feedback is a brova-trial concept ONLY. Finals are never fed back; they are
 * collected at the cashier (§3), so they are excluded here regardless of stage.
 *
 * The one extra exclusion is the **returned Accept-with-Fix brova** (collect-only,
 * no re-trial): the customer already accepted at the trial, so once its fix comes
 * back it is handed over, not trialed again. `acceptance_status` persists across
 * the dispatch round-trip while the trial verdict (`feedback_status`) is cleared
 * to null on return — so an accepted brova carrying no live verdict is one that
 * has been through its fix and come back. A freshly-recorded Accept-with-Fix
 * (still at the shop, pre-dispatch) keeps a non-null `feedback_status`, so it
 * stays editable until production starts. A Reject-Repair brova returns with
 * `acceptance_status: false`, so it stays a feedback subject (re-trialed).
 */
export function isBrovaFeedbackSubject(g: Garment): boolean {
  return (
    g.garment_type === "brova" &&
    g.location === "shop" &&
    g.piece_stage !== "waiting_for_acceptance" &&
    g.piece_stage !== "completed" &&
    !(g.acceptance_status === true && g.feedback_status == null)
  );
}
