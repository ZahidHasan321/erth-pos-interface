import { useState, useMemo, useCallback } from "react";
import { Checkbox } from "@repo/ui/checkbox";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Minus, Plus } from "lucide-react";
import type { RefundItem } from "@/api/cashier";

interface GarmentData {
    id: string;
    garment_id?: string;
    garment_type?: string;
    express?: boolean;
    soaking?: boolean;
    fabric_price_snapshot?: string | number | null;
    stitching_price_snapshot?: string | number | null;
    style_price_snapshot?: string | number | null;
    refunded_fabric?: boolean;
    refunded_stitching?: boolean;
    refunded_style?: boolean;
    refunded_express?: boolean;
    refunded_soaking?: boolean;
}

interface ShelfItemData {
    id: number;
    shelf_id: number;
    quantity: number;
    unit_price?: string | number | null;
    refunded_qty?: number;
    shelf?: { type?: string };
}

// Per-garment: which price components are selected for refund
interface GarmentRefundSelection {
    fabric: boolean;
    stitching: boolean;
    style: boolean;
    express: boolean;
    soaking: boolean;
}

// Per-shelf-item: how many units to refund
interface ShelfRefundSelection {
    quantity: number;
}

interface RefundItemSelectorProps {
    garments: GarmentData[];
    shelfItems: ShelfItemData[];
    expressSurcharge: number;
    soakingPrice: number;
    totalPaid?: number;
    onRefundItemsChange: (items: RefundItem[], total: number) => void;
}

const num = (v: string | number | null | undefined): number => Number(v) || 0;
const fmt = (n: number): string => Number(n.toFixed(3)).toString();

export function RefundItemSelector({ garments, shelfItems, expressSurcharge, soakingPrice, totalPaid, onRefundItemsChange }: RefundItemSelectorProps) {
    const [garmentSelections, setGarmentSelections] = useState<Record<string, GarmentRefundSelection>>({});
    const [shelfSelections, setShelfSelections] = useState<Record<number, ShelfRefundSelection>>({});

    type Component = "fabric" | "stitching" | "style" | "express" | "soaking";

    const getGarmentPrice = useCallback((g: GarmentData, component: Component): number => {
        switch (component) {
            case "fabric": return num(g.fabric_price_snapshot);
            case "stitching": return num(g.stitching_price_snapshot);
            case "style": return num(g.style_price_snapshot);
            case "express": return g.express ? expressSurcharge : 0;
            case "soaking": return g.soaking ? soakingPrice : 0;
        }
    }, [expressSurcharge, soakingPrice]);


    const isComponentRefunded = useCallback((g: GarmentData, component: Component): boolean => {
        switch (component) {
            case "fabric": return !!g.refunded_fabric;
            case "stitching": return !!g.refunded_stitching;
            case "style": return !!g.refunded_style;
            case "express": return !!g.refunded_express;
            case "soaking": return !!g.refunded_soaking;
        }
    }, []);

    // Compute refund items + total whenever selections change
    const { refundTotal } = useMemo(() => {
        const items: RefundItem[] = [];
        let total = 0;

        for (const g of garments) {
            const sel = garmentSelections[g.id];
            if (!sel || (!sel.fabric && !sel.stitching && !sel.style && !sel.express && !sel.soaking)) continue;
            let amount = 0;
            if (sel.fabric) amount += getGarmentPrice(g, "fabric");
            if (sel.stitching) amount += getGarmentPrice(g, "stitching");
            if (sel.style) amount += getGarmentPrice(g, "style");
            if (sel.express) amount += getGarmentPrice(g, "express");
            if (sel.soaking) amount += getGarmentPrice(g, "soaking");
            items.push({
                garment_id: g.id,
                fabric: sel.fabric, stitching: sel.stitching, style: sel.style,
                express: sel.express, soaking: sel.soaking,
                amount,
            });
            total += amount;
        }

        for (const s of shelfItems) {
            const sel = shelfSelections[s.id];
            if (!sel || sel.quantity <= 0) continue;
            const amount = sel.quantity * num(s.unit_price);
            items.push({
                shelf_item_id: s.id,
                quantity: sel.quantity,
                amount,
            });
            total += amount;
        }

        return { refundItems: items, refundTotal: total };
    }, [garments, shelfItems, garmentSelections, shelfSelections, getGarmentPrice]);

    // Notify parent of changes
    const notifyChange = useCallback((
        nextGarment: Record<string, GarmentRefundSelection>,
        nextShelf: Record<number, ShelfRefundSelection>
    ) => {
        const items: RefundItem[] = [];
        let total = 0;

        for (const g of garments) {
            const sel = nextGarment[g.id];
            if (!sel || (!sel.fabric && !sel.stitching && !sel.style && !sel.express && !sel.soaking)) continue;
            let amount = 0;
            if (sel.fabric) amount += getGarmentPrice(g, "fabric");
            if (sel.stitching) amount += getGarmentPrice(g, "stitching");
            if (sel.style) amount += getGarmentPrice(g, "style");
            if (sel.express) amount += getGarmentPrice(g, "express");
            if (sel.soaking) amount += getGarmentPrice(g, "soaking");
            items.push({ garment_id: g.id, fabric: sel.fabric, stitching: sel.stitching, style: sel.style, express: sel.express, soaking: sel.soaking, amount });
            total += amount;
        }

        for (const s of shelfItems) {
            const sel = nextShelf[s.id];
            if (!sel || sel.quantity <= 0) continue;
            const amount = sel.quantity * num(s.unit_price);
            items.push({ shelf_item_id: s.id, quantity: sel.quantity, amount });
            total += amount;
        }

        onRefundItemsChange(items, total);
    }, [garments, shelfItems, getGarmentPrice, onRefundItemsChange]);

    const toggleGarmentComponent = (garmentId: string, component: Component) => {
        setGarmentSelections(prev => {
            const current = prev[garmentId] || { fabric: false, stitching: false, style: false, express: false, soaking: false };
            const next = { ...prev, [garmentId]: { ...current, [component]: !current[component] } };
            notifyChange(next, shelfSelections);
            return next;
        });
    };

    const isAvailable = (g: GarmentData, c: Component) => !isComponentRefunded(g, c) && getGarmentPrice(g, c) > 0;

    const toggleAllGarmentComponents = (garmentId: string, garment: GarmentData) => {
        setGarmentSelections(prev => {
            const current = prev[garmentId] || { fabric: false, stitching: false, style: false, express: false, soaking: false };
            const avail = { fabric: isAvailable(garment, "fabric"), stitching: isAvailable(garment, "stitching"), style: isAvailable(garment, "style"), express: isAvailable(garment, "express"), soaking: isAvailable(garment, "soaking") };
            const allSelected = Object.keys(avail).every(k => !avail[k as Component] || current[k as Component]);
            const next = {
                ...prev,
                [garmentId]: {
                    fabric: allSelected ? false : avail.fabric,
                    stitching: allSelected ? false : avail.stitching,
                    style: allSelected ? false : avail.style,
                    express: allSelected ? false : avail.express,
                    soaking: allSelected ? false : avail.soaking,
                },
            };
            notifyChange(next, shelfSelections);
            return next;
        });
    };

    const setShelfQty = (shelfItemId: number, qty: number) => {
        setShelfSelections(prev => {
            const next = { ...prev, [shelfItemId]: { quantity: qty } };
            notifyChange(garmentSelections, next);
            return next;
        });
    };

    const hasGarments = garments.length > 0;
    const hasShelfItems = shelfItems.length > 0;

    // Check if all refundable items are selected
    const allComponents: Component[] = ["fabric", "stitching", "style", "express", "soaking"];
    const isFullyRefundedGarment = (g: GarmentData) => allComponents.every(c => isComponentRefunded(g, c) || getGarmentPrice(g, c) === 0);
    const refundableGarments = garments.filter(g => !isFullyRefundedGarment(g));
    const refundableShelfItems = shelfItems.filter(s => (s.quantity || 1) - (s.refunded_qty || 0) > 0);
    const hasRefundable = refundableGarments.length > 0 || refundableShelfItems.length > 0;

    const isAllSelected = hasRefundable && refundableGarments.every(g => {
        const sel = garmentSelections[g.id];
        if (!sel) return false;
        return allComponents.every(c => !isAvailable(g, c) || sel[c]);
    }) && refundableShelfItems.every(s => {
        const sel = shelfSelections[s.id];
        return sel && sel.quantity >= (s.quantity || 1) - (s.refunded_qty || 0);
    });

    const toggleSelectAll = () => {
        if (isAllSelected) {
            const nextG: Record<string, GarmentRefundSelection> = {};
            const nextS: Record<number, ShelfRefundSelection> = {};
            setGarmentSelections(nextG);
            setShelfSelections(nextS);
            notifyChange(nextG, nextS);
        } else {
            const nextG: Record<string, GarmentRefundSelection> = {};
            for (const g of refundableGarments) {
                nextG[g.id] = {
                    fabric: isAvailable(g, "fabric"), stitching: isAvailable(g, "stitching"),
                    style: isAvailable(g, "style"), express: isAvailable(g, "express"),
                    soaking: isAvailable(g, "soaking"),
                };
            }
            const nextS: Record<number, ShelfRefundSelection> = {};
            for (const s of refundableShelfItems) {
                nextS[s.id] = { quantity: (s.quantity || 1) - (s.refunded_qty || 0) };
            }
            setGarmentSelections(nextG);
            setShelfSelections(nextS);
            notifyChange(nextG, nextS);
        }
    };

    return (
        <div className="space-y-3">
            {/* Select All */}
            {hasRefundable && (
                <div className="flex items-center justify-between pb-2 border-b border-red-200">
                    <label role="button" onClick={toggleSelectAll} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                            checked={isAllSelected}
                            onCheckedChange={toggleSelectAll}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Select all for refund"
                        />
                        <span className="text-sm font-medium">Select All</span>
                    </label>
                    {refundTotal > 0 && (
                        <span className="text-xs font-bold text-red-600 tabular-nums">{fmt(refundTotal)} KWD</span>
                    )}
                </div>
            )}

            {hasGarments && (
                <div className="space-y-1.5">
                    {garments.map(g => {
                        const sel = garmentSelections[g.id] || { fabric: false, stitching: false, style: false, express: false, soaking: false };
                        const isBrova = g.garment_type === "brova";
                        const selectedAmount = allComponents.reduce((sum, c) => sum + (sel[c] ? getGarmentPrice(g, c) : 0), 0);
                        const fullyRefunded = isFullyRefundedGarment(g);
                        const hasAnySelection = allComponents.some(c => sel[c]);

                        if (fullyRefunded) {
                            return (
                                <div key={g.id} className="rounded-lg border p-2.5 bg-muted/30 opacity-50">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-xs tabular-nums">{g.garment_id || g.id.slice(0, 8)}</span>
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{isBrova ? "Brova" : "Final"}</Badge>
                                        <span className="ml-auto text-xs text-muted-foreground">Fully refunded</span>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div
                                key={g.id}
                                className={`rounded-lg border p-2.5 transition-all ${hasAnySelection ? "bg-red-50 border-red-300" : "bg-card"}`}
                            >
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        checked={hasAnySelection}
                                        onCheckedChange={() => toggleAllGarmentComponents(g.id, g)}
                                        aria-label="Select all components"
                                    />
                                    <span className="font-semibold text-xs tabular-nums">{g.garment_id || g.id.slice(0, 8)}</span>
                                    <Badge
                                        variant="outline"
                                        className={`text-[10px] px-1.5 py-0 font-semibold ${isBrova ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-blue-50 text-blue-700 border-blue-300"}`}
                                    >
                                        {isBrova ? "Brova" : "Final"}
                                    </Badge>
                                    <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
                                        {([
                                            ["fabric", "Fabric", getGarmentPrice(g, "fabric"), isComponentRefunded(g, "fabric")],
                                            ["stitching", "Stitching", getGarmentPrice(g, "stitching"), isComponentRefunded(g, "stitching")],
                                            ["style", "Style", getGarmentPrice(g, "style"), isComponentRefunded(g, "style")],
                                            ...(g.express ? [["express", "Express", getGarmentPrice(g, "express"), isComponentRefunded(g, "express")] as const] : []),
                                            ...(g.soaking ? [["soaking", "Soaking", getGarmentPrice(g, "soaking"), isComponentRefunded(g, "soaking")] as const] : []),
                                        ] as const).map(([key, label, price, alreadyRefunded]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                disabled={alreadyRefunded}
                                                onClick={() => !alreadyRefunded && toggleGarmentComponent(g.id, key)}
                                                className={`text-[11px] px-2 py-1 rounded-md border transition-all cursor-pointer ${
                                                    alreadyRefunded
                                                        ? "bg-muted/50 text-muted-foreground border-muted line-through cursor-not-allowed opacity-50"
                                                        : sel[key]
                                                            ? "bg-red-100 text-red-700 border-red-300 font-semibold"
                                                            : "bg-muted/30 text-muted-foreground border-border hover:border-red-300 hover:bg-red-50"
                                                }`}
                                            >
                                                {label}{price > 0 ? ` ${fmt(price)}` : ""}
                                                {alreadyRefunded && " (refunded)"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {hasAnySelection && (
                                    <div className="mt-1.5 text-right text-xs font-semibold text-red-600 tabular-nums">
                                        Refund: {fmt(selectedAmount)} KWD
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {hasShelfItems && (
                <div className="space-y-1.5">
                    {shelfItems.map(s => {
                        const unitPrice = num(s.unit_price);
                        const totalQty = s.quantity || 1;
                        const alreadyRefunded = s.refunded_qty || 0;
                        const refundable = totalQty - alreadyRefunded;
                        const sel = shelfSelections[s.id];
                        const selectedQty = sel?.quantity || 0;
                        const selectedAmount = selectedQty * unitPrice;

                        if (refundable <= 0) {
                            return (
                                <div key={s.id} className="rounded-lg border p-2.5 bg-muted/30 opacity-50">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-sm">{s.shelf?.type || `Item #${s.shelf_id}`}</span>
                                        <span className="ml-auto text-xs text-muted-foreground">Fully refunded</span>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div
                                key={s.id}
                                className={`rounded-lg border p-2.5 transition-all ${selectedQty > 0 ? "bg-red-50 border-red-300" : "bg-card"}`}
                            >
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <span className="font-medium text-sm">{s.shelf?.type || `Item #${s.shelf_id}`}</span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                            {fmt(unitPrice)} KWD x{totalQty}
                                            {alreadyRefunded > 0 && <span className="text-red-500 ml-1">({alreadyRefunded} refunded)</span>}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 w-7 p-0"
                                            disabled={selectedQty <= 0}
                                            onClick={() => setShelfQty(s.id, Math.max(0, selectedQty - 1))}
                                        >
                                            <Minus className="h-3 w-3" />
                                        </Button>
                                        <span className={`text-sm font-bold tabular-nums w-6 text-center ${selectedQty > 0 ? "text-red-600" : ""}`}>
                                            {selectedQty}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 w-7 p-0"
                                            disabled={selectedQty >= refundable}
                                            onClick={() => setShelfQty(s.id, Math.min(refundable, selectedQty + 1))}
                                        >
                                            <Plus className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                                {selectedQty > 0 && (
                                    <div className="mt-1 text-xs font-semibold text-red-600 tabular-nums">
                                        Refund: {fmt(selectedAmount)} KWD
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {refundTotal > 0 && (
                <div className="pt-2 border-t border-red-200 space-y-1">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-red-700">Selected refund total</span>
                        <span className="text-sm font-bold text-red-700 tabular-nums">{fmt(refundTotal)} KWD</span>
                    </div>
                    {totalPaid !== undefined && refundTotal > totalPaid && (
                        <p className="text-[11px] text-red-600 font-medium">Exceeds total paid ({fmt(totalPaid)} KWD) — amount will need to be adjusted</p>
                    )}
                </div>
            )}
        </div>
    );
}
