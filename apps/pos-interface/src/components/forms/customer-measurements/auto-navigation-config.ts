import type { Path } from "react-hook-form";
import type { CustomerMeasurementsSchema } from "./measurement-form.schema";

/**
 * Auto-navigation sequence for electric tape measurement input
 * These fields will auto-focus in order when Enter is pressed
 */
export const AUTO_NAVIGATION_FIELDS: ReadonlyArray<Path<CustomerMeasurementsSchema>> = [
  "chest_full",                  // Round chest
  "shoulder",                    // Shoulder
  "sleeve_length",               // Sleeve length
  "sleeve_width",                // Sleeve bottom
  "elbow",                       // Elbow
  "armhole",                     // Armhole
  "chest_upper",                 // Upper chest
  "waist_front",                 // Front waist
  "top_pocket_distance",         // Distance to f pocket
  "jabzour_length",              // Jabzour length
  "length_front",                // Front length
  "bottom",                      // Bottom
  "chest_back",                  // Back chest
  "waist_back",                  // Back waist
  "length_back",                 // Back length
  "collar_width",                // Collar
  "collar_height",               // Collar height
] as const;
