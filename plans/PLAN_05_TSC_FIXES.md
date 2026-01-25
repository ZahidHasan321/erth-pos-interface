# Plan 05: TypeScript Fixes

## Objective
Fix all TypeScript errors after migration changes.

## Prerequisites
- Plans 01-04 completed

## Tasks

### Task 5.1: Run Initial Check

```bash
cd apps/pos-interface && pnpm tsc --noEmit 2>&1 | head -100
```

### Task 5.2: Common Error Patterns and Fixes

#### Pattern A: Old Airtable field access
```typescript
// Error: Property 'fields' does not exist
order.fields.OrderID

// Fix: Direct property access with snake_case
order.invoice_number
```

#### Pattern B: Old status values
```typescript
// Error: Type '"Pending"' is not assignable
orderStatus === 'Pending'

// Fix: New status values
checkout_status === 'draft'
```

#### Pattern C: Array to single value
```typescript
// Error: Type 'number' is not assignable to type 'string[]'
customer.fields.CustomerID[0]

// Fix: Direct FK reference
order.customer_id
```

#### Pattern D: camelCase to snake_case
```typescript
// Error: Property 'homeDelivery' does not exist
order.homeDelivery

// Fix: snake_case
order.home_delivery
```

#### Pattern E: String ID to number
```typescript
// Error: Type 'string' is not assignable to type 'number'
const orderId: string = order.id

// Fix: Type is now number
const orderId: number = order.id
```

### Task 5.3: Fix Import Errors

Check for:
- Missing type imports
- Wrong import paths
- Renamed exports

```typescript
// Before
import { Order } from '@/types/order';

// After (if using new types)
import { Order } from '@/types';
// or import { Order } from '@/types/database';
```

### Task 5.4: Fix Store Types

Update Zustand store to use snake_case:

```typescript
// Before
interface WorkOrderState {
  orderId: string | null;
  customerDemographics: {...}
}

// After
interface WorkOrderState {
  order_id: number | null;
  customer_demographics: {...}
}
```

### Task 5.5: Fix Hook Types

Update hook return types and parameters:

```typescript
// Before
function useOrderMutations() {
  const createOrder = (order: { OrderStatus: string }) => {...}
}

// After
function useOrderMutations() {
  const createOrder = (order: NewOrder) => {...}
}
```

### Task 5.6: Fix Component Props

Update component interfaces:

```typescript
// Before
interface OrderFormProps {
  onSubmit: (data: { OrderID: string }) => void;
}

// After
interface OrderFormProps {
  onSubmit: (data: Order) => void;
}
```

### Task 5.7: Run Final Check

```bash
cd apps/pos-interface && pnpm tsc --noEmit
```

**Expected:** No errors.

### Task 5.8: Build Verification

```bash
cd apps/pos-interface && pnpm build
```

**Expected:** Build completes successfully.

### Task 5.9: Lint Check

```bash
cd apps/pos-interface && pnpm lint
```

Fix any critical lint errors.

## Error Priority

Fix errors in this order:
1. Import errors (they cause cascading errors)
2. Type definition errors
3. Property access errors
4. Function signature errors
5. Minor type mismatches

## Completion Criteria
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes (warnings OK)
- [ ] No files deleted
