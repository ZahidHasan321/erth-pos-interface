# Plan 03: API Migration

## Objective
Replace Airtable API calls with Supabase. Return data as-is (snake_case).

## Key Principle
**No transformation.** Supabase returns snake_case, we return snake_case.

## Tasks

### Task 3.1: Add Supabase Dependency

```bash
cd apps/pos-interface && pnpm add @supabase/supabase-js
```

### Task 3.2: Create Supabase Client

**Create:** `apps/pos-interface/src/lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### Task 3.3: Update Orders API

**File:** `apps/pos-interface/src/api/orders.ts`

Replace with Supabase implementation:

```typescript
import { supabase } from '@/lib/supabase';
import type { Order, NewOrder } from '@/types';

export async function getOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getOrderById(id: number): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function createOrder(order: NewOrder): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateOrder(id: number, updates: Partial<Order>): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPendingOrdersByCustomer(customer_id: number): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', customer_id)
    .eq('checkout_status', 'draft');
  if (error) throw error;
  return data ?? [];
}
```

### Task 3.4: Update Customers API

**File:** `apps/pos-interface/src/api/customers.ts`

```typescript
import { supabase } from '@/lib/supabase';
import type { Customer, NewCustomer } from '@/types';

export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function searchCustomerByPhone(phone: string): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .ilike('phone', `%${phone}%`)
    .limit(10);
  if (error) throw error;
  return data ?? [];
}

export async function createCustomer(customer: NewCustomer): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert(customer)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCustomer(id: number, updates: Partial<Customer>): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

### Task 3.5: Update Measurements API

**File:** `apps/pos-interface/src/api/measurements.ts`

```typescript
import { supabase } from '@/lib/supabase';
import type { Measurement, NewMeasurement } from '@/types';

export async function getMeasurementsByCustomerId(customer_id: number): Promise<Measurement[]> {
  const { data, error } = await supabase
    .from('measurements')
    .select('*')
    .eq('customer_id', customer_id)
    .order('measurement_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createMeasurement(measurement: NewMeasurement): Promise<Measurement> {
  const { data, error } = await supabase
    .from('measurements')
    .insert(measurement)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMeasurement(id: string, updates: Partial<Measurement>): Promise<Measurement> {
  const { data, error } = await supabase
    .from('measurements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

### Task 3.6: Update Other APIs

Apply same pattern to:
- `garments.ts`
- `fabrics.ts`
- `styles.ts`
- `campaigns.ts`
- `shelves.ts`

### Task 3.7: Verify APIs Compile

```bash
cd apps/pos-interface && pnpm tsc --noEmit
```

## Completion Criteria
- [ ] Supabase client created
- [ ] All API files updated
- [ ] No mappers/transformations - data returned as-is
- [ ] TypeScript compiles
