-- 0030_block_fabric_shelf_workshop
--
-- Defense-in-depth for SPEC §4: fabric and shelf live ONLY in shop stock — the
-- workshop never holds them; only accessories cross between shop and workshop.
-- The UI was the only thing enforcing this; the stock/transfer RPCs themselves
-- had no guard, so a crafted/direct call (or a future UI regression) could still
-- write fabric/shelf workshop_stock. This adds RAISE EXCEPTION guards:
--   * restock_item / adjust_stock / record_waste — reject fabric/shelf at a
--     non-shop location.
--   * create_transfer_requests_batch / direct_send_transfers_batch — reject any
--     transfer group whose item_type is not 'accessory' (this also makes the
--     dispatch/receive paths unreachable for fabric/shelf, since no such
--     transfer row can be created).
-- The vestigial fabrics.workshop_stock / shelf.workshop_stock columns are left
-- in place (a separate decision). Idempotent: CREATE OR REPLACE, no data change.

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

  -- Don't let the invoice photo leak onto a later movement in this transaction.
  PERFORM set_config('app.movement_image_url', '', true);

  v_result := jsonb_build_object('success', true, 'new_stock', v_new_qty);
  PERFORM idem_store(p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;


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
