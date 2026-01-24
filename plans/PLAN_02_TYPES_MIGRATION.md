# Plan 02: Types Migration

## Objective
Update types to use Drizzle-inferred types directly. Everything uses snake_case.

## Key Principle
**No conversion needed.** Drizzle types are snake_case, Supabase returns snake_case, we use snake_case everywhere.

## Tasks

### Task 2.1: Export Types from Database Package

**File:** `packages/database/src/index.ts`

```typescript
export * from './schema';
export type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
```

### Task 2.2: Create Type File in pos-interface

**Create:** `apps/pos-interface/src/types/database.ts`

```typescript
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  users, customers, orders, garments, measurements,
  fabrics, styles, campaigns, shelves, prices,
} from '@repo/database';

// Database row types (what you SELECT)
export type User = InferSelectModel<typeof users>;
export type Customer = InferSelectModel<typeof customers>;
export type Order = InferSelectModel<typeof orders>;
export type Garment = InferSelectModel<typeof garments>;
export type Measurement = InferSelectModel<typeof measurements>;
export type Fabric = InferSelectModel<typeof fabrics>;
export type Style = InferSelectModel<typeof styles>;
export type Campaign = InferSelectModel<typeof campaigns>;
export type Shelf = InferSelectModel<typeof shelves>;
export type Price = InferSelectModel<typeof prices>;

// Insert types (what you INSERT)
export type NewCustomer = InferInsertModel<typeof customers>;
export type NewOrder = InferInsertModel<typeof orders>;
export type NewGarment = InferInsertModel<typeof garments>;
export type NewMeasurement = InferInsertModel<typeof measurements>;

// Enum types
export type CheckoutStatus = 'draft' | 'confirmed' | 'cancelled';
export type OrderType = 'WORK' | 'SALES';
export type PaymentType = 'knet' | 'cash' | 'link_payment' | 'installments' | 'others';
export type DiscountType = 'flat' | 'referral' | 'loyalty' | 'by_value';
export type FabricSource = 'IN' | 'OUT';
export type ProductionStage =
  | 'order_at_shop' | 'sent_to_workshop' | 'order_at_workshop'
  | 'brova_and_final_dispatched_to_shop' | 'final_dispatched_to_shop'
  | 'brova_at_shop' | 'brova_accepted' | 'brova_alteration'
  | 'brova_repair_and_production' | 'brova_alteration_and_production'
  | 'final_at_shop' | 'brova_and_final_at_shop'
  | 'order_collected' | 'order_delivered';
```

### Task 2.3: Update types/index.ts

**File:** `apps/pos-interface/src/types/index.ts`

```typescript
// New Supabase types (snake_case)
export * from './database';

// Keep old types for files not yet migrated (outside scope)
// These will be removed later when full migration is done
export type { Order as AirtableOrder } from './order';
export type { Customer as AirtableCustomer } from './customer';
export type { Garment as AirtableGarment } from './garment';
export type { Measurement as AirtableMeasurement } from './measurement';
```

### Task 2.4: Update stages.ts

**File:** `apps/pos-interface/src/types/stages.ts`

Add new stage constants alongside old ones:

```typescript
// New Supabase stages (snake_case)
export const CheckoutStatus = {
  draft: 'draft',
  confirmed: 'confirmed',
  cancelled: 'cancelled',
} as const;

export const ProductionStage = {
  order_at_shop: 'order_at_shop',
  sent_to_workshop: 'sent_to_workshop',
  // ... all stages
} as const;

// Conversion helpers (for migration period)
export const airtableToSupabaseStatus = {
  'Pending': 'draft',
  'Completed': 'confirmed',
  'Cancelled': 'cancelled',
} as const;
```

### Task 2.5: Verify Types Compile

```bash
cd packages/database && pnpm tsc --noEmit
cd ../apps/pos-interface && pnpm tsc --noEmit
```

## Completion Criteria
- [x] Database package exports Drizzle types
- [x] pos-interface has new type file with snake_case types
- [x] Types index updated
- [x] Stages updated with new values
