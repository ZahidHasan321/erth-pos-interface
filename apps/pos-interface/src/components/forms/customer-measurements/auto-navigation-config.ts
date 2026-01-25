import type { Path } from "react-hook-form";
import type { CustomerMeasurementsSchema } from "./measurement-form.schema";

/**
 * Auto-navigation sequence for electric tape measurement input
 * These fields will auto-focus in order when Enter is pressed
 */
export const AUTO_NAVIGATION_FIELDS: ReadonlyArray<Path<CustomerMeasurementsSchema>> = [
  "body.full_chest.value",      // Round chest
  "arm.shoulder",                // Shoulder
  "arm.sleeve_length",            // Sleeve length
  "arm.sleeve_width",             // Sleeve bottom
  "arm.elbow",                   // Elbow
  "arm.armhole.value",           // Armhole
  "body.upper_chest",            // Upper chest
  "body.full_waist.front",       // Front waist
  "top_pocket.distance",          // Distance to f pocket
  "jabzour.length",              // Jabzour length
  "lengths.front",               // Front length
  "body.bottom",                 // Bottom
  "body.back_chest",             // Back chest
  "body.full_waist.back",        // Back waist
  "lengths.back",                // Back length
  "collar.width",                // Collar
  "collar.height",               // Collar height
] as const;
