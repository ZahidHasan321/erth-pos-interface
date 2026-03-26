import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { Garment } from "@repo/database";

interface GarmentCollectionProps {
    garments: Garment[];
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    onToggleAll: () => void;
}

function isEligibleForCollection(g: Garment): boolean {
    return (
        g.location === "shop" &&
        (g.piece_stage === "ready_for_pickup" || g.piece_stage === "brova_trialed" || g.piece_stage === "awaiting_trial")
    );
}

// Cashier-friendly status: Ready / In Production / Completed / In Transit
function getCashierStatus(g: Garment): { label: string; color: string } {
    if (g.piece_stage === "completed") return { label: "Completed", color: "bg-slate-100 text-slate-600" };
    if (g.location === "shop" && (g.piece_stage === "ready_for_pickup" || g.piece_stage === "brova_trialed" || g.piece_stage === "awaiting_trial"))
        return { label: "Ready", color: "bg-emerald-100 text-emerald-700" };
    if (g.location === "transit_to_shop")
        return { label: "In Transit", color: "bg-blue-100 text-blue-700" };
    return { label: "In Production", color: "bg-amber-100 text-amber-700" };
}

export function GarmentCollection({ garments, selectedIds, onToggle, onToggleAll }: GarmentCollectionProps) {
    const eligibleGarments = garments.filter(isEligibleForCollection);
    const hasEligible = eligibleGarments.length > 0;

    const renderGarmentCard = (g: Garment) => {
        const eligible = isEligibleForCollection(g);
        const isCompleted = g.piece_stage === "completed";
        const isBrova = g.garment_type === "brova";
        const status = getCashierStatus(g);
        const fabricData = (g as any).fabric;
        const isSelected = selectedIds.has(g.id);

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
                          ? "bg-emerald-50 border-emerald-300 hover:border-emerald-400 cursor-pointer active:scale-[0.99]"
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
                        {fabricData?.name && (
                            <span className="text-xs text-muted-foreground truncate">{fabricData.name}</span>
                        )}
                    </div>
                    {isCompleted && g.fulfillment_type ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 bg-slate-100 text-slate-600">
                            Collected
                        </span>
                    ) : (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${status.color}`}>
                            {status.label}
                        </span>
                    )}
                </div>
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
