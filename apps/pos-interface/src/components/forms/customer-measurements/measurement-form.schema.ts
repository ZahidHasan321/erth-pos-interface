import { z } from "zod";
import { MEASUREMENTS_SPEC, type MeasurementKey } from "@repo/database";

// Required numeric field — operator must enter a value.
const requiredDecimal = z.number({ message: "Required" });
// Optional numeric field — basma / optional measures may be left blank.
const optionalDecimal = z.number().optional().nullable();

/**
 * Measurement field Zod shape derived from MEASUREMENTS_SPEC. Required vs.
 * optional comes from the spec's `optional` / `basma` flags; both basma and
 * explicitly-optional fields validate as `number | null | undefined`.
 */
const measurementFields = Object.fromEntries(
  MEASUREMENTS_SPEC.map((s) => [
    s.key,
    s.optional || s.basma ? optionalDecimal : requiredDecimal,
  ]),
) as Record<string, z.ZodTypeAny>;

export const customerMeasurementsSchema = z.object({
  id: z.string().uuid().optional(),
  customer_id: z.number().optional(),
  measurer_id: z.string().uuid({ message: "Required" }),
  measurement_id: z.string().optional().nullable(),
  measurement_date: z.string({ message: "Required" }),
  type: z.enum(["Body", "Dishdasha"]),
  reference: z.string({ message: "Required" }),
  notes: z.string().optional().nullable(),

  ...measurementFields,
});

export type CustomerMeasurementsSchema =
  z.infer<typeof customerMeasurementsSchema> &
  { [K in MeasurementKey]?: number | null };

/**
 * Default form values. Required measurement fields stay `undefined` so RHF
 * shows them as empty inputs and validation flags them on submit. Optional
 * fields default to `null` so they round-trip blank cleanly. `jabzour_width`
 * keeps its historical 1.5 seed value.
 */
const measurementDefaults: Record<string, unknown> = Object.fromEntries(
  MEASUREMENTS_SPEC.map((s) => [
    s.key,
    s.optional || s.basma ? null : (undefined as unknown),
  ]),
);
measurementDefaults.jabzour_width = 1.5;

export const customerMeasurementsDefaults: CustomerMeasurementsSchema = {
  measurement_id: "",
  type: undefined as never,
  reference: undefined as never,
  measurer_id: undefined as never,
  measurement_date: new Date().toISOString(),
  notes: "",
  ...measurementDefaults,
} as unknown as CustomerMeasurementsSchema;
