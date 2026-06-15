import * as React from "react";
import { ChevronDown } from "lucide-react";

import { getLabel, ALL_MEASUREMENT_KEYS } from "@repo/database";
import {
    collarButtons,
    collarTypes,
    cuffTypes,
    jabzourTypes,
    topPocketTypes,
    type BaseOption,
} from "@/components/forms/fabric-selection-and-options/constants";
import type { PriorGarmentForLink } from "@/api/alteration-orders";

// Map a stored style code to its human label using the shared option arrays.
function optionLabel(options: BaseOption[], code: string | null | undefined): string | null {
    if (!code) return null;
    return options.find((o) => o.value === code)?.displayText ?? code;
}

type SpecRow = { label: string; value: string };

function styleRows(prior: PriorGarmentForLink): SpecRow[] {
    const rows: SpecRow[] = [];
    const push = (label: string, value: string | null) => {
        if (value) rows.push({ label, value });
    };

    push("Collar Type", optionLabel(collarTypes, prior.collar_type));
    push("Collar Button", optionLabel(collarButtons, prior.collar_button));
    push("Collar Thickness", prior.collar_thickness);
    push("Cuffs Type", optionLabel(cuffTypes, prior.cuffs_type));
    push("Cuffs Thickness", prior.cuffs_thickness);
    push("Front Pocket Type", optionLabel(topPocketTypes, prior.front_pocket_type));
    push("Front Pocket Thickness", prior.front_pocket_thickness);
    push("Jabzour 1", optionLabel(jabzourTypes, prior.jabzour_1));
    push("Jabzour 2", optionLabel(jabzourTypes, prior.jabzour_2));
    push("Jabzour Thickness", prior.jabzour_thickness);
    push("Lines", prior.lines != null ? String(prior.lines) : null);
    if (prior.wallet_pocket) push("Wallet Pocket", "Yes");
    if (prior.pen_holder) push("Pen Holder", "Yes");
    if (prior.mobile_pocket) push("Mobile Pocket", "Yes");
    if (prior.small_tabaggi) push("Small Tabaggi", "Yes");

    return rows;
}

function measurementRows(prior: PriorGarmentForLink): SpecRow[] {
    const m = prior.measurement;
    if (!m) return [];
    const rows: SpecRow[] = [];
    for (const key of ALL_MEASUREMENT_KEYS) {
        const v = (m as Record<string, unknown>)[key];
        if (typeof v === "number") {
            rows.push({ label: getLabel(key), value: String(v) });
        }
    }
    // collar_position is a categorical body measurement (absence = Standard).
    rows.push({ label: "Collar Position", value: m.collar_position ? m.collar_position.toUpperCase() : "Standard" });
    return rows;
}

/**
 * Collapsible, read-only reference of the source garment's current spec. Shown
 * for internal alterations so staff can see existing values while deciding what
 * to change. This is a reference only and never mixes into the change grids.
 */
export function OriginalSpecPanel({ prior }: { prior: PriorGarmentForLink }) {
    const [open, setOpen] = React.useState(false);

    const styles = styleRows(prior);
    const measurements = measurementRows(prior);
    const hasAny = styles.length > 0 || measurements.length > 0;

    return (
        <div className="rounded-md border border-slate-200 bg-white">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
                <span className="text-sm font-medium text-slate-700">
                    Original spec (reference only)
                </span>
                <ChevronDown
                    className={
                        "size-4 text-slate-500 transition-transform " + (open ? "rotate-180" : "")
                    }
                />
            </button>

            {open && (
                <div className="space-y-4 border-t border-slate-200 px-3 py-3">
                    {!hasAny && (
                        <p className="text-sm text-slate-500">
                            No measurement or style detail recorded on the original garment.
                        </p>
                    )}

                    {measurements.length > 0 && (
                        <div>
                            <h5 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Measurements
                            </h5>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                                {measurements.map((r) => (
                                    <SpecLine key={r.label} label={r.label} value={r.value} />
                                ))}
                            </div>
                        </div>
                    )}

                    {styles.length > 0 && (
                        <div>
                            <h5 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Style Options
                            </h5>
                            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                                {styles.map((r) => (
                                    <SpecLine key={r.label} label={r.label} value={r.value} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SpecLine({ label, value }: SpecRow) {
    return (
        <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-medium tabular-nums text-slate-800">{value}</span>
        </div>
    );
}
