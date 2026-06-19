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

export type AlterationStyleVal = string | boolean | number;

export interface AlterationChange {
    field: string;
    label: string;
    value: string;
    kind: "measurement" | "style";
}

// Plain-language labels for the changed style fields. Mirrors the on-screen
// change recap (AlterationChangeSummary) so the printed invoice reads the same.
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
// mean "no change" (false / blank) so they never surface as a line.
function styleValueText(field: string, v: AlterationStyleVal): string | null {
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

/**
 * Flatten a garment's sparse alteration_measurements + alteration_styles maps
 * into a single labelled change list ("new value only", no baseline), matching
 * what the order-taker saw at intake. Used by the cashier alteration invoice.
 */
export function formatAlterationChanges(
    measurements: Record<string, unknown> | null | undefined,
    styles: Record<string, unknown> | null | undefined,
): AlterationChange[] {
    const measurementChanges: AlterationChange[] = Object.entries(measurements ?? {})
        .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
        .map(([field, v]) => ({ field, label: getLabel(field), value: String(v), kind: "measurement" as const }));

    const styleChanges: AlterationChange[] = [];
    for (const [field, v] of Object.entries(styles ?? {})) {
        const value = styleValueText(field, v as AlterationStyleVal);
        if (value === null) continue;
        styleChanges.push({ field, label: STYLE_LABEL[field] ?? field, value, kind: "style" });
    }

    return [...measurementChanges, ...styleChanges];
}
