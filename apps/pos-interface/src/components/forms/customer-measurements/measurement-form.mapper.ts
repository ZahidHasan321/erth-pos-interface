import type { Measurement } from "@repo/database";
import { MEASUREMENTS_SPEC } from "@repo/database";
import { type CustomerMeasurementsSchema } from "./measurement-form.schema";

/**
 * DB row → form values. Required numeric fields fall back to 0 (matches the
 * historical behavior — the form treats absent legacy data as zeros).
 * Optional / basma fields preserve null so blanks round-trip cleanly.
 */
export function mapMeasurementToFormValues(
  measurement: Measurement,
): CustomerMeasurementsSchema {
  const measurementValues: Record<string, number | null> = {};
  for (const spec of MEASUREMENTS_SPEC) {
    const raw = (measurement as Record<string, unknown>)[spec.key];
    if (spec.optional || spec.basma) {
      measurementValues[spec.key] = raw == null ? null : Number(raw);
    } else {
      measurementValues[spec.key] = raw == null ? 0 : Number(raw);
    }
  }

  return {
    id: measurement.id,
    measurement_id: measurement.measurement_id || measurement.id,
    type: measurement.type || "Body",
    reference: measurement.reference || "Other",
    measurer_id: measurement.measurer_id || "",
    measurement_date: measurement.measurement_date
      ? new Date(measurement.measurement_date).toISOString()
      : new Date().toISOString(),
    notes: measurement.notes || "",
    // Categorical — pass through as-is; absent legacy rows stay undefined so the
    // required picker flags them on edit (never coerced to a number/zero).
    shoulder_slope: measurement.shoulder_slope ?? undefined,
    ...measurementValues,
  } as CustomerMeasurementsSchema;
}

/** Form values → partial DB row. */
export function mapFormValuesToMeasurement(
  formValues: CustomerMeasurementsSchema,
  customerId: string | number,
): Partial<Measurement> {
  const measurementValues: Record<string, number | null | undefined> = {};
  for (const spec of MEASUREMENTS_SPEC) {
    const raw = (formValues as Record<string, unknown>)[spec.key];
    measurementValues[spec.key] =
      spec.optional || spec.basma
        ? (raw == null ? null : Number(raw))
        : (raw as number | undefined);
  }

  return {
    customer_id: Number(customerId),
    measurement_id: formValues.measurement_id,
    type: formValues.type,
    reference: formValues.reference,
    measurer_id: formValues.measurer_id || undefined,
    measurement_date: formValues.measurement_date
      ? new Date(formValues.measurement_date)
      : new Date(),
    notes: formValues.notes,
    shoulder_slope: formValues.shoulder_slope ?? null,
    ...measurementValues,
  } as Partial<Measurement>;
}
