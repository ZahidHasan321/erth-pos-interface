import { z } from 'zod';

// Decimal field for measurements - accepts number, nullable
const decimalField = z.number().optional().nullable();

export const customerMeasurementsSchema = z.object({
  id: z.string().uuid().optional(),
  customer_id: z.number().optional(),
  measurer_id: z.string().uuid().optional().nullable(),
  measurement_id: z.string().optional().nullable(),
  measurement_date: z.string().optional().nullable(),
  type: z.enum(['Body', 'Dishdasha']).optional().nullable(),
  reference: z.string().optional().nullable(),
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
  type: 'Body',
  reference: 'Other',
  measurer_id: null,
  measurement_date: new Date().toISOString(),
  notes: '',
  collar_width: 0,
  collar_height: 0,
  shoulder: 0,
  armhole: 0,
  armhole_front: 0,
  armhole_provision: 0,
  sleeve_length: 0,
  sleeve_width: 0,
  elbow: 0,
  chest_upper: 0,
  chest_full: 0,
  chest_front: 0,
  chest_back: 0,
  chest_provision: 0,
  top_pocket_length: 0,
  top_pocket_width: 0,
  top_pocket_distance: 0,
  side_pocket_length: 0,
  side_pocket_width: 0,
  side_pocket_distance: 0,
  side_pocket_opening: 0,
  waist_full: 0,
  waist_front: 0,
  waist_back: 0,
  waist_provision: 0,
  length_front: 0,
  length_back: 0,
  bottom: 0,
  jabzour_length: 0,
  jabzour_width: 0,
};