import type { CustomerMeasurementsSchema } from "@/components/forms/customer-measurements/measurement-form.schema";
import type { Measurement, MeasurementType } from "@/types";

export const mapMeasurementToFormValues = (
  measurement: Measurement,
): CustomerMeasurementsSchema => {
  return {
    measurementRecord: measurement.id,
    measurementID: measurement.measurement_id || "",
    measurementType: (measurement.type as MeasurementType) || "Body",
    measurementReference: measurement.reference || "Other",
    measurementOtherNote: "", // Not explicitly in DB schema, maybe 'notes'? mapping to empty for now or checking if mixed
    measurer: measurement.measurer_id || "",
    measurementDate: measurement.measurement_date ? new Date(measurement.measurement_date) : new Date(),
    notes: measurement.notes || "",
    collar: {
      width: measurement.collar_width || 0,
      height: measurement.collar_height || 0,
    },
    lengths: {
      front: measurement.length_front || 0,
      back: measurement.length_back || 0,
    },
    arm: {
      shoulder: measurement.shoulder || 0,
      sleeveLength: measurement.sleeve_length || 0,
      sleeveWidth: measurement.sleeve_width || 0,
      elbow: measurement.elbow || 0,
      armhole: {
        value: measurement.armhole || 0,
        front: measurement.armhole_front || 0,
        provision: measurement.armhole_provision || 0,
      },
    },
    body: {
      upper_chest: measurement.chest_upper || 0,
      back_chest: measurement.chest_back || 0,
      full_chest: {
        value: measurement.chest_full || 0,
        front: measurement.chest_front || 0,
        provision: measurement.chest_provision || 0,
      },
      full_waist: {
        value: measurement.waist_full || 0,
        front: measurement.waist_front || 0,
        back: measurement.waist_back || 0,
        provision: measurement.waist_provision || 0,
      },
      bottom: measurement.bottom || 0,
    },
    topPocket: {
      length: measurement.top_pocket_length || 0,
      width: measurement.top_pocket_width || 0,
      distance: measurement.top_pocket_distance || 0,
    },
    sidePocket: {
      length: measurement.side_pocket_length || 0,
      width: measurement.side_pocket_width || 0,
      distance: measurement.side_pocket_distance || 0,
      opening: measurement.side_pocket_opening || 0,
    },
    jabzour: {
      length: measurement.jabzour_length || 0,
      width: measurement.jabzour_width || 0,
    },
  };
};

export const mapFormValuesToMeasurement = (
  formValues: CustomerMeasurementsSchema,
  customerId: number,
): Partial<Measurement> => {
  return {
      customer_id: customerId,
      measurement_id: formValues.measurementID,
      type: formValues.measurementType as MeasurementType,
      reference: formValues.measurementReference,
      // ReferenceOtherNote: formValues.measurementOtherNote,
      measurer_id: formValues.measurer || undefined,
      measurement_date: formValues.measurementDate,
      notes: formValues.notes,
      collar_width: formValues.collar.width,
      collar_height: formValues.collar.height,
      length_front: formValues.lengths.front,
      length_back: formValues.lengths.back,
      shoulder: formValues.arm.shoulder,
      sleeve_length: formValues.arm.sleeveLength,
      sleeve_width: formValues.arm.sleeveWidth,
      elbow: formValues.arm.elbow,
      armhole: formValues.arm.armhole.value,
      armhole_front: formValues.arm.armhole.front,
      armhole_provision: formValues.arm.armhole.provision,
      chest_upper: formValues.body.upper_chest,
      chest_full: formValues.body.full_chest.value,
      chest_front: formValues.body.full_chest.front,
      chest_back: formValues.body.back_chest,
      chest_provision: formValues.body.full_chest.provision,
      waist_full: formValues.body.full_waist.value,
      waist_front: formValues.body.full_waist.front,
      waist_back: formValues.body.full_waist.back,
      waist_provision: formValues.body.full_waist.provision,
      bottom: formValues.body.bottom,
      top_pocket_length: formValues.topPocket.length,
      top_pocket_width: formValues.topPocket.width,
      top_pocket_distance: formValues.topPocket.distance,
      side_pocket_length: formValues.sidePocket.length,
      side_pocket_width: formValues.sidePocket.width,
      side_pocket_distance: formValues.sidePocket.distance,
      side_pocket_opening: formValues.sidePocket.opening,
      jabzour_length: formValues.jabzour.length,
      jabzour_width: formValues.jabzour.width,
  };
};
