import type { WorkshopGarment } from "@repo/database";
import type { MeasurementRow } from "@/api/measurements";
import { ALL_MEASUREMENT_KEYS } from "./constants";
import { addGarmentDefaults, type AddGarmentFormValues } from "./schema";

/** Build form values from an existing garment + optional measurement row.
 *  Used in both replacement mode (source = original garment) and blank-add
 *  mode (source = null → pure defaults, measurement may come from customer's
 *  last row). Unknown/absent fields fall through to defaults. */
export function buildPrefillValues(
  source: WorkshopGarment | null,
  measurement: MeasurementRow | null,
): AddGarmentFormValues {
  const base = { ...addGarmentDefaults };

  if (source) {
    base.garment_type = (source.garment_type as "brova" | "final") ?? "final";
    base.delivery_date = source.delivery_date
      ? String(source.delivery_date).slice(0, 10)
      : "";
    base.notes = ""; // intentionally blank — workshop can add fresh context
    base.fabric_source = (source.fabric_source as "IN" | "OUT") ?? "IN";
    base.fabric_id = source.fabric_id ?? null;
    base.shop_name = source.shop_name ?? "";
    base.color = source.color ?? "";
    base.fabric_length = source.fabric_length ? Number(source.fabric_length) : null;
    base.soaking = !!source.soaking;
    base.express = !!source.express;
    base.style = source.style ?? "kuwaiti";
    base.lines = source.lines ?? 1;
    base.collar_type = source.collar_type ?? null;
    base.collar_button = source.collar_button ?? null;
    base.small_tabaggi = !!source.small_tabaggi;
    base.jabzour_1 = (source.jabzour_1 as string | null) ?? null;
    base.jabzour_2 = source.jabzour_2 ?? null;
    base.jabzour_thickness = source.jabzour_thickness ?? null;
    base.front_pocket_type = source.front_pocket_type ?? null;
    base.front_pocket_thickness = source.front_pocket_thickness ?? null;
    base.wallet_pocket = !!source.wallet_pocket;
    base.pen_holder = !!source.pen_holder;
    base.mobile_pocket = !!source.mobile_pocket;
    base.cuffs_type = source.cuffs_type ?? null;
    base.cuffs_thickness = source.cuffs_thickness ?? null;
  }

  const m: Record<string, number | null> = {};
  for (const key of ALL_MEASUREMENT_KEYS) {
    const raw = measurement?.[key];
    m[key] = raw == null || raw === "" ? null : Number(raw);
  }
  base.measurements = m as AddGarmentFormValues["measurements"];

  return base;
}
