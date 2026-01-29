# PLAN_06_ORDER_SCHEMA_SPLIT

## 1. Overview
We will separate the monolith `orders` table into `orders` (base) and `work_orders` (extension). 
**Key Principle:** The Frontend remains "ignorant" of this split. The API and RPC layers will handle the merging and splitting of data.

## 2. Schema Changes (packages/database/src/schema.ts)

The `work_orders` table is a 1:1 extension of `orders`.
- **Primary Key**: `order_id` (also a Foreign Key to `orders.id`).
- **Moved Columns**: All workshop-specific fields (`invoice_number`, `delivery_date`, `advance`, `stitching_price`, etc.) move here.

## 3. Detailed Implementation Steps

### Step 1: SQL Migration & Trigger Updates
This is the most critical part. We need to update the RPC functions in `packages/database/src/triggers.sql` to handle two tables.

#### A. Updated `complete_work_order` RPC
```sql
CREATE OR REPLACE FUNCTION complete_work_order(
  p_order_id INT,
  p_checkout_details JSONB,
  p_shelf_items JSONB,
  p_fabric_items JSONB
) RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_order_row RECORD;
  v_work_order_row RECORD;
  v_inv INT;
BEGIN
  -- 1. Get or Generate Invoice Number
  SELECT invoice_number INTO v_inv FROM work_orders WHERE order_id = p_order_id;
  IF v_inv IS NULL THEN
     v_inv := nextval('invoice_seq');
  END IF;

  -- 2. Update Core Order
  UPDATE orders SET
    checkout_status = 'confirmed',
    payment_type = (p_checkout_details->>'paymentType')::payment_type,
    paid = (p_checkout_details->>'paid')::decimal,
    payment_ref_no = (p_checkout_details->>'paymentRefNo'),
    payment_note = (p_checkout_details->>'paymentNote'),
    order_taker_id = (p_checkout_details->>'orderTaker')::uuid,
    discount_type = (p_checkout_details->>'discountType')::discount_type,
    discount_value = (p_checkout_details->>'discountValue')::decimal,
    discount_percentage = (p_checkout_details->>'discountPercentage')::decimal,
    referral_code = (p_checkout_details->>'referralCode'),
    order_total = (p_checkout_details->>'orderTotal')::decimal,
    delivery_charge = (p_checkout_details->>'deliveryCharge')::decimal,
    shelf_charge = (p_checkout_details->>'shelf_charge')::decimal,
    home_delivery = COALESCE((p_checkout_details->>'homeDelivery')::boolean, false),
    notes = COALESCE(p_checkout_details->>'notes', notes),
    order_date = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order_row;

  -- 3. Upsert Work Order Extension
  INSERT INTO work_orders (
    order_id, invoice_number, delivery_date, advance, fabric_charge, 
    stitching_charge, style_charge, stitching_price
  ) VALUES (
    p_order_id, v_inv, 
    (p_checkout_details->>'deliveryDate')::timestamp,
    (p_checkout_details->>'advance')::decimal,
    (p_checkout_details->>'fabricCharge')::decimal,
    (p_checkout_details->>'stitchingCharge')::decimal,
    (p_checkout_details->>'styleCharge')::decimal,
    (p_checkout_details->>'stitchingPrice')::decimal
  )
  ON CONFLICT (order_id) DO UPDATE SET
    invoice_number = EXCLUDED.invoice_number,
    delivery_date = EXCLUDED.delivery_date,
    advance = EXCLUDED.advance,
    fabric_charge = EXCLUDED.fabric_charge,
    stitching_charge = EXCLUDED.stitching_charge,
    style_charge = EXCLUDED.style_charge,
    stitching_price = EXCLUDED.stitching_price
  RETURNING * INTO v_work_order_row;

  -- 4. [Existing logic for shelf and fabric deductions...]
  -- ...

  -- 5. Return FLATTENED result for Frontend
  RETURN to_jsonb(v_order_row) || to_jsonb(v_work_order_row);
END;
$$ LANGUAGE plpgsql;
```

### Step 2: API Layer Refactor (apps/pos-interface/src/api/orders.ts)
We update our fetchers to always join and flatten.

```typescript
// Helper to flatten joined response
const flattenOrder = (data: any) => {
    if (!data) return null;
    const { work_orders, ...core } = data;
    return { ...core, ...(work_orders?.[0] || work_orders || {}) };
};

export const getOrderById = async (id: number, includeRelations: boolean = false) => {
    // Note the added 'work_orders(*)'
    let query = supabase.from('orders').select(`
        *,
        work_orders(*), 
        ${includeRelations ? 'customer:customers(*), garments(*)' : ''}
    `);
    
    const { data, error } = await query.eq('id', id).maybeSingle();
    return { status: error ? 'error' : 'success', data: flattenOrder(data) };
};

export const searchOrders = async (filters: Record<string, any>) => {
    // Map of frontend keys to DB paths
    const MAP: Record<string, string> = {
        invoice_number: 'work_orders.invoice_number',
        delivery_date: 'work_orders.delivery_date'
    };

    let builder = supabase.from('orders').select('*, work_orders!inner(*)');
    
    Object.entries(filters).forEach(([key, value]) => {
        const dbKey = MAP[key] || key;
        builder = builder.eq(dbKey, value);
    });

    const { data, error } = await builder;
    return { status: 'success', data: data?.map(flattenOrder) || [] };
};
```

### Step 3: Handling `createOrder` and `updateOrder`
When the frontend calls `updateOrder({ delivery_date: '...' }, id)`, the API must know which table to target.

```typescript
export const updateOrder = async (fields: Partial<Order>, orderId: number) => {
    const WORK_FIELDS = ['invoice_number', 'delivery_date', 'advance', 'stitching_price', 'fabric_charge', 'stitching_charge', 'style_charge'];
    
    const coreUpdates = { ...fields };
    const workUpdates: any = {};
    
    WORK_FIELDS.forEach(f => {
        if (f in fields) {
            workUpdates[f] = (fields as any)[f];
            delete (coreUpdates as any)[f];
        }
    });

    // 1. Update Core
    if (Object.keys(coreUpdates).length > 0) {
        await supabase.from('orders').update(coreUpdates).eq('id', orderId);
    }
    
    // 2. Update Work Extension (Upsert)
    if (Object.keys(workUpdates).length > 0) {
        await supabase.from('work_orders').upsert({ order_id: orderId, ...workUpdates });
    }

    return getOrderById(orderId); // Return flattened
};
```

## 4. Execution Order
1.  **DB Schema**: Run the SQL to create `work_orders` and migrate existing data.
2.  **Schema.ts**: Update types and relations in the database package.
3.  **Triggers.sql**: Apply the new RPC logic to Supabase.
4.  **API Layer**: Refactor `api/orders.ts` with the flattening logic.
5.  **Verify**: Test searching by `invoice_number` and updating `delivery_date` from the UI.
