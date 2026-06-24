// Cashier helpers for §2.13 order linking + §5 customer accounts, plus the
// advance-first lump-sum distributor used by the bulk-payment page.

/** A linked-order group key: the primary's id (COALESCE(linked_order_id, id)). */
export function groupKeyOf(id: number, linkedOrderId: number | null | undefined): number {
    return linkedOrderId ?? id;
}

/**
 * Cluster items that belong to the same linked-order group adjacently, WITHOUT
 * otherwise reordering: each group is anchored at the position of its first
 * member in the input, so the overall date ordering of group anchors is
 * preserved (same idea as the workshop Production Tracker). Stable.
 */
export function clusterByGroup<T>(
    items: T[],
    getId: (t: T) => number,
    getLinked: (t: T) => number | null | undefined,
): T[] {
    const buckets = new Map<number, T[]>();
    const order: number[] = [];
    for (const it of items) {
        const key = groupKeyOf(getId(it), getLinked(it));
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = [];
            buckets.set(key, bucket);
            order.push(key);
        }
        bucket.push(it);
    }
    return order.flatMap((key) => buckets.get(key)!);
}

/** Group sizes within a list, keyed by group key — so a row can show "Linked · N". */
export function groupSizes<T>(
    items: T[],
    getId: (t: T) => number,
    getLinked: (t: T) => number | null | undefined,
): Map<number, number> {
    const sizes = new Map<number, number>();
    for (const it of items) {
        const key = groupKeyOf(getId(it), getLinked(it));
        sizes.set(key, (sizes.get(key) ?? 0) + 1);
    }
    return sizes;
}

/**
 * The family-relation chip for a row: a Secondary account reads as
 * "<relation> of <Primary name>" (e.g. "son of Ahmed"). Returns null for a
 * Primary/plain account, which carries no chip.
 */
export function relationLabel(o: {
    account_type?: string | null;
    relation?: string | null;
    primary_customer_name?: string | null;
}): string | null {
    if (o.account_type !== "Secondary") return null;
    const rel = o.relation?.trim();
    const primary = o.primary_customer_name?.trim();
    if (rel && primary) return `${rel} of ${primary}`;
    if (rel) return rel;
    if (primary) return `linked to ${primary}`;
    return "Secondary";
}

/**
 * Seed per-order payment amounts from a single lump the customer hands over for
 * several (typically linked) orders. ADVANCE-FIRST: fill each order's agreed
 * advance (capped at its remaining balance); if the lump can't cover every
 * advance, split it across them in proportion to those advances; once all
 * advances are covered, spread the leftover proportionally across the
 * still-open balances (heavier order gets more — never an equal split).
 *
 * All math is in fils (KWD×1000) so the seeded amounts sum to EXACTLY
 * min(lump, total remaining) — nothing is lost or invented to rounding, and we
 * never seed more than an order's remaining balance. The cashier can still
 * override any card afterward; this only fills the initial amounts.
 */
export function distributeAdvanceFirst(
    orders: { order_id: number; remaining: number; advance: number }[],
    lump: number,
): Record<number, number> {
    const FILS = 1000;
    const rows = orders.map((o) => {
        const remaining = Math.max(0, Math.round(o.remaining * FILS));
        return {
            id: o.order_id,
            remaining,
            advTarget: Math.min(Math.max(0, Math.round(o.advance * FILS)), remaining),
            amount: 0,
        };
    });
    const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
    const pool = Math.min(Math.max(0, Math.round(lump * FILS)), totalRemaining);

    // Largest-remainder proportional split of `budget` fils over `weights`,
    // each row capped at `caps[i]`. Returns fils given to each row.
    const spread = (weights: number[], caps: number[], budget: number): number[] => {
        const out = weights.map(() => 0);
        const totalW = weights.reduce((s, w) => s + w, 0);
        let rem = budget;
        if (totalW > 0) {
            weights.forEach((w, i) => {
                const give = Math.min(Math.floor((budget * w) / totalW), caps[i]);
                out[i] = give;
                rem -= give;
            });
        }
        // Hand out the leftover fils one at a time, largest weight first, to any
        // row still under its cap (deterministic, exhausts `rem` or all caps).
        const byWeight = weights.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w).map((x) => x.i);
        let guard = 0;
        while (rem > 0 && guard <= budget + weights.length) {
            let moved = false;
            for (const i of byWeight) {
                if (rem <= 0) break;
                if (out[i] < caps[i]) { out[i] += 1; rem -= 1; moved = true; }
            }
            if (!moved) break;
            guard++;
        }
        return out;
    };

    const totalAdv = rows.reduce((s, r) => s + r.advTarget, 0);
    if (pool <= totalAdv) {
        const got = spread(rows.map((r) => r.advTarget), rows.map((r) => r.advTarget), pool);
        rows.forEach((r, i) => { r.amount = got[i]; });
    } else {
        rows.forEach((r) => { r.amount = r.advTarget; });
        const got = spread(
            rows.map((r) => r.remaining - r.advTarget),
            rows.map((r) => r.remaining - r.advTarget),
            pool - totalAdv,
        );
        rows.forEach((r, i) => { r.amount += got[i]; });
    }
    return Object.fromEntries(rows.map((r) => [r.id, r.amount / FILS]));
}
