-- 0028_invoice_revision_price_changes_only.sql
--
-- Invoice revision = price changes only (SPEC §3).
-- Before: record_payment_transaction bumped work_orders.invoice_revision on
-- EVERY payment AND refund, so the first payment turned the original invoice
-- into "-R1", while reprice_order_styles (the real price change) never bumped.
-- After: plain payments do NOT bump; a refund bumps; a brova-trial style
-- reprice bumps only when order_total actually moves. Revision 0 = original.
-- Idempotent on replay (idem short-circuits before the bump in both RPCs).
--
-- CREATE OR REPLACE preserves existing GRANTs. Bodies are copied verbatim
-- from packages/database/src/triggers.sql (the source of truth).

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

