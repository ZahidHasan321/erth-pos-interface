import { z } from 'zod';

// Decimal field for measurements - accepts number, required
const decimalField = z.number({ 
  message: "Required"
});

export const customerMeasurementsSchema = z.object({
  id: z.string().uuid().optional(),
  customer_id: z.number().optional(),
  measurer_id: z.string().uuid({ message: "Required" }),
  measurement_id: z.string().optional().nullable(),
  measurement_date: z.string({ message: "Required" }),
  type: z.enum(['Body', 'Dishdasha']),
  reference: z.string({ message: "Required" }),
  notes: z.string().optional().nullable(),

  // Collar
  collar_width: decimalField,
  collar_height: decimalField,

  // Shoulder & Arm
  shoulder: decimalField,
  armhole: decimalField,
  armhole_front: decimalField,
  armhole_provision: decimalField,
  sleeve_length: decimalField,
  sleeve_width: decimalField,
  elbow: decimalField,

  // Chest
  chest_upper: decimalField,
  chest_full: decimalField,
  chest_front: decimalField,
  chest_back: decimalField,
  chest_provision: decimalField,

  // Pockets
  top_pocket_length: decimalField,
  top_pocket_width: decimalField,
  top_pocket_distance: decimalField,
  side_pocket_length: decimalField,
  side_pocket_width: decimalField,
  side_pocket_distance: decimalField,
  side_pocket_opening: decimalField,

  // Waist & Length
  waist_full: decimalField,
  waist_front: decimalField,
  waist_back: decimalField,
  waist_provision: decimalField,
  length_front: decimalField,
  length_back: decimalField,
  bottom: decimalField,

  // Jabzour
  jabzour_length: decimalField,
  jabzour_width: decimalField,
});

export type CustomerMeasurementsSchema = z.infer<typeof customerMeasurementsSchema>;

export const customerMeasurementsDefaults: CustomerMeasurementsSchema = {
  measurement_id: '',
  type: undefined as any,
  reference: undefined as any,
  measurer_id: undefined as any,
  measurement_date: new Date().toISOString(),
  notes: '',
  collar_width: undefined as any,
  collar_height: undefined as any,
  shoulder: undefined as any,
  armhole: undefined as any,
  armhole_front: undefined as any,
  armhole_provision: undefined as any,
  sleeve_length: undefined as any,
  sleeve_width: undefined as any,
  elbow: undefined as any,
  chest_upper: undefined as any,
  chest_full: undefined as any,
  chest_front: undefined as any,
  chest_back: undefined as any,
  chest_provision: undefined as any,
  top_pocket_length: undefined as any,
  top_pocket_width: undefined as any,
  top_pocket_distance: undefined as any,
  side_pocket_length: undefined as any,
  side_pocket_width: undefined as any,
  side_pocket_distance: undefined as any,
  side_pocket_opening: undefined as any,
  waist_full: undefined as any,
  waist_front: undefined as any,
  waist_back: undefined as any,
  waist_provision: undefined as any,
  length_front: undefined as any,
  length_back: undefined as any,
  bottom: undefined as any,
  jabzour_length: undefined as any,
  jabzour_width: undefined as any,
};