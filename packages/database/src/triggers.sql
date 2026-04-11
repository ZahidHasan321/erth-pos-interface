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

-- 2. Transactional RPC for completing work order
CREATE OR REPLACE FUNCTION complete_work_order(
  p_order_id INT,
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker, discountType, discountValue, referralCode, discountPercentage, orderTotal, fabricCharge, stitchingCharge, styleCharge, deliveryCharge, shelfCharge, homeDelivery, deliveryDate, advance, stitchingPrice }
  p_shelf_items JSONB,      -- [{ id: number, quantity: number, unitPrice: number }]
  p_fabric_items JSONB      -- [{ id: number, length: number }]
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_order_row RECORD;
  v_work_order_row RECORD;
  v_inv INT;
  v_paid DECIMAL;
BEGIN
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
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_fabric_items)
  LOOP
    UPDATE fabrics
    SET real_stock = real_stock - (v_item->>'length')::decimal,
        shop_stock = shop_stock - (v_item->>'length')::decimal
    WHERE id = (v_item->>'id')::int;
  END LOOP;

  -- 6. Record initial payment transaction (if paid > 0)
  IF v_paid IS NOT NULL AND v_paid > 0 THEN
    INSERT INTO payment_transactions (order_id, amount, payment_type, payment_ref_no, payment_note, cashier_id, transaction_type)
    VALUES (
      p_order_id,
      v_paid,
      (p_checkout_details->>'paymentType')::payment_type,
      (p_checkout_details->>'paymentRefNo'),
      (p_checkout_details->>'paymentNote'),
      (p_checkout_details->>'orderTaker')::uuid,
      'payment'
    );
  END IF;

  -- 7. Return Flattened Result
  RETURN to_jsonb(v_order_row) || to_jsonb(v_work_order_row);
END;
$$ LANGUAGE plpgsql;

-- 3. Transactional RPC for completing sales order (Shelf items only)
CREATE OR REPLACE FUNCTION complete_sales_order(
  p_order_id INT,
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker, discountType, discountValue, referralCode, discountPercentage, total, shelfCharge, deliveryCharge }
  p_shelf_items JSONB       -- [{ id: number, quantity: number, unitPrice: number }]
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_order_row orders%ROWTYPE;
  v_paid DECIMAL;
BEGIN
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
  IF v_paid IS NOT NULL AND v_paid > 0 THEN
    INSERT INTO payment_transactions (order_id, amount, payment_type, payment_ref_no, payment_note, cashier_id, transaction_type)
    VALUES (
      p_order_id,
      v_paid,
      (p_checkout_details->>'paymentType')::payment_type,
      (p_checkout_details->>'paymentRefNo'),
      (p_checkout_details->>'paymentNote'),
      (p_checkout_details->>'orderTaker')::uuid,
      'payment'
    );
  END IF;

  RETURN to_jsonb(v_order_row);
END;
$$ LANGUAGE plpgsql;

-- 4. NEW: Transactional RPC for creating AND completing a sales order in one go
CREATE OR REPLACE FUNCTION create_complete_sales_order(
  p_customer_id INT,
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker, discountType, discountValue, referralCode, discountPercentage, notes, total, shelfCharge, deliveryCharge, brand }
  p_shelf_items JSONB       -- [{ id: number, quantity: number, unitPrice: number }]
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_order_id INT;
  v_order_row orders%ROWTYPE;
  v_paid DECIMAL;
BEGIN
  v_paid := (p_checkout_details->>'paid')::decimal;

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
    (p_checkout_details->>'brand')::brand
  ) RETURNING id INTO v_order_id;

  -- 2. Deduct Shelf Stock & Record Items
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
  IF v_paid IS NOT NULL AND v_paid > 0 THEN
    INSERT INTO payment_transactions (order_id, amount, payment_type, payment_ref_no, payment_note, cashier_id, transaction_type)
    VALUES (
      v_order_id,
      v_paid,
      (p_checkout_details->>'paymentType')::payment_type,
      (p_checkout_details->>'paymentRefNo'),
      (p_checkout_details->>'paymentNote'),
      (p_checkout_details->>'orderTaker')::uuid,
      'payment'
    );
  END IF;

  -- 4. Return the full order row
  SELECT * FROM orders WHERE id = v_order_id INTO v_order_row;
  RETURN to_jsonb(v_order_row);
END;
$$ LANGUAGE plpgsql;

-- 5. Transactional RPC for saving work order garments and updating order totals
CREATE OR REPLACE FUNCTION save_work_order_garments(
  p_order_id INT,
  p_garments JSONB, -- Array of garment objects
  p_order_updates JSONB -- { num_of_fabrics, fabric_charge, stitching_charge, style_charge, stitching_price, delivery_date, home_delivery }
) RETURNS JSONB AS $$
DECLARE
  v_garment JSONB;
BEGIN
  -- 0. Ensure order_type is WORK
  UPDATE orders SET order_type = 'WORK' WHERE id = p_order_id AND order_type != 'WORK';

  -- 1. Update Work Order Totals
  INSERT INTO work_orders (
    order_id,
    num_of_fabrics,
    fabric_charge,
    stitching_charge,
    style_charge,
    stitching_price,
    delivery_date,
    home_delivery
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
    num_of_fabrics = EXCLUDED.num_of_fabrics,
    fabric_charge = EXCLUDED.fabric_charge,
    stitching_charge = EXCLUDED.stitching_charge,
    style_charge = EXCLUDED.style_charge,
    stitching_price = EXCLUDED.stitching_price,
    delivery_date = EXCLUDED.delivery_date,
    home_delivery = EXCLUDED.home_delivery;

  -- 2. Clear and Re-insert Garments (Atomic Sync)
  DELETE FROM garments WHERE order_id = p_order_id;

  FOR v_garment IN SELECT * FROM jsonb_array_elements(p_garments)
  LOOP
    INSERT INTO garments (
      order_id, garment_id, fabric_id, style_id, measurement_id, fabric_source,
      quantity, fabric_length, fabric_price_snapshot, stitching_price_snapshot,
      style_price_snapshot, collar_type, collar_button, cuffs_type, cuffs_thickness,
      front_pocket_type, front_pocket_thickness, wallet_pocket, pen_holder,
      small_tabaggi, jabzour_1, jabzour_2, jabzour_thickness, lines, notes,
      soaking, express, garment_type, delivery_date, piece_stage, style, shop_name,
      home_delivery, color, location, trip_number, acceptance_status, feedback_status, fulfillment_type
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
      COALESCE((v_garment->>'express')::BOOLEAN, false),
      COALESCE(v_garment->>'garment_type', 'final')::garment_type,
      (v_garment->>'delivery_date')::TIMESTAMP,
      COALESCE((v_garment->>'piece_stage')::piece_stage, 'waiting_cut'),
      COALESCE(v_garment->>'style', 'kuwaiti'),
      v_garment->>'shop_name',
      COALESCE((v_garment->>'home_delivery')::BOOLEAN, false),
      v_garment->>'color',
      COALESCE((v_garment->>'location')::location, 'shop'),
      COALESCE((v_garment->>'trip_number')::INT, 0),
      (v_garment->>'acceptance_status')::BOOLEAN,
      v_garment->>'feedback_status',
      (v_garment->>'fulfillment_type')::fulfillment_type
    );
  END LOOP;

  -- 3. If order has any brova garments, park finals as waiting_for_acceptance
  --    (finals can't progress until their brova is trialed & accepted)
  IF EXISTS (
    SELECT 1 FROM garments WHERE order_id = p_order_id AND garment_type = 'brova'
  ) THEN
    UPDATE garments
    SET piece_stage = 'waiting_for_acceptance'
    WHERE order_id = p_order_id
      AND garment_type = 'final'
      AND piece_stage = 'waiting_cut';
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

    -- Compute new phase from garment stages
    SELECT CASE
        WHEN bool_and(g.piece_stage = 'completed')
            THEN 'completed'::order_phase
        WHEN bool_and(g.piece_stage IN ('waiting_for_acceptance', 'waiting_cut', 'brova_trialed'))
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
  p_local_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_current_paid DECIMAL;
  v_transaction RECORD;
  v_garment_id UUID;
  v_collected_count INT := 0;
  v_refund_item JSONB;
  v_shelf_item_id INT;
  v_refund_qty INT;
BEGIN
  -- Validate order exists
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Block payments/refunds when register is closed
  -- Check for any open session for the brand — not date-scoped — so sessions that
  -- started before midnight and haven't been closed yet remain valid past midnight.
  IF NOT EXISTS (
    SELECT 1 FROM register_sessions
    WHERE brand = v_order.brand AND status = 'open'
  ) THEN
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
  END IF;

  -- Bump invoice revision on every payment/refund recording
  UPDATE work_orders
  SET invoice_revision = COALESCE(invoice_revision, 0) + 1
  WHERE order_id = p_order_id;

  -- Insert the transaction (trigger will sync orders.paid)
  INSERT INTO payment_transactions (
    order_id, amount, payment_type, payment_ref_no, payment_note,
    cashier_id, transaction_type, refund_reason, refund_items
  ) VALUES (
    p_order_id,
    CASE WHEN p_transaction_type = 'refund' THEN -ABS(p_amount) ELSE ABS(p_amount) END,
    p_payment_type::payment_type,
    p_payment_ref_no,
    p_payment_note,
    p_cashier_id,
    p_transaction_type::transaction_type,
    p_refund_reason,
    p_refund_items
  )
  RETURNING * INTO v_transaction;

  -- Collect garments if any were selected (mark as collected + completed)
  IF p_collect_garment_ids IS NOT NULL AND array_length(p_collect_garment_ids, 1) > 0 THEN
    FOREACH v_garment_id IN ARRAY p_collect_garment_ids
    LOOP
      UPDATE garments
      SET
        fulfillment_type = 'collected',
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
      ELSIF v_refund_item ? 'shelf_item_id' THEN
        v_shelf_item_id := (v_refund_item->>'shelf_item_id')::int;
        v_refund_qty := COALESCE((v_refund_item->>'quantity')::int, 0);
        UPDATE order_shelf_items
        SET refunded_qty = LEAST(COALESCE(refunded_qty, 0) + v_refund_qty, COALESCE(quantity, 0))
        WHERE id = v_shelf_item_id
          AND order_id = p_order_id;

        -- Restore shelf stock for refunded items
        IF v_refund_qty > 0 THEN
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
  p_garment_ids UUID[]
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
      fulfillment_type = 'collected',
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

-- 12. RPC: Update order discount (cashier terminal)
CREATE OR REPLACE FUNCTION update_order_discount(
  p_order_id INT,
  p_discount_type TEXT,
  p_discount_value DECIMAL,
  p_discount_percentage DECIMAL DEFAULT NULL,
  p_referral_code TEXT DEFAULT NULL,
  p_new_order_total DECIMAL DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_order RECORD;
  v_subtotal DECIMAL;
  v_final_total DECIMAL;
  v_current_paid DECIMAL;
BEGIN
  -- Validate order exists
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_current_paid := COALESCE(v_order.paid, 0);

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
      SELECT * FROM customers
      ORDER BY phone ASC, account_type ASC, created_at DESC
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
        ) AS match_score
      FROM customers c
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
  SELECT id, username, name, role, department, pin, brands,
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
      'brands', brands
    ) ORDER BY name
  ), '[]'::jsonb)
  FROM users
  WHERE is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════════════════════
-- RLS HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Get the current user's role from auth.uid() → users.auth_id
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role::text FROM users WHERE auth_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get the current user's department from auth.uid() → users.auth_id
CREATE OR REPLACE FUNCTION get_my_department()
RETURNS TEXT AS $$
  SELECT department::text FROM users WHERE auth_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get the current user's id (users.id, NOT auth.uid()) from auth.uid() → users.auth_id
CREATE OR REPLACE FUNCTION get_my_user_id()
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('super_admin', 'admin'));
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user is admin or manager
CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role IN ('super_admin', 'admin', 'manager'));
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if current user can access a given brand
-- super_admin and workshop users see all brands; shop users only see their assigned brands
CREATE OR REPLACE FUNCTION can_access_brand(brand_value TEXT)
RETURNS BOOLEAN AS $$
  SELECT
    -- super_admin sees everything
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'super_admin')
    -- workshop department sees all brands (they process orders for every brand)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND department = 'workshop')
    -- no brands set = unrestricted (backwards compat)
    OR NOT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND brands IS NOT NULL AND array_length(brands, 1) > 0)
    -- brand is in the user's brands array (case-insensitive)
    OR EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND lower(brand_value) = ANY(brands));
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY POLICIES
-- ═══════════════════════════════════════════════════════════════════════

-- ── Users table ─────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Everyone can read users (needed for displaying names, assignments, etc.)
DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users FOR SELECT USING (true);

-- Only admins can insert users (creation goes through Edge Function anyway)
DROP POLICY IF EXISTS "users_insert" ON users;
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (is_admin());

-- Admins can update any user; others can update their own non-sensitive fields
DROP POLICY IF EXISTS "users_update" ON users;
CREATE POLICY "users_update" ON users FOR UPDATE USING (
  is_admin() OR id = get_my_user_id()
);

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
CREATE POLICY "customers_select" ON customers FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "customers_insert" ON customers;
CREATE POLICY "customers_insert" ON customers FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "customers_update" ON customers;
CREATE POLICY "customers_update" ON customers FOR UPDATE USING (is_manager_or_above() OR get_my_department() = 'shop');

-- ── Prices ──────────────────────────────────────────────────────────
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prices_select" ON prices;
CREATE POLICY "prices_select" ON prices FOR SELECT USING (
  auth.uid() IS NOT NULL AND can_access_brand(brand::text)
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
CREATE POLICY "campaigns_select" ON campaigns FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "styles_select" ON styles;
CREATE POLICY "styles_select" ON styles FOR SELECT USING (
  auth.uid() IS NOT NULL AND (brand IS NULL OR can_access_brand(brand::text))
);
DROP POLICY IF EXISTS "fabrics_select" ON fabrics;
CREATE POLICY "fabrics_select" ON fabrics FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "shelf_select" ON shelf;
CREATE POLICY "shelf_select" ON shelf FOR SELECT USING (
  auth.uid() IS NOT NULL AND (brand IS NULL OR can_access_brand(brand::text))
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
CREATE POLICY "measurements_select" ON measurements FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "measurements_insert" ON measurements;
CREATE POLICY "measurements_insert" ON measurements FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "measurements_update" ON measurements;
CREATE POLICY "measurements_update" ON measurements FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ── Orders ──────────────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (
  auth.uid() IS NOT NULL AND can_access_brand(brand::text)
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
CREATE POLICY "work_orders_select" ON work_orders FOR SELECT USING (auth.uid() IS NOT NULL);

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

DROP POLICY IF EXISTS "garments_select" ON garments;
CREATE POLICY "garments_select" ON garments FOR SELECT USING (auth.uid() IS NOT NULL);

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

DROP POLICY IF EXISTS "feedback_select" ON garment_feedback;
CREATE POLICY "feedback_select" ON garment_feedback FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "feedback_insert" ON garment_feedback;
CREATE POLICY "feedback_insert" ON garment_feedback FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "feedback_update" ON garment_feedback;
CREATE POLICY "feedback_update" ON garment_feedback FOR UPDATE USING (
  is_manager_or_above() OR get_my_department() IN ('shop','workshop')
);

-- ── Resources (Workshop Workers) ────────────────────────────────────
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resources_select" ON resources;
CREATE POLICY "resources_select" ON resources FOR SELECT USING (
  auth.uid() IS NOT NULL AND (brand IS NULL OR can_access_brand(brand::text))
);

DROP POLICY IF EXISTS "resources_modify" ON resources;
CREATE POLICY "resources_modify" ON resources FOR ALL USING (
  is_admin() OR (get_my_role() = 'manager' AND get_my_department() = 'workshop')
);

-- ── Order Shelf Items ───────────────────────────────────────────────
ALTER TABLE order_shelf_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shelf_items_select" ON order_shelf_items;
CREATE POLICY "shelf_items_select" ON order_shelf_items FOR SELECT USING (auth.uid() IS NOT NULL);

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

DROP POLICY IF EXISTS "payments_select" ON payment_transactions;
CREATE POLICY "payments_select" ON payment_transactions FOR SELECT USING (auth.uid() IS NOT NULL);

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

-- ── Transfer Requests ───────────────────────────────────────────────
-- RLS is required here not for access control (policies are permissive) but
-- because Supabase Realtime's postgres_changes channel refuses to broadcast
-- events for tables without RLS + SELECT policies. Without this, realtime
-- updates for transfers never reach the other department.
ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfer_requests_select" ON transfer_requests;
CREATE POLICY "transfer_requests_select" ON transfer_requests
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_requests_insert" ON transfer_requests;
CREATE POLICY "transfer_requests_insert" ON transfer_requests
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_requests_update" ON transfer_requests;
CREATE POLICY "transfer_requests_update" ON transfer_requests
    FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_requests_delete" ON transfer_requests;
CREATE POLICY "transfer_requests_delete" ON transfer_requests
    FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE transfer_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfer_request_items_select" ON transfer_request_items;
CREATE POLICY "transfer_request_items_select" ON transfer_request_items
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_request_items_insert" ON transfer_request_items;
CREATE POLICY "transfer_request_items_insert" ON transfer_request_items
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_request_items_update" ON transfer_request_items;
CREATE POLICY "transfer_request_items_update" ON transfer_request_items
    FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "transfer_request_items_delete" ON transfer_request_items;
CREATE POLICY "transfer_request_items_delete" ON transfer_request_items
    FOR DELETE USING (auth.uid() IS NOT NULL);

-- ── Appointments ────────────────────────────────────────────────────
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "appointments_select" ON appointments;
CREATE POLICY "appointments_select" ON appointments FOR SELECT USING (
  auth.uid() IS NOT NULL AND (brand IS NULL OR can_access_brand(brand::text))
);

DROP POLICY IF EXISTS "appointments_insert" ON appointments;
CREATE POLICY "appointments_insert" ON appointments FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND (brand IS NULL OR can_access_brand(brand::text))
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

  -- 1. Order-level aggregates for the date range
  --    order_date is stored as local date, so direct comparison is correct
  SELECT jsonb_build_object(
    'order_count',     COUNT(*),
    'work_count',      COUNT(*) FILTER (WHERE order_type = 'WORK'),
    'sales_count',     COUNT(*) FILTER (WHERE order_type = 'SALES'),
    'total_billed',    COALESCE(SUM(order_total::decimal), 0),
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

  RETURN v_order_stats || v_tx_stats
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
BEGIN
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
    'cash_movements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cm.id, 'type', cm.type, 'amount', cm.amount,
        'reason', cm.reason, 'performed_by_name', pu.name, 'created_at', cm.created_at
      ) ORDER BY cm.created_at)
      FROM register_cash_movements cm
      LEFT JOIN users pu ON pu.id = cm.performed_by
      WHERE cm.register_session_id = rs.id
    ), '[]'::jsonb)
  ) INTO v_session
  FROM register_sessions rs
  LEFT JOIN users ou ON ou.id = rs.opened_by
  LEFT JOIN users cu ON cu.id = rs.closed_by
  WHERE rs.brand = p_brand::brand
    AND (
      rs.date = p_date
      OR (rs.status = 'open' AND rs.date < p_date)
    )
  ORDER BY
    (rs.date = p_date) DESC,  -- prefer today's session
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
BEGIN
  IF EXISTS (SELECT 1 FROM register_sessions WHERE brand = p_brand::brand AND date = p_date) THEN
    RAISE EXCEPTION 'Register already opened for % on %', p_brand, p_date;
  END IF;

  IF EXISTS (SELECT 1 FROM register_sessions WHERE brand = p_brand::brand AND status = 'open' AND date < p_date) THEN
    RAISE EXCEPTION 'A previous register session is still open. Close it before opening a new one.';
  END IF;

  INSERT INTO register_sessions (brand, date, opened_by, opening_float, status)
  VALUES (p_brand::brand, p_date, p_user_id, p_opening_float, 'open')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'open');
END;
$$ LANGUAGE plpgsql;

-- Close register — computes expected cash server-side
CREATE OR REPLACE FUNCTION close_register(
  p_session_id INT,
  p_user_id UUID,
  p_counted_cash DECIMAL,
  p_notes TEXT DEFAULT NULL,
  p_tz_offset_minutes INT DEFAULT 180  -- Kuwait UTC+3 = 180 minutes
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
  v_day_start TIMESTAMP;
  v_day_end TIMESTAMP;
BEGIN
  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Register session not found or already closed';
  END IF;

  -- Convert local date boundaries to UTC for comparing against UTC created_at timestamps
  -- e.g. Kuwait 2026-04-04 00:00 local = 2026-04-03 21:00 UTC (offset -180 min)
  v_day_start := (v_session.date)::timestamp - (p_tz_offset_minutes || ' minutes')::interval;
  v_day_end := (v_session.date + INTERVAL '1 day')::timestamp - (p_tz_offset_minutes || ' minutes')::interval;

  -- Sum cash payments/refunds for the day using timezone-corrected boundaries
  SELECT
    COALESCE(SUM(pt.amount) FILTER (WHERE pt.transaction_type = 'payment'), 0),
    COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.transaction_type = 'refund'), 0)
  INTO v_cash_payments, v_cash_refunds
  FROM payment_transactions pt
  JOIN orders o ON o.id = pt.order_id
  WHERE o.brand = v_session.brand
    AND pt.payment_type = 'cash'
    AND pt.created_at >= v_day_start
    AND pt.created_at < v_day_end;

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

  RETURN jsonb_build_object(
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
END;
$$ LANGUAGE plpgsql;

-- Add a cash movement (cash in or cash out)
CREATE OR REPLACE FUNCTION add_cash_movement(
  p_session_id INT,
  p_type TEXT,
  p_amount DECIMAL,
  p_reason TEXT,
  p_user_id UUID,
  p_tz_offset_minutes INT DEFAULT 180  -- Kuwait UTC+3 = 180 minutes
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
  v_day_start TIMESTAMP;
  v_day_end TIMESTAMP;
BEGIN
  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Register session not found or not open';
  END IF;

  -- For cash_out, verify sufficient drawer balance
  IF p_type = 'cash_out' THEN
    -- Convert local date boundaries to UTC for timestamp comparison
    v_day_start := (v_session.date)::timestamp - (p_tz_offset_minutes || ' minutes')::interval;
    v_day_end := (v_session.date + INTERVAL '1 day')::timestamp - (p_tz_offset_minutes || ' minutes')::interval;

    SELECT
      COALESCE(SUM(pt.amount) FILTER (WHERE pt.transaction_type = 'payment'), 0),
      COALESCE(SUM(ABS(pt.amount)) FILTER (WHERE pt.transaction_type = 'refund'), 0)
    INTO v_cash_payments, v_cash_refunds
    FROM payment_transactions pt
    JOIN orders o ON o.id = pt.order_id
    WHERE o.brand = v_session.brand
      AND pt.payment_type = 'cash'
      AND pt.created_at >= v_day_start
      AND pt.created_at < v_day_end;

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

  INSERT INTO register_cash_movements (register_session_id, type, amount, reason, performed_by)
  VALUES (p_session_id, p_type::cash_movement_type, p_amount, p_reason, p_user_id)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$ LANGUAGE plpgsql;

-- Reopen a closed register session
CREATE OR REPLACE FUNCTION reopen_register(p_session_id INT, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Register session not found';
  END IF;

  IF v_session.status = 'open' THEN
    RAISE EXCEPTION 'Register is already open';
  END IF;

  UPDATE register_sessions SET
    status = 'open',
    closed_by = NULL,
    closed_at = NULL,
    closing_counted_cash = NULL,
    expected_cash = NULL,
    variance = NULL,
    closing_notes = NULL
  WHERE id = p_session_id;

  RETURN jsonb_build_object('id', p_session_id, 'status', 'open');
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
CREATE OR REPLACE FUNCTION dispatch_transfer(
  p_transfer_id INT,
  p_dispatched_by UUID,
  p_items JSONB  -- [{ id: number, dispatched_qty: number }]
)
RETURNS JSONB AS $$
DECLARE
  v_transfer RECORD;
  v_item JSONB;
  v_transfer_item RECORD;
  v_dispatched_qty DECIMAL;
  v_current_stock DECIMAL;
BEGIN
  -- 1. Lock and verify transfer
  SELECT * INTO v_transfer FROM transfer_requests WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer request % not found', p_transfer_id;
  END IF;
  IF v_transfer.status != 'approved' THEN
    RAISE EXCEPTION 'Transfer % is not in approved status (current: %)', p_transfer_id, v_transfer.status;
  END IF;

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

  RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id);
END;
$$ LANGUAGE plpgsql;

-- Receive a transfer: add received qty to destination.
-- Any shortfall (dispatched - received) is recorded on the item as missing_qty
-- and is NOT refunded to source stock — those units are treated as lost in
-- transit. Source stock was already debited at dispatch time, so doing nothing
-- here is the correct accounting for missing units.
CREATE OR REPLACE FUNCTION receive_transfer(
  p_transfer_id INT,
  p_received_by UUID,
  p_items JSONB  -- [{ id: number, received_qty: number, discrepancy_note?: string }]
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
BEGIN
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
        WHEN v_all_received AND NOT v_has_discrepancy THEN 'received'
        ELSE 'partially_received'
      END,
      received_at = COALESCE(v_transfer.received_at, NOW()),
      received_by = COALESCE(v_transfer.received_by, p_received_by)
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id, 'has_discrepancy', v_has_discrepancy);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- NOTIFICATION SYSTEM — Triggers & RPCs
-- ============================================================

-- --- TRIGGER FUNCTIONS ---

-- 1. Garment location change → notify destination department
CREATE OR REPLACE FUNCTION notify_garment_location_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location = 'transit_to_workshop' AND (OLD.location IS NULL OR OLD.location != 'transit_to_workshop') THEN
    INSERT INTO notifications (department, type, title, body, metadata, expires_at)
    VALUES (
      'workshop',
      'garment_dispatched_to_workshop',
      'Garments dispatched to workshop',
      format('Garment %s (Order #%s) dispatched to workshop', NEW.garment_id, NEW.order_id),
      jsonb_build_object('order_id', NEW.order_id, 'garment_id', NEW.id, 'garment_display_id', NEW.garment_id),
      NOW() + INTERVAL '7 days'
    );
  END IF;

  IF NEW.location = 'transit_to_shop' AND (OLD.location IS NULL OR OLD.location != 'transit_to_shop') THEN
    INSERT INTO notifications (department, type, title, body, metadata, expires_at)
    VALUES (
      'shop',
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
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "dispatch_log_insert" ON dispatch_log;
CREATE POLICY "dispatch_log_insert" ON dispatch_log
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

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
            wo.invoice_number,
            wo.delivery_date,
            wo.home_delivery,
            wo.advance,
            wo.fabric_charge,
            wo.stitching_charge,
            wo.style_charge,
            wo.order_phase::text AS order_phase,
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
        INNER JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        CROSS JOIN LATERAL (
            SELECT
                CASE
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
                        g2.piece_stage::text <> 'completed' AS not_completed,
                        g2.location::text = 'shop'
                            AND g2.piece_stage::text <> 'completed'
                            AND COALESCE(g2.trip_number, 0) > 0 AS shop_active,
                        g2.garment_type::text AS garment_type,
                        g2.piece_stage::text AS piece_stage,
                        g2.location::text AS location,
                        g2.acceptance_status,
                        g2.feedback_status,
                        (g2.garment_type::text = 'final' AND COALESCE(g2.trip_number, 1) >= 2)
                            OR (g2.garment_type::text = 'brova' AND COALESCE(g2.trip_number, 1) >= 4) AS is_alteration,
                        (
                            g2.acceptance_status = TRUE
                            OR (
                                g2.garment_type::text = 'final'
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
          AND o.order_type::text = 'WORK'
          AND wo.order_phase::text = 'in_progress'
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
    COUNT(*) FILTER (WHERE g.location::text IN ('transit_to_shop','transit_to_workshop')) AS transit_count
FROM garments g
GROUP BY g.order_id;

-- Status-label CASE matching getOrderStatusLabel(). Returns the label text.
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
    p_brovas_at_workshop BOOLEAN
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
            wo.invoice_number,
            wo.delivery_date,
            wo.home_delivery,
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
            -- Days to delivery (integer). NULL when no delivery_date.
            CASE WHEN wo.delivery_date IS NULL THEN NULL
                 ELSE CEIL(EXTRACT(EPOCH FROM (wo.delivery_date - NOW())) / 86400.0)::INT
            END AS days_to_delivery
        FROM orders o
        INNER JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN assigned_order_agg agg ON agg.order_id = o.id
        WHERE o.checkout_status::text = 'confirmed'
          AND wo.order_phase::text = 'in_progress'
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
            INNER JOIN work_orders wo2 ON wo2.order_id = o2.id AND wo2.order_phase::text = 'in_progress'
            LEFT JOIN customers cc ON cc.id = o2.customer_id
            LEFT JOIN styles st ON st.id = g.style_id
            WHERE g.location::text = 'workshop'
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
            wo.invoice_number,
            wo.delivery_date,
            wo.home_delivery,
            c.name                           AS customer_name,
            c.phone                          AS customer_phone,
            c.country_code                   AS customer_country_code,
            agg.garments_count,
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
            CASE WHEN wo.delivery_date IS NULL THEN NULL
                 ELSE CEIL(EXTRACT(EPOCH FROM (wo.delivery_date - NOW())) / 86400.0)::INT
            END AS days_to_delivery
        FROM orders o
        INNER JOIN work_orders wo ON wo.order_id = o.id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN assigned_order_agg agg ON agg.order_id = o.id
        WHERE o.checkout_status::text = 'confirmed'
          AND wo.order_phase::text = 'in_progress'
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
    page_rows AS (
        SELECT
            p.rn,
            jsonb_build_object(
                'order_id',        p.order_id,
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
                    COALESCE(p.brovas_at_workshop, false)
                ),
                'garments', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id',              g.id,
                        'order_id',        g.order_id,
                        'garment_id',      g.garment_id,
                        'garment_type',    g.garment_type,
                        'piece_stage',     g.piece_stage,
                        'location',        g.location,
                        'trip_number',     g.trip_number,
                        'express',         g.express,
                        'soaking',         g.soaking,
                        'acceptance_status', g.acceptance_status,
                        'feedback_status', g.feedback_status,
                        'start_time',      g.start_time,
                        'in_production',   g.in_production,
                        'production_plan', g.production_plan,
                        'worker_history',  g.worker_history,
                        'style_name',      COALESCE(st.name, g.style),
                        'style_image_url', st.image_url
                    ) ORDER BY g.garment_id NULLS LAST)
                    FROM garments g
                    LEFT JOIN styles st ON st.id = g.style_id
                    WHERE g.order_id = p.order_id
                ), '[]'::jsonb)
            ) AS row_json
        FROM page p
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
        'parking',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND NOT in_production),
        'scheduler',     COUNT(*) FILTER (WHERE location::text = 'workshop' AND in_production AND production_plan IS NULL AND piece_stage::text = 'waiting_cut'),
        'soaking',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'soaking'),
        'cutting',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'cutting'),
        'post_cutting',  COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'post_cutting'),
        'sewing',        COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'sewing'),
        'finishing',     COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'finishing'),
        'ironing',       COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'ironing'),
        'quality_check', COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text = 'quality_check'),
        'dispatch',      COUNT(*) FILTER (WHERE location::text = 'workshop' AND piece_stage::text IN ('ready_for_dispatch','brova_trialed'))
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
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_reads_select" ON notification_reads;
CREATE POLICY "notification_reads_select" ON notification_reads
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "notification_reads_insert" ON notification_reads;
CREATE POLICY "notification_reads_insert" ON notification_reads
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── Accessories RLS ────────────────────────────────────────────────────
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accessories_select" ON accessories;
CREATE POLICY "accessories_select" ON accessories
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "accessories_insert" ON accessories;
CREATE POLICY "accessories_insert" ON accessories
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "accessories_update" ON accessories;
CREATE POLICY "accessories_update" ON accessories
    FOR UPDATE USING (auth.uid() IS NOT NULL);
