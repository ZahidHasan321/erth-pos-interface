import { Badge } from "@repo/ui/badge";
import { Checkbox } from "@repo/ui/checkbox";
import type { Garment } from "@repo/database";

interface GarmentCollectionProps {
    garments: Garment[];
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onToggleAll: () => void;
    fulfillmentModes: Map<string, "collected" | "delivered">;
    onFulfillmentModeChange: (id: string, mode: "collected" | "delivered") => void;
    isHomeDelivery?: boolean;
}

function isEligibleForCollection(g: Garment): boolean {
    return (
        g.location === "shop" &&
        (g.piece_stage === "ready_for_pickup" || g.piece_stage === "brova_trialed" || g.piece_stage === "awaiting_trial")
    );
}

// Cashier-friendly status: Ready / Pending / In Production / Completed / In Transit
function getCashierStatus(g: Garment): { label: string; color: string } {
    if (g.piece_stage === "completed") return { label: "Completed", color: "bg-slate-100 text-slate-600" };
    if (g.location === "shop" && (g.piece_stage === "ready_for_pickup" || g.piece_stage === "brova_trialed" || g.piece_stage === "awaiting_trial"))
        return { label: "Ready", color: "bg-emerald-100 text-emerald-700" };
    if (g.location === "shop" && (g.piece_stage === "waiting_cut" || g.piece_stage === "waiting_for_acceptance"))
        return { label: "Pending", color: "bg-gray-100 text-gray-600" };
    if (g.location === "transit_to_shop")
        return { label: "In Transit", color: "bg-blue-100 text-blue-700" };
    return { label: "In Production", color: "bg-amber-100 text-amber-700" };
}

export function GarmentCollection({ garments, selectedIds, onToggle, onToggleAll, fulfillmentModes, onFulfillmentModeChange, isHomeDelivery }: GarmentCollectionProps) {
    const eligibleGarments = garments.filter(isEligibleForCollection);
    const hasEligible = eligibleGarments.length > 0;

    const renderGarmentCard = (g: Garment) => {
        const eligible = isEligibleForCollection(g);
        const isCompleted = g.piece_stage === "completed";
        const isBrova = g.garment_type === "brova";
        const status = getCashierStatus(g);
        const fabricData = (g as any).fabric;
        const isSelected = selectedIds.has(g.id);
        const fulfillmentMode = fulfillmentModes.get(g.id);

        return (
            <div
                key={g.id}
                role="button"
                tabIndex={eligible ? 0 : -1}
                onClick={() => { if (eligible) onToggle(g.id); }}
                onKeyDown={(e) => { if (eligible && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onToggle(g.id); } }}
                className={`w-full text-left relative rounded-lg border p-2.5 transition-all ${
                    isCompleted
                        ? "bg-muted/30 border-muted opacity-40"
                        : eligible
                          ? "bg-emerald-50 border-emerald-300 hover:border-emerald-400 cursor-pointer pointer-coarse:active:scale-[0.99]"
                          : "bg-muted/20 border-border opacity-50"
                } ${isSelected ? "ring-2 ring-primary ring-offset-0 border-primary !bg-primary/5" : ""}`}
            >
                <div className="flex items-center gap-2.5">
                    {eligible ? (
                        <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => onToggle(g.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0"
                            aria-label="Select garment"
                        />
                    ) : (
                        <div className="w-4 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="font-semibold text-xs tabular-nums shrink-0">
                            {g.garment_id || g.id.slice(0, 8)}
                        </span>
                        <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 font-semibold ${
                                isBrova
                                    ? "bg-amber-50 text-amber-700 border-amber-300"
                                    : "bg-blue-50 text-blue-700 border-blue-300"
                            }`}
                        >
                            {isBrova ? "Brova" : "Final"}
                        </Badge>
                        {g.express && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold bg-red-50 text-red-700 border-red-300">
                                Express
                            </Badge>
                        )}
                        {g.soaking && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold bg-cyan-50 text-cyan-700 border-cyan-300">
                                Soaking{(g as any).soaking_hours ? ` ${(g as any).soaking_hours}h` : ""}
                            </Badge>
                        )}
                        {fabricData?.name ? (
                            <span className="text-xs text-muted-foreground truncate">{fabricData.name}</span>
                        ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold bg-slate-50 text-slate-600 border-slate-300">
                                Fabric Out
                            </Badge>
                        )}
                    </div>
                    {isCompleted && g.fulfillment_type ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${g.fulfillment_type === "delivered" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                            {g.fulfillment_type === "delivered" ? "Delivered" : "Collected"}
                        </span>
                    ) : (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${status.color}`}>
                            {status.label}
                        </span>
                    )}
                </div>
                {eligible && (
                    <div className="mt-2 ml-6 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => {
                                if (!isSelected) onToggle(g.id);
                                onFulfillmentModeChange(g.id, "collected");
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-colors ${
                                isSelected && fulfillmentMode === "collected"
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-white text-foreground border-slate-400 hover:border-primary"
                            }`}
                        >
                            Collect
                        </button>
                        {isHomeDelivery && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (!isSelected) onToggle(g.id);
                                    onFulfillmentModeChange(g.id, "delivered");
                                }}
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-colors ${
                                    isSelected && fulfillmentMode === "delivered"
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-white text-foreground border-slate-400 hover:border-primary"
                                }`}
                            >
                                Deliver
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-3">

            {/* Select All */}
            {hasEligible && (
                <div className="flex items-center justify-between pb-2 border-b">
                    <label role="button" onClick={onToggleAll} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                            checked={selectedIds.size === eligibleGarments.length && eligibleGarments.length > 0}
                            onCheckedChange={onToggleAll}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Select all garments"
                        />
                        <span className="text-sm font-medium">
                            Select All Ready ({eligibleGarments.length})
                        </span>
                    </label>
                    {selectedIds.size > 0 && (
                        <span className="text-xs text-primary font-medium tabular-nums">
                            {selectedIds.size} selected
                        </span>
                    )}
                </div>
            )}

            {/* Garment Cards */}
            <div className="space-y-1.5">
                {garments.map(renderGarmentCard)}
            </div>

        </div>
    );
}
