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
export function getShowroomStatus(garments: GarmentInfo[]) {
    // 1. Filter only items physically at the shop and not finished
    const shopItems = garments.filter(g => g.location === 'shop' && g.piece_stage !== 'completed');

    // 2. Derive base flags from shop items
    const isBrovaTrial = shopItems.some(g => g.garment_type === 'brova' && g.acceptance_status !== true);
    const isAlterationIn = shopItems.some(g => isAlteration(g.trip_number, g.garment_type) && g.acceptance_status !== true);

    // 3. Check if finals are still outstanding (not at shop and not completed)
    const allGarments = garments.filter(g => g.piece_stage !== 'completed');
    const finals = allGarments.filter(g => g.garment_type === 'final');
    const finalsNotAtShop = finals.filter(g => g.location !== 'shop');
    const isWaitingFinals = finalsNotAtShop.length > 0;

    // 4. Check if a shop item is "done" — accepted brovas OR first-trip finals at ready_for_pickup
    const isShopItemDone = (g: GarmentInfo) =>
        g.acceptance_status === true ||
        (g.garment_type === 'final' && g.piece_stage === 'ready_for_pickup' &&
         g.feedback_status !== 'needs_repair' && g.feedback_status !== 'needs_redo');

    // Ready for pickup: everything at shop is done AND no finals outstanding
    const isReadyForPickup = shopItems.length > 0
        && shopItems.every(isShopItemDone)
        && !isWaitingFinals;

    // 5. Pickup + Waiting Finals: shop items done but finals still out
    const isPickupWaitingFinals = shopItems.length > 0
        && shopItems.every(isShopItemDone)
        && isWaitingFinals;

    // 6. Check if any shop item needs work (rejected finals/brovas waiting to be sent back)
    const hasNeedsAction = shopItems.some(g =>
        g.feedback_status === 'needs_repair' || g.feedback_status === 'needs_redo');

    // 7. Determine priority label
    let label: "brova_trial" | "alteration_in" | "needs_action" | "ready_for_pickup" | "pickup_waiting_finals" | null = null;

    if (isAlterationIn) label = "alteration_in";
    else if (isBrovaTrial) label = "brova_trial";
    else if (hasNeedsAction) label = "needs_action";
    else if (isPickupWaitingFinals) label = "pickup_waiting_finals";
    else if (isReadyForPickup) label = "ready_for_pickup";

    return {
        isBrovaTrial,
        isAlterationIn,
        hasNeedsAction,
        isReadyForPickup,
        isPickupWaitingFinals,
        isWaitingFinals,
        label,
        hasPhysicalItems: shopItems.length > 0
    };
}
