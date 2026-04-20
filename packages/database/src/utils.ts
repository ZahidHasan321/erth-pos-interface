import type { PieceStage, OrderPhase, GarmentType, Location } from "./schema";

/**
 * Single source of truth for the business timezone.
 * All display/filter code should read from this; DB writes stay UTC.
 * Change here to change it everywhere.
 */
export const TIMEZONE = "Asia/Kuwait";

const TERMINAL: PieceStage[] = ["completed", "discarded"];
const PRE_DISPATCH: PieceStage[] = ["waiting_for_acceptance", "waiting_cut"];

export type MeasurementParts = {
  whole: number;
  numerator: number;
  denominator: number;
  negative: boolean;
  hasDegree: boolean;
};

/**
 * Parses a decimal measurement into whole + quarter-fraction parts, snapping
 * to the nearest 1/8 ("eighth"). Fractions are restricted to 0, 1/4, 1/2, 3/4.
 * A value that lands on the upper half of an eighth sets hasDegree=true,
 * rendered as a trailing ° mark (e.g. 10.375 → "10 1/4°").
 *
 * e.g. 12.5 → 12 1/2, 10.3 → 10 1/4, 10.99 → 11, 10.125 → 10°.
 * Returns null for null/non-numeric values or values that snap to zero.
 */
export function parseMeasurementParts(raw: unknown, degree = 0): MeasurementParts | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const adjusted = degree ? n - degree : n;
  const negative = adjusted < 0;
  const abs = Math.abs(adjusted);

  const eighths = Math.round(abs * 8);
  if (eighths === 0) return null;

  const whole = Math.floor(eighths / 8);
  const rem = eighths - whole * 8;
  const hasDegree = rem % 2 === 1;
  const quarters = (rem - (hasDegree ? 1 : 0)) / 2;

  let numerator = 0;
  let denominator = 1;
  if (quarters === 1) { numerator = 1; denominator = 4; }
  else if (quarters === 2) { numerator = 1; denominator = 2; }
  else if (quarters === 3) { numerator = 3; denominator = 4; }

  return { whole, numerator, denominator, negative, hasDegree };
}

/**
 * Formats a decimal measurement as a plain text fraction string.
 * e.g. 12.5 → "12 1/2", 10.375 → "10 1/4°". Falls back to this when React
 * rendering isn't available.
 */
export function formatMeasurement(raw: unknown, degree = 0): string {
  const p = parseMeasurementParts(raw, degree);
  if (!p) return "";
  const sign = p.negative ? "-" : "";
  const deg = p.hasDegree ? "°" : "";
  if (p.numerator === 0) return `${sign}${p.whole}${deg}`;
  const frac = `${p.numerator}/${p.denominator}`;
  return p.whole > 0
    ? `${sign}${p.whole} ${frac}${deg}`
    : `${sign}${frac}${deg}`;
}

/**
 * Unified alteration rule: any return to workshop (trip >= 2) is an alteration,
 * regardless of garment type. alt# = trip - 1.
 *
 * QC-fail rework within the same trip is a separate concept — see
 * hasQcFailThisTrip()/getAltLabel(). It carries the "alt_p" label and does not
 * increment trip_number.
 */
export function isAlteration(tripNumber: number | null | undefined, _garmentType?: string | null): boolean {
    const trip = tripNumber ?? 1;
    return trip >= 2;
}

export function getAlterationNumber(tripNumber: number | null | undefined, _garmentType?: string | null): number | null {
    const trip = tripNumber ?? 1;
    return trip >= 2 ? trip - 1 : null;
}

/** True when the current trip has a failed QC attempt (garment was bounced back
 * to an earlier stage without a new trip). */
export function hasQcFailThisTrip(garment: {
    trip_number?: number | null;
    trip_history?: Array<{ trip: number; qc_attempts?: Array<{ result: string }> | null }> | null;
}): boolean {
    const currentTrip = garment.trip_number ?? 1;
    const entry = garment.trip_history?.find(t => t.trip === currentTrip);
    return !!entry?.qc_attempts?.some(a => a.result === "fail");
}

/** Production-terminal style label for a garment's rework state.
 *  "alt_p" = QC-fail rework this trip, "alt_N" = trip-based alteration, null = first-time. */
export function getAltLabel(garment: {
    trip_number?: number | null;
    trip_history?: Array<{ trip: number; qc_attempts?: Array<{ result: string }> | null }> | null;
}): string | null {
    if (hasQcFailThisTrip(garment)) return "alt_p";
    const n = getAlterationNumber(garment.trip_number);
    return n === null ? null : `alt_${n}`;
}

// Style fields that define a garment's "style identity" for grouping.
// Two garments with identical values across these fields share a style_id
// within the same order. Excludes fabric/color/measurement/quantity/notes —
// only the style design itself counts.
const STYLE_IDENTITY_FIELDS = [
    "style",
    "collar_type", "collar_button",
    "cuffs_type", "cuffs_thickness",
    "front_pocket_type", "front_pocket_thickness",
    "wallet_pocket", "pen_holder", "mobile_pocket", "small_tabaggi",
    "jabzour_1", "jabzour_2", "jabzour_thickness",
    "lines",
] as const;

function styleFingerprint(g: Record<string, unknown>): string {
    return STYLE_IDENTITY_FIELDS
        .map(f => `${f}=${g[f] ?? ""}`)
        .join("|");
}

/**
 * Assigns a per-order integer style_id (1, 2, 3...) to each garment based on
 * its style fingerprint. Garments with identical style selections share the
 * same id. Mutates input array (returns same reference for chaining).
 *
 * Numbering is stable within a single call (first unique fingerprint = 1)
 * but not stable across saves — re-saving the same order may renumber if
 * order of garments changes. style_id is a *grouping* key, not an identity.
 */
export function computeStyleGroups<T extends Record<string, any>>(garments: T[]): T[] {
    const seen = new Map<string, number>();
    let next = 1;
    for (const g of garments) {
        const fp = styleFingerprint(g);
        let id = seen.get(fp);
        if (id === undefined) {
            id = next++;
            seen.set(fp, id);
        }
        (g as any).style_id = id;
    }
    return garments;
}

/**
 * Re-computes the order phase based on the current stages of its garments.
 * Logic matches the DB trigger recompute_order_phase().
 */
export function computeOrderPhase(
    garments: { piece_stage: PieceStage | null | string }[],
    currentPhase: OrderPhase
): OrderPhase {
    if (garments.length === 0) return currentPhase;

    const stages = garments.map(g => g.piece_stage as PieceStage);

    // All done?
    if (stages.every(s => TERMINAL.includes(s))) return "completed";

    // All still pre-dispatch? Preserve current phase (new stays new until explicit dispatch)
    if (stages.every(s => PRE_DISPATCH.includes(s))) return currentPhase;

    // Everything else = in_progress
    return "in_progress";
}

interface GarmentInfo {
    piece_stage: PieceStage | null | string;
    garment_type: GarmentType | null | string;
    location: Location | null | string;
    acceptance_status: boolean | null;
    feedback_status?: string | null;
    trip_number?: number | null;
}

interface OrderSummary {
    totalGarments: number;

    brovaTotal: number;
    brovaAtShop: number;
    brovaAccepted: number;
    brovaNeedsWork: number;
    brovaInPipeline: number;
    brovaCompleted: number;

    finalTotal: number;
    finalWaiting: number;
    finalInProduction: number;
    finalAtShop: number;
    finalNeedsWork: number;
    finalCompleted: number;

    // Actionable flags
    hasBrovaReadyForTrial: boolean;
    hasBlockedFinals: boolean;
    allBrovasTrialed: boolean;
    hasGarmentsNeedingAction: boolean;
    allAtShop: boolean;
    allCompleted: boolean;
    someCompleted: boolean;
}

const PRODUCTION: PieceStage[] = [
    "waiting_cut", "soaking", "cutting", "post_cutting",
    "sewing", "finishing", "ironing", "quality_check", "ready_for_dispatch"
];
const SHOP: PieceStage[] = ["awaiting_trial", "ready_for_pickup", "brova_trialed"];

function isBrovaAccepted(g: GarmentInfo): boolean {
    return g.piece_stage === "completed" ||
           g.acceptance_status === true;
}

function garmentNeedsWork(g: GarmentInfo): boolean {
    return g.feedback_status === "needs_repair" || g.feedback_status === "needs_redo";
}

/**
 * Returns a rich summary of an order's garments for UI display and logic.
 */
export function getOrderSummary(garments: GarmentInfo[]): OrderSummary {
    const brovas = garments.filter(g => g.garment_type === "brova");
    const finals = garments.filter(g => g.garment_type === "final");

    const count = (arr: GarmentInfo[], stages: PieceStage[]) =>
        arr.filter(g => stages.includes(g.piece_stage as PieceStage)).length;

    const allAtShop = garments.length > 0 &&
        garments.every(g => SHOP.includes(g.piece_stage as PieceStage));
    const allCompleted = garments.length > 0 &&
        garments.every(g => TERMINAL.includes(g.piece_stage as PieceStage));
    const someCompleted = garments.some(g => TERMINAL.includes(g.piece_stage as PieceStage)) &&
        garments.some(g => !TERMINAL.includes(g.piece_stage as PieceStage));

    return {
        totalGarments: garments.length,

        brovaTotal: brovas.length,
        brovaAtShop: count(brovas, ["awaiting_trial"]),
        brovaAccepted: brovas.filter(isBrovaAccepted).length,
        brovaNeedsWork: brovas.filter(garmentNeedsWork).length,
        brovaInPipeline: count(brovas, PRODUCTION),
        brovaCompleted: count(brovas, ["completed"]),

        finalTotal: finals.length,
        finalWaiting: count(finals, ["waiting_for_acceptance"]),
        finalInProduction: count(finals, PRODUCTION),
        finalAtShop: count(finals, ["ready_for_pickup", "awaiting_trial"]),
        finalNeedsWork: finals.filter(garmentNeedsWork).length,
        finalCompleted: count(finals, ["completed"]),

        hasBrovaReadyForTrial:
            brovas.some(g => g.piece_stage === "awaiting_trial") &&
            finals.some(g => g.piece_stage === "waiting_for_acceptance"),

        hasBlockedFinals:
            finals.some(g => g.piece_stage === "waiting_for_acceptance") &&
            !brovas.some(isBrovaAccepted),

        allBrovasTrialed:
            brovas.length > 0 &&
            brovas.every(g =>
                g.piece_stage === "brova_trialed" ||
                g.piece_stage === "completed" ||
                garmentNeedsWork(g)
            ),

        hasGarmentsNeedingAction:
            garments.some(garmentNeedsWork),

        allAtShop,
        allCompleted,
        someCompleted,
    };
}

export type BrovaFeedback = "accepted" | "needs_repair_accepted" | "needs_repair_rejected" | "needs_redo";

interface BrovaFeedbackResult {
    newStage: PieceStage;
    feedbackStatus: string;
    acceptanceStatus: boolean;
    releaseFinals: boolean;
    brovaGoesBack: boolean;
    message: string;
}

/**
 * Evaluates brova feedback to determine if finals should be released.
 * Follows "Option B: Stricter" from the migration plan.
 */
export function evaluateBrovaFeedback(
    feedback: BrovaFeedback,
    allBrovas: { id: string; piece_stage: PieceStage | null | string; acceptance_status: boolean | null; feedback_status?: string | null }[],
    currentBrovaId: string
): BrovaFeedbackResult {
    // Map feedback to feedback_status + acceptance_status
    const mapping: Record<BrovaFeedback, { feedbackStatus: string; accepted: boolean }> = {
        "accepted": { feedbackStatus: "accepted", accepted: true },
        "needs_repair_accepted": { feedbackStatus: "needs_repair", accepted: true },
        "needs_repair_rejected": { feedbackStatus: "needs_repair", accepted: false },
        "needs_redo": { feedbackStatus: "needs_redo", accepted: false },
    };

    const { feedbackStatus, accepted: acceptanceStatus } = mapping[feedback];

    // needs_redo discards the original (terminal); all other outcomes land at brova_trialed
    const newStage: PieceStage = feedback === "needs_redo" ? "discarded" : "brova_trialed";

    // Simulate: what would brova states look like AFTER this feedback?
    const simulatedBrovas = allBrovas.map(b =>
        b.id === currentBrovaId
            ? { ...b, piece_stage: newStage, acceptance_status: acceptanceStatus, feedback_status: feedbackStatus }
            : b
    );

    // Release finals as soon as ANY brova is accepted — no need to wait for all
    const releaseFinals = simulatedBrovas.some(b =>
        b.acceptance_status === true ||
        b.piece_stage === "completed"
    );

    // needs_redo: original is discarded (dead), workshop creates replacement — no return trip
    const brovaGoesBack = feedback === "needs_repair_rejected";
    // needs_repair_accepted: brova stays at shop, staff sends back later

    let message = "";
    if (feedback === "accepted") {
        message = "Brova accepted.";
    } else if (feedback === "needs_repair_accepted") {
        message = "Brova accepted with fix needed. Send back to workshop when ready.";
    } else if (feedback === "needs_repair_rejected") {
        message = "Brova rejected — needs repair.";
    } else if (feedback === "needs_redo") {
        message = "Brova discarded. Workshop must create a replacement garment.";
    }

    return { newStage, feedbackStatus, acceptanceStatus, releaseFinals, brovaGoesBack, message };
}

/**
 * Unified logic for Showroom Operational Statuses.
 * This is the single source of truth for "What is happening at the shop?"
 *
 * Looks at ALL garments in the order (not just shop items) to determine
 * whether finals are still outstanding (in production / at workshop / in transit).
 */
export type ShowroomLabel =
    | "alteration_in"      // Alteration garment at shop needing trial/action
    | "brova_trial"        // Brovas at shop, customer needs to try them on
    | "needs_action"       // Garments rejected, need to be sent back to workshop
    | "awaiting_finals"    // Brovas done, waiting for finals from workshop
    | "partial_ready"      // Some items ready at shop, others still out (generic)
    | "ready_for_pickup"   // Everything done, customer can collect
    | null;

export function getShowroomStatus(garments: GarmentInfo[]) {
    // Shop items that matter to the customer flow: dispatched at least once
    // (trip_number > 0). A trip-0 garment is physically at shop but still
    // awaiting its first dispatch — it has no customer-facing status yet.
    // Excluding it prevents partially-dispatched orders from wrongly appearing
    // as "partial_ready" when their shop-side garments are pre-dispatch.
    const shopItems = garments.filter(g =>
        g.location === 'shop'
        && !TERMINAL.includes(g.piece_stage as PieceStage)
        && (g.trip_number ?? 0) > 0);
    const allNonCompleted = garments.filter(g => !TERMINAL.includes(g.piece_stage as PieceStage));

    // Check if finals are in transit to shop (shop needs to know even if no items at shop yet)
    const finalsInTransit = allNonCompleted.some(g =>
        g.garment_type === 'final' && g.location === 'transit_to_shop');

    if (shopItems.length === 0) {
        // No items at shop, but finals heading this way
        if (finalsInTransit) {
            return { label: "awaiting_finals" as ShowroomLabel, hasPhysicalItems: false };
        }
        return { label: null as ShowroomLabel, hasPhysicalItems: false };
    }

    // What's happening at the shop? Look at each garment's state.
    const hasAlterationNeedingWork = shopItems.some(g =>
        isAlteration(g.trip_number, g.garment_type) &&
        g.acceptance_status !== true &&
        (g.piece_stage === 'awaiting_trial' || g.feedback_status === 'needs_repair' || g.feedback_status === 'needs_redo'));

    const hasBrovaAwaitingTrial = shopItems.some(g =>
        g.garment_type === 'brova' && g.piece_stage === 'awaiting_trial');

    const hasGarmentNeedingAction = shopItems.some(g =>
        g.feedback_status === 'needs_repair' || g.feedback_status === 'needs_redo');

    const finalsStillOut = allNonCompleted.some(g =>
        g.garment_type === 'final' && g.location !== 'shop');

    const garmentsStillOut = allNonCompleted.some(g => g.location !== 'shop');

    // Are all brovas at shop done (trialed/accepted/completed)?
    const shopBrovas = shopItems.filter(g => g.garment_type === 'brova');
    const allShopItemsDone = shopItems.every(g =>
        g.acceptance_status === true ||
        (g.garment_type === 'final' && g.piece_stage === 'ready_for_pickup' &&
         g.feedback_status !== 'needs_repair' && g.feedback_status !== 'needs_redo'));

    // Priority: alteration > brova trial > needs action > awaiting finals > partial ready > ready
    let label: ShowroomLabel = null;

    if (hasAlterationNeedingWork) label = "alteration_in";
    else if (hasBrovaAwaitingTrial) label = "brova_trial";
    else if (hasGarmentNeedingAction) label = "needs_action";
    else if (shopBrovas.length > 0 && finalsStillOut) label = "awaiting_finals";
    else if (allShopItemsDone && !garmentsStillOut) label = "ready_for_pickup";
    else if (garmentsStillOut) label = "partial_ready";

    return { label, hasPhysicalItems: true };
}
