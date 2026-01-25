import type { Garment, JabzourType } from "@repo/database";
import { type GarmentSchema } from "./garment-form.schema";

/**
 * Direct mapping from Garment (DB) to Form Values
 */
export function mapGarmentToFormValues(g: Garment): GarmentSchema {
    const parseNumeric = (val: any) => {
        if (val === null || val === undefined) return 0;
        const parsed = typeof val === 'string' ? parseFloat(val) : val;
        return isNaN(parsed) ? 0 : parsed;
    };

    // Transform Jabzour fields from backend to frontend
    let frontendJabzour1 = g.jabzour_1 as string | undefined;
    let frontendJabzour2 = g.jabzour_2;

    if (g.jabzour_1 === "ZIPPER") {
        frontendJabzour1 = "JAB_SHAAB";
    } else if (g.jabzour_1 === "BUTTON") {
        frontendJabzour1 = g.jabzour_2 || undefined;
        frontendJabzour2 = null;
    }

    return {
        id: g.id,
        garment_id: g.garment_id,
        order_id: g.order_id,
        fabric_id: g.fabric_id,
        style_id: g.style_id,
        style: g.style || 'kuwaiti',
        measurement_id: g.measurement_id,
        fabric_source: g.fabric_source,
        fabric_length: parseNumeric(g.fabric_length),
        quantity: g.quantity || 1,
        collar_type: g.collar_type,
        collar_button: g.collar_button,
        cuffs_type: g.cuffs_type,
        cuffs_thickness: g.cuffs_thickness,
        front_pocket_type: g.front_pocket_type,
        front_pocket_thickness: g.front_pocket_thickness,
        wallet_pocket: g.wallet_pocket,
        pen_holder: g.pen_holder,
        small_tabaggi: g.small_tabaggi,
        jabzour_1: frontendJabzour1,
        jabzour_2: frontendJabzour2,
        jabzour_thickness: g.jabzour_thickness,
        notes: g.notes,
        express: g.express,
        brova: g.brova,
        piece_stage: g.piece_stage as any,
        delivery_date: g.delivery_date ? new Date(g.delivery_date).toISOString() : undefined,
        lines: g.lines,
        color: g.color || "",
        shop_name: g.shop_name || "",
        home_delivery: g.home_delivery ?? false,
        fabric_amount: parseNumeric(g.fabric_price_snapshot),
        stitching_price_snapshot: parseNumeric(g.stitching_price_snapshot),
        style_price_snapshot: parseNumeric(g.style_price_snapshot),
    };
}

/**
 * Direct mapping from Form Values to Garment (DB)
 */
export function mapFormValuesToGarment(
    formValues: GarmentSchema, 
    orderId: number,
    snapshots?: {
        fabric_price_snapshot?: number;
        stitching_price_snapshot?: number;
        style_price_snapshot?: number;
    }
): Partial<Garment> {
    const { fabric_amount, ...rest } = formValues;
    
    // Transform Jabzour fields from frontend to backend
    let backendJabzour1 = formValues.jabzour_1;
    let backendJabzour2 = formValues.jabzour_2;

    if (formValues.jabzour_1 === "JAB_SHAAB") {
        backendJabzour1 = "ZIPPER";
    } else if (formValues.jabzour_1 && formValues.jabzour_1 !== "JAB_SHAAB") {
        backendJabzour1 = "BUTTON";
        backendJabzour2 = formValues.jabzour_1; 
    }

    const garment: Partial<Garment> = {
        ...rest,
        order_id: orderId,
        jabzour_1: backendJabzour1 as JabzourType,
        jabzour_2: backendJabzour2,
        fabric_price_snapshot: snapshots?.fabric_price_snapshot ?? fabric_amount,
        stitching_price_snapshot: snapshots?.stitching_price_snapshot ?? formValues.stitching_price_snapshot,
        style_price_snapshot: snapshots?.style_price_snapshot ?? formValues.style_price_snapshot,
        delivery_date: formValues.delivery_date ? new Date(formValues.delivery_date) : undefined,
    };

    // Clean up any fields that shouldn't be in the DB record or need conversion
    delete (garment as any).fabric_amount;

    return garment;
}
