import type { Path } from "react-hook-form";
import { PDF_ORDERED_KEYS } from "@repo/database";
import type { CustomerMeasurementsSchema } from "./measurement-form.schema";

/**
 * Auto-navigation sequence for electric tape measurement input. Order comes
 * straight from the central measurements spec's `pdfOrder` field (PDF spec
 * sheet 1-18). When the user presses Enter on one input, focus jumps to the
 * next field in this sequence.
 */
export const AUTO_NAVIGATION_FIELDS: ReadonlyArray<
  Path<CustomerMeasurementsSchema>
> = PDF_ORDERED_KEYS as ReadonlyArray<Path<CustomerMeasurementsSchema>>;
