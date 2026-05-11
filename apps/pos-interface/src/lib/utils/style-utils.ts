import type { Style, StylePricingRule } from "@repo/database";
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

/** garment.style enum → style code in styles/rules tables */
const STYLE_BASE_CODE: Record<string, string> = {
    kuwaiti: "STY_KUWAITI",
    design: "STY_DESIGNER",
};

/**
 * Build rule lookup: code -> highest-priority active rule.
 * Used by the override engine.
 */
function buildRuleMap(rules: StylePricingRule[] | undefined): Map<string, StylePricingRule> {
    const map = new Map<string, StylePricingRule>();
    for (const r of rules ?? []) {
        if (!r.active) continue;
        const existing = map.get(r.style_code);
        if (!existing || r.priority > existing.priority) {
            map.set(r.style_code, r);
        }
    }
    return map;
}

/**
 * Apply flat_override rules to a set of selected style codes.
 * Returns the flat rate if any selected code has a matching active flat_override rule
 * (highest priority wins). Returns null when no override applies — caller sums additively.
 *
 * Fallback when flat_rate is missing on the rule row: use priceMap (styles.rate_per_item).
 */
function evaluateFlatOverride(
    codes: string[],
    ruleMap: Map<string, StylePricingRule>,
    priceMap: Map<string, number>,
): number | null {
    let best: { priority: number; rate: number } | null = null;
    for (const code of codes) {
        const rule = ruleMap.get(code);
        if (!rule || rule.rule_type !== "flat_override") continue;
        const rate = rule.flat_rate != null
            ? Number(rule.flat_rate)
            : (priceMap.get(code) ?? 0);
        if (!best || rule.priority > best.priority) {
            best = { priority: rule.priority, rate };
        }
    }
    return best ? best.rate : null;
}

function collectGarmentStyleCodes(garment: GarmentSchema): string[] {
    const codes: string[] = [];
    if (garment.style && STYLE_BASE_CODE[garment.style]) {
        codes.push(STYLE_BASE_CODE[garment.style]);
    }
    if (garment.lines === 1) codes.push("STY_LINE");
    if (garment.lines === 2) codes.push("STY_LINE", "STY_LINE_2");
    if (garment.collar_type) codes.push(garment.collar_type);
    if (garment.collar_button) codes.push(garment.collar_button);
    if (garment.jabzour_1) codes.push(garment.jabzour_1);
    if (garment.jabzour_thickness) {
        codes.push(`JAB_THICKNESS_${thicknessCode(garment.jabzour_thickness)}`);
    }
    if (garment.front_pocket_type) codes.push(garment.front_pocket_type);
    if (garment.front_pocket_thickness) {
        codes.push(`FRO_THICKNESS_${thicknessCode(garment.front_pocket_thickness)}`);
    }
    if (garment.cuffs_type) codes.push(garment.cuffs_type);
    if (garment.cuffs_thickness) {
        codes.push(`CUF_THICKNESS_${thicknessCode(garment.cuffs_thickness)}`);
    }
    return codes;
}

function collectStyleOptionCodes(opts: StyleOptionsSchema): string[] {
    const codes: string[] = [];
    if (opts.style && STYLE_BASE_CODE[opts.style]) {
        codes.push(STYLE_BASE_CODE[opts.style]);
    }
    if (opts.lines?.line1) codes.push("STY_LINE");
    if (opts.lines?.line2) codes.push("STY_LINE_2");
    if (opts.collar?.collar_type) codes.push(opts.collar.collar_type);
    if (opts.collar?.collar_button) codes.push(opts.collar.collar_button);
    if (opts.collar?.small_tabaggi) codes.push("COL_SMALL_TABBAGI");
    if (opts.jabzour?.jabzour_1) codes.push(opts.jabzour.jabzour_1);
    if (opts.jabzour?.jabzour_thickness) {
        codes.push(`JAB_THICKNESS_${thicknessCode(opts.jabzour.jabzour_thickness)}`);
    }
    if (opts.front_pocket?.front_pocket_type) codes.push(opts.front_pocket.front_pocket_type);
    if (opts.front_pocket?.front_pocket_thickness) {
        codes.push(`FRO_THICKNESS_${thicknessCode(opts.front_pocket.front_pocket_thickness)}`);
    }
    if (opts.cuffs?.cuffs_type) codes.push(opts.cuffs.cuffs_type);
    if (opts.cuffs?.cuffs_thickness) {
        codes.push(`CUF_THICKNESS_${thicknessCode(opts.cuffs.cuffs_thickness)}`);
    }
    return codes;
}

/**
 * Calculate the total price for style options based on selected codes from GarmentSchema.
 *
 * Rules engine:
 * - If any selected code has an active `flat_override` rule, return that flat rate
 *   (highest priority wins). Style options are wiped — stitching/express/etc are
 *   added separately by the caller.
 * - Otherwise sum additively from `styles.rate_per_item`.
 */
export function calculateGarmentStylePrice(
    garment: GarmentSchema,
    styles: Style[],
    rules?: StylePricingRule[],
): number {
    if (!styles || styles.length === 0) {
        return 0;
    }

    const priceMap = buildStylePriceMap(styles);
    const ruleMap = buildRuleMap(rules);
    const codes = collectGarmentStyleCodes(garment);

    const override = evaluateFlatOverride(codes, ruleMap, priceMap);
    if (override !== null) return override;

    let total = 0;

    if (garment.lines === 1) {
        total += priceMap.get("STY_LINE") || 0;
    } else if (garment.lines === 2) {
        total += (priceMap.get("STY_LINE") || 0) + (priceMap.get("STY_LINE_2") || 0);
    }

    if (garment.collar_type) {
        total += priceMap.get(garment.collar_type) || 0;
    }
    if (garment.collar_button) {
        total += priceMap.get(garment.collar_button) || 0;
    }

    if (garment.jabzour_1) {
        total += priceMap.get(garment.jabzour_1) || 0;
    }
    if (garment.jabzour_thickness) {
        total += priceMap.get(`JAB_THICKNESS_${thicknessCode(garment.jabzour_thickness)}`) || 0;
    }

    if (garment.front_pocket_type) {
        total += priceMap.get(garment.front_pocket_type) || 0;
    }
    if (garment.front_pocket_thickness) {
        total += priceMap.get(`FRO_THICKNESS_${thicknessCode(garment.front_pocket_thickness)}`) || 0;
    }

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
    if (!styleOptions || styleOptions.length === 0) {
        return styleOptions;
    }

    const styleGroups = new Map<string, string>();
    let nextStyleId = 1;

    return styleOptions.map((style) => {
        if (!style) {
            return style;
        }

        const hash = generateStyleHash(style);

        if (!styleGroups.has(hash)) {
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
 * Calculate total price for a single StyleOptionsSchema row, using the same
 * rules engine as `calculateGarmentStylePrice`.
 */
export function calculateStylePrice(
    styleOptions: StyleOptionsSchema,
    styles: Style[],
    rules?: StylePricingRule[],
): number {
    if (!styles || styles.length === 0) {
        return 0;
    }

    const priceMap = buildStylePriceMap(styles);
    const ruleMap = buildRuleMap(rules);
    const codes = collectStyleOptionCodes(styleOptions);

    const override = evaluateFlatOverride(codes, ruleMap, priceMap);
    if (override !== null) return override;

    let total = 0;

    if (styleOptions.style === "kuwaiti") {
        total += priceMap.get("STY_KUWAITI") || 0;
    }

    if (styleOptions.lines?.line1) {
        total += priceMap.get("STY_LINE") || 0;
    }
    if (styleOptions.lines?.line2) {
        total += priceMap.get("STY_LINE_2") || 0;
    }

    if (styleOptions.collar?.collar_type) {
        total += priceMap.get(styleOptions.collar.collar_type) || 0;
    }

    if (styleOptions.collar?.collar_button) {
        total += priceMap.get(styleOptions.collar.collar_button) || 0;
    }

    if (styleOptions.collar?.small_tabaggi) {
        total += priceMap.get("COL_SMALL_TABBAGI") || 0;
    }

    if (styleOptions.jabzour?.jabzour_1) {
        total += priceMap.get(styleOptions.jabzour.jabzour_1) || 0;
    }
    if (styleOptions.jabzour?.jabzour_thickness) {
        total += priceMap.get(`JAB_THICKNESS_${thicknessCode(styleOptions.jabzour.jabzour_thickness)}`) || 0;
    }

    if (styleOptions.front_pocket?.front_pocket_type) {
        total += priceMap.get(styleOptions.front_pocket.front_pocket_type) || 0;
    }
    if (styleOptions.front_pocket?.front_pocket_thickness) {
        total += priceMap.get(`FRO_THICKNESS_${thicknessCode(styleOptions.front_pocket.front_pocket_thickness)}`) || 0;
    }

    if (styleOptions.cuffs?.cuffs_type) {
        total += priceMap.get(styleOptions.cuffs.cuffs_type) || 0;
    }
    if (styleOptions.cuffs?.cuffs_thickness) {
        total += priceMap.get(`CUF_THICKNESS_${thicknessCode(styleOptions.cuffs.cuffs_thickness)}`) || 0;
    }

    return total;
}
