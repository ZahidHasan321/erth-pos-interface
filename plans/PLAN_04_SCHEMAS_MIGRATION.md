# Plan 04: Schemas Migration

## Objective
Update Zod schemas to use snake_case field names matching database.

## Key Principle
Schemas validate what comes from/goes to the database. Database uses snake_case, so schemas use snake_case.

## Tasks

### Task 4.1: Update Work Order Schema

**File:** `apps/pos-interface/src/schemas/work-order-schema.ts`

Change field names from camelCase to snake_case:

```typescript
import { z } from 'zod';

export const orderSchema = z.object({
  id: z.number().optional(),
  invoice_number: z.number().optional(),
  customer_id: z.number(),
  campaign_id: z.number().optional().nullable(),
  order_taker_id: z.string().uuid().optional().nullable(),

  order_date: z.string().optional(),
  delivery_date: z.string().optional().nullable(),

  checkout_status: z.enum(['draft', 'confirmed', 'cancelled']),
  production_stage: z.string().optional().nullable(),
  order_type: z.enum(['WORK', 'SALES']).optional().nullable(),

  payment_type: z.enum(['knet', 'cash', 'link_payment', 'installments', 'others']).optional().nullable(),
  payment_ref_no: z.string().optional().nullable(),
  discount_type: z.enum(['flat', 'referral', 'loyalty', 'by_value']).optional().nullable(),
  discount_value: z.string().optional().nullable(),

  fabric_charge: z.string().default('0'),
  stitching_charge: z.string().default('0'),
  style_charge: z.string().default('0'),
  delivery_charge: z.string().default('0'),
  shelf_charge: z.string().default('0'),

  advance: z.string().default('0'),
  paid: z.string().default('0'),
  order_total: z.string().default('0'),

  num_of_fabrics: z.number().optional().nullable(),
  home_delivery: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});

export type OrderSchema = z.infer<typeof orderSchema>;
```

### Task 4.2: Update Customer Demographics Schema

**File:** `apps/pos-interface/src/components/forms/customer-demographics/schema.ts`

```typescript
import { z } from 'zod';

export const customerDemographicsSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  nick_name: z.string().optional().nullable(),
  arabic_name: z.string().optional().nullable(),
  arabic_nickname: z.string().optional().nullable(),
  country_code: z.string().optional().nullable(),
  alternate_mobile: z.string().optional().nullable(),
  whatsapp: z.boolean().default(false),
  email: z.string().email().optional().nullable().or(z.literal('')),
  insta_id: z.string().optional().nullable(),

  // Address
  city: z.string().optional().nullable(),
  block: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  house_no: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  address_note: z.string().optional().nullable(),

  // Demographics
  nationality: z.string().optional().nullable(),
  dob: z.string().optional().nullable(),
  customer_segment: z.string().optional().nullable(),
  account_type: z.enum(['Primary', 'Secondary']).optional().nullable(),
  relation: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CustomerDemographicsSchema = z.infer<typeof customerDemographicsSchema>;
```

### Task 4.3: Update Measurement Schema

**File:** `apps/pos-interface/src/components/forms/customer-measurements/schema.ts`

```typescript
import { z } from 'zod';

const decimalField = z.string().optional().nullable();

export const measurementSchema = z.object({
  id: z.string().uuid().optional(),
  customer_id: z.number(),
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

export type MeasurementSchema = z.infer<typeof measurementSchema>;
```

### Task 4.4: Update Garment/Fabric Selection Schema

**File:** `apps/pos-interface/src/components/forms/fabric-selection/schema.ts`

```typescript
import { z } from 'zod';

export const garmentSchema = z.object({
  id: z.string().uuid().optional(),
  garment_id: z.string().optional().nullable(),
  order_id: z.number(),
  fabric_id: z.number().optional().nullable(),
  style_id: z.number().optional().nullable(),
  measurement_id: z.string().uuid().optional().nullable(),

  fabric_source: z.enum(['IN', 'OUT']).optional().nullable(),
  fabric_length: z.string().default('0'),
  quantity: z.number().default(1),

  // Style options
  collar_type: z.string().optional().nullable(),
  collar_button: z.string().optional().nullable(),
  cuffs_type: z.string().optional().nullable(),
  cuffs_thickness: z.string().optional().nullable(),
  front_pocket_type: z.string().optional().nullable(),
  front_pocket_thickness: z.string().optional().nullable(),
  wallet_pocket: z.boolean().optional().nullable(),
  pen_holder: z.boolean().optional().nullable(),
  small_tabaggi: z.boolean().optional().nullable(),
  jabzour_1: z.string().optional().nullable(),
  jabzour_2: z.string().optional().nullable(),
  jabzour_thickness: z.string().optional().nullable(),

  express: z.boolean().default(false),
  brova: z.boolean().default(false),
  piece_stage: z.string().optional().nullable(),
  delivery_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type GarmentSchema = z.infer<typeof garmentSchema>;
```

### Task 4.5: Update Form Components

For each form component that uses these schemas, update field references:

**Example changes in components:**
```typescript
// Before (camelCase)
<Input {...register('firstName')} />
{errors.firstName?.message}

// After (snake_case)
<Input {...register('first_name')} />
{errors.first_name?.message}
```

### Task 4.6: Verify Schemas

```bash
cd apps/pos-interface && pnpm tsc --noEmit
```

## Completion Criteria
- [ ] All schemas use snake_case field names
- [ ] Form components updated to use snake_case
- [ ] TypeScript compiles
- [ ] Schemas match database column names exactly
