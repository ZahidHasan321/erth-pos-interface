-- 0029_invoice_revision_content_changes.sql
--
-- Invoice revision = signed-invoice CONTENT changes, not only price (SPEC §3).
-- Before (0028): a revision was minted only when order_total moved (refund, or a
-- brova-trial style reprice that changed price). That missed two cases where the
-- printed invoice content changes without the total moving:
--   1. A brova-trial STYLE change at unchanged price (flat qallabi/designer
--      swaps, net-zero style edits) — "revised invoice but no delta in price".
--   2. A DELIVERY-TYPE change (home <-> pickup) on a confirmed order.
-- After: toggle_home_delivery bumps the revision when home_delivery actually
-- changes (the IS DISTINCT FROM guard is also its idempotency mechanism — a
-- re-toggle to the same value is a no-op); a new bump_invoice_revision RPC mints
-- a revision for a style change the reprice found no price delta for (idempotent
-- on its key — it is an additive counter with no self-guard). A standalone
-- delivery-CHARGE edit (update_delivery_charge) does not bump. Plain payments and
-- measurement-only corrections still never bump.
--
-- Bodies are copied verbatim from packages/database/src/triggers.sql (source of
-- truth). CREATE OR REPLACE preserves the existing PUBLIC EXECUTE default.

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
