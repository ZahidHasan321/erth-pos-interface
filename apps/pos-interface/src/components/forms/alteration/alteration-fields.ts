import { getLabel } from "@repo/database";
import type {
    AlterationMeasurementField,
    AlterationStyleField,
} from "./alteration-form.schema";
import { ALTERATION_MEASUREMENT_FIELDS } from "./alteration-form.schema";

/**
 * Display labels for alteration measurement fields. Derived from the central
 * measurements spec so renames stay in sync across the app.
 */
export const MEASUREMENT_FIELD_LABELS: Record<AlterationMeasurementField, string> =
    Object.fromEntries(
        ALTERATION_MEASUREMENT_FIELDS.map((f) => [f, getLabel(f)]),
    ) as Record<AlterationMeasurementField, string>;

type StyleFieldDef = {
    label: string;
    type: "text" | "boolean" | "number";
};

export const STYLE_FIELD_DEFS: Record<AlterationStyleField, StyleFieldDef> = {
    collar_type: { label: "Collar Type", type: "text" },
    collar_button: { label: "Collar Button", type: "text" },
    collar_position: { label: "Collar Position", type: "text" },
    collar_thickness: { label: "Collar Thickness", type: "text" },
    cuffs_type: { label: "Cuffs Type", type: "text" },
    cuffs_thickness: { label: "Cuffs Thickness", type: "text" },
    front_pocket_type: { label: "Front Pocket Type", type: "text" },
    front_pocket_thickness: { label: "Front Pocket Thickness", type: "text" },
    wallet_pocket: { label: "Wallet Pocket", type: "boolean" },
    pen_holder: { label: "Pen Holder", type: "boolean" },
    mobile_pocket: { label: "Mobile Pocket", type: "boolean" },
    small_tabaggi: { label: "Small Tabaggi", type: "boolean" },
    jabzour_1: { label: "Jabzour 1", type: "text" },
    jabzour_2: { label: "Jabzour 2", type: "text" },
    jabzour_thickness: { label: "Jabzour Thickness", type: "text" },
    lines: { label: "Lines", type: "number" },
};
