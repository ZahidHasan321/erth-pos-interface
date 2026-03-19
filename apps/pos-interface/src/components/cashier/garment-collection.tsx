import { useState } from "react";
import { CheckCircle2, AlertTriangle, Truck, Package, Shirt, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PIECE_STAGE_LABELS, PIECE_STAGE_COLORS, LOCATION_LABELS } from "@/lib/constants";
import { useCollectGarmentsMutation } from "@/hooks/useCashier";
import type { Garment } from "@repo/database";

interface GarmentCollectionProps {
    garments: Garment[];
    orderId: number;
    remainingBalance: number;
}

function isEligibleForCollection(g: Garment): boolean {
    return (
        g.location === "shop" &&
        (g.piece_stage === "ready_for_pickup" || g.piece_stage === "brova_trialed" || g.piece_stage === "awaiting_trial")
    );
}

const STAGE_COLOR_MAP: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    green: "bg-green-100 text-green-700 border-green-200",
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
    red: "bg-red-100 text-red-700 border-red-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
};

function getStageBadgeClass(stage: string | null): string {
    if (!stage) return STAGE_COLOR_MAP.gray;
    const color = PIECE_STAGE_COLORS[stage as keyof typeof PIECE_STAGE_COLORS] || "gray";
    return STAGE_COLOR_MAP[color] || STAGE_COLOR_MAP.gray;
}

export function GarmentCollection({ garments, orderId, remainingBalance }: GarmentCollectionProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [fulfillmentType, setFulfillmentType] = useState<"collected" | "delivered">("collected");
    const [updateHomeDelivery, setUpdateHomeDelivery] = useState(false);
    const collectMutation = useCollectGarmentsMutation();

    const eligibleGarments = garments.filter(isEligibleForCollection);
    const hasEligible = eligibleGarments.length > 0;

    const toggleGarment = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === eligibleGarments.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(eligibleGarments.map((g) => g.id)));
        }
    };

    const handleCollect = () => {
        if (selectedIds.size === 0) return;
        collectMutation.mutate({
            orderId,
            garmentIds: Array.from(selectedIds),
            fulfillmentType,
            updateHomeDelivery,
            homeDelivery: fulfillmentType === "delivered",
        }, {
            onSuccess: (response) => {
                if (response.status === "success") {
                    setSelectedIds(new Set());
                }
            }
        });
    };

    const brovaCount = garments.filter((g) => g.garment_type === "brova").length;
    const finalCount = garments.length - brovaCount;

    const renderGarmentCard = (g: Garment) => {
        const eligible = isEligibleForCollection(g);
        const isBrova = g.garment_type === "brova";
        const stageLabel = g.piece_stage
            ? PIECE_STAGE_LABELS[g.piece_stage as keyof typeof PIECE_STAGE_LABELS] || g.piece_stage
            : "Unknown";
        const locationLabel = g.location
            ? LOCATION_LABELS[g.location as keyof typeof LOCATION_LABELS] || g.location
            : "Unknown";
        const fabricData = (g as any).fabric;

        return (
            <div
                key={g.id}
                className={`relative rounded-lg border p-3 transition-all ${
                    eligible ? "bg-background hover:bg-accent/30" : "bg-muted/40 opacity-60"
                } ${selectedIds.has(g.id) ? "border-primary ring-2 ring-primary/20" : ""}`}
            >
                <div className="flex items-start gap-3">
                    <Checkbox
                        checked={selectedIds.has(g.id)}
                        onCheckedChange={() => toggleGarment(g.id)}
                        disabled={!eligible}
                        className="mt-1"
                        aria-label="Select garment"
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Row 1: ID + Type + Stage */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm tabular-nums">
                                {g.garment_id || g.id.slice(0, 8)}
                            </span>
                            <Badge
                                variant="outline"
                                className={`text-xs font-semibold ${
                                    isBrova
                                        ? "bg-amber-50 text-amber-700 border-amber-300"
                                        : "bg-blue-50 text-blue-700 border-blue-300"
                                }`}
                            >
                                {isBrova ? (
                                    <><Scissors className="h-3 w-3 mr-1" aria-hidden="true" />Brova (Trial)</>
                                ) : (
                                    <><Shirt className="h-3 w-3 mr-1" aria-hidden="true" />Final</>
                                )}
                            </Badge>
                            <Badge
                                variant="outline"
                                className={`text-xs ${getStageBadgeClass(g.piece_stage)}`}
                            >
                                {stageLabel}
                            </Badge>
                            {g.piece_stage === "completed" && (
                                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
                            )}
                        </div>

                        {/* Row 2: Fabric + Location */}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {fabricData?.name && (
                                <span>
                                    <span className="font-medium text-foreground">{fabricData.name}</span>
                                    {fabricData.code && <span className="ml-1">({fabricData.code})</span>}
                                </span>
                            )}
                            <span>{locationLabel}</span>
                            {g.fabric_source && (
                                <span>{g.fabric_source === "IN" ? "In-house" : "Customer fabric"}</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {remainingBalance > 0 && (
                <Alert variant="destructive" className="bg-amber-50 border-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                        Outstanding balance: <strong>{remainingBalance.toFixed(3)} KD</strong>.
                        Collection is still allowed but payment should be settled.
                    </AlertDescription>
                </Alert>
            )}

            {/* Select All */}
            {hasEligible && (
                <div className="flex items-center justify-between pb-2 border-b">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            checked={selectedIds.size === eligibleGarments.length && eligibleGarments.length > 0}
                            onCheckedChange={toggleAll}
                            aria-label="Select all garments"
                        />
                        <span className="text-sm font-medium">
                            Select All Eligible ({eligibleGarments.length})
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Scissors className="h-3 w-3" aria-hidden="true" /> Brova: {brovaCount}
                        </span>
                        <span className="flex items-center gap-1">
                            <Shirt className="h-3 w-3" aria-hidden="true" /> Final: {finalCount}
                        </span>
                    </div>
                </div>
            )}

            {/* Garment Cards */}
            <div className="space-y-2">
                {garments.map(renderGarmentCard)}
            </div>

            {/* Collection Controls */}
            {hasEligible && (
                <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center gap-4">
                        <Label className="text-sm">Fulfillment:</Label>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant={fulfillmentType === "collected" ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                    setFulfillmentType("collected");
                                    setUpdateHomeDelivery(true);
                                }}
                            >
                                <Package className="h-3.5 w-3.5 mr-1" />
                                Collect
                            </Button>
                            <Button
                                type="button"
                                variant={fulfillmentType === "delivered" ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                    setFulfillmentType("delivered");
                                    setUpdateHomeDelivery(true);
                                }}
                            >
                                <Truck className="h-3.5 w-3.5 mr-1" />
                                Deliver
                            </Button>
                        </div>
                    </div>

                    {fulfillmentType === "delivered" && (
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={updateHomeDelivery}
                                onCheckedChange={setUpdateHomeDelivery}
                                id="update-delivery"
                            />
                            <Label htmlFor="update-delivery" className="text-sm">
                                Update delivery charge on order
                            </Label>
                        </div>
                    )}

                    <Button
                        onClick={handleCollect}
                        disabled={selectedIds.size === 0 || collectMutation.isPending}
                        className="w-full"
                    >
                        {collectMutation.isPending
                            ? "Processing..."
                            : `Collect ${selectedIds.size} Garment${selectedIds.size !== 1 ? "s" : ""}`}
                    </Button>
                </div>
            )}

            {!hasEligible && garments.length > 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                    No garments are currently eligible for collection.
                </div>
            )}
        </div>
    );
}
