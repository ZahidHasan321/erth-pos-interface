import type { AlterationMeasurementField, AlterationStyleField } from "./alteration-form.schema";

export const MEASUREMENT_FIELD_LABELS: Record<AlterationMeasurementField, string> = {
    collar_width: "Collar Width",
    collar_height: "Collar Height",
    shoulder: "Shoulder",
    armhole: "Armhole",
    chest_upper: "Upper Chest",
    chest_full: "Full Chest",
    chest_front: "Front Chest",
    chest_back: "Back Chest",
    sleeve_length: "Sleeve Length",
    sleeve_width: "Sleeve Width",
    elbow: "Elbow",
    armhole_front: "Armhole Front",
    top_pocket_length: "Top Pkt Len",
    top_pocket_width: "Top Pkt W",
    top_pocket_distance: "Top Pkt Dist",
    side_pocket_length: "Side Pkt Len",
    side_pocket_width: "Side Pkt W",
    side_pocket_distance: "Side Pkt Dist",
    side_pocket_opening: "Side Pkt Open",
    waist_full: "Full Waist",
    waist_front: "Front Waist",
    waist_back: "Back Waist",
    length_front: "Front Length",
    length_back: "Back Length",
    bottom: "Bottom",
    jabzour_width: "Jabzour W",
    jabzour_length: "Jabzour Len",
    collar_length: "Collar Length",
    second_button_distance: "2nd Button Dist",
    basma_length: "Basma Len",
    basma_width: "Basma W",
    basma_sleeve_length: "Basma Sleeve L",
    sleeve_hemming: "Sleeve Hem",
    bottom_hemming: "Bottom Hem",
    pen_pocket_length: "Pen Pkt Len",
    pen_pocket_width: "Pen Pkt W",
};

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
