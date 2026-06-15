import { z } from "zod";
import { MEASUREMENTS_SPEC, type MeasurementKey, SHOULDER_SLOPE_VALUES, COLLAR_POSITION_VALUES } from "@repo/database";

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

  // Shoulder slope — categorical body measurement, required (no silent default).
  // Defaults to undefined so the picker shows "not filled" and submit is blocked
  // until the operator picks one of the four shapes.
  shoulder_slope: z.enum(SHOULDER_SLOPE_VALUES, { error: "Pick a shoulder slope" }),
  // Collar position — categorical body measurement, required (no silent default).
  // "standard" is the neutral position and serializes to null in the DB.
  collar_position: z.enum(COLLAR_POSITION_VALUES, { error: "Pick a collar position" }),

  ...measurementFields,
});

export type CustomerMeasurementsSchema =
  z.infer<typeof customerMeasurementsSchema> &
  { [K in MeasurementKey]?: number | null };

/**
 * Default form values. Required measurement fields stay `undefined` so RHF
 * shows them as empty inputs and validation flags them on submit. Optional
 * fields default to `null` so they round-trip blank cleanly. (`jabzour_width`
 * is seeded with its historical 1.5 value only when *creating* a new
 * measurement — see JABZOUR_WIDTH_NEW_DEFAULT — not here, so the empty/
 * read-only view doesn't surface a fabricated value.)
 */
const measurementDefaults: Record<string, unknown> = Object.fromEntries(
  MEASUREMENTS_SPEC.map((s) => [
    s.key,
    s.optional || s.basma ? null : (undefined as unknown),
  ]),
);

/** Historical seed for `jabzour_width`, applied only when creating a new measurement. */
export const JABZOUR_WIDTH_NEW_DEFAULT = 1.5;

export const customerMeasurementsDefaults: CustomerMeasurementsSchema = {
  measurement_id: "",
  type: undefined as never,
  reference: undefined as never,
  measurer_id: undefined as never,
  measurement_date: new Date().toISOString(),
  notes: "",
  shoulder_slope: undefined as never,
  collar_position: undefined as never,
  ...measurementDefaults,
} as unknown as CustomerMeasurementsSchema;
