-- 0. Cleanup old trigger and function
DROP TRIGGER IF EXISTS trigger_assign_invoice ON orders;
DROP FUNCTION IF EXISTS assign_invoice_number();

-- 1. Create a sequence for Invoices starting at 1
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;
-- Sync sequence with the current maximum invoice number in the orders table
SELECT setval('invoice_seq', COALESCE((SELECT MAX(invoice_number) FROM orders), 0) + 1, false);

-- 2. Transactional RPC for completing work order
CREATE OR REPLACE FUNCTION complete_work_order(
  p_order_id INT,
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker, discountType, discountValue, referralCode, discountPercentage }
  p_shelf_items JSONB,      -- [{ id: number, quantity: number, unitPrice: number }]
  p_fabric_items JSONB      -- [{ id: number, length: number }]
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_order_row orders%ROWTYPE;
BEGIN
  -- 1. Update Order
  UPDATE orders
  SET
    invoice_number = CASE WHEN invoice_number IS NULL THEN nextval('invoice_seq') ELSE invoice_number END,
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
    order_date = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order_row;

  -- 2. Deduct Shelf Stock & Record Items
  DELETE FROM order_shelf_items WHERE order_id = p_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shelf_items)
  LOOP
    UPDATE shelf 
    SET stock = stock - (v_item->>'quantity')::int
    WHERE id = (v_item->>'id')::int;

    INSERT INTO order_shelf_items (order_id, shelf_id, quantity, unit_price)
    VALUES (
      p_order_id,
      (v_item->>'id')::int,
      (v_item->>'quantity')::int,
      (v_item->>'unitPrice')::decimal
    );
  END LOOP;

  -- 3. Deduct Fabric Stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_fabric_items)
  LOOP
    UPDATE fabrics 
    SET real_stock = real_stock - (v_item->>'length')::decimal
    WHERE id = (v_item->>'id')::int;
  END LOOP;

  RETURN to_jsonb(v_order_row);
END;
$$ LANGUAGE plpgsql;

-- 3. Transactional RPC for completing sales order (Shelf items only)
CREATE OR REPLACE FUNCTION complete_sales_order(
  p_order_id INT,
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker, discountType, discountValue, referralCode, discountPercentage }
  p_shelf_items JSONB       -- [{ id: number, quantity: number, unitPrice: number }]
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_order_row orders%ROWTYPE;
BEGIN
  -- 1. Update Order
  UPDATE orders
  SET
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
    order_date = NOW(),
    order_type = 'SALES'
  WHERE id = p_order_id
  RETURNING * INTO v_order_row;

  -- 2. Deduct Shelf Stock & Record Items
  DELETE FROM order_shelf_items WHERE order_id = p_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shelf_items)
  LOOP
    UPDATE shelf 
    SET stock = stock - (v_item->>'quantity')::int
    WHERE id = (v_item->>'id')::int;

    INSERT INTO order_shelf_items (order_id, shelf_id, quantity, unit_price)
    VALUES (
      p_order_id,
      (v_item->>'id')::int,
      (v_item->>'quantity')::int,
      (v_item->>'unitPrice')::decimal
    );
  END LOOP;

  RETURN to_jsonb(v_order_row);
END;
$$ LANGUAGE plpgsql;

-- 4. NEW: Transactional RPC for creating AND completing a sales order in one go
CREATE OR REPLACE FUNCTION create_complete_sales_order(
  p_customer_id INT,
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker, discountType, discountValue, referralCode, discountPercentage, notes, total, shelfCharge, deliveryCharge, homeDelivery }
  p_shelf_items JSONB       -- [{ id: number, quantity: number, unitPrice: number }]
)
RETURNS JSONB AS $$
DECLARE
  v_item JSONB;
  v_order_id INT;
  v_order_row orders%ROWTYPE;
BEGIN
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
    home_delivery
  ) VALUES (
    p_customer_id,
    'confirmed',
    'SALES',
    NOW(),
    (p_checkout_details->>'paymentType')::payment_type,
    (p_checkout_details->>'paid')::decimal,
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
    COALESCE((p_checkout_details->>'homeDelivery')::boolean, false)
  ) RETURNING id INTO v_order_id;

  -- 2. Deduct Shelf Stock & Record Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shelf_items)
  LOOP
    UPDATE shelf 
    SET stock = stock - (v_item->>'quantity')::int
    WHERE id = (v_item->>'id')::int;

    INSERT INTO order_shelf_items (order_id, shelf_id, quantity, unit_price)
    VALUES (
      v_order_id,
      (v_item->>'id')::int,
      (v_item->>'quantity')::int,
      (v_item->>'unitPrice')::decimal
    );
  END LOOP;

  -- 3. Return the full order row
  SELECT * FROM orders WHERE id = v_order_id INTO v_order_row;
  RETURN to_jsonb(v_order_row);
END;
$$ LANGUAGE plpgsql;

-- 5. Transactional RPC for saving work order garments and updating order totals
CREATE OR REPLACE FUNCTION save_work_order_garments(
  p_order_id INT,
  p_garments JSONB, -- Array of garment objects
  p_order_updates JSONB -- { num_of_fabrics, fabric_charge, stitching_charge, style_charge, stitching_price }
) RETURNS JSONB AS $$
DECLARE
  v_garment JSONB;
BEGIN
  -- 1. Update Order Totals (but not order_total yet)
  UPDATE orders
  SET
    num_of_fabrics = (p_order_updates->>'num_of_fabrics')::INT,
    fabric_charge = (p_order_updates->>'fabric_charge')::DECIMAL,
    stitching_charge = (p_order_updates->>'stitching_charge')::DECIMAL,
    style_charge = (p_order_updates->>'style_charge')::DECIMAL,
    stitching_price = (p_order_updates->>'stitching_price')::DECIMAL
  WHERE id = p_order_id;

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
      express, brova, delivery_date, piece_stage, style, shop_name, home_delivery, color
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
      COALESCE((v_garment->>'express')::BOOLEAN, false),
      COALESCE((v_garment->>'brova')::BOOLEAN, false),
      (v_garment->>'delivery_date')::TIMESTAMP,
      COALESCE((v_garment->>'piece_stage')::production_stage, 'order_at_shop'),
      COALESCE(v_garment->>'style', 'kuwaiti'),
      v_garment->>'shop_name',
      COALESCE((v_garment->>'home_delivery')::BOOLEAN, false),
      v_garment->>'color'
    );
  END LOOP;

  RETURN jsonb_build_object('status', 'success');
END;
$$ LANGUAGE plpgsql;

-- 5. Cleanup defaults that shouldn't be there
ALTER TABLE orders ALTER COLUMN paid DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN paid SET DEFAULT NULL;
