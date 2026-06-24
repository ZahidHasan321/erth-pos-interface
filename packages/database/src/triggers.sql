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
    -- duplicate_object: cast already exists. undefined_object: the enum was
    -- retired (e.g. accessory_category -> text in 0011) so no cast is needed.
    EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

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
  v_current NUMERIC;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not double-decrement stock or
  -- re-bump the invoice. Returns the recorded original result on replay.
  -- (The on-hand guards below run only on first execution; a replay short-
  -- circuits here and never re-evaluates them.)
  IF NOT idem_claim(p_idempotency_key, 'complete_work_order') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  -- Already-confirmed guard: idempotency only dedups a lost-response replay of
  -- the SAME submission. A fresh submit (new key) of an already-confirmed order
  -- would re-run the decrement loops and double-deduct stock. Return the current
  -- order/work-order rows in the normal RETURN shape so the caller sees an
  -- idempotent success, without decrementing again.
  SELECT * INTO v_order_row FROM orders WHERE id = p_order_id;
  IF FOUND AND v_order_row.checkout_status = 'confirmed' THEN
    SELECT * INTO v_work_order_row FROM work_orders WHERE order_id = p_order_id;
    v_result := to_jsonb(v_order_row) || COALESCE(to_jsonb(v_work_order_row), '{}'::jsonb);
    PERFORM idem_store(p_idempotency_key, v_result);
    RETURN v_result;
  END IF;

  -- 1. Get or Generate Invoice Number
  SELECT invoice_number INTO v_inv FROM work_orders WHERE order_id = p_order_id;
  IF v_inv IS NULL THEN
     v_inv := nextval('invoice_seq');
  END IF;

  v_paid := (p_checkout_details->>'paid')::decimal;

  -- 2. Update Core Order
  -- `paid` is owned by sync_order_paid_from_transactions (the trigger that sums
  -- payment_transactions). We set it to 0 here as the baseline; if v_paid > 0
  -- the INSERT below fires the trigger and corrects it to the summed value.
  -- For v_paid = 0/NULL no INSERT fires and paid stays 0 — same end state,
  -- without writing the user-supplied value directly to the column.
  UPDATE orders
  SET
    checkout_status = 'confirmed',
    order_type = 'WORK',
    payment_type = (p_checkout_details->>'paymentType')::payment_type,
    paid = 0,
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

  -- 3b. §3 cashier-processing gate. A WORK order must be cashier-processed
  --     before it can be dispatched to the workshop. Inline-payment brands have
  --     no cashier step, so they are "processed" right here at confirmation;
  --     only the deferred cashier brand (ERTH) leaves the marker NULL so the
  --     cashier must process it. The app passes `deferToCashier` from its brand
  --     source of truth (brandUsesCashier) — the DB stays brand-agnostic. The
  --     advance is persisted above for ALL brands (informational; drives the
  --     cashier Advance preset; it is NOT a payment — `paid` is the `paid` field).
  IF NOT COALESCE((p_checkout_details->>'deferToCashier')::boolean, false) THEN
    UPDATE work_orders SET cashier_processed_at = now()
    WHERE order_id = p_order_id AND cashier_processed_at IS NULL;
  END IF;

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
    -- Lock + guard before the decrement so the confirm can't drive shop_stock
    -- negative (mirrors consume_for_order).
    SELECT shop_stock INTO v_current FROM shelf WHERE id = (v_item->>'id')::int FOR UPDATE;
    IF v_current IS NULL THEN
      RAISE EXCEPTION 'complete_work_order: shelf item #% not found', v_item->>'id';
    END IF;
    IF v_current < (v_item->>'quantity')::int THEN
      RAISE EXCEPTION 'complete_work_order: cannot consume % of shelf item #% — only % in shop stock',
        (v_item->>'quantity')::int, v_item->>'id', v_current;
    END IF;

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
  -- Customer-brought fabric never reaches p_fabric_items (the app filters
  -- fabric_source='IN' before calling), so it's excluded from decrement and guard.
  PERFORM set_config('app.movement_reason', 'work order checkout (fabric)', true);
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_fabric_items)
  LOOP
    SELECT shop_stock INTO v_current FROM fabrics WHERE id = (v_item->>'id')::int FOR UPDATE;
    IF v_current IS NULL THEN
      RAISE EXCEPTION 'complete_work_order: fabric #% not found', v_item->>'id';
    END IF;
    IF v_current < (v_item->>'length')::decimal THEN
      RAISE EXCEPTION 'complete_work_order: cannot consume % of fabric #% — only % in shop stock',
        (v_item->>'length')::decimal, v_item->>'id', v_current;
    END IF;

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
  v_current NUMERIC;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not double-decrement shelf stock.
  -- (The on-hand guard below runs only on first execution; a replay short-
  -- circuits here.)
  IF NOT idem_claim(p_idempotency_key, 'complete_sales_order') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  -- Already-confirmed guard (see complete_work_order): a fresh submit of an
  -- already-confirmed order would re-run the shelf decrement loop and
  -- double-deduct. Return the current order row in the normal shape instead.
  SELECT * INTO v_order_row FROM orders WHERE id = p_order_id;
  IF FOUND AND v_order_row.checkout_status = 'confirmed' THEN
    v_result := to_jsonb(v_order_row);
    PERFORM idem_store(p_idempotency_key, v_result);
    RETURN v_result;
  END IF;

  v_paid := (p_checkout_details->>'paid')::decimal;

  -- 1. Update Order
  -- See note in complete_work_order: paid is owned by the summing trigger;
  -- baseline 0 here, the INSERT below corrects it via trigger when v_paid > 0.
  UPDATE orders
  SET
    checkout_status = 'confirmed',
    payment_type = (p_checkout_details->>'paymentType')::payment_type,
    paid = 0,
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
    -- Lock + guard before the decrement so the confirm can't drive shop_stock
    -- negative (mirrors consume_for_order).
    SELECT shop_stock INTO v_current FROM shelf WHERE id = (v_item->>'id')::int FOR UPDATE;
    IF v_current IS NULL THEN
      RAISE EXCEPTION 'complete_sales_order: shelf item #% not found', v_item->>'id';
    END IF;
    IF v_current < (v_item->>'quantity')::int THEN
      RAISE EXCEPTION 'complete_sales_order: cannot consume % of shelf item #% — only % in shop stock',
        (v_item->>'quantity')::int, v_item->>'id', v_current;
    END IF;

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
  v_current NUMERIC;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not create a second order +
  -- payment and double-decrement shelf stock. Returns the original order row.
  -- (The on-hand guard below runs only on first execution; a replay short-
  -- circuits here.)
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
    -- See complete_work_order: paid is owned by the summing trigger. Insert 0
    -- here; the INSERT into payment_transactions below corrects via trigger.
    0,
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
    -- Lock + guard before the decrement so the confirm can't drive shop_stock
    -- negative (mirrors consume_for_order).
    SELECT shop_stock INTO v_current FROM shelf WHERE id = (v_item->>'id')::int FOR UPDATE;
    IF v_current IS NULL THEN
      RAISE EXCEPTION 'create_complete_sales_order: shelf item #% not found', v_item->>'id';
    END IF;
    IF v_current < (v_item->>'quantity')::int THEN
      RAISE EXCEPTION 'create_complete_sales_order: cannot consume % of shelf item #% — only % in shop stock',
        (v_item->>'quantity')::int, v_item->>'id', v_current;
    END IF;

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
      collar_type, collar_button, collar_thickness, cuffs_type, cuffs_thickness,
      front_pocket_type, front_pocket_thickness,
      wallet_pocket, pen_holder, mobile_pocket, small_tabaggi,
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
      v_garment->>'collar_thickness',
      v_garment->>'cuffs_type',
      v_garment->>'cuffs_thickness',
      v_garment->>'front_pocket_type',
      v_garment->>'front_pocket_thickness',
      COALESCE((v_garment->>'wallet_pocket')::BOOLEAN, false),
      COALESCE((v_garment->>'pen_holder')::BOOLEAN, false),
      COALESCE((v_garment->>'mobile_pocket')::BOOLEAN, false),
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
      collar_thickness         = EXCLUDED.collar_thickness,
      cuffs_type               = EXCLUDED.cuffs_type,
      cuffs_thickness          = EXCLUDED.cuffs_thickness,
      front_pocket_type        = EXCLUDED.front_pocket_type,
      front_pocket_thickness   = EXCLUDED.front_pocket_thickness,
      wallet_pocket            = EXCLUDED.wallet_pocket,
      pen_holder               = EXCLUDED.pen_holder,
      mobile_pocket            = EXCLUDED.mobile_pocket,
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
  v_refund_qty_capped INT;
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

  -- Invoice revision = price changes only (SPEC §3). A refund changes what the
  -- customer owes/has paid → mint a new revision. Plain payments (advance /
  -- installment / full) do NOT bump: paying does not change the invoice, so
  -- revision 0 stays the original invoice the customer signed.
  IF p_transaction_type = 'refund' THEN
    UPDATE work_orders
    SET invoice_revision = COALESCE(invoice_revision, 0) + 1
    WHERE order_id = p_order_id;
  END IF;

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

  -- §3 cashier-processing gate: the first payment on a WORK order also clears
  -- "pending cashier processing", so an order paid via the per-order detail
  -- page (not just the bulk page) is never stranded as pending. Set once
  -- (WHERE cashier_processed_at IS NULL keeps the original processor/timestamp
  -- and stays idempotent); no-op for SALES (no work_orders row) and for refunds.
  IF p_transaction_type = 'payment' THEN
    UPDATE work_orders
    SET cashier_processed_at = now(),
        cashier_processed_by = p_cashier_id
    WHERE order_id = p_order_id
      AND cashier_processed_at IS NULL;
  END IF;

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
        piece_stage = 'completed',
        collected_at = now()
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
        SELECT id, fabric_id, fabric_length, fabric_source, garment_type INTO v_garment_for_discard
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
             AND v_garment_for_discard.fabric_source = 'IN'
             AND COALESCE(v_garment_for_discard.fabric_length, 0) > 0 THEN
            PERFORM set_config('app.movement_type', 'return', true);
            PERFORM set_config('app.movement_ref_type', 'order', true);
            PERFORM set_config('app.movement_ref_id', p_order_id::text, true);
            PERFORM set_config('app.movement_user_id', COALESCE(p_cashier_id::text, ''), true);
            -- Reset restock-only context so this return row can't piggyback a
            -- stale supplier_id/unit_cost/image_url from an earlier movement in
            -- the same transaction (mirrors the shelf-refund block below).
            PERFORM set_config('app.movement_supplier_id', '', true);
            PERFORM set_config('app.movement_unit_cost', '', true);
            PERFORM set_config('app.movement_image_url', '', true);
            PERFORM set_config('app.movement_reason', 'garment cancelled, fabric returned', true);
            PERFORM set_config('app.movement_notes', COALESCE(p_refund_reason, ''), true);

            UPDATE fabrics
            SET real_stock = COALESCE(real_stock, 0) + v_garment_for_discard.fabric_length,
                shop_stock = COALESCE(shop_stock, 0) + v_garment_for_discard.fabric_length
            WHERE id = v_garment_for_discard.fabric_id;
          END IF;

          -- Orphaned-finals release (CLAUDE.md §2.6 "Orphaned-finals rule"). If
          -- the just-discarded garment is a BROVA and the order now has NO
          -- non-discarded brova left, the parked finals can never be released by
          -- a brova acceptance — free them (waiting_for_acceptance → waiting_cut)
          -- so they are not permanently orphaned. Distinct from the accepted
          -- "all brovas rejected but one still exists to act on → park
          -- indefinitely" case (there a brova remains). Never auto-creates a
          -- replacement — that is the workshop's manual Reject-Redo action only.
          IF v_garment_for_discard.garment_type = 'brova'
             AND NOT EXISTS (
               SELECT 1 FROM garments
               WHERE order_id = p_order_id
                 AND garment_type = 'brova'
                 AND piece_stage <> 'discarded'
             ) THEN
            UPDATE garments
            SET piece_stage = 'waiting_cut'
            WHERE order_id = p_order_id
              AND garment_type = 'final'
              AND piece_stage = 'waiting_for_acceptance';
          END IF;
        END IF;
      ELSIF v_refund_item ? 'shelf_item_id' THEN
        v_shelf_item_id := (v_refund_item->>'shelf_item_id')::int;
        v_refund_qty := COALESCE((v_refund_item->>'quantity')::int, 0);

        -- Cap the refund qty to what is actually unrefunded (ordered − already
        -- refunded). The flag below caps the cumulative total at quantity; the
        -- restock must use the SAME capped delta or it would re-stock units that
        -- never left inventory when a caller passes more than the remainder.
        SELECT LEAST(v_refund_qty, GREATEST(COALESCE(quantity, 0) - COALESCE(refunded_qty, 0), 0))
        INTO v_refund_qty_capped
        FROM order_shelf_items
        WHERE id = v_shelf_item_id
          AND order_id = p_order_id;
        v_refund_qty_capped := COALESCE(v_refund_qty_capped, 0);

        UPDATE order_shelf_items
        SET refunded_qty = LEAST(COALESCE(refunded_qty, 0) + v_refund_qty, COALESCE(quantity, 0))
        WHERE id = v_shelf_item_id
          AND order_id = p_order_id;

        -- Restore shelf stock only when restock=true (default true for backward compat).
        -- Set restock=false for damaged/consumed returns that shouldn't re-enter inventory.
        IF v_refund_qty_capped > 0 AND COALESCE((v_refund_item->>'restock')::boolean, true) THEN
          -- Stamp ledger context. Required: prior loop iterations (e.g. fabric
          -- restock) may have set 'return'/'garment cancelled' — must overwrite
          -- so the shelf row is logged as its own return, not piggybacked.
          PERFORM set_config('app.movement_type', 'return', true);
          PERFORM set_config('app.movement_ref_type', 'order', true);
          PERFORM set_config('app.movement_ref_id', p_order_id::text, true);
          PERFORM set_config('app.movement_user_id', COALESCE(p_cashier_id::text, ''), true);
          PERFORM set_config('app.movement_supplier_id', '', true);
          PERFORM set_config('app.movement_unit_cost', '', true);
          PERFORM set_config('app.movement_image_url', '', true);
          PERFORM set_config('app.movement_reason', 'shelf item refunded', true);
          PERFORM set_config('app.movement_notes', COALESCE(p_refund_reason, ''), true);

          UPDATE shelf
          SET stock = stock + v_refund_qty_capped,
              shop_stock = shop_stock + v_refund_qty_capped
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

-- 9b. RPC: Cashier "confirm without payment" for one or more WORK orders (§3).
-- Clears the cashier-processing gate WITHOUT recording any money, so it needs
-- no open register. Idempotent on its key; the per-order UPDATE is also
-- naturally idempotent (only fills a NULL marker, preserving the original
-- processor). Only confirmed WORK orders that are still pending are touched;
-- anything else is reported as skipped so the caller can surface partial results.
CREATE OR REPLACE FUNCTION cashier_confirm_orders_no_payment(
  p_order_ids INT[],
  p_cashier_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_my_user_id UUID;
  v_processed INT[] := ARRAY[]::INT[];
  v_skipped INT[] := ARRAY[]::INT[];
  v_order_id INT;
  v_updated INT;
  v_result JSONB;
BEGIN
  PERFORM assert_active_user();

  -- Attribution guard mirrors record_payment_transaction: non-managers may only
  -- process under their own id; managers/admins may act on behalf of staff.
  v_my_user_id := get_my_user_id();
  IF p_cashier_id IS NOT NULL
     AND p_cashier_id <> v_my_user_id
     AND NOT is_manager_or_above() THEN
    RAISE EXCEPTION 'Cashier mismatch: cannot process orders under another user';
  END IF;
  IF p_cashier_id IS NULL THEN
    p_cashier_id := v_my_user_id;
  END IF;

  -- Idempotency: a replay returns the original summary without re-touching rows.
  IF NOT idem_claim(p_idempotency_key, 'cashier_confirm_orders_no_payment') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'cashier_confirm_orders_no_payment: no order ids provided';
  END IF;

  FOREACH v_order_id IN ARRAY p_order_ids
  LOOP
    UPDATE work_orders w
    SET cashier_processed_at = now(),
        cashier_processed_by = p_cashier_id
    FROM orders o
    WHERE w.order_id = v_order_id
      AND o.id = w.order_id
      AND o.order_type = 'WORK'
      AND o.checkout_status = 'confirmed'
      AND w.cashier_processed_at IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      v_processed := array_append(v_processed, v_order_id);
    ELSE
      v_skipped := array_append(v_skipped, v_order_id);
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'processed', to_jsonb(v_processed),
    'skipped', to_jsonb(v_skipped),
    'processed_count', COALESCE(array_length(v_processed, 1), 0)
  );
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 9c. RPC: Atomic bulk cashier payment across several WORK orders (§3).
-- All-or-nothing: the whole batch runs in this single transaction, so any one
-- rejection (over-amount, closed register, bad order) aborts EVERY payment —
-- no order is partially or silently collected ("no cash leak"). Each order's
-- money flows through record_payment_transaction (→ orders.paid trigger,
-- open-register requirement, per-session attribution); the first payment also
-- clears that order's cashier-processing gate there. Idempotent on the batch
-- key AND on a per-order derived key, so a retried batch never double-charges.
--   p_payments: [{ orderId, amount, paymentType, paymentRefNo?, paymentNote? }]
CREATE OR REPLACE FUNCTION record_bulk_payment(
  p_payments JSONB,
  p_cashier_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_my_user_id UUID;
  v_item JSONB;
  v_order_id INT;
  v_amount DECIMAL;
  v_derived_key UUID;
  v_one JSONB;
  v_results JSONB := '[]'::jsonb;
  v_total DECIMAL := 0;
  v_count INT := 0;
  v_result JSONB;
BEGIN
  PERFORM assert_active_user();

  v_my_user_id := get_my_user_id();
  IF p_cashier_id IS NOT NULL
     AND p_cashier_id <> v_my_user_id
     AND NOT is_manager_or_above() THEN
    RAISE EXCEPTION 'Cashier mismatch: cannot record payments under another user';
  END IF;
  IF p_cashier_id IS NULL THEN
    p_cashier_id := v_my_user_id;
  END IF;

  -- Whole-batch idempotency: a replayed batch returns the original summary and
  -- never re-enters the loop (so the inner per-order calls don't re-run either).
  IF NOT idem_claim(p_idempotency_key, 'record_bulk_payment') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'record_bulk_payment: no payments provided';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    v_order_id := (v_item->>'orderId')::int;
    v_amount := (v_item->>'amount')::decimal;

    IF v_order_id IS NULL THEN
      RAISE EXCEPTION 'record_bulk_payment: missing orderId in a payment item';
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'record_bulk_payment: amount for order % must be greater than 0', v_order_id;
    END IF;

    -- Derive a stable per-order key from the batch key so a retried batch
    -- dedupes at the transaction-row level too (belt-and-suspenders with the
    -- batch claim above). md5 → 32 hex digits casts cleanly to uuid.
    v_derived_key := CASE
      WHEN p_idempotency_key IS NULL THEN NULL
      ELSE md5(p_idempotency_key::text || ':' || v_order_id::text)::uuid
    END;

    -- Reuse the single-payment RPC: register check, amount validation, the
    -- payment_transactions insert (→ orders.paid trigger), and the
    -- cashier-processed marker all happen there. A raise propagates and aborts
    -- the whole bulk transaction.
    v_one := record_payment_transaction(
      p_order_id => v_order_id,
      p_amount => v_amount,
      p_payment_type => COALESCE(v_item->>'paymentType', 'cash'),
      p_payment_ref_no => v_item->>'paymentRefNo',
      p_payment_note => v_item->>'paymentNote',
      p_cashier_id => p_cashier_id,
      p_transaction_type => 'payment',
      p_idempotency_key => v_derived_key
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'order_id', v_order_id,
      'amount', v_amount,
      'order_paid', v_one->'order_paid'
    ));
    v_total := v_total + v_amount;
    v_count := v_count + 1;
  END LOOP;

  v_result := jsonb_build_object(
    'results', v_results,
    'total_charged', v_total,
    'count', v_count
  );
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 9d. RPC: Pending WORK orders awaiting cashier processing (§3 Pending queue).
-- Confirmed WORK orders for the brand whose cashier-processing gate is still
-- open (work_orders.cashier_processed_at IS NULL). Returns just what the
-- pending list + bulk-payment page need, newest first.
CREATE OR REPLACE FUNCTION get_cashier_pending_orders(
  p_brand TEXT,
  p_limit INT DEFAULT 200
)
RETURNS JSONB AS $$
DECLARE
  v_rows JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      o.id AS order_id,
      w.invoice_number,
      c.name AS customer_name,
      c.phone AS customer_phone,
      o.order_date,
      w.delivery_date,
      COALESCE(o.order_total, 0) AS order_total,
      COALESCE(o.paid, 0) AS paid,
      COALESCE(w.advance, 0) AS advance,
      -- §2.13 order linking: the group this order belongs to (NULL = unlinked
      -- or itself the primary). The cashier clusters + badges on this.
      w.linked_order_id,
      -- §5 customer account: relation lets the cashier see family ties between
      -- co-pending orders (e.g. a Secondary "son of <Primary>").
      c.account_type,
      c.relation,
      c.primary_customer_id,
      pc.name AS primary_customer_name,
      (SELECT COUNT(*) FROM garments g WHERE g.order_id = o.id) AS garment_count
    FROM orders o
    JOIN work_orders w ON w.order_id = o.id
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN customers pc ON pc.id = c.primary_customer_id
    WHERE o.order_type = 'WORK'
      AND o.checkout_status = 'confirmed'
      AND w.cashier_processed_at IS NULL
      AND (p_brand IS NULL OR lower(o.brand::text) = lower(p_brand))
    ORDER BY o.order_date DESC
    LIMIT p_limit
  ) t;
  RETURN v_rows;
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
  v_old_home_delivery BOOLEAN;
BEGIN
  -- Validate order exists
  SELECT order_total, delivery_charge, discount_value, paid INTO v_order
  FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  SELECT home_delivery INTO v_old_home_delivery FROM work_orders WHERE order_id = p_order_id;

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

  -- Update work_orders flag
  UPDATE work_orders
  SET home_delivery = p_home_delivery
  WHERE order_id = p_order_id;

  -- Update all garments on this order
  UPDATE garments
  SET home_delivery = p_home_delivery
  WHERE order_id = p_order_id;

  -- Invoice revision = signed-invoice content change (SPEC §3). Switching the
  -- delivery type rewrites the invoice's delivery line → mint a revision, but
  -- only when it ACTUALLY changed. This DISTINCT guard is also the idempotency
  -- mechanism: a re-toggle to the value already set is a no-op (no re-bump, and
  -- the absolute charge swap nets to zero), so no separate idempotency key is
  -- needed. (A standalone delivery-charge edit via update_delivery_charge does
  -- not bump — only a type change re-issues the invoice.)
  IF p_home_delivery IS DISTINCT FROM v_old_home_delivery THEN
    UPDATE work_orders
    SET invoice_revision = COALESCE(invoice_revision, 0) + 1
    WHERE order_id = p_order_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'home_delivery', p_home_delivery,
    'delivery_charge', v_new_delivery,
    'order_total', v_new_total
  );
END;
$$ LANGUAGE plpgsql;

-- ── Bump invoice revision (style change with no price move) ───────────────────
-- SPEC §3: a brova-trial style change re-issues the signed invoice even when the
-- price/total does not move (a flat qallabi/designer swap, or any net-zero style
-- edit — "revised invoice but no delta in price"). The reprice path (§2.5) only
-- bumps when order_total moves, so the feedback flow calls THIS when it wrote a
-- style-spec change that the reprice found no price delta for. Idempotent;
-- no-ops for SALES / ALTERATION (no work_orders row → nothing updated).
CREATE OR REPLACE FUNCTION bump_invoice_revision(
  p_order_id INT,
  p_reason TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_revision INT;
  v_result JSONB;
BEGIN
  -- The bump is additive → must short-circuit a lost-response replay.
  IF NOT idem_claim(p_idempotency_key, 'bump_invoice_revision') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  UPDATE work_orders
  SET invoice_revision = COALESCE(invoice_revision, 0) + 1
  WHERE order_id = p_order_id
  RETURNING invoice_revision INTO v_revision;

  v_result := jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'invoice_revision', COALESCE(v_revision, 0),
    'reason', p_reason
  );

  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
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
      piece_stage = 'completed',
      collected_at = now()
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

  -- §3 cashier-processing gate: a WORK order cannot be dispatched to the
  -- workshop until a cashier has processed it (confirm-without-payment or a
  -- payment), which sets work_orders.cashier_processed_at. SALES/ALTERATION are
  -- not gated. The marker is set once and never cleared, so later trips
  -- (returns/alterations) of an already-processed order pass freely.
  IF v_order_type = 'WORK'
     AND NOT EXISTS (
       SELECT 1 FROM work_orders
       WHERE order_id = p_order_id AND cashier_processed_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'WORK order % cannot be dispatched: the cashier has not processed it yet (confirm-without-payment or take a payment first).', p_order_id;
  END IF;

  -- 1. Flip first-time garments (trip_number = 0) to transit. The gate keeps
  --    returning garments (trip >= 1) untouched — those go through
  --    dispatchGarmentToWorkshop, which bumps trip and clears stale state.
  WITH moved AS (
    UPDATE garments
       SET location = 'transit_to_workshop', trip_number = 1
     WHERE order_id = p_order_id
       AND trip_number = 0
       -- A redo replacement still WAITING IN DISPATCH (on the customer's cloth or a
       -- restock, §2.5) is not dispatchable until the shop resume clears the mark.
       AND redo_parked_reason IS NULL
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

-- 11e-2. RPC: Shop re-dispatches a RETURNING garment back to the workshop.
-- The return-trip sibling of dispatch_garments_to_shop, for a garment that came
-- back to the shop and must go out again (a Reject-Repair brova, an
-- Accept-with-Fix fix, an alteration trip). Promoted from the app's
-- dispatchGarmentToWorkshop (apps/pos-interface/src/api/garments.ts:69), whose
-- garment UPDATE and dispatch_log append were two separate round-trips with a
-- best-effort try/catch on the log: a dropped log insert silently lost the
-- audit row (the dispatch never showed in History), and a retry double-bumped
-- the trip and wrote a duplicate log row. This makes both atomic and idempotent
-- - the location = 'shop' gate means a re-run flips/logs nothing (a garment
-- already in transit is no longer at the shop).
CREATE OR REPLACE FUNCTION dispatch_garment_to_workshop(p_garment_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_trip INT;
BEGIN
  IF p_garment_id IS NULL THEN
    RAISE EXCEPTION 'dispatch_garment_to_workshop: no garment id provided';
  END IF;

  WITH moved AS (
    UPDATE garments
       SET location = 'transit_to_workshop',
           piece_stage = 'waiting_cut',
           in_production = false,
           trip_number = COALESCE(trip_number, 0) + 1,
           production_plan = NULL,
           completion_time = NULL,
           start_time = NULL
     WHERE id = p_garment_id
       AND location = 'shop'
    RETURNING id, order_id, trip_number
  ), logged AS (
    INSERT INTO dispatch_log (garment_id, order_id, direction, trip_number)
    SELECT id, order_id, 'to_workshop', trip_number FROM moved
    RETURNING trip_number
  )
  SELECT trip_number INTO v_trip FROM logged;

  RETURN jsonb_build_object(
    'dispatched', v_trip IS NOT NULL,
    'trip_number', v_trip
  );
END;
$$ LANGUAGE plpgsql;

-- 11f-types. GROUP A enum types + columns — created HERE (ahead of
-- create_replacement_garment below, and ahead of the report RPCs later) because
-- this single-batch apply validates a function's parameter types at CREATE time
-- and SQL-language report functions (get_waste_by_root_cause, …) reference these
-- columns at CREATE time too. CREATE TYPE / ADD COLUMN are idempotent.
-- (The canonical root_cause enum + responsible-party helper live in the §2.9
-- block later; re-stating CREATE TYPE root_cause here is a harmless no-op.)
DO $$ BEGIN
  CREATE TYPE root_cause AS ENUM (
    'production_error', 'qc_escape', 'showroom_error',
    'customer_change', 'material_defect', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE redo_priority AS ENUM ('immediate', 'next_slot', 'parked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE redo_parked_reason AS ENUM (
    'waiting_material', 'customer_decision', 'approval', 'clarification'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- root_cause set on the DISCARDED ORIGINAL (the attributed scrap). The redo
-- priority/park fields live on the REPLACEMENT row.
ALTER TABLE garments ADD COLUMN IF NOT EXISTS root_cause root_cause;
ALTER TABLE garments ADD COLUMN IF NOT EXISTS redo_priority redo_priority;
ALTER TABLE garments ADD COLUMN IF NOT EXISTS redo_parked_reason redo_parked_reason;
ALTER TABLE garments ADD COLUMN IF NOT EXISTS redo_customer_must_provide_fabric BOOLEAN NOT NULL DEFAULT false;
-- redo_priority is retained but UNUSED/vestigial (§6): redo is shop-initiated, the
-- workshop redo-priority queue was dropped. redo_parked_reason now marks a
-- replacement WAITING IN SHOP DISPATCH (customer cloth / restock), not a workshop
-- scheduler park. promoted_to_brova_at stamps a final promoted to brova by the
-- §2.5 outcome-3 redo (audit: this brova row was originally a final).
ALTER TABLE garments ADD COLUMN IF NOT EXISTS promoted_to_brova_at TIMESTAMPTZ;

-- Net-zero redo-scrap waste annotation: qty_delta=0 keeps the ledger conserving
-- while annotated_qty carries the scrapped length; root_cause attributes it.
-- Reports read SUM(ABS(qty_delta) + COALESCE(annotated_qty,0)) so the two never
-- double-count (real wastes have annotated_qty NULL; annotations have qty_delta 0).
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS annotated_qty NUMERIC(10,2);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS root_cause root_cause;

-- ─── Group C: repeated-returns investigation — REMOVED, kept vestigial (CLAUDE.md §2.10) ───
-- The auto-hold was removed (see the Group C DROPs further below): needs_investigation
-- is never set true and has no writer; garment_investigations has no writer. Both the
-- column and the table are retained vestigial — no destructive drop (matches the
-- redo_priority precedent). Investigation/root-cause handling is being redesigned
-- elsewhere. Kept here so a fresh DB still has the (unused) column/table.
ALTER TABLE garments ADD COLUMN IF NOT EXISTS needs_investigation BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS garment_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  garment_id UUID NOT NULL REFERENCES garments(id),
  order_id INTEGER,
  root_cause root_cause,
  decision TEXT NOT NULL,                 -- continue | redo | refund
  history_note TEXT,
  corrective_short TEXT,
  corrective_long TEXT,
  quality_returns INTEGER,
  alteration_returns INTEGER,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS garment_investigations_garment_idx ON garment_investigations(garment_id);
-- RLS policy is created below, after is_active_user() is defined.

-- 11f. RPC: Create a replacement garment after a Reject-Redo.
-- Promoted from apps/workshop/src/api/garments.ts createGarmentForOrder (:1817)
-- replacement path (+ nextGarmentIdForOrder :1801). Clones the original's
-- spec columns server-side (one read of truth), starts fresh at
-- trip 1 / waiting_cut / workshop, and links original.replaced_by_garment_id
-- (double-replacement guard preserved).
-- GROUP A (SPEC.md §2.5/§4): the SHOP creates the redo replacement at the brova
-- trial and, in the SAME call, (a) attributes the scrap on the discarded original
-- via root_cause, (b) auto-consumes fresh fabric for the replacement cut, and
-- (c) records the scrapped fabric as a net-zero material-waste annotation. The
-- replacement is created AT THE SHOP (location='shop', trip 0, waiting_cut) so it
-- lands in the shop dispatch queue and then flows through the normal dispatch →
-- production → trial path like any fresh garment. The replacement's fabric source
-- is a redo-time choice (default = the original's): IN consumes our stock, OUT is
-- customer-brought (no consume). If the IN material is short OR it's OUT cloth, the
-- replacement WAITS IN DISPATCH (redo_parked_reason set) until the shop resume step
-- clears it — the scrap annotation is still written eagerly (the scrap is a fact at
-- discard; only the replacement cut waits). The scrap annotation keys on the
-- ORIGINAL's source (company IN only); consume/park key on the REPLACEMENT's source.
-- New signature → drop the old overloads so the function resolves.
DROP FUNCTION IF EXISTS create_replacement_garment(uuid);
DROP FUNCTION IF EXISTS create_replacement_garment(uuid, root_cause, redo_priority, uuid, uuid);
CREATE OR REPLACE FUNCTION create_replacement_garment(
  p_replaces_garment_id UUID,
  p_root_cause root_cause DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_fabric_source TEXT DEFAULT NULL,   -- 'IN' | 'OUT' for the REPLACEMENT; NULL → inherit original
  p_fabric_id INT DEFAULT NULL          -- catalogue fabric to consume when source IN and original had none
)
RETURNS JSONB AS $$
DECLARE
  v_orig garments%ROWTYPE;
  v_next INT;
  v_new_garment_id TEXT;
  v_new_id UUID;
  v_required NUMERIC;
  v_orig_must_provide BOOLEAN;      -- original used customer (OUT) cloth → no scrap annotation
  v_repl_source TEXT;               -- 'IN' | 'OUT' for the replacement
  v_repl_must_provide BOOLEAN;      -- replacement uses customer (OUT) cloth → no consume, waits customer_decision
  v_repl_fabric_id INT;             -- catalogue fabric the replacement consumes (NULL for OUT)
  v_parked BOOLEAN := false;        -- IN replacement short on stock → waits on a restock
  v_shop_stock NUMERIC;
  v_repl_unit_cost NUMERIC;         -- price of the replacement's consumed fabric
  v_orig_unit_cost NUMERIC;         -- price of the original's scrapped fabric
  v_parked_reason redo_parked_reason;
  v_parked_text TEXT;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not create a second replacement,
  -- double-consume fabric, or write a second scrap annotation.
  IF NOT idem_claim(p_idempotency_key, 'create_replacement_garment') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  -- Lock the original so the double-replacement guard and the
  -- replaced_by_garment_id link are race-free.
  SELECT * INTO v_orig FROM garments WHERE id = p_replaces_garment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_replacement_garment: original garment % not found', p_replaces_garment_id;
  END IF;
  IF v_orig.replaced_by_garment_id IS NOT NULL THEN
    RAISE EXCEPTION 'create_replacement_garment: original garment % already has a replacement', p_replaces_garment_id;
  END IF;

  -- Attribute the scrap on the discarded original (the responsible party is
  -- derived from root_cause, never stored separately — see §2.9).
  UPDATE garments SET root_cause = p_root_cause WHERE id = p_replaces_garment_id;

  v_required := COALESCE(v_orig.fabric_length, 0);
  v_orig_must_provide := (v_orig.fabric_source = 'OUT');

  -- Replacement fabric source: default to the original's, overridable at redo time.
  v_repl_source := UPPER(COALESCE(NULLIF(p_fabric_source, ''), v_orig.fabric_source::text, 'IN'));
  v_repl_must_provide := (v_repl_source = 'OUT');
  -- Catalogue fabric the replacement consumes: an explicit pick wins (the
  -- customer-cloth→our-stock cross case), else the original's fabric (common
  -- same-source IN case). NULL for an OUT (customer-brought) replacement.
  v_repl_fabric_id := CASE WHEN v_repl_must_provide THEN NULL
                          ELSE COALESCE(p_fabric_id, v_orig.fabric_id) END;

  -- Material availability for a company (IN) replacement. Short stock → WAIT
  -- (waiting_material): do not raise, do not decrement; the cut is deferred to
  -- the shop resume step. Customer (OUT) replacements never touch our stock.
  IF NOT v_repl_must_provide AND v_required > 0 THEN
    IF v_repl_fabric_id IS NULL THEN
      RAISE EXCEPTION 'create_replacement_garment: replacement uses our stock but no fabric specified (original % has no catalogue fabric — pass p_fabric_id)', p_replaces_garment_id;
    END IF;
    SELECT shop_stock, price_per_meter INTO v_shop_stock, v_repl_unit_cost
      FROM fabrics WHERE id = v_repl_fabric_id FOR UPDATE;
    IF v_shop_stock IS NULL THEN
      RAISE EXCEPTION 'create_replacement_garment: fabric % not found for replacement of %', v_repl_fabric_id, p_replaces_garment_id;
    END IF;
    IF v_shop_stock < v_required THEN
      v_parked := true;
    END IF;
  END IF;

  -- Shop-dispatch waiting marker. A replacement waiting on the customer's cloth
  -- (customer_decision) or on a restock (waiting_material) is created but held
  -- out of the dispatch queue (dispatch_order skips it) until the shop resume
  -- step clears redo_parked_reason. redo_priority is left NULL (vestigial, §6).
  v_parked_reason := CASE
    WHEN v_repl_must_provide THEN 'customer_decision'::redo_parked_reason
    WHEN v_parked            THEN 'waiting_material'::redo_parked_reason
    ELSE NULL END;

  -- nextGarmentIdForOrder: max numeric suffix of "<order_id>-<n>" siblings + 1.
  SELECT COALESCE(MAX((split_part(garment_id, '-', 2))::int), 0) + 1
    INTO v_next
    FROM garments
   WHERE order_id = v_orig.order_id
     AND garment_id LIKE v_orig.order_id || '-%'
     AND split_part(garment_id, '-', 2) ~ '^[0-9]+$';
  v_new_garment_id := v_orig.order_id || '-' || v_next;

  -- Created AT THE SHOP (trip 0, waiting_cut, in_production false) → lands in the
  -- shop dispatch queue. fabric_id/fabric_source are the REPLACEMENT's choice.
  INSERT INTO garments (
    order_id, garment_id, measurement_id, garment_type, fabric_id,
    fabric_source, color, shop_name, fabric_length, style, style_id,
    collar_type, collar_button, collar_thickness,
    cuffs_type, cuffs_thickness, front_pocket_type, front_pocket_thickness,
    wallet_pocket, pen_holder, mobile_pocket, small_tabaggi,
    jabzour_1, jabzour_2, jabzour_thickness, lines, soaking, express,
    delivery_date, notes, quantity,
    piece_stage, location, in_production, trip_number,
    redo_parked_reason, redo_customer_must_provide_fabric
  )
  SELECT
    order_id, v_new_garment_id, measurement_id, garment_type, v_repl_fabric_id,
    v_repl_source::fabric_source, color, shop_name, fabric_length,
    COALESCE(style, 'kuwaiti'), style_id,
    collar_type, collar_button, collar_thickness,
    cuffs_type, cuffs_thickness, front_pocket_type, front_pocket_thickness,
    COALESCE(wallet_pocket, false), COALESCE(pen_holder, false),
    COALESCE(mobile_pocket, false), COALESCE(small_tabaggi, false),
    jabzour_1, jabzour_2, jabzour_thickness,
    COALESCE(lines, 1), COALESCE(soaking, false), COALESCE(express, false),
    delivery_date, notes, COALESCE(quantity, 1),
    'waiting_cut', 'shop', false, 0,
    v_parked_reason, v_repl_must_provide
  FROM garments WHERE id = p_replaces_garment_id
  RETURNING id INTO v_new_id;

  UPDATE garments
     SET replaced_by_garment_id = v_new_id
   WHERE id = p_replaces_garment_id AND replaced_by_garment_id IS NULL;

  -- Auto-consume the replacement's fresh cut from shop stock (real -L decrement),
  -- mirroring complete_work_order's stamp+UPDATE so fabric_stock_audit logs a
  -- real `consumption` row. Only for a company (IN) replacement with stock on
  -- hand (not waiting on a restock, not customer-brought).
  IF NOT v_parked AND NOT v_repl_must_provide AND v_required > 0 AND v_repl_fabric_id IS NOT NULL THEN
    PERFORM set_config('app.movement_type', 'consumption', true);
    PERFORM set_config('app.movement_ref_type', 'garment', true);
    PERFORM set_config('app.movement_ref_id', '', true);
    PERFORM set_config('app.movement_user_id', COALESCE(p_user_id::text, ''), true);
    PERFORM set_config('app.movement_supplier_id', '', true);
    PERFORM set_config('app.movement_unit_cost', COALESCE(v_repl_unit_cost::text, ''), true);
    PERFORM set_config('app.movement_reason', 'redo replacement cut', true);
    PERFORM set_config('app.movement_notes', 'redo replacement cut: ' || v_new_garment_id, true);

    UPDATE fabrics
       SET real_stock = real_stock - v_required,
           shop_stock = shop_stock - v_required
     WHERE id = v_repl_fabric_id;
  END IF;

  -- Net-zero material-waste annotation for the scrapped ORIGINAL L. Keyed on the
  -- ORIGINAL's fabric source (company IN only — OUT cloth was never our stock).
  -- Written EVEN when the replacement waits (the discard is a fact now; only the
  -- replacement cut waits). Direct INSERT — qty_delta=0 would be dropped by
  -- _log_stock_movement, and a column change here would mis-fire the consumption
  -- stamp. Mirrors the lost-in-transit precedent.
  IF v_required > 0 AND NOT v_orig_must_provide AND v_orig.fabric_id IS NOT NULL THEN
    SELECT price_per_meter INTO v_orig_unit_cost FROM fabrics WHERE id = v_orig.fabric_id;
    INSERT INTO stock_movements (
      item_type, item_id, location, movement_type, qty_delta, annotated_qty,
      unit_cost, root_cause, ref_type, ref_id, reason, notes, user_id
    )
    VALUES (
      'fabric', v_orig.fabric_id, 'shop', 'waste', 0, v_required,
      v_orig_unit_cost, p_root_cause, 'garment', NULL, 'redo',
      'redo scrap: ' || v_orig.garment_id || ' L=' || v_required, p_user_id
    );
  END IF;

  v_parked_text := CASE
    WHEN v_repl_must_provide THEN 'customer_decision'
    WHEN v_parked            THEN 'waiting_material'
    ELSE NULL END;

  v_result := jsonb_build_object(
    'id', v_new_id,
    'garment_id', v_new_garment_id,
    'parked', (v_parked OR v_repl_must_provide),
    'parked_reason', v_parked_text,
    'fabric_source', v_repl_source
  );
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- GROUP A (SPEC.md §2.5/§6 shop resume action): the SHOP un-parks a replacement
-- waiting in the dispatch queue once the blocker clears — the customer brought
-- their cloth (customer_decision) or our stock was restocked (waiting_material).
-- For company (IN) fabric this is where the deferred real -L consumption finally
-- lands; the scrap annotation was already written at creation, so it is NOT
-- re-written here. The replacement stays AT THE SHOP (trip 0, in_production false)
-- and becomes dispatchable — clearing redo_parked_reason lets dispatch_order pick
-- it up. No scheduling priority is set (the redo-priority queue was dropped, §6).
DROP FUNCTION IF EXISTS resume_parked_redo(uuid, redo_priority, uuid, uuid);
DROP FUNCTION IF EXISTS resume_parked_redo(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION resume_parked_redo(
  p_garment_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_g garments%ROWTYPE;
  v_required NUMERIC;
  v_shop_stock NUMERIC;
  v_unit_cost NUMERIC;
  v_result JSONB;
BEGIN
  IF NOT idem_claim(p_idempotency_key, 'resume_parked_redo') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  SELECT * INTO v_g FROM garments WHERE id = p_garment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resume_parked_redo: garment % not found', p_garment_id;
  END IF;

  -- Not waiting (already dispatchable) → nothing to resume. Idempotent no-op.
  IF v_g.redo_parked_reason IS NULL THEN
    v_result := jsonb_build_object('resumed', false, 'already_active', true, 'consumed', 0);
    PERFORM idem_store(p_idempotency_key, v_result);
    RETURN v_result;
  END IF;

  -- Customer-brought (OUT) cloth: nothing to consume; just clear the wait so the
  -- replacement becomes dispatchable. The OUT flag stays (it's still customer cloth).
  IF v_g.redo_customer_must_provide_fabric THEN
    UPDATE garments
       SET redo_parked_reason = NULL,
           in_production = false
     WHERE id = p_garment_id;
    v_result := jsonb_build_object('resumed', true, 'consumed', 0);
    PERFORM idem_store(p_idempotency_key, v_result);
    RETURN v_result;
  END IF;

  v_required := COALESCE(v_g.fabric_length, 0);

  IF v_required > 0 AND v_g.fabric_id IS NOT NULL THEN
    SELECT shop_stock, price_per_meter INTO v_shop_stock, v_unit_cost
      FROM fabrics WHERE id = v_g.fabric_id FOR UPDATE;
    IF v_shop_stock IS NULL THEN
      RAISE EXCEPTION 'resume_parked_redo: fabric % not found for garment %', v_g.fabric_id, p_garment_id;
    END IF;
    -- Still short → stays waiting; the shop retries after a restock.
    IF v_shop_stock < v_required THEN
      RAISE EXCEPTION 'resume_parked_redo: cannot resume — only % of fabric % on hand, need %',
        v_shop_stock, v_g.fabric_id, v_required;
    END IF;

    -- Real -L consumption (the replacement cut), no second waste annotation.
    PERFORM set_config('app.movement_type', 'consumption', true);
    PERFORM set_config('app.movement_ref_type', 'garment', true);
    PERFORM set_config('app.movement_ref_id', '', true);
    PERFORM set_config('app.movement_user_id', COALESCE(p_user_id::text, ''), true);
    PERFORM set_config('app.movement_supplier_id', '', true);
    PERFORM set_config('app.movement_unit_cost', COALESCE(v_unit_cost::text, ''), true);
    PERFORM set_config('app.movement_reason', 'redo replacement cut', true);
    PERFORM set_config('app.movement_notes', 'redo replacement cut (resumed): ' || v_g.garment_id, true);

    UPDATE fabrics
       SET real_stock = real_stock - v_required,
           shop_stock = shop_stock - v_required
     WHERE id = v_g.fabric_id;
  END IF;

  UPDATE garments
     SET redo_parked_reason = NULL,
         in_production = false
   WHERE id = p_garment_id;

  v_result := jsonb_build_object('resumed', true, 'consumed', v_required);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- GROUP A (SPEC.md §2.5 redo outcome 3): redo with NO replacement. At the brova
-- trial the SHOP discards the brova and (optionally) PROMOTES one parked final to
-- be the new trial brova — the final's fabric was already cut at confirmation, so
-- no fresh fabric is consumed. The remaining finals stay parked on the promoted
-- brova (the discarded brova's replaced_by_garment_id points at it → §2.8 label).
-- p_final_id NULL → discard-only (single-garment order / no parked final): nothing
-- is promoted. The customer refund is the cashier's §2.6 job — this RPC writes no
-- money. The discarded brova's own company (IN) fabric is recorded as a net-zero
-- scrap annotation (root_cause), exactly like a normal redo discard (§4).
DROP FUNCTION IF EXISTS redo_promote_final_to_brova(uuid, uuid, root_cause, uuid, uuid);
CREATE OR REPLACE FUNCTION redo_promote_final_to_brova(
  p_brova_id UUID,
  p_final_id UUID DEFAULT NULL,
  p_root_cause root_cause DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_brova garments%ROWTYPE;
  v_final garments%ROWTYPE;
  v_required NUMERIC;
  v_unit_cost NUMERIC;
  v_promoted_garment_id TEXT := NULL;
  v_result JSONB;
BEGIN
  IF NOT idem_claim(p_idempotency_key, 'redo_promote_final_to_brova') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  SELECT * INTO v_brova FROM garments WHERE id = p_brova_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'redo_promote_final_to_brova: brova % not found', p_brova_id;
  END IF;
  IF v_brova.garment_type <> 'brova' THEN
    RAISE EXCEPTION 'redo_promote_final_to_brova: garment % is not a brova (%); only a brova is redone this way', p_brova_id, v_brova.garment_type;
  END IF;
  IF v_brova.piece_stage = 'discarded' THEN
    RAISE EXCEPTION 'redo_promote_final_to_brova: brova % is already discarded', p_brova_id;
  END IF;
  IF v_brova.replaced_by_garment_id IS NOT NULL THEN
    RAISE EXCEPTION 'redo_promote_final_to_brova: brova % already has a replacement', p_brova_id;
  END IF;

  -- Validate the chosen final only when one is given (NULL = discard-only).
  IF p_final_id IS NOT NULL THEN
    SELECT * INTO v_final FROM garments WHERE id = p_final_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'redo_promote_final_to_brova: final % not found', p_final_id;
    END IF;
    IF v_final.order_id <> v_brova.order_id THEN
      RAISE EXCEPTION 'redo_promote_final_to_brova: final % is not in the same order as brova %', p_final_id, p_brova_id;
    END IF;
    IF v_final.garment_type <> 'final' THEN
      RAISE EXCEPTION 'redo_promote_final_to_brova: garment % is not a final (%); only a parked final can be promoted', p_final_id, v_final.garment_type;
    END IF;
    IF v_final.piece_stage <> 'waiting_for_acceptance' THEN
      RAISE EXCEPTION 'redo_promote_final_to_brova: final % is not a parked final (stage %); only a final parked at waiting_for_acceptance can be promoted', p_final_id, v_final.piece_stage;
    END IF;
  END IF;

  -- 1. Discard the brova (terminal). root_cause attributes the scrap. When a final
  --    is promoted, link the discarded brova to it as its "replacement brova" so the
  --    §2.8 finals-waiting-on-replacement-brova label resolves correctly.
  UPDATE garments
     SET piece_stage = 'discarded',
         feedback_status = 'needs_redo',
         acceptance_status = false,
         in_production = false,
         root_cause = p_root_cause,
         replaced_by_garment_id = p_final_id
   WHERE id = p_brova_id;

  -- 2. Promote the chosen parked final to a brova and release it to production. It
  --    goes through the normal production → dispatch → trial path. It stays at the
  --    workshop where it was parked; in_production false (the scheduler / receive
  --    starts it, like release_finals). promoted_to_brova_at stamps the audit.
  IF p_final_id IS NOT NULL THEN
    UPDATE garments
       SET garment_type = 'brova',
           piece_stage = 'waiting_cut',
           in_production = false,
           promoted_to_brova_at = now()
     WHERE id = p_final_id;
    v_promoted_garment_id := v_final.garment_id;
  END IF;

  -- 3. Net-zero scrap annotation for the discarded brova's company (IN) fabric —
  --    same conservation treatment as a normal redo discard (§4). OUT cloth was
  --    never our stock → no annotation (root_cause still captured above).
  v_required := COALESCE(v_brova.fabric_length, 0);
  IF v_required > 0 AND v_brova.fabric_source = 'IN' AND v_brova.fabric_id IS NOT NULL THEN
    SELECT price_per_meter INTO v_unit_cost FROM fabrics WHERE id = v_brova.fabric_id;
    INSERT INTO stock_movements (
      item_type, item_id, location, movement_type, qty_delta, annotated_qty,
      unit_cost, root_cause, ref_type, ref_id, reason, notes, user_id
    )
    VALUES (
      'fabric', v_brova.fabric_id, 'shop', 'waste', 0, v_required,
      v_unit_cost, p_root_cause, 'garment', NULL, 'redo',
      'redo scrap (promote): ' || v_brova.garment_id || ' L=' || v_required, p_user_id
    );
  END IF;

  v_result := jsonb_build_object(
    'brova_id', p_brova_id,
    'promoted_final_id', p_final_id,
    'promoted_garment_id', v_promoted_garment_id
  );
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
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

-- 12b. RPC: Reprice an order's style component after a brova-trial per-final
-- style change (SPEC §2.5). The client recomputes each changed garment's style
-- price with the SAME pricing function used at order creation
-- (calculateGarmentStylePrice) and passes the absolute new snapshots + the new
-- aggregate style_charge + new order_total. This RPC just persists them
-- atomically, serializing on the order row.
--
-- Audit-only: it writes the true new order_total EVEN IF that drops below the
-- amount already paid — unlike update_order_discount (which blocks), the
-- resulting credit is a MANUAL cashier refund per §2.6. It NEVER touches
-- orders.paid (owned by sync_order_paid_from_transactions). Fabric/stitching
-- are not repriced — only style moves. Idempotent via idem_claim/replay/store
-- AND naturally idempotent (absolute assignment converges on replay).
CREATE OR REPLACE FUNCTION reprice_order_styles(
  p_order_id INT,
  p_garments JSONB,            -- [{ garment_id: uuid, style_price_snapshot: decimal }]
  p_new_style_charge DECIMAL,
  p_new_order_total DECIMAL,
  p_actor UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_elem JSONB;
  v_old_order_total DECIMAL;
  v_old_style_charge DECIMAL;
  v_result JSONB;
BEGIN
  -- Lost-response replay must not double-anything (though absolute assignment is
  -- already idempotent; this also preserves the originally-reported delta).
  IF NOT idem_claim(p_idempotency_key, 'reprice_order_styles') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  -- Serialize concurrent repricings of the same order.
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_old_order_total := COALESCE(v_order.order_total, 0);
  SELECT COALESCE(style_charge, 0) INTO v_old_style_charge
    FROM work_orders WHERE order_id = p_order_id;

  -- 1. Update each changed garment's style-price snapshot. Scoped to this order
  --    so a stray id can never write across orders.
  FOR v_elem IN SELECT * FROM jsonb_array_elements(COALESCE(p_garments, '[]'::jsonb))
  LOOP
    UPDATE garments
    SET style_price_snapshot = (v_elem->>'style_price_snapshot')::DECIMAL
    WHERE id = (v_elem->>'garment_id')::UUID
      AND order_id = p_order_id;
  END LOOP;

  -- 2. Roll the new aggregate style charge into the work order.
  UPDATE work_orders SET style_charge = p_new_style_charge WHERE order_id = p_order_id;

  -- 3. Write the new order total. Audit-only: allowed to fall below paid (the
  --    credit is a manual cashier refund). orders.paid is never touched here.
  UPDATE orders SET order_total = p_new_order_total WHERE id = p_order_id;

  -- 4. A style reprice is a price change → mint an invoice revision (SPEC §3),
  --    but only when the total actually moved; a no-op reprice must not bump.
  --    Naturally idempotent: idem_claim already short-circuits a replay above.
  IF p_new_order_total IS DISTINCT FROM v_old_order_total THEN
    UPDATE work_orders
    SET invoice_revision = COALESCE(invoice_revision, 0) + 1
    WHERE order_id = p_order_id;
  END IF;

  v_result := jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'old_order_total', v_old_order_total,
    'new_order_total', p_new_order_total,
    'delta', p_new_order_total - v_old_order_total,
    'old_style_charge', v_old_style_charge,
    'new_style_charge', p_new_style_charge,
    'actor', p_actor,
    'reason', p_reason
  );

  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 13. RPC: Cashier dashboard summary (lightweight aggregates, no row transfer)
-- Uses two sources: orders table for billing totals, payment_transactions for actual collections.
-- "today_paid"/"month_paid" = paid-so-far on orders created in that period (order-centric).
-- "today_collected"/"month_collected" = actual cash received in that period (cash-centric).
-- Cashier "All Orders" stats, scoped to the list's selected period. p_start_iso
-- is the period lower bound on order_date (UTC instant; NULL = all time), mirroring
-- the list's own period filter so the panel and the rows always agree. Stats are
-- order-attributed (billed/collected/outstanding all reference orders PLACED in the
-- period), forming a coherent collection triangle; actual cash-flow-by-date lives
-- in the EOD report, not here. Confirmed orders only (drafts/cancelled excluded).
DROP FUNCTION IF EXISTS get_cashier_summary(text, date, int);
CREATE OR REPLACE FUNCTION get_cashier_summary(
  p_brand TEXT,
  p_start_iso TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'billed',             COALESCE(SUM(order_total::decimal), 0),
    'collected',          COALESCE(SUM(paid::decimal), 0),
    'outstanding',        COALESCE(SUM(GREATEST(order_total::decimal - paid::decimal, 0)), 0),
    'order_count',        COUNT(*),
    -- payment-status buckets (epsilon-tolerant): unpaid = nothing collected,
    -- partial = some but not all, paid = fully settled. owing = unpaid + partial.
    'paid_count',         COUNT(*) FILTER (WHERE order_total::decimal - COALESCE(paid::decimal, 0) <= 0.001),
    'partial_count',      COUNT(*) FILTER (WHERE COALESCE(paid::decimal, 0) > 0.001 AND order_total::decimal - COALESCE(paid::decimal, 0) > 0.001),
    'unpaid_count',       COUNT(*) FILTER (WHERE COALESCE(paid::decimal, 0) <= 0.001 AND order_total::decimal - COALESCE(paid::decimal, 0) > 0.001),
    'owing_count',        COUNT(*) FILTER (WHERE order_total::decimal - COALESCE(paid::decimal, 0) > 0.001),
    'partial_outstanding',COALESCE(SUM(GREATEST(order_total::decimal - paid::decimal, 0)) FILTER (WHERE COALESCE(paid::decimal, 0) > 0.001 AND order_total::decimal - COALESCE(paid::decimal, 0) > 0.001), 0),
    'unpaid_outstanding', COALESCE(SUM(GREATEST(order_total::decimal - paid::decimal, 0)) FILTER (WHERE COALESCE(paid::decimal, 0) <= 0.001 AND order_total::decimal - COALESCE(paid::decimal, 0) > 0.001), 0),
    'work_count',         COUNT(*) FILTER (WHERE order_type = 'WORK'),
    'sales_count',        COUNT(*) FILTER (WHERE order_type = 'SALES'),
    'work_billed',        COALESCE(SUM(order_total::decimal) FILTER (WHERE order_type = 'WORK'), 0),
    'sales_billed',       COALESCE(SUM(order_total::decimal) FILTER (WHERE order_type = 'SALES'), 0)
  ) INTO v_stats
  FROM orders
  WHERE brand = p_brand::brand
    AND checkout_status = 'confirmed'
    AND (p_start_iso IS NULL OR order_date >= p_start_iso);

  RETURN v_stats;
END;
$$ LANGUAGE plpgsql;

-- 14. RPC: Get unpaid/paid order IDs (server-side column comparison)
-- PostgREST can't compare two columns (order_total vs paid), so we do it here.
CREATE OR REPLACE FUNCTION get_cashier_order_ids_by_payment(
  p_brand TEXT,
  p_filter TEXT,  -- 'unpaid' (nothing paid) | 'partial' | 'paid' | 'owing' (unpaid+partial)
  p_limit INT DEFAULT 30
)
RETURNS SETOF INT AS $$
BEGIN
  IF p_filter = 'unpaid' THEN
    RETURN QUERY
      SELECT id FROM orders
      WHERE brand = p_brand::brand
        AND checkout_status = 'confirmed'
        AND COALESCE(paid::decimal, 0) <= 0.001
        AND (order_total::decimal - COALESCE(paid::decimal, 0)) > 0.001
      ORDER BY order_date DESC
      LIMIT p_limit;
  ELSIF p_filter = 'partial' THEN
    RETURN QUERY
      SELECT id FROM orders
      WHERE brand = p_brand::brand
        AND checkout_status = 'confirmed'
        AND COALESCE(paid::decimal, 0) > 0.001
        AND (order_total::decimal - COALESCE(paid::decimal, 0)) > 0.001
      ORDER BY order_date DESC
      LIMIT p_limit;
  ELSIF p_filter = 'owing' THEN
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
        AND (order_total::decimal - COALESCE(paid::decimal, 0)) <= 0.001
      ORDER BY order_date DESC
      LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- normalize_phone: reduce a phone (stored value OR search query) to its national
-- digits so the two compare equal regardless of how a country code was entered.
-- Rule: a leading '+' or '00' marks an international form -> strip it and the
-- Kuwait country code 965. A bare number (no marker) is national and kept as-is,
-- so a local number that itself begins with 965 (e.g. 9651xxxx) is never mis-stripped.
--   '+965 5009 0123' -> '50090123'   '0096550090123' -> '50090123'   '50090123' -> '50090123'
CREATE OR REPLACE FUNCTION normalize_phone(p TEXT)
RETURNS TEXT AS $$
DECLARE
  d TEXT;
BEGIN
  IF p IS NULL THEN RETURN ''; END IF;
  d := regexp_replace(p, '[^0-9]', '', 'g');            -- digits only
  IF btrim(p) LIKE '+%' OR LEFT(d, 2) = '00' THEN       -- explicit international marker
    IF LEFT(d, 2) = '00' THEN d := SUBSTR(d, 3); END IF; -- drop 00 access prefix
    IF LEFT(d, 3) = '965' THEN d := SUBSTR(d, 4); END IF; -- drop Kuwait country code
  END IF;
  RETURN d;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP FUNCTION IF EXISTS search_customers_fuzzy(TEXT, INT);
-- 15. RPC: Customer search.
-- Phone query (digits, optionally with + / spaces / dashes) = national-number
--   PREFIX match via normalize_phone, no fuzziness (so "50090" returns only
--   phones whose national number starts with 50090, with or without a country code).
-- Text query = pg_trgm fuzzy + substring over name/arabic_name/nick_name,
--   typo-tolerant and ranked by similarity.
-- Always returns a bounded result set (p_limit, default 15).
CREATE OR REPLACE FUNCTION search_customers_fuzzy(
  p_query TEXT,
  p_limit INT DEFAULT 15
)
RETURNS JSONB AS $$
DECLARE
  v_query TEXT := LOWER(TRIM(p_query));
  -- Phone-like: only digits and phone punctuation (+ space - ()), with >=1 digit.
  v_is_phone BOOLEAN := v_query ~ '^[+0-9 ()\-]+$' AND regexp_replace(v_query, '[^0-9]', '', 'g') <> '';
  v_nat TEXT := normalize_phone(v_query);
  v_result JSONB;
BEGIN
  IF LENGTH(v_query) < 1 THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_is_phone THEN
    -- Phone query: national-number prefix match, no fuzziness. normalize_phone
    -- strips any country code on both sides so "50090" matches +96550090123 too.
    SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb) INTO v_result
    FROM (
      SELECT c.*
      FROM customers c
      WHERE normalize_phone(c.phone) LIKE v_nat || '%'
      ORDER BY normalize_phone(c.phone) ASC
      LIMIT p_limit
    ) sub;
  ELSE
    -- Text query: trigram fuzzy + substring over name fields, typo-tolerant.
    -- Set similarity threshold (lower = more fuzzy, default 0.3)
    PERFORM set_config('pg_trgm.similarity_threshold', '0.15', TRUE);

    SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb) INTO v_result
    FROM (
      SELECT c.*,
        GREATEST(
          COALESCE(similarity(LOWER(c.name), v_query), 0),
          COALESCE(similarity(LOWER(c.arabic_name), v_query), 0),
          COALESCE(similarity(LOWER(c.nick_name), v_query), 0)
        ) AS match_score
      FROM customers c
      WHERE
        LOWER(c.name) % v_query
        OR LOWER(c.arabic_name) % v_query
        OR LOWER(c.nick_name) % v_query
        OR c.name ILIKE '%' || v_query || '%'
        OR c.arabic_name ILIKE '%' || v_query || '%'
        OR c.nick_name ILIKE '%' || v_query || '%'
      ORDER BY match_score DESC, c.name ASC
      LIMIT p_limit
    ) sub;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 15b. RPC: find every account that already uses a phone number, matched on the
-- normalized national number (exact equality, so formatting / spaces / leading
-- zero / country-code differences still match). Powers the demographics form's
-- duplicate-phone hard block (SPEC §5): entering a number already on file forces
-- the staff to link as a family member or fix the number. For each match we also
-- resolve the Primary it belongs to (itself if it is a Primary, else its
-- primary_customer_id) and that primary's name, so the form can offer
-- "link as family member of X". Primary matches are returned first.
CREATE OR REPLACE FUNCTION find_accounts_by_phone(p_phone TEXT)
RETURNS JSONB AS $$
DECLARE
  v_nat TEXT := normalize_phone(p_phone);
  v_result JSONB;
BEGIN
  IF v_nat = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT c.id,
           c.name,
           c.phone,
           c.account_type,
           c.primary_customer_id,
           (CASE WHEN c.account_type = 'Primary' THEN c.id ELSE c.primary_customer_id END) AS resolved_primary_id,
           p.name AS resolved_primary_name
    FROM customers c
    LEFT JOIN customers p
      ON p.id = (CASE WHEN c.account_type = 'Primary' THEN c.id ELSE c.primary_customer_id END)
    WHERE normalize_phone(c.phone) = v_nat
    ORDER BY (c.account_type = 'Primary') DESC, c.id ASC
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
  v_is_phone BOOLEAN := v_query ~ '^[+0-9 ()\-]+$' AND regexp_replace(v_query, '[^0-9]', '', 'g') <> '';
  v_nat TEXT := normalize_phone(v_query);
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
  ELSIF v_is_phone THEN
    -- Phone query: national-number prefix match (normalize_phone strips any
    -- country code on both sides), no fuzziness.
    SELECT COUNT(*) INTO v_count
    FROM customers c
    WHERE normalize_phone(c.phone) LIKE v_nat || '%';

    SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb) INTO v_data
    FROM (
      SELECT c.*,
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
      WHERE normalize_phone(c.phone) LIKE v_nat || '%'
      ORDER BY normalize_phone(c.phone) ASC
      OFFSET v_offset LIMIT p_page_size
    ) sub;
  ELSE
    -- Text query: trigram fuzzy + substring over name fields, typo-tolerant.
    PERFORM set_config('pg_trgm.similarity_threshold', '0.15', TRUE);

    SELECT COUNT(*) INTO v_count
    FROM customers c
    WHERE LOWER(c.name) % v_query
      OR LOWER(c.arabic_name) % v_query
      OR LOWER(c.nick_name) % v_query
      OR c.name ILIKE '%' || v_query || '%'
      OR c.arabic_name ILIKE '%' || v_query || '%'
      OR c.nick_name ILIKE '%' || v_query || '%';

    SELECT COALESCE(jsonb_agg(row_to_json(sub.*)), '[]'::jsonb) INTO v_data
    FROM (
      SELECT c.*,
        GREATEST(
          COALESCE(similarity(LOWER(c.name), v_query), 0),
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
        OR LOWER(c.arabic_name) % v_query
        OR LOWER(c.nick_name) % v_query
        OR c.name ILIKE '%' || v_query || '%'
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
-- bcrypt cost 10 ≈ 2^10 rounds. Existing cost-8 hashes still verify (cost is
-- encoded in the stored hash itself), so this is a no-op for current users —
-- new and reset PINs get the stronger cost from here on.
CREATE OR REPLACE FUNCTION hash_pin(p_pin TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN crypt(p_pin, gen_salt('bf', 10));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

-- Set a user's PIN. Enforces the PIN policy server-side so the rule holds
-- regardless of which client (admin UI, edge function, psql) calls it.
CREATE OR REPLACE FUNCTION set_user_pin(p_user_id UUID, p_pin TEXT)
RETURNS VOID AS $$
BEGIN
  -- Numeric, length >= 6.
  IF p_pin !~ '^\d{6,}$' THEN
    RAISE EXCEPTION 'PIN must be at least 6 digits and contain only numbers';
  END IF;

  -- Reject all-same-digit (000000, 111111, …).
  IF p_pin ~ '^(\d)\1+$' THEN
    RAISE EXCEPTION 'PIN cannot be all the same digit';
  END IF;

  -- Reject trivial ascending/descending sequences (123456, 234567, 987654, …).
  -- Substring match against the two reference strings catches every length.
  IF position(p_pin IN '01234567890') > 0 OR position(p_pin IN '09876543210') > 0 THEN
    RAISE EXCEPTION 'PIN cannot be a simple sequence';
  END IF;

  UPDATE users
  SET pin = crypt(p_pin, gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

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
    -- Match the bad-PIN delay so timing can't distinguish "wrong username"
    -- from "wrong PIN" — closes the username-enumeration side channel.
    PERFORM pg_sleep(0.5);
    RAISE EXCEPTION 'Invalid username or PIN';
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
    -- Throttle: caps brute-force at ~2 attempts/sec per connection regardless
    -- of any network-layer rate limit. Bcrypt itself takes ~10ms at cost 10 —
    -- this is the dominant factor.
    PERFORM pg_sleep(0.5);

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

-- Migrate existing plaintext PINs to hashed (run once, idempotent)
-- Plaintext PINs are short numeric strings; bcrypt hashes start with '$2'
CREATE OR REPLACE FUNCTION migrate_plaintext_pins()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE users
  SET pin = crypt(pin, gen_salt('bf', 10))
  WHERE pin IS NOT NULL
    AND pin NOT LIKE '$2%';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

-- Link a Supabase Auth user to our users table (called from Edge Functions)
CREATE OR REPLACE FUNCTION link_auth_id(p_user_id UUID, p_auth_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE users SET auth_id = p_auth_id WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

-- ── PIN/Auth RPC access control ──
-- These are SECURITY DEFINER and would otherwise be callable by anon/
-- authenticated via PostgREST. set_user_pin and link_auth_id are
-- account-takeover primitives if exposed; restrict to service_role
-- (Edge Functions). verify_pin is only invoked from login_with_pin
-- (SECURITY DEFINER), so clients never need direct access — locking it
-- down closes a parallel brute-force path that would bypass any future
-- hardening on login_with_pin.
REVOKE EXECUTE ON FUNCTION set_user_pin(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION link_auth_id(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION migrate_plaintext_pins() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION verify_pin(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_user_pin(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION link_auth_id(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION migrate_plaintext_pins() TO service_role;
GRANT EXECUTE ON FUNCTION verify_pin(TEXT, TEXT) TO service_role;

-- DEV-ONLY convenience: returns the full active-user roster so the login
-- pages can render a clickable staff picker (fast role-switching during
-- testing). Anyone hitting the URL gets the roster — that's a staff-
-- enumeration leak in a public-internet deployment. Tracked in
-- CLAUDE.md §11: DROP this function before exposing the app on a public
-- domain, and switch the login pages back to typed-username only.
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
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

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
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

-- Get the current user's department from auth.uid() → users.auth_id
CREATE OR REPLACE FUNCTION get_my_department()
RETURNS TEXT AS $$
  SELECT department::text FROM users WHERE auth_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

-- Get the current user's job_functions (empty = office user, not terminal-locked)
CREATE OR REPLACE FUNCTION get_my_job_functions()
RETURNS job_function[] AS $$
  SELECT job_functions FROM users WHERE auth_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

-- Drop the legacy single-value helper. No callers in app code or RLS.
DROP FUNCTION IF EXISTS get_my_job_function();

-- Get the current user's id (users.id, NOT auth.uid()) from auth.uid() → users.auth_id
CREATE OR REPLACE FUNCTION get_my_user_id()
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_id = auth.uid() AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

-- Replacement for bare `is_active_user()` checks in RLS policies.
-- Returns true only when the JWT maps to an existing, active user row.
-- Combined with the client-side 401 interceptor in db.ts, deactivating or
-- deleting a user causes their next API call to 401 → forced signOut.
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

-- Check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND role IN ('super_admin', 'admin'));
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

-- The unconditional super-user of the app. Powers the blanket super-admin
-- access policies (end of file) so a super_admin is never locked out of any
-- RLS table, present or future.
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND role = 'super_admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

-- Check if current user is admin or manager
CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND role IN ('super_admin', 'admin', 'manager'));
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

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
    -- brand is in the user's brands array (case-insensitive). The old
    -- "NULL brands = unrestricted" wildcard was removed for production per-brand
    -- isolation (SPEC §1): a shop user with no brands set is locked out, while
    -- super_admin and workshop are still covered by the branches above.
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_active = true AND lower(brand_value) = ANY(brands));
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

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

-- Presence is visible within the same department; managers see all. Scoped
-- this way so an attacker who lands one valid JWT can't enumerate every
-- staff member's login activity across both apps.
DROP POLICY IF EXISTS "sessions_select" ON user_sessions;
CREATE POLICY "sessions_select" ON user_sessions FOR SELECT USING (
  is_active_user() AND (
    is_manager_or_above()
    OR user_id = get_my_user_id()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_sessions.user_id
        AND u.department::text = get_my_department()
    )
  )
);

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

-- ── Style pricing rules (flat-override / additive config) ───────────
ALTER TABLE style_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "style_pricing_rules_select" ON style_pricing_rules;
CREATE POLICY "style_pricing_rules_select" ON style_pricing_rules FOR SELECT USING (
  is_active_user() AND can_access_brand(brand::text)
);

DROP POLICY IF EXISTS "style_pricing_rules_modify" ON style_pricing_rules;
CREATE POLICY "style_pricing_rules_modify" ON style_pricing_rules FOR ALL USING (
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

-- ── Alteration Orders (ALTERATION extension of an orders row) ───────
-- Inserted directly by the shop (api/alteration-orders.ts) and updated by
-- dispatch_order (SECURITY INVOKER) when the alteration is dispatched, so the
-- modify policy must admit both. No own brand column; the parent orders row
-- already enforces brand on its own writes.
ALTER TABLE alteration_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alteration_orders_select" ON alteration_orders;
CREATE POLICY "alteration_orders_select" ON alteration_orders FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "alteration_orders_modify" ON alteration_orders;
CREATE POLICY "alteration_orders_modify" ON alteration_orders FOR ALL USING (
  is_manager_or_above() OR get_my_department() IN ('shop','workshop')
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

-- ── Units (workshop production teams; managed alongside resources) ──
ALTER TABLE units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "units_select" ON units;
CREATE POLICY "units_select" ON units FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "units_modify" ON units;
CREATE POLICY "units_modify" ON units FOR ALL USING (
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

-- ── Stock Purchases (non-customer expense payables) ─────────────────
-- Brand-scoped. Writes go through restock_item (create) and pay_stock_purchase
-- (settle), both SECURITY INVOKER, so these policies are the load-bearing check.
ALTER TABLE stock_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_purchases_select" ON stock_purchases;
CREATE POLICY "stock_purchases_select" ON stock_purchases FOR SELECT USING (
  is_active_user() AND can_access_brand(brand::text)
);

DROP POLICY IF EXISTS "stock_purchases_insert" ON stock_purchases;
CREATE POLICY "stock_purchases_insert" ON stock_purchases FOR INSERT WITH CHECK (
  (is_manager_or_above() OR get_my_department() = 'shop') AND can_access_brand(brand::text)
);

-- Updates come only from the sync trigger (amount_paid/status). Restrict direct
-- updates to shop/managers of the brand as a second line of defense.
DROP POLICY IF EXISTS "stock_purchases_update" ON stock_purchases;
CREATE POLICY "stock_purchases_update" ON stock_purchases FOR UPDATE USING (
  (is_manager_or_above() OR get_my_department() = 'shop') AND can_access_brand(brand::text)
);

-- ── Stock Purchase Payments (settlement ledger) ─────────────────────
ALTER TABLE stock_purchase_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_purchase_payments_select" ON stock_purchase_payments;
CREATE POLICY "stock_purchase_payments_select" ON stock_purchase_payments FOR SELECT USING (
  is_active_user() AND EXISTS (
    SELECT 1 FROM stock_purchases sp
    WHERE sp.id = stock_purchase_payments.purchase_id AND can_access_brand(sp.brand::text)
  )
);

DROP POLICY IF EXISTS "stock_purchase_payments_insert" ON stock_purchase_payments;
CREATE POLICY "stock_purchase_payments_insert" ON stock_purchase_payments FOR INSERT WITH CHECK (
  (is_manager_or_above() OR get_my_department() = 'shop')
  AND EXISTS (
    SELECT 1 FROM stock_purchases sp
    WHERE sp.id = stock_purchase_payments.purchase_id AND can_access_brand(sp.brand::text)
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

-- Only a still-'requested' transfer may be deleted (the cancel/withdraw path).
-- A 'dispatched'/'partially_received' transfer has already debited the source
-- and not yet credited the dest; deleting it from any client would lose the
-- in-transit units with no ledger trail. There is no RPC to cancel a dispatched
-- transfer and return stock to source — a dispatched transfer is only resolved
-- via receive_transfer.
DROP POLICY IF EXISTS "transfer_requests_delete" ON transfer_requests;
CREATE POLICY "transfer_requests_delete" ON transfer_requests
    FOR DELETE USING (is_active_user() AND status = 'requested');

ALTER TABLE transfer_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfer_request_items_select" ON transfer_request_items;
CREATE POLICY "transfer_request_items_select" ON transfer_request_items
    FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "transfer_request_items_insert" ON transfer_request_items;
CREATE POLICY "transfer_request_items_insert" ON transfer_request_items
    FOR INSERT WITH CHECK (is_active_user());

-- No broad UPDATE/DELETE policy: dispatched_qty/received_qty (the only record of
-- in-transit quantity) are written exclusively by the dispatch/receive/direct_send
-- SECURITY DEFINER RPCs, which bypass RLS. The app never updates or deletes these
-- rows directly (item rows clean up via ON DELETE CASCADE when a 'requested'
-- transfer is deleted). Leaving them open would let any client rewrite in-transit
-- quantities and lose stock with no ledger trail. SELECT (realtime) + INSERT
-- (app creates request items directly) are the only paths the app needs.
DROP POLICY IF EXISTS "transfer_request_items_update" ON transfer_request_items;

DROP POLICY IF EXISTS "transfer_request_items_delete" ON transfer_request_items;

-- ── Appointments ────────────────────────────────────────────────────
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Shop department coordinates appointments for EVERY brand (SPEC §5): the
-- showroom (ERTH) staff hold the cross-brand appointments list and resolve
-- them, so shop users see and update all brands' appointments — mirroring how
-- the workshop department already sees every brand in can_access_brand().
DROP POLICY IF EXISTS "appointments_select" ON appointments;
CREATE POLICY "appointments_select" ON appointments FOR SELECT USING (
  is_active_user() AND (
    get_my_department() = 'shop' OR brand IS NULL OR can_access_brand(brand::text)
  )
);

DROP POLICY IF EXISTS "appointments_insert" ON appointments;
CREATE POLICY "appointments_insert" ON appointments FOR INSERT WITH CHECK (
  is_active_user() AND (brand IS NULL OR can_access_brand(brand::text))
);

DROP POLICY IF EXISTS "appointments_update" ON appointments;
CREATE POLICY "appointments_update" ON appointments FOR UPDATE USING (
  get_my_department() = 'shop'
  OR (
    (is_manager_or_above() OR assigned_to = get_my_user_id())
    AND (brand IS NULL OR can_access_brand(brand::text))
  )
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
  v_purchases_total NUMERIC;
  v_purchases_count INT;
  v_purchases_by_method JSONB;
  v_cash_in_total NUMERIC;
  v_cash_out_total NUMERIC;
  v_cash_flow_by_category JSONB;
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

  -- 1e. Garments collected/delivered in range (customer hand-over events).
  -- Counted from the garment's collected_at stamp (set by collect_garments /
  -- record_payment_transaction at handover), NOT garment_feedback — finals are
  -- collected at handover with NO feedback form (SPEC §2.5/§3), so no feedback
  -- row is ever written with action 'collected'/'delivered' and the old query
  -- always returned 0.
  SELECT COUNT(*)
  INTO v_delivered_count
  FROM garments g
  JOIN orders o ON o.id = g.order_id
  WHERE o.brand = p_brand::brand
    AND g.fulfillment_type IN ('collected', 'delivered')
    AND g.collected_at >= v_tx_start
    AND g.collected_at < v_tx_end;

  -- 2. Transaction-level aggregates (actual money movement)
  --    created_at is UTC, so use timezone-corrected boundaries.
  --
  --    Cash-basis filter is `checkout_status <> 'draft'` (NOT `= 'confirmed'`):
  --    a confirmed order that is later cancelled keeps its payment_transactions,
  --    and the cash that actually moved must still appear in the report.
  --    Otherwise close_register (which sums by register_session_id alone) and
  --    EOD diverge any time an order is cancelled in or after the range —
  --    and a cancel T+N days later would silently mutate a printed prior-day
  --    EOD. Drafts are excluded as sentinels for "not yet a real order".
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
    AND o.checkout_status <> 'draft'
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
      AND o.checkout_status <> 'draft'
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
      AND o.checkout_status <> 'draft'
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
      AND o.checkout_status <> 'draft'
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
      AND o.checkout_status <> 'draft'
      AND pt.created_at >= v_tx_start
      AND pt.created_at < v_tx_end
    GROUP BY u.name
    ORDER BY collected DESC
  ) sub;

  -- 6. Stock-purchase settlements (non-customer expense payables — SPEC §3).
  --    Scoped by the payable's brand; paid_at is UTC like payment_transactions,
  --    so reuse the timezone-corrected boundaries. Surfaces ALL settlements,
  --    including non-cash (knet/link/bank) which never touch the cash drawer.
  SELECT
    COALESCE(SUM(spp.amount), 0),
    COUNT(*)
  INTO v_purchases_total, v_purchases_count
  FROM stock_purchase_payments spp
  JOIN stock_purchases sp ON sp.id = spp.purchase_id
  WHERE sp.brand = p_brand::brand
    AND spp.paid_at >= v_tx_start
    AND spp.paid_at < v_tx_end;

  SELECT COALESCE(jsonb_agg(row_to_json(sub.*) ORDER BY sub.total DESC), '[]'::jsonb)
  INTO v_purchases_by_method
  FROM (
    SELECT
      spp.payment_type,
      COALESCE(SUM(spp.amount), 0) AS total,
      COUNT(*) AS count
    FROM stock_purchase_payments spp
    JOIN stock_purchases sp ON sp.id = spp.purchase_id
    WHERE sp.brand = p_brand::brand
      AND spp.paid_at >= v_tx_start
      AND spp.paid_at < v_tx_end
    GROUP BY spp.payment_type
  ) sub;

  -- 7. Cash flow — ALL drawer cash movements (register_cash_movements) in range,
  --    so a multi-day report (no single drawer to reconcile) still shows every
  --    drop / bank deposit / petty-cash / tip-out. Scoped by the session's brand;
  --    created_at is UTC like payment_transactions → tz-corrected boundaries.
  SELECT
    COALESCE(SUM(cm.amount) FILTER (WHERE cm.type = 'cash_in'), 0),
    COALESCE(SUM(cm.amount) FILTER (WHERE cm.type = 'cash_out'), 0)
  INTO v_cash_in_total, v_cash_out_total
  FROM register_cash_movements cm
  JOIN register_sessions rs ON rs.id = cm.register_session_id
  WHERE rs.brand = p_brand::brand
    AND cm.created_at >= v_tx_start
    AND cm.created_at < v_tx_end;

  SELECT COALESCE(jsonb_agg(row_to_json(sub.*) ORDER BY sub.type, sub.total DESC), '[]'::jsonb)
  INTO v_cash_flow_by_category
  FROM (
    SELECT
      cm.type,
      cm.reason_category::text AS reason_category,
      COALESCE(SUM(cm.amount), 0) AS total,
      COUNT(*) AS count
    FROM register_cash_movements cm
    JOIN register_sessions rs ON rs.id = cm.register_session_id
    WHERE rs.brand = p_brand::brand
      AND cm.created_at >= v_tx_start
      AND cm.created_at < v_tx_end
    GROUP BY cm.type, cm.reason_category
  ) sub;

  RETURN v_order_stats || v_tx_stats || v_deposit_stats || v_cancel_stats || v_invoice_stats
    || jsonb_build_object('ar_outstanding', v_ar_outstanding)
    || jsonb_build_object('delivered_count', v_delivered_count)
    || jsonb_build_object('by_payment_method', v_by_method)
    || jsonb_build_object('daily', v_daily)
    || jsonb_build_object('by_cashier', v_by_cashier)
    || jsonb_build_object('purchases', jsonb_build_object(
         'total_paid', v_purchases_total,
         'payment_count', v_purchases_count,
         'by_payment_method', v_purchases_by_method))
    || jsonb_build_object('cash_flow', jsonb_build_object(
         'cash_in_total', v_cash_in_total,
         'cash_out_total', v_cash_out_total,
         'by_category', v_cash_flow_by_category));
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

  -- FOR UPDATE serializes concurrent closes (two tabs / two devices). Without
  -- this, both transactions read status='open' simultaneously, both UPDATE,
  -- and both INSERT a close event — producing two close_events rows for the
  -- same logical close with conflicting numbers. With FOR UPDATE, the second
  -- waits for the first to commit, then sees status='closed' and errors out.
  SELECT * INTO v_session FROM register_sessions
    WHERE id = p_session_id AND status = 'open'
    FOR UPDATE;
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

  -- FOR UPDATE serializes concurrent cash-out checks. Without it, two parallel
  -- cash_out calls could both read the same drawer balance, both pass the
  -- sufficiency check, then both INSERT — overdrawing the drawer.
  SELECT * INTO v_session FROM register_sessions
    WHERE id = p_session_id AND status = 'open'
    FOR UPDATE;
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
    AND o.checkout_status <> 'draft'
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
      AND o.checkout_status <> 'draft'
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
  -- No approval gate (CLAUDE.md §4): a requested transfer is sent directly with
  -- whatever the source chooses to send (full / partial / none). Dispatch writes
  -- dispatched_qty per item straight from the send dialog.
  IF v_transfer.status != 'requested' THEN
    RAISE EXCEPTION 'Transfer % is not awaiting dispatch (current: %)', p_transfer_id, v_transfer.status;
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

    -- Reject a non-positive dispatch: a negative qty would ADD phantom stock to
    -- the source (stock = stock - (negative)), and a 0 dispatch is meaningless.
    -- Mirrors direct_send_transfer's positive-qty guard.
    IF v_dispatched_qty IS NULL OR v_dispatched_qty <= 0 THEN
      RAISE EXCEPTION 'Dispatched quantity must be positive (got %)', v_dispatched_qty;
    END IF;

    -- Update dispatched_qty on the transfer item
    UPDATE transfer_request_items
    SET dispatched_qty = v_dispatched_qty
    WHERE id = (v_item->>'id')::int AND transfer_request_id = p_transfer_id;

    -- Get the transfer item to know which table to deduct from. Constrain to
    -- THIS transfer so a foreign item id can't be loaded and have its stock
    -- debited under this transfer (matches receive_transfer's lookup).
    SELECT * INTO v_transfer_item FROM transfer_request_items
      WHERE id = (v_item->>'id')::int AND transfer_request_id = p_transfer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transfer item % does not belong to transfer %', v_item->>'id', p_transfer_id;
    END IF;

    -- Deduct from source location (with stock validation)
    IF v_transfer.direction = 'shop_to_workshop' THEN
      -- Source is shop
      IF v_transfer_item.fabric_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_transfer_item.fabric_id FOR UPDATE;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for fabric %: have %, need %', v_transfer_item.fabric_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE fabrics SET shop_stock = shop_stock - v_dispatched_qty WHERE id = v_transfer_item.fabric_id;
      ELSIF v_transfer_item.shelf_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_transfer_item.shelf_id FOR UPDATE;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for shelf item %: have %, need %', v_transfer_item.shelf_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE shelf SET shop_stock = shop_stock - v_dispatched_qty::int WHERE id = v_transfer_item.shelf_id;
      ELSIF v_transfer_item.accessory_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_transfer_item.accessory_id FOR UPDATE;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for accessory %: have %, need %', v_transfer_item.accessory_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE accessories SET shop_stock = shop_stock - v_dispatched_qty WHERE id = v_transfer_item.accessory_id;
      END IF;
    ELSE
      -- Source is workshop (workshop_to_shop)
      IF v_transfer_item.fabric_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_transfer_item.fabric_id FOR UPDATE;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient workshop stock for fabric %: have %, need %', v_transfer_item.fabric_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE fabrics SET workshop_stock = workshop_stock - v_dispatched_qty WHERE id = v_transfer_item.fabric_id;
      ELSIF v_transfer_item.shelf_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_transfer_item.shelf_id FOR UPDATE;
        IF v_current_stock < v_dispatched_qty THEN
          RAISE EXCEPTION 'Insufficient workshop stock for shelf item %: have %, need %', v_transfer_item.shelf_id, v_current_stock, v_dispatched_qty;
        END IF;
        UPDATE shelf SET workshop_stock = workshop_stock - v_dispatched_qty::int WHERE id = v_transfer_item.shelf_id;
      ELSIF v_transfer_item.accessory_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_transfer_item.accessory_id FOR UPDATE;
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

    -- Reject a non-positive receive. A negative received_qty would DESTROY
    -- destination stock (dest_stock + (negative)) while marking the item
    -- received. An explicit 0 has no legitimate meaning either: a not-received
    -- item is omitted from the batch (leaving it open for a later partial
    -- receive), whereas receiving 0 would close the item out and book the whole
    -- dispatched amount as lost. So reject <= 0.
    IF v_received_qty IS NULL OR v_received_qty <= 0 THEN
      RAISE EXCEPTION 'Received quantity must be positive (got %) for item %', v_received_qty, v_transfer_item.id;
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

    -- Log a `waste` movement annotating the missing portion at the SOURCE
    -- location. The source was ALREADY debited the full dispatched_qty at
    -- dispatch (transfer_out -dispatched). Booking another -missing here would
    -- DOUBLE-COUNT the loss in the ledger: the per-item sum of qty_delta would
    -- read more negative than the real physical change. So this row is a
    -- net-zero audit annotation: qty_delta = 0 keeps the ledger conserving
    -- (sum of qty_delta == net physical change). The lost quantity goes in
    -- annotated_qty so reports surface it under "Lost" exactly like redo scrap
    -- (the reports measure is ABS(qty_delta) + COALESCE(annotated_qty,0)),
    -- instead of hiding only in the notes. Direct INSERT so the auto-trigger
    -- (which fires on stock-column changes) doesn't double-log.
    IF v_missing_qty > 0 THEN
      INSERT INTO stock_movements (
        item_type, item_id, location, movement_type, qty_delta, annotated_qty,
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
        0, v_missing_qty,
        'transfer', p_transfer_id, p_received_by,
        'lost in transit',
        format('lost in transit: %s unit(s) dispatched but not received%s',
               v_missing_qty,
               CASE WHEN COALESCE(v_item->>'discrepancy_note', '') <> ''
                    THEN ' - ' || (v_item->>'discrepancy_note')
                    ELSE '' END)
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

-- approve_transfer / reject_transfer REMOVED — the transfer flow has no approval
-- gate (CLAUDE.md §4). A requested transfer is sent directly via dispatch_transfer
-- (full / partial / none), and a still-requested transfer is withdrawn by deleting
-- it (transfers:cancel). Dropped rather than left dead so no caller can resurrect
-- the old path. The 'approved'/'rejected' enum values + approved_qty/approved_at/
-- rejection_reason columns remain (Postgres can't drop an enum value cleanly) but
-- are now unreachable.
DROP FUNCTION IF EXISTS approve_transfer(integer, jsonb, uuid);
DROP FUNCTION IF EXISTS reject_transfer(integer, text, uuid);

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

DROP TRIGGER IF EXISTS garment_location_notification ON garments;
CREATE TRIGGER garment_location_notification
  AFTER UPDATE OF location ON garments
  FOR EACH ROW
  EXECUTE FUNCTION notify_garment_location_change();

-- 1a. Stamp the date a garment is received back at the showroom from the
-- workshop. Fires on the transit_to_shop → shop transition, which is exactly
-- the "mark as received" action on the receiving brova/final page. Re-stamps on
-- every return trip so the showroom view shows when the items currently on the
-- floor arrived. BEFORE so it writes NEW.shop_received_date in-row (no extra UPDATE).
CREATE OR REPLACE FUNCTION stamp_shop_received_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location = 'shop' AND OLD.location = 'transit_to_shop' THEN
    NEW.shop_received_date := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS garment_shop_received_stamp ON garments;
CREATE TRIGGER garment_shop_received_stamp
  BEFORE UPDATE OF location ON garments
  FOR EACH ROW
  EXECUTE FUNCTION stamp_shop_received_date();

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
      format('Garment %s (Order #%s) needs a full redo. Create replacement now', NEW.garment_id, v_order_display),
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

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
  --   dispatched                    → action by SOURCE (sender) → notify DESTINATION (requester)
  --   received / partially_received → action by DESTINATION (receiver) → notify SOURCE (sender)
  -- ('approved'/'rejected' are no longer produced — there is no approval gate.)
  IF NEW.status = 'dispatched' THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

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
CREATE OR REPLACE FUNCTION get_my_notifications(
  p_limit INTEGER DEFAULT 50,
  p_department TEXT DEFAULT NULL,
  p_offset INTEGER DEFAULT 0,
  p_brand TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_unread_only BOOLEAN DEFAULT FALSE
)
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
      -- server-side brand fence: never return a brand the caller can't access,
      -- regardless of the client-supplied p_brand (SPEC §1 per-brand isolation)
      AND (n.brand IS NULL OR can_access_brand(n.brand::text))
      AND (p_type IS NULL OR n.type::text = p_type)
      AND (NOT p_unread_only OR nr.read_at IS NULL)
      AND (
        (n.scope = 'department' AND n.department = COALESCE(p_department, get_my_department())::department)
        OR (n.scope = 'user' AND n.recipient_user_id = get_my_user_id())
      )
    ORDER BY n.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

-- Total count matching the same scope/type/unread filters as
-- get_my_notifications — for correct server-side pagination (hasMore) when a
-- type/unread filter is active (client-side filtering of one page is wrong).
CREATE OR REPLACE FUNCTION get_my_notifications_count(
  p_department TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_unread_only BOOLEAN DEFAULT FALSE,
  p_brand TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
  SELECT count(*)::integer
  FROM notifications n
  LEFT JOIN notification_reads nr
    ON nr.notification_id = n.id
    AND nr.user_id = get_my_user_id()
  WHERE n.expires_at > now()
    AND (p_brand IS NULL OR n.brand = p_brand::brand)
    AND (n.brand IS NULL OR can_access_brand(n.brand::text))
    AND (p_type IS NULL OR n.type::text = p_type)
    AND (NOT p_unread_only OR nr.read_at IS NULL)
    AND (
      (n.scope = 'department' AND n.department = COALESCE(p_department, get_my_department())::department)
      OR (n.scope = 'user' AND n.recipient_user_id = get_my_user_id())
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

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
    AND (n.brand IS NULL OR can_access_brand(n.brand::text))
    AND (
      (n.scope = 'department' AND n.department = COALESCE(p_department, get_my_department())::department)
      OR (n.scope = 'user' AND n.recipient_user_id = get_my_user_id())
    )
    AND NOT EXISTS (
      SELECT 1 FROM notification_reads nr
      WHERE nr.notification_id = n.id
        AND nr.user_id = get_my_user_id()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, extensions, pg_catalog;

-- Mark a single notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id INTEGER)
RETURNS void AS $$
BEGIN
  INSERT INTO notification_reads (notification_id, user_id)
  VALUES (p_notification_id, get_my_user_id())
  ON CONFLICT (notification_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

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
    AND (n.brand IS NULL OR can_access_brand(n.brand::text))
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

-- Cleanup expired notifications (housekeeping — call periodically)
CREATE OR REPLACE FUNCTION expire_old_notifications()
RETURNS void AS $$
BEGIN
  DELETE FROM notifications WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

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
                -- Labels MUST match the canonical ShowroomLabel set in utils.ts
                -- getShowroomStatus (the §2.8 oracle): the former awaiting_finals /
                -- partial_ready cases all collapse to ready_for_pickup — the x/y
                -- received count on the list carries the detail. Emitting the old
                -- labels here produced a gray no-op badge the UI couldn't render,
                -- filter, or check out.
                CASE
                    WHEN o.order_type::text = 'ALTERATION' AND g.has_shop_items THEN 'alteration_out'
                    WHEN o.order_type::text = 'ALTERATION' THEN NULL
                    WHEN NOT g.has_shop_items AND g.finals_in_transit THEN 'ready_for_pickup'
                    WHEN NOT g.has_shop_items THEN NULL
                    WHEN g.has_alteration_needing_work THEN 'alteration_in'
                    WHEN g.has_brova_awaiting_trial THEN 'brova_trial'
                    WHEN g.has_garment_needing_action THEN 'needs_action'
                    WHEN g.has_shop_brova AND g.finals_still_out THEN 'ready_for_pickup'
                    WHEN g.all_shop_items_done AND NOT g.garments_still_out THEN 'ready_for_pickup'
                    WHEN g.garments_still_out THEN 'ready_for_pickup'
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
                -- When the items currently at the showroom arrived back from the
                -- workshop. MAX over active shop garments = the most recent receive
                -- (e.g. a brova on a brova_trial row, the last final on a ready row).
                -- NULL while items are still in transit (not yet received).
                'shop_received_date', (
                    SELECT MAX(g.shop_received_date)
                    FROM garments g
                    WHERE g.order_id = p.id
                      AND g.location::text = 'shop'
                      AND g.piece_stage::text NOT IN ('completed', 'discarded')
                ),
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

DROP FUNCTION IF EXISTS get_completed_orders_page(INT, INT, INT);
CREATE OR REPLACE FUNCTION get_completed_orders_page(
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 20,
    p_days_back INT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_result JSONB;
    v_page_size INT := GREATEST(COALESCE(p_page_size, 20), 1);
    v_offset INT := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_page_size;
    v_search TEXT := NULLIF(LOWER(TRIM(COALESCE(p_search, ''))), '');
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
          AND (v_search IS NULL OR (
                 LOWER(COALESCE(c.name, '')) LIKE '%' || v_search || '%'
              OR LOWER(COALESCE(wo.invoice_number::text, '')) LIKE '%' || v_search || '%'
              OR REPLACE(COALESCE(c.phone, ''), ' ', '') LIKE '%' || REPLACE(v_search, ' ', '') || '%'
          ))
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
DROP FUNCTION IF EXISTS get_assigned_orders_page(TEXT, TEXT[], INT, INT);
CREATE OR REPLACE FUNCTION get_assigned_orders_page(
    p_tab TEXT DEFAULT 'all',
    p_chips TEXT[] DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 20,
    p_search TEXT DEFAULT NULL,
    p_sort TEXT DEFAULT NULL,
    p_brands TEXT[] DEFAULT NULL
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
    v_chip_overdue BOOLEAN  := 'overdue'  = ANY(v_chips);
    v_chip_brova BOOLEAN    := 'brova'    = ANY(v_chips);
    v_search TEXT := NULLIF(LOWER(TRIM(COALESCE(p_search, ''))), '');
    v_sort TEXT := CASE WHEN p_sort IN ('asc', 'desc') THEN p_sort ELSE NULL END;
    v_brands TEXT[] := CASE WHEN p_brands IS NULL OR cardinality(p_brands) = 0 THEN NULL ELSE p_brands END;
BEGIN
    WITH base AS (
        SELECT
            o.id                             AS order_id,
            o.brand::text                    AS brand,
            o.order_type::text               AS order_type,
            wo.linked_order_id               AS linked_order_id,
            -- Link-group key (§2.13): the primary's order id. Children carry the
            -- primary in linked_order_id; primary/unlinked rows fall back to own id.
            COALESCE(wo.linked_order_id, o.id) AS link_group_id,
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
    -- Chip counts reflect post-tab, pre-chip filter set (the full in-production
    -- set for tab='all'), so a chip badge shows the unnarrowed total.
    chip_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE any_express)     AS express_count,
            COUNT(*) FILTER (WHERE home_delivery)   AS delivery_count,
            COUNT(*) FILTER (WHERE any_soaking)     AS soaking_count,
            COUNT(*) FILTER (WHERE is_overdue)      AS overdue_count,
            COUNT(*) FILTER (WHERE has_any_brova)   AS brova_count
        FROM tab_filtered
    ),
    brand_counts AS (
        SELECT COALESCE(jsonb_object_agg(brand, cnt), '{}'::jsonb) AS brands
        FROM (
            SELECT brand, COUNT(*) AS cnt
            FROM tab_filtered
            WHERE brand IS NOT NULL
            GROUP BY brand
        ) b
    ),
    -- Chips + brand + search narrow the result set (not the chip counts above).
    chip_filtered AS (
        SELECT * FROM tab_filtered
        WHERE (NOT v_chip_express  OR any_express)
          AND (NOT v_chip_delivery OR home_delivery)
          AND (NOT v_chip_soaking  OR any_soaking)
          AND (NOT v_chip_overdue  OR is_overdue)
          AND (NOT v_chip_brova    OR has_any_brova)
          AND (v_brands IS NULL OR brand = ANY(v_brands))
          AND (v_search IS NULL OR (
                 LOWER(COALESCE(customer_name, '')) LIKE '%' || v_search || '%'
              OR LOWER(COALESCE(invoice_number::text, '')) LIKE '%' || v_search || '%'
              OR REPLACE(COALESCE(customer_phone, ''), ' ', '') LIKE '%' || REPLACE(v_search, ' ', '') || '%'
              OR order_id::text LIKE '%' || v_search || '%'
          ))
    ),
    ranked AS (
        SELECT cf.*,
            row_number() OVER (
                ORDER BY
                    -- Explicit delivery sort when requested; no-delivery rows sink.
                    CASE WHEN v_sort = 'asc'  THEN COALESCE(days_to_delivery, 2147483647) END ASC,
                    CASE WHEN v_sort = 'desc' THEN COALESCE(days_to_delivery, -2147483648) END DESC,
                    -- Default urgency ranking when no explicit sort.
                    CASE WHEN v_sort IS NULL THEN (is_overdue)::int END DESC,
                    CASE WHEN v_sort IS NULL THEN (any_express)::int END DESC,
                    CASE WHEN v_sort IS NULL THEN COALESCE(days_to_delivery, 999) END ASC,
                    order_id ASC
            ) AS rn
        FROM chip_filtered cf
    ),
    grouped AS (
        -- Pull linked-order siblings (§2.13) adjacent: a link group sorts to the
        -- position of its most-urgent (lowest-rn) member, members kept together
        -- and ordered by rn within the group. Unlinked orders are a group of one,
        -- so group_rank = rn and their position is unchanged.
        SELECT r.*,
            MIN(r.rn) OVER (PARTITION BY r.link_group_id) AS group_rank
        FROM ranked r
    ),
    page AS (
        SELECT * FROM grouped
        ORDER BY group_rank, link_group_id, rn
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
            p.group_rank,
            p.link_group_id,
            jsonb_build_object(
                'order_id',        p.order_id,
                'order_type',      p.order_type,
                'linked_order_id', p.linked_order_id,
                'link_group_id',   p.link_group_id,
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
        'data',             COALESCE((SELECT jsonb_agg(row_json ORDER BY group_rank, link_group_id, rn) FROM page_rows), '[]'::jsonb),
        'total_count',      (SELECT COUNT(*) FROM chip_filtered),
        'total_unfiltered', (SELECT COUNT(*) FROM tab_filtered),
        'chip_counts', jsonb_build_object(
            'express',  (SELECT express_count  FROM chip_counts),
            'delivery', (SELECT delivery_count FROM chip_counts),
            'soaking',  (SELECT soaking_count  FROM chip_counts),
            'overdue',  (SELECT overdue_count  FROM chip_counts),
            'brova',    (SELECT brova_count    FROM chip_counts),
            'brands',   (SELECT brands FROM brand_counts)
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
        -- WFA-final clause restricted to trip 1 to match the Parking page list
        -- (parking.tsx only lists waiting_for_acceptance finals at trip 1; a WFA
        -- final is always trip 1 in practice, so this is the same set — the
        -- restriction just keeps the badge count and the list from diverging).
        'parking',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND NOT in_production AND piece_stage::text <> 'discarded' AND (piece_stage::text <> 'waiting_for_acceptance' OR (garment_type::text = 'final' AND COALESCE(trip_number, 1) = 1))),
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

-- ── Suppliers (shared inventory reference; created/edited from the store
--    surfaces and inline during restock by inventory staff in both apps) ──
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT USING (is_active_user());

DROP POLICY IF EXISTS "suppliers_modify" ON suppliers;
CREATE POLICY "suppliers_modify" ON suppliers FOR ALL USING (is_active_user());

-- ── Stock movements (append-only ledger). Written only by the stamping
--    inventory RPCs (restock_item / adjust_stock / record_waste /
--    consume_for_order / transfers), which run SECURITY INVOKER, and read
--    directly by history/report screens. Append-only: no update/delete. ──
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_select" ON stock_movements;
CREATE POLICY "stock_movements_select" ON stock_movements FOR SELECT USING (
  is_active_user() AND (brand IS NULL OR can_access_brand(brand::text))
);

DROP POLICY IF EXISTS "stock_movements_insert" ON stock_movements;
CREATE POLICY "stock_movements_insert" ON stock_movements FOR INSERT WITH CHECK (is_active_user());

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
  v_brand brand;
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

  -- Attribute order-referenced movements (consumption/return) to the consuming
  -- brand so ERTH's fabric report can break usage down per brand (SPEC §1/§4).
  -- Non-order stock ops (restock/adjust/transfer/waste) carry no brand.
  IF _movement_setting('app.movement_ref_type') = 'order' AND v_ref_id IS NOT NULL THEN
    SELECT brand INTO v_brand FROM orders WHERE id = v_ref_id;
  END IF;

  INSERT INTO stock_movements (
    item_type, item_id, location, movement_type,
    qty_delta, qty_before, qty_after,
    ref_type, ref_id,
    supplier_id, unit_cost,
    reason, notes, image_url,
    brand,
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
    _movement_setting('app.movement_image_url'),
    v_brand,
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
    PERFORM _notify_low_stock_crossing('fabric', NEW.id, 'shop',
      OLD.shop_stock, NEW.shop_stock, NEW.low_stock_threshold);
  END IF;
  IF COALESCE(NEW.workshop_stock, 0) <> COALESCE(OLD.workshop_stock, 0) THEN
    PERFORM _log_stock_movement('fabric', NEW.id, 'workshop',
      OLD.workshop_stock, NEW.workshop_stock);
    PERFORM _notify_low_stock_crossing('fabric', NEW.id, 'workshop',
      OLD.workshop_stock, NEW.workshop_stock, NEW.low_stock_threshold);
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
    PERFORM _notify_low_stock_crossing('shelf', NEW.id, 'shop',
      OLD.shop_stock::numeric, NEW.shop_stock::numeric, NEW.low_stock_threshold::numeric);
  END IF;
  IF COALESCE(NEW.workshop_stock, 0) <> COALESCE(OLD.workshop_stock, 0) THEN
    PERFORM _log_stock_movement('shelf', NEW.id, 'workshop',
      OLD.workshop_stock::numeric, NEW.workshop_stock::numeric);
    PERFORM _notify_low_stock_crossing('shelf', NEW.id, 'workshop',
      OLD.workshop_stock::numeric, NEW.workshop_stock::numeric, NEW.low_stock_threshold::numeric);
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
    PERFORM _notify_low_stock_crossing('accessory', NEW.id, 'shop',
      OLD.shop_stock, NEW.shop_stock, NEW.low_stock_threshold);
  END IF;
  IF COALESCE(NEW.workshop_stock, 0) <> COALESCE(OLD.workshop_stock, 0) THEN
    PERFORM _log_stock_movement('accessory', NEW.id, 'workshop',
      OLD.workshop_stock, NEW.workshop_stock);
    PERFORM _notify_low_stock_crossing('accessory', NEW.id, 'workshop',
      OLD.workshop_stock, NEW.workshop_stock, NEW.low_stock_threshold);
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
DROP FUNCTION IF EXISTS restock_item(stock_item_type, integer, stock_location, numeric, integer, numeric, text, uuid, uuid);
CREATE OR REPLACE FUNCTION restock_item(
  p_item_type stock_item_type,
  p_item_id INT,
  p_location stock_location,
  p_qty NUMERIC,
  p_supplier_id INT DEFAULT NULL,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,    -- optional supplier-invoice photo
  p_user_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_new_qty NUMERIC;
  v_old_qty NUMERIC;
  v_old_avg NUMERIC;
  v_new_avg NUMERIC;
  v_is_purchase BOOLEAN;
  v_movement_id INT;
  v_total_cost NUMERIC;
  v_purchase_id INT;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not add stock twice.
  IF NOT idem_claim(p_idempotency_key, 'restock_item') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Restock quantity must be positive (got %)', p_qty;
  END IF;

  -- Fabric and shelf live only in shop stock — the workshop never holds them
  -- (SPEC §4). Reject any workshop-side mutation of them.
  IF p_item_type IN ('fabric', 'shelf') AND p_location <> 'shop' THEN
    RAISE EXCEPTION 'Fabric and shelf stock lives only at the shop — % cannot be restocked at the workshop (SPEC §4)', p_item_type;
  END IF;

  -- A shop fabric/shelf restock is a PURCHASE: it spends money, so it carries a
  -- required unit cost, maintains the item's weighted-average cost, and creates
  -- an unpaid payable for the cashier (SPEC §3 cashier / §4 cost basis).
  -- Accessories are out of scope (workshop-owned, no cashier) — they keep the
  -- old optional-cost, no-payable behaviour.
  v_is_purchase := (p_item_type IN ('fabric', 'shelf') AND p_location = 'shop');
  IF v_is_purchase AND p_unit_cost IS NULL THEN
    RAISE EXCEPTION 'Unit cost is required when restocking shop % — it creates a cashier payable (SPEC §3/§4)', p_item_type;
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
  PERFORM set_config('app.movement_image_url', COALESCE(p_image_url, ''), true);

  IF p_item_type = 'fabric' THEN
    IF p_location = 'shop' THEN
      -- WAC: read prior qty+cost under lock, then blend in this delivery.
      -- new_avg = (old_qty·old_avg + qty·unit_cost) / (old_qty + qty); seeds to
      -- unit_cost when there's no prior costed stock (old_avg NULL or old_qty<=0).
      SELECT COALESCE(shop_stock, 0), avg_cost INTO v_old_qty, v_old_avg
        FROM fabrics WHERE id = p_item_id FOR UPDATE;
      v_new_avg := CASE
        WHEN v_old_qty <= 0 OR v_old_avg IS NULL THEN p_unit_cost
        ELSE (v_old_qty * v_old_avg + p_qty * p_unit_cost) / (v_old_qty + p_qty)
      END;
      UPDATE fabrics SET shop_stock = COALESCE(shop_stock, 0) + p_qty, avg_cost = v_new_avg
        WHERE id = p_item_id RETURNING shop_stock INTO v_new_qty;
    ELSE
      UPDATE fabrics SET workshop_stock = COALESCE(workshop_stock, 0) + p_qty
        WHERE id = p_item_id RETURNING workshop_stock INTO v_new_qty;
    END IF;
  ELSIF p_item_type = 'shelf' THEN
    IF p_location = 'shop' THEN
      SELECT COALESCE(shop_stock, 0), avg_cost INTO v_old_qty, v_old_avg
        FROM shelf WHERE id = p_item_id FOR UPDATE;
      v_new_avg := CASE
        WHEN v_old_qty <= 0 OR v_old_avg IS NULL THEN p_unit_cost
        ELSE (v_old_qty * v_old_avg + p_qty * p_unit_cost) / (v_old_qty + p_qty)
      END;
      UPDATE shelf SET shop_stock = COALESCE(shop_stock, 0) + p_qty::int, avg_cost = v_new_avg
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

  -- Don't let the invoice photo leak onto a later movement in this transaction.
  PERFORM set_config('app.movement_image_url', '', true);

  -- Create the unpaid payable for the cashier (SPEC §3). Linked to the restock
  -- movement just logged by the stock-change trigger: within this read-committed
  -- transaction only our own just-inserted row is visible, so the latest matching
  -- restock row is reliably ours. total_cost is frozen here (qty × unit_cost).
  IF v_is_purchase THEN
    SELECT id INTO v_movement_id
      FROM stock_movements
      WHERE item_type = p_item_type AND item_id = p_item_id
        AND location = p_location AND movement_type = 'restock'
      ORDER BY id DESC LIMIT 1;

    v_total_cost := ROUND(p_qty * p_unit_cost, 3);

    INSERT INTO stock_purchases (
      item_type, item_id, location, brand, qty, unit_cost, total_cost,
      supplier_id, invoice_image_url, stock_movement_id, notes, created_by,
      idempotency_key
    ) VALUES (
      p_item_type, p_item_id, p_location, 'ERTH', p_qty, p_unit_cost, v_total_cost,
      p_supplier_id, p_image_url, v_movement_id, p_notes, p_user_id,
      p_idempotency_key
    ) RETURNING id INTO v_purchase_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'new_stock', v_new_qty,
    'avg_cost', v_new_avg,
    'purchase_id', v_purchase_id,
    'total_cost', v_total_cost
  );
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- STOCK-PURCHASE PAYABLES (SPEC §3 cashier "Stock-purchase settlement")
-- A costed shop fabric/shelf restock creates an unpaid stock_purchases row
-- (above, in restock_item). The cashier settles it from the Purchases queue:
-- each settlement is a stock_purchase_payments row, summed back into the
-- payable by the trigger below (mirrors orders.paid). A CASH settlement also
-- posts a register_cash_movements cash_out so it reconciles at EOD.
-- ═══════════════════════════════════════════════════════════════════════

-- Roll the payment ledger up into the payable. status/amount_paid are owned
-- here and never written directly — exactly like sync_order_paid_from_transactions.
CREATE OR REPLACE FUNCTION sync_stock_purchase_paid()
RETURNS TRIGGER AS $$
DECLARE
  v_purchase_id INT;
  v_paid NUMERIC;
  v_total NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_purchase_id := OLD.purchase_id;
  ELSE
    v_purchase_id := NEW.purchase_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM stock_purchase_payments WHERE purchase_id = v_purchase_id;

  SELECT total_cost INTO v_total FROM stock_purchases WHERE id = v_purchase_id;

  UPDATE stock_purchases SET
    amount_paid = v_paid,
    status = CASE
      WHEN v_paid <= 0 THEN 'unpaid'::stock_purchase_status
      WHEN v_paid >= v_total THEN 'paid'::stock_purchase_status
      ELSE 'partially_paid'::stock_purchase_status
    END
  WHERE id = v_purchase_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_purchase_payments_sync_trigger ON stock_purchase_payments;
CREATE TRIGGER stock_purchase_payments_sync_trigger
AFTER INSERT OR UPDATE OR DELETE ON stock_purchase_payments
FOR EACH ROW
EXECUTE FUNCTION sync_stock_purchase_paid();

-- RPC: settle (fully or partially) a stock purchase.
-- Cash settlements require an open register and post a cash_out drawer movement
-- (so EOD reconciliation sees the payout); non-cash settlements (knet/link/bank)
-- just record the payment. Idempotent; no overpayment past the remaining balance.
DROP FUNCTION IF EXISTS pay_stock_purchase(INT, NUMERIC, TEXT, INT, TEXT, TEXT, UUID, UUID);
CREATE OR REPLACE FUNCTION pay_stock_purchase(
  p_purchase_id INT,
  p_amount NUMERIC,
  p_payment_type TEXT,
  p_register_session_id INT DEFAULT NULL,
  p_payment_ref_no TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_purchase RECORD;
  v_remaining NUMERIC;
  v_session RECORD;
  v_drawer_balance NUMERIC;
  v_cash_payments NUMERIC;
  v_cash_refunds NUMERIC;
  v_cash_in NUMERIC;
  v_cash_out NUMERIC;
  v_cash_movement_id INT;
  v_result JSONB;
BEGIN
  -- Idempotency: a lost-response replay must not record a duplicate settlement.
  IF NOT idem_claim(p_idempotency_key, 'pay_stock_purchase') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  PERFORM assert_active_user();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive (got %)', p_amount;
  END IF;

  -- Lock the payable so two concurrent settlements can't both pass the
  -- remaining-balance check and overpay.
  SELECT * INTO v_purchase FROM stock_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock purchase % not found', p_purchase_id;
  END IF;

  IF NOT can_access_brand(v_purchase.brand::text) THEN
    RAISE EXCEPTION 'You do not have access to this purchase';
  END IF;

  v_remaining := v_purchase.total_cost - v_purchase.amount_paid;
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Payment (%) exceeds the remaining balance (%) on purchase %', p_amount, v_remaining, p_purchase_id;
  END IF;

  -- Cash leaves the drawer → must go through an open register and reconcile at EOD.
  IF p_payment_type = 'cash' THEN
    IF p_register_session_id IS NULL THEN
      RAISE EXCEPTION 'A cash purchase payment requires an open register session';
    END IF;

    SELECT * INTO v_session FROM register_sessions
      WHERE id = p_register_session_id AND status = 'open'
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Register session not found or not open';
    END IF;
    IF NOT can_access_brand(v_session.brand::text) THEN
      RAISE EXCEPTION 'You do not have access to this register session';
    END IF;

    -- Drawer sufficiency (same identity as add_cash_movement's cash_out check).
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'payment'), 0),
      COALESCE(SUM(ABS(amount)) FILTER (WHERE transaction_type = 'refund'), 0)
    INTO v_cash_payments, v_cash_refunds
    FROM payment_transactions
    WHERE register_session_id = p_register_session_id AND payment_type = 'cash';

    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type = 'cash_in'), 0),
      COALESCE(SUM(amount) FILTER (WHERE type = 'cash_out'), 0)
    INTO v_cash_in, v_cash_out
    FROM register_cash_movements
    WHERE register_session_id = p_register_session_id;

    v_drawer_balance := v_session.opening_float + v_cash_payments - v_cash_refunds + v_cash_in - v_cash_out;
    IF p_amount > v_drawer_balance THEN
      RAISE EXCEPTION 'Cash purchase payment (%) exceeds drawer balance (%)', p_amount, v_drawer_balance;
    END IF;

    -- petty_cash = out-of-drawer business expense (no dedicated enum value; the
    -- reason text + the linked stock_purchase_payments row carry the detail).
    INSERT INTO register_cash_movements (register_session_id, type, reason_category, amount, reason, performed_by)
    VALUES (
      p_register_session_id, 'cash_out', 'petty_cash', p_amount,
      'Stock purchase #' || p_purchase_id || COALESCE(': ' || p_note, ''),
      p_user_id
    ) RETURNING id INTO v_cash_movement_id;
  END IF;

  INSERT INTO stock_purchase_payments (
    purchase_id, amount, payment_type, register_session_id,
    register_cash_movement_id, payment_ref_no, note, paid_by, idempotency_key
  ) VALUES (
    p_purchase_id, p_amount, p_payment_type::purchase_payment_type, p_register_session_id,
    v_cash_movement_id, p_payment_ref_no, p_note, p_user_id, p_idempotency_key
  );
  -- The sync trigger has now updated amount_paid/status.

  SELECT amount_paid, total_cost, status INTO v_purchase.amount_paid, v_purchase.total_cost, v_purchase.status
  FROM stock_purchases WHERE id = p_purchase_id;

  v_result := jsonb_build_object(
    'purchase_id', p_purchase_id,
    'amount_paid', v_purchase.amount_paid,
    'total_cost', v_purchase.total_cost,
    'status', v_purchase.status,
    'cash_movement_id', v_cash_movement_id
  );
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- RPC: list stock purchases for the cashier queue / history. p_filter:
-- 'open' (unpaid + partially_paid, the settlement queue), 'paid', or 'all'.
-- Resolves each item's display name from its source table.
DROP FUNCTION IF EXISTS get_stock_purchases(TEXT, TEXT, INT);
CREATE OR REPLACE FUNCTION get_stock_purchases(
  p_brand TEXT DEFAULT NULL,
  p_filter TEXT DEFAULT 'open',
  p_limit INT DEFAULT 200
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM assert_active_user();

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      sp.id,
      sp.item_type,
      sp.item_id,
      CASE sp.item_type
        WHEN 'fabric'    THEN (SELECT name FROM fabrics WHERE id = sp.item_id)
        WHEN 'shelf'     THEN (SELECT type FROM shelf WHERE id = sp.item_id)
        WHEN 'accessory' THEN (SELECT name FROM accessories WHERE id = sp.item_id)
      END AS item_name,
      sp.brand,
      sp.qty,
      sp.unit_cost,
      sp.total_cost,
      sp.amount_paid,
      (sp.total_cost - sp.amount_paid) AS remaining,
      sp.status,
      sp.supplier_id,
      s.name AS supplier_name,
      sp.invoice_image_url,
      sp.notes,
      sp.created_at,
      cu.name AS created_by_name
    FROM stock_purchases sp
    LEFT JOIN suppliers s ON s.id = sp.supplier_id
    LEFT JOIN users cu ON cu.id = sp.created_by
    WHERE can_access_brand(sp.brand::text)
      AND (p_brand IS NULL OR sp.brand = p_brand::brand)
      AND (
        (p_filter = 'open' AND sp.status IN ('unpaid', 'partially_paid'))
        OR (p_filter = 'paid' AND sp.status = 'paid')
        OR (p_filter = 'all')
      )
    ORDER BY sp.created_at DESC
    LIMIT p_limit
  ) t;

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

  -- Fabric and shelf live only in shop stock — the workshop never holds them
  -- (SPEC §4). Reject any workshop-side mutation of them.
  IF p_item_type IN ('fabric', 'shelf') AND p_location <> 'shop' THEN
    RAISE EXCEPTION 'Fabric and shelf stock lives only at the shop — % cannot be adjusted at the workshop (SPEC §4)', p_item_type;
  END IF;

  PERFORM set_config('app.movement_type', 'adjustment', true);
  PERFORM set_config('app.movement_ref_type', 'adjustment', true);
  PERFORM set_config('app.movement_ref_id', '', true);
  PERFORM set_config('app.movement_user_id', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('app.movement_supplier_id', '', true);
  PERFORM set_config('app.movement_unit_cost', '', true);
  PERFORM set_config('app.movement_reason', p_reason, true);
  PERFORM set_config('app.movement_notes', COALESCE(p_notes, ''), true);
  PERFORM set_config('app.movement_image_url', '', true);

  -- FOR UPDATE serializes the read→absolute-write so a restock/consume/waste
  -- committed by a concurrent txn between this SELECT and UPDATE isn't silently
  -- clobbered by the absolute set (lost stock). Absolute-set semantics unchanged.
  IF p_item_type = 'fabric' THEN
    IF p_location = 'shop' THEN
      SELECT shop_stock INTO v_old_qty FROM fabrics WHERE id = p_item_id FOR UPDATE;
      UPDATE fabrics SET shop_stock = p_new_qty WHERE id = p_item_id;
    ELSE
      SELECT workshop_stock INTO v_old_qty FROM fabrics WHERE id = p_item_id FOR UPDATE;
      UPDATE fabrics SET workshop_stock = p_new_qty WHERE id = p_item_id;
    END IF;
  ELSIF p_item_type = 'shelf' THEN
    IF p_location = 'shop' THEN
      SELECT shop_stock INTO v_old_qty FROM shelf WHERE id = p_item_id FOR UPDATE;
      UPDATE shelf SET shop_stock = p_new_qty::int WHERE id = p_item_id;
    ELSE
      SELECT workshop_stock INTO v_old_qty FROM shelf WHERE id = p_item_id FOR UPDATE;
      UPDATE shelf SET workshop_stock = p_new_qty::int WHERE id = p_item_id;
    END IF;
  ELSIF p_item_type = 'accessory' THEN
    IF p_location = 'shop' THEN
      SELECT shop_stock INTO v_old_qty FROM accessories WHERE id = p_item_id FOR UPDATE;
      UPDATE accessories SET shop_stock = p_new_qty WHERE id = p_item_id;
    ELSE
      SELECT workshop_stock INTO v_old_qty FROM accessories WHERE id = p_item_id FOR UPDATE;
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
  PERFORM set_config('app.movement_image_url', '', true);

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
    'count', COALESCE(SUM(cnt), 0),
    -- True signed net stock change for the period: SUM(qty_delta) across every
    -- type (restock +, consumption/transfer_out/waste -, return/transfer_in +,
    -- adjustment ±). Net-zero annotations (qty_delta=0) don't move it. This is
    -- only meaningful within ONE unit, so the reports scope by item_type.
    'net', COALESCE(SUM(net_delta), 0)
  )
  INTO v_result
  FROM (
    SELECT movement_type::text,
           -- Net-zero waste annotations carry their amount in annotated_qty
           -- (qty_delta=0); add it so redo scrap surfaces without double-counting
           -- real wastes (which have annotated_qty NULL).
           SUM(ABS(qty_delta) + COALESCE(annotated_qty, 0)) AS total,
           SUM(qty_delta) AS net_delta,
           COUNT(*) AS cnt
    FROM stock_movements
    WHERE created_at >= p_from AND created_at < p_to
      AND (p_item_type IS NULL OR item_type = p_item_type)
      AND (p_location IS NULL OR location = p_location)
    GROUP BY movement_type
  ) AS t;

  RETURN COALESCE(v_result, jsonb_build_object('totals', '{}'::jsonb, 'count', 0, 'net', 0));
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── Top-N items by movement type ────────────────────────────────────
-- p_location scopes to one side (§4: each side is blind to the other) and
-- p_item_type scopes to fabric/shelf/accessory so per-unit reports never mix
-- meters with pieces; NULL on either means no filter. Each added parameter
-- changes the signature, so DROP every prior overload before re-creating
-- (CREATE OR REPLACE cannot add a parameter in place).
DROP FUNCTION IF EXISTS get_top_items_by_movement(stock_movement_type, timestamptz, timestamptz, int);
DROP FUNCTION IF EXISTS get_top_items_by_movement(stock_movement_type, timestamptz, timestamptz, int, stock_location);
CREATE OR REPLACE FUNCTION get_top_items_by_movement(
  p_movement_type stock_movement_type,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_limit INT DEFAULT 10,
  p_location stock_location DEFAULT NULL,
  p_item_type stock_item_type DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH sums AS (
    SELECT item_type, item_id,
           SUM(ABS(qty_delta) + COALESCE(annotated_qty, 0)) AS total
    FROM stock_movements
    WHERE created_at >= p_from AND created_at < p_to
      AND movement_type = p_movement_type
      AND (p_location IS NULL OR location = p_location)
      AND (p_item_type IS NULL OR item_type = p_item_type)
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

-- ─── Waste broken down by root_cause (Q11 by-root-cause card) ─────────────
-- Groups `waste` movements in [from, to) by root_cause (NULL → 'unattributed').
-- Uses the same ABS(qty_delta)+annotated_qty measure as the aggregates so redo
-- net-zero scrap annotations surface with their length and cost impact.
CREATE OR REPLACE FUNCTION get_waste_by_root_cause(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_object_agg(rc, payload), '{}'::jsonb)
  FROM (
    SELECT COALESCE(root_cause::text, 'unattributed') AS rc,
           jsonb_build_object(
             'qty',  SUM(ABS(qty_delta) + COALESCE(annotated_qty, 0)),
             'cost', SUM((ABS(qty_delta) + COALESCE(annotated_qty, 0)) * COALESCE(unit_cost, 0))
           ) AS payload
    FROM stock_movements
    WHERE movement_type = 'waste'
      AND created_at >= p_from AND created_at < p_to
    GROUP BY COALESCE(root_cause::text, 'unattributed')
  ) AS t;
$$ LANGUAGE sql STABLE;

-- ─── Finals correctly parked while a replacement brova is in flight ───────
-- CLAUDE.md §2.8 workshop label "Finals waiting on replacement brova": flag-only.
-- Per order, count finals still at waiting_for_acceptance where the order has a
-- brova that was discarded (Reject-Redo) and whose replacement row is still in
-- flight. Distinct from the §2.6 last-brova-gone auto-release (here a brova
-- lineage still exists to act on). Returns only orders with count > 0.
CREATE OR REPLACE FUNCTION finals_waiting_on_replacement_brova(
  p_order_id INT DEFAULT NULL
)
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'order_id', order_id,
           'finals_waiting', finals_waiting
         )), '[]'::jsonb)
  FROM (
    SELECT f.order_id, COUNT(*) AS finals_waiting
    FROM garments f
    WHERE f.garment_type = 'final'
      AND f.piece_stage = 'waiting_for_acceptance'
      AND (p_order_id IS NULL OR f.order_id = p_order_id)
      AND EXISTS (
        SELECT 1
        FROM garments b
        JOIN garments r ON r.id = b.replaced_by_garment_id
        WHERE b.order_id = f.order_id
          AND b.garment_type = 'brova'
          AND b.piece_stage = 'discarded'
          AND b.replaced_by_garment_id IS NOT NULL
          AND r.piece_stage NOT IN ('completed', 'discarded')
      )
    GROUP BY f.order_id
  ) AS t;
$$ LANGUAGE sql STABLE;

-- ════════════════════════════════════════════════════════════════════════
-- ROOT-CAUSE TAXONOMY — shared attribution vocabulary  (CLAUDE.md §2.9)
-- ════════════════════════════════════════════════════════════════════════
-- The canonical "who is responsible / why" enum, settled ahead of Groups A/C/D
-- (redo+scrap, repeated-returns investigation, performance attribution) so all
-- three speak one language. schema.ts mirrors this for TS types. Created here
-- (not via db:push) so the type exists before any column references it.
DO $$ BEGIN
  CREATE TYPE root_cause AS ENUM (
    'production_error', 'qc_escape', 'showroom_error',
    'customer_change', 'material_defect', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Responsible party is a deterministic derivation of root_cause (never stored
-- separately) — performance attribution (Q14) keys off this single mapping.
-- 'other' → NULL (unattributed). Distinct from the §2.5 measurement-reason
-- gates and the §4 WASTE_REASONS physical-reason axis (see §2.9).
CREATE OR REPLACE FUNCTION root_cause_responsible_party(p_root_cause root_cause)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_root_cause
    WHEN 'production_error' THEN 'production'
    WHEN 'qc_escape'        THEN 'qc'
    WHEN 'showroom_error'   THEN 'showroom'
    WHEN 'customer_change'  THEN 'customer'
    WHEN 'material_defect'  THEN 'supplier'
    ELSE NULL
  END;
$$;

-- ─── Redo performance impact by responsible party (Q14) ──────────────────
-- CLAUDE.md §6 "Redo performance impact": charge a redo to the responsible
-- party derived from its root_cause (§2.9), never a blanket factory penalty.
-- Source = the redo material-waste annotations create_replacement_garment
-- stamps on the scrapped original (movement_type='waste', reason='redo' — the
-- unique tag that isolates redo scrap from §4 Damage/Waste, which uses the
-- WASTE_REASONS categories and never sets root_cause). One annotation per
-- company-fabric redo; net-zero, length in annotated_qty. Returns an array
-- (one row per root_cause) with the derived party so the frontend never
-- re-implements the value→party mapping (§2.9: it lives in this one SQL helper).
-- Customer (OUT) fabric redos write no annotation → no material cost, by design.
-- Defined AFTER root_cause_responsible_party (a LANGUAGE sql function's body is
-- validated at CREATE time, so the helper it calls must already exist).
CREATE OR REPLACE FUNCTION get_redo_impact(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'root_cause',  rc,
           'party',       root_cause_responsible_party(rc),
           'redo_count',  cnt,
           'waste_qty',   qty,
           'waste_cost',  cost
         ) ORDER BY cost DESC, cnt DESC), '[]'::jsonb)
  FROM (
    SELECT root_cause AS rc,
           COUNT(*) AS cnt,
           SUM(ABS(qty_delta) + COALESCE(annotated_qty, 0)) AS qty,
           SUM((ABS(qty_delta) + COALESCE(annotated_qty, 0)) * COALESCE(unit_cost, 0)) AS cost
    FROM stock_movements
    WHERE movement_type = 'waste'
      AND reason = 'redo'
      AND created_at >= p_from AND created_at < p_to
    GROUP BY root_cause
  ) AS t;
$$ LANGUAGE sql STABLE;

-- ─── QC quality analytics (Q2) ───────────────────────────────────────────
-- CLAUDE.md §6 "QC analytics": use the 1–5 quality ratings analytically (the
-- pass/fail rule — any aspect < 4 → non-conformity → back to production — is
-- unchanged; this only READS the numbers). Flattens every qc_attempt in
-- trip_history whose `date` is in [from, to) and returns: totals
-- (attempts/pass/fail), per-aspect avg + fail count (defect-category breakdown),
-- measurement- and option-defect counts (the same analytical lens extended to
-- spec defects), defect origin by return_stage, inspector-attributed defect
-- blame by team/worker (attributed_defects, §6), and a per-day quality trend.
-- Ranged on the attempt's own date (set by the app's buildQcAttempt) so a
-- garment still in production counts the moment it was inspected.
CREATE OR REPLACE FUNCTION get_qc_analytics(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- jsonb_typeof guards: real rows may hold a JSON `null` or a non-array scalar
  -- in trip_history / qc_attempts / quality_ratings / the failed-key arrays;
  -- jsonb_array_elements / jsonb_each_text RAISE on those (COALESCE only catches
  -- SQL NULL, not the JSON scalar 'null'). Normalize each to [] / {} here so the
  -- downstream unnests are total.
  WITH attempts AS (
    SELECT
      att->>'result'             AS result,
      (att->>'date')::timestamptz AS adate,
      CASE WHEN jsonb_typeof(att->'quality_ratings')     = 'object' THEN att->'quality_ratings'     ELSE '{}'::jsonb END AS ratings,
      CASE WHEN jsonb_typeof(att->'failed_measurements') = 'array'  THEN att->'failed_measurements' ELSE '[]'::jsonb END AS failed_meas,
      CASE WHEN jsonb_typeof(att->'failed_options')      = 'array'  THEN att->'failed_options'      ELSE '[]'::jsonb END AS failed_opts,
      CASE WHEN jsonb_typeof(att->'return_stages')       = 'array'  THEN att->'return_stages'       ELSE '[]'::jsonb END AS return_stages,
      CASE WHEN jsonb_typeof(att->'defect_attributions') = 'array'  THEN att->'defect_attributions' ELSE '[]'::jsonb END AS attributions
    FROM garments g
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(g.trip_history) = 'array' THEN g.trip_history ELSE '[]'::jsonb END
    ) AS trip
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(trip->'qc_attempts') = 'array' THEN trip->'qc_attempts' ELSE '[]'::jsonb END
    ) AS att
    WHERE att->>'date' IS NOT NULL
      AND (att->>'date')::timestamptz >= p_from
      AND (att->>'date')::timestamptz <  p_to
  )
  SELECT jsonb_build_object(
    'total_attempts', (SELECT count(*) FROM attempts),
    'pass',           (SELECT count(*) FROM attempts WHERE result = 'pass'),
    'fail',           (SELECT count(*) FROM attempts WHERE result = 'fail'),
    'by_aspect', COALESCE((
      SELECT jsonb_object_agg(aspect, payload) FROM (
        SELECT kv.key AS aspect,
               jsonb_build_object(
                 'avg',   round(avg(kv.value::numeric), 2),
                 'rated', count(*),
                 'fails', count(*) FILTER (WHERE kv.value::numeric < 4)
               ) AS payload
        FROM attempts a
        CROSS JOIN LATERAL jsonb_each_text(COALESCE(a.ratings, '{}'::jsonb)) AS kv
        GROUP BY kv.key
      ) t
    ), '{}'::jsonb),
    'measurement_defects', COALESCE((
      SELECT jsonb_object_agg(field, cnt) FROM (
        SELECT m.value AS field, count(*) AS cnt
        FROM attempts a CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a.failed_meas, '[]'::jsonb)) AS m(value)
        GROUP BY m.value
      ) t
    ), '{}'::jsonb),
    'option_defects', COALESCE((
      SELECT jsonb_object_agg(opt, cnt) FROM (
        SELECT o.value AS opt, count(*) AS cnt
        FROM attempts a CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a.failed_opts, '[]'::jsonb)) AS o(value)
        GROUP BY o.value
      ) t
    ), '{}'::jsonb),
    'stage_defects', COALESCE((
      SELECT jsonb_object_agg(stage, cnt) FROM (
        SELECT s.value AS stage, count(*) AS cnt
        FROM attempts a CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(a.return_stages, '[]'::jsonb)) AS s(value)
        GROUP BY s.value
      ) t
    ), '{}'::jsonb),
    -- Inspector-attributed defect blame (§6): one row per (stage, scope,
    -- responsible) with a total count and a measurement/option/quality split.
    -- responsible JSON-null or '' buckets as '(unassigned)'. Distinct from
    -- stage_defects above (which is routing — where the piece was sent back).
    'attributed_defects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'stage',       stage,
               'scope',       scope,
               'responsible', responsible,
               'count',       cnt,
               'by_category', jsonb_build_object(
                 'measurement', meas_cnt,
                 'option',      opt_cnt,
                 'quality',     qual_cnt
               )
             ) ORDER BY cnt DESC, responsible) FROM (
        SELECT da->>'stage' AS stage,
               da->>'scope' AS scope,
               COALESCE(NULLIF(da->>'responsible', ''), '(unassigned)') AS responsible,
               count(*) AS cnt,
               count(*) FILTER (WHERE da->>'category' = 'measurement') AS meas_cnt,
               count(*) FILTER (WHERE da->>'category' = 'option')      AS opt_cnt,
               count(*) FILTER (WHERE da->>'category' = 'quality')     AS qual_cnt
        FROM attempts a
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.attributions, '[]'::jsonb)) AS da
        GROUP BY 1, 2, 3
      ) t
    ), '[]'::jsonb),
    'trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', cnt.d, 'avg', sc.avg_score, 'attempts', cnt.n) ORDER BY cnt.d)
      FROM (SELECT to_char(adate, 'YYYY-MM-DD') AS d, count(*) AS n FROM attempts GROUP BY 1) cnt
      LEFT JOIN (
        SELECT to_char(a.adate, 'YYYY-MM-DD') AS d, round(avg(kv.value::numeric), 2) AS avg_score
        FROM attempts a CROSS JOIN LATERAL jsonb_each_text(COALESCE(a.ratings, '{}'::jsonb)) AS kv
        GROUP BY 1
      ) sc ON sc.d = cnt.d
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ════════════════════════════════════════════════════════════════════════
-- GROUP C — Repeated-returns investigation: REMOVED  (CLAUDE.md §2.10)
-- ════════════════════════════════════════════════════════════════════════
-- The auto-hold is gone: no garment is ever flagged, dropped from production, or
-- blocked from restarting on repeated returns, and there is no manager-resolution
-- RPC. The DROPs below clear the trigger + functions from a live DB on re-run.
-- The needs_investigation column and the garment_investigations table are kept
-- vestigial (no writer; column never set true) — no destructive drop, matching
-- the redo_priority precedent. Investigation/root-cause handling is being
-- redesigned elsewhere (SPEC §2.10).
DROP TRIGGER IF EXISTS trg_garment_investigation_gate ON garments;
DROP FUNCTION IF EXISTS _garment_investigation_gate();
DROP FUNCTION IF EXISTS record_investigation(uuid, root_cause, text, text, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS _count_qc_fails(jsonb);

-- ════════════════════════════════════════════════════════════════════════
-- GROUP A — Redo lifecycle, material & waste  (CLAUDE.md §2.5/§4/§6)
-- ════════════════════════════════════════════════════════════════════════
-- The Group A enum TYPES (redo_priority, redo_parked_reason) and the garments /
-- stock_movements COLUMNS are created up at the 11f-types block (before
-- create_replacement_garment and the report RPCs reference them within this
-- single batch). The RPCs (create_replacement_garment, resume_parked_redo,
-- get_waste_by_root_cause, finals_waiting_on_replacement_brova) live alongside
-- their related code above.

-- ════════════════════════════════════════════════════════════════════════
-- GROUP E — low-stock alerts, damage/waste, stocktake  (CLAUDE.md §4)
-- ════════════════════════════════════════════════════════════════════════
-- Schema additions are kept here (idempotent) so a single db:triggers run
-- applies them; schema.ts mirrors these for TS types. ALTER TYPE ADD VALUE is
-- allowed inside this implicit transaction on PG12+ (the value is only used at
-- runtime, never during apply).
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'low_stock';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS image_url TEXT;

DO $$ BEGIN
  CREATE TYPE stocktake_status AS ENUM ('open', 'validated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stocktake_sessions (
  id           SERIAL PRIMARY KEY,
  side         stock_location NOT NULL,
  brand        brand NOT NULL DEFAULT 'ERTH',
  status       stocktake_status NOT NULL DEFAULT 'open',
  started_by   UUID REFERENCES users(id),
  started_at   TIMESTAMP NOT NULL DEFAULT now(),
  validated_by UUID REFERENCES users(id),
  validated_at TIMESTAMP,
  notes        TEXT
);
CREATE INDEX IF NOT EXISTS stocktake_sessions_side_status_idx ON stocktake_sessions(side, status);
CREATE INDEX IF NOT EXISTS stocktake_sessions_side_validated_idx ON stocktake_sessions(side, validated_at);

CREATE TABLE IF NOT EXISTS stocktake_counts (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES stocktake_sessions(id) ON DELETE CASCADE,
  item_type   stock_item_type NOT NULL,
  item_id     INTEGER NOT NULL,
  system_qty  NUMERIC(10,2),
  counted_qty NUMERIC(10,2),
  variance    NUMERIC(10,2),
  reason      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS stocktake_counts_session_item_idx ON stocktake_counts(session_id, item_type, item_id);

-- Reads are direct (SELECT policy); writes go only through the SECURITY DEFINER
-- RPCs below, so staff cannot bypass the manager-gated validate by writing the
-- table directly.
ALTER TABLE stocktake_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stocktake_sessions_select" ON stocktake_sessions;
CREATE POLICY "stocktake_sessions_select" ON stocktake_sessions FOR SELECT USING (is_active_user());

ALTER TABLE stocktake_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stocktake_counts_select" ON stocktake_counts;
CREATE POLICY "stocktake_counts_select" ON stocktake_counts FOR SELECT USING (is_active_user());

-- garment_investigations (CLAUDE.md §2.10): vestigial — the record_investigation
-- writer was removed with the auto-hold; kept readable, no writer (no destructive drop).
ALTER TABLE garment_investigations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "garment_investigations_select" ON garment_investigations;
CREATE POLICY "garment_investigations_select" ON garment_investigations FOR SELECT USING (is_active_user());

-- ─── Low-stock threshold + crossing notification ─────────────────────────
-- Per-item override else per-type default (must match LOW_STOCK_THRESHOLDS in
-- the apps' lib/inventory.ts).
CREATE OR REPLACE FUNCTION _resolve_low_stock_threshold(p_item_type stock_item_type, p_override NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  IF p_override IS NOT NULL AND p_override > 0 THEN
    RETURN p_override;
  END IF;
  RETURN CASE p_item_type
    WHEN 'fabric'    THEN 5
    WHEN 'shelf'     THEN 3
    WHEN 'accessory' THEN 10
    ELSE 0 END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Fire ONE low_stock notification when a side's own count crosses below its
-- threshold (falling edge only; staying-low does not re-fire). SECURITY DEFINER
-- so it can insert into notifications (RLS) from the plain audit trigger.
CREATE OR REPLACE FUNCTION _notify_low_stock_crossing(
  p_item_type stock_item_type, p_item_id INT, p_location stock_location,
  p_old NUMERIC, p_new NUMERIC, p_threshold_override NUMERIC
)
RETURNS VOID AS $$
DECLARE
  v_threshold NUMERIC := _resolve_low_stock_threshold(p_item_type, p_threshold_override);
  v_name TEXT;
BEGIN
  IF v_threshold <= 0 THEN RETURN; END IF;
  IF NOT (COALESCE(p_old, 0) >= v_threshold AND COALESCE(p_new, 0) < v_threshold) THEN
    RETURN;  -- not a falling-edge crossing
  END IF;

  v_name := CASE p_item_type
    WHEN 'fabric'    THEN (SELECT name FROM fabrics     WHERE id = p_item_id)
    WHEN 'shelf'     THEN (SELECT type FROM shelf       WHERE id = p_item_id)
    WHEN 'accessory' THEN (SELECT name FROM accessories WHERE id = p_item_id)
  END;

  INSERT INTO notifications (department, brand, type, title, body, metadata, expires_at)
  VALUES (
    p_location::text::department,
    'ERTH',
    'low_stock',
    'Low stock',
    format('%s is low: %s left',
           COALESCE(v_name, p_item_type::text || ' #' || p_item_id),
           trim(to_char(COALESCE(p_new, 0), 'FM999990.##'))),
    jsonb_build_object('item_type', p_item_type, 'item_id', p_item_id,
                       'location', p_location, 'new_qty', p_new, 'threshold', v_threshold),
    NOW() + INTERVAL '7 days'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

-- ─── RPC: record_waste ───────────────────────────────────────────────────
-- Dedicated Damage/Waste action (distinct from Adjust). Removes p_qty from the
-- side's own count as a 'waste' movement with a categorized reason, optional
-- photo, and recorded cost impact. RBAC-by-amount: at/above the cost threshold
-- only a manager/admin may record (a non-manager is rejected, not queued).
DROP FUNCTION IF EXISTS record_waste(stock_item_type, integer, stock_location, numeric, text, text, text, numeric, uuid, uuid);
CREATE OR REPLACE FUNCTION record_waste(
  p_item_type stock_item_type,
  p_item_id INT,
  p_location stock_location,
  p_qty NUMERIC,
  p_reason TEXT,                       -- category: supplier_defect|staff_mistake|customer_damage|lost|mis_cut|other
  p_note TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_threshold CONSTANT NUMERIC := 25;  -- cost (KWD); mirror of WASTE_APPROVAL_THRESHOLD in lib/inventory.ts
  v_current NUMERIC;
  v_unit_cost NUMERIC;
  v_cost NUMERIC;
  v_new_qty NUMERIC;
  v_result JSONB;
BEGIN
  IF NOT idem_claim(p_idempotency_key, 'record_waste') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'record_waste: quantity must be positive (got %)', p_qty;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'record_waste: reason category is required';
  END IF;

  -- Fabric and shelf live only in shop stock — the workshop never holds them
  -- (SPEC §4). Reject any workshop-side waste of them.
  IF p_item_type IN ('fabric', 'shelf') AND p_location <> 'shop' THEN
    RAISE EXCEPTION 'Fabric and shelf stock lives only at the shop — % cannot be wasted at the workshop (SPEC §4)', p_item_type;
  END IF;

  -- FOR UPDATE locks the row before we compute v_new_qty, so two concurrent
  -- wastes on the same item can't both read the same v_current and have the
  -- second absolute write clobber the first (a lost decrement = lost stock).
  IF p_item_type = 'fabric' THEN
    SELECT (CASE WHEN p_location = 'shop' THEN shop_stock ELSE workshop_stock END), price_per_meter
      INTO v_current, v_unit_cost FROM fabrics WHERE id = p_item_id FOR UPDATE;
  ELSIF p_item_type = 'shelf' THEN
    SELECT (CASE WHEN p_location = 'shop' THEN shop_stock ELSE workshop_stock END), price
      INTO v_current, v_unit_cost FROM shelf WHERE id = p_item_id FOR UPDATE;
  ELSIF p_item_type = 'accessory' THEN
    SELECT (CASE WHEN p_location = 'shop' THEN shop_stock ELSE workshop_stock END), price
      INTO v_current, v_unit_cost FROM accessories WHERE id = p_item_id FOR UPDATE;
  END IF;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'record_waste: item % of type % not found', p_item_id, p_item_type;
  END IF;
  IF v_current < p_qty THEN
    RAISE EXCEPTION 'record_waste: cannot waste % — only % on hand at %', p_qty, v_current, p_location;
  END IF;

  v_unit_cost := COALESCE(p_unit_cost, v_unit_cost);
  v_cost := p_qty * COALESCE(v_unit_cost, 0);

  IF v_cost >= v_threshold AND NOT is_manager_or_above() THEN
    RAISE EXCEPTION 'record_waste: waste cost % is at/above the % approval threshold — needs manager approval', v_cost, v_threshold;
  END IF;

  v_new_qty := v_current - p_qty;

  PERFORM set_config('app.movement_type', 'waste', true);
  PERFORM set_config('app.movement_ref_type', 'waste', true);
  PERFORM set_config('app.movement_ref_id', '', true);
  PERFORM set_config('app.movement_user_id', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('app.movement_supplier_id', '', true);
  PERFORM set_config('app.movement_unit_cost', COALESCE(v_unit_cost::text, ''), true);
  PERFORM set_config('app.movement_reason', p_reason, true);
  PERFORM set_config('app.movement_notes', COALESCE(p_note, ''), true);
  PERFORM set_config('app.movement_image_url', COALESCE(p_image_url, ''), true);

  IF p_item_type = 'fabric' THEN
    IF p_location = 'shop' THEN UPDATE fabrics SET shop_stock = v_new_qty WHERE id = p_item_id;
    ELSE UPDATE fabrics SET workshop_stock = v_new_qty WHERE id = p_item_id; END IF;
  ELSIF p_item_type = 'shelf' THEN
    IF p_location = 'shop' THEN UPDATE shelf SET shop_stock = v_new_qty::int WHERE id = p_item_id;
    ELSE UPDATE shelf SET workshop_stock = v_new_qty::int WHERE id = p_item_id; END IF;
  ELSIF p_item_type = 'accessory' THEN
    IF p_location = 'shop' THEN UPDATE accessories SET shop_stock = v_new_qty WHERE id = p_item_id;
    ELSE UPDATE accessories SET workshop_stock = v_new_qty WHERE id = p_item_id; END IF;
  END IF;

  -- Don't let the photo leak onto a later movement in this transaction.
  PERFORM set_config('app.movement_image_url', '', true);

  v_result := jsonb_build_object('success', true, 'new_stock', v_new_qty, 'cost', v_cost);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ─── Stocktake: start / save counts / validate / status ──────────────────
-- Open (or return the existing open) stocktake session for a side.
DROP FUNCTION IF EXISTS start_stocktake(stock_location, brand, uuid, uuid);
CREATE OR REPLACE FUNCTION start_stocktake(
  p_side stock_location,
  p_brand brand DEFAULT 'ERTH',
  p_user_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_id INT;
  v_result JSONB;
BEGIN
  IF NOT idem_claim(p_idempotency_key, 'start_stocktake') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  SELECT id INTO v_id FROM stocktake_sessions
    WHERE side = p_side AND status = 'open' ORDER BY started_at DESC LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO stocktake_sessions (side, brand, status, started_by)
    VALUES (p_side, p_brand, 'open', p_user_id)
    RETURNING id INTO v_id;
  END IF;

  v_result := jsonb_build_object('success', true, 'session_id', v_id);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

-- Upsert entered counts. No stock change yet. (Idempotent by nature.)
DROP FUNCTION IF EXISTS save_stocktake_counts(integer, jsonb, uuid);
CREATE OR REPLACE FUNCTION save_stocktake_counts(
  p_session_id INT,
  p_counts JSONB,            -- [{ item_type, item_id, counted_qty (nullable), reason (nullable) }]
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_status stocktake_status;
BEGIN
  SELECT status INTO v_status FROM stocktake_sessions WHERE id = p_session_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'save_stocktake_counts: session % not found', p_session_id;
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'save_stocktake_counts: session % is already validated', p_session_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_counts)
  LOOP
    INSERT INTO stocktake_counts (session_id, item_type, item_id, counted_qty, reason)
    VALUES (
      p_session_id,
      (v_item->>'item_type')::stock_item_type,
      (v_item->>'item_id')::int,
      NULLIF(v_item->>'counted_qty', '')::numeric,
      NULLIF(v_item->>'reason', '')
    )
    ON CONFLICT (session_id, item_type, item_id)
    DO UPDATE SET counted_qty = EXCLUDED.counted_qty, reason = EXCLUDED.reason;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'session_id', p_session_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

-- Validate (manager-only): snapshot system_qty + variance per counted line,
-- apply each non-zero variance as an adjustment (reason 'stocktake: <line>'),
-- freeze the session, reset the side's cadence clock. A non-zero variance with
-- no line reason aborts the whole validate.
DROP FUNCTION IF EXISTS validate_stocktake(integer, uuid, uuid);
CREATE OR REPLACE FUNCTION validate_stocktake(
  p_session_id INT,
  p_user_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_session stocktake_sessions%ROWTYPE;
  v_count stocktake_counts%ROWTYPE;
  v_system NUMERIC;
  v_variance NUMERIC;
  v_applied INT := 0;
  v_result JSONB;
BEGIN
  IF NOT idem_claim(p_idempotency_key, 'validate_stocktake') THEN
    RETURN idem_replay(p_idempotency_key);
  END IF;

  IF NOT is_manager_or_above() THEN
    RAISE EXCEPTION 'validate_stocktake: only a manager may validate a stocktake';
  END IF;

  SELECT * INTO v_session FROM stocktake_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'validate_stocktake: session % not found', p_session_id;
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'validate_stocktake: session % already validated', p_session_id;
  END IF;

  FOR v_count IN
    SELECT * FROM stocktake_counts WHERE session_id = p_session_id AND counted_qty IS NOT NULL
  LOOP
    IF v_count.item_type = 'fabric' THEN
      SELECT (CASE WHEN v_session.side = 'shop' THEN shop_stock ELSE workshop_stock END)
        INTO v_system FROM fabrics WHERE id = v_count.item_id;
    ELSIF v_count.item_type = 'shelf' THEN
      SELECT (CASE WHEN v_session.side = 'shop' THEN shop_stock ELSE workshop_stock END)
        INTO v_system FROM shelf WHERE id = v_count.item_id;
    ELSIF v_count.item_type = 'accessory' THEN
      SELECT (CASE WHEN v_session.side = 'shop' THEN shop_stock ELSE workshop_stock END)
        INTO v_system FROM accessories WHERE id = v_count.item_id;
    END IF;

    v_variance := v_count.counted_qty - COALESCE(v_system, 0);

    UPDATE stocktake_counts
      SET system_qty = COALESCE(v_system, 0), variance = v_variance
      WHERE id = v_count.id;

    IF v_variance <> 0 THEN
      IF v_count.reason IS NULL OR length(trim(v_count.reason)) = 0 THEN
        RAISE EXCEPTION 'validate_stocktake: % #% has variance % but no reason', v_count.item_type, v_count.item_id, v_variance;
      END IF;
      PERFORM adjust_stock(
        v_count.item_type, v_count.item_id, v_session.side,
        v_count.counted_qty,
        'stocktake: ' || v_count.reason,
        NULL, p_user_id
      );
      v_applied := v_applied + 1;
    END IF;
  END LOOP;

  UPDATE stocktake_sessions
    SET status = 'validated', validated_by = p_user_id, validated_at = now()
    WHERE id = p_session_id;

  v_result := jsonb_build_object('success', true, 'session_id', p_session_id, 'adjustments_applied', v_applied);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_catalog;

-- Per-side cadence status for the soft-block UI. Monthly cadence; tier 0 = ok,
-- 1 = overdue (warn), 3 = >3 days overdue (hard nag — still dismissible).
DROP FUNCTION IF EXISTS get_stocktake_status(stock_location);
CREATE OR REPLACE FUNCTION get_stocktake_status(p_side stock_location)
RETURNS JSONB AS $$
DECLARE
  v_last TIMESTAMP;
  v_open INT;
  v_due TIMESTAMP;
  v_overdue BOOLEAN;
  v_tier INT;
  v_days_overdue INT;
BEGIN
  SELECT MAX(validated_at) INTO v_last FROM stocktake_sessions
    WHERE side = p_side AND status = 'validated';
  SELECT id INTO v_open FROM stocktake_sessions
    WHERE side = p_side AND status = 'open' ORDER BY started_at DESC LIMIT 1;

  v_due := COALESCE(v_last, '1970-01-01'::timestamp) + INTERVAL '1 month';
  v_overdue := now() > v_due;
  v_days_overdue := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - v_due)) / 86400))::int;
  v_tier := CASE
    WHEN NOT v_overdue THEN 0
    WHEN now() > v_due + INTERVAL '3 days' THEN 3
    ELSE 1 END;

  RETURN jsonb_build_object(
    'last_validated_at', v_last,
    'open_session_id', v_open,
    'overdue', v_overdue,
    'days_overdue', v_days_overdue,
    'tier', v_tier
  );
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
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_fabric_id FOR UPDATE;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for fabric %: have %, need %', v_fabric_id, v_current_stock, v_qty;
        END IF;
        UPDATE fabrics SET shop_stock = shop_stock - v_qty WHERE id = v_fabric_id;
      ELSIF v_shelf_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_shelf_id FOR UPDATE;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for shelf item %: have %, need %', v_shelf_id, v_current_stock, v_qty;
        END IF;
        UPDATE shelf SET shop_stock = shop_stock - v_qty::int WHERE id = v_shelf_id;
      ELSIF v_accessory_id IS NOT NULL THEN
        SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_accessory_id FOR UPDATE;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient shop stock for accessory %: have %, need %', v_accessory_id, v_current_stock, v_qty;
        END IF;
        UPDATE accessories SET shop_stock = shop_stock - v_qty WHERE id = v_accessory_id;
      END IF;
    ELSE
      IF v_fabric_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_fabric_id FOR UPDATE;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient workshop stock for fabric %: have %, need %', v_fabric_id, v_current_stock, v_qty;
        END IF;
        UPDATE fabrics SET workshop_stock = workshop_stock - v_qty WHERE id = v_fabric_id;
      ELSIF v_shelf_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_shelf_id FOR UPDATE;
        IF v_current_stock < v_qty THEN
          RAISE EXCEPTION 'Insufficient workshop stock for shelf item %: have %, need %', v_shelf_id, v_current_stock, v_qty;
        END IF;
        UPDATE shelf SET workshop_stock = workshop_stock - v_qty::int WHERE id = v_shelf_id;
      ELSIF v_accessory_id IS NOT NULL THEN
        SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_accessory_id FOR UPDATE;
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

    -- Only accessories cross between shop and workshop — fabric/shelf are
    -- shop-only (SPEC §4), so they can never appear in a transfer.
    IF v_item_type <> 'accessory' THEN
      RAISE EXCEPTION 'Only accessories transfer between shop and workshop — % cannot be transferred (SPEC §4)', v_item_type;
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

    -- Only accessories cross between shop and workshop — fabric/shelf are
    -- shop-only (SPEC §4), so they can never appear in a transfer.
    IF v_item_type <> 'accessory' THEN
      RAISE EXCEPTION 'Only accessories transfer between shop and workshop — % cannot be transferred (SPEC §4)', v_item_type;
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
          SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_fabric_id FOR UPDATE;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient shop stock for fabric %: have %, need %', v_fabric_id, v_current_stock, v_qty;
          END IF;
          UPDATE fabrics SET shop_stock = shop_stock - v_qty WHERE id = v_fabric_id;
        ELSIF v_shelf_id IS NOT NULL THEN
          SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_shelf_id FOR UPDATE;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient shop stock for shelf item %: have %, need %', v_shelf_id, v_current_stock, v_qty;
          END IF;
          UPDATE shelf SET shop_stock = shop_stock - v_qty::int WHERE id = v_shelf_id;
        ELSIF v_accessory_id IS NOT NULL THEN
          SELECT COALESCE(shop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_accessory_id FOR UPDATE;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient shop stock for accessory %: have %, need %', v_accessory_id, v_current_stock, v_qty;
          END IF;
          UPDATE accessories SET shop_stock = shop_stock - v_qty WHERE id = v_accessory_id;
        END IF;
      ELSE
        IF v_fabric_id IS NOT NULL THEN
          SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM fabrics WHERE id = v_fabric_id FOR UPDATE;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient workshop stock for fabric %: have %, need %', v_fabric_id, v_current_stock, v_qty;
          END IF;
          UPDATE fabrics SET workshop_stock = workshop_stock - v_qty WHERE id = v_fabric_id;
        ELSIF v_shelf_id IS NOT NULL THEN
          SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM shelf WHERE id = v_shelf_id FOR UPDATE;
          IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient workshop stock for shelf item %: have %, need %', v_shelf_id, v_current_stock, v_qty;
          END IF;
          UPDATE shelf SET workshop_stock = workshop_stock - v_qty::int WHERE id = v_shelf_id;
        ELSIF v_accessory_id IS NOT NULL THEN
          SELECT COALESCE(workshop_stock, 0) INTO v_current_stock FROM accessories WHERE id = v_accessory_id FOR UPDATE;
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

-- ════════════════════════════════════════════════════════════════════════
-- HOME-BASED BRAND DELIVERY (SPEC §1 / §5)
-- Home-based brands (SAKKBA/QASS) have no cashier; their final handover happens
-- on a per-brand Delivery page. deliver_order hands over a WHOLE order in one
-- all-or-nothing action: it refuses unless EVERY non-terminal garment of the
-- order is back at the shop and ready_for_pickup, then reuses collect_garments
-- (so fulfillment_type = delivered for home_delivery garments, piece_stage =
-- completed, collected_at = now(); the recompute_order_phase trigger then flips
-- order_phase -> completed). Idempotent: a re-run on a fully-delivered order is a
-- no-op. SECURITY INVOKER, so RLS is the brand fence — exactly like
-- collect_garments, which it wraps: an order for a brand the caller can't access
-- is simply not visible, so it reads as 'not found'.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION deliver_order(p_order_id INT)
RETURNS JSONB AS $$
DECLARE
  v_total INT;
  v_ready INT;
  v_ids   UUID[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  SELECT
    count(*) FILTER (WHERE piece_stage NOT IN ('completed','discarded')),
    count(*) FILTER (WHERE piece_stage NOT IN ('completed','discarded')
                     AND location = 'shop' AND piece_stage = 'ready_for_pickup')
  INTO v_total, v_ready
  FROM garments
  WHERE order_id = p_order_id;

  -- Idempotent: nothing left to hand over.
  IF v_total = 0 THEN
    RETURN jsonb_build_object('status', 'noop', 'message', 'Order already fully delivered');
  END IF;

  -- Whole-order, all-or-nothing: refuse a partial delivery.
  IF v_ready < v_total THEN
    RAISE EXCEPTION 'Cannot deliver order %: % of % garment(s) are not yet back at the shop and ready for delivery',
      p_order_id, (v_total - v_ready), v_total;
  END IF;

  SELECT array_agg(id) INTO v_ids
  FROM garments
  WHERE order_id = p_order_id
    AND location = 'shop'
    AND piece_stage = 'ready_for_pickup';

  RETURN collect_garments(p_order_id, v_ids, NULL);
END;
$$ LANGUAGE plpgsql;

-- List a home-based brand's WORK orders for the Delivery page. p_status:
--   'ready'     -> confirmed, not yet completed, and EVERY non-terminal garment
--                  is back at the shop ready_for_pickup (deliverable now).
--   'delivered' -> already handed over (order_phase = completed), newest first.
-- Read-only; SECURITY INVOKER so RLS fences the brand, plus an explicit filter.
CREATE OR REPLACE FUNCTION get_delivery_orders(
  p_brand  brand,
  p_status TEXT DEFAULT 'ready'
)
RETURNS JSONB AS $$
  WITH gstats AS (
    SELECT
      order_id,
      count(*) AS total_garments,
      count(*) FILTER (WHERE piece_stage NOT IN ('completed','discarded')) AS active_garments,
      count(*) FILTER (WHERE piece_stage NOT IN ('completed','discarded')
                       AND location = 'shop' AND piece_stage = 'ready_for_pickup') AS ready_garments,
      min(delivery_date) AS delivery_date,
      max(collected_at)  AS last_delivered_at
    FROM garments
    GROUP BY order_id
  )
  SELECT COALESCE(
    jsonb_agg(row_to_json(t)
      ORDER BY t.last_delivered_at DESC NULLS LAST,
               t.delivery_date     ASC  NULLS LAST,
               t.order_id          DESC),
    '[]'::jsonb)
  FROM (
    SELECT
      o.id              AS order_id,
      wo.invoice_number,
      c.name            AS customer_name,
      c.phone           AS customer_phone,
      o.order_total,
      o.paid,
      gs.total_garments,
      gs.active_garments,
      gs.ready_garments,
      gs.delivery_date,
      gs.last_delivered_at
    FROM orders o
    JOIN work_orders wo ON wo.order_id = o.id
    JOIN customers   c  ON c.id = o.customer_id
    JOIN gstats      gs ON gs.order_id = o.id
    WHERE o.brand = p_brand
      AND o.order_type = 'WORK'
      AND o.checkout_status = 'confirmed'
      AND (
        (p_status = 'ready'
          AND wo.order_phase <> 'completed'
          AND gs.active_garments > 0
          AND gs.ready_garments = gs.active_garments)
        OR
        (p_status = 'delivered'
          AND wo.order_phase = 'completed')
      )
  ) t;
$$ LANGUAGE sql STABLE;

-- ─── Fabric/stock consumption broken down by consuming brand (SPEC §1/§4) ───
-- The single sanctioned cross-brand view: how each brand draws down ERTH's
-- shared shop stock. Sums `consumption` movements in [from, to) per brand using
-- the same ABS(qty_delta)+annotated_qty measure as the other aggregates.
-- Pre-attribution (historical) rows have NULL brand -> bucketed 'UNATTRIBUTED'.
-- Defaults to fabric on the shop side (where the home brands' usage lands).
CREATE OR REPLACE FUNCTION get_consumption_by_brand(
  p_from      TIMESTAMPTZ,
  p_to        TIMESTAMPTZ,
  p_item_type stock_item_type DEFAULT 'fabric',
  p_location  stock_location  DEFAULT 'shop'
)
RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.total DESC), '[]'::jsonb)
  FROM (
    SELECT
      COALESCE(brand::text, 'UNATTRIBUTED') AS brand,
      SUM(ABS(qty_delta) + COALESCE(annotated_qty, 0)) AS total,
      COUNT(*) AS count
    FROM stock_movements
    WHERE created_at >= p_from AND created_at < p_to
      AND movement_type = 'consumption'
      AND (p_item_type IS NULL OR item_type = p_item_type)
      AND (p_location  IS NULL OR location  = p_location)
    GROUP BY brand
  ) t;
$$ LANGUAGE sql STABLE;

-- ════════════════════════════════════════════════════════════════════
-- Super-admin blanket access (defense in depth — keep at end of file)
-- ════════════════════════════════════════════════════════════════════
-- A super_admin must be able to read and write every RLS-enabled table.
-- Rather than depend on each policy remembering an is_admin() escape, attach
-- one blanket PERMISSIVE FOR ALL policy per table. Every other policy in this
-- file is PERMISSIVE, so policies are OR'd: this can only ADD access for a
-- super_admin and never restricts anyone else (is_super_admin() is false for
-- all other users). The loop covers whatever tables have RLS enabled at this
-- point, so it must run last; re-running db:triggers re-covers tables added
-- later.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'r'
      AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.relname || '_super_admin_all', r.relname);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO public USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())',
      r.relname || '_super_admin_all', r.relname
    );
  END LOOP;
END $$;
