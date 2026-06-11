import { X } from "lucide-react";

import { getLabel } from "@repo/database";
import {
    collarButtons,
    collarTypes,
    cuffTypes,
    jabzourTypes,
    thicknessOptions,
    topPocketTypes,
    type BaseOption,
} from "@/components/forms/fabric-selection-and-options/constants";

type StyleVal = string | boolean | number;

const STYLE_LABEL: Record<string, string> = {
    collar_type: "Collar Type",
    collar_button: "Collar Button",
    collar_position: "Collar Position",
    collar_thickness: "Collar Thickness",
    cuffs_type: "Cuffs Type",
    cuffs_thickness: "Cuffs Thickness",
    front_pocket_type: "Front Pocket",
    front_pocket_thickness: "Front Pocket Thickness",
    wallet_pocket: "Wallet Pocket",
    pen_holder: "Pen Holder",
    mobile_pocket: "Mobile Pocket",
    small_tabaggi: "Small Tabaggi",
    jabzour_1: "Jabzour",
    jabzour_2: "Jabzour (2nd)",
    jabzour_thickness: "Jabzour Thickness",
    lines: "Lines",
};

const STYLE_PICKER: Record<string, BaseOption[]> = {
    collar_type: collarTypes,
    collar_button: collarButtons,
    cuffs_type: cuffTypes,
    front_pocket_type: topPocketTypes,
    jabzour_1: jabzourTypes,
    jabzour_2: jabzourTypes,
};

// Plain-language value for a changed style field. Returns null for values that
// mean "no change" (false / blank) so they never surface as a chip.
function styleValueText(field: string, v: StyleVal): string | null {
    if (v === false || v === null || v === "" || v === undefined) return null;
    if (typeof v === "boolean") return "Yes";
    const picker = STYLE_PICKER[field];
    if (picker) return picker.find((o) => o.value === v)?.displayText ?? String(v);
    if (field === "collar_position") return v === "up" ? "Up" : v === "down" ? "Down" : String(v);
    if (field.endsWith("_thickness")) {
        return thicknessOptions.find((o) => o.value === v)?.label ?? String(v);
    }
    if (field === "lines") return `${v} line${v === 2 ? "s" : ""}`;
    return String(v);
}

interface Props {
    measurements: Record<string, number>;
    styles: Record<string, StyleVal>;
    onClearMeasurement: (field: string) => void;
    onClearStyle: (field: string) => void;
}

/**
 * Live recap of exactly what is being changed on this garment, in plain
 * language. This is the customer-facing answer to "what are we altering": only
 * the new target values, no baseline. Each chip can be removed to drop that
 * change. Mirrors the sparse alteration_measurements + alteration_styles maps.
 */
export function AlterationChangeSummary({
    measurements,
    styles,
    onClearMeasurement,
    onClearStyle,
}: Props) {
    const measurementChips = Object.entries(measurements)
        .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
        .map(([field, v]) => ({ field, label: getLabel(field), value: String(v) }));

    const styleChips = Object.entries(styles)
        .map(([field, v]) => ({ field, label: STYLE_LABEL[field] ?? field, value: styleValueText(field, v) }))
        .filter((c): c is { field: string; label: string; value: string } => c.value !== null);

    const total = measurementChips.length + styleChips.length;

    return (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-800">Changes for this garment</h4>
                <span
                    className={
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
                        (total > 0 ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600")
                    }
                >
                    {total}
                </span>
            </div>

            {total === 0 ? (
                <p className="text-sm text-slate-500">
                    No changes yet. Use the fields below to record what should change.
                </p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {measurementChips.map((c) => (
                        <Chip
                            key={`m-${c.field}`}
                            label={c.label}
                            value={c.value}
                            tone="measurement"
                            onRemove={() => onClearMeasurement(c.field)}
                        />
                    ))}
                    {styleChips.map((c) => (
                        <Chip
                            key={`s-${c.field}`}
                            label={c.label}
                            value={c.value}
                            tone="style"
                            onRemove={() => onClearStyle(c.field)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function Chip({
    label,
    value,
    tone,
    onRemove,
}: {
    label: string;
    value: string;
    tone: "measurement" | "style";
    onRemove: () => void;
}) {
    const toneClass =
        tone === "measurement"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-slate-200 bg-slate-50 text-slate-700";
    return (
        <span
            className={
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs " + toneClass
            }
        >
            <span className="font-medium">{label}</span>
            <span className="font-semibold tabular-nums">{value}</span>
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${label} change`}
                className="ml-0.5 rounded-sm p-0.5 opacity-60 hover:bg-black/5 hover:opacity-100"
            >
                <X className="size-3" />
            </button>
        </span>
    );
}
