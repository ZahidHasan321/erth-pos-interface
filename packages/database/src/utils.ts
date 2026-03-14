import type { PieceStage, OrderPhase, GarmentType, Location } from "./schema";

const TERMINAL: PieceStage[] = ["completed"];
const PRE_DISPATCH: PieceStage[] = ["waiting_for_acceptance", "waiting_cut"];

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
const NEEDS_WORK: PieceStage[] = ["needs_repair", "needs_redo"];
const SHOP: PieceStage[] = ["at_shop", "accepted"];

function isBrovaAccepted(g: GarmentInfo): boolean {
    const stage = g.piece_stage as PieceStage;
    return stage === "accepted" ||
           stage === "completed" ||
           (stage === "needs_repair" && g.acceptance_status === true);
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
        brovaAtShop: count(brovas, ["at_shop"]),
        brovaAccepted: brovas.filter(isBrovaAccepted).length,
        brovaNeedsWork: count(brovas, NEEDS_WORK),
        brovaInPipeline: count(brovas, PRODUCTION),
        brovaCompleted: count(brovas, ["completed"]),

        finalTotal: finals.length,
        finalWaiting: count(finals, ["waiting_for_acceptance"]),
        finalInProduction: count(finals, PRODUCTION),
        finalAtShop: count(finals, ["at_shop"]),
        finalNeedsWork: count(finals, NEEDS_WORK),
        finalCompleted: count(finals, ["completed"]),

        hasBrovaReadyForTrial:
            brovas.some(g => g.piece_stage === "at_shop") &&
            finals.some(g => g.piece_stage === "waiting_for_acceptance"),

        hasBlockedFinals:
            finals.some(g => g.piece_stage === "waiting_for_acceptance") &&
            !brovas.some(isBrovaAccepted),

        allBrovasTrialed:
            brovas.length > 0 &&
            brovas.every(g =>
                g.piece_stage === "accepted" ||
                g.piece_stage === "completed" ||
                NEEDS_WORK.includes(g.piece_stage as PieceStage)
            ),

        hasGarmentsNeedingAction:
            garments.some(g => NEEDS_WORK.includes(g.piece_stage as PieceStage)),

        allAtShop,
        allCompleted,
        someCompleted,
    };
}

export type BrovaFeedback = "accepted" | "needs_repair_accepted" | "needs_repair_rejected" | "needs_redo";

interface BrovaFeedbackResult {
    newStage: PieceStage;
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
    allBrovas: { id: string; piece_stage: PieceStage | null | string; acceptance_status: boolean | null }[],
    currentBrovaId: string
): BrovaFeedbackResult {
    // Map feedback to stage + acceptance_status
    const mapping: Record<BrovaFeedback, { stage: PieceStage; accepted: boolean }> = {
        "accepted": { stage: "accepted", accepted: true },
        "needs_repair_accepted": { stage: "needs_repair", accepted: true },
        "needs_repair_rejected": { stage: "needs_repair", accepted: false },
        "needs_redo": { stage: "needs_redo", accepted: false },
    };

    const { stage: newStage, accepted: acceptanceStatus } = mapping[feedback];

    // Simulate: what would brova states look like AFTER this feedback?
    const simulatedBrovas = allBrovas.map(b =>
        b.id === currentBrovaId
            ? { ...b, piece_stage: newStage, acceptance_status: acceptanceStatus }
            : b
    );

    const anyAccepted = simulatedBrovas.some(b =>
        b.acceptance_status === true ||
        b.piece_stage === "accepted" ||
        b.piece_stage === "completed"
    );

    const allTrialed = simulatedBrovas.every(b =>
        b.piece_stage === "accepted" ||
        b.piece_stage === "needs_repair" ||
        b.piece_stage === "needs_redo" ||
        b.piece_stage === "completed"
    );

    // Release ONLY when ALL brovas trialed AND at least one accepted
    const releaseFinals = anyAccepted && allTrialed;
    const brovaGoesBack = feedback === "needs_repair_rejected" || feedback === "needs_redo";
    // needs_repair_accepted: brova stays at shop, staff sends back later

    let message = "";
    if (feedback === "accepted") {
        message = releaseFinals
            ? "Brova accepted. Final production will begin."
            : "Brova accepted. Waiting for other brova(s) to be trialed.";
    } else if (feedback === "needs_repair_accepted") {
        message = releaseFinals
            ? "Brova accepted with minor fix needed. Finals will start. Send brova back when ready."
            : "Brova accepted with fix needed. Waiting for other brova(s).";
    } else if (feedback === "needs_repair_rejected") {
        message = releaseFinals
            ? "Brova rejected. But another brova was accepted, so finals will start."
            : allTrialed
                ? "All brovas rejected. Finals will NOT start."
                : "Brova rejected. Waiting for other brova(s).";
    } else if (feedback === "needs_redo") {
        message = releaseFinals
            ? "Brova rejected (full redo). But another brova was accepted, so finals will start."
            : allTrialed
                ? "All brovas rejected. Finals will NOT start."
                : "Brova rejected (redo). Waiting for other brova(s).";
    }

    return { newStage, acceptanceStatus, releaseFinals, brovaGoesBack, message };
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
    const isAlterationIn = shopItems.some(g => (Number(g.trip_number) || 1) >= 3 && g.acceptance_status !== true);

    // 3. Check if finals are still outstanding (not at shop and not completed)
    const allGarments = garments.filter(g => g.piece_stage !== 'completed');
    const finals = allGarments.filter(g => g.garment_type === 'final');
    const finalsNotAtShop = finals.filter(g => g.location !== 'shop');
    const isWaitingFinals = finalsNotAtShop.length > 0;

    // 4. Ready for pickup: everything at shop is accepted AND no finals outstanding
    const isReadyForPickup = shopItems.length > 0
        && shopItems.every(g => g.acceptance_status === true)
        && !isWaitingFinals;

    // 5. Pickup + Waiting Finals: shop items accepted but finals still out
    const isPickupWaitingFinals = shopItems.length > 0
        && shopItems.every(g => g.acceptance_status === true)
        && isWaitingFinals;

    // 6. Determine priority label
    let label: "brova_trial" | "alteration_in" | "ready_for_pickup" | "pickup_waiting_finals" | null = null;

    if (isAlterationIn) label = "alteration_in";
    else if (isBrovaTrial) label = "brova_trial";
    else if (isPickupWaitingFinals) label = "pickup_waiting_finals";
    else if (isReadyForPickup) label = "ready_for_pickup";

    return {
        isBrovaTrial,
        isAlterationIn,
        isReadyForPickup,
        isPickupWaitingFinals,
        isWaitingFinals,
        label,
        hasPhysicalItems: shopItems.length > 0
    };
}
