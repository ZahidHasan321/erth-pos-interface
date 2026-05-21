-- 0. Implicit casts for custom enums (allows PostgREST/Supabase to pass text values)
DO $$
DECLARE
  enum_name TEXT;
BEGIN
  FOREACH enum_name IN ARRAY ARRAY[
    'role', 'department', 'checkout_status', 'order_phase', 'piece_stage',
    'location', 'fulfillment_type', 'payment_type', 'discount_type',
    'order_type', 'brand', 'fabric_source', 'account_type', 'measurement_type',
    'jabzour_type', 'garment_type', 'transaction_type', 'register_session_status',
    'cash_movement_type', 'appointment_status', 'fabric_type', 'transfer_status',
    'transfer_direction', 'transfer_item_type', 'notification_type',
    'accessory_category', 'unit_of_measure'
  ]
  LOOP
    BEGIN
      EXECUTE format('CREATE CAST (text AS %I) WITH INOUT AS IMPLICIT', enum_name);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- 0a-idem. Idempotency claim for mutating RPCs.
-- Returns TRUE  → first time, caller must proceed with side effects.
-- Returns FALSE → this key was already processed, caller must short-circuit.
-- The INSERT runs in the caller's transaction: a rollback (RPC raised)
-- releases the claim so a genuinely failed call stays retryable. The PK
-- serializes concurrent replays (second waits, then sees the conflict).
-- Requires table rpc_idempotency (migration 0016) — run db:migrate first.
CREATE OR REPLACE FUNCTION idem_claim(p_key UUID, p_rpc TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_key IS NULL THEN
    RETURN TRUE;
  END IF;
  INSERT INTO rpc_idempotency (idempotency_key, rpc_name)
  VALUES (p_key, p_rpc)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- 0a-idem-store. Persist the original RPC result against its claimed key.
-- Runs in the caller's transaction: a rollback discards this row alongside
-- the released claim, so a failed call stays fully retryable. No-op on NULL.
CREATE OR REPLACE FUNCTION idem_store(p_key UUID, p_result JSONB)
RETURNS VOID AS $$
BEGIN
  IF p_key IS NULL THEN
    RETURN;
  END IF;
  UPDATE rpc_idempotency SET result = p_result WHERE idempotency_key = p_key;
END;
$$ LANGUAGE plpgsql;

-- 0a-idem-replay. Return the persisted original result for an already-claimed key.
-- If the row exists but result IS NULL the key was claimed by a still-in-flight
-- concurrent call (KNOWN LIMITATION: the QUIC case is a sequential retry, not
-- concurrent, so the original has committed its result before the retry lands;
-- this branch only triggers under true concurrency, which is out of scope).
CREATE OR REPLACE FUNCTION idem_replay(p_key UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT result INTO v_result FROM rpc_idempotency WHERE idempotency_key = p_key;
  IF v_result IS NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'result_pending', true);
  END IF;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 0a. Enable pg_trgm for fuzzy/trigram search (idempotent, available on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 0b. GIN trigram indexes for fast fuzzy customer search
-- These allow indexed lookups for ILIKE '%term%' and similarity() queries.
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON customers USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx ON customers USING GIN (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_arabic_name_trgm_idx ON customers USING GIN (arabic_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_nick_name_trgm_idx ON customers USING GIN (nick_name gin_trgm_ops);

-- 0. Cleanup old trigger and function
DROP TRIGGER IF EXISTS trigger_assign_invoice ON orders;
DROP FUNCTION IF EXISTS assign_invoice_number();

-- 1. Create a sequence for Invoices starting at 1
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

-- 1b. Separate sequence for ALTERATION order invoices (independent counter)
CREATE SEQUENCE IF NOT EXISTS alteration_invoice_seq START 1;

-- 1c. RPC to fetch the next alteration invoice number (anon role cannot touch sequences directly)
CREATE OR REPLACE FUNCTION next_alteration_invoice()
RETURNS INT AS $$
BEGIN
  RETURN nextval('alteration_invoice_seq');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION next_alteration_invoice() TO authenticated, anon, service_role;

-- 2. Transactional RPC for completing work order
DROP FUNCTION IF EXISTS complete_work_order(integer, jsonb, jsonb, jsonb);
CREATE OR REPLACE FUNCTION complete_work_order(
  p_order_id INT,
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker, discountType, discountValue, referralCode, discountPercentage, orderTotal, fabricCharge, stitchingCharge, styleCharge, deliveryCharge, shelfCharge, homeDelivery, deliveryDate, advance, stitchingPrice }
  p_shelf_items JSONB,      -- [{ id: number, quantity: number, unitPrice: number }]
  p_fabric_items JSONB,     -- [{ id: number, length: number }]
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_order_row RECORD;
  v_work_order_row RECORD;
  v_inv INT;
  v_paid DECIMAL;
  v_session_id INT;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not double-decrement stock or
  -- re-bump the invoice. Returns the recorded original result on replay.
  IF NOT idem_claim(p_idempotency_key, 'complete_work_order') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  -- 1. Get or Generate Invoice Number
  SELECT invoice_number INTO v_inv FROM work_orders WHERE order_id = p_order_id;
  IF v_inv IS NULL THEN
     v_inv := nextval('invoice_seq');
  END IF;

  v_paid := (p_checkout_details->>'paid')::decimal;

  -- 2. Update Core Order
  UPDATE orders
  SET
    checkout_status = 'confirmed',
    order_type = 'WORK',
    payment_type = (p_checkout_details->>'paymentType')::payment_type,
    paid = v_paid,
    payment_ref_no = (p_checkout_details->>'paymentRefNo'),
    payment_note = (p_checkout_details->>'paymentNote'),
    order_taker_id = (p_checkout_details->>'orderTaker')::uuid,
    discount_type = (p_checkout_details->>'discountType')::discount_type,
    discount_value = (p_checkout_details->>'discountValue')::decimal,
    discount_percentage = (p_checkout_details->>'discountPercentage')::decimal,
    referral_code = (p_checkout_details->>'referralCode'),
    order_total = (p_checkout_details->>'orderTotal')::decimal,
    delivery_charge = (p_checkout_details->>'deliveryCharge')::decimal,
    express_charge = (p_checkout_details->>'expressCharge')::decimal,
    soaking_charge = (p_checkout_details->>'soakingCharge')::decimal,
    shelf_charge = (p_checkout_details->>'shelfCharge')::decimal,
    notes = COALESCE(p_checkout_details->>'notes', notes),
    order_date = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order_row;

  -- 3. Upsert Work Order Extension
  INSERT INTO work_orders (
    order_id,
    invoice_number,
    delivery_date,
    advance,
    fabric_charge,
    stitching_charge,
    style_charge,
    stitching_price,
    home_delivery,
    order_phase
  ) VALUES (
    p_order_id,
    v_inv,
    (p_checkout_details->>'deliveryDate')::timestamp,
    (p_checkout_details->>'advance')::decimal,
    (p_checkout_details->>'fabricCharge')::decimal,
    (p_checkout_details->>'stitchingCharge')::decimal,
    (p_checkout_details->>'styleCharge')::decimal,
    (p_checkout_details->>'stitchingPrice')::decimal,
    COALESCE((p_checkout_details->>'homeDelivery')::boolean, false),
    'new' -- Default to new on completion
  )
  ON CONFLICT (order_id) DO UPDATE SET
    invoice_number = EXCLUDED.invoice_number,
    delivery_date = EXCLUDED.delivery_date,
    advance = EXCLUDED.advance,
    fabric_charge = EXCLUDED.fabric_charge,
    stitching_charge = EXCLUDED.stitching_charge,
    style_charge = EXCLUDED.style_charge,
    stitching_price = EXCLUDED.stitching_price,
    home_delivery = EXCLUDED.home_delivery
  RETURNING * INTO v_work_order_row;

  -- 4. Deduct Shelf Stock & Record Items
  DELETE FROM order_shelf_items WHERE order_id = p_order_id;

  -- Stamp ledger context: shelf consumption tied to this work order
  PERFORM set_config('app.movement_type', 'consumption', true);
  PERFORM set_config('app.movement_ref_type', 'order', true);
  PERFORM set_config('app.movement_ref_id', p_order_id::text, true);
  PERFORM set_config('app.movement_user_id', COALESCE((p_checkout_details->>'orderTaker'), '')::text, true);
  PERFORM set_config('app.movement_supplier_id', '', true);
  PERFORM set_config('app.movement_unit_cost', '', true);
  PERFORM set_config('app.movement_reason', 'work order checkout (shelf)', true);
  PERFORM set_config('app.movement_notes', '', true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shelf_items)
  LOOP
    UPDATE shelf
    SET stock = stock - (v_item->>'quantity')::int,
        shop_stock = shop_stock - (v_item->>'quantity')::int
    WHERE id = (v_item->>'id')::int;

    INSERT INTO order_shelf_items (order_id, shelf_id, quantity, unit_price)
    VALUES (
      p_order_id,
      (v_item->>'id')::int,
      (v_item->>'quantity')::int,
      (v_item->>'unitPrice')::decimal
    );
  END LOOP;

  -- 5. Deduct Fabric Stock
  PERFORM set_config('app.movement_reason', 'work order checkout (fabric)', true);
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_fabric_items)
  LOOP
    UPDATE fabrics
    SET real_stock = real_stock - (v_item->>'length')::decimal,
        shop_stock = shop_stock - (v_item->>'length')::decimal
    WHERE id = (v_item->>'id')::int;
  END LOOP;

  -- 6. Record initial payment transaction (if paid > 0)
  --    STRICT: any cash/electronic advance requires the brand's register to be open
  --    so the transaction can be attributed to a session and reconciled at close.
  --    Zero-paid confirmations are allowed (no money flow → no register dependency).
  IF v_paid IS NOT NULL AND v_paid > 0 THEN
    SELECT id INTO v_session_id FROM register_sessions
    WHERE brand = v_order_row.brand AND status = 'open'
    LIMIT 1;

    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'Register is not open for %. Open the register before recording a payment.', v_order_row.brand;
    END IF;

    INSERT INTO payment_transactions (
      order_id, amount, payment_type, payment_ref_no, payment_note,
      cashier_id, transaction_type, register_session_id
    )
    VALUES (
      p_order_id,
      v_paid,
      (p_checkout_details->>'paymentType')::payment_type,
      (p_checkout_details->>'paymentRefNo'),
      (p_checkout_details->>'paymentNote'),
      (p_checkout_details->>'orderTaker')::uuid,
      'payment',
      v_session_id
    );
  END IF;

  -- 7. Return Flattened Result
  v_result := to_jsonb(v_order_row) || to_jsonb(v_work_order_row);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 3. Transactional RPC for completing sales order (Shelf items only)
DROP FUNCTION IF EXISTS complete_sales_order(integer, jsonb, jsonb);
CREATE OR REPLACE FUNCTION complete_sales_order(
  p_order_id INT,
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker, discountType, discountValue, referralCode, discountPercentage, total, shelfCharge, deliveryCharge }
  p_shelf_items JSONB,      -- [{ id: number, quantity: number, unitPrice: number }]
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_order_row orders%ROWTYPE;
  v_paid DECIMAL;
  v_session_id INT;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not double-decrement shelf stock.
  IF NOT idem_claim(p_idempotency_key, 'complete_sales_order') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  v_paid := (p_checkout_details->>'paid')::decimal;

  -- 1. Update Order
  UPDATE orders
  SET
    checkout_status = 'confirmed',
    payment_type = (p_checkout_details->>'paymentType')::payment_type,
    paid = v_paid,
    payment_ref_no = (p_checkout_details->>'paymentRefNo'),
    payment_note = (p_checkout_details->>'paymentNote'),
    order_taker_id = (p_checkout_details->>'orderTaker')::uuid,
    discount_type = (p_checkout_details->>'discountType')::discount_type,
    discount_value = (p_checkout_details->>'discountValue')::decimal,
    discount_percentage = (p_checkout_details->>'discountPercentage')::decimal,
    referral_code = (p_checkout_details->>'referralCode'),
    order_total = (p_checkout_details->>'total')::decimal,
    shelf_charge = (p_checkout_details->>'shelfCharge')::decimal,
    delivery_charge = (p_checkout_details->>'deliveryCharge')::decimal,
    express_charge = (p_checkout_details->>'expressCharge')::decimal,
    soaking_charge = (p_checkout_details->>'soakingCharge')::decimal,
    order_date = NOW(),
    order_type = 'SALES'
  WHERE id = p_order_id
  RETURNING * INTO v_order_row;

  -- 2. Ensure no work_order extension exists for sales
  DELETE FROM work_orders WHERE order_id = p_order_id;

  -- 3. Deduct Shelf Stock & Record Items
  DELETE FROM order_shelf_items WHERE order_id = p_order_id;

  -- Stamp ledger context: shelf consumption tied to this sales order
  PERFORM set_config('app.movement_type', 'consumption', true);
  PERFORM set_config('app.movement_ref_type', 'order', true);
  PERFORM set_config('app.movement_ref_id', p_order_id::text, true);
  PERFORM set_config('app.movement_user_id', COALESCE((p_checkout_details->>'orderTaker'), '')::text, true);
  PERFORM set_config('app.movement_supplier_id', '', true);
  PERFORM set_config('app.movement_unit_cost', '', true);
  PERFORM set_config('app.movement_reason', 'sales order checkout', true);
  PERFORM set_config('app.movement_notes', '', true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shelf_items)
  LOOP
    UPDATE shelf
    SET stock = stock - (v_item->>'quantity')::int,
        shop_stock = shop_stock - (v_item->>'quantity')::int
    WHERE id = (v_item->>'id')::int;

    INSERT INTO order_shelf_items (order_id, shelf_id, quantity, unit_price)
    VALUES (
      p_order_id,
      (v_item->>'id')::int,
      (v_item->>'quantity')::int,
      (v_item->>'unitPrice')::decimal
    );
  END LOOP;

  -- 4. Record initial payment transaction (if paid > 0)
  --    STRICT: requires open register for the order's brand (see complete_work_order).
  IF v_paid IS NOT NULL AND v_paid > 0 THEN
    SELECT id INTO v_session_id FROM register_sessions
    WHERE brand = v_order_row.brand AND status = 'open'
    LIMIT 1;

    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'Register is not open for %. Open the register before recording a payment.', v_order_row.brand;
    END IF;

    INSERT INTO payment_transactions (
      order_id, amount, payment_type, payment_ref_no, payment_note,
      cashier_id, transaction_type, register_session_id
    )
    VALUES (
      p_order_id,
      v_paid,
      (p_checkout_details->>'paymentType')::payment_type,
      (p_checkout_details->>'paymentRefNo'),
      (p_checkout_details->>'paymentNote'),
      (p_checkout_details->>'orderTaker')::uuid,
      'payment',
      v_session_id
    );
  END IF;

  v_result := to_jsonb(v_order_row);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 4. NEW: Transactional RPC for creating AND completing a sales order in one go
DROP FUNCTION IF EXISTS create_complete_sales_order(integer, jsonb, jsonb);
CREATE OR REPLACE FUNCTION create_complete_sales_order(
  p_customer_id INT,
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker, discountType, discountValue, referralCode, discountPercentage, notes, total, shelfCharge, deliveryCharge, brand }
  p_shelf_items JSONB,      -- [{ id: number, quantity: number, unitPrice: number }]
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_order_id INT;
  v_order_row orders%ROWTYPE;
  v_paid DECIMAL;
  v_session_id INT;
  v_brand brand;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not create a second order +
  -- payment and double-decrement shelf stock. Returns the original order row.
  IF NOT idem_claim(p_idempotency_key, 'create_complete_sales_order') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  v_paid := (p_checkout_details->>'paid')::decimal;
  v_brand := (p_checkout_details->>'brand')::brand;

  -- 1. Insert into orders
  INSERT INTO orders (
    customer_id,
    checkout_status,
    order_type,
    order_date,
    payment_type,
    paid,
    payment_ref_no,
    payment_note,
    order_taker_id,
    discount_type,
    discount_value,
    discount_percentage,
    referral_code,
    notes,
    order_total,
    shelf_charge,
    delivery_charge,
    brand
  ) VALUES (
    p_customer_id,
    'confirmed',
    'SALES',
    NOW(),
    (p_checkout_details->>'paymentType')::payment_type,
    v_paid,
    (p_checkout_details->>'paymentRefNo'),
    (p_checkout_details->>'paymentNote'),
    (p_checkout_details->>'orderTaker')::uuid,
    (p_checkout_details->>'discountType')::discount_type,
    (p_checkout_details->>'discountValue')::decimal,
    (p_checkout_details->>'discountPercentage')::decimal,
    (p_checkout_details->>'referralCode'),
    (p_checkout_details->>'notes'),
    (p_checkout_details->>'total')::decimal,
    (p_checkout_details->>'shelfCharge')::decimal,
    (p_checkout_details->>'deliveryCharge')::decimal,
    v_brand
  ) RETURNING id INTO v_order_id;

  -- 2. Deduct Shelf Stock & Record Items
  -- Stamp ledger context: shelf consumption tied to this order
  PERFORM set_config('app.movement_type', 'consumption', true);
  PERFORM set_config('app.movement_ref_type', 'order', true);
  PERFORM set_config('app.movement_ref_id', v_order_id::text, true);
  PERFORM set_config('app.movement_user_id', COALESCE((p_checkout_details->>'orderTaker'), '')::text, true);
  PERFORM set_config('app.movement_reason', 'sales order checkout', true);
  PERFORM set_config('app.movement_notes', '', true);
  PERFORM set_config('app.movement_supplier_id', '', true);
  PERFORM set_config('app.movement_unit_cost', '', true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shelf_items)
  LOOP
    UPDATE shelf
    SET stock = stock - (v_item->>'quantity')::int,
        shop_stock = shop_stock - (v_item->>'quantity')::int
    WHERE id = (v_item->>'id')::int;

    INSERT INTO order_shelf_items (order_id, shelf_id, quantity, unit_price)
    VALUES (
      v_order_id,
      (v_item->>'id')::int,
      (v_item->>'quantity')::int,
      (v_item->>'unitPrice')::decimal
    );
  END LOOP;

  -- 3. Record initial payment transaction (if paid > 0)
  --    STRICT: requires open register for the brand (see complete_work_order).
  IF v_paid IS NOT NULL AND v_paid > 0 THEN
    SELECT id INTO v_session_id FROM register_sessions
    WHERE brand = v_brand AND status = 'open'
    LIMIT 1;

    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'Register is not open for %. Open the register before recording a payment.', v_brand;
    END IF;

    INSERT INTO payment_transactions (
      order_id, amount, payment_type, payment_ref_no, payment_note,
      cashier_id, transaction_type, register_session_id
    )
    VALUES (
      v_order_id,
      v_paid,
      (p_checkout_details->>'paymentType')::payment_type,
      (p_checkout_details->>'paymentRefNo'),
      (p_checkout_details->>'paymentNote'),
      (p_checkout_details->>'orderTaker')::uuid,
      'payment',
      v_session_id
    );
  END IF;

  -- 4. Return the full order row
  SELECT * FROM orders WHERE id = v_order_id INTO v_order_row;
  v_result := to_jsonb(v_order_row);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 5. Transactional RPC for saving work order garments and updating order totals.
--
-- Strategy: sync by upsert, not delete+insert.
--   • Garments removed from the list  → DELETE (targeted, not bulk)
--   • Garments already in the list    → UPDATE design fields only (workshop fields untouched)
--   • New garments                    → INSERT with initial workflow state
--
-- This preserves garment UUIDs across saves so any downstream references
-- (dispatch_log, garment_feedback, etc.) remain valid even if the shop edits
-- a draft order multiple times. Workshop-owned fields (piece_stage, location,
-- trip_number, in_production, production_plan, worker_history, …) are never
-- overwritten by this function.
--
-- Concurrency: the FOR UPDATE row lock on orders serializes concurrent calls
-- for the same order so the targeted DELETE cannot race with the upsert.
CREATE OR REPLACE FUNCTION save_work_order_garments(
  p_order_id     INT,
  p_garments     JSONB, -- Array of garment objects
  p_order_updates JSONB  -- { num_of_fabrics, fabric_charge, stitching_charge, style_charge, stitching_price, delivery_date, home_delivery }
) RETURNS JSONB AS $$
DECLARE
  v_garment JSONB;
BEGIN
  -- 0. Serialize concurrent calls for the same order.
  PERFORM id FROM orders WHERE id = p_order_id FOR UPDATE;

  -- 0b. Ensure order_type is WORK.
  UPDATE orders SET order_type = 'WORK' WHERE id = p_order_id AND order_type != 'WORK';

  -- 1. Upsert work order totals.
  INSERT INTO work_orders (
    order_id, num_of_fabrics, fabric_charge, stitching_charge,
    style_charge, stitching_price, delivery_date, home_delivery
  ) VALUES (
    p_order_id,
    (p_order_updates->>'num_of_fabrics')::INT,
    (p_order_updates->>'fabric_charge')::DECIMAL,
    (p_order_updates->>'stitching_charge')::DECIMAL,
    (p_order_updates->>'style_charge')::DECIMAL,
    (p_order_updates->>'stitching_price')::DECIMAL,
    (p_order_updates->>'delivery_date')::TIMESTAMP,
    COALESCE((p_order_updates->>'home_delivery')::BOOLEAN, false)
  )
  ON CONFLICT (order_id) DO UPDATE SET
    num_of_fabrics   = EXCLUDED.num_of_fabrics,
    fabric_charge    = EXCLUDED.fabric_charge,
    stitching_charge = EXCLUDED.stitching_charge,
    style_charge     = EXCLUDED.style_charge,
    stitching_price  = EXCLUDED.stitching_price,
    delivery_date    = EXCLUDED.delivery_date,
    home_delivery    = EXCLUDED.home_delivery;

  -- 2. Remove garments that are no longer in the submitted list.
  --    Targeted delete — only rows the shop explicitly removed.
  DELETE FROM garments
  WHERE order_id  = p_order_id
    AND garment_id NOT IN (
      SELECT elem->>'garment_id'
      FROM   jsonb_array_elements(p_garments) AS elem
    );

  -- 3. Upsert each garment.
  --    INSERT  → new garment: set all fields including initial workflow state.
  --    UPDATE  → existing garment: update only POS-owned design fields.
  --              Workshop fields (piece_stage, location, trip_number,
  --              in_production, production_plan, worker_history, assigned_*,
  --              acceptance_status, feedback_status, fulfillment_type, …)
  --              are intentionally excluded from the DO UPDATE clause.
  FOR v_garment IN SELECT * FROM jsonb_array_elements(p_garments)
  LOOP
    INSERT INTO garments (
      order_id, garment_id,
      -- Design / spec fields
      fabric_id, style_id, measurement_id, fabric_source,
      quantity, fabric_length,
      fabric_price_snapshot, stitching_price_snapshot, style_price_snapshot,
      collar_type, collar_button, collar_position, collar_thickness, cuffs_type, cuffs_thickness,
      front_pocket_type, front_pocket_thickness,
      wallet_pocket, pen_holder, small_tabaggi,
      jabzour_1, jabzour_2, jabzour_thickness,
      lines, notes, soaking, soaking_hours, express, garment_type,
      delivery_date, style, shop_name, home_delivery, color,
      -- Initial workflow state (only meaningful on first INSERT)
      piece_stage, location, trip_number,
      acceptance_status, feedback_status, fulfillment_type
    ) VALUES (
      p_order_id,
      v_garment->>'garment_id',
      (v_garment->>'fabric_id')::INT,
      (v_garment->>'style_id')::INT,
      (v_garment->>'measurement_id')::UUID,
      (v_garment->>'fabric_source')::fabric_source,
      COALESCE((v_garment->>'quantity')::INT, 1),
      (v_garment->>'fabric_length')::DECIMAL,
      (v_garment->>'fabric_price_snapshot')::DECIMAL,
      (v_garment->>'stitching_price_snapshot')::DECIMAL,
      (v_garment->>'style_price_snapshot')::DECIMAL,
      v_garment->>'collar_type',
      v_garment->>'collar_button',
      (v_garment->>'collar_position')::collar_position,
      v_garment->>'collar_thickness',
      v_garment->>'cuffs_type',
      v_garment->>'cuffs_thickness',
      v_garment->>'front_pocket_type',
      v_garment->>'front_pocket_thickness',
      COALESCE((v_garment->>'wallet_pocket')::BOOLEAN, false),
      COALESCE((v_garment->>'pen_holder')::BOOLEAN, false),
      COALESCE((v_garment->>'small_tabaggi')::BOOLEAN, false),
      (v_garment->>'jabzour_1')::jabzour_type,
      v_garment->>'jabzour_2',
      v_garment->>'jabzour_thickness',
      COALESCE((v_garment->>'lines')::INT, 1),
      v_garment->>'notes',
      COALESCE((v_garment->>'soaking')::BOOLEAN, false),
      CASE
        WHEN (v_garment->>'soaking')::BOOLEAN AND (v_garment->>'soaking_hours')::INT IN (8, 24)
          THEN (v_garment->>'soaking_hours')::INT
        ELSE NULL
      END,
      COALESCE((v_garment->>'express')::BOOLEAN, false),
      COALESCE(v_garment->>'garment_type', 'final')::garment_type,
      (v_garment->>'delivery_date')::TIMESTAMP,
      COALESCE(v_garment->>'style', 'kuwaiti'),
      v_garment->>'shop_name',
      COALESCE((v_garment->>'home_delivery')::BOOLEAN, false),
      v_garment->>'color',
      COALESCE((v_garment->>'piece_stage')::piece_stage, 'waiting_cut'),
      COALESCE((v_garment->>'location')::location, 'shop'),
      COALESCE((v_garment->>'trip_number')::INT, 0),
      (v_garment->>'acceptance_status')::BOOLEAN,
      v_garment->>'feedback_status',
      (v_garment->>'fulfillment_type')::fulfillment_type
    )
    ON CONFLICT (order_id, garment_id) DO UPDATE SET
      -- POS-owned design fields only
      fabric_id                = EXCLUDED.fabric_id,
      style_id                 = EXCLUDED.style_id,
      measurement_id           = EXCLUDED.measurement_id,
      fabric_source            = EXCLUDED.fabric_source,
      quantity                 = EXCLUDED.quantity,
      fabric_length            = EXCLUDED.fabric_length,
      fabric_price_snapshot    = EXCLUDED.fabric_price_snapshot,
      stitching_price_snapshot = EXCLUDED.stitching_price_snapshot,
      style_price_snapshot     = EXCLUDED.style_price_snapshot,
      collar_type              = EXCLUDED.collar_type,
      collar_button            = EXCLUDED.collar_button,
      collar_position          = EXCLUDED.collar_position,
      collar_thickness         = EXCLUDED.collar_thickness,
      cuffs_type               = EXCLUDED.cuffs_type,
      cuffs_thickness          = EXCLUDED.cuffs_thickness,
      front_pocket_type        = EXCLUDED.front_pocket_type,
      front_pocket_thickness   = EXCLUDED.front_pocket_thickness,
      wallet_pocket            = EXCLUDED.wallet_pocket,
      pen_holder               = EXCLUDED.pen_holder,
      small_tabaggi            = EXCLUDED.small_tabaggi,
      jabzour_1                = EXCLUDED.jabzour_1,
      jabzour_2                = EXCLUDED.jabzour_2,
      jabzour_thickness        = EXCLUDED.jabzour_thickness,
      lines                    = EXCLUDED.lines,
      notes                    = EXCLUDED.notes,
      soaking                  = EXCLUDED.soaking,
      soaking_hours            = EXCLUDED.soaking_hours,
      express                  = EXCLUDED.express,
      garment_type             = EXCLUDED.garment_type,
      delivery_date            = EXCLUDED.delivery_date,
      style                    = EXCLUDED.style,
      shop_name                = EXCLUDED.shop_name,
      home_delivery            = EXCLUDED.home_delivery,
      color                    = EXCLUDED.color;
      -- Workshop-owned fields NOT listed here (never overwritten by POS):
      --   piece_stage, location, trip_number, in_production,
      --   production_plan, worker_history, assigned_date, assigned_unit,
      --   assigned_person, start_time, completion_time,
      --   quality_check_ratings, trip_history,
      --   acceptance_status, feedback_status, fulfillment_type
  END LOOP;

  -- 4. Park finals if the order has any brova (finals wait for brova acceptance).
  IF EXISTS (
    SELECT 1 FROM garments WHERE order_id = p_order_id AND garment_type = 'brova'
  ) THEN
    UPDATE garments
    SET piece_stage = 'waiting_for_acceptance'
    WHERE order_id    = p_order_id
      AND garment_type = 'final'
      AND piece_stage  = 'waiting_cut';
  END IF;

  RETURN jsonb_build_object('status', 'success');
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger to auto-recompute order_phase
CREATE OR REPLACE FUNCTION recompute_order_phase()
RETURNS TRIGGER AS $$
DECLARE
    v_new_phase order_phase;
    v_current_phase order_phase;
BEGIN
    -- Get current phase
    SELECT wo.order_phase INTO v_current_phase
    FROM work_orders wo WHERE wo.order_id = NEW.order_id;

    -- If no work_orders row exists (e.g., sales order), skip
    IF v_current_phase IS NULL THEN
        RETURN NEW;
    END IF;

    -- Compute new phase from garment stages. Discarded counts as terminal
    -- alongside completed so cancellations don't strand orders in_progress.
    -- It's also allowed in the pre-dispatch preservation branch so a partial
    -- cancellation on a still-'new' order doesn't fake-promote it to 'in_progress'.
    SELECT CASE
        WHEN bool_and(g.piece_stage IN ('completed', 'discarded'))
            THEN 'completed'::order_phase
        WHEN bool_and(g.piece_stage IN ('waiting_for_acceptance', 'waiting_cut', 'brova_trialed', 'discarded'))
            THEN v_current_phase -- preserve 'new' vs 'in_progress' distinction
        ELSE 'in_progress'::order_phase
    END INTO v_new_phase
    FROM garments g
    WHERE g.order_id = NEW.order_id;

    -- Only update if phase actually changed
    UPDATE work_orders
    SET order_phase = v_new_phase
    WHERE order_id = NEW.order_id
      AND (order_phase IS NULL OR order_phase != v_new_phase);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS garment_stage_change_trigger ON garments;
CREATE TRIGGER garment_stage_change_trigger
AFTER INSERT OR UPDATE OF piece_stage ON garments
FOR EACH ROW
EXECUTE FUNCTION recompute_order_phase();

-- 6b. Unique constraint: prevent duplicate garments for the same order.
--     Belt-and-suspenders for the FOR UPDATE lock in save_work_order_garments —
--     any concurrent insert that slips through will fail here instead of silently
--     producing a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS garments_order_garment_id_unique
  ON garments(order_id, garment_id);

-- 7. Cleanup defaults
ALTER TABLE orders ALTER COLUMN paid DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN paid SET DEFAULT NULL;

-- 8. Sync trigger: recalculate orders.paid from payment_transactions
CREATE OR REPLACE FUNCTION sync_order_paid_from_transactions()
RETURNS TRIGGER AS $$
DECLARE
    v_order_id INT;
    v_total DECIMAL;
BEGIN
    -- Determine which order_id to recalculate
    IF TG_OP = 'DELETE' THEN
        v_order_id := OLD.order_id;
    ELSE
        v_order_id := NEW.order_id;
    END IF;

    -- Sum all transactions for this order
    SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM payment_transactions
    WHERE order_id = v_order_id;

    -- Update the orders.paid field
    UPDATE orders SET paid = v_total WHERE id = v_order_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_transactions_sync_trigger ON payment_transactions;
CREATE TRIGGER payment_transactions_sync_trigger
AFTER INSERT OR UPDATE OR DELETE ON payment_transactions
FOR EACH ROW
EXECUTE FUNCTION sync_order_paid_from_transactions();

-- 9. RPC: Record a payment transaction + optionally collect garments
-- Collection only happens at payment time. Garments are marked collected AND completed together.
-- Drop the pre-idempotency overload so PostgREST has a single candidate after deploy.
DROP FUNCTION IF EXISTS record_payment_transaction(INT, DECIMAL, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, UUID[], JSONB, DATE, JSONB);
CREATE OR REPLACE FUNCTION record_payment_transaction(
  p_order_id INT,
  p_amount DECIMAL,
  p_payment_type TEXT,
  p_payment_ref_no TEXT DEFAULT NULL,
  p_payment_note TEXT DEFAULT NULL,
  p_cashier_id UUID DEFAULT NULL,
  p_transaction_type TEXT DEFAULT 'payment',
  p_refund_reason TEXT DEFAULT NULL,
  p_collect_garment_ids UUID[] DEFAULT NULL,
  p_refund_items JSONB DEFAULT NULL,
  p_local_date DATE DEFAULT CURRENT_DATE,
  p_fulfillment_overrides JSONB DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_current_paid DECIMAL;
  v_transaction RECORD;
  v_existing RECORD;
  v_garment_id UUID;
  v_collected_count INT := 0;
  v_refund_item JSONB;
  v_shelf_item_id INT;
  v_refund_qty INT;
  v_session_id INT;
  v_overpayment DECIMAL;
  v_has_items BOOLEAN;
  v_my_user_id UUID;
  v_items_total DECIMAL;
  v_garment_for_discard RECORD;
BEGIN
  -- Block disabled users immediately — their JWT may still be valid even
  -- after an admin flipped is_active = false.
  PERFORM assert_active_user();

  -- Validate caller. p_cashier_id is the user being credited with the
  -- transaction. Non-managers can only attribute transactions to themselves;
  -- managers/admins may override (e.g. recording on behalf of staff).
  v_my_user_id := get_my_user_id();
  IF p_cashier_id IS NOT NULL
     AND p_cashier_id <> v_my_user_id
     AND NOT is_manager_or_above() THEN
    RAISE EXCEPTION 'Cashier mismatch: cannot record transaction under another user';
  END IF;
  IF p_cashier_id IS NULL THEN
    p_cashier_id := v_my_user_id;
  END IF;

  -- Idempotency short-circuit: if the client retried with the same key, return the
  -- previously-recorded transaction instead of inserting a duplicate.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM payment_transactions
    WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'transaction', to_jsonb(v_existing),
        'order_paid', (SELECT paid FROM orders WHERE id = v_existing.order_id),
        'order_total', (SELECT order_total FROM orders WHERE id = v_existing.order_id),
        'collected_count', 0,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  -- Validate order exists
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Block payments/refunds when register is closed.
  -- Capture the open session id so we can attach the transaction to it for clean
  -- per-session reconciliation in close_register.
  SELECT id INTO v_session_id FROM register_sessions
  WHERE brand = v_order.brand AND status = 'open'
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Register is not open. Open the register before recording transactions.';
  END IF;

  -- For refunds: validate reason and ensure paid won't go below 0
  IF p_transaction_type = 'refund' THEN
    IF p_refund_reason IS NULL OR p_refund_reason = '' THEN
      RAISE EXCEPTION 'Refund reason is required';
    END IF;

    v_current_paid := COALESCE(v_order.paid, 0);
    IF v_current_paid - ABS(p_amount) < 0 THEN
      RAISE EXCEPTION 'Refund amount (%) exceeds total paid (%)', ABS(p_amount), v_current_paid;
    END IF;

    -- Without selected items, the refund must not exceed the overpayment cap.
    -- Otherwise cashiers could refund cash without flagging anything as refunded,
    -- leaving the order books inconsistent.
    v_has_items := p_refund_items IS NOT NULL AND jsonb_array_length(p_refund_items) > 0;
    IF NOT v_has_items THEN
      v_overpayment := GREATEST(v_current_paid - COALESCE(v_order.order_total, 0), 0);
      IF ABS(p_amount) > v_overpayment + 0.001 THEN
        RAISE EXCEPTION 'Refund without selected items is capped at overpayment (% KWD). Select items to refund the remaining amount.', v_overpayment;
      END IF;
    ELSE
      -- With items, the refund amount must not exceed the sum of selected
      -- items' amounts (plus any overpayment cushion). Otherwise a cashier
      -- could flag a single cheap item and refund the entire paid amount.
      SELECT COALESCE(SUM((elem->>'amount')::DECIMAL), 0)
      INTO v_items_total
      FROM jsonb_array_elements(p_refund_items) AS elem;

      v_overpayment := GREATEST(v_current_paid - COALESCE(v_order.order_total, 0), 0);
      IF ABS(p_amount) > v_items_total + v_overpayment + 0.001 THEN
        RAISE EXCEPTION 'Refund (% KWD) exceeds selected items total (% KWD) plus overpayment (% KWD).', ABS(p_amount), v_items_total, v_overpayment;
      END IF;
    END IF;
  END IF;

  -- Bump invoice revision on every payment/refund recording
  UPDATE work_orders
  SET invoice_revision = COALESCE(invoice_revision, 0) + 1
  WHERE order_id = p_order_id;

  -- Insert the transaction (trigger will sync orders.paid)
  INSERT INTO payment_transactions (
    order_id, amount, payment_type, payment_ref_no, payment_note,
    cashier_id, transaction_type, refund_reason, refund_items,
    register_session_id, idempotency_key
  ) VALUES (
    p_order_id,
    CASE WHEN p_transaction_type = 'refund' THEN -ABS(p_amount) ELSE ABS(p_amount) END,
    p_payment_type::payment_type,
    p_payment_ref_no,
    p_payment_note,
    p_cashier_id,
    p_transaction_type::transaction_type,
    p_refund_reason,
    p_refund_items,
    v_session_id,
    p_idempotency_key
  )
  RETURNING * INTO v_transaction;

  -- Collect garments if any were selected (mark as collected + completed)
  IF p_collect_garment_ids IS NOT NULL AND array_length(p_collect_garment_ids, 1) > 0 THEN
    FOREACH v_garment_id IN ARRAY p_collect_garment_ids
    LOOP
      UPDATE garments
      SET
        fulfillment_type = CASE
          WHEN p_fulfillment_overrides IS NOT NULL AND (p_fulfillment_overrides->>v_garment_id::text) IS NOT NULL
            THEN (p_fulfillment_overrides->>v_garment_id::text)::fulfillment_type
          WHEN home_delivery THEN 'delivered'::fulfillment_type
          ELSE 'collected'::fulfillment_type
        END,
        piece_stage = 'completed'
      WHERE id = v_garment_id
        AND order_id = p_order_id
        AND location = 'shop'
        AND piece_stage IN ('brova_trialed', 'awaiting_trial', 'ready_for_pickup');

      IF FOUND THEN
        v_collected_count := v_collected_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- Mark refunded items on garments and shelf items
  IF p_transaction_type = 'refund' AND p_refund_items IS NOT NULL AND jsonb_array_length(p_refund_items) > 0 THEN
    FOR v_refund_item IN SELECT * FROM jsonb_array_elements(p_refund_items)
    LOOP
      IF v_refund_item ? 'garment_id' THEN
        UPDATE garments
        SET
          refunded_fabric = refunded_fabric OR COALESCE((v_refund_item->>'fabric')::boolean, false),
          refunded_stitching = refunded_stitching OR COALESCE((v_refund_item->>'stitching')::boolean, false),
          refunded_style = refunded_style OR COALESCE((v_refund_item->>'style')::boolean, false),
          refunded_express = refunded_express OR COALESCE((v_refund_item->>'express')::boolean, false),
          refunded_soaking = refunded_soaking OR COALESCE((v_refund_item->>'soaking')::boolean, false)
        WHERE id = (v_refund_item->>'garment_id')::uuid
          AND order_id = p_order_id;

        -- If every applicable price component is now refunded, treat the garment
        -- as cancelled. "Applicable" = priced (snapshot > 0) or flag set
        -- (express/soaking). Discarded counts as terminal for order_phase + is
        -- filtered out of workshop pipelines.
        SELECT id, fabric_id, fabric_length INTO v_garment_for_discard
        FROM garments
        WHERE id = (v_refund_item->>'garment_id')::uuid
          AND order_id = p_order_id
          AND piece_stage NOT IN ('discarded', 'completed')
          AND (COALESCE(fabric_price_snapshot, 0) = 0 OR refunded_fabric)
          AND (COALESCE(stitching_price_snapshot, 0) = 0 OR refunded_stitching)
          AND (COALESCE(style_price_snapshot, 0) = 0 OR refunded_style)
          AND (NOT COALESCE(express, false) OR refunded_express)
          AND (NOT COALESCE(soaking, false) OR refunded_soaking);

        IF FOUND THEN
          -- Reset workflow flags too. A cancelled garment shouldn't keep a
          -- 'needs_repair' feedback_status or stale acceptance — those drive
          -- showroom labels and detail-view chips elsewhere.
          UPDATE garments
          SET piece_stage = 'discarded',
              in_production = false,
              start_time = NULL,
              feedback_status = NULL,
              acceptance_status = NULL
          WHERE id = v_garment_for_discard.id;

          IF COALESCE((v_refund_item->>'fabric_restock')::boolean, false)
             AND v_garment_for_discard.fabric_id IS NOT NULL
             AND COALESCE(v_garment_for_discard.fabric_length, 0) > 0 THEN
            PERFORM set_config('app.movement_type', 'return', true);
            PERFORM set_config('app.movement_ref_type', 'order', true);
            PERFORM set_config('app.movement_ref_id', p_order_id::text, true);
            PERFORM set_config('app.movement_user_id', COALESCE(p_cashier_id::text, ''), true);
            PERFORM set_config('app.movement_reason', 'garment cancelled — fabric returned', true);
            PERFORM set_config('app.movement_notes', COALESCE(p_refund_reason, ''), true);

            UPDATE fabrics
            SET real_stock = COALESCE(real_stock, 0) + v_garment_for_discard.fabric_length,
                shop_stock = COALESCE(shop_stock, 0) + v_garment_for_discard.fabric_length
            WHERE id = v_garment_for_discard.fabric_id;
          END IF;
        END IF;
      ELSIF v_refund_item ? 'shelf_item_id' THEN
        v_shelf_item_id := (v_refund_item->>'shelf_item_id')::int;
        v_refund_qty := COALESCE((v_refund_item->>'quantity')::int, 0);
        UPDATE order_shelf_items
        SET refunded_qty = LEAST(COALESCE(refunded_qty, 0) + v_refund_qty, COALESCE(quantity, 0))
        WHERE id = v_shelf_item_id
          AND order_id = p_order_id;

        -- Restore shelf stock only when restock=true (default true for backward compat).
        -- Set restock=false for damaged/consumed returns that shouldn't re-enter inventory.
        IF v_refund_qty > 0 AND COALESCE((v_refund_item->>'restock')::boolean, true) THEN
          -- Stamp ledger context. Required: prior loop iterations (e.g. fabric
          -- restock) may have set 'return'/'garment cancelled' — must overwrite
          -- so the shelf row is logged as its own return, not piggybacked.
          PERFORM set_config('app.movement_type', 'return', true);
          PERFORM set_config('app.movement_ref_type', 'order', true);
          PERFORM set_config('app.movement_ref_id', p_order_id::text, true);
          PERFORM set_config('app.movement_user_id', COALESCE(p_cashier_id::text, ''), true);
          PERFORM set_config('app.movement_supplier_id', '', true);
          PERFORM set_config('app.movement_unit_cost', '', true);
          PERFORM set_config('app.movement_reason', 'shelf item refunded', true);
          PERFORM set_config('app.movement_notes', COALESCE(p_refund_reason, ''), true);

          UPDATE shelf
          SET stock = stock + v_refund_qty,
              shop_stock = shop_stock + v_refund_qty
          WHERE id = (SELECT shelf_id FROM order_shelf_items WHERE id = v_shelf_item_id);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Return transaction + updated order info
  RETURN jsonb_build_object(
    'transaction', to_jsonb(v_transaction),
    'order_paid', (SELECT paid FROM orders WHERE id = p_order_id),
    'order_total', v_order.order_total,
    'collected_count', v_collected_count
  );
END;
$$ LANGUAGE plpgsql;

-- 11. RPC: Toggle home delivery on an order (updates charges + all garments)
CREATE OR REPLACE FUNCTION toggle_home_delivery(
  p_order_id INT,
  p_home_delivery BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_old_delivery DECIMAL;
  v_new_delivery DECIMAL;
  v_new_total DECIMAL;
BEGIN
  -- Validate order exists
  SELECT order_total, delivery_charge, discount_value, paid INTO v_order
  FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_old_delivery := COALESCE(v_order.delivery_charge, 0);

  IF p_home_delivery THEN
    SELECT COALESCE(value::decimal, 0) INTO v_new_delivery FROM prices WHERE key = 'HOME_DELIVERY';
    v_new_delivery := COALESCE(v_new_delivery, 0);
  ELSE
    v_new_delivery := 0;
  END IF;

  -- Recalculate order total by swapping delivery charge
  v_new_total := COALESCE(v_order.order_total, 0) - v_old_delivery + v_new_delivery;

  -- Prevent removing delivery charge if it would drop total below already-paid amount
  IF v_new_total < COALESCE(v_order.paid, 0) THEN
    RAISE EXCEPTION 'Removing delivery charge would reduce order total (%) below amount already paid (%). Refund the excess first.', v_new_total, COALESCE(v_order.paid, 0);
  END IF;

  -- Update order charges
  UPDATE orders
  SET delivery_charge = v_new_delivery,
      order_total = v_new_total
  WHERE id = p_order_id;

  -- Update work_orders flag (revision bumped only on payment/refund recording)
  UPDATE work_orders
  SET home_delivery = p_home_delivery
  WHERE order_id = p_order_id;

  -- Update all garments on this order
  UPDATE garments
  SET home_delivery = p_home_delivery
  WHERE order_id = p_order_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'home_delivery', p_home_delivery,
    'delivery_charge', v_new_delivery,
    'order_total', v_new_total
  );
END;
$$ LANGUAGE plpgsql;

-- 11b. RPC: Collect garments without payment (for already-paid orders)
CREATE OR REPLACE FUNCTION collect_garments(
  p_order_id INT,
  p_garment_ids UUID[],
  p_fulfillment_overrides JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_garment_id UUID;
  v_collected_count INT := 0;
BEGIN
  -- Validate order exists and is not cancelled/draft
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND checkout_status = 'confirmed') THEN
    RAISE EXCEPTION 'Order % not found or not confirmed', p_order_id;
  END IF;

  IF p_garment_ids IS NULL OR array_length(p_garment_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No garments specified for collection';
  END IF;

  FOREACH v_garment_id IN ARRAY p_garment_ids
  LOOP
    UPDATE garments
    SET
      fulfillment_type = CASE
        WHEN p_fulfillment_overrides IS NOT NULL AND (p_fulfillment_overrides->>v_garment_id::text) IS NOT NULL
          THEN (p_fulfillment_overrides->>v_garment_id::text)::fulfillment_type
        WHEN home_delivery THEN 'delivered'::fulfillment_type
        ELSE 'collected'::fulfillment_type
      END,
      piece_stage = 'completed'
    WHERE id = v_garment_id
      AND order_id = p_order_id
      AND location = 'shop'
      AND piece_stage IN ('brova_trialed', 'awaiting_trial', 'ready_for_pickup');

    IF FOUND THEN
      v_collected_count := v_collected_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'collected_count', v_collected_count,
    'order_id', p_order_id
  );
END;
$$ LANGUAGE plpgsql;

-- 11b. RPC: Dispatch order garments to workshop (first dispatch only).
-- Promoted from the app-layer multi-step orchestration (was the client-side
-- dispatchOrder in apps/pos-interface/src/api/orders.ts) so the app and the
-- workflow test exercise IDENTICAL code instead of a hand-mirrored copy.
-- Atomic: garment flip + dispatch_log append + order_phase route happen in
-- one transaction. The trip_number = 0 gate makes it naturally idempotent
-- (a re-run flips/logs nothing); driving the audit log off the
-- UPDATE ... RETURNING set also fixes the prior best-effort double-log bug
-- (the old code re-queried by location and could re-log on retry).
CREATE OR REPLACE FUNCTION dispatch_order(
  p_order_id INT,
  p_garment_ids UUID[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_order_type TEXT;
  v_dispatched UUID[];
  v_count INT;
BEGIN
  SELECT order_type::text INTO v_order_type FROM orders WHERE id = p_order_id;
  IF v_order_type IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- 1. Flip first-time garments (trip_number = 0) to transit. The gate keeps
  --    returning garments (trip >= 1) untouched — those go through
  --    dispatchGarmentToWorkshop, which bumps trip and clears stale state.
  WITH moved AS (
    UPDATE garments
       SET location = 'transit_to_workshop', trip_number = 1
     WHERE order_id = p_order_id
       AND trip_number = 0
       AND (p_garment_ids IS NULL OR id = ANY(p_garment_ids))
    RETURNING id
  )
  SELECT array_agg(id) INTO v_dispatched FROM moved;

  v_count := COALESCE(array_length(v_dispatched, 1), 0);

  -- 1b. Append-only dispatch audit (Dispatch History view). Only the rows
  --     actually dispatched this call are logged.
  IF v_count > 0 THEN
    INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
    SELECT g_id, p_order_id, 'to_workshop', 1
    FROM unnest(v_dispatched) AS g_id;
  END IF;

  -- 2. Flip order_phase to in_progress on first dispatch (unconditional, as
  --    the original did). order_phase lives on work_orders for WORK and on
  --    alteration_orders for ALTERATION.
  IF v_order_type = 'ALTERATION' THEN
    UPDATE alteration_orders SET order_phase = 'in_progress' WHERE order_id = p_order_id;
  ELSE
    UPDATE work_orders SET order_phase = 'in_progress' WHERE order_id = p_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'dispatched_count', v_count,
    'order_type', v_order_type
  );
END;
$$ LANGUAGE plpgsql;

-- 11c. RPC: Receive garments at workshop (park, or receive-and-start).
-- Promoted from apps/workshop/src/api/garments.ts receiveGarments (:866) and
-- receiveAndStartGarments (:917) so the app and the workflow test exercise
-- IDENTICAL code instead of a hand-mirrored copy.
--   p_start = false → "Receive"        (park: in_production=false for all)
--   p_start = true  → "Receive & Start"(gate production on stage/feedback)
-- Accepted brovas skip production (→ ready_for_dispatch); returning non-accepted
-- brovas reset brova_trialed→waiting_cut; trip>1 returns clear stale prod fields.
CREATE OR REPLACE FUNCTION receive_garments(
  p_ids UUID[],
  p_start BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_count INT;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'receive_garments: no garment ids provided';
  END IF;

  -- 1. Land at workshop. "Receive" parks everything; "Receive & Start"
  --    defers the in_production decision to step 3.
  IF p_start THEN
    UPDATE garments SET location = 'workshop' WHERE id = ANY(p_ids);
  ELSE
    UPDATE garments SET location = 'workshop', in_production = false
     WHERE id = ANY(p_ids);
  END IF;

  -- 2. Accepted brovas need no production — straight to ready_for_dispatch
  --    (force in_production=false; the start path must not pick them up).
  UPDATE garments
     SET piece_stage = 'ready_for_dispatch', in_production = false
   WHERE id = ANY(p_ids) AND feedback_status = 'accepted';

  -- 3. Receive & Start: begin production on everything that is neither a
  --    parked final (waiting_for_acceptance) nor an accepted brova.
  IF p_start THEN
    UPDATE garments
       SET in_production = true
     WHERE id = ANY(p_ids)
       AND piece_stage <> 'waiting_for_acceptance'
       AND feedback_status IS DISTINCT FROM 'accepted';
  END IF;

  -- 4. Returning non-accepted brovas: brova_trialed → waiting_cut so the
  --    scheduler picks them up.
  UPDATE garments
     SET piece_stage = 'waiting_cut'
   WHERE id = ANY(p_ids)
     AND feedback_status IS NOT NULL
     AND feedback_status <> 'accepted'
     AND piece_stage = 'brova_trialed';

  -- 5. Clear stale production fields on returning garments (trip > 1) so they
  --    appear fresh in the scheduler. worker_history kept (ReturnPlanDialog).
  UPDATE garments
     SET production_plan = NULL, completion_time = NULL, start_time = NULL
   WHERE id = ANY(p_ids) AND trip_number > 1;

  v_count := COALESCE(array_length(p_ids, 1), 0);
  RETURN jsonb_build_object('received_count', v_count, 'started', p_start);
END;
$$ LANGUAGE plpgsql;

-- 11d. RPC: Release parked finals (waiting_for_acceptance → waiting_cut).
-- Promoted from apps/workshop/src/api/garments.ts releaseFinals (:1438).
CREATE OR REPLACE FUNCTION release_finals(p_ids UUID[])
RETURNS JSONB AS $$
DECLARE
  v_count INT;
BEGIN
  WITH released AS (
    UPDATE garments
       SET piece_stage = 'waiting_cut', in_production = false
     WHERE id = ANY(p_ids) AND piece_stage = 'waiting_for_acceptance'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM released;
  RETURN jsonb_build_object('released_count', v_count);
END;
$$ LANGUAGE plpgsql;

-- 11e. RPC: Workshop dispatches finished garments to the shop.
-- Promoted from apps/workshop/src/api/garments.ts dispatchGarments (:1336).
-- feedback_status is cleared (the trip's verdict is consumed on dispatch).
-- The dispatch_log append is now atomic with the move (the app version was
-- best-effort/non-blocking and could silently drop audit rows on failure).
CREATE OR REPLACE FUNCTION dispatch_garments_to_shop(p_ids UUID[])
RETURNS JSONB AS $$
DECLARE
  v_count INT;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'dispatch_garments_to_shop: no garment ids provided';
  END IF;

  WITH moved AS (
    UPDATE garments
       SET location = 'transit_to_shop', in_production = false,
           feedback_status = NULL
     WHERE id = ANY(p_ids)
    RETURNING id, order_id, trip_number
  )
  INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
  SELECT id, order_id, 'to_shop', trip_number FROM moved;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('dispatched_count', v_count);
END;
$$ LANGUAGE plpgsql;

-- 11f. RPC: Create a replacement garment after a Reject-Redo.
-- Promoted from apps/workshop/src/api/garments.ts createGarmentForOrder (:1817)
-- replacement path (+ nextGarmentIdForOrder :1801). Clones the original's
-- spec columns server-side (one read of truth), starts fresh at
-- trip 1 / waiting_cut / workshop, and links original.replaced_by_garment_id
-- (double-replacement guard preserved).
CREATE OR REPLACE FUNCTION create_replacement_garment(
  p_replaces_garment_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_orig garments%ROWTYPE;
  v_next INT;
  v_new_garment_id TEXT;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_orig FROM garments WHERE id = p_replaces_garment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_replacement_garment: original garment % not found', p_replaces_garment_id;
  END IF;
  IF v_orig.replaced_by_garment_id IS NOT NULL THEN
    RAISE EXCEPTION 'create_replacement_garment: original garment already has a replacement';
  END IF;

  -- nextGarmentIdForOrder: max numeric suffix of "<order_id>-<n>" siblings + 1.
  SELECT COALESCE(MAX((split_part(garment_id, '-', 2))::int), 0) + 1
    INTO v_next
    FROM garments
   WHERE order_id = v_orig.order_id
     AND garment_id LIKE v_orig.order_id || '-%'
     AND split_part(garment_id, '-', 2) ~ '^[0-9]+$';
  v_new_garment_id := v_orig.order_id || '-' || v_next;

  INSERT INTO garments (
    order_id, garment_id, measurement_id, garment_type, fabric_id,
    fabric_source, color, shop_name, fabric_length, style, style_id,
    collar_type, collar_button, collar_position, collar_thickness,
    cuffs_type, cuffs_thickness, front_pocket_type, front_pocket_thickness,
    wallet_pocket, pen_holder, mobile_pocket, small_tabaggi,
    jabzour_1, jabzour_2, jabzour_thickness, lines, soaking, express,
    delivery_date, notes, quantity,
    piece_stage, location, in_production, trip_number
  )
  SELECT
    order_id, v_new_garment_id, measurement_id, garment_type, fabric_id,
    fabric_source, color, shop_name, fabric_length,
    COALESCE(style, 'kuwaiti'), style_id,
    collar_type, collar_button, collar_position, collar_thickness,
    cuffs_type, cuffs_thickness, front_pocket_type, front_pocket_thickness,
    COALESCE(wallet_pocket, false), COALESCE(pen_holder, false),
    COALESCE(mobile_pocket, false), COALESCE(small_tabaggi, false),
    jabzour_1, jabzour_2, jabzour_thickness,
    COALESCE(lines, 1), COALESCE(soaking, false), COALESCE(express, false),
    delivery_date, notes, COALESCE(quantity, 1),
    'waiting_cut', 'workshop', false, 1
  FROM garments WHERE id = p_replaces_garment_id
  RETURNING id INTO v_new_id;

  UPDATE garments
     SET replaced_by_garment_id = v_new_id
   WHERE id = p_replaces_garment_id AND replaced_by_garment_id IS NULL;

  RETURN jsonb_build_object('id', v_new_id, 'garment_id', v_new_garment_id);
END;
$$ LANGUAGE plpgsql;

-- 12. RPC: Update order discount (cashier terminal)
CREATE OR REPLACE FUNCTION update_order_discount(
  p_order_id INT,
  p_discount_type TEXT,
  p_discount_value DECIMAL,
  p_discount_percentage DECIMAL DEFAULT NULL,
  p_referral_code TEXT DEFAULT NULL,
  p_new_order_total DECIMAL DEFAULT NULL,
  p_approved_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_subtotal DECIMAL;
  v_final_total DECIMAL;
  v_current_paid DECIMAL;
  v_is_clearing BOOLEAN;
BEGIN
  -- Validate order exists
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_current_paid := COALESCE(v_order.paid, 0);
  v_is_clearing := COALESCE(p_discount_value, 0) = 0;


  -- Compute subtotal (order_total + existing discount)
  v_subtotal := COALESCE(v_order.order_total, 0) + COALESCE(v_order.discount_value, 0);

  -- Determine new total
  IF p_new_order_total IS NOT NULL THEN
    v_final_total := p_new_order_total;
  ELSE
    v_final_total := v_subtotal - COALESCE(p_discount_value, 0);
  END IF;

  IF v_final_total < 0 THEN
    v_final_total := 0;
  END IF;

  -- Prevent discount from dropping order_total below already-paid amount
  IF v_final_total < v_current_paid THEN
    RAISE EXCEPTION 'Discount would reduce order total (%) below amount already paid (%). Refund the excess first.', v_final_total, v_current_paid;
  END IF;

  -- Update order
  UPDATE orders
  SET
    discount_type = p_discount_type::discount_type,
    discount_value = COALESCE(p_discount_value, 0),
    discount_percentage = p_discount_percentage,
    referral_code = p_referral_code,
    discount_approved_by = CASE WHEN v_is_clearing THEN NULL ELSE p_approved_by END,
    discount_reason = CASE WHEN v_is_clearing THEN NULL ELSE p_reason END,
    order_total = v_final_total
  WHERE id = p_order_id;

  -- Revision bumped only on payment/refund recording, not on discount change

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'subtotal', v_subtotal,
    'discount_value', COALESCE(p_discount_value, 0),
    'order_total', v_final_total
  );
END;
$$ LANGUAGE plpgsql;

-- 13. RPC: Cashier dashboard summary (lightweight aggregates, no row transfer)
-- Uses two sources: orders table for billing totals, payment_transactions for actual collections.
-- "today_paid"/"month_paid" = paid-so-far on orders created in that period (order-centric).
-- "today_collected"/"month_collected" = actual cash received in that period (cash-centric).
CREATE OR REPLACE FUNCTION get_cashier_summary(
  p_brand TEXT,
  p_today DATE DEFAULT CURRENT_DATE,
  p_tz_offset_minutes INT DEFAULT 180  -- Kuwait UTC+3 = 180 minutes
)
RETURNS JSONB AS $$
DECLARE
  v_today DATE := p_today;
  v_month_start DATE := date_trunc('month', p_today)::date;
  v_order_stats JSONB;
  v_tx_stats JSONB;
  v_tz_interval INTERVAL;
  v_today_start TIMESTAMP;
  v_today_end TIMESTAMP;
  v_month_utc_start TIMESTAMP;
BEGIN
  -- Convert local date boundaries to UTC for comparing against UTC created_at timestamps
  v_tz_interval := (p_tz_offset_minutes || ' minutes')::interval;
  v_today_start := v_today::timestamp - v_tz_interval;
  v_today_end := (v_today + INTERVAL '1 day')::timestamp - v_tz_interval;
  v_month_utc_start := v_month_start::timestamp - v_tz_interval;

  -- 1. Order-level aggregates (billing, outstanding, counts)
  --    order_date is stored as local date, so direct date comparison is correct
  SELECT jsonb_build_object(
    'all_billed',       COALESCE(SUM(order_total::decimal), 0),
    'all_collected',    COALESCE(SUM(paid::decimal), 0),
    'all_outstanding',  COALESCE(SUM(GREATEST(order_total::decimal - paid::decimal, 0)), 0),
    'today_count',      COUNT(*) FILTER (WHERE order_date::date = v_today),
    'today_billed',     COALESCE(SUM(order_total::decimal) FILTER (WHERE order_date::date = v_today), 0),
    'today_paid',       COALESCE(SUM(paid::decimal) FILTER (WHERE order_date::date = v_today), 0),
    'month_billed',     COALESCE(SUM(order_total::decimal) FILTER (WHERE order_date::date >= v_month_start), 0),
    'month_paid',       COALESCE(SUM(paid::decimal) FILTER (WHERE order_date::date >= v_month_start), 0),
    'month_outstanding',COALESCE(SUM(GREATEST(order_total::decimal - paid::decimal, 0)) FILTER (WHERE order_date::date >= v_month_start), 0),
    'work_count',       COUNT(*) FILTER (WHERE order_type = 'WORK'),
    'sales_count',      COUNT(*) FILTER (WHERE order_type = 'SALES'),
    'unpaid_count',     COUNT(*) FILTER (WHERE order_total::decimal - paid::decimal > 0.001),
    'work_billed',      COALESCE(SUM(order_total::decimal) FILTER (WHERE order_type = 'WORK'), 0),
    'sales_billed',     COALESCE(SUM(order_total::decimal) FILTER (WHERE order_type = 'SALES'), 0),
    'month_work_billed', COALESCE(SUM(order_total::decimal) FILTER (WHERE order_type = 'WORK' AND order_date::date >= v_month_start), 0),
    'month_sales_billed',COALESCE(SUM(order_total::decimal) FILTER (WHERE order_type = 'SALES' AND order_date::date >= v_month_start), 0)
  ) INTO v_order_stats
  FROM orders
  WHERE brand = p_brand::brand AND checkout_status = 'confirmed';

  -- 2. Transaction-level aggregates (actual cash received)
  --    created_at is stored as UTC, so use timezone-corrected boundaries
  SELECT jsonb_build_object(
    'today_collected',  COALESCE(SUM(pt.amount) FILTER (WHERE pt.created_at >= v_today_start AND pt.created_at < v_today_end AND pt.transaction_type = 'payment'), 0),
    'today_refunded',   COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.created_at >= v_today_start AND pt.created_at < v_today_end AND pt.transaction_type = 'refund'), 0),
    'month_collected',  COALESCE(SUM(pt.amount) FILTER (WHERE pt.created_at >= v_month_utc_start AND pt.transaction_type = 'payment'), 0),
    'month_refunded',   COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.created_at >= v_month_utc_start AND pt.transaction_type = 'refund'), 0)
  ) INTO v_tx_stats
  FROM payment_transactions pt
  JOIN orders o ON o.id = pt.order_id
  WHERE o.brand = p_brand::brand AND o.checkout_status = 'confirmed';

  RETURN v_order_stats || v_tx_stats;
END;
$$ LANGUAGE plpgsql;

-- 14. RPC: Get unpaid/paid order IDs (server-side column comparison)
-- PostgREST can't compare two columns (order_total vs paid), so we do it here.
CREATE OR REPLACE FUNCTION get_cashier_order_ids_by_payment(
  p_brand TEXT,
  p_filter TEXT,  -- 'unpaid' or 'paid'
  p_limit INT DEFAULT 30
)
RETURNS SETOF INT AS $$
BEGIN
  IF p_filter = 'unpaid' THEN
    RETURN QUERY
      SELECT id FROM orders
      WHERE brand = p_brand::brand
        AND checkout_status = 'confirmed'
        AND (order_total::decimal - COALESCE(paid::decimal, 0)) > 0.001
      ORDER BY order_date DESC
      LIMIT p_limit;
  ELSIF p_filter = 'paid' THEN
    RETURN QUERY
      SELECT id FROM orders
      WHERE brand = p_brand::brand
        AND checkout_status = 'confirmed'
        AND COALESCE(paid::decimal, 0) >= order_total::decimal
      ORDER BY order_date DESC
      LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS search_customers_fuzzy(TEXT, INT);
-- 15. RPC: Fuzzy customer search using pg_trgm similarity
-- Returns customers as JSONB array ranked by best match across name, phone, arabic_name, nick_name.
-- Uses trigram similarity for typo tolerance + ILIKE as fallback for substring matches.
-- Always returns a bounded result set (p_limit, default 15).
CREATE OR REPLACE FUNCTION search_customers_fuzzy(
  p_query TEXT,
  p_limit INT DEFAULT 15
)
RETURNS JSONB AS $$
DECLARE
  v_query TEXT := LOWER(TRIM(p_query));
  v_result JSONB;
BEGIN
  IF LENGTH(v_query) < 1 THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Set similarity threshold (lower = more fuzzy, default 0.3)
  PERFORM set_config('pg_trgm.similarity_threshold', '0.15', TRUE);

  SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT c.*,
      GREATEST(
        COALESCE(similarity(LOWER(c.name), v_query), 0),
        COALESCE(similarity(LOWER(c.phone), v_query), 0),
        COALESCE(similarity(LOWER(c.arabic_name), v_query), 0),
        COALESCE(similarity(LOWER(c.nick_name), v_query), 0)
      ) AS match_score
    FROM customers c
    WHERE
      LOWER(c.name) % v_query
      OR LOWER(c.phone) % v_query
      OR LOWER(c.arabic_name) % v_query
      OR LOWER(c.nick_name) % v_query
      OR c.name ILIKE '%' || v_query || '%'
      OR c.phone ILIKE '%' || v_query || '%'
      OR c.arabic_name ILIKE '%' || v_query || '%'
      OR c.nick_name ILIKE '%' || v_query || '%'
    ORDER BY match_score DESC, c.name ASC
    LIMIT p_limit
  ) sub;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 16. RPC: Paginated customer search with fuzzy matching
-- Used by the customers list page. Returns page of results + total count.
CREATE OR REPLACE FUNCTION search_customers_paginated(
  p_query TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 20
)
RETURNS JSONB AS $$
DECLARE
  v_query TEXT := LOWER(TRIM(COALESCE(p_query, '')));
  v_offset INT := (p_page - 1) * p_page_size;
  v_data JSONB;
  v_count BIGINT;
BEGIN
  IF v_query = '' THEN
    -- No search: return paginated list ordered by phone
    SELECT COUNT(*) INTO v_count FROM customers;

    SELECT COALESCE(jsonb_agg(row_to_json(c.*)), '[]'::jsonb) INTO v_data
    FROM (
      SELECT
        c.*,
        COALESCE(o.orders_count, 0)::int      AS orders_count,
        o.last_order_at,
        COALESCE(o.outstanding_total, 0)::numeric AS outstanding_total,
        EXISTS (SELECT 1 FROM measurements m WHERE m.customer_id = c.id) AS has_measurements
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)                                                          AS orders_count,
          MAX(o.order_date)                                                 AS last_order_at,
          SUM(GREATEST(COALESCE(o.order_total, 0) - COALESCE(o.paid, 0), 0))
            FILTER (WHERE o.checkout_status = 'confirmed')                  AS outstanding_total
        FROM orders o
        WHERE o.customer_id = c.id
          AND o.checkout_status <> 'cancelled'
      ) o ON TRUE
      ORDER BY c.phone ASC, c.account_type ASC, c.created_at DESC
      OFFSET v_offset LIMIT p_page_size
    ) c;
  ELSE
    -- Fuzzy search with count
    PERFORM set_config('pg_trgm.similarity_threshold', '0.15', TRUE);

    SELECT COUNT(*) INTO v_count
    FROM customers c
    WHERE LOWER(c.name) % v_query
      OR LOWER(c.phone) % v_query
      OR LOWER(c.arabic_name) % v_query
      OR LOWER(c.nick_name) % v_query
      OR c.name ILIKE '%' || v_query || '%'
      OR c.phone ILIKE '%' || v_query || '%'
      OR c.arabic_name ILIKE '%' || v_query || '%'
      OR c.nick_name ILIKE '%' || v_query || '%';

    SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb) INTO v_data
    FROM (
      SELECT c.*,
        GREATEST(
          COALESCE(similarity(LOWER(c.name), v_query), 0),
          COALESCE(similarity(LOWER(c.phone), v_query), 0),
          COALESCE(similarity(LOWER(c.arabic_name), v_query), 0),
          COALESCE(similarity(LOWER(c.nick_name), v_query), 0)
        ) AS match_score,
        COALESCE(o.orders_count, 0)::int      AS orders_count,
        o.last_order_at,
        COALESCE(o.outstanding_total, 0)::numeric AS outstanding_total,
        EXISTS (SELECT 1 FROM measurements m WHERE m.customer_id = c.id) AS has_measurements
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)                                                          AS orders_count,
          MAX(o.order_date)                                                 AS last_order_at,
          SUM(GREATEST(COALESCE(o.order_total, 0) - COALESCE(o.paid, 0), 0))
            FILTER (WHERE o.checkout_status = 'confirmed')                  AS outstanding_total
        FROM orders o
        WHERE o.customer_id = c.id
          AND o.checkout_status <> 'cancelled'
      ) o ON TRUE
      WHERE LOWER(c.name) % v_query
        OR LOWER(c.phone) % v_query
        OR LOWER(c.arabic_name) % v_query
        OR LOWER(c.nick_name) % v_query
        OR c.name ILIKE '%' || v_query || '%'
        OR c.phone ILIKE '%' || v_query || '%'
        OR c.arabic_name ILIKE '%' || v_query || '%'
        OR c.nick_name ILIKE '%' || v_query || '%'
      ORDER BY match_score DESC, c.name ASC
      OFFSET v_offset LIMIT p_page_size
    ) sub;
  END IF;

  RETURN jsonb_build_object('data', v_data, 'count', v_count);
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- PIN AUTHENTICATION (pgcrypto-based hashing)
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash a plaintext PIN using bcrypt
CREATE OR REPLACE FUNCTION hash_pin(p_pin TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN crypt(p_pin, gen_salt('bf', 8));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set a user's PIN (hashes before storing)
CREATE OR REPLACE FUNCTION set_user_pin(p_user_id UUID, p_pin TEXT)
RETURNS VOID AS $$
BEGIN
  IF length(p_pin) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 digits';
  END IF;

  UPDATE users
  SET pin = crypt(p_pin, gen_salt('bf', 8)),
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify PIN and return user data (handles lockout logic server-side)
CREATE OR REPLACE FUNCTION verify_pin(p_username TEXT, p_pin TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user RECORD;
  v_attempts INT;
  v_max_attempts INT := 5;
  v_lockout_minutes INT := 15;
BEGIN
  -- Look up user (case-insensitive)
  SELECT id, username, name, role, department, job_functions, pin, brands,
         failed_login_attempts, locked_until, is_active
  INTO v_user
  FROM users
  WHERE lower(username) = lower(p_username)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF NOT v_user.is_active THEN
    RAISE EXCEPTION 'Account is deactivated';
  END IF;

  -- Check lockout
  IF v_user.locked_until IS NOT NULL AND v_user.locked_until > now() THEN
    RAISE EXCEPTION 'Account locked. Try again in % minutes.',
      ceil(extract(epoch FROM (v_user.locked_until - now())) / 60)::int;
  END IF;

  -- Reset if lock expired
  IF v_user.locked_until IS NOT NULL AND v_user.locked_until <= now() THEN
    UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = v_user.id;
    v_user.failed_login_attempts := 0;
  END IF;

  -- Check PIN is set
  IF v_user.pin IS NULL THEN
    RAISE EXCEPTION 'No PIN set. Ask an admin to set your PIN.';
  END IF;

  -- Verify PIN
  IF v_user.pin = crypt(p_pin, v_user.pin) THEN
    -- Success: reset attempts
    UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = v_user.id;

    RETURN jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'name', v_user.name,
      'role', v_user.role,
      'department', v_user.department,
      'job_functions', v_user.job_functions,
      'brands', v_user.brands
    );
  ELSE
    -- Failed: increment attempts
    v_attempts := coalesce(v_user.failed_login_attempts, 0) + 1;

    IF v_attempts >= v_max_attempts THEN
      UPDATE users
      SET failed_login_attempts = v_attempts,
          locked_until = now() + (v_lockout_minutes || ' minutes')::interval
      WHERE id = v_user.id;
      RAISE EXCEPTION 'Too many failed attempts. Account locked for % minutes.', v_lockout_minutes;
    ELSE
      UPDATE users SET failed_login_attempts = v_attempts WHERE id = v_user.id;
      RAISE EXCEPTION 'Invalid PIN. % attempts remaining.', (v_max_attempts - v_attempts);
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migrate existing plaintext PINs to hashed (run once, idempotent)
-- Plaintext PINs are short numeric strings; bcrypt hashes start with '$2'
CREATE OR REPLACE FUNCTION migrate_plaintext_pins()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE users
  SET pin = crypt(pin, gen_salt('bf', 8))
  WHERE pin IS NOT NULL
    AND pin NOT LIKE '$2%';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Link a Supabase Auth user to our users table (called from Edge Functions)
CREATE OR REPLACE FUNCTION link_auth_id(p_user_id UUID, p_auth_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE users SET auth_id = p_auth_id WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── PIN/Auth RPC access control ──
-- These are SECURITY DEFINER and would otherwise be callable by anon/
-- authenticated via PostgREST. set_user_pin and link_auth_id are
-- account-takeover primitives if exposed; restrict to service_role
-- (Edge Functions). verify_pin and get_login_users stay public — login
-- needs them.
REVOKE EXECUTE ON FUNCTION set_user_pin(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION link_auth_id(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION migrate_plaintext_pins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_user_pin(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION link_auth_id(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION migrate_plaintext_pins() TO service_role;

-- Public RPC: returns active users for login page (no auth required, minimal fields)
CREATE OR REPLACE FUNCTION get_login_users()
RETURNS JSONB AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'username', username,
      'name', name,
      'role', role,
      'department', department,
      'job_functions', job_functions,
      'brands', brands
    ) ORDER BY name
  ), '[]'::jsonb)
  FROM users
  WHERE is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════════════════════
-- RLS HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- All accessor helpers filter `is_active = true`. Deactivated users get NULL
-- from these, which causes downstream RLS predicates to fail (no role match,
-- no department match, etc.) — so flipping `is_active = false` revokes access
-- without waiting for JWT refresh. Pair with `is_active_user()` below for
-- bare auth checks.

-- Get the current user's role from auth.uid() → users.auth_id
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role::text FROM users WHERE auth_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get the current user's department from auth.uid() → users.auth_id
CREATE OR REPLACE FUNCTION get_my_department()
RETURNS TEXT AS $$
  SELECT department::text FROM users WHERE auth_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get the current user's job_functions (empty = office user, not terminal-locked)
CREATE OR REPLACE FUNCTION get_my_job_functions()
RETURNS job_function[] AS $$
  SELECT job_functions FROM users WHERE auth_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Drop the legacy single-value helper. No callers in app code or RLS.
DROP FUNCTION IF EXISTS get_my_job_function();

-- Get the current user's id (users.id, NOT auth.uid()) from auth.uid() → users.auth_id
CREATE OR REPLACE FUNCTION get_my_user_id()
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Raise if the calling user is not active. Use at the top of state-mutating
-- RPCs so that disabling a user (is_active = false) takes effect for live
-- sessions without waiting for their JWT to expire.
CREATE OR REPLACE FUNCTION assert_active_user()
RETURNS VOID AS $$
DECLARE
  v_active BOOLEAN;
BEGIN
  SELECT is_active INTO v_active FROM users WHERE auth_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found for active session';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Your account has been disabled. Please contact a manager.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Replacement for bare `is_active_user()` checks in RLS policies.
-- Returns true only when the JWT maps to an existing, active user row.
-- Combined with the client-side 401 interceptor in db.ts, deactivating or
-- deleting a user causes their next API call to 401 → forced signOut.
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND role IN ('super_admin', 'admin'));
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user is admin or manager
CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND role IN ('super_admin', 'admin', 'manager'));
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user can access a given brand
-- super_admin and workshop users see all brands; shop users only see their assigned brands.
-- All EXISTS checks filter is_active = true so deactivated users return false on every branch.
CREATE OR REPLACE FUNCTION can_access_brand(brand_value TEXT)
RETURNS BOOLEAN AS $$
  SELECT
    -- super_admin sees everything
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND role = 'super_admin')
    -- workshop department sees all brands (they process orders for every brand)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND department = 'workshop')
    -- active user with no brands set = unrestricted (backwards compat). Must
    -- also confirm an active row exists, otherwise deactivated/missing users
    -- would fall through this branch and gain access.
    OR (
      EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true)
      AND NOT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND brands IS NOT NULL AND array_length(brands, 1) > 0)
    )
    -- brand is in the user's brands array (case-insensitive)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND lower(brand_value) = ANY(brands));
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY POLICIES
-- ═══════════════════════════════════════════════════════════════════════

-- ── Users table ─────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Lock out anonymous access entirely. Authenticated SELECT is filtered to
-- non-sensitive columns via column grants below.
DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users FOR SELECT USING (is_active_user());

-- Insert: admin can create any role; managers can create non-admin users in
-- their own department only. The previous policy had an unqualified
-- `department` reference that bound to the EXISTS alias `u.department`,
-- making the dept check a no-op (always true). Use `users.department` to
-- reference the new row.
DROP POLICY IF EXISTS "users_insert" ON users;
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (
  is_admin() OR (
    EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.is_active = true AND u.role = 'manager' AND u.department = users.department)
    AND users.role NOT IN ('admin', 'super_admin')
  )
);

-- Update: row visibility for admin / dept-managers / self.
-- Sensitive columns (role, department, pin, etc.) are protected by column
-- grants below — clients cannot UPDATE them at all; mutations of those
-- fields must go through the auth-admin Edge Function (service_role).
DROP POLICY IF EXISTS "users_update" ON users;
CREATE POLICY "users_update" ON users FOR UPDATE USING (
  is_admin()
  OR (get_my_role() = 'manager' AND department::text = get_my_department())
  OR id = get_my_user_id()
) WITH CHECK (
  is_admin()
  OR (get_my_role() = 'manager' AND department::text = get_my_department())
  OR id = get_my_user_id()
);

-- Column-level grants. Sensitive columns are only writable via service_role
-- (Edge Functions). pin / failed_login_attempts / locked_until are also not
-- readable by clients — they're internal auth state.
REVOKE ALL ON users FROM anon;
REVOKE ALL ON users FROM authenticated;

-- Read access: hide pin and lockout state from clients
GRANT SELECT (
  id, auth_id, username, name, email, country_code, phone,
  role, department, job_functions, brands, is_active,
  employee_id, nationality, hire_date, notes,
  created_at, updated_at
) ON users TO authenticated;

-- Write access: clients can edit display/contact fields. Role, department,
-- job_functions, is_active, brands, username, auth_id, pin, and lockout
-- counters are service_role-only (changed via auth-admin Edge Function).
GRANT UPDATE (
  name, email, country_code, phone,
  employee_id, nationality, hire_date, notes,
  updated_at
) ON users TO authenticated;

-- INSERT/DELETE go through Edge Functions (service_role). No direct client
-- writes — RLS would catch admin inserts, but column grants are belt+braces.

-- service_role needs full access for Edge Functions (auth-admin, auth-login).
-- The REVOKE ALL above only targets anon/authenticated, but drizzle-kit
-- recreating tables strips service_role's grants too — re-grant the
-- Supabase default so admin paths keep working.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- ── User Sessions (Presence) ────────────────────────────────────────
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Everyone can read sessions (needed for online indicators)
DROP POLICY IF EXISTS "sessions_select" ON user_sessions;
CREATE POLICY "sessions_select" ON user_sessions FOR SELECT USING (true);

-- Users can manage their own sessions
DROP POLICY IF EXISTS "sessions_insert" ON user_sessions;
CREATE POLICY "sessions_insert" ON user_sessions FOR INSERT WITH CHECK (
  user_id = get_my_user_id()
);

DROP POLICY IF EXISTS "sessions_update" ON user_sessions;
CREATE POLICY "sessions_update" ON user_sessions FOR UPDATE USING (
  user_id = get_my_user_id()
);

DROP POLICY IF EXISTS "sessions_delete" ON user_sessions;
CREATE POLICY "sessions_delete" ON user_sessions FOR DELETE USING (
  user_id = get_my_user_id()
);

-- ── Customers ───────────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select" ON customers;
CREATE POLICY "customers_select" ON customers FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "customers_insert" ON customers;
CREATE POLICY "customers_insert" ON customers FOR INSERT WITH CHECK (is_active_user());

DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_update" ON customers FOR UPDATE USING (is_manager_or_above() OR get_my_department() = 'shop');

-- ── Prices ──────────────────────────────────────────────────────────
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prices_select" ON prices;
CREATE POLICY "prices_select" ON prices FOR SELECT USING (
  is_active_user() AND can_access_brand(brand::text)
);

DROP POLICY IF EXISTS "prices_modify" ON prices;
CREATE POLICY "prices_modify" ON prices FOR ALL USING (
  is_admin() OR (get_my_role() = 'manager' AND get_my_department() = 'workshop')
);

-- ── Lookups (campaigns, styles, fabrics, shelf) ─────────────────────
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns_select" ON campaigns;
CREATE POLICY "campaigns_select" ON campaigns FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "styles_select" ON styles;
CREATE POLICY "styles_select" ON styles FOR SELECT USING (
  is_active_user() AND (brand IS NULL OR can_access_brand(brand::text))
);
DROP POLICY IF EXISTS "fabrics_select" ON fabrics;
CREATE POLICY "fabrics_select" ON fabrics FOR SELECT USING (is_active_user());
DROP POLICY IF EXISTS "shelf_select" ON shelf;
CREATE POLICY "shelf_select" ON shelf FOR SELECT USING (
  is_active_user() AND (brand IS NULL OR can_access_brand(brand::text))
);

DROP POLICY IF EXISTS "campaigns_modify" ON campaigns;
CREATE POLICY "campaigns_modify" ON campaigns FOR ALL USING (is_manager_or_above());
DROP POLICY IF EXISTS "styles_modify" ON styles;
CREATE POLICY "styles_modify" ON styles FOR ALL USING (is_manager_or_above());
DROP POLICY IF EXISTS "fabrics_modify" ON fabrics;
CREATE POLICY "fabrics_modify" ON fabrics FOR ALL USING (is_manager_or_above());
DROP POLICY IF EXISTS "shelf_modify" ON shelf;
CREATE POLICY "shelf_modify" ON shelf FOR ALL USING (is_manager_or_above());

-- ── Measurements ────────────────────────────────────────────────────
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "measurements_select" ON measurements;
CREATE POLICY "measurements_select" ON measurements FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "measurements_insert" ON measurements;
CREATE POLICY "measurements_insert" ON measurements FOR INSERT WITH CHECK (is_active_user());

DROP POLICY IF EXISTS "measurements_update" ON measurements;
CREATE POLICY "measurements_update" ON measurements FOR UPDATE USING (is_active_user());

-- ── Orders ──────────────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (
  is_active_user() AND can_access_brand(brand::text)
);

DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (
  (is_manager_or_above() OR get_my_department() = 'shop') AND can_access_brand(brand::text)
);

DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (
  (is_manager_or_above() OR get_my_department() IN ('shop','workshop')) AND can_access_brand(brand::text)
);

-- ── Work Orders ─────────────────────────────────────────────────────
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_orders_select" ON work_orders;
CREATE POLICY "work_orders_select" ON work_orders FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "work_orders_insert" ON work_orders;
CREATE POLICY "work_orders_insert" ON work_orders FOR INSERT WITH CHECK (
  (is_manager_or_above() OR get_my_department() = 'shop')
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = work_orders.order_id AND can_access_brand(o.brand::text)
  )
);

DROP POLICY IF EXISTS "work_orders_update" ON work_orders;
CREATE POLICY "work_orders_update" ON work_orders FOR UPDATE USING (
  (is_manager_or_above() OR get_my_department() IN ('shop','workshop'))
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = work_orders.order_id AND can_access_brand(o.brand::text)
  )
);

-- ── Garments ────────────────────────────────────────────────────────
ALTER TABLE garments ENABLE ROW LEVEL SECURITY;

-- Garments are scoped by department (shop + workshop both need reads) AND by
-- the brand of the parent order. Closes the prior open-to-any-authed-user gap
-- where shop users in one brand could read garments from another brand.
DROP POLICY IF EXISTS "garments_select" ON garments;
CREATE POLICY "garments_select" ON garments FOR SELECT USING (
  (is_manager_or_above() OR get_my_department() IN ('shop','workshop'))
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = garments.order_id AND can_access_brand(o.brand::text)
  )
);

DROP POLICY IF EXISTS "garments_insert" ON garments;
CREATE POLICY "garments_insert" ON garments FOR INSERT WITH CHECK (
  (is_manager_or_above() OR get_my_department() = 'shop')
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = garments.order_id AND can_access_brand(o.brand::text)
  )
);

DROP POLICY IF EXISTS "garments_update" ON garments;
CREATE POLICY "garments_update" ON garments FOR UPDATE USING (
  (is_manager_or_above() OR get_my_department() IN ('shop','workshop'))
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = garments.order_id AND can_access_brand(o.brand::text)
  )
);

-- ── Garment Feedback ────────────────────────────────────────────────
ALTER TABLE garment_feedback ENABLE ROW LEVEL SECURITY;

-- Feedback inherits garment scoping. Join via garment → order → brand.
DROP POLICY IF EXISTS "feedback_select" ON garment_feedback;
CREATE POLICY "feedback_select" ON garment_feedback FOR SELECT USING (
  (is_manager_or_above() OR get_my_department() IN ('shop','workshop'))
  AND EXISTS (
    SELECT 1 FROM garments g
    JOIN orders o ON o.id = g.order_id
    WHERE g.id = garment_feedback.garment_id AND can_access_brand(o.brand::text)
  )
);

DROP POLICY IF EXISTS "feedback_insert" ON garment_feedback;
CREATE POLICY "feedback_insert" ON garment_feedback FOR INSERT WITH CHECK (is_active_user());

DROP POLICY IF EXISTS "feedback_update" ON garment_feedback;
CREATE POLICY "feedback_update" ON garment_feedback FOR UPDATE USING (
  is_manager_or_above() OR get_my_department() IN ('shop','workshop')
);

-- ── Resources (Workshop Workers) ────────────────────────────────────
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resources_select" ON resources;
CREATE POLICY "resources_select" ON resources FOR SELECT USING (
  is_active_user() AND (brand IS NULL OR can_access_brand(brand::text))
);

DROP POLICY IF EXISTS "resources_modify" ON resources;
CREATE POLICY "resources_modify" ON resources FOR ALL USING (
  is_admin() OR (get_my_role() = 'manager' AND get_my_department() = 'workshop')
);

-- ── Order Shelf Items ───────────────────────────────────────────────
ALTER TABLE order_shelf_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shelf_items_select" ON order_shelf_items;
CREATE POLICY "shelf_items_select" ON order_shelf_items FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "shelf_items_insert" ON order_shelf_items;
CREATE POLICY "shelf_items_insert" ON order_shelf_items FOR INSERT WITH CHECK (
  (is_manager_or_above() OR get_my_department() = 'shop')
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_shelf_items.order_id AND can_access_brand(o.brand::text)
  )
);

DROP POLICY IF EXISTS "shelf_items_update" ON order_shelf_items;
CREATE POLICY "shelf_items_update" ON order_shelf_items FOR UPDATE USING (
  (is_manager_or_above() OR get_my_department() = 'shop')
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_shelf_items.order_id AND can_access_brand(o.brand::text)
  )
);

-- ── Payment Transactions ────────────────────────────────────────────
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Brand-scoped: a logged-in user may only read transactions for orders whose
-- brand they're allowed to access. Without this, a SAKKBA/QASS user could
-- query ERTH transactions directly via the SDK and bypass the RPC's p_brand
-- filter. RLS is the load-bearing check; the RPC param is a UX hint.
DROP POLICY IF EXISTS "payments_select" ON payment_transactions;
CREATE POLICY "payments_select" ON payment_transactions FOR SELECT USING (
  is_active_user() AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = payment_transactions.order_id AND can_access_brand(o.brand::text)
  )
);

DROP POLICY IF EXISTS "payments_insert" ON payment_transactions;
CREATE POLICY "payments_insert" ON payment_transactions FOR INSERT WITH CHECK (
  (is_manager_or_above() OR get_my_department() = 'shop')
  AND EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = payment_transactions.order_id AND can_access_brand(o.brand::text)
  )
);

DROP POLICY IF EXISTS "payments_update" ON payment_transactions;
CREATE POLICY "payments_update" ON payment_transactions FOR UPDATE USING (is_admin());

-- ── Register Sessions ───────────────────────────────────────────────
-- Brand-scoped; writes go through open/close/reopen RPCs which already
-- enforce brand + role checks. RLS here is the second line of defense.
ALTER TABLE register_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "register_sessions_select" ON register_sessions;
CREATE POLICY "register_sessions_select" ON register_sessions FOR SELECT USING (
  is_active_user() AND can_access_brand(brand::text)
);

DROP POLICY IF EXISTS "register_sessions_insert" ON register_sessions;
CREATE POLICY "register_sessions_insert" ON register_sessions FOR INSERT WITH CHECK (
  (is_manager_or_above() OR get_my_department() = 'shop') AND can_access_brand(brand::text)
);

DROP POLICY IF EXISTS "register_sessions_update" ON register_sessions;
CREATE POLICY "register_sessions_update" ON register_sessions FOR UPDATE USING (
  (is_manager_or_above() OR get_my_department() = 'shop') AND can_access_brand(brand::text)
);

-- ── Register Cash Movements ─────────────────────────────────────────
ALTER TABLE register_cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "register_cash_movements_select" ON register_cash_movements;
CREATE POLICY "register_cash_movements_select" ON register_cash_movements FOR SELECT USING (
  is_active_user() AND EXISTS (
    SELECT 1 FROM register_sessions s
    WHERE s.id = register_cash_movements.register_session_id
      AND can_access_brand(s.brand::text)
  )
);

DROP POLICY IF EXISTS "register_cash_movements_insert" ON register_cash_movements;
CREATE POLICY "register_cash_movements_insert" ON register_cash_movements FOR INSERT WITH CHECK (
  (is_manager_or_above() OR get_my_department() = 'shop')
  AND EXISTS (
    SELECT 1 FROM register_sessions s
    WHERE s.id = register_cash_movements.register_session_id
      AND can_access_brand(s.brand::text)
  )
);

-- ── Register Close Events ───────────────────────────────────────────
-- Append-only audit log. Writes only via close_register RPC (SECURITY INVOKER
-- runs as the caller, so the INSERT policy still applies). No UPDATE/DELETE
-- policies — history must be immutable.
ALTER TABLE register_close_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "register_close_events_select" ON register_close_events;
CREATE POLICY "register_close_events_select" ON register_close_events FOR SELECT USING (
  is_active_user() AND EXISTS (
    SELECT 1 FROM register_sessions s
    WHERE s.id = register_close_events.register_session_id
      AND can_access_brand(s.brand::text)
  )
);

DROP POLICY IF EXISTS "register_close_events_insert" ON register_close_events;
CREATE POLICY "register_close_events_insert" ON register_close_events FOR INSERT WITH CHECK (
  (is_manager_or_above() OR get_my_department() = 'shop')
  AND EXISTS (
    SELECT 1 FROM register_sessions s
    WHERE s.id = register_close_events.register_session_id
      AND can_access_brand(s.brand::text)
  )
);

-- ── Transfer Requests ───────────────────────────────────────────────
-- RLS is required here not for access control (policies are permissive) but
-- because Supabase Realtime's postgres_changes channel refuses to broadcast
-- events for tables without RLS + SELECT policies. Without this, realtime
-- updates for transfers never reach the other department.
ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfer_requests_select" ON transfer_requests;
CREATE POLICY "transfer_requests_select" ON transfer_requests
    FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "transfer_requests_insert" ON transfer_requests;
CREATE POLICY "transfer_requests_insert" ON transfer_requests
    FOR INSERT WITH CHECK (is_active_user());

DROP POLICY IF EXISTS "transfer_requests_update" ON transfer_requests;
CREATE POLICY "transfer_requests_update" ON transfer_requests
    FOR UPDATE USING (is_active_user());

DROP POLICY IF EXISTS "transfer_requests_delete" ON transfer_requests;
CREATE POLICY "transfer_requests_delete" ON transfer_requests
    FOR DELETE USING (is_active_user());

ALTER TABLE transfer_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfer_request_items_select" ON transfer_request_items;
CREATE POLICY "transfer_request_items_select" ON transfer_request_items
    FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "transfer_request_items_insert" ON transfer_request_items;
CREATE POLICY "transfer_request_items_insert" ON transfer_request_items
    FOR INSERT WITH CHECK (is_active_user());

DROP POLICY IF EXISTS "transfer_request_items_update" ON transfer_request_items;
CREATE POLICY "transfer_request_items_update" ON transfer_request_items
    FOR UPDATE USING (is_active_user());

DROP POLICY IF EXISTS "transfer_request_items_delete" ON transfer_request_items;
CREATE POLICY "transfer_request_items_delete" ON transfer_request_items
    FOR DELETE USING (is_active_user());

-- ── Appointments ────────────────────────────────────────────────────
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments_select" ON appointments;
CREATE POLICY "appointments_select" ON appointments FOR SELECT USING (
  is_active_user() AND (brand IS NULL OR can_access_brand(brand::text))
);

DROP POLICY IF EXISTS "appointments_insert" ON appointments;
CREATE POLICY "appointments_insert" ON appointments FOR INSERT WITH CHECK (
  is_active_user() AND (brand IS NULL OR can_access_brand(brand::text))
);

DROP POLICY IF EXISTS "appointments_update" ON appointments;
CREATE POLICY "appointments_update" ON appointments FOR UPDATE USING (
  (is_manager_or_above() OR assigned_to = get_my_user_id()) AND (brand IS NULL OR can_access_brand(brand::text))
);

-- ═══════════════════════════════════════════════════════════════════════
-- END OF DAY REPORT
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_eod_report(
  p_brand TEXT,
  p_date_from DATE,
  p_date_to DATE,
  p_tz_offset_minutes INT DEFAULT 180  -- Kuwait UTC+3 = 180 minutes
)
RETURNS JSONB AS $$
DECLARE
  v_order_stats JSONB;
  v_tx_stats JSONB;
  v_deposit_stats JSONB;
  v_cancel_stats JSONB;
  v_invoice_stats JSONB;
  v_ar_outstanding NUMERIC;
  v_delivered_count INT;
  v_by_method JSONB;
  v_daily JSONB;
  v_by_cashier JSONB;
  v_tz_interval INTERVAL;
  v_tx_start TIMESTAMP;
  v_tx_end TIMESTAMP;
BEGIN
  -- Convert local date boundaries to UTC for comparing against UTC created_at timestamps
  v_tz_interval := (p_tz_offset_minutes || ' minutes')::interval;
  v_tx_start := p_date_from::timestamp - v_tz_interval;
  v_tx_end := (p_date_to + INTERVAL '1 day')::timestamp - v_tz_interval;

  -- 1. Order-level aggregates for confirmed orders in range
  --    order_date is stored as local date, so direct comparison is correct
  SELECT jsonb_build_object(
    'order_count',     COUNT(*),
    'work_count',      COUNT(*) FILTER (WHERE order_type = 'WORK'),
    'sales_count',     COUNT(*) FILTER (WHERE order_type = 'SALES'),
    'gross_sales',     COALESCE(SUM(order_total::decimal), 0),
    'total_billed',    COALESCE(SUM(order_total::decimal), 0),
    'discount_total',  COALESCE(SUM(discount_value::decimal), 0),
    'outstanding',     COALESCE(SUM(GREATEST(order_total::decimal - paid::decimal, 0)), 0),
    'avg_order_value', COALESCE(
      CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(order_total::decimal) / COUNT(*), 3) ELSE 0 END,
      0
    )
  ) INTO v_order_stats
  FROM orders
  WHERE brand = p_brand::brand
    AND checkout_status = 'confirmed'
    AND order_date >= p_date_from::timestamp
    AND order_date < (p_date_to + INTERVAL '1 day')::timestamp;

  -- 1b. Cancellation aggregates (separate because they're excluded from confirmed filter)
  SELECT jsonb_build_object(
    'cancelled_count',  COUNT(*),
    'cancelled_billed', COALESCE(SUM(order_total::decimal), 0)
  ) INTO v_cancel_stats
  FROM orders
  WHERE brand = p_brand::brand
    AND checkout_status = 'cancelled'
    AND order_date >= p_date_from::timestamp
    AND order_date < (p_date_to + INTERVAL '1 day')::timestamp;

  -- 1c. Invoice number range (WORK orders only — SALES don't carry invoice_number)
  SELECT jsonb_build_object(
    'invoice_first', MIN(wo.invoice_number),
    'invoice_last',  MAX(wo.invoice_number)
  ) INTO v_invoice_stats
  FROM work_orders wo
  JOIN orders o ON o.id = wo.order_id
  WHERE o.brand = p_brand::brand
    AND o.checkout_status = 'confirmed'
    AND wo.invoice_number IS NOT NULL
    AND o.order_date >= p_date_from::timestamp
    AND o.order_date < (p_date_to + INTERVAL '1 day')::timestamp;

  -- 1d. AR Outstanding (all-time, not date-scoped — total customer balances owed)
  SELECT COALESCE(SUM(GREATEST(order_total::decimal - paid::decimal, 0)), 0)
  INTO v_ar_outstanding
  FROM orders
  WHERE brand = p_brand::brand
    AND checkout_status = 'confirmed'
    AND order_total::decimal > paid::decimal;

  -- 1e. Garments collected/delivered in range (customer hand-over events)
  SELECT COUNT(DISTINCT gf.garment_id)
  INTO v_delivered_count
  FROM garment_feedback gf
  JOIN orders o ON o.id = gf.order_id
  WHERE o.brand = p_brand::brand
    AND gf.action IN ('collected', 'delivered')
    AND gf.created_at >= v_tx_start
    AND gf.created_at < v_tx_end;

  -- 2. Transaction-level aggregates (actual money movement)
  --    created_at is UTC, so use timezone-corrected boundaries
  SELECT jsonb_build_object(
    'total_collected', COALESCE(SUM(pt.amount) FILTER (WHERE pt.transaction_type = 'payment'), 0),
    'total_refunded',  COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.transaction_type = 'refund'), 0),
    'net_revenue',
      COALESCE(SUM(pt.amount) FILTER (WHERE pt.transaction_type = 'payment'), 0) -
      COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.transaction_type = 'refund'), 0),
    'transaction_count', COUNT(*)
  ) INTO v_tx_stats
  FROM payment_transactions pt
  JOIN orders o ON o.id = pt.order_id
  WHERE o.brand = p_brand::brand
    AND o.checkout_status = 'confirmed'
    AND pt.created_at >= v_tx_start
    AND pt.created_at < v_tx_end;

  -- 2b. Deposit vs Balance split
  --     Derive: a payment_transaction is a "deposit" if it is the chronologically
  --     first 'payment' (non-refund) row for its order. All subsequent payments
  --     against the same order are "balance" settlements. Refunds are excluded
  --     from both buckets (they're already in total_refunded).
  --     The deposit may have been recorded BEFORE the range — what matters here
  --     is which payments INSIDE the range count as deposit vs balance.
  WITH ranked_payments AS (
    SELECT
      pt.id,
      pt.amount,
      pt.created_at,
      pt.order_id,
      ROW_NUMBER() OVER (
        PARTITION BY pt.order_id
        ORDER BY pt.created_at, pt.id
      ) AS payment_seq
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    WHERE o.brand = p_brand::brand
      AND o.checkout_status = 'confirmed'
      AND pt.transaction_type = 'payment'
  )
  SELECT jsonb_build_object(
    'deposit_collected', COALESCE(SUM(amount) FILTER (WHERE payment_seq = 1), 0),
    'balance_collected', COALESCE(SUM(amount) FILTER (WHERE payment_seq > 1), 0)
  ) INTO v_deposit_stats
  FROM ranked_payments
  WHERE created_at >= v_tx_start
    AND created_at < v_tx_end;

  -- 3. Breakdown by payment method
  SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb) INTO v_by_method
  FROM (
    SELECT
      pt.payment_type,
      COALESCE(SUM(pt.amount) FILTER (WHERE pt.transaction_type = 'payment'), 0) AS total,
      COUNT(*) FILTER (WHERE pt.transaction_type = 'payment') AS count,
      COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.transaction_type = 'refund'), 0) AS refund_total
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    WHERE o.brand = p_brand::brand
      AND o.checkout_status = 'confirmed'
      AND pt.created_at >= v_tx_start
      AND pt.created_at < v_tx_end
    GROUP BY pt.payment_type
    ORDER BY total DESC
  ) sub;

  -- 4. Daily breakdown (for trend charts)
  --    Group by local date (shift UTC created_at to local time before extracting date)
  SELECT COALESCE(jsonb_agg(row_to_json(sub.*) ORDER BY sub.date), '[]'::jsonb) INTO v_daily
  FROM (
    SELECT
      (pt.created_at + v_tz_interval)::date AS date,
      COALESCE(SUM(pt.amount) FILTER (WHERE pt.transaction_type = 'payment'), 0) AS collected,
      COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.transaction_type = 'refund'), 0) AS refunded,
      COUNT(*) FILTER (WHERE pt.transaction_type = 'payment') AS payment_count,
      COUNT(*) FILTER (WHERE pt.transaction_type = 'refund') AS refund_count
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    WHERE o.brand = p_brand::brand
      AND o.checkout_status = 'confirmed'
      AND pt.created_at >= v_tx_start
      AND pt.created_at < v_tx_end
    GROUP BY (pt.created_at + v_tz_interval)::date
    ORDER BY (pt.created_at + v_tz_interval)::date
  ) sub;

  -- 5. Per-cashier breakdown
  SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb) INTO v_by_cashier
  FROM (
    SELECT
      u.name AS cashier_name,
      COALESCE(SUM(pt.amount) FILTER (WHERE pt.transaction_type = 'payment'), 0) AS collected,
      COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.transaction_type = 'refund'), 0) AS refunded,
      COUNT(*) AS transaction_count
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    LEFT JOIN users u ON u.id = pt.cashier_id
    WHERE o.brand = p_brand::brand
      AND o.checkout_status = 'confirmed'
      AND pt.created_at >= v_tx_start
      AND pt.created_at < v_tx_end
    GROUP BY u.name
    ORDER BY collected DESC
  ) sub;

  RETURN v_order_stats || v_tx_stats || v_deposit_stats || v_cancel_stats || v_invoice_stats
    || jsonb_build_object('ar_outstanding', v_ar_outstanding)
    || jsonb_build_object('delivered_count', v_delivered_count)
    || jsonb_build_object('by_payment_method', v_by_method)
    || jsonb_build_object('daily', v_daily)
    || jsonb_build_object('by_cashier', v_by_cashier);
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- REGISTER SESSION MANAGEMENT
-- ═══════════════════════════════════════════════════════════════════════════════

-- Get the register session for a given date, or fall back to the most recent open
-- session if none exists for that date. This handles shops that stay open past
-- midnight without closing the register first.
CREATE OR REPLACE FUNCTION get_register_session(p_brand TEXT, p_date DATE DEFAULT CURRENT_DATE)
RETURNS JSONB AS $$
DECLARE
  v_session JSONB;
  v_today DATE;
BEGIN
  -- Always use Kuwait server time, not the client's p_date. A laptop in another
  -- timezone (or with a drifted clock) would otherwise compute a date past
  -- Kuwait midnight and trigger the stale-session fallback against today's
  -- legitimate open session. p_date kept in the signature for client compat.
  v_today := (now() AT TIME ZONE 'Asia/Kuwait')::date;

  SELECT jsonb_build_object(
    'id', rs.id,
    'brand', rs.brand,
    'date', rs.date,
    'status', rs.status,
    'opened_by', rs.opened_by,
    'opened_by_name', ou.name,
    'opened_at', rs.opened_at,
    'opening_float', rs.opening_float,
    'closed_by', rs.closed_by,
    'closed_by_name', cu.name,
    'closed_at', rs.closed_at,
    'closing_counted_cash', rs.closing_counted_cash,
    'expected_cash', rs.expected_cash,
    'variance', rs.variance,
    'closing_notes', rs.closing_notes,
    'reopened_by', rs.reopened_by,
    'reopened_by_name', ru.name,
    'reopened_at', rs.reopened_at,
    'cash_movements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cm.id, 'type', cm.type, 'reason_category', cm.reason_category,
        'amount', cm.amount, 'reason', cm.reason,
        'performed_by_name', pu.name, 'created_at', cm.created_at
      ) ORDER BY cm.created_at)
      FROM register_cash_movements cm
      LEFT JOIN users pu ON pu.id = cm.performed_by
      WHERE cm.register_session_id = rs.id
    ), '[]'::jsonb),
    'close_events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ce.id,
        'closed_by_name', ceu.name,
        'closed_at', ce.closed_at,
        'opening_float', ce.opening_float,
        'counted_cash', ce.counted_cash,
        'expected_cash', ce.expected_cash,
        'variance', ce.variance,
        'notes', ce.notes
      ) ORDER BY ce.closed_at)
      FROM register_close_events ce
      LEFT JOIN users ceu ON ceu.id = ce.closed_by
      WHERE ce.register_session_id = rs.id
    ), '[]'::jsonb),
    -- Session-scoped cash transaction tally. Lets the close dialog preview
    -- expected cash & variance client-side without a second round-trip.
    'tx_summary', (
      SELECT jsonb_build_object(
        'cash_payment_count',  COUNT(*) FILTER (WHERE pt.transaction_type = 'payment' AND pt.payment_type = 'cash'),
        'cash_payment_total',  COALESCE(SUM(pt.amount) FILTER (WHERE pt.transaction_type = 'payment' AND pt.payment_type = 'cash'), 0),
        'cash_refund_count',   COUNT(*) FILTER (WHERE pt.transaction_type = 'refund'  AND pt.payment_type = 'cash'),
        'cash_refund_total',   COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.transaction_type = 'refund' AND pt.payment_type = 'cash'), 0),
        'noncash_payment_count', COUNT(*) FILTER (WHERE pt.transaction_type = 'payment' AND pt.payment_type <> 'cash'),
        'noncash_payment_total', COALESCE(SUM(pt.amount) FILTER (WHERE pt.transaction_type = 'payment' AND pt.payment_type <> 'cash'), 0)
      )
      FROM payment_transactions pt
      WHERE pt.register_session_id = rs.id
    )
  ) INTO v_session
  FROM register_sessions rs
  LEFT JOIN users ou ON ou.id = rs.opened_by
  LEFT JOIN users cu ON cu.id = rs.closed_by
  LEFT JOIN users ru ON ru.id = rs.reopened_by
  WHERE rs.brand = p_brand::brand
    AND (
      rs.date = v_today
      OR (rs.status = 'open' AND rs.date < v_today)
    )
  ORDER BY
    (rs.date = v_today) DESC,  -- prefer today's session
    rs.date DESC               -- then most recent open session
  LIMIT 1;

  RETURN COALESCE(v_session, 'null'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Open register for the day
CREATE OR REPLACE FUNCTION open_register(p_brand TEXT, p_date DATE, p_user_id UUID, p_opening_float DECIMAL)
RETURNS JSONB AS $$
DECLARE
  v_id INT;
  v_my_user_id UUID;
  v_today DATE;
BEGIN
  PERFORM assert_active_user();

  -- Brand isolation: caller must have access to the brand they're opening.
  IF NOT can_access_brand(p_brand) THEN
    RAISE EXCEPTION 'You do not have access to brand %', p_brand;
  END IF;

  -- Caller may only open under their own user id (managers/admins may impersonate).
  v_my_user_id := get_my_user_id();
  IF p_user_id IS DISTINCT FROM v_my_user_id AND NOT is_manager_or_above() THEN
    RAISE EXCEPTION 'Cannot open register under another user';
  END IF;

  -- Always use Kuwait server time, not the client's p_date (clock-skew safety).
  v_today := (now() AT TIME ZONE 'Asia/Kuwait')::date;

  IF EXISTS (SELECT 1 FROM register_sessions WHERE brand = p_brand::brand AND date = v_today) THEN
    RAISE EXCEPTION 'Register already opened for % on %', p_brand, v_today;
  END IF;

  IF EXISTS (SELECT 1 FROM register_sessions WHERE brand = p_brand::brand AND status = 'open' AND date < v_today) THEN
    RAISE EXCEPTION 'A previous register session is still open. Close it before opening a new one.';
  END IF;

  INSERT INTO register_sessions (brand, date, opened_by, opening_float, status)
  VALUES (p_brand::brand, v_today, p_user_id, p_opening_float, 'open')
  RETURNING id INTO v_id;

  -- Return the full session payload (same shape as get_register_session) so
  -- callers can populate their cache without waiting on a refetch round-trip.
  RETURN get_register_session(p_brand, v_today);
END;
$$ LANGUAGE plpgsql;

-- Close register — computes expected cash server-side.
-- Uses register_session_id on payment_transactions for exact attribution
-- (replaces the old time-window approach that mis-handled cross-midnight sessions).
-- p_tz_offset_minutes is retained for client API compatibility but unused.
DROP FUNCTION IF EXISTS close_register(integer, uuid, numeric, text, integer);
CREATE OR REPLACE FUNCTION close_register(
  p_session_id INT,
  p_user_id UUID,
  p_counted_cash DECIMAL,
  p_notes TEXT DEFAULT NULL,
  p_tz_offset_minutes INT DEFAULT 180,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
  v_cash_payments DECIMAL;
  v_cash_refunds DECIMAL;
  v_cash_in DECIMAL;
  v_cash_out DECIMAL;
  v_expected DECIMAL;
  v_variance DECIMAL;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not write a duplicate close event.
  -- Returns the original close summary (variance/expected) on replay.
  IF NOT idem_claim(p_idempotency_key, 'close_register') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  PERFORM assert_active_user();

  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Register session not found or already closed';
  END IF;

  -- Brand isolation: caller must have access to the session's brand.
  IF NOT can_access_brand(v_session.brand::text) THEN
    RAISE EXCEPTION 'You do not have access to this register session';
  END IF;

  -- Sum cash payments/refunds attached to THIS session (exact attribution).
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'payment'), 0),
    COALESCE(SUM(ABS(amount)) FILTER (WHERE transaction_type = 'refund'), 0)
  INTO v_cash_payments, v_cash_refunds
  FROM payment_transactions
  WHERE register_session_id = p_session_id
    AND payment_type = 'cash';

  -- Sum cash movements
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'cash_in'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'cash_out'), 0)
  INTO v_cash_in, v_cash_out
  FROM register_cash_movements
  WHERE register_session_id = p_session_id;

  v_expected := v_session.opening_float + v_cash_payments - v_cash_refunds + v_cash_in - v_cash_out;
  v_variance := p_counted_cash - v_expected;

  UPDATE register_sessions SET
    status = 'closed',
    closed_by = p_user_id,
    closed_at = NOW(),
    closing_counted_cash = p_counted_cash,
    expected_cash = v_expected,
    variance = v_variance,
    closing_notes = p_notes
  WHERE id = p_session_id;

  -- Append-only close event. register_sessions only keeps the LATEST close
  -- (overwritten on every reopen+reclose). This log preserves the full history
  -- so a shortage recorded at first close isn't lost when the session is
  -- reopened for a late sale and reclosed clean.
  INSERT INTO register_close_events (
    register_session_id, closed_by, opening_float,
    counted_cash, expected_cash, variance, notes
  ) VALUES (
    p_session_id, p_user_id, v_session.opening_float,
    p_counted_cash, v_expected, v_variance, p_notes
  );

  v_result := jsonb_build_object(
    'status', 'closed',
    'opening_float', v_session.opening_float,
    'cash_payments', v_cash_payments,
    'cash_refunds', v_cash_refunds,
    'cash_in', v_cash_in,
    'cash_out', v_cash_out,
    'expected_cash', v_expected,
    'counted_cash', p_counted_cash,
    'variance', v_variance
  );
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Add a cash movement (cash in or cash out).
-- Uses register_session_id on payment_transactions for exact attribution.
-- p_tz_offset_minutes is retained for client API compatibility but unused.
-- Drop the prior signature first — adding p_reason_category as the trailing
-- param creates a NEW function unless the old one is dropped explicitly.
DROP FUNCTION IF EXISTS add_cash_movement(INT, TEXT, DECIMAL, TEXT, UUID, INT);
DROP FUNCTION IF EXISTS add_cash_movement(INT, TEXT, DECIMAL, TEXT, UUID, INT, TEXT);
CREATE OR REPLACE FUNCTION add_cash_movement(
  p_session_id INT,
  p_type TEXT,
  p_amount DECIMAL,
  p_reason TEXT,
  p_user_id UUID,
  p_tz_offset_minutes INT DEFAULT 180,
  p_reason_category TEXT DEFAULT 'other',
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_id INT;
  v_session RECORD;
  v_cash_payments DECIMAL;
  v_cash_refunds DECIMAL;
  v_cash_in DECIMAL;
  v_cash_out DECIMAL;
  v_drawer_balance DECIMAL;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not insert a duplicate cash
  -- movement (accumulating ledger row). Returns the original {id} on replay.
  IF NOT idem_claim(p_idempotency_key, 'add_cash_movement') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  PERFORM assert_active_user();

  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Register session not found or not open';
  END IF;

  -- Brand isolation: caller must have access to the session's brand.
  IF NOT can_access_brand(v_session.brand::text) THEN
    RAISE EXCEPTION 'You do not have access to this register session';
  END IF;

  -- For cash_out, verify sufficient drawer balance.
  IF p_type = 'cash_out' THEN
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'payment'), 0),
      COALESCE(SUM(ABS(amount)) FILTER (WHERE transaction_type = 'refund'), 0)
    INTO v_cash_payments, v_cash_refunds
    FROM payment_transactions
    WHERE register_session_id = p_session_id
      AND payment_type = 'cash';

    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type = 'cash_in'), 0),
      COALESCE(SUM(amount) FILTER (WHERE type = 'cash_out'), 0)
    INTO v_cash_in, v_cash_out
    FROM register_cash_movements
    WHERE register_session_id = p_session_id;

    v_drawer_balance := v_session.opening_float + v_cash_payments - v_cash_refunds + v_cash_in - v_cash_out;

    IF p_amount > v_drawer_balance THEN
      RAISE EXCEPTION 'Cash out amount (%) exceeds drawer balance (%)', p_amount, v_drawer_balance;
    END IF;
  END IF;

  INSERT INTO register_cash_movements (register_session_id, type, reason_category, amount, reason, performed_by)
  VALUES (
    p_session_id,
    p_type::cash_movement_type,
    p_reason_category::cash_movement_reason_category,
    p_amount,
    p_reason,
    p_user_id
  )
  RETURNING id INTO v_id;

  v_result := jsonb_build_object('id', v_id);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Reopen a closed register session.
-- Preserves the original close audit (closed_by/closed_at/expected_cash/variance/etc.)
-- and records who reopened it. The next close will overwrite the close fields with
-- fresh values; reopened_by/at remain as evidence the session was reopened.
CREATE OR REPLACE FUNCTION reopen_register(p_session_id INT, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
BEGIN
  PERFORM assert_active_user();

  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Register session not found';
  END IF;

  -- Brand isolation + role gate: reopening a closed session is sensitive
  -- (resets variance, lets new transactions backdate), so restrict to
  -- managers/admins of the session's brand.
  IF NOT can_access_brand(v_session.brand::text) THEN
    RAISE EXCEPTION 'You do not have access to this register session';
  END IF;
  IF NOT is_manager_or_above() THEN
    RAISE EXCEPTION 'Only managers can reopen a closed register session';
  END IF;

  IF v_session.status = 'open' THEN
    RAISE EXCEPTION 'Register is already open';
  END IF;

  -- A different brand may have an open session — that's fine, sessions are
  -- per-brand. But same-brand open conflict should be impossible given the
  -- unique (brand, date) index.

  UPDATE register_sessions SET
    status = 'open',
    reopened_by = p_user_id,
    reopened_at = NOW()
  WHERE id = p_session_id;

  -- Return the full session payload so callers can update cache directly.
  RETURN get_register_session(v_session.brand::text, v_session.date);
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PAGINATED EOD TRANSACTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_eod_transactions_paginated(
  p_brand TEXT,
  p_date_from DATE,
  p_date_to DATE,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25,
  p_search TEXT DEFAULT NULL,
  p_payment_type TEXT DEFAULT NULL,
  p_transaction_type TEXT DEFAULT NULL,
  p_order_type TEXT DEFAULT NULL,
  p_tz_offset_minutes INT DEFAULT 180  -- Kuwait UTC+3 = 180 minutes
)
RETURNS JSONB AS $$
DECLARE
  v_offset INT;
  v_total BIGINT;
  v_transactions JSONB;
  v_search TEXT;
  v_tx_start TIMESTAMP;
  v_tx_end TIMESTAMP;
BEGIN
  v_offset := (GREATEST(p_page, 1) - 1) * p_page_size;
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  -- Convert local date boundaries to UTC for comparing against UTC created_at timestamps
  v_tx_start := p_date_from::timestamp - (p_tz_offset_minutes || ' minutes')::interval;
  v_tx_end := (p_date_to + INTERVAL '1 day')::timestamp - (p_tz_offset_minutes || ' minutes')::interval;

  -- Count total matching
  SELECT COUNT(*) INTO v_total
  FROM payment_transactions pt
  JOIN orders o ON o.id = pt.order_id
  LEFT JOIN customers c ON c.id = o.customer_id
  LEFT JOIN work_orders wo ON wo.order_id = o.id
  WHERE o.brand = p_brand::brand
    AND o.checkout_status = 'confirmed'
    AND pt.created_at >= v_tx_start
    AND pt.created_at < v_tx_end
    AND (p_payment_type IS NULL OR pt.payment_type = p_payment_type::payment_type)
    AND (p_transaction_type IS NULL OR pt.transaction_type = p_transaction_type::transaction_type)
    AND (p_order_type IS NULL OR o.order_type = p_order_type::order_type)
    AND (v_search IS NULL OR
      o.id::text = v_search OR
      wo.invoice_number::text = v_search OR
      pt.payment_ref_no ILIKE '%' || v_search || '%' OR
      c.name % v_search OR
      c.phone ILIKE '%' || v_search || '%'
    );

  -- Get paginated results
  SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb)
  INTO v_transactions
  FROM (
    SELECT
      pt.id,
      pt.order_id,
      pt.amount,
      pt.payment_type::text,
      pt.payment_ref_no,
      pt.payment_note,
      pt.transaction_type::text,
      pt.refund_reason,
      pt.created_at,
      u.name AS cashier_name,
      c.name AS customer_name,
      c.phone AS customer_phone,
      o.order_type::text,
      o.order_total,
      o.paid AS order_paid,
      wo.invoice_number
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    LEFT JOIN users u ON u.id = pt.cashier_id
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN work_orders wo ON wo.order_id = o.id
    WHERE o.brand = p_brand::brand
      AND o.checkout_status = 'confirmed'
      AND pt.created_at >= v_tx_start
      AND pt.created_at < v_tx_end
      AND (p_payment_type IS NULL OR pt.payment_type = p_payment_type::payment_type)
      AND (p_transaction_type IS NULL OR pt.transaction_type = p_transaction_type::transaction_type)
      AND (p_order_type IS NULL OR o.order_type = p_order_type::order_type)
      AND (v_search IS NULL OR
        o.id::text = v_search OR
        wo.invoice_number::text = v_search OR
        pt.payment_ref_no ILIKE '%' || v_search || '%' OR
        c.name % v_search OR
        c.phone ILIKE '%' || v_search || '%'
      )
    ORDER BY pt.created_at DESC
    LIMIT p_page_size
    OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'transactions', v_transactions,
    'total_count', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRANSFER RPCs
-- ============================================================

-- Dispatch a transfer: deduct stock from source location
DROP FUNCTION IF EXISTS dispatch_transfer(integer, uuid, jsonb);
CREATE OR REPLACE FUNCTION dispatch_transfer(
  p_transfer_id INT,
  p_dispatched_by UUID,
  p_items JSONB,  -- [{ id: number, dispatched_qty: number }]
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_transfer RECORD;
  v_item JSONB;
  v_transfer_item RECORD;
  v_dispatched_qty DECIMAL;
  v_current_stock DECIMAL;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not double-decrement source stock.
  IF NOT idem_claim(p_idempotency_key, 'dispatch_transfer') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  -- 1. Lock and verify transfer
  SELECT * INTO v_transfer FROM transfer_requests WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer request % not found', p_transfer_id;
  END IF;
  IF v_transfer.status != 'approved' THEN
    RAISE EXCEPTION 'Transfer % is not in approved status (current: %)', p_transfer_id, v_transfer.status;
  END IF;

  -- Stamp ledger context for auto-log triggers (Phase 1 — stock_movements)
  PERFORM set_config('app.movement_type', 'transfer_out', true);
  PERFORM set_config('app.movement_ref_type', 'transfer', true);
  PERFORM set_config('app.movement_ref_id', p_transfer_id::text, true);
  PERFORM set_config('app.movement_user_id', p_dispatched_by::text, true);
  PERFORM set_config('app.movement_reason', 'transfer dispatch', true);
  PERFORM set_config('app.movement_notes', '', true);
  PERFORM set_config('app.movement_supplier_id', '', true);
  PERFORM set_config('app.movement_unit_cost', '', true);

  -- 2. Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_dispatched_qty := (v_item->>'dispatched_qty')::decimal;

    -- Update dispatched_qty on the transfer item
    UPDATE transfer_request_items
    SET dispatched_qty = v_dispatched_qty
    WHERE id = (v_item->>'id')::int AND transfer_request_id = p_transfer_id;

    -- Get the transfer item to know which table to deduct from
    SELECT * INTO v_transfer_item FROM transfer_request_items WHERE id = (v_item->>'id')::int;

    -- Deduct from source location (with stock validation)
    IF v_transfer.direction = 'shop_to_workshop' THEN
      -- Source is shop
      IF v_transfer_item.fabric_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_transfer_item.fabric_id;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for fabric %: have %, need %', v_transfer_item.fabric_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE fabrics SET shop_stock = shop_stock - v_dispatched_qty WHERE id = v_transfer_item.fabric_id;
      ELSIF v_transfer_item.shelf_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_transfer_item.shelf_id;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for shelf item %: have %, need %', v_transfer_item.shelf_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE shelf SET shop_stock = shop_stock - v_dispatched_qty::int WHERE id = v_transfer_item.shelf_id;
      ELSIF v_transfer_item.accessory_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_transfer_item.accessory_id;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for accessory %: have %, need %', v_transfer_item.accessory_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE accessories SET shop_stock = shop_stock - v_dispatched_qty WHERE id = v_transfer_item.accessory_id;
      END IF;
    ELSE
      -- Source is workshop (workshop_to_shop)
      IF v_transfer_item.fabric_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_transfer_item.fabric_id;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient workshop stock for fabric %: have %, need %', v_transfer_item.fabric_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE fabrics SET workshop_stock = workshop_stock - v_dispatched_qty WHERE id = v_transfer_item.fabric_id;
      ELSIF v_transfer_item.shelf_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_transfer_item.shelf_id;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient workshop stock for shelf item %: have %, need %', v_transfer_item.shelf_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE shelf SET workshop_stock = workshop_stock - v_dispatched_qty::int WHERE id = v_transfer_item.shelf_id;
      ELSIF v_transfer_item.accessory_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_transfer_item.accessory_id;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient workshop stock for accessory %: have %, need %', v_transfer_item.accessory_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE accessories SET workshop_stock = workshop_stock - v_dispatched_qty WHERE id = v_transfer_item.accessory_id;
      END IF;
    END IF;
  END LOOP;

  -- 3. Update transfer status and record who dispatched
  UPDATE transfer_requests
  SET status = 'dispatched', dispatched_at = NOW(), dispatched_by = p_dispatched_by
  WHERE id = p_transfer_id;

  v_result := jsonb_build_object('success', true, 'transfer_id', p_transfer_id);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Receive a transfer: add received qty to destination.
-- Any shortfall (dispatched - received) is recorded on the item as missing_qty
-- and is NOT refunded to source stock — those units are treated as lost in
-- transit. Source stock was already debited at dispatch time, so doing nothing
-- here is the correct accounting for missing units.
DROP FUNCTION IF EXISTS receive_transfer(integer, uuid, jsonb);
CREATE OR REPLACE FUNCTION receive_transfer(
  p_transfer_id INT,
  p_received_by UUID,
  p_items JSONB,  -- [{ id: number, received_qty: number, discrepancy_note?: string }]
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_transfer RECORD;
  v_item JSONB;
  v_transfer_item RECORD;
  v_has_discrepancy BOOLEAN := false;
  v_all_received BOOLEAN;
  v_received_qty DECIMAL;
  v_missing_qty DECIMAL;
  v_result JSONB;
BEGIN
  -- Idempotency: replay of the SAME receive submission must not re-credit
  -- stock. (A distinct later partial-receive uses a fresh key — still valid.)
  IF NOT idem_claim(p_idempotency_key, 'receive_transfer') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  -- 1. Lock and verify transfer
  SELECT * INTO v_transfer FROM transfer_requests WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer request % not found', p_transfer_id;
  END IF;
  -- Allow receiving from dispatched (first receive) or partially_received (subsequent item-wise receives)
  IF v_transfer.status NOT IN ('dispatched', 'partially_received') THEN
    RAISE EXCEPTION 'Transfer % is not receivable (current: %)', p_transfer_id, v_transfer.status;
  END IF;

  -- 2. Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_received_qty := (v_item->>'received_qty')::decimal;

    -- Load the row before writing so we can compute missing_qty against dispatched_qty.
    SELECT * INTO v_transfer_item FROM transfer_request_items
      WHERE id = (v_item->>'id')::int AND transfer_request_id = p_transfer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transfer item % does not belong to transfer %', v_item->>'id', p_transfer_id;
    END IF;

    -- Skip items that have already been received (prevent double-crediting stock)
    IF v_transfer_item.received_qty IS NOT NULL THEN
      CONTINUE;
    END IF;

    -- Guardrail: received cannot exceed dispatched. If it does, the caller is
    -- reporting more than what left the source — reject instead of silently
    -- inflating stock.
    IF v_transfer_item.dispatched_qty IS NOT NULL AND v_received_qty > v_transfer_item.dispatched_qty THEN
      RAISE EXCEPTION 'received_qty (%) cannot exceed dispatched_qty (%) for item %',
        v_received_qty, v_transfer_item.dispatched_qty, v_transfer_item.id;
    END IF;

    -- Compute missing (lost in transit). Anything short of dispatched is lost.
    v_missing_qty := 0;
    IF v_transfer_item.dispatched_qty IS NOT NULL AND v_received_qty < v_transfer_item.dispatched_qty THEN
      v_has_discrepancy := true;
      v_missing_qty := v_transfer_item.dispatched_qty - v_received_qty;
    END IF;

    UPDATE transfer_request_items
    SET received_qty = v_received_qty,
        missing_qty = v_missing_qty,
        discrepancy_note = v_item->>'discrepancy_note'
    WHERE id = v_transfer_item.id;

    -- Stamp ledger context: this UPDATE is a transfer_in at destination
    PERFORM set_config('app.movement_type', 'transfer_in', true);
    PERFORM set_config('app.movement_ref_type', 'transfer', true);
    PERFORM set_config('app.movement_ref_id', p_transfer_id::text, true);
    PERFORM set_config('app.movement_user_id', p_received_by::text, true);
    PERFORM set_config('app.movement_reason', 'transfer receipt', true);
    PERFORM set_config('app.movement_notes', COALESCE(v_item->>'discrepancy_note', ''), true);
    PERFORM set_config('app.movement_supplier_id', '', true);
    PERFORM set_config('app.movement_unit_cost', '', true);

    -- Credit the destination with what actually arrived. The missing units are
    -- NOT refunded to source — source was debited at dispatch and those units
    -- are gone.
    IF v_transfer.direction = 'shop_to_workshop' THEN
      IF v_transfer_item.fabric_id IS NOT NULL THEN
        UPDATE fabrics SET workshop_stock = workshop_stock + v_received_qty
          WHERE id = v_transfer_item.fabric_id;
      ELSIF v_transfer_item.shelf_id IS NOT NULL THEN
        UPDATE shelf SET workshop_stock = workshop_stock + v_received_qty::int
          WHERE id = v_transfer_item.shelf_id;
      ELSIF v_transfer_item.accessory_id IS NOT NULL THEN
        UPDATE accessories SET workshop_stock = workshop_stock + v_received_qty
          WHERE id = v_transfer_item.accessory_id;
      END IF;
    ELSE
      IF v_transfer_item.fabric_id IS NOT NULL THEN
        UPDATE fabrics SET shop_stock = shop_stock + v_received_qty
          WHERE id = v_transfer_item.fabric_id;
      ELSIF v_transfer_item.shelf_id IS NOT NULL THEN
        UPDATE shelf SET shop_stock = shop_stock + v_received_qty::int
          WHERE id = v_transfer_item.shelf_id;
      ELSIF v_transfer_item.accessory_id IS NOT NULL THEN
        UPDATE accessories SET shop_stock = shop_stock + v_received_qty
          WHERE id = v_transfer_item.accessory_id;
      END IF;
    END IF;

    -- Log a `waste` movement for the missing portion at the SOURCE location
    -- (informational: source was already debited at dispatch via transfer_out).
    -- Direct INSERT — no column change, so auto-trigger doesn't fire.
    IF v_missing_qty > 0 THEN
      INSERT INTO stock_movements (
        item_type, item_id, location, movement_type, qty_delta,
        ref_type, ref_id, user_id, reason, notes
      )
      VALUES (
        CASE
          WHEN v_transfer_item.fabric_id IS NOT NULL THEN 'fabric'::stock_item_type
          WHEN v_transfer_item.shelf_id IS NOT NULL THEN 'shelf'::stock_item_type
          WHEN v_transfer_item.accessory_id IS NOT NULL THEN 'accessory'::stock_item_type
        END,
        COALESCE(v_transfer_item.fabric_id, v_transfer_item.shelf_id, v_transfer_item.accessory_id),
        CASE
          WHEN v_transfer.direction = 'shop_to_workshop' THEN 'shop'::stock_location
          ELSE 'workshop'::stock_location
        END,
        'waste'::stock_movement_type,
        -v_missing_qty,
        'transfer', p_transfer_id, p_received_by,
        'lost in transit',
        COALESCE(v_item->>'discrepancy_note', '')
      );
    END IF;
  END LOOP;

  -- 3. Determine final status: all items received → received, otherwise partially_received
  SELECT NOT EXISTS (
    SELECT 1 FROM transfer_request_items
    WHERE transfer_request_id = p_transfer_id AND received_qty IS NULL
  ) INTO v_all_received;

  -- Check for discrepancies across ALL items (including previously received ones)
  IF v_all_received THEN
    SELECT EXISTS (
      SELECT 1 FROM transfer_request_items
      WHERE transfer_request_id = p_transfer_id AND missing_qty > 0
    ) INTO v_has_discrepancy;
  END IF;

  UPDATE transfer_requests
  SET status = CASE
        WHEN v_all_received THEN 'received'
        ELSE 'partially_received'
      END,
      received_at = COALESCE(v_transfer.received_at, NOW()),
      received_by = COALESCE(v_transfer.received_by, p_received_by)
  WHERE id = p_transfer_id;

  v_result := jsonb_build_object('success', true, 'transfer_id', p_transfer_id, 'has_discrepancy', v_has_discrepancy);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Approve a transfer request: set per-item approved_qty and advance the header
-- to 'approved'. Atomic + idempotent + status-guarded. Previously this was a
-- per-item PostgREST loop plus a separate header update with no status guard —
-- a stale drawer / double-click could re-approve an already-dispatched transfer
-- and a mid-loop network drop left approved_qty partially applied. The
-- status='requested' guard + single transaction + idem key close both holes.
CREATE OR REPLACE FUNCTION approve_transfer(
  p_transfer_id INT,
  p_items JSONB,  -- [{ id: number, approved_qty: number }]
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_transfer RECORD;
  v_item JSONB;
  v_result JSONB;
BEGIN
  IF NOT idem_claim(p_idempotency_key, 'approve_transfer') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  SELECT * INTO v_transfer FROM transfer_requests WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer request % not found', p_transfer_id;
  END IF;
  IF v_transfer.status != 'requested' THEN
    RAISE EXCEPTION 'Transfer % is not awaiting approval (current: %)', p_transfer_id, v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'approved_qty')::decimal < 0 THEN
      RAISE EXCEPTION 'Approved quantity cannot be negative (item %)', v_item->>'id';
    END IF;
    UPDATE transfer_request_items
    SET approved_qty = (v_item->>'approved_qty')::decimal
    WHERE id = (v_item->>'id')::int AND transfer_request_id = p_transfer_id;
  END LOOP;

  UPDATE transfer_requests
  SET status = 'approved', approved_at = NOW()
  WHERE id = p_transfer_id;

  v_result := jsonb_build_object('success', true, 'transfer_id', p_transfer_id);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Reject a transfer request. Same status guard as approve: only a still-
-- 'requested' transfer can be rejected, so a dispatched/received transfer
-- can't have its lifecycle blanked out while stock is already moved.
CREATE OR REPLACE FUNCTION reject_transfer(
  p_transfer_id INT,
  p_rejection_reason TEXT,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_transfer RECORD;
  v_result JSONB;
BEGIN
  IF NOT idem_claim(p_idempotency_key, 'reject_transfer') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  SELECT * INTO v_transfer FROM transfer_requests WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer request % not found', p_transfer_id;
  END IF;
  IF v_transfer.status != 'requested' THEN
    RAISE EXCEPTION 'Transfer % is not awaiting approval (current: %)', p_transfer_id, v_transfer.status;
  END IF;

  UPDATE transfer_requests
  SET status = 'rejected', rejection_reason = p_rejection_reason
  WHERE id = p_transfer_id;

  v_result := jsonb_build_object('success', true, 'transfer_id', p_transfer_id);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- NOTIFICATION SYSTEM — Triggers & RPCs
-- ============================================================

-- --- TRIGGER FUNCTIONS ---

-- 1. Garment location change → notify destination department
CREATE OR REPLACE FUNCTION notify_garment_location_change()
RETURNS TRIGGER AS $$
DECLARE
  v_brand brand;
BEGIN
  IF NEW.location = 'transit_to_workshop' AND (OLD.location IS NULL OR OLD.location != 'transit_to_workshop') THEN
    SELECT o.brand INTO v_brand FROM orders o WHERE o.id = NEW.order_id;
    INSERT INTO notifications (department, brand, type, title, body, metadata, expires_at)
    VALUES (
      'workshop',
      v_brand,
      'garment_dispatched_to_workshop',
      'Garments dispatched to workshop',
      format('Garment %s (Order #%s) dispatched to workshop', NEW.garment_id, NEW.order_id),
      jsonb_build_object('order_id', NEW.order_id, 'garment_id', NEW.id, 'garment_display_id', NEW.garment_id),
      NOW() + INTERVAL '7 days'
    );
  END IF;

  IF NEW.location = 'transit_to_shop' AND (OLD.location IS NULL OR OLD.location != 'transit_to_shop') THEN
    SELECT o.brand INTO v_brand FROM orders o WHERE o.id = NEW.order_id;
    INSERT INTO notifications (department, brand, type, title, body, metadata, expires_at)
    VALUES (
      'shop',
      v_brand,
      'garment_dispatched_to_shop',
      'Garments dispatched to shop',
      format('Garment %s (Order #%s) dispatched to shop', NEW.garment_id, NEW.order_id),
      jsonb_build_object('order_id', NEW.order_id, 'garment_id', NEW.id, 'garment_display_id', NEW.garment_id),
      NOW() + INTERVAL '7 days'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS garment_location_notification ON garments;
CREATE TRIGGER garment_location_notification
  AFTER UPDATE OF location ON garments
  FOR EACH ROW
  EXECUTE FUNCTION notify_garment_location_change();

-- 1b. Garment marked for REDO → URGENT workshop notification
-- Fires when feedback_status flips to 'needs_redo'. Original garment is discarded;
-- workshop must spin a replacement immediately, so this is a requireInteraction-style
-- red alert on the workshop side.
CREATE OR REPLACE FUNCTION notify_garment_redo_requested()
RETURNS TRIGGER AS $$
DECLARE
  v_brand brand;
  v_order_display TEXT;
BEGIN
  IF NEW.feedback_status = 'needs_redo'
     AND (OLD.feedback_status IS DISTINCT FROM NEW.feedback_status) THEN

    SELECT o.brand, COALESCE(wo.invoice_number::text, NEW.order_id::text)
      INTO v_brand, v_order_display
      FROM orders o
      LEFT JOIN work_orders wo ON wo.order_id = o.id
     WHERE o.id = NEW.order_id;

    INSERT INTO notifications (department, brand, type, title, body, metadata, expires_at)
    VALUES (
      'workshop',
      v_brand,
      'garment_redo_requested',
      'URGENT: Redo required',
      format('Garment %s (Order #%s) needs a full redo — create replacement now', NEW.garment_id, v_order_display),
      jsonb_build_object(
        'order_id', NEW.order_id,
        'garment_id', NEW.id,
        'garment_display_id', NEW.garment_id,
        'urgent', true
      ),
      NOW() + INTERVAL '7 days'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS garment_redo_notification ON garments;
CREATE TRIGGER garment_redo_notification
  AFTER UPDATE OF feedback_status ON garments
  FOR EACH ROW
  EXECUTE FUNCTION notify_garment_redo_requested();

-- (Removed) Garment stage change notifications:
-- Previously fired a shop notification when piece_stage became 'ready_for_pickup' or
-- 'awaiting_trial'. Both of those transitions happen on the receiving-brova-final page
-- where the shop itself is the actor, so the notification was just telling the shop
-- about its own click. The incoming-work signal for shop already comes from trigger #1
-- (location → transit_to_shop) at dispatch time, which is the moment that actually
-- requires their attention.
DROP TRIGGER IF EXISTS garment_stage_notification ON garments;
DROP FUNCTION IF EXISTS notify_garment_stage_change();

-- 2. Transfer request created → notify the approver (source of items)
CREATE OR REPLACE FUNCTION notify_transfer_created()
RETURNS TRIGGER AS $$
BEGIN
  -- `direction` = flow of items. The approver is the SOURCE (where items come from):
  --   shop_to_workshop  → items flow shop→workshop → shop is the source/approver (workshop requested)
  --   workshop_to_shop  → items flow workshop→shop → workshop is the source/approver (shop requested)
  INSERT INTO notifications (department, brand, type, title, body, metadata, expires_at)
  VALUES (
    CASE WHEN NEW.direction = 'shop_to_workshop' THEN 'shop' ELSE 'workshop' END,
    NEW.brand,
    'transfer_requested',
    'New transfer request',
    format('New %s transfer request created', NEW.item_type),
    jsonb_build_object('transfer_request_id', NEW.id, 'direction', NEW.direction, 'item_type', NEW.item_type),
    NOW() + INTERVAL '7 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS transfer_created_notification ON transfer_requests;
CREATE TRIGGER transfer_created_notification
  AFTER INSERT ON transfer_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_transfer_created();

-- 3. Transfer request status change → notify the side that DIDN'T perform the action
CREATE OR REPLACE FUNCTION notify_transfer_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_target_dept TEXT;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- `direction` = flow of items.
  --   shop_to_workshop  → source=shop,     destination=workshop (workshop requested)
  --   workshop_to_shop  → source=workshop, destination=shop     (shop requested)
  --
  -- Who to notify depends on which side took the action:
  --   approved / rejected / dispatched → action by SOURCE (approver) → notify DESTINATION (requester)
  --   received / partially_received    → action by DESTINATION (receiver) → notify SOURCE (sender)
  IF NEW.status IN ('approved', 'rejected', 'dispatched') THEN
    v_target_dept := CASE WHEN NEW.direction = 'shop_to_workshop' THEN 'workshop' ELSE 'shop' END;
  ELSIF NEW.status IN ('received', 'partially_received') THEN
    v_target_dept := CASE WHEN NEW.direction = 'shop_to_workshop' THEN 'shop' ELSE 'workshop' END;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO notifications (department, brand, type, title, body, metadata, expires_at)
  VALUES (
    v_target_dept::department,
    NEW.brand,
    'transfer_status_changed',
    format('Transfer request %s', NEW.status),
    format('Transfer request #%s has been %s', NEW.id, NEW.status),
    jsonb_build_object('transfer_request_id', NEW.id, 'status', NEW.status, 'direction', NEW.direction),
    NOW() + INTERVAL '7 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS transfer_status_notification ON transfer_requests;
CREATE TRIGGER transfer_status_notification
  AFTER UPDATE OF status ON transfer_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_transfer_status_change();

-- --- NOTIFICATION RPCs ---

-- Fetch notifications visible to the current user:
-- department-scoped rows for their department + user-scoped rows addressed to them.
DROP FUNCTION IF EXISTS get_my_notifications(INTEGER);
DROP FUNCTION IF EXISTS get_my_notifications(INTEGER, TEXT);
DROP FUNCTION IF EXISTS get_my_notifications(INTEGER, TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_my_notifications(INTEGER, TEXT, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION get_my_notifications(p_limit INTEGER DEFAULT 50, p_department TEXT DEFAULT NULL, p_offset INTEGER DEFAULT 0, p_brand TEXT DEFAULT NULL)
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  FROM (
    SELECT
      n.id,
      n.type,
      n.title,
      n.body,
      n.metadata,
      n.scope,
      n.recipient_user_id,
      n.created_at,
      n.expires_at,
      (nr.read_at IS NOT NULL) AS is_read,
      nr.read_at
    FROM notifications n
    LEFT JOIN notification_reads nr
      ON nr.notification_id = n.id
      AND nr.user_id = get_my_user_id()
    WHERE n.expires_at > now()
      AND (p_brand IS NULL OR n.brand = p_brand::brand)
      AND (
        (n.scope = 'department' AND n.department = COALESCE(p_department, get_my_department())::department)
        OR (n.scope = 'user' AND n.recipient_user_id = get_my_user_id())
      )
    ORDER BY n.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get unread notification count (department + user-scoped combined)
DROP FUNCTION IF EXISTS get_unread_notification_count();
DROP FUNCTION IF EXISTS get_unread_notification_count(TEXT);
DROP FUNCTION IF EXISTS get_unread_notification_count(TEXT, TEXT);
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_department TEXT DEFAULT NULL, p_brand TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
  SELECT count(*)::integer
  FROM notifications n
  WHERE n.expires_at > now()
    AND (p_brand IS NULL OR n.brand = p_brand::brand)
    AND (
      (n.scope = 'department' AND n.department = COALESCE(p_department, get_my_department())::department)
      OR (n.scope = 'user' AND n.recipient_user_id = get_my_user_id())
    )
    AND NOT EXISTS (
      SELECT 1 FROM notification_reads nr
      WHERE nr.notification_id = n.id
        AND nr.user_id = get_my_user_id()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Mark a single notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id INTEGER)
RETURNS void AS $$
BEGIN
  INSERT INTO notification_reads (notification_id, user_id)
  VALUES (p_notification_id, get_my_user_id())
  ON CONFLICT (notification_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark all visible notifications as read (department + user-scoped combined)
DROP FUNCTION IF EXISTS mark_all_notifications_read();
DROP FUNCTION IF EXISTS mark_all_notifications_read(TEXT);
DROP FUNCTION IF EXISTS mark_all_notifications_read(TEXT, TEXT);
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_department TEXT DEFAULT NULL, p_brand TEXT DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO notification_reads (notification_id, user_id)
  SELECT n.id, get_my_user_id()
  FROM notifications n
  WHERE n.expires_at > now()
    AND (p_brand IS NULL OR n.brand = p_brand::brand)
    AND (
      (n.scope = 'department' AND n.department = COALESCE(p_department, get_my_department())::department)
      OR (n.scope = 'user' AND n.recipient_user_id = get_my_user_id())
    )
    AND NOT EXISTS (
      SELECT 1 FROM notification_reads nr
      WHERE nr.notification_id = n.id
        AND nr.user_id = get_my_user_id()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired notifications (housekeeping — call periodically)
CREATE OR REPLACE FUNCTION expire_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================================================
-- DISPATCH LOG RLS
-- Append-only audit of shop↔workshop dispatches. Any authed user can read
-- and insert; no updates/deletes expected from app code (cleanup via a
-- manual SQL call below).
-- ========================================================================
ALTER TABLE dispatch_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispatch_log_select" ON dispatch_log;
CREATE POLICY "dispatch_log_select" ON dispatch_log
    FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "dispatch_log_insert" ON dispatch_log;
CREATE POLICY "dispatch_log_insert" ON dispatch_log
    FOR INSERT WITH CHECK (is_active_user());

-- Periodic cleanup helper — run manually or via cron.
-- Drops rows older than the given interval (default 6 months).
CREATE OR REPLACE FUNCTION purge_old_dispatch_log(p_keep_interval INTERVAL DEFAULT INTERVAL '6 months')
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM dispatch_log WHERE dispatched_at < now() - p_keep_interval;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════
-- SHOWROOM ORDERS: paginated, server-filtered RPC
-- ═══════════════════════════════════════════════════════════════════════
-- Replaces a client-side "fetch everything then filter in JS" pattern that
-- pulled up to 1000 in_progress work orders per refetch. The RPC ports
-- getShowroomStatus (packages/database/src/utils.ts) to SQL, applies every
-- filter the UI exposes server-side, and returns a page + total + stats in
-- a single round trip. See useShowroomOrders.ts for the caller.
--
-- Contract:
--   data         — page of orders (already merged orders + work_orders +
--                  customer + garments + showroom_label)
--   total_count  — rows matching all filters (for pagination)
--   stats        — counts by label, computed BEFORE the stage filter so
--                  stage buttons keep showing counts for every stage
CREATE INDEX IF NOT EXISTS orders_showroom_idx
    ON orders(brand, checkout_status, order_type);
CREATE INDEX IF NOT EXISTS work_orders_phase_idx
    ON work_orders(order_phase);
CREATE INDEX IF NOT EXISTS garments_order_location_idx
    ON garments(order_id, location) WHERE piece_stage IS DISTINCT FROM 'completed';

CREATE OR REPLACE FUNCTION get_showroom_orders_page(
    p_brand TEXT,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 20,
    p_search_id TEXT DEFAULT NULL,
    p_customer TEXT DEFAULT NULL,
    p_stage TEXT DEFAULT NULL,
    p_reminder_statuses TEXT[] DEFAULT NULL,
    p_delivery_date_start TEXT DEFAULT NULL,
    p_delivery_date_end TEXT DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'created_desc'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSONB;
    v_page_size INT := GREATEST(COALESCE(p_page_size, 20), 1);
    v_offset INT := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_page_size;
    v_search TEXT := LOWER(TRIM(COALESCE(p_search_id, '')));
    v_customer TEXT := LOWER(TRIM(COALESCE(p_customer, '')));
    v_date_start TIMESTAMP := CASE WHEN NULLIF(p_delivery_date_start, '') IS NULL THEN NULL ELSE p_delivery_date_start::TIMESTAMP END;
    v_date_end TIMESTAMP := CASE WHEN NULLIF(p_delivery_date_end, '') IS NULL THEN NULL ELSE p_delivery_date_end::TIMESTAMP + INTERVAL '1 day' END;
    v_reminders TEXT[] := COALESCE(p_reminder_statuses, ARRAY[]::TEXT[]);
BEGIN
    WITH base AS (
        SELECT
            o.id,
            o.customer_id,
            o.order_date,
            o.brand::text AS brand,
            o.checkout_status::text AS checkout_status,
            o.order_type::text AS order_type,
            o.payment_type::text AS payment_type,
            o.order_total,
            o.paid,
            o.discount_value,
            o.delivery_charge,
            o.express_charge,
            o.soaking_charge,
            o.shelf_charge,
            COALESCE(wo.invoice_number, ao.invoice_number) AS invoice_number,
            COALESCE(wo.delivery_date, alt_meta.delivery_date) AS delivery_date,
            COALESCE(wo.home_delivery, alt_meta.home_delivery) AS home_delivery,
            wo.advance,
            wo.fabric_charge,
            wo.stitching_charge,
            wo.style_charge,
            COALESCE(wo.order_phase::text, ao.order_phase::text) AS order_phase,
            wo.linked_order_id,
            wo.r1_date, wo.r1_notes,
            wo.r2_date, wo.r2_notes,
            wo.r3_date, wo.r3_notes,
            wo.call_reminder_date, wo.call_status, wo.call_notes,
            wo.escalation_date, wo.escalation_notes,
            c.name AS c_name,
            c.nick_name AS c_nick_name,
            c.phone AS c_phone,
            c.country_code AS c_country_code,
            jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'nick_name', c.nick_name,
                'phone', c.phone,
                'country_code', c.country_code
            ) AS customer_json,
            agg.showroom_label
        FROM orders o
        LEFT JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN alteration_orders ao ON ao.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN LATERAL (
            SELECT
                MIN(g.delivery_date) AS delivery_date,
                bool_or(COALESCE(g.home_delivery, FALSE)) AS home_delivery
            FROM garments g
            WHERE g.order_id = o.id
        ) alt_meta ON o.order_type::text = 'ALTERATION'
        CROSS JOIN LATERAL (
            SELECT
                CASE
                    WHEN o.order_type::text = 'ALTERATION' AND g.has_shop_items THEN 'alteration_out'
                    WHEN o.order_type::text = 'ALTERATION' THEN NULL
                    WHEN NOT g.has_shop_items AND g.finals_in_transit THEN 'awaiting_finals'
                    WHEN NOT g.has_shop_items THEN NULL
                    WHEN g.has_alteration_needing_work THEN 'alteration_in'
                    WHEN g.has_brova_awaiting_trial THEN 'brova_trial'
                    WHEN g.has_garment_needing_action THEN 'needs_action'
                    WHEN g.has_shop_brova AND g.finals_still_out THEN 'awaiting_finals'
                    WHEN g.all_shop_items_done AND NOT g.garments_still_out THEN 'ready_for_pickup'
                    WHEN g.garments_still_out THEN 'partial_ready'
                    ELSE NULL
                END AS showroom_label,
                g.has_shop_items,
                g.finals_in_transit
            FROM (
                SELECT
                    COALESCE(bool_or(shop_active), false) AS has_shop_items,
                    COALESCE(bool_or(
                        shop_active
                        AND acceptance_status IS DISTINCT FROM TRUE
                        AND is_alteration
                        AND (piece_stage = 'awaiting_trial' OR feedback_status IN ('needs_repair', 'needs_redo'))
                    ), false) AS has_alteration_needing_work,
                    COALESCE(bool_or(
                        shop_active
                        AND garment_type = 'brova'
                        AND piece_stage = 'awaiting_trial'
                    ), false) AS has_brova_awaiting_trial,
                    COALESCE(bool_or(
                        shop_active
                        AND feedback_status IN ('needs_repair', 'needs_redo')
                    ), false) AS has_garment_needing_action,
                    COALESCE(bool_or(
                        not_completed AND garment_type = 'final' AND location <> 'shop'
                    ), false) AS finals_still_out,
                    COALESCE(bool_or(
                        not_completed AND garment_type = 'final' AND location = 'transit_to_shop'
                    ), false) AS finals_in_transit,
                    COALESCE(bool_or(not_completed AND location <> 'shop'), false) AS garments_still_out,
                    COALESCE(bool_or(shop_active AND garment_type = 'brova'), false) AS has_shop_brova,
                    COALESCE(bool_and(NOT shop_active OR shop_item_done), true) AS all_shop_items_done
                FROM (
                    SELECT
                        g2.piece_stage::text NOT IN ('completed', 'discarded') AS not_completed,
                        g2.location::text = 'shop'
                            AND g2.piece_stage::text NOT IN ('completed', 'discarded')
                            AND (
                                COALESCE(g2.trip_number, 0) > 0
                                OR g2.garment_type::text = 'alteration'
                            ) AS shop_active,
                        g2.garment_type::text AS garment_type,
                        g2.piece_stage::text AS piece_stage,
                        g2.location::text AS location,
                        g2.acceptance_status,
                        g2.feedback_status,
                        (g2.garment_type::text = 'final' AND COALESCE(g2.trip_number, 1) >= 2)
                            OR (g2.garment_type::text = 'brova' AND COALESCE(g2.trip_number, 1) >= 4)
                            OR (g2.garment_type::text = 'alteration' AND COALESCE(g2.trip_number, 1) >= 2) AS is_alteration,
                        (
                            g2.acceptance_status = TRUE
                            OR (
                                g2.garment_type::text IN ('final', 'alteration')
                                AND g2.piece_stage::text = 'ready_for_pickup'
                                AND g2.feedback_status IS DISTINCT FROM 'needs_repair'
                                AND g2.feedback_status IS DISTINCT FROM 'needs_redo'
                            )
                        ) AS shop_item_done
                    FROM garments g2
                    WHERE g2.order_id = o.id
                ) gx
            ) g
        ) agg
        WHERE o.brand::text = p_brand
          AND o.checkout_status::text = 'confirmed'
          AND o.order_type::text IN ('WORK', 'ALTERATION')
          AND (
            o.order_type::text = 'ALTERATION'
            OR COALESCE(wo.order_phase::text, ao.order_phase::text) = 'in_progress'
          )
          AND (agg.has_shop_items OR agg.finals_in_transit)
    ),
    pre_stage AS (
        SELECT * FROM base
        WHERE showroom_label IS NOT NULL
          AND (
            v_search = ''
            OR LOWER(id::text) LIKE '%' || v_search || '%'
            OR COALESCE(invoice_number::text, '') LIKE '%' || v_search || '%'
          )
          AND (
            v_customer = ''
            OR LOWER(COALESCE(c_name, '')) LIKE '%' || v_customer || '%'
            OR LOWER(COALESCE(c_nick_name, '')) LIKE '%' || v_customer || '%'
            OR COALESCE(c_phone, '') LIKE '%' || v_customer || '%'
            OR LOWER(COALESCE(c_country_code, '') || ' ' || COALESCE(c_phone, '')) LIKE '%' || v_customer || '%'
          )
          AND (v_date_start IS NULL OR delivery_date >= v_date_start)
          AND (v_date_end IS NULL OR delivery_date < v_date_end)
          AND (NOT ('r1_done'     = ANY(v_reminders)) OR r1_date IS NOT NULL)
          AND (NOT ('r1_pending'  = ANY(v_reminders)) OR r1_date IS NULL)
          AND (NOT ('r2_done'     = ANY(v_reminders)) OR r2_date IS NOT NULL)
          AND (NOT ('r2_pending'  = ANY(v_reminders)) OR r2_date IS NULL)
          AND (NOT ('r3_done'     = ANY(v_reminders)) OR r3_date IS NOT NULL)
          AND (NOT ('r3_pending'  = ANY(v_reminders)) OR r3_date IS NULL)
          AND (NOT ('call_done'   = ANY(v_reminders)) OR (call_status IS NOT NULL OR call_reminder_date IS NOT NULL))
          AND (NOT ('escalated'   = ANY(v_reminders)) OR escalation_date IS NOT NULL)
    ),
    stage_filtered AS (
        SELECT * FROM pre_stage
        WHERE NULLIF(p_stage, '') IS NULL
           OR p_stage = 'all'
           OR showroom_label = p_stage
    ),
    ranked AS (
        SELECT
            sf.*,
            row_number() OVER (
                ORDER BY
                    CASE WHEN p_sort_by = 'deliveryDate_asc'  THEN delivery_date END ASC  NULLS LAST,
                    CASE WHEN p_sort_by = 'deliveryDate_desc' THEN delivery_date END DESC NULLS LAST,
                    CASE WHEN p_sort_by = 'balance_desc'      THEN (COALESCE(order_total, 0) - COALESCE(paid, 0)) END DESC NULLS LAST,
                    id DESC
            ) AS rn
        FROM stage_filtered sf
    ),
    page AS (
        SELECT * FROM ranked
        ORDER BY rn
        LIMIT v_page_size
        OFFSET v_offset
    ),
    page_rows AS (
        SELECT
            p.rn,
            jsonb_build_object(
                'id', p.id,
                'customer_id', p.customer_id,
                'order_date', p.order_date,
                'brand', p.brand,
                'checkout_status', p.checkout_status,
                'order_type', p.order_type,
                'payment_type', p.payment_type,
                'order_total', p.order_total,
                'paid', p.paid,
                'discount_value', p.discount_value,
                'delivery_charge', p.delivery_charge,
                'express_charge', p.express_charge,
                'soaking_charge', p.soaking_charge,
                'shelf_charge', p.shelf_charge,
                'invoice_number', p.invoice_number,
                'delivery_date', p.delivery_date,
                'home_delivery', p.home_delivery,
                'advance', p.advance,
                'fabric_charge', p.fabric_charge,
                'stitching_charge', p.stitching_charge,
                'style_charge', p.style_charge,
                'order_phase', p.order_phase,
                'linked_order_id', p.linked_order_id,
                'r1_date', p.r1_date, 'r1_notes', p.r1_notes,
                'r2_date', p.r2_date, 'r2_notes', p.r2_notes,
                'r3_date', p.r3_date, 'r3_notes', p.r3_notes,
                'call_reminder_date', p.call_reminder_date,
                'call_status', p.call_status,
                'call_notes', p.call_notes,
                'escalation_date', p.escalation_date,
                'escalation_notes', p.escalation_notes,
                'customer', p.customer_json,
                'showroom_label', p.showroom_label,
                'garments', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', g.id,
                        'garment_id', g.garment_id,
                        'piece_stage', g.piece_stage,
                        'garment_type', g.garment_type,
                        'location', g.location,
                        'acceptance_status', g.acceptance_status,
                        'feedback_status', g.feedback_status,
                        'trip_number', g.trip_number,
                        'color', g.color,
                        'style', g.style,
                        'delivery_date', g.delivery_date,
                        'fabric_source', g.fabric_source,
                        'fabric', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('name', f.name) END
                    ) ORDER BY g.garment_id NULLS LAST)
                    FROM garments g
                    LEFT JOIN fabrics f ON f.id = g.fabric_id
                    WHERE g.order_id = p.id
                ), '[]'::jsonb)
            ) AS row_json
        FROM page p
    )
    SELECT jsonb_build_object(
        'data',        COALESCE((SELECT jsonb_agg(row_json ORDER BY rn) FROM page_rows), '[]'::jsonb),
        'total_count', (SELECT COUNT(*) FROM stage_filtered),
        'stats', (
            SELECT jsonb_build_object(
                'total',           COUNT(*),
                'ready',           COUNT(*) FILTER (WHERE showroom_label = 'ready_for_pickup'),
                'brova_trial',     COUNT(*) FILTER (WHERE showroom_label = 'brova_trial'),
                'needs_action',    COUNT(*) FILTER (WHERE showroom_label = 'needs_action'),
                'partial_ready',   COUNT(*) FILTER (WHERE showroom_label = 'partial_ready'),
                'alteration_in',   COUNT(*) FILTER (WHERE showroom_label = 'alteration_in'),
                'alteration_out',  COUNT(*) FILTER (WHERE showroom_label = 'alteration_out'),
                'awaiting_finals', COUNT(*) FILTER (WHERE showroom_label = 'awaiting_finals')
            )
            FROM pre_stage
        )
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- WORKSHOP COMPLETED ORDERS: paginated RPC
-- ═══════════════════════════════════════════════════════════════════════
-- Replaces getCompletedOrderGarments — the workshop's "Completed Orders"
-- page previously fetched every completed order's garments with the full
-- WORKSHOP_QUERY (measurement, style_ref, fabric_ref, worker_history, etc.)
-- and paginated 20 rows at a time client-side. Each new month of production
-- made the fetch bigger. This RPC returns order groups already aggregated,
-- with only the garment fields the page actually renders.
--
-- Contract:
--   data          — page of OrderGroup rows (shape matches lib/utils.ts
--                   groupByOrder output; garments are slimmed)
--   total_count   — completed orders matching filters
CREATE INDEX IF NOT EXISTS work_orders_completed_delivery_idx
    ON work_orders(order_phase, delivery_date DESC)
    WHERE order_phase = 'completed';

CREATE OR REPLACE FUNCTION get_completed_orders_page(
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 20,
    p_days_back INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSONB;
    v_page_size INT := GREATEST(COALESCE(p_page_size, 20), 1);
    v_offset INT := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_page_size;
    v_cutoff TIMESTAMPTZ := CASE
        WHEN p_days_back IS NULL THEN NULL
        ELSE NOW() - (p_days_back || ' days')::INTERVAL
    END;
BEGIN
    WITH base AS (
        SELECT
            o.id                       AS order_id,
            o.brand::text              AS brand,
            wo.invoice_number,
            wo.delivery_date,
            wo.home_delivery,
            c.name                     AS customer_name,
            c.phone                    AS customer_phone,
            c.country_code             AS customer_country_code
        FROM orders o
        INNER JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.checkout_status::text = 'confirmed'
          AND wo.order_phase::text = 'completed'
          AND (v_cutoff IS NULL OR wo.delivery_date >= v_cutoff)
    ),
    ranked AS (
        SELECT
            b.*,
            row_number() OVER (
                ORDER BY b.delivery_date DESC NULLS LAST, b.order_id DESC
            ) AS rn
        FROM base b
    ),
    page AS (
        SELECT * FROM ranked
        ORDER BY rn
        LIMIT v_page_size
        OFFSET v_offset
    ),
    page_rows AS (
        SELECT
            p.rn,
            jsonb_build_object(
                'order_id',        p.order_id,
                'invoice_number',  p.invoice_number,
                'customer_name',   p.customer_name,
                'customer_mobile', NULLIF(TRIM(BOTH FROM COALESCE(p.customer_country_code, '') || ' ' || COALESCE(p.customer_phone, '')), ''),
                'brands',          CASE WHEN p.brand IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p.brand) END,
                'home_delivery',   p.home_delivery,
                'delivery_date',   p.delivery_date,
                'express',         COALESCE((SELECT bool_or(g.express) FROM garments g WHERE g.order_id = p.order_id), false),
                'soaking',         COALESCE((SELECT bool_or(g.soaking) FROM garments g WHERE g.order_id = p.order_id), false),
                'garments', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id',           g.id,
                        'garment_id',   g.garment_id,
                        'garment_type', g.garment_type,
                        'piece_stage',  g.piece_stage,
                        'location',     g.location
                    ) ORDER BY g.garment_id NULLS LAST)
                    FROM garments g
                    WHERE g.order_id = p.order_id
                ), '[]'::jsonb)
            ) AS row_json
        FROM page p
    )
    SELECT jsonb_build_object(
        'data',        COALESCE((SELECT jsonb_agg(row_json ORDER BY rn) FROM page_rows), '[]'::jsonb),
        'total_count', (SELECT COUNT(*) FROM base)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSIGNED VIEW: overview + paginated list RPCs
-- ═══════════════════════════════════════════════════════════════════════
-- Ports the workshop "Production Tracker" page off getAssignedViewGarments
-- which fetched every in_progress order's full garment WORKSHOP_QUERY and
-- then paginated + filtered + sorted + labeled client-side. Two RPCs:
--
--   get_assigned_overview()                 — stats + workshop pipeline
--                                             garments + top-5-per-category
--                                             previews for the overview tab
--   get_assigned_orders_page(...)           — paginated list for the
--                                             production/ready/attention/all
--                                             tabs, with chip counts
--
-- Row classification (isActive / isReadyForDispatch / isOverdue / isDueSoon
-- / hasReturns) and getOrderStatusLabel are ported from
-- apps/workshop/src/routes/(main)/assigned/index.tsx. Keep these in sync if
-- the TS logic changes — the page still uses the same helper types but the
-- server now owns the derivations.
--
-- "Active" definition matches isActive(): stage = soaking AND start_time
-- set, OR stage IN (cutting, post_cutting, sewing, finishing, ironing,
-- quality_check). "Due soon" is 0-2 days out. Overdue is delivery_date <
-- now. These thresholds are hardcoded on both sides.
CREATE INDEX IF NOT EXISTS work_orders_in_progress_delivery_idx
    ON work_orders(order_phase, delivery_date)
    WHERE order_phase = 'in_progress';

-- Aggregate per-order garment-derived attributes. Shared helper so both
-- RPCs compute classifications the same way without duplicating the
-- subquery body. Returns one row per order_id present in the input.
CREATE OR REPLACE VIEW assigned_order_agg AS
SELECT
    g.order_id,
    COUNT(*)                                                 AS garments_count,
    bool_or(g.garment_type::text = 'brova')                  AS has_brova,
    bool_or(g.garment_type::text = 'final')                  AS has_final,
    bool_or(g.express)                                       AS any_express,
    bool_or(g.soaking)                                       AS any_soaking,
    bool_or(COALESCE(g.trip_number, 1) > 1)                  AS any_returns,
    MAX(COALESCE(g.trip_number, 1))                          AS max_trip,
    -- isActive: any garment in soaking-with-start, or in 2..7 stage index
    bool_or(
        (g.piece_stage::text = 'soaking' AND g.start_time IS NOT NULL)
        OR g.piece_stage::text IN ('cutting','post_cutting','sewing','finishing','ironing','quality_check')
    ) AS is_active,
    -- Workshop-only flags for ready check
    bool_or(g.location::text = 'workshop')                   AS has_workshop_garment,
    bool_and(
        g.location::text <> 'workshop'
        OR g.piece_stage::text = 'ready_for_dispatch'
    ) AS all_workshop_ready,
    -- Status-label ingredients (ported from getOrderStatusLabel)
    bool_and(g.location::text = 'shop')                      AS all_at_shop,
    bool_or(g.location::text = 'transit_to_shop')            AS has_transit_to_shop,
    bool_or(
        g.garment_type::text = 'final'
        AND g.location::text IN ('workshop','transit_to_workshop')
        AND g.piece_stage::text <> 'waiting_for_acceptance'
    ) AS finals_active_workshop,
    bool_or(
        g.garment_type::text = 'final'
        AND g.piece_stage::text = 'waiting_for_acceptance'
    ) AS finals_parked,
    bool_or(
        g.garment_type::text = 'brova'
        AND g.location::text IN ('workshop','transit_to_workshop')
    ) AS brovas_at_workshop,
    bool_and(
        g.garment_type::text <> 'brova'
        OR g.location::text = 'shop'
    ) AS brovas_all_at_shop_or_absent,
    bool_or(g.garment_type::text = 'brova')                  AS has_any_brova,
    bool_or(
        g.garment_type::text = 'brova'
        AND g.location::text = 'transit_to_shop'
    ) AS brovas_in_transit_to_shop,
    bool_or(
        g.garment_type::text = 'brova'
        AND g.acceptance_status = TRUE
    ) AS any_brova_accepted,
    bool_and(
        g.location::text <> 'workshop'
        OR g.piece_stage::text = 'waiting_for_acceptance'
    ) AS only_parked_at_workshop,
    -- Location garment counts for overview summary
    COUNT(*) FILTER (WHERE g.location::text = 'shop')              AS shop_count,
    COUNT(*) FILTER (WHERE g.location::text IN ('transit_to_shop','transit_to_workshop')) AS transit_count,
    -- Garment type counts (appended at end for CREATE OR REPLACE VIEW compatibility)
    COUNT(*) FILTER (WHERE g.garment_type::text = 'brova')         AS brova_count,
    COUNT(*) FILTER (WHERE g.garment_type::text = 'final')         AS final_count,
    -- Earliest per-garment delivery date (NULL if no garment has its own date set)
    MIN(g.delivery_date)                                           AS earliest_garment_delivery,
    -- Alteration-order support (Phase 4): customer-brought garments use
    -- garment_type='alteration'. Alteration orders carry no order-level
    -- delivery_date or home_delivery — both live uniformly on the garments.
    bool_or(g.garment_type::text = 'alteration')                   AS has_alteration,
    COUNT(*) FILTER (WHERE g.garment_type::text = 'alteration')    AS alteration_count,
    bool_or(COALESCE(g.home_delivery, FALSE))                      AS any_home_delivery
FROM garments g
GROUP BY g.order_id;

-- Status-label CASE matching getOrderStatusLabel(). Returns the label text.
DROP FUNCTION IF EXISTS assigned_order_status_label(
    BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN
);
CREATE OR REPLACE FUNCTION assigned_order_status_label(
    p_all_at_shop BOOLEAN,
    p_has_workshop_garment BOOLEAN,
    p_all_workshop_ready BOOLEAN,
    p_has_transit_to_shop BOOLEAN,
    p_only_parked_at_workshop BOOLEAN,
    p_brovas_in_transit_to_shop BOOLEAN,
    p_finals_active_workshop BOOLEAN,
    p_brovas_all_at_shop BOOLEAN,
    p_has_any_brova BOOLEAN,
    p_any_brova_accepted BOOLEAN,
    p_finals_parked BOOLEAN,
    p_brovas_at_workshop BOOLEAN,
    p_has_alteration BOOLEAN
) RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_all_at_shop
            THEN 'At shop'
        WHEN p_has_workshop_garment AND p_all_workshop_ready
            THEN 'Ready for dispatch'
        WHEN p_has_transit_to_shop AND (NOT p_has_workshop_garment OR p_only_parked_at_workshop)
            THEN 'In transit to shop'
        WHEN p_brovas_in_transit_to_shop AND NOT p_finals_active_workshop
            THEN 'Brovas in transit'
        WHEN p_has_any_brova AND p_brovas_all_at_shop AND NOT p_finals_active_workshop AND p_finals_parked AND p_any_brova_accepted
            THEN 'Awaiting finals release'
        WHEN p_has_any_brova AND p_brovas_all_at_shop AND NOT p_finals_active_workshop AND p_finals_parked
            THEN 'Awaiting brova trial'
        WHEN p_has_any_brova AND p_brovas_all_at_shop AND NOT p_finals_active_workshop
            THEN 'At shop'
        WHEN p_finals_active_workshop
            THEN 'Finals in production'
        WHEN p_brovas_at_workshop
            THEN 'Brovas in production'
        WHEN p_has_alteration
            THEN 'Alteration in production'
        ELSE 'In production'
    END;
$$;

-- ─── Overview RPC ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_assigned_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH base AS (
        SELECT
            o.id                           AS order_id,
            o.brand::text                  AS brand,
            o.order_type::text             AS order_type,
            COALESCE(wo.invoice_number, ao.invoice_number)         AS invoice_number,
            COALESCE(wo.delivery_date, agg.earliest_garment_delivery) AS delivery_date,
            COALESCE(wo.home_delivery, agg.any_home_delivery)      AS home_delivery,
            c.name                         AS customer_name,
            c.phone                        AS customer_phone,
            c.country_code                 AS customer_country_code,
            agg.garments_count,
            COALESCE(agg.any_express, false) AS any_express,
            agg.any_returns,
            agg.max_trip,
            agg.is_active,
            agg.has_workshop_garment,
            agg.all_workshop_ready,
            agg.shop_count,
            agg.transit_count,
            COALESCE(agg.has_alteration, false) AS has_alteration,
            -- Days to delivery (integer). NULL when no delivery_date.
            CASE WHEN COALESCE(wo.delivery_date, agg.earliest_garment_delivery) IS NULL THEN NULL
                 ELSE CEIL(EXTRACT(EPOCH FROM (COALESCE(wo.delivery_date, agg.earliest_garment_delivery) - NOW())) / 86400.0)::INT
            END AS days_to_delivery
        FROM orders o
        LEFT JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN alteration_orders ao ON ao.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN assigned_order_agg agg ON agg.order_id = o.id
        WHERE o.checkout_status::text = 'confirmed'
          AND o.order_type::text IN ('WORK', 'ALTERATION')
          AND COALESCE(wo.order_phase::text, ao.order_phase::text) = 'in_progress'
    ),
    classified AS (
        SELECT
            b.*,
            (b.days_to_delivery IS NOT NULL AND b.days_to_delivery < 0)                AS is_overdue,
            (b.days_to_delivery IS NOT NULL AND b.days_to_delivery BETWEEN 0 AND 2)    AS is_due_soon,
            (b.has_workshop_garment AND b.all_workshop_ready)                          AS is_ready
        FROM base b
    ),
    stats AS (
        SELECT
            COUNT(*) FILTER (WHERE is_overdue)                         AS overdue_count,
            COUNT(*) FILTER (WHERE is_due_soon)                        AS due_soon_count,
            COUNT(*) FILTER (WHERE is_active)                          AS active_count,
            COUNT(*) FILTER (WHERE is_ready)                           AS ready_count,
            COUNT(*) FILTER (WHERE any_returns)                        AS returns_count,
            COUNT(*)                                                   AS total_count,
            COALESCE(SUM(shop_count), 0)::INT                          AS at_shop_count,
            COALESCE(SUM(transit_count), 0)::INT                       AS in_transit_count
        FROM classified
    ),
    -- Sort orders by urgency: overdue first, then express, then delivery_date asc.
    sorted AS (
        SELECT c.*,
            row_number() OVER (
                ORDER BY
                    (is_overdue)::int DESC,
                    (any_express)::int DESC,
                    COALESCE(days_to_delivery, 999) ASC,
                    order_id ASC
            ) AS urgency_rn
        FROM classified c
    ),
    -- Order JSON builder used by all quick lists. Matches the preview shape
    -- the frontend QuickOrderList renders.
    quick_list_overdue AS (
        SELECT s.urgency_rn, jsonb_build_object(
            'order_id',       s.order_id,
            'customer_name',  s.customer_name,
            'brand',          s.brand,
            'express',        s.any_express,
            'delivery_date',  s.delivery_date,
            'days_to_delivery', s.days_to_delivery,
            'garments_count', s.garments_count,
            'max_trip',       s.max_trip,
            'brova_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'brova'), 0),
            'final_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'final'), 0)
        ) AS row_json
        FROM sorted s
        WHERE s.is_overdue
        ORDER BY s.urgency_rn
        LIMIT 5
    ),
    quick_list_due_soon AS (
        SELECT s.urgency_rn, jsonb_build_object(
            'order_id',       s.order_id,
            'customer_name',  s.customer_name,
            'brand',          s.brand,
            'express',        s.any_express,
            'delivery_date',  s.delivery_date,
            'days_to_delivery', s.days_to_delivery,
            'garments_count', s.garments_count,
            'max_trip',       s.max_trip,
            'brova_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'brova'), 0),
            'final_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'final'), 0)
        ) AS row_json
        FROM sorted s
        WHERE s.is_due_soon
        ORDER BY s.urgency_rn
        LIMIT 5
    ),
    quick_list_ready AS (
        SELECT s.urgency_rn, jsonb_build_object(
            'order_id',       s.order_id,
            'customer_name',  s.customer_name,
            'brand',          s.brand,
            'express',        s.any_express,
            'delivery_date',  s.delivery_date,
            'days_to_delivery', s.days_to_delivery,
            'garments_count', s.garments_count,
            'max_trip',       s.max_trip,
            'brova_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'brova'), 0),
            'final_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'final'), 0)
        ) AS row_json
        FROM sorted s
        WHERE s.is_ready
        ORDER BY s.urgency_rn
        LIMIT 5
    ),
    quick_list_returns AS (
        SELECT s.urgency_rn, jsonb_build_object(
            'order_id',       s.order_id,
            'customer_name',  s.customer_name,
            'brand',          s.brand,
            'express',        s.any_express,
            'delivery_date',  s.delivery_date,
            'days_to_delivery', s.days_to_delivery,
            'garments_count', s.garments_count,
            'max_trip',       s.max_trip,
            'brova_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'brova'), 0),
            'final_count',    COALESCE((SELECT COUNT(*) FROM garments gg WHERE gg.order_id = s.order_id AND gg.garment_type::text = 'final'), 0)
        ) AS row_json
        FROM sorted s
        WHERE s.any_returns
        ORDER BY s.urgency_rn
        LIMIT 5
    ),
    -- Workshop pipeline garments: only garments currently at workshop in an
    -- active production stage. Slimmed to what StagePipelineChart renders.
    pipeline_garments AS (
        SELECT jsonb_agg(row_json ORDER BY rn) AS garments
        FROM (
            SELECT
                row_number() OVER (ORDER BY g.order_id, g.garment_id) AS rn,
                jsonb_build_object(
                    'id',              g.id,
                    'order_id',        g.order_id,
                    'garment_id',      g.garment_id,
                    'garment_type',    g.garment_type,
                    'piece_stage',     g.piece_stage,
                    'location',        g.location,
                    'trip_number',     g.trip_number,
                    'express',         g.express,
                    'customer_name',   cc.name,
                    'style_name',      COALESCE(st.name, g.style),
                    'production_plan', g.production_plan,
                    'worker_history',  g.worker_history
                ) AS row_json
            FROM garments g
            INNER JOIN orders o2 ON o2.id = g.order_id AND o2.checkout_status::text = 'confirmed'
              AND o2.order_type::text IN ('WORK', 'ALTERATION')
            LEFT JOIN work_orders wo2 ON wo2.order_id = o2.id
            LEFT JOIN alteration_orders ao2 ON ao2.order_id = o2.id
            LEFT JOIN customers cc ON cc.id = o2.customer_id
            LEFT JOIN styles st ON st.id = g.style_id
            WHERE COALESCE(wo2.order_phase::text, ao2.order_phase::text) = 'in_progress'
              AND g.location::text = 'workshop'
              AND g.piece_stage::text IN ('soaking','cutting','post_cutting','sewing','finishing','ironing','quality_check','ready_for_dispatch','waiting_cut')
        ) s
    )
    SELECT jsonb_build_object(
        'stats', jsonb_build_object(
            'overdue',    (SELECT overdue_count    FROM stats),
            'due_soon',   (SELECT due_soon_count   FROM stats),
            'active',     (SELECT active_count     FROM stats),
            'ready',      (SELECT ready_count      FROM stats),
            'returns',    (SELECT returns_count    FROM stats),
            'total',      (SELECT total_count      FROM stats),
            'at_shop',    (SELECT at_shop_count    FROM stats),
            'in_transit', (SELECT in_transit_count FROM stats)
        ),
        'quick_lists', jsonb_build_object(
            'overdue',  COALESCE((SELECT jsonb_agg(row_json ORDER BY urgency_rn) FROM quick_list_overdue),  '[]'::jsonb),
            'due_soon', COALESCE((SELECT jsonb_agg(row_json ORDER BY urgency_rn) FROM quick_list_due_soon), '[]'::jsonb),
            'ready',    COALESCE((SELECT jsonb_agg(row_json ORDER BY urgency_rn) FROM quick_list_ready),    '[]'::jsonb),
            'returns',  COALESCE((SELECT jsonb_agg(row_json ORDER BY urgency_rn) FROM quick_list_returns),  '[]'::jsonb)
        ),
        'pipeline_garments', COALESCE((SELECT garments FROM pipeline_garments), '[]'::jsonb)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

-- ─── Paginated list RPC ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_assigned_orders_page(
    p_tab TEXT DEFAULT 'all',
    p_chips TEXT[] DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSONB;
    v_page_size INT := GREATEST(COALESCE(p_page_size, 20), 1);
    v_offset INT := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_page_size;
    v_chips TEXT[] := COALESCE(p_chips, ARRAY[]::TEXT[]);
    v_chip_express BOOLEAN := 'express'  = ANY(v_chips);
    v_chip_delivery BOOLEAN := 'delivery' = ANY(v_chips);
    v_chip_soaking BOOLEAN  := 'soaking'  = ANY(v_chips);
BEGIN
    WITH base AS (
        SELECT
            o.id                             AS order_id,
            o.brand::text                    AS brand,
            o.order_type::text               AS order_type,
            COALESCE(wo.invoice_number, ao.invoice_number)         AS invoice_number,
            COALESCE(wo.delivery_date, agg.earliest_garment_delivery) AS delivery_date,
            COALESCE(wo.home_delivery, agg.any_home_delivery)      AS home_delivery,
            c.name                           AS customer_name,
            c.phone                          AS customer_phone,
            c.country_code                   AS customer_country_code,
            agg.garments_count,
            COALESCE(agg.brova_count, 0) AS brova_count,
            COALESCE(agg.final_count, 0) AS final_count,
            COALESCE(agg.alteration_count, 0) AS alteration_count,
            agg.earliest_garment_delivery,
            COALESCE(agg.any_express, false) AS any_express,
            COALESCE(agg.any_soaking, false) AS any_soaking,
            agg.any_returns,
            agg.max_trip,
            agg.is_active,
            agg.has_workshop_garment,
            agg.all_workshop_ready,
            agg.all_at_shop,
            agg.has_transit_to_shop,
            agg.only_parked_at_workshop,
            agg.brovas_in_transit_to_shop,
            agg.finals_active_workshop,
            agg.brovas_all_at_shop_or_absent,
            agg.has_any_brova,
            agg.any_brova_accepted,
            agg.finals_parked,
            agg.brovas_at_workshop,
            COALESCE(agg.has_alteration, false) AS has_alteration,
            CASE WHEN COALESCE(wo.delivery_date, agg.earliest_garment_delivery) IS NULL THEN NULL
                 ELSE CEIL(EXTRACT(EPOCH FROM (COALESCE(wo.delivery_date, agg.earliest_garment_delivery) - NOW())) / 86400.0)::INT
            END AS days_to_delivery
        FROM orders o
        LEFT JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN alteration_orders ao ON ao.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN assigned_order_agg agg ON agg.order_id = o.id
        WHERE o.checkout_status::text = 'confirmed'
          AND o.order_type::text IN ('WORK', 'ALTERATION')
          AND COALESCE(wo.order_phase::text, ao.order_phase::text) = 'in_progress'
    ),
    classified AS (
        SELECT
            b.*,
            (b.days_to_delivery IS NOT NULL AND b.days_to_delivery < 0)              AS is_overdue,
            (b.days_to_delivery IS NOT NULL AND b.days_to_delivery BETWEEN 0 AND 2)  AS is_due_soon,
            (b.has_workshop_garment AND b.all_workshop_ready)                        AS is_ready
        FROM base b
    ),
    -- Tab filter. 'attention' is overdue OR due_soon OR returns.
    tab_filtered AS (
        SELECT * FROM classified
        WHERE CASE
            WHEN p_tab = 'production' THEN is_active
            WHEN p_tab = 'ready'      THEN is_ready
            WHEN p_tab = 'attention'  THEN (is_overdue OR is_due_soon OR any_returns)
            WHEN p_tab = 'all'        THEN TRUE
            ELSE TRUE
        END
    ),
    -- Chip counts reflect post-tab, pre-chip filter set.
    chip_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE any_express)     AS express_count,
            COUNT(*) FILTER (WHERE home_delivery)   AS delivery_count,
            COUNT(*) FILTER (WHERE any_soaking)     AS soaking_count
        FROM tab_filtered
    ),
    chip_filtered AS (
        SELECT * FROM tab_filtered
        WHERE (NOT v_chip_express  OR any_express)
          AND (NOT v_chip_delivery OR home_delivery)
          AND (NOT v_chip_soaking  OR any_soaking)
    ),
    ranked AS (
        SELECT cf.*,
            row_number() OVER (
                ORDER BY
                    (is_overdue)::int DESC,
                    (any_express)::int DESC,
                    COALESCE(days_to_delivery, 999) ASC,
                    order_id ASC
            ) AS rn
        FROM chip_filtered cf
    ),
    page AS (
        SELECT * FROM ranked
        ORDER BY rn
        LIMIT v_page_size
        OFFSET v_offset
    ),
    -- Pre-compute garment summaries for all page orders in one scan
    page_garment_summaries AS (
        SELECT
            g.order_id,
            jsonb_agg(jsonb_build_object(
                'type',     g.garment_type::text,
                'stage',    g.piece_stage::text,
                'loc',      g.location::text,
                'fb',       g.feedback_status::text,
                'acc',      g.acceptance_status,
                'trip',     COALESCE(g.trip_number, 1),
                'gid',      g.garment_id,
                'in_prod',  COALESCE(g.in_production, false),
                'has_plan', g.production_plan IS NOT NULL,
                'started',  g.start_time IS NOT NULL,
                'express',  COALESCE(g.express, false),
                'del',      g.delivery_date,
                'qc_fail',  COALESCE((
                    SELECT bool_or((qca->>'result') = 'fail')
                    FROM jsonb_array_elements(g.trip_history) AS th
                    CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN th ? 'qc_attempts' THEN th->'qc_attempts' ELSE '[]'::jsonb END
                    ) AS qca
                    WHERE (th->>'trip')::int = COALESCE(g.trip_number, 1)
                ), false)
            ) ORDER BY
                CASE g.garment_type::text
                    WHEN 'brova' THEN 0
                    WHEN 'final' THEN 1
                    WHEN 'alteration' THEN 2
                    ELSE 3
                END,
                g.garment_id NULLS LAST
            ) AS summaries
        FROM garments g
        WHERE g.order_id IN (SELECT order_id FROM page)
        GROUP BY g.order_id
    ),
    page_rows AS (
        SELECT
            p.rn,
            jsonb_build_object(
                'order_id',        p.order_id,
                'order_type',      p.order_type,
                'invoice_number',  p.invoice_number,
                'customer_name',   p.customer_name,
                'customer_mobile', NULLIF(TRIM(BOTH FROM COALESCE(p.customer_country_code, '') || ' ' || COALESCE(p.customer_phone, '')), ''),
                'brands',          CASE WHEN p.brand IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p.brand) END,
                'express',         p.any_express,
                'soaking',         p.any_soaking,
                'has_returns',     COALESCE(p.any_returns, false),
                'home_delivery',   p.home_delivery,
                'delivery_date',   p.delivery_date,
                'max_trip',        p.max_trip,
                'status_label',    assigned_order_status_label(
                    COALESCE(p.all_at_shop, false),
                    COALESCE(p.has_workshop_garment, false),
                    COALESCE(p.all_workshop_ready, false),
                    COALESCE(p.has_transit_to_shop, false),
                    COALESCE(p.only_parked_at_workshop, false),
                    COALESCE(p.brovas_in_transit_to_shop, false),
                    COALESCE(p.finals_active_workshop, false),
                    COALESCE(p.has_any_brova AND p.brovas_all_at_shop_or_absent, false),
                    COALESCE(p.has_any_brova, false),
                    COALESCE(p.any_brova_accepted, false),
                    COALESCE(p.finals_parked, false),
                    COALESCE(p.brovas_at_workshop, false),
                    COALESCE(p.has_alteration, false)
                ),
                'has_brova',         COALESCE(p.has_any_brova, false),
                'has_alteration',    COALESCE(p.has_alteration, false),
                'brova_count',       p.brova_count,
                'final_count',       p.final_count,
                'alteration_count',  p.alteration_count,
                'garments_count',    COALESCE(p.garments_count, 0),
                'earliest_garment_delivery', p.earliest_garment_delivery,
                'garment_summaries', COALESCE(pgs.summaries, '[]'::jsonb)
            ) AS row_json
        FROM page p
        LEFT JOIN page_garment_summaries pgs ON pgs.order_id = p.order_id
    )
    SELECT jsonb_build_object(
        'data',        COALESCE((SELECT jsonb_agg(row_json ORDER BY rn) FROM page_rows), '[]'::jsonb),
        'total_count', (SELECT COUNT(*) FROM chip_filtered),
        'chip_counts', jsonb_build_object(
            'express',  (SELECT express_count  FROM chip_counts),
            'delivery', (SELECT delivery_count FROM chip_counts),
            'soaking',  (SELECT soaking_count  FROM chip_counts)
        )
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- WORKSHOP SIDEBAR COUNTS: single-aggregate RPC
-- ═══════════════════════════════════════════════════════════════════════
-- The workshop sidebar shows 11 badge counts (receiving, parking,
-- scheduler, soaking..dispatch). Previously computed client-side from the
-- full workshop garment cache, which meant every mutation forced a
-- ~300 KB refetch. Now one RPC returns just 11 integers.
--
-- Scope matches the original client filters:
--   - Only garments from orders with checkout_status = 'confirmed'
--   - Scheduler count requires in_production=true, no production_plan yet,
--     piece_stage = 'waiting_cut', location = 'workshop'
--   - Terminal stage counts require location = 'workshop'
CREATE OR REPLACE FUNCTION get_workshop_sidebar_counts()
RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
    WITH scoped AS (
        SELECT g.*
        FROM garments g
        INNER JOIN orders o ON o.id = g.order_id AND o.checkout_status::text = 'confirmed'
    )
    SELECT jsonb_build_object(
        'receiving',     COUNT(*) FILTER (WHERE location::text IN ('transit_to_workshop','lost_in_transit')),
        'parking',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND NOT in_production AND piece_stage::text <> 'discarded' AND (piece_stage::text <> 'waiting_for_acceptance' OR garment_type::text = 'final')),
        'scheduler',     COUNT(*) FILTER (WHERE location::text = 'workshop' AND in_production AND production_plan IS NULL AND piece_stage::text = 'waiting_cut'),
        'soaking',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND soaking IS TRUE AND soaking_completed_at IS NULL AND trip_number = 1),
        'cutting',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'cutting'),
        'post_cutting',  COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'post_cutting'),
        'sewing',        COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'sewing'),
        'finishing',     COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'finishing'),
        'ironing',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'ironing'),
        'quality_check', COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'quality_check'),
        'dispatch',      COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'ready_for_dispatch')
    )
    FROM scoped;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION: trip_number default shifted from 1 → 0
-- ────────────────────────────────────────────────────────────────────────────
-- Before this change, newly created garments started at trip_number = 1, which
-- collided with "first trip at workshop". Now 0 = never dispatched, 1 = first
-- trip at workshop, and the POS dispatch page filters on trip_number = 0.
--
-- Backfill existing rows that were created pre-migration and are still sitting
-- at the shop awaiting their first dispatch. The predicate is deliberately
-- narrow: location = 'shop' AND pre-dispatch piece_stage AND trip_number = 1
-- — this cannot touch any garment that has been dispatched (those are either
-- at workshop/in transit, or have trip ≥ 2 from a return cycle).
--
-- Idempotent: running multiple times is safe; subsequent runs find nothing to
-- update because matching rows have already been set to 0.
UPDATE garments
SET trip_number = 0
WHERE location = 'shop'
  AND piece_stage IN ('waiting_cut', 'waiting_for_acceptance')
  AND trip_number = 1;

-- ========================================================================
-- REALTIME: Add tables to supabase_realtime publication
-- ========================================================================
-- Supabase Realtime's postgres_changes channel only fires for tables that
-- are members of the `supabase_realtime` publication. Without this, the
-- frontend websocket receives zero events.
--
-- Using IF NOT EXISTS isn't supported for publication members, so we drop
-- and re-add. This is idempotent and safe to run repeatedly.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'garments', 'orders', 'work_orders', 'dispatch_log',
    'order_shelf_items', 'transfer_requests', 'transfer_request_items',
    'fabrics', 'shelf', 'accessories', 'notifications'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN duplicate_object THEN
      -- already a member, nothing to do
      NULL;
    END;
  END LOOP;
END $$;

-- ── Notifications RLS ──────────────────────────────────────────────────
-- Realtime requires RLS + SELECT policy to broadcast events. Without this
-- notifications INSERT events are silently filtered out.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications
    FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications
    FOR INSERT WITH CHECK (is_active_user());

ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_reads_select" ON notification_reads;
CREATE POLICY "notification_reads_select" ON notification_reads
    FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "notification_reads_insert" ON notification_reads;
CREATE POLICY "notification_reads_insert" ON notification_reads
    FOR INSERT WITH CHECK (is_active_user());

-- ── Accessories RLS ────────────────────────────────────────────────────
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accessories_select" ON accessories;
CREATE POLICY "accessories_select" ON accessories
    FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "accessories_insert" ON accessories;
CREATE POLICY "accessories_insert" ON accessories
    FOR INSERT WITH CHECK (is_manager_or_above());

DROP POLICY IF EXISTS "accessories_update" ON accessories;
CREATE POLICY "accessories_update" ON accessories
    FOR UPDATE USING (is_manager_or_above());

-- ── Update delivery charge ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_delivery_charge(
  p_order_id INT,
  p_delivery_charge DECIMAL
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_new_total DECIMAL;
BEGIN
  SELECT order_total, delivery_charge, paid INTO v_order
  FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF p_delivery_charge < 0 THEN
    RAISE EXCEPTION 'Delivery charge cannot be negative';
  END IF;

  v_new_total := COALESCE(v_order.order_total, 0) - COALESCE(v_order.delivery_charge, 0) + p_delivery_charge;

  IF v_new_total < COALESCE(v_order.paid, 0) THEN
    RAISE EXCEPTION 'New delivery charge would reduce order total (%) below amount already paid (%). Refund the excess first.', v_new_total, COALESCE(v_order.paid, 0);
  END IF;

  UPDATE orders
  SET delivery_charge = p_delivery_charge,
      order_total = v_new_total
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'delivery_charge', p_delivery_charge,
    'order_total', v_new_total
  );
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- STOCK MOVEMENTS LEDGER — auto-log triggers + restock/adjust/consume RPCs
-- ═══════════════════════════════════════════════════════════════════════
--
-- Every UPDATE on fabrics/shelf/accessories that changes shop_stock or
-- workshop_stock auto-logs a row to stock_movements. Callers stamp context
-- via session settings before the UPDATE so the trigger knows WHY:
--
--   PERFORM set_config('app.movement_type',     'restock',    true);
--   PERFORM set_config('app.movement_ref_type', 'restock',    true);
--   PERFORM set_config('app.movement_ref_id',   '42',         true);
--   PERFORM set_config('app.movement_user_id',  '<uuid>',     true);
--   PERFORM set_config('app.movement_reason',   'supplier delivery', true);
--   PERFORM set_config('app.movement_notes',    'arrived in 3 boxes', true);
--   PERFORM set_config('app.movement_supplier_id', '7',       true);
--   PERFORM set_config('app.movement_unit_cost',   '12.500',  true);
--
-- Missing settings → defaults to movement_type='adjustment',
-- reason='unattributed' so the change is never silently lost.

-- Helper: read session setting safely, returning NULL when empty/missing.
CREATE OR REPLACE FUNCTION _movement_setting(p_key TEXT)
RETURNS TEXT AS $$
DECLARE
  v_val TEXT;
BEGIN
  v_val := current_setting(p_key, true);
  IF v_val IS NULL OR v_val = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_val;
END;
$$ LANGUAGE plpgsql STABLE;

-- Core: insert one ledger row given a stock delta on one location.
CREATE OR REPLACE FUNCTION _log_stock_movement(
  p_item_type stock_item_type,
  p_item_id INT,
  p_location stock_location,
  p_qty_before NUMERIC,
  p_qty_after NUMERIC
)
RETURNS VOID AS $$
DECLARE
  v_delta NUMERIC := COALESCE(p_qty_after, 0) - COALESCE(p_qty_before, 0);
  v_type stock_movement_type;
  v_supplier_id INT;
  v_user_id UUID;
  v_unit_cost NUMERIC;
  v_ref_id INT;
BEGIN
  IF v_delta = 0 THEN
    RETURN;  -- no-op, nothing to log
  END IF;

  -- Resolve movement_type from session, defaulting to adjustment if not set
  v_type := COALESCE(_movement_setting('app.movement_type')::stock_movement_type, 'adjustment'::stock_movement_type);

  v_supplier_id := NULLIF(_movement_setting('app.movement_supplier_id'), '')::INT;
  v_user_id := NULLIF(_movement_setting('app.movement_user_id'), '')::UUID;
  v_unit_cost := NULLIF(_movement_setting('app.movement_unit_cost'), '')::NUMERIC;
  v_ref_id := NULLIF(_movement_setting('app.movement_ref_id'), '')::INT;

  INSERT INTO stock_movements (
    item_type, item_id, location, movement_type,
    qty_delta, qty_before, qty_after,
    ref_type, ref_id,
    supplier_id, unit_cost,
    reason, notes,
    user_id
  )
  VALUES (
    p_item_type, p_item_id, p_location, v_type,
    v_delta, p_qty_before, p_qty_after,
    _movement_setting('app.movement_ref_type'), v_ref_id,
    v_supplier_id, v_unit_cost,
    COALESCE(_movement_setting('app.movement_reason'),
             CASE WHEN v_type = 'adjustment' THEN 'unattributed' ELSE NULL END),
    _movement_setting('app.movement_notes'),
    v_user_id
  );
END;
$$ LANGUAGE plpgsql;

-- Per-table trigger functions: split shop vs workshop into two ledger rows
-- if both changed in the same UPDATE.

CREATE OR REPLACE FUNCTION log_fabric_stock_change()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.shop_stock, 0) <> COALESCE(OLD.shop_stock, 0) THEN
    PERFORM _log_stock_movement('fabric', NEW.id, 'shop',
      OLD.shop_stock, NEW.shop_stock);
  END IF;
  IF COALESCE(NEW.workshop_stock, 0) <> COALESCE(OLD.workshop_stock, 0) THEN
    PERFORM _log_stock_movement('fabric', NEW.id, 'workshop',
      OLD.workshop_stock, NEW.workshop_stock);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fabric_stock_audit ON fabrics;
CREATE TRIGGER fabric_stock_audit
  AFTER UPDATE ON fabrics
  FOR EACH ROW
  WHEN (OLD.shop_stock IS DISTINCT FROM NEW.shop_stock
     OR OLD.workshop_stock IS DISTINCT FROM NEW.workshop_stock)
  EXECUTE FUNCTION log_fabric_stock_change();

CREATE OR REPLACE FUNCTION log_shelf_stock_change()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.shop_stock, 0) <> COALESCE(OLD.shop_stock, 0) THEN
    PERFORM _log_stock_movement('shelf', NEW.id, 'shop',
      OLD.shop_stock::numeric, NEW.shop_stock::numeric);
  END IF;
  IF COALESCE(NEW.workshop_stock, 0) <> COALESCE(OLD.workshop_stock, 0) THEN
    PERFORM _log_stock_movement('shelf', NEW.id, 'workshop',
      OLD.workshop_stock::numeric, NEW.workshop_stock::numeric);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shelf_stock_audit ON shelf;
CREATE TRIGGER shelf_stock_audit
  AFTER UPDATE ON shelf
  FOR EACH ROW
  WHEN (OLD.shop_stock IS DISTINCT FROM NEW.shop_stock
     OR OLD.workshop_stock IS DISTINCT FROM NEW.workshop_stock)
  EXECUTE FUNCTION log_shelf_stock_change();

CREATE OR REPLACE FUNCTION log_accessory_stock_change()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.shop_stock, 0) <> COALESCE(OLD.shop_stock, 0) THEN
    PERFORM _log_stock_movement('accessory', NEW.id, 'shop',
      OLD.shop_stock, NEW.shop_stock);
  END IF;
  IF COALESCE(NEW.workshop_stock, 0) <> COALESCE(OLD.workshop_stock, 0) THEN
    PERFORM _log_stock_movement('accessory', NEW.id, 'workshop',
      OLD.workshop_stock, NEW.workshop_stock);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accessory_stock_audit ON accessories;
CREATE TRIGGER accessory_stock_audit
  AFTER UPDATE ON accessories
  FOR EACH ROW
  WHEN (OLD.shop_stock IS DISTINCT FROM NEW.shop_stock
     OR OLD.workshop_stock IS DISTINCT FROM NEW.workshop_stock)
  EXECUTE FUNCTION log_accessory_stock_change();

-- ─── RPC: restock_item ────────────────────────────────────────────────
-- Add stock from external supplier delivery. Logs as movement_type='restock'.
DROP FUNCTION IF EXISTS restock_item(stock_item_type, integer, stock_location, numeric, integer, numeric, text, uuid);
CREATE OR REPLACE FUNCTION restock_item(
  p_item_type stock_item_type,
  p_item_id INT,
  p_location stock_location,
  p_qty NUMERIC,
  p_supplier_id INT DEFAULT NULL,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_new_qty NUMERIC;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not add stock twice.
  IF NOT idem_claim(p_idempotency_key, 'restock_item') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Restock quantity must be positive (got %)', p_qty;
  END IF;

  PERFORM set_config('app.movement_type', 'restock', true);
  -- No restock/PO entity to reference: leave ref_type/ref_id empty so the
  -- ledger doesn't carry an orphan ref_type with a NULL ref_id. Attribution
  -- for a restock is the supplier_id + reason, not a ref.
  PERFORM set_config('app.movement_ref_type', '', true);
  PERFORM set_config('app.movement_ref_id', '', true);
  PERFORM set_config('app.movement_user_id', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('app.movement_supplier_id', COALESCE(p_supplier_id::text, ''), true);
  PERFORM set_config('app.movement_unit_cost', COALESCE(p_unit_cost::text, ''), true);
  PERFORM set_config('app.movement_reason', 'supplier delivery', true);
  PERFORM set_config('app.movement_notes', COALESCE(p_notes, ''), true);

  IF p_item_type = 'fabric' THEN
    IF p_location = 'shop' THEN
      UPDATE fabrics SET shop_stock = COALESCE(shop_stock, 0) + p_qty
        WHERE id = p_item_id RETURNING shop_stock INTO v_new_qty;
    ELSE
      UPDATE fabrics SET workshop_stock = COALESCE(workshop_stock, 0) + p_qty
        WHERE id = p_item_id RETURNING workshop_stock INTO v_new_qty;
    END IF;
  ELSIF p_item_type = 'shelf' THEN
    IF p_location = 'shop' THEN
      UPDATE shelf SET shop_stock = COALESCE(shop_stock, 0) + p_qty::int
        WHERE id = p_item_id RETURNING shop_stock INTO v_new_qty;
    ELSE
      UPDATE shelf SET workshop_stock = COALESCE(workshop_stock, 0) + p_qty::int
        WHERE id = p_item_id RETURNING workshop_stock INTO v_new_qty;
    END IF;
  ELSIF p_item_type = 'accessory' THEN
    IF p_location = 'shop' THEN
      UPDATE accessories SET shop_stock = COALESCE(shop_stock, 0) + p_qty
        WHERE id = p_item_id RETURNING shop_stock INTO v_new_qty;
    ELSE
      UPDATE accessories SET workshop_stock = COALESCE(workshop_stock, 0) + p_qty
        WHERE id = p_item_id RETURNING workshop_stock INTO v_new_qty;
    END IF;
  END IF;

  IF v_new_qty IS NULL THEN
    RAISE EXCEPTION 'Item % of type % not found', p_item_id, p_item_type;
  END IF;

  v_result := jsonb_build_object('success', true, 'new_stock', v_new_qty);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ─── RPC: adjust_stock ────────────────────────────────────────────────
-- Manual stocktake correction. Sets stock to an absolute new value, logging
-- the diff as movement_type='adjustment'. Reason is required.
CREATE OR REPLACE FUNCTION adjust_stock(
  p_item_type stock_item_type,
  p_item_id INT,
  p_location stock_location,
  p_new_qty NUMERIC,
  p_reason TEXT,
  p_notes TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_old_qty NUMERIC;
BEGIN
  IF p_new_qty < 0 THEN
    RAISE EXCEPTION 'Adjusted quantity cannot be negative (got %)', p_new_qty;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Adjustment reason is required';
  END IF;

  PERFORM set_config('app.movement_type', 'adjustment', true);
  PERFORM set_config('app.movement_ref_type', 'adjustment', true);
  PERFORM set_config('app.movement_ref_id', '', true);
  PERFORM set_config('app.movement_user_id', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('app.movement_supplier_id', '', true);
  PERFORM set_config('app.movement_unit_cost', '', true);
  PERFORM set_config('app.movement_reason', p_reason, true);
  PERFORM set_config('app.movement_notes', COALESCE(p_notes, ''), true);

  IF p_item_type = 'fabric' THEN
    IF p_location = 'shop' THEN
      SELECT shop_stock INTO v_old_qty FROM fabrics WHERE id = p_item_id;
      UPDATE fabrics SET shop_stock = p_new_qty WHERE id = p_item_id;
    ELSE
      SELECT workshop_stock INTO v_old_qty FROM fabrics WHERE id = p_item_id;
      UPDATE fabrics SET workshop_stock = p_new_qty WHERE id = p_item_id;
    END IF;
  ELSIF p_item_type = 'shelf' THEN
    IF p_location = 'shop' THEN
      SELECT shop_stock INTO v_old_qty FROM shelf WHERE id = p_item_id;
      UPDATE shelf SET shop_stock = p_new_qty::int WHERE id = p_item_id;
    ELSE
      SELECT workshop_stock INTO v_old_qty FROM shelf WHERE id = p_item_id;
      UPDATE shelf SET workshop_stock = p_new_qty::int WHERE id = p_item_id;
    END IF;
  ELSIF p_item_type = 'accessory' THEN
    IF p_location = 'shop' THEN
      SELECT shop_stock INTO v_old_qty FROM accessories WHERE id = p_item_id;
      UPDATE accessories SET shop_stock = p_new_qty WHERE id = p_item_id;
    ELSE
      SELECT workshop_stock INTO v_old_qty FROM accessories WHERE id = p_item_id;
      UPDATE accessories SET workshop_stock = p_new_qty WHERE id = p_item_id;
    END IF;
  END IF;

  IF v_old_qty IS NULL THEN
    RAISE EXCEPTION 'Item % of type % not found', p_item_id, p_item_type;
  END IF;

  RETURN jsonb_build_object('success', true, 'old_stock', v_old_qty, 'new_stock', p_new_qty);
END;
$$ LANGUAGE plpgsql;

-- ─── RPC: consume_for_order ───────────────────────────────────────────
-- Atomic replacement for the non-atomic Promise.all in useOrderMutations.ts.
-- Decrements both fabric and shelf stocks for an order, logging consumption
-- rows tied to the order_id (and per-garment for fabric).
--
-- p_fabric_items: [{ garment_id: uuid, fabric_id: int, qty: numeric }]
-- p_shelf_items:  [{ shelf_id: int, qty: int }]
DROP FUNCTION IF EXISTS consume_for_order(integer, jsonb, jsonb, uuid);
CREATE OR REPLACE FUNCTION consume_for_order(
  p_order_id INT,
  p_fabric_items JSONB DEFAULT '[]'::jsonb,
  p_shelf_items JSONB DEFAULT '[]'::jsonb,
  p_user_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_qty NUMERIC;
  v_current NUMERIC;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not decrement stock twice.
  IF NOT idem_claim(p_idempotency_key, 'consume_for_order') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  -- Stamp ledger context once for the whole batch
  PERFORM set_config('app.movement_type', 'consumption', true);
  PERFORM set_config('app.movement_ref_type', 'order', true);
  PERFORM set_config('app.movement_ref_id', p_order_id::text, true);
  PERFORM set_config('app.movement_user_id', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('app.movement_supplier_id', '', true);
  PERFORM set_config('app.movement_unit_cost', '', true);
  PERFORM set_config('app.movement_reason', 'order consumption', true);
  PERFORM set_config('app.movement_notes', '', true);

  -- Fabric consumption (per-garment context in notes)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_fabric_items)
  LOOP
    v_qty := (v_item->>'qty')::numeric;
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT shop_stock INTO v_current FROM fabrics WHERE id = (v_item->>'fabric_id')::int FOR UPDATE;
    IF v_current IS NULL THEN
      RAISE EXCEPTION 'Fabric % not found', v_item->>'fabric_id';
    END IF;
    IF v_current < v_qty THEN
      RAISE EXCEPTION 'Insufficient shop stock for fabric %: have %, need %',
        v_item->>'fabric_id', v_current, v_qty;
    END IF;

    -- Per-iteration: stamp garment_id in notes so per-garment trace is preserved
    PERFORM set_config('app.movement_notes',
      'garment ' || COALESCE(v_item->>'garment_id', '?'), true);

    UPDATE fabrics SET shop_stock = shop_stock - v_qty
      WHERE id = (v_item->>'fabric_id')::int;
  END LOOP;

  -- Shelf consumption (clear notes back to empty for these rows)
  PERFORM set_config('app.movement_notes', '', true);
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shelf_items)
  LOOP
    v_qty := (v_item->>'qty')::numeric;
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT shop_stock INTO v_current FROM shelf WHERE id = (v_item->>'shelf_id')::int FOR UPDATE;
    IF v_current IS NULL THEN
      RAISE EXCEPTION 'Shelf item % not found', v_item->>'shelf_id';
    END IF;
    IF v_current < v_qty THEN
      RAISE EXCEPTION 'Insufficient shop stock for shelf item %: have %, need %',
        v_item->>'shelf_id', v_current, v_qty;
    END IF;

    UPDATE shelf SET shop_stock = shop_stock - v_qty::int
      WHERE id = (v_item->>'shelf_id')::int;
  END LOOP;

  v_result := jsonb_build_object('success', true, 'order_id', p_order_id);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ─── Aggregates RPC for Reports page ─────────────────────────────────
-- Returns totals per movement_type within a date range, optionally scoped
-- by item_type and location.
CREATE OR REPLACE FUNCTION get_movement_aggregates(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_item_type stock_item_type DEFAULT NULL,
  p_location stock_location DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'totals', COALESCE(jsonb_object_agg(movement_type, total), '{}'::jsonb),
    'count', SUM(cnt)
  )
  INTO v_result
  FROM (
    SELECT movement_type::text,
           SUM(ABS(qty_delta)) AS total,
           COUNT(*) AS cnt
    FROM stock_movements
    WHERE created_at >= p_from AND created_at < p_to
      AND (p_item_type IS NULL OR item_type = p_item_type)
      AND (p_location IS NULL OR location = p_location)
    GROUP BY movement_type
  ) AS t;

  RETURN COALESCE(v_result, jsonb_build_object('totals', '{}'::jsonb, 'count', 0));
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── Top-N items by movement type ────────────────────────────────────
CREATE OR REPLACE FUNCTION get_top_items_by_movement(
  p_movement_type stock_movement_type,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_limit INT DEFAULT 10
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH sums AS (
    SELECT item_type, item_id, SUM(ABS(qty_delta)) AS total
    FROM stock_movements
    WHERE created_at >= p_from AND created_at < p_to
      AND movement_type = p_movement_type
    GROUP BY item_type, item_id
    ORDER BY total DESC
    LIMIT p_limit
  ), enriched AS (
    SELECT s.item_type::text,
           s.item_id,
           s.total,
           CASE s.item_type
             WHEN 'fabric'    THEN (SELECT name FROM fabrics    WHERE id = s.item_id)
             WHEN 'shelf'     THEN (SELECT type FROM shelf      WHERE id = s.item_id)
             WHEN 'accessory' THEN (SELECT name FROM accessories WHERE id = s.item_id)
           END AS name
    FROM sums s
  )
  SELECT jsonb_agg(row_to_json(enriched)) INTO v_result FROM enriched;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE;

-- Direct send: create a transfer that's already approved + dispatched in one
-- step. Used when the source side is pushing items proactively, without a
-- prior request from the destination. The destination still needs to call
-- receive_transfer to confirm arrival.
--
-- The result has the same shape as a normal transfer (transfer_requests +
-- transfer_request_items rows) so the rest of the system — receive flow,
-- stock_movements ledger, audit timeline — works unchanged. The only
-- difference is that requested_at = approved_at = dispatched_at, and all
-- three qty fields on each item are equal.
DROP FUNCTION IF EXISTS direct_send_transfer(uuid, brand, transfer_direction, transfer_item_type, jsonb, text);
CREATE OR REPLACE FUNCTION direct_send_transfer(
  p_sender UUID,
  p_brand brand,
  p_direction transfer_direction,
  p_item_type transfer_item_type,
  p_items JSONB,  -- [{ fabric_id?: int, shelf_id?: int, accessory_id?: int, qty: number }]
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_transfer_id INT;
  v_item JSONB;
  v_qty DECIMAL;
  v_fabric_id INT;
  v_shelf_id INT;
  v_accessory_id INT;
  v_current_stock DECIMAL;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not create a duplicate transfer
  -- and double-decrement source stock.
  IF NOT idem_claim(p_idempotency_key, 'direct_send_transfer') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  -- 1. Create the transfer already in 'dispatched' state.
  INSERT INTO transfer_requests (
    brand, direction, item_type, status,
    requested_by, dispatched_by,
    notes,
    created_at, approved_at, dispatched_at
  )
  VALUES (
    p_brand, p_direction, p_item_type, 'dispatched',
    p_sender, p_sender,
    p_notes,
    NOW(), NOW(), NOW()
  )
  RETURNING id INTO v_transfer_id;

  -- 2. Stamp ledger context once for the whole batch of stock UPDATEs.
  PERFORM set_config('app.movement_type', 'transfer_out', true);
  PERFORM set_config('app.movement_ref_type', 'transfer', true);
  PERFORM set_config('app.movement_ref_id', v_transfer_id::text, true);
  PERFORM set_config('app.movement_user_id', p_sender::text, true);
  PERFORM set_config('app.movement_reason', 'direct send', true);
  PERFORM set_config('app.movement_notes', '', true);
  PERFORM set_config('app.movement_supplier_id', '', true);
  PERFORM set_config('app.movement_unit_cost', '', true);

  -- 3. Insert each item with requested = approved = dispatched, and decrement
  --    source-side stock. Validation mirrors dispatch_transfer.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::decimal;
    v_fabric_id := NULLIF((v_item->>'fabric_id'), '')::int;
    v_shelf_id := NULLIF((v_item->>'shelf_id'), '')::int;
    v_accessory_id := NULLIF((v_item->>'accessory_id'), '')::int;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be positive (got %)', v_qty;
    END IF;
    IF (v_fabric_id IS NULL)::int + (v_shelf_id IS NULL)::int + (v_accessory_id IS NULL)::int <> 2 THEN
      RAISE EXCEPTION 'Each item must reference exactly one of fabric_id, shelf_id, accessory_id';
    END IF;

    INSERT INTO transfer_request_items (
      transfer_request_id, fabric_id, shelf_id, accessory_id,
      requested_qty, approved_qty, dispatched_qty
    )
    VALUES (
      v_transfer_id, v_fabric_id, v_shelf_id, v_accessory_id,
      v_qty, v_qty, v_qty
    );

    IF p_direction = 'shop_to_workshop' THEN
      IF v_fabric_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_fabric_id;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for fabric %: have %, need %', v_fabric_id, v_current_stock, v_qty;
        END IF;
        UPDATE fabrics SET shop_stock = shop_stock - v_qty WHERE id = v_fabric_id;
      ELSIF v_shelf_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_shelf_id;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for shelf item %: have %, need %', v_shelf_id, v_current_stock, v_qty;
        END IF;
        UPDATE shelf SET shop_stock = shop_stock - v_qty::int WHERE id = v_shelf_id;
      ELSIF v_accessory_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_accessory_id;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for accessory %: have %, need %', v_accessory_id, v_current_stock, v_qty;
        END IF;
        UPDATE accessories SET shop_stock = shop_stock - v_qty WHERE id = v_accessory_id;
      END IF;
    ELSE
      IF v_fabric_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_fabric_id;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient workshop stock for fabric %: have %, need %', v_fabric_id, v_current_stock, v_qty;
        END IF;
        UPDATE fabrics SET workshop_stock = workshop_stock - v_qty WHERE id = v_fabric_id;
      ELSIF v_shelf_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_shelf_id;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient workshop stock for shelf item %: have %, need %', v_shelf_id, v_current_stock, v_qty;
        END IF;
        UPDATE shelf SET workshop_stock = workshop_stock - v_qty::int WHERE id = v_shelf_id;
      ELSIF v_accessory_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_accessory_id;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient workshop stock for accessory %: have %, need %', v_accessory_id, v_current_stock, v_qty;
        END IF;
        UPDATE accessories SET workshop_stock = workshop_stock - v_qty WHERE id = v_accessory_id;
      END IF;
    END IF;
  END LOOP;

  v_result := jsonb_build_object('success', true, 'transfer_id', v_transfer_id);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- BATCH TRANSFER RPCS
-- ============================================================================
-- A single transfer_request row carries one item_type. When the UI lets the
-- user mix fabrics, shelf items, and accessories in one cart, we fan out to
-- N requests (one per type). These batch RPCs do that fan-out inside a single
-- plpgsql function — i.e. one Postgres transaction — so the user either gets
-- all N transfers or none. No partial-success states.
--
-- p_groups shape: [{ item_type: 'fabric'|'shelf'|'accessory', items: [...] }]

DROP FUNCTION IF EXISTS create_transfer_requests_batch(uuid, brand, transfer_direction, text, jsonb);
CREATE OR REPLACE FUNCTION create_transfer_requests_batch(
  p_requested_by UUID,
  p_brand brand,
  p_direction transfer_direction,
  p_notes TEXT,
  p_groups JSONB,  -- [{ item_type, items: [{ fabric_id?, shelf_id?, accessory_id?, requested_qty }] }]
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_group JSONB;
  v_item JSONB;
  v_item_type transfer_item_type;
  v_transfer_id INT;
  v_qty DECIMAL;
  v_fabric_id INT;
  v_shelf_id INT;
  v_accessory_id INT;
  v_results JSONB := '[]'::jsonb;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not create duplicate requests.
  IF NOT idem_claim(p_idempotency_key, 'create_transfer_requests_batch') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  IF p_groups IS NULL OR jsonb_array_length(p_groups) = 0 THEN
    RAISE EXCEPTION 'No groups provided';
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_groups)
  LOOP
    v_item_type := (v_group->>'item_type')::transfer_item_type;

    IF v_group->'items' IS NULL OR jsonb_array_length(v_group->'items') = 0 THEN
      RAISE EXCEPTION 'Group for % has no items', v_item_type;
    END IF;

    INSERT INTO transfer_requests (
      brand, direction, item_type, status,
      requested_by, notes, created_at
    )
    VALUES (
      p_brand, p_direction, v_item_type, 'requested',
      p_requested_by, p_notes, NOW()
    )
    RETURNING id INTO v_transfer_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items')
    LOOP
      v_qty := (v_item->>'requested_qty')::decimal;
      v_fabric_id := NULLIF((v_item->>'fabric_id'), '')::int;
      v_shelf_id := NULLIF((v_item->>'shelf_id'), '')::int;
      v_accessory_id := NULLIF((v_item->>'accessory_id'), '')::int;

      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive (got %)', v_qty;
      END IF;
      IF (v_fabric_id IS NULL)::int + (v_shelf_id IS NULL)::int + (v_accessory_id IS NULL)::int <> 2 THEN
        RAISE EXCEPTION 'Each item must reference exactly one of fabric_id, shelf_id, accessory_id';
      END IF;

      INSERT INTO transfer_request_items (
        transfer_request_id, fabric_id, shelf_id, accessory_id, requested_qty
      )
      VALUES (
        v_transfer_id, v_fabric_id, v_shelf_id, v_accessory_id, v_qty
      );
    END LOOP;

    v_results := v_results || jsonb_build_object('transfer_id', v_transfer_id, 'item_type', v_item_type);
  END LOOP;

  v_result := jsonb_build_object('success', true, 'transfers', v_results);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;


DROP FUNCTION IF EXISTS direct_send_transfers_batch(uuid, brand, transfer_direction, text, jsonb);
CREATE OR REPLACE FUNCTION direct_send_transfers_batch(
  p_sender UUID,
  p_brand brand,
  p_direction transfer_direction,
  p_notes TEXT,
  p_groups JSONB,  -- [{ item_type, items: [{ fabric_id?, shelf_id?, accessory_id?, qty }] }]
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_group JSONB;
  v_item JSONB;
  v_item_type transfer_item_type;
  v_transfer_id INT;
  v_qty DECIMAL;
  v_fabric_id INT;
  v_shelf_id INT;
  v_accessory_id INT;
  v_current_stock DECIMAL;
  v_results JSONB := '[]'::jsonb;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not create duplicate transfers
  -- and double-decrement source stock.
  IF NOT idem_claim(p_idempotency_key, 'direct_send_transfers_batch') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  IF p_groups IS NULL OR jsonb_array_length(p_groups) = 0 THEN
    RAISE EXCEPTION 'No groups provided';
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_groups)
  LOOP
    v_item_type := (v_group->>'item_type')::transfer_item_type;

    IF v_group->'items' IS NULL OR jsonb_array_length(v_group->'items') = 0 THEN
      RAISE EXCEPTION 'Group for % has no items', v_item_type;
    END IF;

    -- 1. Create the transfer already in 'dispatched' state.
    INSERT INTO transfer_requests (
      brand, direction, item_type, status,
      requested_by, dispatched_by,
      notes,
      created_at, approved_at, dispatched_at
    )
    VALUES (
      p_brand, p_direction, v_item_type, 'dispatched',
      p_sender, p_sender,
      p_notes,
      NOW(), NOW(), NOW()
    )
    RETURNING id INTO v_transfer_id;

    -- 2. Stamp ledger context for this group's stock UPDATEs.
    PERFORM set_config('app.movement_type', 'transfer_out', true);
    PERFORM set_config('app.movement_ref_type', 'transfer', true);
    PERFORM set_config('app.movement_ref_id', v_transfer_id::text, true);
    PERFORM set_config('app.movement_user_id', p_sender::text, true);
    PERFORM set_config('app.movement_reason', 'direct send', true);
    PERFORM set_config('app.movement_notes', '', true);
    PERFORM set_config('app.movement_supplier_id', '', true);
    PERFORM set_config('app.movement_unit_cost', '', true);

    -- 3. Insert each item with requested = approved = dispatched, and decrement
    --    source-side stock. Validation mirrors dispatch_transfer.
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items')
    LOOP
      v_qty := (v_item->>'qty')::decimal;
      v_fabric_id := NULLIF((v_item->>'fabric_id'), '')::int;
      v_shelf_id := NULLIF((v_item->>'shelf_id'), '')::int;
      v_accessory_id := NULLIF((v_item->>'accessory_id'), '')::int;

      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive (got %)', v_qty;
      END IF;
      IF (v_fabric_id IS NULL)::int + (v_shelf_id IS NULL)::int + (v_accessory_id IS NULL)::int <> 2 THEN
        RAISE EXCEPTION 'Each item must reference exactly one of fabric_id, shelf_id, accessory_id';
      END IF;

      INSERT INTO transfer_request_items (
        transfer_request_id, fabric_id, shelf_id, accessory_id,
        requested_qty, approved_qty, dispatched_qty
      )
      VALUES (
        v_transfer_id, v_fabric_id, v_shelf_id, v_accessory_id,
        v_qty, v_qty, v_qty
      );

      IF p_direction = 'shop_to_workshop' THEN
        IF v_fabric_id IS NOT NULL THEN
          SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_fabric_id;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient shop stock for fabric %: have %, need %', v_fabric_id, v_current_stock, v_qty;
          END IF;
          UPDATE fabrics SET shop_stock = shop_stock - v_qty WHERE id = v_fabric_id;
        ELSIF v_shelf_id IS NOT NULL THEN
          SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_shelf_id;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient shop stock for shelf item %: have %, need %', v_shelf_id, v_current_stock, v_qty;
          END IF;
          UPDATE shelf SET shop_stock = shop_stock - v_qty::int WHERE id = v_shelf_id;
        ELSIF v_accessory_id IS NOT NULL THEN
          SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_accessory_id;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient shop stock for accessory %: have %, need %', v_accessory_id, v_current_stock, v_qty;
          END IF;
          UPDATE accessories SET shop_stock = shop_stock - v_qty WHERE id = v_accessory_id;
        END IF;
      ELSE
        IF v_fabric_id IS NOT NULL THEN
          SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_fabric_id;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient workshop stock for fabric %: have %, need %', v_fabric_id, v_current_stock, v_qty;
          END IF;
          UPDATE fabrics SET workshop_stock = workshop_stock - v_qty WHERE id = v_fabric_id;
        ELSIF v_shelf_id IS NOT NULL THEN
          SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_shelf_id;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient workshop stock for shelf item %: have %, need %', v_shelf_id, v_current_stock, v_qty;
          END IF;
          UPDATE shelf SET workshop_stock = workshop_stock - v_qty::int WHERE id = v_shelf_id;
        ELSIF v_accessory_id IS NOT NULL THEN
          SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_accessory_id;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient workshop stock for accessory %: have %, need %', v_accessory_id, v_current_stock, v_qty;
          END IF;
          UPDATE accessories SET workshop_stock = workshop_stock - v_qty WHERE id = v_accessory_id;
        END IF;
      END IF;
    END LOOP;

    v_results := v_results || jsonb_build_object('transfer_id', v_transfer_id, 'item_type', v_item_type);
  END LOOP;

  v_result := jsonb_build_object('success', true, 'transfers', v_results);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
