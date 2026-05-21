-- 0019_restock_ref_fix
--
-- restock_item stamped app.movement_ref_type='restock' while ref_id was empty,
-- so every restock ledger row carried an orphan ref_type with a NULL ref_id.
-- There is no restock/PO entity to point at — attribution for a restock is the
-- supplier_id + reason. Leave ref_type/ref_id both empty so the pair stays
-- consistent. Idempotent (CREATE OR REPLACE, no data mutation).

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
