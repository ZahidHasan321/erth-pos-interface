-- 0. Cleanup old trigger and function
DROP TRIGGER IF EXISTS trigger_assign_invoice ON orders;
DROP FUNCTION IF EXISTS assign_invoice_number();

-- 1. Create a sequence for Invoices starting at 1000
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1000;

-- 2. Transactional RPC for completing work order
CREATE OR REPLACE FUNCTION complete_work_order(
  p_order_id INT,
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker }
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
    order_taker_id = (p_checkout_details->>'orderTaker')::uuid,
    order_date = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order_row;

  -- 2. Deduct Shelf Stock & Record Items
  -- Clear any existing items for this order to prevent duplicates if re-called
  DELETE FROM order_shelf_items WHERE order_id = p_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_shelf_items)
  LOOP
    -- Update stock in shelf table
    UPDATE shelf 
    SET stock = stock - (v_item->>'quantity')::int
    WHERE id = (v_item->>'id')::int;

    -- Record the item in the junction table
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
  p_checkout_details JSONB, -- { paymentType, paid, paymentRefNo, orderTaker }
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
    order_taker_id = (p_checkout_details->>'orderTaker')::uuid,
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