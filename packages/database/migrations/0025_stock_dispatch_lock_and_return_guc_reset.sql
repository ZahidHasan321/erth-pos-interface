-- 0025_stock_dispatch_lock_and_return_guc_reset
--
-- Two stock-integrity fixes (audit follow-up to the restock invoice-photo work):
--
-- FIX 1 (conservation): dispatch_transfer / direct_send_transfer /
--   direct_send_transfers_batch validated source stock with a plain SELECT
--   (no row lock) before decrementing. Two concurrent dispatches of the same
--   item could both pass the "have >= need" guard and both subtract, driving
--   stock negative (source under-counted, destination over-credited = invented
--   stock). Every other decrement path (complete_work_order, consume_for_order,
--   record_waste, adjust_stock) already uses SELECT ... FOR UPDATE; these now
--   match. The FOR UPDATE row lock serialises concurrent decrements of the same
--   row so the guard can't be bypassed.
--
-- FIX 2 (ledger metadata): record_payment_transaction's fabric-return restock
--   block set movement type/ref/reason but not supplier_id/unit_cost/image_url,
--   so a 'return' ledger row could piggyback stale restock context from an
--   earlier movement in the same transaction. It now resets them (and image_url
--   is also reset in the shelf-refund block) to match the defensive pattern used
--   by restock_item / record_waste.
--
-- Body-only changes (no signature change) → CREATE OR REPLACE, idempotent.
-- Functions are copied verbatim from packages/database/src/triggers.sql (the
-- source of truth, deployed via `pnpm db:triggers`); this migration lets the
-- same fix be applied incrementally without re-running the whole trigger file.

-- ── record_payment_transaction (FIX 2) ─────────────────────────────────
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

-- ── dispatch_transfer (FIX 1) ──────────────────────────────────────────
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

-- ── direct_send_transfer (FIX 1) ───────────────────────────────────────
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

-- ── direct_send_transfers_batch (FIX 1) ────────────────────────────────
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
