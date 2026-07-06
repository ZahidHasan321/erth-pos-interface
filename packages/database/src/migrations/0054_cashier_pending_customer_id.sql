-- Migration 0054: expose the order's own customer_id from get_cashier_pending_orders.
--
-- The cashier Pending queue's family-link nudge (SPEC §3) groups co-pending
-- orders by customer family (a Primary + its Secondaries). A Secondary row
-- already carries primary_customer_id, but a Primary's own order needs its own
-- customer_id to be the family key. Add customer_id to both branches of the RPC.
--
-- Idempotent: CREATE OR REPLACE, additive column, safe to re-run.

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
      o.order_type::text AS order_type,
      o.customer_id,
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

    UNION ALL

    -- §3 ALTERATION orders share the Pending queue. No work_orders row: invoice
    -- lives on alteration_orders, there is no advance/linking, and the delivery
    -- date is per-garment (surfaced as the earliest garment date).
    SELECT
      o.id AS order_id,
      o.order_type::text AS order_type,
      o.customer_id,
      a.invoice_number,
      c.name AS customer_name,
      c.phone AS customer_phone,
      o.order_date,
      (SELECT MIN(g.delivery_date) FROM garments g WHERE g.order_id = o.id) AS delivery_date,
      COALESCE(o.order_total, a.alteration_total, 0) AS order_total,
      COALESCE(o.paid, 0) AS paid,
      0 AS advance,
      NULL::int AS linked_order_id,
      c.account_type,
      c.relation,
      c.primary_customer_id,
      pc.name AS primary_customer_name,
      (SELECT COUNT(*) FROM garments g WHERE g.order_id = o.id) AS garment_count
    FROM orders o
    JOIN alteration_orders a ON a.order_id = o.id
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN customers pc ON pc.id = c.primary_customer_id
    WHERE o.order_type = 'ALTERATION'
      AND o.checkout_status = 'confirmed'
      AND a.cashier_processed_at IS NULL
      AND (p_brand IS NULL OR lower(o.brand::text) = lower(p_brand))

    ORDER BY order_date DESC
    LIMIT p_limit
  ) t;
  RETURN v_rows;
END;
$$ LANGUAGE plpgsql;
