import { useEffect, useMemo, useState } from "react";

export type FulfillmentMode = "collected" | "delivered";

type EligibleGarment = { id: string };

type Args = {
    orderId: string;
    eligibleGarments: EligibleGarment[];
    isHomeDelivery: boolean;
};

/**
 * Tracks which eligible garments are selected for hand-over and the per-garment
 * collected/delivered choice. Resets on order switch.
 */
export function useGarmentCollection({ orderId, eligibleGarments, isHomeDelivery }: Args) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [fulfillmentModes, setFulfillmentModes] = useState<Map<string, FulfillmentMode>>(new Map());

    useEffect(() => {
        setSelectedIds(new Set());
        setFulfillmentModes(new Map());
    }, [orderId]);

    const defaultMode = (): FulfillmentMode => (isHomeDelivery ? "delivered" : "collected");

    const toggle = (id: string) => {
        const wasSelected = selectedIds.has(id);
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        if (wasSelected) {
            setFulfillmentModes((prev) => {
                const m = new Map(prev);
                m.delete(id);
                return m;
            });
        } else {
            setFulfillmentModes((prev) => new Map(prev).set(id, defaultMode()));
        }
    };

    const toggleAll = () => {
        if (selectedIds.size === eligibleGarments.length) {
            setSelectedIds(new Set());
            setFulfillmentModes(new Map());
        } else {
            const mode = defaultMode();
            setSelectedIds(new Set(eligibleGarments.map((g) => g.id)));
            setFulfillmentModes(new Map(eligibleGarments.map((g) => [g.id, mode])));
        }
    };

    const setMode = (id: string, mode: FulfillmentMode) => {
        setFulfillmentModes((prev) => new Map(prev).set(id, mode));
    };

    const clear = () => {
        setSelectedIds(new Set());
        setFulfillmentModes(new Map());
    };

    const actionLabel = useMemo(() => {
        if (selectedIds.size === 0) return "Collect";
        const modes = Array.from(selectedIds).map((id) => fulfillmentModes.get(id));
        if (modes.every((m) => m === "delivered")) return "Deliver";
        if (modes.some((m) => m === "delivered")) return "Dispatch";
        return "Collect";
    }, [selectedIds, fulfillmentModes]);

    return {
        selectedIds,
        fulfillmentModes,
        toggle,
        toggleAll,
        setMode,
        clear,
        actionLabel,
    };
}
