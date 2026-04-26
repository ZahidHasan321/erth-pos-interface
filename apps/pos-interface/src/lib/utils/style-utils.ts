import type { Style } from "@repo/database";
import { type StyleOptionsSchema } from "@/components/forms/fabric-selection-and-options/style-options/style-options-form.schema";
import { type GarmentSchema } from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";

/**
 * Build a lookup map from styles: code -> rate_per_item
 * Falls back to image_url for rows not yet migrated.
 */
function buildStylePriceMap(styles: Style[]): Map<string, number> {
    const map = new Map<string, number>();
    styles.forEach((s) => {
        const key = s.code ?? s.image_url;
        if (key) {
            map.set(key, Number(s.rate_per_item) || 0);
        }
    });
    return map;
}

/** Normalizes thickness values to safe code suffixes: "NO HASHWA" → "NO_HASHWA" */
function thicknessCode(thickness: string): string {
    return thickness.replace(/\s+/g, "_");
}

/**
 * Calculate the total price for style options based on selected codes from GarmentSchema
 */
export function calculateGarmentStylePrice(
    garment: GarmentSchema,
    styles: Style[]
): number {
    if (!styles || styles.length === 0) {
        return 0;
    }

    const priceMap = buildStylePriceMap(styles);

    // Designer style edge case: Use DB price (usually 6)
    if (garment.style === "design") return priceMap.get("STY_DESIGNER") || 6;

    // Qallabi collar edge case: flat DB price (usually 5), ignore all other options
    if (garment.collar_type === "COL_QALLABI") return priceMap.get("COL_QALLABI") || 5;

    let total = 0;

    // Lines
    if (garment.lines === 1) {
        total += priceMap.get("STY_LINE") || 0;
    } else if (garment.lines === 2) {
        total += (priceMap.get("STY_LINE") || 0) + (priceMap.get("STY_LINE_2") || 0);
    }

    // Collar Type
    if (garment.collar_type) {
        total += priceMap.get(garment.collar_type) || 0;
    }

    // Collar Button
    if (garment.collar_button) {
        total += priceMap.get(garment.collar_button) || 0;
    }

    // Jabzour type + thickness
    if (garment.jabzour_1) {
        total += priceMap.get(garment.jabzour_1) || 0;
    }
    if (garment.jabzour_thickness) {
        total += priceMap.get(`JAB_THICKNESS_${thicknessCode(garment.jabzour_thickness)}`) || 0;
    }

    // Front pocket type + thickness
    if (garment.front_pocket_type) {
        total += priceMap.get(garment.front_pocket_type) || 0;
    }
    if (garment.front_pocket_thickness) {
        total += priceMap.get(`FRO_THICKNESS_${thicknessCode(garment.front_pocket_thickness)}`) || 0;
    }

    // Cuffs type + thickness
    if (garment.cuffs_type) {
        total += priceMap.get(garment.cuffs_type) || 0;
    }
    if (garment.cuffs_thickness) {
        total += priceMap.get(`CUF_THICKNESS_${thicknessCode(garment.cuffs_thickness)}`) || 0;
    }

    return total;
}

/**
 * Generate a hash string from style options for comparison
 * Excludes style_option_id, garment_id, and extra_amount as they're not part of the style definition
 */
function generateStyleHash(styleOptions: StyleOptionsSchema): string {
    const relevantFields = {
        style: styleOptions.style,
        lines: styleOptions.lines,
        collar: styleOptions.collar,
        jabzour: styleOptions.jabzour,
        front_pocket: styleOptions.front_pocket,
        accessories: styleOptions.accessories,
        cuffs: styleOptions.cuffs,
    };
    return JSON.stringify(relevantFields);
}

/**
 * Compare two style options to check if they're identical
 * @param style1 - First style option
 * @param style2 - Second style option
 * @returns true if styles are identical (excluding IDs and amounts)
 */
export function areStylesIdentical(
    style1: StyleOptionsSchema,
    style2: StyleOptionsSchema
): boolean {
    return generateStyleHash(style1) === generateStyleHash(style2);
}

/**
 * Assign matching style option IDs to rows with identical styles
 * @param styleOptions - Array of all style options
 * @returns Array of style options with updated style_option_id values
 */
export function assignMatchingStyleIds(
    styleOptions: StyleOptionsSchema[]
): StyleOptionsSchema[] {
    // Safety check for empty or invalid arrays
    if (!styleOptions || styleOptions.length === 0) {
        return styleOptions;
    }

    const styleGroups = new Map<string, string>(); // hash -> assigned ID
    let nextStyleId = 1;

    return styleOptions.map((style) => {
        // Skip if style is undefined or null
        if (!style) {
            return style;
        }

        const hash = generateStyleHash(style);

        if (!styleGroups.has(hash)) {
            // First occurrence of this style - assign new ID
            styleGroups.set(hash, `S-${nextStyleId}`);
            nextStyleId++;
        }

        return {
            ...style,
            style_option_id: styleGroups.get(hash),
        };
    });
}

/**
 * Calculate the total price for style options based on selected codes
 * @param styleOptions - The style options data for a single row
 * @param styles - The array of all available styles from the styles table
 * @returns The total price calculated from rate_per_item for all selected styles
 */
export function calculateStylePrice(
    styleOptions: StyleOptionsSchema,
    styles: Style[]
): number {
    if (!styles || styles.length === 0) {
        return 0;
    }

    const priceMap = buildStylePriceMap(styles);

    // Designer style edge case: Use DB price (usually 6)
    if (styleOptions.style === "design") return priceMap.get("STY_DESIGNER") || 6;

    // Qallabi collar edge case: flat DB price (usually 5), ignore all other options
    if (styleOptions.collar?.collar_type === "COL_QALLABI") return priceMap.get("COL_QALLABI") || 5;

    let total = 0;

    // Style (kuwaiti or design)
    if (styleOptions.style === "kuwaiti") {
        total += priceMap.get("STY_KUWAITI") || 0;
    }

    // Lines (add line price for each checked line)
    if (styleOptions.lines?.line1) {
        total += priceMap.get("STY_LINE") || 0;
    }
    if (styleOptions.lines?.line2) {
        total += priceMap.get("STY_LINE_2") || 0;
    }

    // Collar Type
    if (styleOptions.collar?.collar_type) {
        total += priceMap.get(styleOptions.collar.collar_type) || 0;
    }

    // Collar Button
    if (styleOptions.collar?.collar_button) {
        total += priceMap.get(styleOptions.collar.collar_button) || 0;
    }

    // Small Tabaggi
    if (styleOptions.collar?.small_tabaggi) {
        total += priceMap.get("COL_SMALL_TABBAGI") || 0;
    }

    // Jabzour type + thickness
    if (styleOptions.jabzour?.jabzour_1) {
        total += priceMap.get(styleOptions.jabzour.jabzour_1) || 0;
    }
    if (styleOptions.jabzour?.jabzour_thickness) {
        total += priceMap.get(`JAB_THICKNESS_${thicknessCode(styleOptions.jabzour.jabzour_thickness)}`) || 0;
    }

    // Front pocket type + thickness
    if (styleOptions.front_pocket?.front_pocket_type) {
        total += priceMap.get(styleOptions.front_pocket.front_pocket_type) || 0;
    }
    if (styleOptions.front_pocket?.front_pocket_thickness) {
        total += priceMap.get(`FRO_THICKNESS_${thicknessCode(styleOptions.front_pocket.front_pocket_thickness)}`) || 0;
    }

    // Cuffs type + thickness
    if (styleOptions.cuffs?.cuffs_type) {
        total += priceMap.get(styleOptions.cuffs.cuffs_type) || 0;
    }
    if (styleOptions.cuffs?.cuffs_thickness) {
        total += priceMap.get(`CUF_THICKNESS_${thicknessCode(styleOptions.cuffs.cuffs_thickness)}`) || 0;
    }

    return total;
}
