import type { PieceStage, OrderPhase, GarmentType, Location } from "./schema";

const TERMINAL: PieceStage[] = ["completed"];
const PRE_DISPATCH: PieceStage[] = ["waiting_for_acceptance", "waiting_cut"];

/**
 * Determines if a garment is in "alteration" territory based on trip number and type.
 * - Brova: trip >= 4 (trip 1=initial, 2=after first trial, 3=brova changes, 4+=alteration)
 * - Final: trip >= 2 (no trial step, any return is alteration)
 */
export function isAlteration(tripNumber: number | null | undefined, garmentType: string | null | undefined): boolean {
    const trip = tripNumber ?? 1;
    if (garmentType === "final") return trip >= 2;
    return trip >= 4; // brova
}

/**
 * Returns the alteration number (1-based) or null if not an alteration.
 * - Brova: alt# = trip - 3 (trip 4 = Alt 1, trip 5 = Alt 2, ...)
 * - Final: alt# = trip - 1 (trip 2 = Alt 1, trip 3 = Alt 2, ...)
 */
export function getAlterationNumber(tripNumber: number | null | undefined, garmentType: string | null | undefined): number | null {
    const trip = tripNumber ?? 1;
    if (garmentType === "final") return trip >= 2 ? trip - 1 : null;
    return trip >= 4 ? trip - 3 : null;
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
        garments.every(g => g.piece_stage === "completed");
    const someCompleted = garments.some(g => g.piece_stage === "completed") &&
        garments.some(g => g.piece_stage !== "completed");

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

    // All brovas now go to brova_trialed
    const newStage: PieceStage = "brova_trialed";

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

    const brovaGoesBack = feedback === "needs_repair_rejected" || feedback === "needs_redo";
    // needs_repair_accepted: brova stays at shop, staff sends back later

    let message = "";
    if (feedback === "accepted") {
        message = releaseFinals
            ? "Brova accepted. Finals can be released to production."
            : "Brova accepted.";
    } else if (feedback === "needs_repair_accepted") {
        message = releaseFinals
            ? "Brova accepted with minor fix needed. Finals can be released. Send brova back when ready."
            : "Brova accepted with fix needed.";
    } else if (feedback === "needs_repair_rejected") {
        message = releaseFinals
            ? "Brova rejected. But another brova was accepted, so finals can start."
            : "Brova rejected — needs repair.";
    } else if (feedback === "needs_redo") {
        message = releaseFinals
            ? "Brova rejected (full redo). But another brova was accepted, so finals can start."
            : "Brova rejected — full redo needed.";
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
    const shopItems = garments.filter(g => g.location === 'shop' && g.piece_stage !== 'completed');
    const allNonCompleted = garments.filter(g => g.piece_stage !== 'completed');

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
