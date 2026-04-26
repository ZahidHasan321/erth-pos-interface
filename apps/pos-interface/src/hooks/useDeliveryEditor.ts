import { useEffect, useRef, useState } from "react";
import {
    useToggleHomeDeliveryMutation,
    useUpdateDeliveryChargeMutation,
} from "@/hooks/useCashier";
import { usePricing } from "@/hooks/usePricing";

type Args = {
    /** Numeric DB order id; null while the order is loading. */
    orderId: number | null;
    serverHomeDelivery: boolean;
    serverDeliveryCharge: number;
};

/**
 * Manages optimistic home-delivery toggle and charge-input state for the
 * cashier detail view. The charge input is controlled here so the caller can
 * flush a pending edit (`saveDeliveryPendingIfAny`) before recording a payment;
 * without that flush, the payment would process against a stale server total.
 */
export function useDeliveryEditor({ orderId, serverHomeDelivery, serverDeliveryCharge }: Args) {
    const toggleDeliveryMutation = useToggleHomeDeliveryMutation();
    const updateChargeMutation = useUpdateDeliveryChargeMutation();
    const { getPrice } = usePricing();
    const deliveryPrice = getPrice("HOME_DELIVERY") || 0;

    const [optimisticDelivery, setOptimisticDelivery] = useState<boolean | null>(null);
    const [optimisticChargeOverride, setOptimisticChargeOverride] = useState<number | null>(null);
    const isHomeDelivery = optimisticDelivery ?? serverHomeDelivery;

    const [chargeInput, setChargeInput] = useState<string>(() => serverDeliveryCharge.toString());
    const chargeInputRef = useRef(chargeInput);
    chargeInputRef.current = chargeInput;

    // Reset on order switch.
    const prevServerChargeRef = useRef(serverDeliveryCharge);
    useEffect(() => {
        setChargeInput(serverDeliveryCharge.toString());
        prevServerChargeRef.current = serverDeliveryCharge;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    // Sync input to new server value ONLY when the user hasn't edited away from
    // the previous server value. Covers async initial load + post-save refetch
    // without wiping in-progress edits.
    useEffect(() => {
        const prev = prevServerChargeRef.current;
        if (Math.abs(prev - serverDeliveryCharge) < 0.0005) return;
        const current = chargeInputRef.current === "" ? 0 : Number(chargeInputRef.current);
        if (!isNaN(current) && Math.abs(current - prev) < 0.0005) {
            setChargeInput(serverDeliveryCharge.toString());
        }
        prevServerChargeRef.current = serverDeliveryCharge;
    }, [serverDeliveryCharge]);

    // Toggling home delivery ON prefills charge with the default if empty/zero.
    const prevOptimisticDelivery = useRef(optimisticDelivery);
    useEffect(() => {
        if (optimisticDelivery === true && prevOptimisticDelivery.current !== true) {
            const current = Number(chargeInputRef.current);
            if (!chargeInputRef.current || isNaN(current) || current === 0) {
                setChargeInput(deliveryPrice.toString());
            }
        }
        prevOptimisticDelivery.current = optimisticDelivery;
    }, [optimisticDelivery, deliveryPrice]);

    const parsedChargeInput = chargeInput === "" ? 0 : Number(chargeInput);
    const hasValidChargeInput = !isNaN(parsedChargeInput) && parsedChargeInput >= 0;
    const isChargeDirty = isHomeDelivery && hasValidChargeInput
        && Math.abs(parsedChargeInput - serverDeliveryCharge) > 0.0005;

    // Effective (optimistic) charge. Priority: typed input > explicit override > toggle default > server.
    const optimisticDeliveryCharge = !isHomeDelivery
        ? 0
        : isChargeDirty
            ? parsedChargeInput
            : optimisticChargeOverride !== null
                ? optimisticChargeOverride
                : optimisticDelivery === true
                    ? deliveryPrice
                    : serverDeliveryCharge;

    const isAnyPending = optimisticDelivery !== null || optimisticChargeOverride !== null || isChargeDirty;

    // Sync optimistic toggle back once server catches up.
    useEffect(() => {
        if (optimisticDelivery !== null && optimisticDelivery === serverHomeDelivery) {
            const t = setTimeout(() => setOptimisticDelivery(null), 350);
            return () => clearTimeout(t);
        }
    }, [serverHomeDelivery, optimisticDelivery]);

    useEffect(() => {
        if (optimisticChargeOverride !== null && Math.abs(optimisticChargeOverride - serverDeliveryCharge) < 0.0005) {
            const t = setTimeout(() => setOptimisticChargeOverride(null), 350);
            return () => clearTimeout(t);
        }
    }, [serverDeliveryCharge, optimisticChargeOverride]);

    const reset = () => {
        setOptimisticDelivery(null);
        setOptimisticChargeOverride(null);
    };

    /**
     * Flush any pending delivery edits (toggle OR charge input) so a subsequent
     * payment processes against the up-to-date server total. Throws on failure.
     */
    const saveDeliveryPendingIfAny = async () => {
        if (orderId === null) return;
        if (optimisticDelivery !== null) {
            const result = await toggleDeliveryMutation.mutateAsync({ orderId, homeDelivery: optimisticDelivery });
            if (result.status === "error") throw new Error(result.message);
        }
        const pending = chargeInputRef.current === "" ? 0 : Number(chargeInputRef.current);
        if (isHomeDelivery && !isNaN(pending) && pending >= 0
            && Math.abs(pending - serverDeliveryCharge) > 0.0005) {
            setOptimisticChargeOverride(pending);
            const result = await updateChargeMutation.mutateAsync({ orderId, deliveryCharge: pending });
            if (result.status === "error") {
                setOptimisticChargeOverride(null);
                throw new Error(result.message);
            }
        }
    };

    return {
        isHomeDelivery,
        chargeInput,
        setChargeInput,
        optimisticDeliveryCharge,
        isAnyPending,
        setOptimisticDelivery,
        toggleDeliveryPending: toggleDeliveryMutation.isPending,
        saveDeliveryPendingIfAny,
        reset,
    };
}
