import type { Garment, ProductionStage, JabzourType } from "@/types";
import type { FabricSelectionSchema } from "@/components/forms/fabric-selection-and-options/fabric-selection/garment-form.schema";
import type { StyleOptionsSchema } from "@/components/forms/fabric-selection-and-options/style-options/style-options-form.schema";

export function mapApiGarmentToFormGarment(apiGarment: Garment): { fabricSelection: FabricSelectionSchema, styleOptions: StyleOptionsSchema } {
  const fabricSelection: FabricSelectionSchema = {
    id: apiGarment.id,
    order_id: apiGarment.order_id,
    garment_id: apiGarment.garment_id || "",
    piece_stage: apiGarment.piece_stage || "order_at_shop",
    brova: apiGarment.brova ?? false,
    fabric_source: apiGarment.fabric_source || "IN",
    fabric_id: apiGarment.fabric_id,
    shop_name: apiGarment.shop_name || "",
    fabric_length: apiGarment.fabric_length ? Number(apiGarment.fabric_length) : undefined,
    color: apiGarment.color || "",
    measurement_id: apiGarment.measurement_id || "",
    express: apiGarment.express ?? false,
    delivery_date: apiGarment.delivery_date ? new Date(apiGarment.delivery_date).toISOString() : undefined,
    notes: apiGarment.notes || "",
    fabric_amount: apiGarment.fabric_price_snapshot ? Number(apiGarment.fabric_price_snapshot) : 0,
    stitching_price_snapshot: apiGarment.stitching_price_snapshot ? Number(apiGarment.stitching_price_snapshot) : 0,
    style_price_snapshot: apiGarment.style_price_snapshot ? Number(apiGarment.style_price_snapshot) : 0,
    home_delivery: apiGarment.home_delivery ?? false,
    quantity: apiGarment.quantity ?? 1,
    style_id: apiGarment.style_id,
    style: apiGarment.style || 'kuwaiti',
  };

  // Convert API lines to form boolean structure
  const linesValue = apiGarment.lines ?? 1;
  const linesObject = {
    line1: linesValue === 1,
    line2: linesValue === 2,
  };

  // Transform Jabzour fields from backend to frontend
  let frontendJabzour1 = apiGarment.jabzour_1 as string | undefined;
  let frontendJabzour2 = apiGarment.jabzour_2;

  if (apiGarment.jabzour_1 === "ZIPPER") {
    frontendJabzour1 = "JAB_SHAAB";
  } else if (apiGarment.jabzour_1 === "BUTTON") {
    frontendJabzour1 = apiGarment.jabzour_2 || undefined;
    frontendJabzour2 = undefined;
  }

  const styleOptions: StyleOptionsSchema = {
    styleOptionId: "", 
    garmentId: apiGarment.garment_id || "",
    style: apiGarment.style || "kuwaiti",
    lines: linesObject,
    collar: {
      collarType: apiGarment.collar_type || undefined,
      collarButton: apiGarment.collar_button || undefined,
      smallTabaggi: apiGarment.small_tabaggi || false,
    },
    jabzour: {
      jabzour1: frontendJabzour1,
      jabzour2: frontendJabzour2 || undefined,
      jabzour_thickness: apiGarment.jabzour_thickness || undefined,
    },
    frontPocket: {
      front_pocket_type: apiGarment.front_pocket_type || undefined,
      front_pocket_thickness: apiGarment.front_pocket_thickness || undefined,
    },
    accessories: {
      phone: false, 
      wallet: apiGarment.wallet_pocket || false,
      pen_holder: apiGarment.pen_holder || false,
    },
    cuffs: {
      cuffs_type: apiGarment.cuffs_type || undefined,
      cuffs_thickness: apiGarment.cuffs_thickness || undefined,
    },
  };

  return { fabricSelection, styleOptions };
}

export function mapFormGarmentToApiGarment(
  fabricSelection: FabricSelectionSchema,
  styleOptions: StyleOptionsSchema,
  measurementIdMap?: Map<string, string>,
  garmentId?: string
): Partial<Garment> {
  const measurementRecordId = measurementIdMap?.get(fabricSelection.measurement_id || "") || fabricSelection.measurement_id;

  let backendJabzour1 = styleOptions.jabzour?.jabzour1;
  let backendJabzour2 = styleOptions.jabzour?.jabzour2;

  if (styleOptions.jabzour?.jabzour1 === "JAB_SHAAB") {
    backendJabzour1 = "ZIPPER";
  } else if (styleOptions.jabzour?.jabzour1 && styleOptions.jabzour?.jabzour1 !== "JAB_SHAAB") {
    backendJabzour1 = "BUTTON";
    backendJabzour2 = styleOptions.jabzour.jabzour1; 
  }

  const apiGarment: Partial<Garment> = {
      order_id: fabricSelection.order_id,
      garment_id: fabricSelection.garment_id,
      piece_stage: fabricSelection.piece_stage as ProductionStage,
      brova: fabricSelection.brova,
      fabric_source: fabricSelection.fabric_source,
      fabric_id: fabricSelection.fabric_id,
      shop_name: fabricSelection.shop_name,
      fabric_length: fabricSelection.fabric_length,
      color: fabricSelection.color,
      measurement_id: measurementRecordId || undefined,
      express: fabricSelection.express,
      delivery_date: fabricSelection.delivery_date ? new Date(fabricSelection.delivery_date) : undefined,
      notes: fabricSelection.notes,
      home_delivery: fabricSelection.home_delivery,
      quantity: fabricSelection.quantity,
      style_id: fabricSelection.style_id,
      style: fabricSelection.style,
      fabric_price_snapshot: fabricSelection.fabric_amount,
      stitching_price_snapshot: fabricSelection.stitching_price_snapshot,
      style_price_snapshot: fabricSelection.style_price_snapshot,

      lines: styleOptions.lines?.line2 ? 2 : 1,
      collar_type: styleOptions.collar?.collarType,
      collar_button: styleOptions.collar?.collarButton,
      small_tabaggi: styleOptions.collar?.smallTabaggi,
      jabzour_1: backendJabzour1 as JabzourType,
      jabzour_2: backendJabzour2 || undefined,
      jabzour_thickness: styleOptions.jabzour?.jabzour_thickness,
      front_pocket_type: styleOptions.frontPocket?.front_pocket_type,
      front_pocket_thickness: styleOptions.frontPocket?.front_pocket_thickness,
      wallet_pocket: styleOptions.accessories?.wallet,
      pen_holder: styleOptions.accessories?.pen_holder,
      cuffs_type: styleOptions.cuffs?.cuffs_type,
      cuffs_thickness: styleOptions.cuffs?.cuffs_thickness,
  };
  
  if (garmentId || fabricSelection.id) {
    apiGarment.id = (garmentId || fabricSelection.id) as string;
  }
  return apiGarment;
}