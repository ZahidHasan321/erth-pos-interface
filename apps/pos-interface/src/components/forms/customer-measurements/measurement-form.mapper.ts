import type { Measurement } from "@repo/database";
import { type CustomerMeasurementsSchema } from "./measurement-form.schema";

/**
 * Direct mapping from Measurement (DB) to Form Values
 */
export function mapMeasurementToFormValues(measurement: Measurement): CustomerMeasurementsSchema {
  return {
    id: measurement.id,
    measurement_id: measurement.measurement_id || measurement.id, 
    type: measurement.type || "Body",
    reference: measurement.reference || "Other",
    measurer_id: measurement.measurer_id || "",
    measurement_date: measurement.measurement_date ? new Date(measurement.measurement_date).toISOString() : new Date().toISOString(),
    notes: measurement.notes || "",
    collar_width: measurement.collar_width ?? 0,
    collar_height: measurement.collar_height ?? 0,
    length_front: measurement.length_front ?? 0,
    length_back: measurement.length_back ?? 0,
    shoulder: measurement.shoulder ?? 0,
    sleeve_length: measurement.sleeve_length ?? 0,
    sleeve_width: measurement.sleeve_width ?? 0,
    elbow: measurement.elbow ?? 0,
    armhole: measurement.armhole ?? 0,
    armhole_front: measurement.armhole_front ?? 0,
    armhole_provision: measurement.armhole_provision ?? 0,
    chest_upper: measurement.chest_upper ?? 0,
    chest_back: measurement.chest_back ?? 0,
    chest_full: measurement.chest_full ?? 0,
    chest_front: measurement.chest_front ?? 0,
    chest_provision: measurement.chest_provision ?? 0,
    waist_full: measurement.waist_full ?? 0,
    waist_front: measurement.waist_front ?? 0,
    waist_back: measurement.waist_back ?? 0,
    waist_provision: measurement.waist_provision ?? 0,
    bottom: measurement.bottom ?? 0,
    top_pocket_length: measurement.top_pocket_length ?? 0,
    top_pocket_width: measurement.top_pocket_width ?? 0,
    top_pocket_distance: measurement.top_pocket_distance ?? 0,
    side_pocket_length: measurement.side_pocket_length ?? 0,
    side_pocket_width: measurement.side_pocket_width ?? 0,
    side_pocket_distance: measurement.side_pocket_distance ?? 0,
    side_pocket_opening: measurement.side_pocket_opening ?? 0,
    jabzour_length: measurement.jabzour_length ?? 0,
    jabzour_width: measurement.jabzour_width ?? 0,
  };
}

/**
 * Direct mapping from Form Values to Measurement (DB)
 */
export function mapFormValuesToMeasurement(formValues: CustomerMeasurementsSchema, customerId: string | number): Partial<Measurement> {
  return {
    customer_id: Number(customerId),
    measurement_id: formValues.measurement_id,
    type: formValues.type,
    reference: formValues.reference,
    measurer_id: formValues.measurer_id || undefined,
    measurement_date: formValues.measurement_date ? new Date(formValues.measurement_date) : undefined,
    notes: formValues.notes,
    collar_width: formValues.collar_width,
    collar_height: formValues.collar_height,
    length_front: formValues.length_front,
    length_back: formValues.length_back,
    shoulder: formValues.shoulder,
    sleeve_length: formValues.sleeve_length,
    sleeve_width: formValues.sleeve_width,
    elbow: formValues.elbow,
    armhole: formValues.armhole,
    armhole_front: formValues.armhole_front,
    armhole_provision: formValues.armhole_provision,
    chest_upper: formValues.chest_upper,
    chest_full: formValues.chest_full,
    chest_front: formValues.chest_front,
    chest_back: formValues.chest_back,
    chest_provision: formValues.chest_provision,
    waist_full: formValues.waist_full,
    waist_front: formValues.waist_front,
    waist_back: formValues.waist_back,
    waist_provision: formValues.waist_provision,
    bottom: formValues.bottom,
    top_pocket_length: formValues.top_pocket_length,
    top_pocket_width: formValues.top_pocket_width,
    top_pocket_distance: formValues.top_pocket_distance,
    side_pocket_length: formValues.side_pocket_length,
    side_pocket_width: formValues.side_pocket_width,
    side_pocket_distance: formValues.side_pocket_distance,
    side_pocket_opening: formValues.side_pocket_opening,
    jabzour_length: formValues.jabzour_length,
    jabzour_width: formValues.jabzour_width,
  };
}
