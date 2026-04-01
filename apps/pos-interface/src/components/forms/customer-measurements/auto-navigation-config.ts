import type { Path } from "react-hook-form";
import type { CustomerMeasurementsSchema } from "./measurement-form.schema";

/**
 * Auto-navigation sequence for electric tape measurement input.
 * These fields will auto-focus in order when Enter is pressed.
 * Sequence defined by the client (values 1-18 in the measuring order).
 */
export const AUTO_NAVIGATION_FIELDS: ReadonlyArray<Path<CustomerMeasurementsSchema>> = [
  "chest_full",                  // 1  — Round chest
  "shoulder",                    // 2  — Shoulder
  "sleeve_length",               // 3  — Sleeve length
  "sleeve_width",                // 4  — Sleeve width
  "elbow",                       // 5  — Elbow
  "armhole_front",               // 6  — Armhole front
  "chest_upper",                 // 7  — Upper chest
  "chest_front",                 // 8  — Front chest
  "waist_front",                 // 9  — Front waist
  "top_pocket_distance",         // 10 — Distance to front pocket
  "jabzour_length",              // 11 — Jabzour length
  "length_front",                // 12 — Front length
  "bottom",                      // 13 — Bottom
  "collar_width",                // 14 — Collar width
  "collar_height",               // 15 — Collar height
  "chest_back",                  // 16 — Back chest
  "waist_back",                  // 17 — Back waist
  "length_back",                 // 18 — Back length
] as const;
